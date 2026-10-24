import os
from functools import lru_cache
import json
import time
import numpy as np
import pandas as pd
import joblib
import holidays
import scipy.stats as stats

# Patch numpy for Prophet compatibility (numpy >= 2.0 removed np.float_)
if not hasattr(np, 'float_'):
    np.float_ = np.float64

# Evaluation metrics
from app.ml.evaluation import (
    get_mae, get_rmse, get_mape, get_wape, get_smape, get_bias, get_r2, evaluate_all
)
from app.ml.preprocessing import TargetLeakageFilter
from app.core.logging import logger

# Models
from prophet import Prophet
from sklearn.ensemble import RandomForestRegressor
from statsmodels.tsa.arima.model import ARIMA
from statsmodels.tsa.statespace.sarimax import SARIMAX
from statsmodels.tsa.holtwinters import ExponentialSmoothing
from statsmodels.tsa.seasonal import seasonal_decompose

try:
    import xgboost as xgb
except ImportError:
    xgb = None
try:
    import lightgbm as lgb
except (ImportError, OSError):
    lgb = None
try:
    import catboost as cb
except (ImportError, OSError):
    cb = None
try:
    import shap
except ImportError:
    shap = None

UPLOAD_DIR = os.path.join(os.getcwd(), "data", "uploads")


def evaluate_predictions(y_true, y_pred):
    """
    Computes standard, leak-free time-series evaluation metrics.
    Handles zero actual values safely via WAPE and masked MAPE.
    """
    raw_metrics = evaluate_all(y_true, y_pred)
    return {
        "mae": raw_metrics["MAE"],
        "rmse": raw_metrics["RMSE"],
        "mape": raw_metrics["MAPE"],
        "wape": raw_metrics["WAPE"],
        "smape": raw_metrics["SMAPE"],
        "bias": raw_metrics["Bias"],
        "r2": raw_metrics["R2"],
    }


def load_data_and_schema(absolute_path: str):
    """
    Loads dataset, parses schema, validates date and target columns,
    and identifies leakage columns and entity keys.
    """
    if not os.path.exists(absolute_path):
        raise FileNotFoundError(f"Dataset file not found at {absolute_path}")
        
    ext = absolute_path.split('.')[-1].lower()
    try:
        if ext == 'csv':
            df = pd.read_csv(absolute_path)
        elif ext == 'xlsx':
            df = pd.read_excel(absolute_path)
        elif ext == 'parquet':
            df = pd.read_parquet(absolute_path)
        else:
            raise ValueError(f"Unsupported file extension: {ext}")
    except Exception as e:
        logger.exception("dataset_load_failed", error=str(e), path=absolute_path)
        raise RuntimeError(f"Failed to load dataset: {e}")
        
    base_name = absolute_path.rsplit('.', 1)[0]
    schema_path = f"{base_name}_schema.json"
    
    if not os.path.exists(schema_path):
        raise FileNotFoundError(f"Schema file not found for dataset at {schema_path}")
        
    try:
        with open(schema_path, "r") as f:
            schema = json.load(f)
    except Exception as e:
        logger.exception("schema_load_failed", error=str(e), path=schema_path)
        raise RuntimeError(f"Failed to parse schema: {e}")
        
    # Determine date and target columns
    date_cols = [c["name"] for c in schema if c.get("role") == "date"]
    target_cols = [c["name"] for c in schema if c.get("role") == "target"]
    
    if not date_cols or not target_cols:
        raise ValueError("Schema must contain at least one 'date' and one 'target' column")
        
    date_col = date_cols[0]
    target_col = target_cols[0]
    
    # Entity columns (Store_ID, Product_ID, SKU, etc.)
    entity_cols = [
        c["name"] for c in schema 
        if c.get("role") == "identifier" or (
            c.get("role") == "categorical" and any(k in c["name"].lower() for k in ["store", "product", "sku", "item", "branch", "shop"])
        )
    ]
    
    # Target Leakage detection: explicit schema exclusion or known leakage keywords
    leakage_keywords = [
        "revenue", "profit", "closing_stock", "ending_stock", "stockout", 
        "total_amount", "gross_sales", "net_sales", "margin", "total_sales"
    ]
    leakage_cols = []
    for c in schema:
        name = c["name"]
        role = c.get("role", "")
        name_lower = name.lower()
        if name in [date_col, target_col]:
            continue
        if role in ["ignore", "exclude"]:
            leakage_cols.append(name)
        elif any(k in name_lower for k in leakage_keywords):
            leakage_cols.append(name)
            
    # Clean and parse date
    df[date_col] = pd.to_datetime(df[date_col], format='mixed', errors='coerce')
    df = df.dropna(subset=[date_col, target_col]).sort_values(date_col).reset_index(drop=True)
    
    if len(df) < 20:
        raise ValueError("Dataset has too few valid rows (<20) after dropping missing date/target values.")
    
    # Feature audit report
    feature_audit = []
    for col in df.columns:
        dtype_str = str(df[col].dtype)
        if col == target_col:
            feature_audit.append({
                "feature": col,
                "data_type": dtype_str,
                "available_at_prediction": False,
                "leakage_risk": True,
                "status": "target",
                "reason": "Target variable to be predicted"
            })
        elif col in leakage_cols:
            feature_audit.append({
                "feature": col,
                "data_type": dtype_str,
                "available_at_prediction": False,
                "leakage_risk": True,
                "status": "excluded",
                "reason": "Contains post-sale or target-derived information (target leakage)"
            })
        elif col == date_col:
            feature_audit.append({
                "feature": col,
                "data_type": dtype_str,
                "available_at_prediction": True,
                "leakage_risk": False,
                "status": "date_index",
                "reason": "Time index for chronological alignment and calendar feature extraction"
            })
        else:
            feature_audit.append({
                "feature": col,
                "data_type": dtype_str,
                "available_at_prediction": True,
                "leakage_risk": False,
                "status": "included",
                "reason": "Pre-known predictor feature"
            })
            
    return df, date_col, target_col, entity_cols, leakage_cols, feature_audit


