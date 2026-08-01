import os
from functools import lru_cache
import json
import numpy as np
import pandas as pd
from sklearn.metrics import mean_absolute_percentage_error, mean_squared_error
import joblib
import holidays
import shap
from statsmodels.tsa.seasonal import seasonal_decompose

# Patch numpy for Prophet compatibility (numpy >= 2.0 removed np.float_)
if not hasattr(np, 'float_'):
    np.float_ = np.float64

# Models
from prophet import Prophet
from sklearn.ensemble import RandomForestRegressor
from statsmodels.tsa.arima.model import ARIMA
from statsmodels.tsa.statespace.sarimax import SARIMAX
from statsmodels.tsa.holtwinters import ExponentialSmoothing
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

UPLOAD_DIR = os.path.join(os.getcwd(), "data", "uploads")

def load_data_and_schema(absolute_path: str):
    from app.core.logging import logger
    
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
        
    try:
        date_col = next(c["name"] for c in schema if c["role"] == "date")
        target_col = next(c["name"] for c in schema if c["role"] == "target")
    except StopIteration:
        raise ValueError("Schema must contain exactly one 'date' and one 'target' column")
    
    df[date_col] = pd.to_datetime(df[date_col], format='mixed', errors='coerce')
    df = df.dropna(subset=[date_col, target_col]).sort_values(date_col).reset_index(drop=True)
    
    if len(df) < 20:
        raise ValueError("Dataset has too few valid rows (<20) after dropping missing date/target values.")
    
    return df, date_col, target_col

def create_features(df, date_col, target_col):
    df_feat = df.copy()
    df_feat[target_col] = df_feat[target_col].interpolate(method='linear').bfill().ffill()
    
    df_feat['month'] = df_feat[date_col].dt.month
    df_feat['quarter'] = df_feat[date_col].dt.quarter
    df_feat['week'] = df_feat[date_col].dt.isocalendar().week.astype(int)
    df_feat['year'] = df_feat[date_col].dt.year
    df_feat['dayofweek'] = df_feat[date_col].dt.dayofweek
    df_feat['is_weekend'] = df_feat['dayofweek'].isin([5, 6]).astype(int)
    
    us_holidays = holidays.US()
    df_feat['is_holiday'] = df_feat[date_col].apply(lambda x: int(x in us_holidays))
    
    df_feat['trend'] = np.arange(len(df_feat))
    df_feat['sin_year'] = np.sin(2 * np.pi * df_feat['trend'] / 365.25)
    df_feat['cos_year'] = np.cos(2 * np.pi * df_feat['trend'] / 365.25)
    
    for lag in [1, 7, 30]:
        df_feat[f'lag_{lag}'] = df_feat[target_col].shift(lag)
        
    shifted_target = df_feat[target_col].shift(1)
    for window in [7, 30]:
        df_feat[f'rolling_mean_{window}'] = shifted_target.rolling(window=window).mean()
        df_feat[f'rolling_median_{window}'] = shifted_target.rolling(window=window).median()
        df_feat[f'rolling_std_{window}'] = shifted_target.rolling(window=window).std()
    
    # Handle categorical columns (exclude date and target)
    cat_cols = [c for c in df_feat.select_dtypes(include=['object', 'category']).columns if c not in [date_col, target_col]]
    for c in cat_cols:
        if df_feat[c].nunique() < 20:
            df_feat = pd.get_dummies(df_feat, columns=[c], drop_first=True, dtype=int)
        else:
            df_feat = df_feat.drop(columns=[c])

    # Ensure all remaining columns are numeric
    for c in df_feat.columns:
        if c not in [date_col, target_col] and df_feat[c].dtype == 'object':
            df_feat = df_feat.drop(columns=[c])

    df_feat = df_feat.dropna().reset_index(drop=True)
    return df_feat

def evaluate_model(y_true, y_pred):
    return {
        "mape": round(mean_absolute_percentage_error(y_true, y_pred) * 100, 2),
        "rmse": round(float(np.sqrt(mean_squared_error(y_true, y_pred))), 2)
    }

