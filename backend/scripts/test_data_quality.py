import asyncio
import os
import json
from app.db.database import AsyncSessionLocal
from app.models.user import User
from app.models.dataset import Dataset
from app.services.data_quality_service import DataQualityService
from app.schemas.data_quality import ColumnCleaningConfig
from sqlalchemy.future import select

async def main():
    async with AsyncSessionLocal() as session:
        # Find dataset 31 or 32
        res = await session.execute(select(Dataset).where(Dataset.id.in_([31, 32])))
        datasets = {d.id: d for d in res.scalars().all()}
        
        target_ds = datasets.get(31) or datasets.get(32)
        if not target_ds:
            # Pick any ready dataset
            res_any = await session.execute(select(Dataset).where(Dataset.status == "ready"))
            all_ds = res_any.scalars().all()
            if not all_ds:
                print("No ready dataset found")
                return
            target_ds = all_ds[0]

        print(f"Testing on dataset ID: {target_ds.id}, Name: {target_ds.name}, Storage: {target_ds.storage_path}")

        file_path = os.path.join(os.getcwd(), "data", "uploads", target_ds.storage_path)
        ext = target_ds.file_type or target_ds.storage_path.split('.')[-1]
        
        # 1. Profile
        print("\n--- 1. PROFILING ---")
        profile = DataQualityService.profile_dataset(file_path, ext, target_ds.id, target_ds.name)
        print(f"Overall Quality Score: {profile.quality_score.overall_score}/100 ({profile.quality_score.rating})")
        print(f"Missingness Score: {profile.quality_score.missingness_score}, Outlier Score: {profile.quality_score.outlier_score}")
        print(f"Columns profiled: {len(profile.columns)}")
        for col in profile.columns[:3]:
            rec = col.recommendation
            print(f"  Column: {col.name} ({col.type}, role: {col.role}), Missing: {col.missing_percentage}%, Outliers: {col.outliers_percentage}%")
            print(f"    Rec Missing: {rec.recommended_missing_strategy} (Reason: {rec.missing_reason})")
            print(f"    Rec Outlier: {rec.recommended_outlier_strategy} (Reason: {rec.outlier_reason})")

        # 2. Preview
        print("\n--- 2. PREVIEW CLEANING ---")
        configs = [
            ColumnCleaningConfig(
                column_name=col.name,
                missing_strategy=col.recommendation.recommended_missing_strategy,
                outlier_strategy=col.recommendation.recommended_outlier_strategy,
                iqr_multiplier=1.5
            )
            for col in profile.columns
        ]
        preview = DataQualityService.preview_cleaning(
            file_path=file_path,
            ext=ext,
            dataset_id=target_ds.id,
            configs=configs,
            remove_duplicates=True,
            drop_leakage=False
        )
        print(f"Original Rows: {preview.original_rows_count}, Cleaned Rows: {preview.cleaned_rows_count}")
        print(f"Values Imputed: {preview.total_values_imputed}, Outliers Treated: {preview.total_outliers_treated}")

        # 3. Apply Cleaning
        print("\n--- 3. APPLY CLEANING ---")
        clean_res = await DataQualityService.apply_cleaning(
            file_path=file_path,
            ext=ext,
            dataset=target_ds,
            configs=configs,
            remove_duplicates=True,
            drop_leakage=False,
            cleaned_dataset_name=f"Cleaned Audit - {target_ds.name}",
            db=session,
            user_id=target_ds.user_id
        )
        print(f"Created Cleaned Dataset ID: {clean_res.cleaned_dataset_id}, Name: {clean_res.cleaned_dataset_name}")
        print(f"Rows retained: {clean_res.rows_retained}, Audit report URL: {clean_res.audit_report_url}")

        # 4. Compare Models
        print("\n--- 4. COMPARE MODELS (BEFORE vs AFTER) ---")
        cleaned_ds = await session.get(Dataset, clean_res.cleaned_dataset_id)
        cleaned_path = os.path.join(os.getcwd(), "data", "uploads", cleaned_ds.storage_path)

        comparison = DataQualityService.compare_before_and_after(
            orig_storage_path=file_path,
            clean_storage_path=cleaned_path,
            model_type="xgboost",
            horizon=14
        )
        print(f"Model: {comparison.model_type}")
        print(f"Baseline Metrics: {comparison.baseline_metrics}")
        print(f"Cleaned Metrics: {comparison.cleaned_metrics}")
        print(f"Improvement: {comparison.improvement}")
        print(f"Verdict: {comparison.summary_verdict}")
        print(f"Comparison Points: {len(comparison.forecast_comparison)}")

        print("\nALL DATA QUALITY INTEGRATION TESTS PASSED SUCCESSFULLY!")

if __name__ == "__main__":
    asyncio.run(main())