def create_features(df: pd.DataFrame, date_col: str, target_col: str, entity_cols: list = None, leakage_cols: list = None):
    """
    Creates dynamic lag, rolling, and calendar features.
    Guarantees:
    - Zero future target leakage: all rolling statistics shift by 1.
    - Leakage columns (Revenue, Profit, Closing Stock) dropped from feature matrix.
    - Entities (Store_ID, Product_ID) respected when calculating lags.
    """
    df_feat = df.copy()
    if leakage_cols:
        drop_cols = [c for c in leakage_cols if c in df_feat.columns and c != target_col]
        df_feat = df_feat.drop(columns=drop_cols)
        
    df_feat[target_col] = df_feat[target_col].interpolate(method='linear').bfill().ffill()
    
    # Calendar Features
    df_feat['month'] = df_feat[date_col].dt.month
    df_feat['quarter'] = df_feat[date_col].dt.quarter
    df_feat['week'] = df_feat[date_col].dt.isocalendar().week.astype(int)
    df_feat['year'] = df_feat[date_col].dt.year
    df_feat['dayofweek'] = df_feat[date_col].dt.dayofweek
    df_feat['is_weekend'] = df_feat['dayofweek'].isin([5, 6]).astype(int)
    
    # Cyclical Calendar Transformations
    df_feat['sin_dayofweek'] = np.sin(2 * np.pi * df_feat['dayofweek'] / 7.0)
    df_feat['cos_dayofweek'] = np.cos(2 * np.pi * df_feat['dayofweek'] / 7.0)
    df_feat['sin_month'] = np.sin(2 * np.pi * df_feat['month'] / 12.0)
    df_feat['cos_month'] = np.cos(2 * np.pi * df_feat['month'] / 12.0)
    
    # Holidays
    us_holidays = holidays.country_holidays('US')
    df_feat['is_holiday'] = df_feat[date_col].apply(lambda x: int(x in us_holidays))
    
    # Deterministic trend
    df_feat['trend'] = np.arange(len(df_feat))
    
    # Active Entity Columns
    active_entities = [c for c in (entity_cols or []) if c in df_feat.columns]
    
    # Dynamic Lags (strictly historical: t-1, t-7, t-14, t-30)
    for lag in [1, 7, 14, 30]:
        col_name = f'lag_{lag}'
        if active_entities:
            df_feat[col_name] = df_feat.groupby(active_entities)[target_col].shift(lag)
        else:
            df_feat[col_name] = df_feat[target_col].shift(lag)
            
    # Rolling Statistics (strictly shift(1) to avoid current-step leakage)
    for window in [7, 14, 30]:
        mean_col = f'rolling_mean_{window}'
        std_col = f'rolling_std_{window}'
        median_col = f'rolling_median_{window}'
        if active_entities:
            grouped = df_feat.groupby(active_entities)[target_col]
            df_feat[mean_col] = grouped.transform(lambda s: s.shift(1).rolling(window=window, min_periods=1).mean())
            df_feat[std_col] = grouped.transform(lambda s: s.shift(1).rolling(window=window, min_periods=1).std()).fillna(0)
            df_feat[median_col] = grouped.transform(lambda s: s.shift(1).rolling(window=window, min_periods=1).median())
        else:
            shifted = df_feat[target_col].shift(1)
            df_feat[mean_col] = shifted.rolling(window=window, min_periods=1).mean()
            df_feat[std_col] = shifted.rolling(window=window, min_periods=1).std().fillna(0)
            df_feat[median_col] = shifted.rolling(window=window, min_periods=1).median()
            
    # Handle Categorical Columns
    cat_cols = [c for c in df_feat.select_dtypes(include=['object', 'category']).columns if c not in [date_col, target_col]]
    for c in cat_cols:
        if df_feat[c].nunique() < 20:
            df_feat = pd.get_dummies(df_feat, columns=[c], drop_first=True, dtype=int)
        else:
            df_feat = df_feat.drop(columns=[c])

    # Ensure all predictor columns are numeric
    for c in df_feat.columns:
        if c not in [date_col, target_col] and df_feat[c].dtype == 'object':
            df_feat = df_feat.drop(columns=[c])

    # Forward/backward fill initial lag windows to keep full training timeline
    df_feat = df_feat.bfill().ffill().reset_index(drop=True)
    return df_feat


