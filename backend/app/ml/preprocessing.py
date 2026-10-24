import pandas as pd
import numpy as np
from sklearn.base import BaseEstimator, TransformerMixin
import holidays

class CleaningTransformer(BaseEstimator, TransformerMixin):
    """
    Handles missing values and duplicates.
    Fit learns medians/modes.
    Transform applies them and removes duplicates.
    """
    def __init__(self, num_strategy='median', cat_strategy='mode'):
        self.num_strategy = num_strategy
        self.cat_strategy = cat_strategy
        self.fill_values_ = {}
        
    def fit(self, X, y=None):
        X_df = pd.DataFrame(X)
        self.numeric_cols_ = X_df.select_dtypes(include=[np.number]).columns
        self.cat_cols_ = X_df.select_dtypes(exclude=[np.number]).columns
        
        for col in self.numeric_cols_:
            if self.num_strategy == 'median':
                self.fill_values_[col] = X_df[col].median()
            elif self.num_strategy == 'mean':
                self.fill_values_[col] = X_df[col].mean()
                
        for col in self.cat_cols_:
            if len(X_df[col].mode()) > 0:
                self.fill_values_[col] = X_df[col].mode()[0]
            else:
                self.fill_values_[col] = 'Unknown'
        return self
        
    def transform(self, X):
        X_df = pd.DataFrame(X).copy()
        
        # Remove duplicates
        if not X_df.index.is_unique:
             X_df = X_df.reset_index(drop=True)
        X_df = X_df.drop_duplicates()
        
        # Fill missing values
        for col, val in self.fill_values_.items():
            if col in X_df.columns:
                X_df[col] = X_df[col].fillna(val)
                
        return X_df

class OutlierTransformer(BaseEstimator, TransformerMixin):
    """
    Caps outliers using the IQR method.
    Fit learns the bounds. Transform applies capping.
    """
    def __init__(self, columns=None, factor=1.5):
        self.columns = columns
        self.factor = factor
        self.bounds_ = {}
        
    def fit(self, X, y=None):
        X_df = pd.DataFrame(X)
        cols_to_fit = self.columns if self.columns else X_df.select_dtypes(include=[np.number]).columns
        
        for col in cols_to_fit:
            if col in X_df.columns:
                q1 = X_df[col].quantile(0.25)
                q3 = X_df[col].quantile(0.75)
                iqr = q3 - q1
                lower_bound = q1 - (self.factor * iqr)
                upper_bound = q3 + (self.factor * iqr)
                self.bounds_[col] = (lower_bound, upper_bound)
        return self
        
    def transform(self, X):
        X_df = pd.DataFrame(X).copy()
        for col, (lower, upper) in self.bounds_.items():
            if col in X_df.columns:
                X_df[col] = np.clip(X_df[col], lower, upper)
        return X_df

class TimeFeatureExtractor(BaseEstimator, TransformerMixin):
    """
    Extracts time-series features from the Date column.
    """
    def __init__(self, date_column='Date', country='US'):
        self.date_column = date_column
        self.country = country
        self.holiday_obj = holidays.country_holidays(self.country)
        
    def fit(self, X, y=None):
        return self
        
    def transform(self, X):
        X_df = pd.DataFrame(X).copy()
        if self.date_column not in X_df.columns:
            return X_df
            
        X_df[self.date_column] = pd.to_datetime(X_df[self.date_column])
        
        X_df['Day'] = X_df[self.date_column].dt.day
        X_df['Week'] = X_df[self.date_column].dt.isocalendar().week.astype(int)
        X_df['Month'] = X_df[self.date_column].dt.month
        X_df['Quarter'] = X_df[self.date_column].dt.quarter
        X_df['Year'] = X_df[self.date_column].dt.year
        X_df['Day_of_Week'] = X_df[self.date_column].dt.dayofweek
        
        X_df['Is_Weekend'] = X_df['Day_of_Week'].apply(lambda x: 1 if x >= 5 else 0)
        
        # Is Holiday
        def check_holiday(d):
            return 1 if d in self.holiday_obj else 0
        X_df['Is_Holiday'] = X_df[self.date_column].apply(check_holiday)
        
        # Festival Flag (simple approximation: Q4 months, usually higher sales in retail)
        X_df['Festival_Flag'] = X_df['Month'].apply(lambda x: 1 if x in [11, 12] else 0)
        
        return X_df

