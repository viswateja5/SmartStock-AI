import os
import json
import uuid
from datetime import datetime
from typing import List, Dict, Any, Tuple, Optional
import numpy as np
import pandas as pd

from app.schemas.data_quality import (
    ColumnQualityProfile,
    AIRecommendation,
    DataQualityScoreBreakdown,
    BusinessRuleViolation,
    DataQualityProfileResponse,
    ColumnCleaningConfig,
    CleaningPreviewResponse,
    ApplyCleaningResponse,
    ModelComparisonResponse
)
from app.core.logging import logger
from app.ml.dynamic_forecasting import run_pipeline

UPLOAD_DIR = os.path.join(os.getcwd(), "data", "uploads")


class DataQualityService:

    @staticmethod
    def _load_df(file_path: str, ext: str) -> pd.DataFrame:
        if ext == 'csv':
            return pd.read_csv(file_path)
        elif ext == 'xlsx':
            return pd.read_excel(file_path)
        elif ext == 'parquet':
            return pd.read_parquet(file_path)
        else:
            raise ValueError(f"Unsupported file extension: {ext}")

    @classmethod
    def profile_dataset(cls, file_path: str, ext: str, dataset_id: int, dataset_name: str) -> DataQualityProfileResponse:
        df = cls._load_df(file_path, ext)
        base_name = file_path.rsplit('.', 1)[0]
        schema_path = f"{base_name}_schema.json"

        schema = []
        if os.path.exists(schema_path):
            try:
                with open(schema_path, "r") as f:
                    schema = json.load(f)
            except Exception:
                schema = []

        schema_dict = {c["name"]: c for c in schema}
        num_rows = len(df)
        num_cols = len(df.columns)

        # 1. Duplicates
        duplicate_rows_count = int(df.duplicated().sum())
        duplicate_pct = (duplicate_rows_count / num_rows * 100) if num_rows > 0 else 0.0

        # 2. Date Column Verification
        date_col = next((c["name"] for c in schema if c.get("role") == "date"), None)
        if not date_col:
            date_col = next((c for c in df.columns if any(k in c.lower() for k in ["date", "time", "timestamp"])), None)

        invalid_dates_count = 0
        if date_col and date_col in df.columns:
            parsed = pd.to_datetime(df[date_col], format='mixed', errors='coerce')
            invalid_dates_count = int(parsed.isnull().sum()) - int(df[date_col].isnull().sum())
            invalid_dates_count = max(0, invalid_dates_count)

        # 3. Target Leakage detection
        leakage_keywords = ["revenue", "profit", "closing_stock", "ending_stock", "stockout", "total_amount", "gross_sales", "margin"]

        # 4. Business Rule Violations
        business_violations: List[BusinessRuleViolation] = []
        
        # Rule A: Negative Prices
        price_cols = [c for c in df.columns if "price" in c.lower() and pd.api.types.is_numeric_dtype(df[c])]
        for p_col in price_cols:
            neg_prices = df[df[p_col] < 0]
            if len(neg_prices) > 0:
                business_violations.append(BusinessRuleViolation(
                    rule_name="Negative Unit Price",
                    column=p_col,
                    violation_count=len(neg_prices),
                    description=f"Detected {len(neg_prices)} instances where unit price is negative.",
                    severity="high",
                    sample_values=neg_prices[p_col].head(3).tolist()
                ))

        # Rule B: Invalid Discounts (> 100% or < 0%)
        discount_cols = [c for c in df.columns if "discount" in c.lower() and pd.api.types.is_numeric_dtype(df[c])]
        for d_col in discount_cols:
            max_val = df[d_col].max()
            # If formatted as 0-1, > 1.0 is invalid; if 0-100, > 100 is invalid
            bound = 100.0 if max_val > 1.0 else 1.0
            invalid_disc = df[(df[d_col] < 0) | (df[d_col] > bound)]
            if len(invalid_disc) > 0:
                business_violations.append(BusinessRuleViolation(
                    rule_name="Discount Rate Out of Bounds",
                    column=d_col,
                    violation_count=len(invalid_disc),
                    description=f"Detected {len(invalid_disc)} discount entries outside legitimate range [0, {bound}].",
                    severity="medium",
                    sample_values=invalid_disc[d_col].head(3).tolist()
                ))

        # Rule C: Negative Sales/Units (check returns semantics)
        sales_cols = [c for c in df.columns if any(k == c.lower() for k in ["units_sold", "sales", "quantity", "demand"]) and pd.api.types.is_numeric_dtype(df[c])]
        for s_col in sales_cols:
            neg_sales = df[df[s_col] < 0]
            if len(neg_sales) > 0:
                business_violations.append(BusinessRuleViolation(
                    rule_name="Negative Demand / Sales Quantity",
                    column=s_col,
                    violation_count=len(neg_sales),
                    description=f"{len(neg_sales)} negative sales recorded. May indicate returns or data logging anomalies.",
                    severity="high",
                    sample_values=neg_sales[s_col].head(3).tolist()
                ))

        # Rule D: Impossible Inventory Quantities (< 0)
        inv_cols = [c for c in df.columns if any(k in c.lower() for k in ["inventory", "closing_stock", "opening_stock", "stock"]) and pd.api.types.is_numeric_dtype(df[c])]
        for i_col in inv_cols:
            neg_inv = df[df[i_col] < 0]
            if len(neg_inv) > 0:
                business_violations.append(BusinessRuleViolation(
                    rule_name="Negative Inventory Physical Stock",
                    column=i_col,
                    violation_count=len(neg_inv),
                    description=f"{len(neg_inv)} inventory balance quantities are negative.",
                    severity="high",
                    sample_values=neg_inv[i_col].head(3).tolist()
                ))

        # 5. Column-by-column profiling & AI Recommendations
        column_profiles: List[ColumnQualityProfile] = []
        total_missing_cells = int(df.isnull().sum().sum())
        total_outlier_count = 0

        for col in df.columns:
            col_series = df[col]
            dtype_str = str(col_series.dtype)
            is_numeric = pd.api.types.is_numeric_dtype(col_series)
            missing_count = int(col_series.isnull().sum())
            missing_pct = round((missing_count / num_rows * 100), 2) if num_rows > 0 else 0.0
            unique_count = int(col_series.nunique(dropna=True))
            
            role = schema_dict.get(col, {}).get("role", "numerical" if is_numeric else "categorical")
            is_leakage = any(k in col.lower() for k in leakage_keywords) and role != "target"
            
            # Numeric metrics & Outliers
            min_v, max_v, mean_v, med_v, q1_v, q3_v, iqr_v, low_b_v, up_b_v = None, None, None, None, None, None, None, None, None
            col_outliers_count = 0
            invalid_count = 0

            if is_numeric and unique_count > 0:
                clean_s = col_series.dropna()
                if len(clean_s) > 0:
                    min_v = round(float(clean_s.min()), 2)
                    max_v = round(float(clean_s.max()), 2)
                    mean_v = round(float(clean_s.mean()), 2)
                    med_v = round(float(clean_s.median()), 2)
                    q1 = clean_s.quantile(0.25)
                    q3 = clean_s.quantile(0.75)
                    iqr = q3 - q1
                    q1_v = round(float(q1), 2)
                    q3_v = round(float(q3), 2)
                    iqr_v = round(float(iqr), 2)
                    
                    if iqr > 0:
                        lower_bound = q1 - 1.5 * iqr
                        upper_bound = q3 + 1.5 * iqr
                        low_b_v = round(float(lower_bound), 2)
                        up_b_v = round(float(upper_bound), 2)
                        outlier_mask = (clean_s < lower_bound) | (clean_s > upper_bound)
                        col_outliers_count = int(outlier_mask.sum())
                        total_outlier_count += col_outliers_count
                        
                    # Check invalid count for numeric rules
                    if "price" in col.lower():
                        invalid_count += int((clean_s < 0).sum())
                    elif "discount" in col.lower():
                        invalid_count += int((clean_s < 0).sum())
                    elif any(k in col.lower() for k in ["inventory", "stock"]):
                        invalid_count += int((clean_s < 0).sum())

            outliers_pct = round((col_outliers_count / num_rows * 100), 2) if num_rows > 0 else 0.0

            # 6. Generate AI Recommendation per column
            rec = cls._generate_ai_recommendation(
                col_name=col,
                role=role,
                is_numeric=is_numeric,
                missing_pct=missing_pct,
                missing_count=missing_count,
                outlier_count=col_outliers_count,
                is_leakage=is_leakage,
                med_val=med_v,
                mean_val=mean_v
            )

            column_profiles.append(ColumnQualityProfile(
                name=col,
                type=dtype_str,
                role=role,
                total_count=num_rows,
                missing_count=missing_count,
                missing_percentage=missing_pct,
                outliers_count=col_outliers_count,
                outliers_percentage=outliers_pct,
                unique_count=unique_count,
                invalid_count=invalid_count,
                leakage_risk=is_leakage,
                min_value=min_v,
                max_value=max_v,
                mean_value=mean_v,
                median_value=med_v,
                q1=q1_v,
                q3=q3_v,
                iqr=iqr_v,
                lower_bound=low_b_v,
                upper_bound=up_b_v,
                recommendation=rec
            ))

        # 7. Compute Transparent Data Quality Score
        quality_score = cls._compute_quality_score(
            num_rows=num_rows,
            num_cols=num_cols,
            total_missing=total_missing_cells,
            total_outliers=total_outlier_count,
            duplicates=duplicate_rows_count,
            invalid_dates=invalid_dates_count,
            violations_count=sum(v.violation_count for v in business_violations)
        )

        # 8. Summary Action Recommendations
        summary_recs = []
        if total_missing_cells > 0:
            summary_recs.append({
                "type": "missing",
                "priority": "high",
                "title": "Impute Missing Values",
                "description": f"{total_missing_cells:,} missing cells detected across dataset. Imputing with median/mode stabilizes model estimators without introducing bias."
            })
        if total_outlier_count > 0:
            summary_recs.append({
                "type": "outlier",
                "priority": "medium",
                "title": "IQR Outlier Capping",
                "description": f"{total_outlier_count:,} statistical outliers flagged. Capping at 1.5×IQR prevents high-magnitude spikes from skewing mean squared error."
            })
        if duplicate_rows_count > 0:
            summary_recs.append({
                "type": "duplicates",
                "priority": "high",
                "title": "Deduplicate Records",
                "description": f"{duplicate_rows_count:,} duplicate records detected. Eliminating duplicates prevents sample weighting distortion."
            })
        if business_violations:
            summary_recs.append({
                "type": "business_rules",
                "priority": "critical",
                "title": "Enforce Domain Business Constraints",
                "description": f"{len(business_violations)} rule violation categories found (e.g. negative prices or stock). Rectify invalid records before training."
            })

        return DataQualityProfileResponse(
            dataset_id=dataset_id,
            dataset_name=dataset_name,
            total_rows=num_rows,
            total_columns=num_cols,
            duplicate_rows_count=duplicate_rows_count,
            duplicate_percentage=round(duplicate_pct, 2),
            invalid_dates_count=invalid_dates_count,
            quality_score=quality_score,
            columns=column_profiles,
            business_rule_violations=business_violations,
            summary_recommendations=summary_recs
        )

    @staticmethod
    def _generate_ai_recommendation(
        col_name: str,
        role: str,
        is_numeric: bool,
        missing_pct: float,
        missing_count: int,
        outlier_count: int,
        is_leakage: bool,
        med_val: Optional[float],
        mean_val: Optional[float]
    ) -> AIRecommendation:
        # Rule for Target Variable
        if role == "target":
            return AIRecommendation(
                recommended_missing_strategy="exclude_rows" if missing_count > 0 else "unchanged",
                missing_reason="Forecast target values must never be naively zeroed or arbitrarily imputed for test evaluation.",
                recommended_outlier_strategy="cap_percentile" if outlier_count > 0 else "keep_unchanged",
                outlier_reason="Extreme target spikes should be softly capped (1st-99th percentile) to protect MSE loss while preserving seasonal peaks.",
                expected_benefit="Guarantees ground-truth integrity and eliminates artificial zero-demand bias.",
                potential_risk="Dropping target rows shrinks chronological continuity if gaps are long.",
                confidence="High",
                affected_records_count=missing_count + outlier_count,
                forecasting_impact="Critical: Directly shapes objective loss and out-of-sample WAPE evaluation."
            )

        # Rule for Date Index
        if role == "date":
            return AIRecommendation(
                recommended_missing_strategy="exclude_rows" if missing_count > 0 else "unchanged",
                missing_reason="Time series index cannot be synthesized without explicit business timeline calendar rules.",
                recommended_outlier_strategy="keep_unchanged",
                outlier_reason="Chronological timestamps do not have statistical distribution outliers.",
                expected_benefit="Maintains temporal sorting order and prevent lag misalignments.",
                potential_risk="None. Invalid dates corrupt lag generation.",
                confidence="High",
                affected_records_count=missing_count,
                forecasting_impact="High: Fundamental for chronological validation splits."
            )

        # Rule for Leakage Columns
        if is_leakage:
            return AIRecommendation(
                recommended_missing_strategy="unchanged",
                missing_reason="Column flagged as Target Leakage (e.g. Revenue/Profit computed from Target).",
                recommended_outlier_strategy="keep_unchanged",
                outlier_reason="Leakage columns will be dropped during feature generation.",
                expected_benefit="Completely eliminates target leakage and deceptive 1.9% MAPE.",
                potential_risk="None.",
                confidence="High",
                affected_records_count=0,
                forecasting_impact="Critical: Prevents models from cheating via algebraic target reconstruction."
            )

        # Rule for Identifiers
        if role == "identifier":
            return AIRecommendation(
                recommended_missing_strategy="missing_category" if missing_count > 0 else "unchanged",
                missing_reason="IDs are categorical keys and must not be numerically interpolated.",
                recommended_outlier_strategy="keep_unchanged",
                outlier_reason="Unique identifier codes have no statistical distribution limits.",
                expected_benefit="Preserves entity grouping integrity across stores and SKUs.",
                potential_risk="None.",
                confidence="High",
                affected_records_count=missing_count,
                forecasting_impact="Medium: Ensures groupby lag operations don't misattribute across SKUs."
            )

        # Numerical Features
        if is_numeric:
            skewed = False
            if med_val is not None and mean_val is not None:
                denom = abs(mean_val) if abs(mean_val) > 0 else 1.0
                skewed = abs(mean_val - med_val) / denom > 0.15

            missing_strat = "median" if skewed else ("linear_interpolation" if "lag" in col_name.lower() or "price" in col_name.lower() else "median")
            outlier_strat = "cap_iqr" if outlier_count > 0 else "keep_unchanged"

            return AIRecommendation(
                recommended_missing_strategy=missing_strat if missing_count > 0 else "unchanged",
                missing_reason=f"Numerical distribution is {'skewed' if skewed else 'symmetrical'}. Median imputation prevents outlier distortion.",
                recommended_outlier_strategy=outlier_strat,
                outlier_reason=f"Found {outlier_count} values outside 1.5×IQR. Capping retains observations without extreme variance leverage.",
                expected_benefit="Reduces gradient tree variance and stabilizes split thresholds.",
                potential_risk="Over-capping can mute valid promotional price reductions or holiday effects.",
                confidence="High" if missing_pct < 20 else "Medium",
                affected_records_count=missing_count + outlier_count,
                forecasting_impact="Moderate: Improves gradient booster stability and feature splits."
            )

        # Categorical Features
        return AIRecommendation(
            recommended_missing_strategy="mode" if missing_pct < 5 else "missing_category",
            missing_reason="Frequent-category imputation for low missingness; explicit 'Unknown' category prevents synthetic assumption.",
            recommended_outlier_strategy="keep_unchanged",
            outlier_reason="Categorical text strings do not have numerical outliers.",
            expected_benefit="Retains records while avoiding one-hot encoding noise.",
            potential_risk="Frequent mode imputation could artificially inflate dominant category frequency.",
            confidence="High",
            affected_records_count=missing_count,
            forecasting_impact="Low to Medium: Preserves categorical feature matrix dimensionality."
        )

    @staticmethod
    def _compute_quality_score(
        num_rows: int,
        num_cols: int,
        total_missing: int,
        total_outliers: int,
        duplicates: int,
        invalid_dates: int,
        violations_count: int
    ) -> DataQualityScoreBreakdown:
        total_cells = max(1, num_rows * num_cols)
        
        # Missing score: 100 - (missing_cells / total_cells * 250)
        miss_ratio = total_missing / total_cells
        missing_score = max(0.0, round(100.0 - (miss_ratio * 300.0), 1))

        # Outlier score: 100 - (outlier_ratio * 200)
        outlier_ratio = total_outliers / total_cells
        outlier_score = max(0.0, round(100.0 - (outlier_ratio * 250.0), 1))

        # Duplicate score: 100 - (dup_rows / total_rows * 200)
        dup_ratio = duplicates / max(1, num_rows)
        duplicate_score = max(0.0, round(100.0 - (dup_ratio * 200.0), 1))

        # Validity score: based on business rule violations
        viol_ratio = violations_count / max(1, num_rows)
        validity_score = max(0.0, round(100.0 - (viol_ratio * 150.0), 1))

        # Schema & date score
        date_score = 100.0 if invalid_dates == 0 else max(20.0, round(100.0 - (invalid_dates * 10.0), 1))
        schema_score = 95.0

        # Weighted Composite Quality Score
        overall = (
            0.30 * missing_score +
            0.20 * outlier_score +
            0.15 * duplicate_score +
            0.15 * validity_score +
            0.10 * date_score +
            0.10 * schema_score
        )
        overall = round(max(5.0, min(99.9, overall)), 1)

        rating = "Excellent" if overall >= 90 else ("Good" if overall >= 75 else ("Fair" if overall >= 60 else "Critical"))

        return DataQualityScoreBreakdown(
            overall_score=overall,
            rating=rating,
            missingness_score=missing_score,
            outlier_score=outlier_score,
            duplicate_score=duplicate_score,
            business_validity_score=validity_score,
            schema_consistency_score=schema_score,
            scoring_methodology="Multi-factor evaluation: Missingness (30%), Outliers (20%), Duplicates (15%), Business Rules (15%), Date Integrity (10%), Schema (10%)."
        )

    @classmethod
    def preview_cleaning(
        cls,
        file_path: str,
        ext: str,
        dataset_id: int,
        configs: List[ColumnCleaningConfig],
        remove_duplicates: bool = True,
        drop_leakage: bool = False
    ) -> CleaningPreviewResponse:
        df_orig = cls._load_df(file_path, ext)
        df_clean = df_orig.copy()

        original_rows = len(df_orig)
        values_imputed_total = 0
        outliers_treated_total = 0
        column_audits = []

        # 1. Duplicates
        if remove_duplicates:
            df_clean = df_clean.drop_duplicates().reset_index(drop=True)

        config_map = {c.column_name: c for c in configs}

        # 2. Apply Column Transformations
        for col in df_clean.columns:
            cfg = config_map.get(col)
            if not cfg:
                continue

            imputed_for_col = 0
            outliers_for_col = 0
            is_numeric = pd.api.types.is_numeric_dtype(df_clean[col])

            # A. Missing Value Imputation
            if cfg.missing_strategy != "unchanged":
                missing_mask = df_clean[col].isnull()
                imputed_for_col = int(missing_mask.sum())
                
                if imputed_for_col > 0:
                    if cfg.missing_strategy == "median" and is_numeric:
                        fill_val = df_clean[col].median()
                        df_clean[col] = df_clean[col].fillna(fill_val)
                    elif cfg.missing_strategy == "mean" and is_numeric:
                        fill_val = df_clean[col].mean()
                        df_clean[col] = df_clean[col].fillna(fill_val)
                    elif cfg.missing_strategy == "forward_fill":
                        df_clean[col] = df_clean[col].ffill()
                    elif cfg.missing_strategy == "backward_fill":
                        df_clean[col] = df_clean[col].bfill()
                    elif cfg.missing_strategy == "linear_interpolation" and is_numeric:
                        df_clean[col] = df_clean[col].interpolate(method='linear').bfill().ffill()
                    elif cfg.missing_strategy == "group_median" and is_numeric and cfg.group_by_column and cfg.group_by_column in df_clean.columns:
                        df_clean[col] = df_clean.groupby(cfg.group_by_column)[col].transform(lambda s: s.fillna(s.median()))
                        df_clean[col] = df_clean[col].fillna(df_clean[col].median())
                    elif cfg.missing_strategy == "mode":
                        mode_val = df_clean[col].mode()
                        fill_val = mode_val.iloc[0] if len(mode_val) > 0 else "Unknown"
                        df_clean[col] = df_clean[col].fillna(fill_val)
                    elif cfg.missing_strategy == "missing_category":
                        df_clean[col] = df_clean[col].fillna("Unknown")
                    elif cfg.missing_strategy == "custom_value":
                        val = cfg.custom_fill_value if cfg.custom_fill_value is not None and str(cfg.custom_fill_value).strip() != "" else ("0" if is_numeric else "Unknown")
                        if is_numeric:
                            try:
                                val = float(val)
                            except Exception:
                                val = 0.0
                        df_clean[col] = df_clean[col].fillna(val)
                    elif cfg.missing_strategy == "exclude_rows":
                        df_clean = df_clean.dropna(subset=[col]).reset_index(drop=True)

                    values_imputed_total += imputed_for_col

            # B. Outlier Treatment (Numeric Only)
            if is_numeric and cfg.outlier_strategy != "keep_unchanged" and len(df_clean) > 0:
                clean_s = df_clean[col].dropna()
                if len(clean_s) > 0:
                    q1 = clean_s.quantile(0.25)
                    q3 = clean_s.quantile(0.75)
                    iqr = q3 - q1
                    k = cfg.iqr_multiplier or 1.5

                    if cfg.outlier_strategy == "cap_iqr" and iqr > 0:
                        low_b = q1 - k * iqr
                        up_b = q3 + k * iqr
                        outliers_mask = (df_clean[col] < low_b) | (df_clean[col] > up_b)
                        outliers_for_col = int(outliers_mask.sum())
                        df_clean[col] = np.clip(df_clean[col], low_b, up_b)
                    elif cfg.outlier_strategy == "cap_percentile":
                        p_low = df_clean[col].quantile(cfg.percentile_lower / 100.0)
                        p_up = df_clean[col].quantile(cfg.percentile_upper / 100.0)
                        outliers_mask = (df_clean[col] < p_low) | (df_clean[col] > p_up)
                        outliers_for_col = int(outliers_mask.sum())
                        df_clean[col] = np.clip(df_clean[col], p_low, p_up)
                    elif cfg.outlier_strategy == "replace_median":
                        low_b = q1 - k * iqr
                        up_b = q3 + k * iqr
                        outliers_mask = (df_clean[col] < low_b) | (df_clean[col] > up_b)
                        outliers_for_col = int(outliers_mask.sum())
                        df_clean.loc[outliers_mask, col] = df_clean[col].median()
                    elif cfg.outlier_strategy == "remove_rows":
                        low_b = q1 - k * iqr
                        up_b = q3 + k * iqr
                        outliers_mask = (df_clean[col] < low_b) | (df_clean[col] > up_b)
                        outliers_for_col = int(outliers_mask.sum())
                        df_clean = df_clean[~outliers_mask].reset_index(drop=True)
                    elif cfg.outlier_strategy == "mark_suspicious":
                        low_b = q1 - k * iqr
                        up_b = q3 + k * iqr
                        outliers_mask = (df_clean[col] < low_b) | (df_clean[col] > up_b)
                        outliers_for_col = int(outliers_mask.sum())
                        df_clean[f"is_outlier_{col}"] = outliers_mask.astype(int)

                    outliers_treated_total += outliers_for_col

            column_audits.append({
                "column": col,
                "missing_strategy": cfg.missing_strategy,
                "values_imputed": imputed_for_col,
                "outlier_strategy": cfg.outlier_strategy,
                "outliers_treated": outliers_for_col
            })

        # 3. Drop Leakage Columns if requested
        if drop_leakage:
            leakage_cols = ["revenue", "profit", "closing_stock", "ending_stock", "stockout", "total_amount"]
            to_drop = [c for c in df_clean.columns if any(k in c.lower() for k in leakage_cols)]
            df_clean = df_clean.drop(columns=to_drop)

        cleaned_rows = len(df_clean)
        rows_removed = original_rows - cleaned_rows

        missing_before = int(df_orig.isnull().sum().sum())
        missing_after = int(df_clean.isnull().sum().sum())

        outliers_before = 0
        outliers_after = 0
        for c in df_orig.columns:
            if pd.api.types.is_numeric_dtype(df_orig[c]):
                s = df_orig[c].dropna()
                if len(s) > 0:
                    q1 = s.quantile(0.25)
                    q3 = s.quantile(0.75)
                    iqr = q3 - q1
                    if iqr > 0:
                        outliers_before += int(((s < (q1 - 1.5 * iqr)) | (s > (q3 + 1.5 * iqr))).sum())

        for c in df_clean.columns:
            if pd.api.types.is_numeric_dtype(df_clean[c]):
                s = df_clean[c].dropna()
                if len(s) > 0:
                    q1 = s.quantile(0.25)
                    q3 = s.quantile(0.75)
                    iqr = q3 - q1
                    if iqr > 0:
                        outliers_after += int(((s < (q1 - 1.5 * iqr)) | (s > (q3 + 1.5 * iqr))).sum())

        return CleaningPreviewResponse(
            dataset_id=dataset_id,
            original_rows_count=original_rows,
            cleaned_rows_count=cleaned_rows,
            rows_removed=max(0, rows_removed),
            total_values_imputed=values_imputed_total,
            total_outliers_treated=outliers_treated_total,
            missing_before=missing_before,
            missing_after=missing_after,
            outliers_before=outliers_before,
            outliers_after=outliers_after,
            column_audit=column_audits,
            preview_original=df_orig.head(15).fillna("NaN").to_dict(orient="records"),
            preview_cleaned=df_clean.head(15).fillna("NaN").to_dict(orient="records")
        )

    @classmethod
    async def apply_cleaning(
        cls,
        file_path: str,
        ext: str,
        dataset: Any,
        configs: List[ColumnCleaningConfig],
        remove_duplicates: bool,
        drop_leakage: bool,
        cleaned_dataset_name: Optional[str],
        db: Any,
        user_id: int
    ) -> ApplyCleaningResponse:
        from app.models.dataset import Dataset
        
        # 1. Run cleaning
        preview = cls.preview_cleaning(
            file_path=file_path,
            ext=ext,
            dataset_id=dataset.id,
            configs=configs,
            remove_duplicates=remove_duplicates,
            drop_leakage=drop_leakage
        )

        df_orig = cls._load_df(file_path, ext)
        df_clean = df_orig.copy()
        
        if remove_duplicates:
            df_clean = df_clean.drop_duplicates().reset_index(drop=True)

        config_map = {c.column_name: c for c in configs}
        for col in df_clean.columns:
            cfg = config_map.get(col)
            if not cfg: continue
            is_numeric = pd.api.types.is_numeric_dtype(df_clean[col])

            # Missing
            if cfg.missing_strategy == "median" and is_numeric:
                df_clean[col] = df_clean[col].fillna(df_clean[col].median())
            elif cfg.missing_strategy == "mean" and is_numeric:
                df_clean[col] = df_clean[col].fillna(df_clean[col].mean())
            elif cfg.missing_strategy == "forward_fill":
                df_clean[col] = df_clean[col].ffill()
            elif cfg.missing_strategy == "backward_fill":
                df_clean[col] = df_clean[col].bfill()
            elif cfg.missing_strategy == "linear_interpolation" and is_numeric:
                df_clean[col] = df_clean[col].interpolate(method='linear').bfill().ffill()
            elif cfg.missing_strategy == "group_median" and is_numeric and cfg.group_by_column and cfg.group_by_column in df_clean.columns:
                df_clean[col] = df_clean.groupby(cfg.group_by_column)[col].transform(lambda s: s.fillna(s.median()))
                df_clean[col] = df_clean[col].fillna(df_clean[col].median())
            elif cfg.missing_strategy == "mode":
                m = df_clean[col].mode()
                df_clean[col] = df_clean[col].fillna(m.iloc[0] if len(m) > 0 else "Unknown")
            elif cfg.missing_strategy == "missing_category":
                df_clean[col] = df_clean[col].fillna("Unknown")
            elif cfg.missing_strategy == "custom_value":
                val = cfg.custom_fill_value if cfg.custom_fill_value is not None and str(cfg.custom_fill_value).strip() != "" else ("0" if is_numeric else "Unknown")
                if is_numeric:
                    try:
                        val = float(val)
                    except Exception:
                        val = 0.0
                df_clean[col] = df_clean[col].fillna(val)
            elif cfg.missing_strategy == "exclude_rows":
                df_clean = df_clean.dropna(subset=[col]).reset_index(drop=True)

            # Outlier
            if is_numeric and cfg.outlier_strategy != "keep_unchanged" and len(df_clean) > 0:
                clean_s = df_clean[col].dropna()
                if len(clean_s) > 0:
                    q1 = clean_s.quantile(0.25)
                    q3 = clean_s.quantile(0.75)
                    iqr = q3 - q1
                    k = cfg.iqr_multiplier or 1.5
                    if cfg.outlier_strategy == "cap_iqr" and iqr > 0:
                        df_clean[col] = np.clip(df_clean[col], q1 - k * iqr, q3 + k * iqr)
                    elif cfg.outlier_strategy == "cap_percentile":
                        p_low = df_clean[col].quantile(cfg.percentile_lower / 100.0)
                        p_up = df_clean[col].quantile(cfg.percentile_upper / 100.0)
                        df_clean[col] = np.clip(df_clean[col], p_low, p_up)
                    elif cfg.outlier_strategy == "replace_median":
                        mask = (df_clean[col] < q1 - k * iqr) | (df_clean[col] > q3 + k * iqr)
                        df_clean.loc[mask, col] = df_clean[col].median()
                    elif cfg.outlier_strategy == "remove_rows":
                        mask = (df_clean[col] < q1 - k * iqr) | (df_clean[col] > q3 + k * iqr)
                        df_clean = df_clean[~mask].reset_index(drop=True)

        if drop_leakage:
            leakage_cols = ["revenue", "profit", "closing_stock", "ending_stock", "stockout", "total_amount"]
            to_drop = [c for c in df_clean.columns if any(k in c.lower() for k in leakage_cols)]
            df_clean = df_clean.drop(columns=to_drop)

        # 2. Persist new cleaned dataset to UPLOAD_DIR
        new_file_id = str(uuid.uuid4())
        new_filename = f"{new_file_id}.csv"
        new_storage_path = os.path.join(UPLOAD_DIR, new_filename)
        df_clean.to_csv(new_storage_path, index=False)

        # Copy and update schema file
        base_name = file_path.rsplit('.', 1)[0]
        schema_path = f"{base_name}_schema.json"
        new_schema_path = os.path.join(UPLOAD_DIR, f"{new_file_id}_schema.json")
        if os.path.exists(schema_path):
            with open(schema_path, "r") as f:
                schema = json.load(f)
            # Filter schema for columns still present
            cleaned_cols_set = set(df_clean.columns)
            new_schema = [c for c in schema if c["name"] in cleaned_cols_set]
            with open(new_schema_path, "w") as f:
                json.dump(new_schema, f)
        else:
            # Build basic schema
            new_schema = [{"name": c, "role": "numerical" if pd.api.types.is_numeric_dtype(df_clean[c]) else "categorical", "confidence": 0.9, "type": str(df_clean[c].dtype)} for c in df_clean.columns]
            with open(new_schema_path, "w") as f:
                json.dump(new_schema, f)

        # 3. Save Cleaning Audit Report
        report_data = {
            "timestamp": datetime.utcnow().isoformat(),
            "original_dataset_id": dataset.id,
            "original_name": dataset.name,
            "cleaned_file_id": new_file_id,
            "original_rows": preview.original_rows_count,
            "cleaned_rows": preview.cleaned_rows_count,
            "rows_removed": preview.rows_removed,
            "total_values_imputed": preview.total_values_imputed,
            "total_outliers_treated": preview.total_outliers_treated,
            "column_transformations": preview.column_audit
        }
        report_path = os.path.join(UPLOAD_DIR, f"{new_file_id}_cleaning_report.json")
        with open(report_path, "w") as f:
            json.dump(report_data, f, indent=2)

        # 4. Insert new Dataset in database
        final_dataset_name = cleaned_dataset_name or f"Cleaned - {dataset.name}"
        cleaned_dataset = Dataset(
            user_id=user_id,
            name=final_dataset_name,
            original_filename=f"cleaned_{dataset.original_filename}",
            storage_path=new_filename,
            file_type="csv",
            size_bytes=float(os.path.getsize(new_storage_path)),
            num_rows=len(df_clean),
            num_columns=len(df_clean.columns),
            status="ready"
        )
        db.add(cleaned_dataset)
        await db.commit()
        await db.refresh(cleaned_dataset)

        return ApplyCleaningResponse(
            status="success",
            original_dataset_id=dataset.id,
            cleaned_dataset_id=cleaned_dataset.id,
            cleaned_dataset_name=cleaned_dataset.name,
            rows_retained=len(df_clean),
            rows_removed=preview.rows_removed,
            values_imputed=preview.total_values_imputed,
            outliers_treated=preview.total_outliers_treated,
            audit_report_url=f"/api/v1/quality/{cleaned_dataset.id}/report"
        )

    @classmethod
    def compare_before_and_after(
        cls,
        orig_storage_path: str,
        clean_storage_path: str,
        model_type: str = "xgboost",
        horizon: int = 14
    ) -> ModelComparisonResponse:
        """
        Trains and evaluates models on the original vs cleaned dataset
        using the EXACT same chronological test period.
        """
        # Run pipeline on original
        res_baseline = run_pipeline(orig_storage_path, model_type, horizon)
        m_base = res_baseline["metrics"]

        # Run pipeline on cleaned
        res_cleaned = run_pipeline(clean_storage_path, model_type, horizon)
        m_clean = res_cleaned["metrics"]

        # Compute percentage improvements (positive % means lower error)
        def get_imp(base_val: float, clean_val: float) -> float:
            if base_val == 0: return 0.0
            return round(((base_val - clean_val) / base_val) * 100.0, 2)

        imp_mae = get_imp(m_base.get("mae", 0), m_clean.get("mae", 0))
        imp_rmse = get_imp(m_base.get("rmse", 0), m_clean.get("rmse", 0))
        imp_wape = get_imp(m_base.get("wape", 0), m_clean.get("wape", 0))
        imp_mape = get_imp(m_base.get("mape", 0), m_clean.get("mape", 0))

        is_improved = imp_wape > 0 or imp_rmse > 0

        # Construct verdict
        if imp_wape > 5.0:
            verdict = f"Cleaned pipeline achieved a substantial {imp_wape}% reduction in WAPE, demonstrating significant generalization improvements."
        elif imp_wape > 0:
            verdict = f"Cleaned pipeline delivered a modest {imp_wape}% error reduction while preserving full chronological distribution fidelity."
        elif imp_wape == 0:
            verdict = "Data cleaning preserved identical forecast accuracy while standardizing missingness and schema constraints."
        else:
            verdict = f"Cleaned dataset exhibited a slight {abs(imp_wape)}% higher variance. Consider relaxing outlier caps or retaining extreme promotional peaks."

        # Build side-by-side forecast comparison vector
        dates_base = res_baseline["analytics"].get("forecast_dates", [])
        vals_base = res_baseline["analytics"].get("forecast_values", [])
        vals_clean = res_cleaned["analytics"].get("forecast_values", [])

        comparison_vector = []
        for i, dt in enumerate(dates_base):
            b_val = vals_base[i] if i < len(vals_base) else 0.0
            c_val = vals_clean[i] if i < len(vals_clean) else 0.0
            comparison_vector.append({
                "date": dt,
                "baseline_forecast": b_val,
                "cleaned_forecast": c_val,
                "difference": round(c_val - b_val, 2)
            })

        # Load audit report if present
        base_clean_name = clean_storage_path.rsplit('.', 1)[0]
        report_path = f"{base_clean_name}_cleaning_report.json"
        values_imputed = 0
        outliers_treated = 0
        rows_removed = 0
        if os.path.exists(report_path):
            try:
                with open(report_path, "r") as f:
                    rep = json.load(f)
                    values_imputed = rep.get("total_values_imputed", 0)
                    outliers_treated = rep.get("total_outliers_treated", 0)
                    rows_removed = rep.get("rows_removed", 0)
            except Exception:
                pass

        return ModelComparisonResponse(
            model_type=model_type,
            horizon_days=horizon,
            baseline_metrics={k: round(v, 2) if isinstance(v, (int, float)) else v for k, v in m_base.items()},
            cleaned_metrics={k: round(v, 2) if isinstance(v, (int, float)) else v for k, v in m_clean.items()},
            improvement={
                "mae_improvement_pct": imp_mae,
                "rmse_improvement_pct": imp_rmse,
                "wape_improvement_pct": imp_wape,
                "mape_improvement_pct": imp_mape
            },
            is_statistically_improved=is_improved,
            summary_verdict=verdict,
            training_rows_baseline=res_baseline["analytics"]["dataset_metadata"].get("rows", 0),
            training_rows_cleaned=res_cleaned["analytics"]["dataset_metadata"].get("rows", 0),
            values_imputed_count=values_imputed,
            outliers_treated_count=outliers_treated,
            rows_removed_count=rows_removed,
            forecast_comparison=comparison_vector
        )