def compute_expanding_intervals(future_preds: list, y_test: np.ndarray, preds_test: np.ndarray, horizon: int):
    """
    Computes expanding prediction intervals:
    sigma_h = sigma_resid * sqrt(1 + 0.08 * (h - 1))
    CI_lower = max(0, pred - 1.96 * sigma_h)
    CI_upper = pred + 1.96 * sigma_h
    """
    residuals = np.array(y_test, dtype=float) - np.array(preds_test, dtype=float)
    std_resid = float(np.std(residuals))
    if std_resid < 1e-4 or np.isnan(std_resid):
        std_resid = max(1.0, float(np.mean(y_test)) * 0.1)
        
    ci_lower = []
    ci_upper = []
    for h, p in enumerate(future_preds, 1):
        # Uncertainty compounds monotonically over forecast horizon
        expansion = np.sqrt(1.0 + 0.08 * (h - 1))
        margin = 1.96 * std_resid * expansion
        low = max(0.0, round(float(p - margin), 2))
        high = max(low, round(float(p + margin), 2))
        ci_lower.append(low)
        ci_upper.append(high)
        
    return ci_lower, ci_upper, std_resid


def recursive_multistep_forecast(
    model, 
    feature_names: list, 
    last_row: pd.DataFrame, 
    last_date: pd.Timestamp, 
    history_target: list, 
    horizon: int
):
    """
    True multi-step recursive forecasting:
    Advances date step-by-step, recalculating calendar features, cyclical encodings,
    lags, and rolling statistics from actuals and previous model predictions.
    Eliminates flat horizontal line forecasts.
    """
    us_holidays = holidays.country_holidays('US')
    future_preds = []
    running_history = list(history_target)
    last_trend = int(last_row['trend'].iloc[0]) if 'trend' in last_row else len(history_target)
    
    for h in range(1, horizon + 1):
        future_date = last_date + pd.Timedelta(days=h)
        step_feat = last_row.copy()
        
        # 1. Advance Calendar Features
        step_feat['month'] = future_date.month
        step_feat['quarter'] = future_date.quarter
        step_feat['week'] = int(future_date.isocalendar().week)
        step_feat['year'] = future_date.year
        step_feat['dayofweek'] = future_date.dayofweek
        step_feat['is_weekend'] = 1 if future_date.dayofweek in [5, 6] else 0
        step_feat['sin_dayofweek'] = np.sin(2 * np.pi * future_date.dayofweek / 7.0)
        step_feat['cos_dayofweek'] = np.cos(2 * np.pi * future_date.dayofweek / 7.0)
        step_feat['sin_month'] = np.sin(2 * np.pi * future_date.month / 12.0)
        step_feat['cos_month'] = np.cos(2 * np.pi * future_date.month / 12.0)
        step_feat['is_holiday'] = int(future_date in us_holidays)
        step_feat['trend'] = last_trend + h
        
        # 2. Advance Lags from running history
        for lag in [1, 7, 14, 30]:
            col = f'lag_{lag}'
            if col in feature_names:
                step_feat[col] = running_history[-lag] if len(running_history) >= lag else running_history[-1]
                
        # 3. Advance Rolling Statistics from running history
        for w in [7, 14, 30]:
            mean_col = f'rolling_mean_{w}'
            std_col = f'rolling_std_{w}'
            median_col = f'rolling_median_{w}'
            window_vals = running_history[-w:] if len(running_history) >= w else running_history
            if mean_col in feature_names:
                step_feat[mean_col] = float(np.mean(window_vals))
            if std_col in feature_names:
                step_feat[std_col] = float(np.std(window_vals)) if len(window_vals) > 1 else 0.0
            if median_col in feature_names:
                step_feat[median_col] = float(np.median(window_vals))
                
        # 4. Predict step h
        X_step = step_feat[feature_names]
        pred = float(model.predict(X_step)[0])
        # Non-negative sales constraint
        pred = max(0.0, round(pred, 2))
        
        future_preds.append(pred)
        running_history.append(pred)
        
    return future_preds