class LagRollingFeatureExtractor(BaseEstimator, TransformerMixin):
    """
    Creates lag and rolling features safely.
    Groups by Store_ID and Product_ID if available, or operates globally.
    Ensures dataframe is sorted by Date before calling transform.
    Strictly uses historical observations (t-1 and prior) to prevent target leakage.
    """
    def __init__(self, date_col='Date', group_cols=None, target_col='Sales', lags=[1, 7, 14, 30], windows=[7, 14, 30]):
        self.date_col = date_col
        self.group_cols = group_cols if group_cols is not None else ['Store_ID', 'Product_ID']
        self.target_col = target_col
        self.lags = lags
        self.windows = windows
        
    def fit(self, X, y=None):
        return self
        
    def transform(self, X):
        X_df = pd.DataFrame(X).copy()
        if self.target_col not in X_df.columns:
            return X_df
            
        active_groups = [c for c in self.group_cols if c in X_df.columns]
        
        # Sort chronologically (within groups if present)
        sort_cols = [*active_groups, self.date_col] if self.date_col in X_df.columns else active_groups
        if sort_cols:
            X_df = X_df.sort_values(by=sort_cols).reset_index(drop=True)
            
        # Lags
        if active_groups:
            grouped = X_df.groupby(active_groups)[self.target_col]
            for lag in self.lags:
                X_df[f'{self.target_col}_Lag_{lag}'] = grouped.shift(lag)
                
            # Rolling Features (Strictly shift by 1 first so current-period target NEVER leaks into rolling stats)
            for window in self.windows:
                X_df[f'Rolling_Mean_{window}'] = grouped.transform(lambda s: s.shift(1).rolling(window=window, min_periods=1).mean())
                X_df[f'Rolling_Median_{window}'] = grouped.transform(lambda s: s.shift(1).rolling(window=window, min_periods=1).median())
                X_df[f'Rolling_Std_{window}'] = grouped.transform(lambda s: s.shift(1).rolling(window=window, min_periods=1).std())
                X_df[f'Rolling_Max_{window}'] = grouped.transform(lambda s: s.shift(1).rolling(window=window, min_periods=1).max())
                X_df[f'Rolling_Min_{window}'] = grouped.transform(lambda s: s.shift(1).rolling(window=window, min_periods=1).min())
        else:
            shifted = X_df[self.target_col].shift(1)
            for lag in self.lags:
                X_df[f'{self.target_col}_Lag_{lag}'] = X_df[self.target_col].shift(lag)
            for window in self.windows:
                rolling_obj = shifted.rolling(window=window, min_periods=1)
                X_df[f'Rolling_Mean_{window}'] = rolling_obj.mean()
                X_df[f'Rolling_Median_{window}'] = rolling_obj.median()
                X_df[f'Rolling_Std_{window}'] = rolling_obj.std()
                X_df[f'Rolling_Max_{window}'] = rolling_obj.max()
                X_df[f'Rolling_Min_{window}'] = rolling_obj.min()
            
        return X_df