def train_prophet(df, date_col, target_col, train_size, horizon):
    pdf = df[[date_col, target_col]].rename(columns={date_col: 'ds', target_col: 'y'})
    train = pdf.iloc[:train_size]
    test = pdf.iloc[train_size:]
    
    model = Prophet()
    model.fit(train)
    
    # Evaluate on test
    future_test = model.make_future_dataframe(periods=len(test))
    forecast_test = model.predict(future_test)
    preds = forecast_test.iloc[train_size:]['yhat'].values
    metrics = evaluate_model(test['y'].values, preds)
    
    # Generate actual future forecast
    model_full = Prophet()
    model_full.fit(pdf)
    future_full = model_full.make_future_dataframe(periods=horizon)
    forecast_full = model_full.predict(future_full)
    
    future_df = forecast_full.tail(horizon)
    
    return metrics, model_full, {
        "forecast_dates": future_df['ds'].astype(str).tolist(),
        "forecast_values": future_df['yhat'].tolist(),
        "ci_lower": future_df['yhat_lower'].tolist(),
        "ci_upper": future_df['yhat_upper'].tolist(),
        "test_actual": test['y'].tolist(),
        "test_predicted": preds.tolist(),
        "feature_importance": {},
        "shap_values": {}
    }

def train_arima(df, target_col, train_size, horizon):
    series = df[target_col].values
    train, test = series[:train_size], series[train_size:]
    
    model = ARIMA(train, order=(1,1,1))
    model_fit = model.fit()
    preds = model_fit.forecast(steps=len(test))
    metrics = evaluate_model(test, preds)
    
    model_full = ARIMA(series, order=(1,1,1)).fit()
    forecast_res = model_full.get_forecast(steps=horizon)
    
    return metrics, model_full, {
        "forecast_values": forecast_res.predicted_mean.tolist(),
        "ci_lower": forecast_res.conf_int()[:, 0].tolist(),
        "ci_upper": forecast_res.conf_int()[:, 1].tolist(),
        "test_actual": test.tolist(),
        "test_predicted": preds.tolist(),
        "feature_importance": {},
        "shap_values": {}
    }

def train_sarima(df, target_col, train_size, horizon):
    series = df[target_col].values
    train, test = series[:train_size], series[train_size:]
    
    model = SARIMAX(train, order=(1, 1, 1), seasonal_order=(1, 1, 1, 7))
    model_fit = model.fit(disp=False)
    preds = model_fit.forecast(steps=len(test))
    metrics = evaluate_model(test, preds)
    
    model_full = SARIMAX(series, order=(1, 1, 1), seasonal_order=(1, 1, 1, 7)).fit(disp=False)
    forecast_res = model_full.get_forecast(steps=horizon)
    
    return metrics, model_full, {
        "forecast_values": forecast_res.predicted_mean.tolist(),
        "ci_lower": forecast_res.conf_int()[:, 0].tolist(),
        "ci_upper": forecast_res.conf_int()[:, 1].tolist(),
        "test_actual": test.tolist(),
        "test_predicted": preds.tolist(),
        "feature_importance": {},
        "shap_values": {}
    }

def train_moving_average(df, target_col, train_size, horizon):
    series = df[target_col].values
    train, test = series[:train_size], series[train_size:]
    
    window = 7
    last_val = np.mean(train[-window:])
    preds = np.full(len(test), last_val)
    metrics = evaluate_model(test, preds)
    
    last_val_full = np.mean(series[-window:])
    forecast_values = np.full(horizon, last_val_full).tolist()
    
    return metrics, None, {
        "forecast_values": forecast_values,
        "ci_lower": [v * 0.9 for v in forecast_values],
        "ci_upper": [v * 1.1 for v in forecast_values],
        "test_actual": test.tolist(),
        "test_predicted": preds.tolist(),
        "feature_importance": {},
        "shap_values": {}
    }

def train_exponential_smoothing(df, target_col, train_size, horizon):
    series = df[target_col].values
    train, test = series[:train_size], series[train_size:]
    
    model = ExponentialSmoothing(train, trend='add', seasonal='add', seasonal_periods=7)
    model_fit = model.fit()
    preds = model_fit.forecast(len(test))
    metrics = evaluate_model(test, preds)
    
    model_full = ExponentialSmoothing(series, trend='add', seasonal='add', seasonal_periods=7).fit()
    forecast_values = model_full.forecast(horizon)
    
    return metrics, model_full, {
        "forecast_values": forecast_values.tolist(),
        "ci_lower": [v * 0.9 for v in forecast_values],
        "ci_upper": [v * 1.1 for v in forecast_values],
        "test_actual": test.tolist(),
        "test_predicted": preds.tolist(),
        "feature_importance": {},
        "shap_values": {}
    }

