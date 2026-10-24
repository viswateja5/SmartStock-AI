from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field


class AIRecommendation(BaseModel):
    recommended_missing_strategy: str
    missing_reason: str
    recommended_outlier_strategy: str
    outlier_reason: str
    expected_benefit: str
    potential_risk: str
    confidence: str # High, Medium, Low
    affected_records_count: int
    forecasting_impact: str


class ColumnQualityProfile(BaseModel):
    name: str
    type: str
    role: str
    total_count: int
    missing_count: int
    missing_percentage: float
    outliers_count: int
    outliers_percentage: float
    unique_count: int
    invalid_count: int
    leakage_risk: bool
    min_value: Optional[float] = None
    max_value: Optional[float] = None
    mean_value: Optional[float] = None
    median_value: Optional[float] = None
    q1: Optional[float] = None
    q3: Optional[float] = None
    iqr: Optional[float] = None
    lower_bound: Optional[float] = None
    upper_bound: Optional[float] = None
    recommendation: AIRecommendation


class DataQualityScoreBreakdown(BaseModel):
    overall_score: float
    rating: str # Excellent, Good, Fair, Critical
    missingness_score: float
    outlier_score: float
    duplicate_score: float
    business_validity_score: float
    schema_consistency_score: float
    scoring_methodology: str


class BusinessRuleViolation(BaseModel):
    rule_name: str
    column: str
    violation_count: int
    description: str
    severity: str # high, medium, low
    sample_values: List[Any] = []


class DataQualityProfileResponse(BaseModel):
    dataset_id: int
    dataset_name: str
    total_rows: int
    total_columns: int
    duplicate_rows_count: int
    duplicate_percentage: float
    invalid_dates_count: int
    quality_score: DataQualityScoreBreakdown
    columns: List[ColumnQualityProfile]
    business_rule_violations: List[BusinessRuleViolation]
    summary_recommendations: List[Dict[str, Any]]


class ColumnCleaningConfig(BaseModel):
    column_name: str
    missing_strategy: str = "unchanged" # unchanged, median, mean, forward_fill, backward_fill, linear_interpolation, group_median, mode, missing_category, custom_value, exclude_rows
    custom_fill_value: Optional[str] = None
    outlier_strategy: str = "keep_unchanged" # keep_unchanged, cap_iqr, cap_percentile, replace_median, interpolate_past, remove_rows, mark_suspicious
    iqr_multiplier: float = 1.5
    percentile_lower: float = 1.0
    percentile_upper: float = 99.0
    group_by_column: Optional[str] = None


class CleaningPreviewRequest(BaseModel):
    columns: List[ColumnCleaningConfig]
    remove_duplicates: bool = True
    drop_leakage_columns: bool = False


class CleaningPreviewResponse(BaseModel):
    dataset_id: int
    original_rows_count: int
    cleaned_rows_count: int
    rows_removed: int
    total_values_imputed: int
    total_outliers_treated: int
    missing_before: int = 0
    missing_after: int = 0
    outliers_before: int = 0
    outliers_after: int = 0
    column_audit: List[Dict[str, Any]]
    preview_original: List[Dict[str, Any]]
    preview_cleaned: List[Dict[str, Any]]


class ApplyCleaningRequest(BaseModel):
    columns: List[ColumnCleaningConfig]
    remove_duplicates: bool = True
    drop_leakage_columns: bool = False
    cleaned_dataset_name: Optional[str] = None


class ApplyCleaningResponse(BaseModel):
    status: str
    original_dataset_id: int
    cleaned_dataset_id: int
    cleaned_dataset_name: str
    rows_retained: int
    rows_removed: int
    values_imputed: int
    outliers_treated: int
    audit_report_url: str


class ModelComparisonRequest(BaseModel):
    model_config = {"protected_namespaces": ()}
    original_dataset_id: int
    cleaned_dataset_id: int
    model_type: str = "xgboost" # xgboost, lightgbm, random_forest, prophet, moving_average
    horizon: int = 14


class ModelComparisonResponse(BaseModel):
    model_config = {"protected_namespaces": ()}
    model_type: str
    horizon_days: int
    baseline_metrics: Dict[str, float]
    cleaned_metrics: Dict[str, float]
    improvement: Dict[str, float] # percentage improvement in MAE, RMSE, WAPE, MAPE
    is_statistically_improved: bool
    summary_verdict: str
    training_rows_baseline: int
    training_rows_cleaned: int
    values_imputed_count: int
    outliers_treated_count: int
    rows_removed_count: int
    forecast_comparison: List[Dict[str, Any]] # date, actual, baseline_pred, cleaned_pred