class InventoryPriceFeatureExtractor(BaseEstimator, TransformerMixin):
    """
    Creates inventory and price related features.
    Guaranteed zero target leakage: never accesses current period target.
    """
    def __init__(self, target_col='Sales', group_cols=None):
        self.target_col = target_col
        self.group_cols = group_cols if group_cols is not None else ['Store_ID', 'Product_ID']

    def fit(self, X, y=None):
        return self
        
    def transform(self, X):
        X_df = pd.DataFrame(X).copy()
        
        # Average Daily Demand derived strictly from historical lag-1 rolling statistics
        if 'Rolling_Mean_7' in X_df.columns:
            X_df['Average_Daily_Demand'] = X_df['Rolling_Mean_7']
        elif f'{self.target_col}_Lag_1' in X_df.columns:
            X_df['Average_Daily_Demand'] = X_df[f'{self.target_col}_Lag_1']
        else:
            X_df['Average_Daily_Demand'] = 1.0 # Safe constant baseline
            
        # Days Until Stockout (inventory available / demand forecast)
        if 'Inventory' in X_df.columns:
            safe_demand = X_df['Average_Daily_Demand'].replace(0, 1).fillna(1)
            X_df['Days_Until_Stockout'] = X_df['Inventory'] / safe_demand
        
        # Safety Stock = Z (1.65 for 95% service level) * Std_Dev * sqrt(Lead_Time)
        if 'Rolling_Std_7' in X_df.columns and 'Supplier_Lead_Time' in X_df.columns:
            std_dev = X_df['Rolling_Std_7'].fillna(0)
            lead_time = np.maximum(X_df['Supplier_Lead_Time'].fillna(1), 1)
            X_df['Safety_Stock'] = 1.65 * std_dev * np.sqrt(lead_time)
        elif 'Supplier_Lead_Time' in X_df.columns:
            X_df['Safety_Stock'] = 1.65 * np.sqrt(np.maximum(X_df['Supplier_Lead_Time'].fillna(1), 1))
            
        # Price and Discount Features
        if 'Price' in X_df.columns:
            if 'Cost' in X_df.columns:
                if 'Discount' not in X_df.columns and 'Discount_Percent' not in X_df.columns:
                    X_df['Discount_%'] = np.clip((X_df['Price'] - X_df['Cost']) / X_df['Price'].replace(0, 1), 0, 1)
                elif 'Discount' in X_df.columns:
                    X_df['Discount_%'] = X_df['Discount']
                elif 'Discount_Percent' in X_df.columns:
                    X_df['Discount_%'] = X_df['Discount_Percent']
                    
                X_df['Price_Difference'] = X_df['Price'] - X_df['Cost']
            
            # Historical Elasticity Proxy: uses lag_1 vs lag_2 (STRICTLY HISTORICAL, NEVER USES TODAY'S SALES)
            active_groups = [c for c in self.group_cols if c in X_df.columns]
            grouped_price = X_df.groupby(active_groups)['Price'] if active_groups else None
            
            if grouped_price is not None:
                X_df['Price_Lag_1'] = grouped_price.shift(1)
                X_df['Price_Lag_2'] = grouped_price.shift(2)
            else:
                X_df['Price_Lag_1'] = X_df['Price'].shift(1)
                X_df['Price_Lag_2'] = X_df['Price'].shift(2)
                
            lag1_col = f'{self.target_col}_Lag_1'
            lag2_col = f'{self.target_col}_Lag_2'
            if lag1_col in X_df.columns and lag2_col in X_df.columns:
                pct_change_sales_hist = (X_df[lag1_col] - X_df[lag2_col]) / X_df[lag2_col].replace(0, 1).fillna(1)
                pct_change_price_hist = (X_df['Price_Lag_1'] - X_df['Price_Lag_2']) / X_df['Price_Lag_2'].replace(0, 1).fillna(1)
                elasticity = pct_change_sales_hist / pct_change_price_hist.replace(0, 0.0001)
                X_df['Historical_Elasticity'] = elasticity.replace([np.inf, -np.inf], np.nan).fillna(0)
            
        return X_df

class TargetLeakageFilter(BaseEstimator, TransformerMixin):
    """
    Detects and excludes known target leakage columns from the feature matrix.
    Prevents artificial near-zero MAPE scores by ensuring no future or target-derived
    metrics (like Revenue = Price * Target or Closing_Stock = Opening_Stock - Target)
    enter the model predictors.
    """
    LEAKAGE_KEYWORDS = [
        'revenue', 'revenue_inr', 'closing_stock', 'profit', 'margin', 
        'total_amount', 'net_sales', 'gross_sales', 'stockout_flag'
    ]

    def __init__(self, target_col='Sales', date_col='Date', custom_excludes=None):
        self.target_col = target_col
        self.date_col = date_col
        self.custom_excludes = custom_excludes or []
        self.excluded_columns_ = []

    def fit(self, X, y=None):
        X_df = pd.DataFrame(X)
        self.excluded_columns_ = []
        for col in X_df.columns:
            col_lower = col.lower().strip()
            if col == self.target_col or col == self.date_col:
                self.excluded_columns_.append(col)
            elif any(k == col_lower or f"_{k}" in col_lower or f"{k}_" in col_lower for k in self.LEAKAGE_KEYWORDS):
                self.excluded_columns_.append(col)
            elif col in self.custom_excludes:
                self.excluded_columns_.append(col)
        return self

    def transform(self, X):
        X_df = pd.DataFrame(X).copy()
        cols_to_drop = [c for c in self.excluded_columns_ if c in X_df.columns]
        return X_df.drop(columns=cols_to_drop)