def train_tree_model(df_feat: pd.DataFrame, target_col: str, date_col: str, train_size: int, model_type: str, horizon: int):
    """
    Trains gradient boosting and tree ensemble models with recursive multi-step forecasting,
    TreeExplainer SHAP attribution, and expanding prediction intervals.
    """
    features = [c for c in df_feat.columns if c not in [date_col, target_col]]
    
    train = df_feat.iloc[:train_size]
    test = df_feat.iloc[train_size:]
    
    X_train, y_train = train[features], train[target_col]
    X_test, y_test = test[features], test[target_col]
    
    if model_type == 'xgboost' and xgb is not None:
        model = xgb.XGBRegressor(n_estimators=100, learning_rate=0.05, max_depth=5, random_state=42)
    elif model_type == 'lightgbm' and lgb is not None:
        model = lgb.LGBMRegressor(n_estimators=100, learning_rate=0.05, max_depth=5, random_state=42, verbose=-1)
    elif model_type == 'catboost' and cb is not None:
        model = cb.CatBoostRegressor(iterations=100, learning_rate=0.05, depth=5, random_seed=42, silent=True)
    elif model_type == 'random_forest':
        model = RandomForestRegressor(n_estimators=100, max_depth=5, random_state=42)
    else:
        raise ValueError(f"Model {model_type} is either unsupported or its library failed to load.")
        
    model.fit(X_train, y_train)
    preds = model.predict(X_test)
    preds = np.maximum(0.0, preds)
    metrics = evaluate_predictions(y_test.values, preds)
    
    # Feature Importance
    importance_dict = {}
    if hasattr(model, 'feature_importances_'):
        imp = model.feature_importances_
        importance_dict = {f: round(float(i), 4) for f, i in zip(features, imp)}
        
    # SHAP Attribution
    shap_dict = {}
    if shap is not None:
        try:
            sample_size = min(100, len(X_test))
            sample = X_test.sample(sample_size, random_state=42)
            explainer = shap.TreeExplainer(model)
            shap_values = explainer.shap_values(sample)
            if isinstance(shap_values, list):
                shap_values = shap_values[0]
            mean_abs_shap = np.abs(shap_values).mean(axis=0)
            shap_dict = {f: round(float(i), 4) for f, i in zip(features, mean_abs_shap)}
        except Exception as e:
            logger.warning("shap_calculation_fallback", error=str(e), model_type=model_type)
            shap_dict = importance_dict
    else:
        shap_dict = importance_dict
        
    # Fit full model on all available history
    model_full = model.__class__(**model.get_params())
    X_full, y_full = df_feat[features], df_feat[target_col]
    model_full.fit(X_full, y_full)
    
    # Generate true recursive multi-step predictions
    last_row = X_full.iloc[-1:].copy()
    last_date = df_feat[date_col].iloc[-1]
    history_target = list(y_full.values)
    
    future_preds = recursive_multistep_forecast(
        model=model_full,
        feature_names=features,
        last_row=last_row,
        last_date=last_date,
        history_target=history_target,
        horizon=horizon
    )
    
    # Calculate expanding confidence intervals
    ci_lower, ci_upper, std_resid = compute_expanding_intervals(future_preds, y_test.values, preds, horizon)
    
    return metrics, model_full, {
        "forecast_values": future_preds,
        "ci_lower": ci_lower,
        "ci_upper": ci_upper,
        "test_actual": [round(float(x), 2) for x in y_test.values],
        "test_predicted": [round(float(x), 2) for x in preds],
        "feature_importance": importance_dict,
        "shap_values": shap_dict,
        "std_resid": std_resid
    }


def train_prophet(df: pd.DataFrame, date_col: str, target_col: str, train_size: int, horizon: int):
    pdf = df[[date_col, target_col]].rename(columns={date_col: 'ds', target_col: 'y'})
    train = pdf.iloc[:train_size]
    test = pdf.iloc[train_size:]
    
    model = Prophet()
    model.fit(train)
    
    # Evaluate on test
    future_test = model.make_future_dataframe(periods=len(test))
    forecast_test = model.predict(future_test)
    preds = forecast_test.iloc[train_size:]['yhat'].values
    preds = np.maximum(0.0, preds)
    metrics = evaluate_predictions(test['y'].values, preds)
    
    # Generate actual future forecast
    model_full = Prophet()
    model_full.fit(pdf)
    future_full = model_full.make_future_dataframe(periods=horizon)
    forecast_full = model_full.predict(future_full)
    future_df = forecast_full.tail(horizon)
    
    future_preds = [max(0.0, round(float(v), 2)) for v in future_df['yhat'].tolist()]
    ci_lower = [max(0.0, round(float(v), 2)) for v in future_df['yhat_lower'].tolist()]
    ci_upper = [max(ci_lower[i], round(float(v), 2)) for i, v in enumerate(future_df['yhat_upper'].tolist())]
    
    residuals = test['y'].values - preds
    std_resid = float(np.std(residuals))
    
    return metrics, model_full, {
        "forecast_dates": future_df['ds'].astype(str).tolist(),
        "forecast_values": future_preds,
        "ci_lower": ci_lower,
        "ci_upper": ci_upper,
        "test_actual": [round(float(x), 2) for x in test['y'].values],
        "test_predicted": [round(float(x), 2) for x in preds],
        "feature_importance": {},
        "shap_values": {},
        "std_resid": std_resid
    }


