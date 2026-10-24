import os
import json
import logging
import traceback
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.db.database import get_db
from app.models.user import User
from app.models.dataset import Dataset
from app.api.deps import get_current_user
from app.schemas.data_quality import (
    DataQualityProfileResponse,
    CleaningPreviewRequest,
    CleaningPreviewResponse,
    ApplyCleaningRequest,
    ApplyCleaningResponse,
    ModelComparisonRequest,
    ModelComparisonResponse,
)
from app.services.data_quality_service import DataQualityService

logger = logging.getLogger(__name__)

router = APIRouter()

# Resolve UPLOAD_DIR
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
UPLOAD_DIR = os.path.join(BASE_DIR, "data", "uploads")
if not os.path.exists(UPLOAD_DIR):
    os.makedirs(UPLOAD_DIR, exist_ok=True)


def _get_dataset_file_path(dataset: Dataset) -> tuple[str, str]:
    """Helper to locate dataset file on disk."""
    file_path = os.path.join(UPLOAD_DIR, dataset.storage_path)
    if not os.path.exists(file_path):
        # Fallback check relative to cwd
        alt_path = os.path.join(os.getcwd(), "data", "uploads", dataset.storage_path)
        if os.path.exists(alt_path):
            file_path = alt_path
        else:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Dataset file '{dataset.storage_path}' not found on storage disk."
            )
    ext = dataset.file_type or dataset.storage_path.split('.')[-1].lower()
    return file_path, ext


@router.get("/ping")
async def ping():
    return {"status": "ok", "service": "data_quality"}