def train_tree_model(df_feat, target_col, date_col, train_size, model_type, horizon):
    features = [c for c in df_feat.columns if c not in [date_col, target_col]]
    
    train = df_feat.iloc[:train_size]
    test = df_feat.iloc[train_size:]
    
    X_train, y_train = train[features], train[target_col]
    X_test, y_test = test[features], test[target_col]
    
    if model_type == 'xgboost' and xgb is not None:
        model = xgb.XGBRegressor(n_estimators=100, learning_rate=0.05, max_depth=5)
    elif model_type == 'lightgbm' and lgb is not None:
        model = lgb.LGBMRegressor(n_estimators=100, learning_rate=0.05, max_depth=5, verbose=-1)
    elif model_type == 'catboost' and cb is not None:
        model = cb.CatBoostRegressor(iterations=100, learning_rate=0.05, depth=5, silent=True)
    elif model_type == 'random_forest':
        model = RandomForestRegressor(n_estimators=100, max_depth=5)
    else:
        raise ValueError(f"Model {model_type} is either unsupported or its library failed to load.")
        
    model.fit(X_train, y_train)
    preds = model.predict(X_test)
    metrics = evaluate_model(y_test, preds)
    
    # Global Feature Importance
    importance_dict = {}
    if hasattr(model, 'feature_importances_'):
        imp = model.feature_importances_
        importance_dict = {f: float(i) for f, i in zip(features, imp)}
        
    # SHAP values (on a sample of test data to be fast)
    shap_dict = {}
    try:
        sample = X_test.sample(min(100, len(X_test)))
        explainer = shap.TreeExplainer(model)
        shap_values = explainer.shap_values(sample)
        if isinstance(shap_values, list): # For some versions of SHAP/models
            shap_values = shap_values[0]
        mean_abs_shap = np.abs(shap_values).mean(axis=0)
        shap_dict = {f: float(i) for f, i in zip(features, mean_abs_shap)}
    except Exception as e:
        from app.core.logging import logger
        logger.exception("shap_generation_failed", error=str(e), model_type=model_type)
    
    # Train full model for future forecast
    model_full = model.__class__(**model.get_params())
    X_full, y_full = df_feat[features], df_feat[target_col]
    model_full.fit(X_full, y_full)
    
    # Simulate future features naively (propagate last known features forward)
    last_row = X_full.iloc[-1:].copy()
    future_X = pd.concat([last_row]*horizon, ignore_index=True)
    future_X['trend'] = future_X['trend'] + np.arange(1, horizon+1)
    future_preds = model_full.predict(future_X)
    
    # Residual std for CI
    std_resid = np.std(y_test - preds)
    
    return metrics, model_full, {
        "forecast_values": future_preds.tolist(),
        "ci_lower": (future_preds - 1.96 * std_resid).tolist(),
        "ci_upper": (future_preds + 1.96 * std_resid).tolist(),
        "test_actual": y_test.tolist(),
        "test_predicted": preds.tolist(),
        "feature_importance": importance_dict,
        "shap_values": shap_dict
    }