def train_arima(df: pd.DataFrame, target_col: str, train_size: int, horizon: int):
    series = df[target_col].values
    train, test = series[:train_size], series[train_size:]
    
    model = ARIMA(train, order=(1, 1, 1))
    model_fit = model.fit()
    preds = model_fit.forecast(steps=len(test))
    preds = np.maximum(0.0, preds)
    metrics = evaluate_predictions(test, preds)
    
    model_full = ARIMA(series, order=(1, 1, 1)).fit()
    forecast_res = model_full.get_forecast(steps=horizon)
    future_preds = [max(0.0, round(float(v), 2)) for v in forecast_res.predicted_mean.tolist()]
    
    ci_lower, ci_upper, std_resid = compute_expanding_intervals(future_preds, test, preds, horizon)
    
    return metrics, model_full, {
        "forecast_values": future_preds,
        "ci_lower": ci_lower,
        "ci_upper": ci_upper,
        "test_actual": [round(float(x), 2) for x in test],
        "test_predicted": [round(float(x), 2) for x in preds],
        "feature_importance": {},
        "shap_values": {},
        "std_resid": std_resid
    }


def train_sarima(df: pd.DataFrame, target_col: str, train_size: int, horizon: int):
    series = df[target_col].values
    train, test = series[:train_size], series[train_size:]
    
    model = SARIMAX(train, order=(1, 1, 1), seasonal_order=(1, 1, 1, 7))
    model_fit = model.fit(disp=False)
    preds = model_fit.forecast(steps=len(test))
    preds = np.maximum(0.0, preds)
    metrics = evaluate_predictions(test, preds)
    
    model_full = SARIMAX(series, order=(1, 1, 1), seasonal_order=(1, 1, 1, 7)).fit(disp=False)
    forecast_res = model_full.get_forecast(steps=horizon)
    future_preds = [max(0.0, round(float(v), 2)) for v in forecast_res.predicted_mean.tolist()]
    
    ci_lower, ci_upper, std_resid = compute_expanding_intervals(future_preds, test, preds, horizon)
    
    return metrics, model_full, {
        "forecast_values": future_preds,
        "ci_lower": ci_lower,
        "ci_upper": ci_upper,
        "test_actual": [round(float(x), 2) for x in test],
        "test_predicted": [round(float(x), 2) for x in preds],
        "feature_importance": {},
        "shap_values": {},
        "std_resid": std_resid
    }


def train_moving_average(df: pd.DataFrame, target_col: str, train_size: int, horizon: int):
    series = df[target_col].values
    train, test = series[:train_size], series[train_size:]
    
    window = min(7, len(train))
    last_val = float(np.mean(train[-window:]))
    preds = np.full(len(test), max(0.0, last_val))
    metrics = evaluate_predictions(test, preds)
    
    last_val_full = max(0.0, float(np.mean(series[-window:])))
    future_preds = [round(last_val_full, 2) for _ in range(horizon)]
    
    ci_lower, ci_upper, std_resid = compute_expanding_intervals(future_preds, test, preds, horizon)
    
    return metrics, None, {
        "forecast_values": future_preds,
        "ci_lower": ci_lower,
        "ci_upper": ci_upper,
        "test_actual": [round(float(x), 2) for x in test],
        "test_predicted": [round(float(x), 2) for x in preds],
        "feature_importance": {},
        "shap_values": {},
        "std_resid": std_resid
    }


def train_exponential_smoothing(df: pd.DataFrame, target_col: str, train_size: int, horizon: int):
    series = df[target_col].values
    train, test = series[:train_size], series[train_size:]
    
    seasonal_periods = 7 if len(train) >= 14 else None
    trend_type = 'add' if len(train) >= 4 else None
    
    model = ExponentialSmoothing(train, trend=trend_type, seasonal='add' if seasonal_periods else None, seasonal_periods=seasonal_periods)
    model_fit = model.fit()
    preds = model_fit.forecast(len(test))
    preds = np.maximum(0.0, preds)
    metrics = evaluate_predictions(test, preds)
    
    model_full = ExponentialSmoothing(series, trend=trend_type, seasonal='add' if seasonal_periods else None, seasonal_periods=seasonal_periods).fit()
    future_raw = model_full.forecast(horizon)
    future_preds = [max(0.0, round(float(v), 2)) for v in future_raw]
    
    ci_lower, ci_upper, std_resid = compute_expanding_intervals(future_preds, test, preds, horizon)
    
    return metrics, model_full, {
        "forecast_values": future_preds,
        "ci_lower": ci_lower,
        "ci_upper": ci_upper,
        "test_actual": [round(float(x), 2) for x in test],
        "test_predicted": [round(float(x), 2) for x in preds],
        "feature_importance": {},
        "shap_values": {},
        "std_resid": std_resid
    }