@router.get("/list-datasets")
async def list_available_datasets(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Returns list of user datasets with basic stats for the quality workflow."""
    result = await db.execute(
        select(Dataset).where(Dataset.user_id == current_user.id).order_by(Dataset.created_at.desc())
    )
    datasets = result.scalars().all()
    return [
        {
            "id": d.id,
            "name": d.name,
            "original_filename": d.original_filename,
            "storage_path": d.storage_path,
            "file_type": d.file_type,
            "num_rows": d.num_rows,
            "num_columns": d.num_columns,
            "status": d.status,
            "created_at": d.created_at.isoformat() if d.created_at else None
        }
        for d in datasets
    ]


@router.get("/{dataset_id}/profile", response_model=DataQualityProfileResponse)
@router.get("/profile/{dataset_id}", response_model=DataQualityProfileResponse)
async def get_data_quality_profile(
    dataset_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Computes a comprehensive Data Quality & Health audit on the specified dataset:
    - Missingness distributions & group-level analysis
    - Multi-method outlier detection (IQR, Z-score, MAD)
    - Domain business rule validations
    - Target leakage risk identification
    - Transparent multi-factor Data Quality Score (0-100)
    - AI-powered column-by-column cleaning recommendations
    """
    dataset = await db.get(Dataset, dataset_id)
    if not dataset or dataset.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset not found or access denied")
    
    file_path, ext = _get_dataset_file_path(dataset)
    try:
        profile = DataQualityService.profile_dataset(
            file_path=file_path,
            ext=ext,
            dataset_id=dataset.id,
            dataset_name=dataset.name
        )
        return profile
    except Exception as e:
        logger.error(f"Data quality profiling failed: {traceback.format_exc()}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Profiling failed: {str(e)}"
        )


@router.post("/{dataset_id}/preview", response_model=CleaningPreviewResponse)
@router.post("/preview/{dataset_id}", response_model=CleaningPreviewResponse)
async def preview_data_cleaning(
    dataset_id: int,
    request: CleaningPreviewRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Runs an in-memory dry-run of the proposed cleaning plan:
    - Simulates imputations and outlier transformations
    - Tracks cell-by-cell modifications and row removals
    - Returns side-by-side original vs cleaned preview diffs
    - Does NOT mutate or touch the original dataset
    """
    dataset = await db.get(Dataset, dataset_id)
    if not dataset or dataset.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset not found or access denied")

    file_path, ext = _get_dataset_file_path(dataset)
    try:
        preview = DataQualityService.preview_cleaning(
            file_path=file_path,
            ext=ext,
            dataset_id=dataset.id,
            configs=request.columns,
            remove_duplicates=request.remove_duplicates,
            drop_leakage=request.drop_leakage_columns
        )
        return preview
    except Exception as e:
        logger.error(f"Data cleaning preview failed: {traceback.format_exc()}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Preview failed: {str(e)}"
        )


@router.post("/{dataset_id}/apply", response_model=ApplyCleaningResponse)
@router.post("/apply/{dataset_id}", response_model=ApplyCleaningResponse)
async def apply_data_cleaning(
    dataset_id: int,
    request: ApplyCleaningRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Executes the validated cleaning transformations:
    - Never mutates the raw original dataset
    - Generates a new clean CSV file with a unique ID
    - Persists an immutable Audit Report JSON
    - Registers the cleaned dataset in the user's workspace
    """
    dataset = await db.get(Dataset, dataset_id)
    if not dataset or dataset.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset not found or access denied")

    file_path, ext = _get_dataset_file_path(dataset)
    try:
        response = await DataQualityService.apply_cleaning(
            file_path=file_path,
            ext=ext,
            dataset=dataset,
            configs=request.columns,
            remove_duplicates=request.remove_duplicates,
            drop_leakage=request.drop_leakage_columns,
            cleaned_dataset_name=request.cleaned_dataset_name,
            db=db,
            user_id=current_user.id
        )
        return response
    except Exception as e:
        logger.error(f"Applying data cleaning failed: {traceback.format_exc()}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to apply cleaning: {str(e)}"
        )


@router.post("/compare-models", response_model=ModelComparisonResponse)
async def compare_models_before_and_after(
    request: ModelComparisonRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Performs chronological before-and-after model evaluation:
    - Fits forecasting model on both raw baseline and cleaned datasets
    - Evaluates performance on the identical chronological test period
    - Computes MAE, RMSE, WAPE, and MAPE with percentage deltas
    - Verifies whether cleaning genuinely improved out-of-sample forecast accuracy
    """
    orig_ds = await db.get(Dataset, request.original_dataset_id)
    clean_ds = await db.get(Dataset, request.cleaned_dataset_id)

    if not orig_ds or orig_ds.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Original dataset not found")
    if not clean_ds or clean_ds.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cleaned dataset not found")

    orig_path, _ = _get_dataset_file_path(orig_ds)
    clean_path, _ = _get_dataset_file_path(clean_ds)

    try:
        comparison = DataQualityService.compare_before_and_after(
            orig_storage_path=orig_path,
            clean_storage_path=clean_path,
            model_type=request.model_type,
            horizon=request.horizon
        )
        return comparison
    except Exception as e:
        logger.error(f"Model comparison failed: {traceback.format_exc()}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Model comparison failed: {str(e)}"
        )


@router.get("/{dataset_id}/report")
async def get_cleaning_audit_report(
    dataset_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Returns the JSON audit report associated with a cleaned dataset."""
    dataset = await db.get(Dataset, dataset_id)
    if not dataset or dataset.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset not found")

    base_name = dataset.storage_path.rsplit('.', 1)[0]
    report_path = os.path.join(UPLOAD_DIR, f"{base_name}_cleaning_report.json")
    if not os.path.exists(report_path):
        # Generate summary report if not present
        return {
            "dataset_id": dataset.id,
            "name": dataset.name,
            "status": "No explicit cleaning report found. Dataset may be an original upload.",
            "num_rows": dataset.num_rows,
            "num_columns": dataset.num_columns
        }
    with open(report_path, "r") as f:
        data = json.load(f)
    return JSONResponse(content=data)


@router.get("/{dataset_id}/download")
async def download_dataset_csv(
    dataset_id: int,
    format: str = Query("csv"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Downloads dataset file directly as CSV or Excel."""
    import pandas as pd
    dataset = await db.get(Dataset, dataset_id)
    if not dataset or dataset.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Dataset not found")

    file_path, ext = _get_dataset_file_path(dataset)
    base_name = os.path.splitext(dataset.original_filename or f"dataset_{dataset_id}")[0]

    fmt = format.lower().strip()
    if fmt in ["xlsx", "excel"]:
        if ext == "xlsx":
            return FileResponse(
                path=file_path,
                filename=f"{base_name}.xlsx",
                media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            )
        xlsx_path = os.path.join(UPLOAD_DIR, f"{dataset.storage_path.rsplit('.', 1)[0]}.xlsx")
        if not os.path.exists(xlsx_path):
            df = pd.read_csv(file_path)
            df.to_excel(xlsx_path, index=False)
        return FileResponse(
            path=xlsx_path,
            filename=f"{base_name}.xlsx",
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
    else:
        if ext == "csv":
            return FileResponse(
                path=file_path,
                filename=f"{base_name}.csv",
                media_type="text/csv"
            )
        csv_path = os.path.join(UPLOAD_DIR, f"{dataset.storage_path.rsplit('.', 1)[0]}.csv")
        if not os.path.exists(csv_path):
            df = pd.read_excel(file_path)
            df.to_csv(csv_path, index=False)
        return FileResponse(
            path=csv_path,
            filename=f"{base_name}.csv",
            media_type="text/csv"
        )

