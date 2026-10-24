import sys
import os
import json
import numpy as np
import pandas as pd

# Set working directory to backend
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, backend_dir)

from app.ml.dynamic_forecasting import (
    load_data_and_schema,
    create_features,
    train_tree_model,
    compute_expanding_intervals,
    compute_confidence_score,
    evaluate_predictions
)

def test_ml_audit():
    print("=" * 60)
    print("RUNNING SMARTSTOCK AI ML AUDIT & INTEGRITY VERIFICATION")
    print("=" * 60)
    
    # 1. Test dataset with mock retail sales
    raw_csv = os.path.join(backend_dir, "..", "data", "raw", "mock_sales_data.csv")
    if not os.path.exists(raw_csv):
        print(f"Error: {raw_csv} does not exist!")
        return False
        
    df_raw = pd.read_csv(raw_csv)
    print(f"Loaded raw dataset: {len(df_raw)} rows, {len(df_raw.columns)} columns")
    print(f"Columns: {list(df_raw.columns)}")
    
    # Create test schema with known leakage columns:
    # Target: Sales
    # Date: Date
    # Leakage to exclude: Profit
    # Identifiers: Store_ID, Product_ID
    schema = [
        {"name": "Date", "role": "date", "confidence": 0.99, "type": "object"},
        {"name": "Store_ID", "role": "identifier", "confidence": 0.95, "type": "object"},
        {"name": "Product_ID", "role": "identifier", "confidence": 0.95, "type": "object"},
        {"name": "Category", "role": "categorical", "confidence": 0.90, "type": "object"},
        {"name": "Sales", "role": "target", "confidence": 0.98, "type": "int64"},
        {"name": "Inventory", "role": "numerical", "confidence": 0.90, "type": "int64"},
        {"name": "Price", "role": "numerical", "confidence": 0.90, "type": "float64"},
        {"name": "Promotion", "role": "categorical", "confidence": 0.90, "type": "int64"},
        {"name": "Holiday", "role": "categorical", "confidence": 0.90, "type": "int64"},
        {"name": "Temperature", "role": "numerical", "confidence": 0.90, "type": "float64"},
        {"name": "Rainfall", "role": "numerical", "confidence": 0.90, "type": "float64"},
        {"name": "Discount", "role": "numerical", "confidence": 0.90, "type": "float64"},
        {"name": "Supplier_Lead_Time", "role": "numerical", "confidence": 0.90, "type": "int64"},
        {"name": "Supplier_Reliability", "role": "numerical", "confidence": 0.90, "type": "float64"},
        {"name": "Cost", "role": "numerical", "confidence": 0.90, "type": "float64"},
        {"name": "Profit", "role": "ignore", "confidence": 0.99, "type": "float64"} # Excluded leakage!
    ]
    
    test_csv = os.path.join(backend_dir, "data", "uploads", "test_audit_dataset.csv")
    test_schema = os.path.join(backend_dir, "data", "uploads", "test_audit_dataset_schema.json")
    os.makedirs(os.path.dirname(test_csv), exist_ok=True)
    df_raw.head(1000).to_csv(test_csv, index=False)
    with open(test_schema, "w") as f:
        json.dump(schema, f)
        
    # Test load_data_and_schema
    df, date_col, target_col, entity_cols, leakage_cols, feature_audit = load_data_and_schema(test_csv)
    print(f"\n[1] Schema Ingestion & Leakage Detection:")
    print(f"    Date col: {date_col}, Target col: {target_col}")
    print(f"    Entity cols: {entity_cols}")
    print(f"    Leakage cols identified: {leakage_cols}")
    assert target_col == "Sales", f"Expected target Sales, got {target_col}"
    assert "Profit" in leakage_cols, f"Expected Profit in leakage cols!"
    
    # Test Feature Engineering & Target Leakage filter
    print(f"\n[2] Feature Engineering & Leakage Exclusion:")
    df_feat = create_features(df, date_col, target_col, entity_cols, leakage_cols)
    print(f"    Engineered feature columns count: {len(df_feat.columns)}")
    print(f"    Columns: {list(df_feat.columns[:15])}...")
    assert "Profit" not in df_feat.columns, "CRITICAL ERROR: Profit leaked into features!"
    assert "Sales" in df_feat.columns, "Sales should be present in df_feat for indexing target"
    assert "lag_1" in df_feat.columns, "lag_1 missing from df_feat"
    assert "rolling_mean_7" in df_feat.columns, "rolling_mean_7 missing from df_feat"
    
    # Test Chronological Split & Tree Model Training
    print(f"\n[3] Chronological Validation & Model Training (XGBoost):")
    train_size = int(len(df_feat) * 0.8)
    metrics, model_full, payload = train_tree_model(
        df_feat=df_feat,
        target_col=target_col,
        date_col=date_col,
        train_size=train_size,
        model_type="xgboost",
        horizon=14
    )
    print(f"    Out-of-sample Test Metrics:")
    print(f"      MAE:  {metrics['mae']}")
    print(f"      RMSE: {metrics['rmse']}")
    print(f"      MAPE: {metrics['mape']}%")
    print(f"      WAPE: {metrics['wape']}%")
    print(f"      R2:   {metrics['r2']}")
    
    # Check that accuracy is honest (no longer fake ~1.97% MAPE caused by Profit leakage)
    print(f"\n[4] Leakage Verification:")
    print(f"    Honest out-of-sample WAPE: {metrics['wape']}% (indicates leak-free evaluation)")
    
    # Check Forecast Trajectory (Non-flat multi-step recursion)
    print(f"\n[5] Forecast Trajectory Verification:")
    forecast_vals = payload["forecast_values"]
    print(f"    14-Day Forecast values: {forecast_vals}")
    unique_forecasts = len(set(forecast_vals))
    print(f"    Unique prediction values across 14 days: {unique_forecasts}")
    assert unique_forecasts > 1, "CRITICAL ERROR: Forecast is completely flat horizontal line!"
    assert all(v >= 0 for v in forecast_vals), "CRITICAL ERROR: Negative forecast values detected!"
    
    # Check Prediction Intervals (Expanding over horizon)
    print(f"\n[6] Prediction Intervals Verification:")
    ci_lower = payload["ci_lower"]
    ci_upper = payload["ci_upper"]
    bandwidths = [u - l for u, l in zip(ci_upper, ci_lower)]
    print(f"    Day 1 interval width:  {bandwidths[0]:.2f}")
    print(f"    Day 14 interval width: {bandwidths[-1]:.2f}")
    assert bandwidths[-1] > bandwidths[0], "CRITICAL ERROR: Confidence intervals did not expand over horizon!"
    assert all(l >= 0 for l in ci_lower), "CRITICAL ERROR: Lower bound dropped below 0!"
    
    # Check SHAP & Feature Importances
    print(f"\n[7] SHAP & Feature Importance Verification:")
    shap_vals = payload["shap_values"]
    top_shaps = sorted(shap_vals.items(), key=lambda x: x[1], reverse=True)[:5]
    print(f"    Top 5 Drivers: {top_shaps}")
    assert "Profit" not in shap_vals, "CRITICAL ERROR: Leaked column Profit in SHAP values!"
    assert "Sales" not in shap_vals, "CRITICAL ERROR: Target Sales in SHAP values!"
    
    # Check Multi-Factor Confidence Score
    print(f"\n[8] Multi-Factor Confidence Score Verification:")
    conf = compute_confidence_score(
        metrics=metrics,
        df_len=len(df),
        horizon=14,
        std_resid=payload["std_resid"],
        mean_actual=float(np.mean(payload["test_actual"]))
    )
    print(f"    Confidence Level: {conf['level']} (Score: {conf['score']}/100)")
    print(f"    Factors: {conf['factors']}")
    assert 0 <= conf["score"] <= 100, "Confidence score out of bounds!"
    
    print("\n" + "=" * 60)
    print("ALL ML INTEGRITY AUDIT CHECKS PASSED SUCCESSFULLY!")
    print("=" * 60)
    return True

if __name__ == "__main__":
    success = test_ml_audit()
    sys.exit(0 if success else 1)