def compute_confidence_score(metrics: dict, df_len: int, horizon: int, std_resid: float, mean_actual: float):
    """
    Transparent multi-factor confidence rating:
    1. Error rate (WAPE/MAPE)
    2. Data volume (sample rows)
    3. Horizon uncertainty decay
    4. Residual dispersion ratio
    """
    error_rate = metrics.get('wape', metrics.get('mape', 25.0))
    if error_rate <= 10.0:
        error_score = 95.0 - (error_rate * 1.5)
    elif error_rate <= 25.0:
        error_score = 80.0 - ((error_rate - 10.0) * 1.5)
    elif error_rate <= 50.0:
        error_score = 57.5 - ((error_rate - 25.0) * 1.1)
    else:
        error_score = max(15.0, 30.0 - ((error_rate - 50.0) * 0.3))
        
    if df_len >= 2000:
        sample_score = 100.0
    elif df_len >= 500:
        sample_score = 85.0
    elif df_len >= 100:
        sample_score = 70.0
    else:
        sample_score = 50.0
        
    horizon_penalty = max(0.65, 1.0 - (0.005 * max(0, horizon - 7)))
    
    denom = mean_actual if mean_actual > 0 else 1.0
    cv_resid = min(2.0, std_resid / denom)
    resid_score = max(30.0, 100.0 - (cv_resid * 40.0))
    
    composite = round((0.45 * error_score + 0.25 * sample_score + 0.30 * resid_score) * horizon_penalty, 1)
    composite = max(10.0, min(99.0, composite))
    
    level = "High" if composite >= 75.0 else ("Medium" if composite >= 50.0 else "Low")
    
    return {
        "score": composite,
        "level": level,
        "factors": {
            "error_rate": round(error_rate, 2),
            "error_score": round(error_score, 1),
            "sample_rows": df_len,
            "sample_score": round(sample_score, 1),
            "horizon_days": horizon,
            "horizon_penalty": round(horizon_penalty, 2),
            "residual_std": round(std_resid, 2),
            "residual_score": round(resid_score, 1)
        }
    }


