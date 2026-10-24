import numpy as np
import pandas as pd
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

# ==========================================
# Evaluation Metrics
# ==========================================

def get_mae(y_true, y_pred):
    return float(mean_absolute_error(y_true, y_pred))

def get_rmse(y_true, y_pred):
    return float(np.sqrt(mean_squared_error(y_true, y_pred)))

def get_mape(y_true, y_pred):
    y_true, y_pred = np.array(y_true, dtype=float), np.array(y_pred, dtype=float)
    mask = (y_true != 0) & ~np.isnan(y_true) & ~np.isnan(y_pred)
    if not mask.any(): 
        return 0.0
    return float(np.mean(np.abs((y_true[mask] - y_pred[mask]) / y_true[mask])) * 100)

def get_wape(y_true, y_pred):
    y_true, y_pred = np.array(y_true, dtype=float), np.array(y_pred, dtype=float)
    valid = ~np.isnan(y_true) & ~np.isnan(y_pred)
    sum_true = np.sum(np.abs(y_true[valid]))
    if sum_true == 0: 
        return 0.0
    return float((np.sum(np.abs(y_true[valid] - y_pred[valid])) / sum_true) * 100)

def get_smape(y_true, y_pred):
    y_true, y_pred = np.array(y_true, dtype=float), np.array(y_pred, dtype=float)
    denominator = (np.abs(y_true) + np.abs(y_pred)) / 2.0
    mask = (denominator != 0) & ~np.isnan(y_true) & ~np.isnan(y_pred)
    if not mask.any(): 
        return 0.0
    return float(np.mean(np.abs(y_true[mask] - y_pred[mask]) / denominator[mask]) * 100)

def get_bias(y_true, y_pred):
    y_true, y_pred = np.array(y_true, dtype=float), np.array(y_pred, dtype=float)
    valid = ~np.isnan(y_true) & ~np.isnan(y_pred)
    if not valid.any():
        return 0.0
    return float(np.mean(y_pred[valid] - y_true[valid]))

def get_r2(y_true, y_pred):
    if len(y_true) < 2: return 0.0
    return float(r2_score(y_true, y_pred))

def evaluate_all(y_true, y_pred):
    return {
        "MAE": round(get_mae(y_true, y_pred), 4),
        "RMSE": round(get_rmse(y_true, y_pred), 4),
        "MAPE": round(get_mape(y_true, y_pred), 2),
        "WAPE": round(get_wape(y_true, y_pred), 2),
        "SMAPE": round(get_smape(y_true, y_pred), 2),
        "Bias": round(get_bias(y_true, y_pred), 4),
        "R2": round(get_r2(y_true, y_pred), 4)
    }

# ==========================================
# Walk-Forward Validator
# ==========================================

class WalkForwardValidator:
    """
    Performs walk-forward validation for time series forecasting.
    Iteratively trains on a growing history and evaluates on the forecast horizon.
    """
    def __init__(self, min_train_size: int = 30, forecast_horizon: int = 7, step_size: int = 7):
        self.min_train_size = min_train_size
        self.forecast_horizon = forecast_horizon
        self.step_size = step_size
        
    def evaluate(self, model, y: pd.Series):
        """
        Evaluate a model on a series using walk-forward validation.
        Returns aggregated metrics across all splits.
        """
        y_array = y.values
        n = len(y_array)
        
        if n < self.min_train_size + self.forecast_horizon:
            # Not enough data for validation
            return None
            
        all_y_true = []
        all_y_pred = []
        
        # Slide window across the series
        for start_idx in range(self.min_train_size, n - self.forecast_horizon + 1, self.step_size):
            train = pd.Series(y_array[:start_idx])
            test = y_array[start_idx : start_idx + self.forecast_horizon]
            
            # Fit and Predict
            model.fit(train)
            preds = model.predict(self.forecast_horizon)
            
            all_y_true.extend(test)
            all_y_pred.extend(preds)
            
        if not all_y_true:
            return None
            
        # Return aggregated metrics
        return evaluate_all(all_y_true, all_y_pred)