def generate_insights(payload, df, target_col):
    insights = []
    
    # 1. Demand Trend
    trend = payload.get('historical_trend', [])
    if trend and len(trend) > 10:
        start_trend = np.nanmean(trend[:max(5, len(trend)//10)])
        end_trend = np.nanmean(trend[-max(5, len(trend)//10):])
        
        if end_trend > start_trend * 1.05:
            insights.append({"title": "Demand Increase", "description": "The overall demand is experiencing a sustained upward trend.", "severity": "low", "icon": "TrendingUp", "action": "Increase inventory buffers to avoid stockouts."})
            insights.append({"title": "Revenue Opportunity", "description": "Growing demand presents an opportunity for slight price increases or upselling.", "severity": "low", "icon": "DollarSign", "action": "Review pricing elasticity."})
        elif end_trend < start_trend * 0.95:
            insights.append({"title": "Demand Decrease", "description": "Demand is currently trending downwards.", "severity": "medium", "icon": "TrendingDown", "action": "Investigate marketing channels and competitor pricing."})
            insights.append({"title": "Inventory Risk", "description": "Decreasing demand may lead to overstocking and capital lockup.", "severity": "high", "icon": "AlertOctagon", "action": "Hold off on large purchase orders."})

    # 2. Seasonality
    seasonality = payload.get('historical_seasonality', [])
    if seasonality:
        amplitude = np.nanmax(seasonality) - np.nanmin(seasonality)
        mean_val = np.nanmean(df[target_col])
        if amplitude > (mean_val * 0.1):
            insights.append({"title": "Strong Seasonality", "description": "This dataset exhibits strong recurring seasonal patterns.", "severity": "medium", "icon": "Calendar", "action": "Align marketing campaigns with seasonal peaks."})
            insights.append({"title": "Stock Replenishment", "description": "Seasonal variance requires dynamic safety stock levels.", "severity": "medium", "icon": "Package", "action": "Implement seasonal min/max inventory rules."})

    # 3. Feature Impact (Holidays/Promotions)
    shap_vals = payload.get('shap_values', {})
    if shap_vals:
        sorted_shap = sorted(shap_vals.items(), key=lambda x: x[1], reverse=True)
        if sorted_shap:
            top_feature, top_impact = sorted_shap[0]
            if 'holiday' in top_feature.lower():
                insights.append({"title": "Holiday Impact", "description": "Holidays are the primary driver of demand fluctuations.", "severity": "low", "icon": "Gift", "action": "Plan special holiday bundles and promotions."})
            if 'promo' in top_feature.lower():
                insights.append({"title": "Promotion Effectiveness", "description": "Promotional events strongly correlate with demand spikes.", "severity": "low", "icon": "Tag", "action": "Calculate ROI on recent promotions."})
            if 'weekend' in top_feature.lower():
                insights.append({"title": "Weekend Surges", "description": "Weekends heavily influence the sales volume.", "severity": "low", "icon": "Calendar", "action": "Ensure adequate weekend staffing and stock availability."})

    # 4. Forecast Confidence & Risk
    metrics = payload.get('metrics', {})
    mape = metrics.get('mape', 100)
    if mape < 15:
        insights.append({"title": "High Forecast Confidence", "description": f"The AI model is highly confident (MAPE: {mape}%).", "severity": "low", "icon": "ShieldCheck", "action": "Automate procurement based on these predictions."})
    elif mape > 30:
        insights.append({"title": "Low Forecast Confidence", "description": f"The forecast carries higher uncertainty (MAPE {mape}%).", "severity": "high", "icon": "AlertTriangle", "action": "Require human-in-the-loop signoff for large orders."})
        insights.append({"title": "Risk Analysis", "description": "High variance in predictions suggests external volatile factors.", "severity": "high", "icon": "Activity", "action": "Add more external features (weather, macro-economy) to the dataset."})

    if not insights:
        insights.append({"title": "Stable Baseline", "description": "The dataset is relatively stable with no extreme outliers detected.", "severity": "low", "icon": "Activity", "action": "Maintain current operational strategy."})

    # 5. Demand Spike Warning
    if payload.get('forecast_values') and len(payload['forecast_values']) > 0:
        max_forecast = np.max(payload['forecast_values'])
        mean_forecast = np.mean(payload['forecast_values'])
        if max_forecast > (mean_forecast * 1.5):
             insights.append({"title": "Demand Spike Warning", "description": "A significant demand spike is predicted in the forecast window.", "severity": "high", "icon": "AlertTriangle", "action": "Prepare contingency stock for predicted peak days."})

    return insights

@lru_cache(maxsize=32)
def run_pipeline(storage_path: str, model_type: str, horizon: int):
    df, date_col, target_col = load_data_and_schema(storage_path)
    
    if len(df) > 5000:
        df = df.tail(5000).reset_index(drop=True)
        
    df_feat = create_features(df, date_col, target_col)
    train_size_feat = int(len(df_feat) * 0.8)
    train_size_raw = int(len(df) * 0.8)
    
    results = {}
    models_to_test = [
        'moving_average', 'exponential_smoothing', 'arima', 'sarima', 
        'prophet', 'xgboost', 'lightgbm', 'catboost', 'random_forest'
    ] if model_type == 'automl' else [model_type]
    
    for m in models_to_test:
        import time
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
            from app.core.logging import logger
            logger.exception("model_training_failed", error=str(e), model=m)
            
    if not results:
        raise ValueError("All models failed to train.")
        
    best_model_name = min(results, key=lambda k: results[k]['metrics']['mape'])
    best_payload = results[best_model_name]
    
    # Time-series decomposition for the historical data
    try:
        decomp = seasonal_decompose(df[target_col].interpolate().bfill().ffill(), period=7, extrapolate_trend='freq')
        best_payload['historical_trend'] = decomp.trend.tolist()
        best_payload['historical_seasonality'] = decomp.seasonal.tolist()
    except Exception as e:
        from app.core.logging import logger
        logger.exception("seasonal_decompose_failed", error=str(e))
        best_payload['historical_trend'] = []
        best_payload['historical_seasonality'] = []
        
    # Historical basic data (downsampled for UI if needed)
    downsample_step = max(1, len(df) // 365)
    hist_df = df.iloc[::downsample_step]
    
    # Add generated dates for forecast if missing
    last_date = df[date_col].iloc[-1]
    forecast_dates = [ (last_date + pd.Timedelta(days=i)).strftime('%Y-%m-%d') for i in range(1, horizon+1) ]
    
    if 'forecast_dates' not in best_payload or not best_payload['forecast_dates']:
        best_payload['forecast_dates'] = forecast_dates
        
    model_comparison = []
    for m, payload in results.items():
        model_comparison.append({
            "model": m,
            "rmse": payload['metrics'].get('rmse', 0),
            "mape": payload['metrics'].get('mape', 0),
            "training_time": payload.get('training_time', 0) # if available
        })
    model_comparison = sorted(model_comparison, key=lambda x: x['rmse'])

    import scipy.stats as stats
    test_actual = best_payload.get('test_actual', [])
    test_predicted = best_payload.get('test_predicted', [])
    residual_analysis = {}
    if test_actual and test_predicted:
        residuals = np.array(test_actual) - np.array(test_predicted)
        mean_residual = float(np.mean(residuals))
        std_residual = float(np.std(residuals))
        hist, bin_edges = np.histogram(residuals, bins=15)
        hist_data = [{"bin_center": round(float((bin_edges[i] + bin_edges[i+1])/2), 2), "count": int(hist[i])} for i in range(len(hist))]
        osm, osr = stats.probplot(residuals, dist="norm")
        qq_data = [{"theoretical": round(float(osm[0][i]), 2), "sample": round(float(osm[1][i]), 2)} for i in range(len(osm[0]))]
        residual_analysis = {
            "mean": round(mean_residual, 4),
            "std": round(std_residual, 4),
            "histogram": hist_data,
            "qq_plot": qq_data
        }

    return {
        "status": "success",
        "champion_model": best_model_name,
        "metrics": best_payload['metrics'],
                "analytics": {
            "insights": generate_insights(best_payload, df, target_col),
            "historical_dates": hist_df[date_col].dt.strftime('%Y-%m-%d').tolist(),
            "historical_actuals": hist_df[target_col].tolist(),
            "historical_trend": best_payload['historical_trend'][::downsample_step],
            "historical_seasonality": best_payload['historical_seasonality'][::downsample_step],
            "forecast_dates": best_payload['forecast_dates'],
            "forecast_values": best_payload['forecast_values'],
            "ci_lower": best_payload['ci_lower'],
            "ci_upper": best_payload['ci_upper'],
            "test_actual": best_payload['test_actual'],
            "test_predicted": best_payload['test_predicted'],
            "feature_importance": best_payload['feature_importance'],
            "shap_values": best_payload['shap_values'],
            "model_comparison": model_comparison,
            "dataset_metadata": {
                "rows": len(df),
                "columns": len(df.columns),
                "date_range": [df[date_col].min().strftime('%Y-%m-%d'), df[date_col].max().strftime('%Y-%m-%d')] if len(df) > 0 else [],
                "missing_values": int(df.isnull().sum().sum()),
                "duplicate_records": int(df.duplicated().sum())
            },
            "residual_analysis": residual_analysis
        }
    }