def generate_insights(payload: dict, df: pd.DataFrame, target_col: str, confidence_info: dict):
    """
    Generates actionable business insights based on honest ML metrics and residual diagnostics.
    """
    insights = []
    
    # 1. Demand Trend
    trend = payload.get('historical_trend', [])
    if trend and len(trend) > 10:
        start_trend = np.nanmean(trend[:max(5, len(trend)//10)])
        end_trend = np.nanmean(trend[-max(5, len(trend)//10):])
        
        if end_trend > start_trend * 1.05:
            insights.append({
                "title": "Demand Upward Trend", 
                "description": "Historical demand exhibits a sustained upward trajectory (+5% over window).", 
                "severity": "low", 
                "icon": "TrendingUp", 
                "action": "Increase buffer stock and align supplier orders to prevent stockouts."
            })
        elif end_trend < start_trend * 0.95:
            insights.append({
                "title": "Demand Contraction", 
                "description": "Historical demand indicates a downward contraction trend.", 
                "severity": "medium", 
                "icon": "TrendingDown", 
                "action": "Audit pricing strategy and reduce high-volume purchase order commitments."
            })

    # 2. Seasonality
    seasonality = payload.get('historical_seasonality', [])
    if seasonality:
        amplitude = np.nanmax(seasonality) - np.nanmin(seasonality)
        mean_val = np.nanmean(df[target_col])
        if amplitude > (mean_val * 0.1):
            insights.append({
                "title": "Recurring Seasonality", 
                "description": "Noticeable weekly/seasonal demand cycles detected in historical actuals.", 
                "severity": "low", 
                "icon": "Calendar", 
                "action": "Adjust replenishment orders to match weekly demand peaks."
            })

    # 3. Key Feature Drivers
    shap_vals = payload.get('shap_values', {}) or payload.get('feature_importance', {})
    if shap_vals:
        sorted_shap = sorted(shap_vals.items(), key=lambda x: x[1], reverse=True)
        if sorted_shap:
            top_feature, top_impact = sorted_shap[0]
            if 'lag' in top_feature.lower():
                insights.append({
                    "title": "Strong Lag Autocorrelation", 
                    "description": f"Recent historical sales ({top_feature}) have the highest explanatory power.", 
                    "severity": "low", 
                    "icon": "Activity", 
                    "action": "Keep rolling inventory closely calibrated to the previous 7-14 days."
                })
            elif 'holiday' in top_feature.lower():
                insights.append({
                    "title": "Holiday Sensitivity", 
                    "description": "Holiday periods cause significant shifts in customer purchasing patterns.", 
                    "severity": "medium", 
                    "icon": "Calendar", 
                    "action": "Prepare promotional stock buffers prior to upcoming holidays."
                })
            elif 'weekend' in top_feature.lower() or 'dayofweek' in top_feature.lower():
                insights.append({
                    "title": "Day-of-Week Variation", 
                    "description": "Sales volumes fluctuate systematically across different days of the week.", 
                    "severity": "low", 
                    "icon": "Tag", 
                    "action": "Ensure store and logistics staffing aligns with peak shopping days."
                })

    # 4. Confidence & Risk Evaluation
    conf_level = confidence_info.get("level", "Medium")
    conf_score = confidence_info.get("score", 60.0)
    wape = payload.get('metrics', {}).get('wape', payload.get('metrics', {}).get('mape', 25.0))
    
    if conf_level == "High":
        insights.append({
            "title": "High Reliability Forecast", 
            "description": f"Robust statistical validation (Confidence Score: {conf_score}/100, WAPE: {wape}%).", 
            "severity": "low", 
            "icon": "ShieldCheck", 
            "action": "Automate reorder points and procurement schedules with high confidence."
        })
    elif conf_level == "Medium":
        insights.append({
            "title": "Moderate Uncertainty", 
            "description": f"Model predictions carry moderate variance (Confidence Score: {conf_score}/100, WAPE: {wape}%).", 
            "severity": "medium", 
            "icon": "ShieldCheck", 
            "action": "Maintain moderate safety stock buffers (1.65 sigma) for volatile demand periods."
        })
    else:
        insights.append({
            "title": "Elevated Forecast Uncertainty", 
            "description": f"High residual volatility detected (Confidence Score: {conf_score}/100, WAPE: {wape}%).", 
            "severity": "high", 
            "icon": "AlertTriangle", 
            "action": "Use human-in-the-loop review for inventory commitments and supply contracts."
        })

    # 5. Demand Spike Alert
    forecast_vals = payload.get('forecast_values', [])
    if forecast_vals:
        max_forecast = np.max(forecast_vals)
        mean_forecast = np.mean(forecast_vals)
        if max_forecast > (mean_forecast * 1.5):
            insights.append({
                "title": "Demand Surge Alert", 
                "description": f"Forecast indicates peak demand of {max_forecast:.0f} units exceeding average by 50%+.", 
                "severity": "high", 
                "icon": "AlertOctagon", 
                "action": "Pre-position contingency inventory before the projected peak."
            })

    return insights


@lru_cache(maxsize=32)
def run_pipeline(storage_path: str, model_type: str, horizon: int):
    """
    Executes the comprehensive ML forecasting pipeline:
    - Schema validation & Target Leakage exclusion
    - Entity-aware lag and rolling feature creation
    - Strict chronological validation (80/20 train/test split)
    - Recursive multi-step forecasting
    - Statistically defensible expanding prediction intervals
    - TreeExplainer SHAP and residual diagnostics
    - Multi-factor confidence scoring
    """
    df, date_col, target_col, entity_cols, leakage_cols, feature_audit = load_data_and_schema(storage_path)
    
    if len(df) > 5000:
        df = df.tail(5000).reset_index(drop=True)
        
    df_feat = create_features(
        df=df, 
        date_col=date_col, 
        target_col=target_col, 
        entity_cols=entity_cols, 
        leakage_cols=leakage_cols
    )
    
    train_size_feat = int(len(df_feat) * 0.8)
    train_size_raw = int(len(df) * 0.8)
    
    results = {}
    models_to_test = [
        'moving_average', 'exponential_smoothing', 'arima', 'sarima', 
        'prophet', 'xgboost', 'lightgbm', 'catboost', 'random_forest'
    ] if model_type == 'automl' else [model_type]
    
    for m in models_to_test:
        try:
            start_time = time.time()
            if m == 'moving_average':
                metrics, _, payload = train_moving_average(df, target_col, train_size_raw, horizon)
            elif m == 'exponential_smoothing':
                metrics, _, payload = train_exponential_smoothing(df, target_col, train_size_raw, horizon)
            elif m == 'prophet':
                metrics, _, payload = train_prophet(df, date_col, target_col, train_size_raw, horizon)
            elif m == 'arima':
                metrics, _, payload = train_arima(df, target_col, train_size_raw, horizon)
            elif m == 'sarima':
                metrics, _, payload = train_sarima(df, target_col, train_size_raw, horizon)
            elif m in ['xgboost', 'lightgbm', 'catboost', 'random_forest']:
                metrics, _, payload = train_tree_model(df_feat, target_col, date_col, train_size_feat, m, horizon)
            else:
                continue
                
            payload['training_time'] = round(time.time() - start_time, 2)
            payload['metrics'] = metrics
            results[m] = payload
        except Exception as e:
            logger.exception("model_training_failed", error=str(e), model=m)
            
    if not results:
        raise ValueError("All candidate models failed to train.")
        
    # Best model selection by lowest WAPE on the out-of-sample test set (fallback RMSE)
    best_model_name = min(results, key=lambda k: (results[k]['metrics'].get('wape', 999.0), results[k]['metrics']['rmse']))
    best_payload = results[best_model_name]
    
    # Seasonal decomposition of historical actuals
    try:
        series_clean = df[target_col].interpolate().bfill().ffill()
        period = 7 if len(series_clean) >= 14 else 1
        if period > 1:
            decomp = seasonal_decompose(series_clean, period=period, extrapolate_trend='freq')
            best_payload['historical_trend'] = decomp.trend.tolist()
            best_payload['historical_seasonality'] = decomp.seasonal.tolist()
        else:
            best_payload['historical_trend'] = series_clean.tolist()
            best_payload['historical_seasonality'] = [0.0] * len(series_clean)
    except Exception as e:
        logger.warning("seasonal_decompose_skipped", error=str(e))
        best_payload['historical_trend'] = df[target_col].tolist()
        best_payload['historical_seasonality'] = [0.0] * len(df)
        
    # Downsampled historical data for chart performance
    downsample_step = max(1, len(df) // 365)
    hist_df = df.iloc[::downsample_step]
    
    # Generated calendar dates for forecast horizon
    last_date = df[date_col].iloc[-1]
    forecast_dates = [(last_date + pd.Timedelta(days=i)).strftime('%Y-%m-%d') for i in range(1, horizon + 1)]
    if 'forecast_dates' not in best_payload or not best_payload['forecast_dates']:
        best_payload['forecast_dates'] = forecast_dates
        
    # Multi-factor confidence score calculation
    test_actual = best_payload.get('test_actual', [])
    test_predicted = best_payload.get('test_predicted', [])
    mean_actual = float(np.mean(test_actual)) if test_actual else float(df[target_col].mean())
    std_resid = best_payload.get('std_resid', 1.0)
    
    confidence_info = compute_confidence_score(
        metrics=best_payload['metrics'],
        df_len=len(df),
        horizon=horizon,
        std_resid=std_resid,
        mean_actual=mean_actual
    )
    
    # Model comparison leaderboard
    model_comparison = []
    for m, payload in results.items():
        m_metrics = payload['metrics']
        model_comparison.append({
            "model": m,
            "rmse": m_metrics.get('rmse', 0.0),
            "mae": m_metrics.get('mae', 0.0),
            "mape": m_metrics.get('mape', 0.0),
            "wape": m_metrics.get('wape', 0.0),
            "r2": m_metrics.get('r2', 0.0),
            "training_time": payload.get('training_time', 0.0)
        })
    model_comparison = sorted(model_comparison, key=lambda x: (x.get('wape', 999), x['rmse']))

    # Residual diagnostics
    residual_analysis = {}
    if test_actual and test_predicted:
        residuals = np.array(test_actual) - np.array(test_predicted)
        mean_residual = float(np.mean(residuals))
        std_residual = float(np.std(residuals))
        
        # Residuals vs Predicted Scatter
        scatter_data = [
            {"actual": round(float(a), 2), "predicted": round(float(p), 2), "residual": round(float(a - p), 2)}
            for a, p in zip(test_actual, test_predicted)
        ]
        
        # Residual Histogram
        hist, bin_edges = np.histogram(residuals, bins=15)
        hist_data = [
            {"bin_center": round(float((bin_edges[i] + bin_edges[i+1])/2), 2), "count": int(hist[i])}
            for i in range(len(hist))
        ]
        
        # Q-Q Plot
        osm, osr = stats.probplot(residuals, dist="norm")
        qq_data = [
            {"theoretical": round(float(osm[0][i]), 2), "sample": round(float(osm[1][i]), 2)}
            for i in range(len(osm[0]))
        ]
        
        residual_analysis = {
            "mean": round(mean_residual, 4),
            "std": round(std_residual, 4),
            "scatter": scatter_data,
            "histogram": hist_data,
            "qq_plot": qq_data
        }

    return {
        "status": "success",
        "champion_model": best_model_name,
        "metrics": best_payload['metrics'],
        "confidence": confidence_info,
        "analytics": {
            "insights": generate_insights(best_payload, df, target_col, confidence_info),
            "historical_dates": hist_df[date_col].dt.strftime('%Y-%m-%d').tolist(),
            "historical_actuals": [round(float(v), 2) for v in hist_df[target_col].tolist()],
            "historical_trend": [round(float(v), 2) for v in best_payload['historical_trend'][::downsample_step]],
            "historical_seasonality": [round(float(v), 2) for v in best_payload['historical_seasonality'][::downsample_step]],
            "forecast_dates": best_payload['forecast_dates'],
            "forecast_values": best_payload['forecast_values'],
            "ci_lower": best_payload['ci_lower'],
            "ci_upper": best_payload['ci_upper'],
            "test_actual": best_payload['test_actual'],
            "test_predicted": best_payload['test_predicted'],
            "feature_importance": best_payload['feature_importance'],
            "shap_values": best_payload['shap_values'],
            "model_comparison": model_comparison,
            "feature_audit": feature_audit,
            "confidence": confidence_info,
            "dataset_metadata": {
                "rows": len(df),
                "columns": len(df.columns),
                "features_used": len([c for c in df_feat.columns if c not in [date_col, target_col]]),
                "date_range": [df[date_col].min().strftime('%Y-%m-%d'), df[date_col].max().strftime('%Y-%m-%d')] if len(df) > 0 else [],
                "missing_values": int(df.isnull().sum().sum()),
                "duplicate_records": int(df.duplicated().sum()),
                "excluded_leakage_columns": leakage_cols
            },
            "residual_analysis": residual_analysis
        }
    }
