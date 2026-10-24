from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, BackgroundTasks, Form
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from typing import List
import os
import uuid
import json
import numpy as np
import pandas as pd
from pydantic import BaseModel
import logging
import traceback

logging.basicConfig(level=logging.INFO)

from app.db.database import get_db
from app.models.user import User
from app.models.dataset import Dataset
from app.api.deps import get_current_user

router = APIRouter()

UPLOAD_DIR = os.path.join(os.getcwd(), "data", "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

class DatasetRename(BaseModel):
    name: str

class ColumnSchemaDef(BaseModel):
    name: str
    role: str
    confidence: float
    type: str

class DatasetSchemaUpdate(BaseModel):
    columns: List[ColumnSchemaDef]

@router.get("/ping")
async def ping():
    return {"message": "ping"}

@router.post("/upload")
async def upload_dataset(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Validate extension
    ext = file.filename.split('.')[-1].lower()
    if ext not in ['csv', 'xlsx', 'parquet']:
        raise HTTPException(status_code=400, detail="Only CSV, Excel, and Parquet files are supported")
    
    # Store file securely
    file_id = str(uuid.uuid4())
    secure_filename = f"{file_id}.{ext}"
    storage_path = os.path.join(UPLOAD_DIR, secure_filename)
    
    size_bytes = 0
    with open(storage_path, "wb") as f:
        while chunk := await file.read(8192 * 1024):
            f.write(chunk)
            size_bytes += len(chunk)
    
    if size_bytes > 50 * 1024 * 1024:  # 50MB limit
        os.remove(storage_path)
        raise HTTPException(status_code=400, detail="File size exceeds 50MB limit")

    dataset = Dataset(
        user_id=current_user.id,
        name=file.filename,
        original_filename=file.filename,
        storage_path=secure_filename,
        file_type=ext,
        size_bytes=size_bytes,
        status="uploading"
    )
    db.add(dataset)
    await db.commit()
    await db.refresh(dataset)
    
    # Trigger background profiling without passing the request's db session
    background_tasks.add_task(profile_dataset, dataset.id, storage_path, ext)
    
    # Read first 100 rows for immediate preview
    preview_data = {}
    try:
        if ext == 'csv':
            df_preview = pd.read_csv(storage_path, nrows=100)
        elif ext == 'xlsx':
            df_preview = pd.read_excel(storage_path, nrows=100)
        elif ext == 'parquet':
            df_preview = pd.read_parquet(storage_path).head(100)
        preview_data = {
            "columns": df_preview.columns.tolist(),
            "data": df_preview.fillna("NaN").to_dict(orient="records")
        }
    except Exception as e:
        logging.error(f"Preview generation failed: {traceback.format_exc()}")
        raise HTTPException(status_code=400, detail=f"Failed to generate dataset preview: {str(e)}")
    
    return {"message": "Upload started", "id": dataset.id, "preview": preview_data}

def _process_dataset_sync(file_path: str, ext: str) -> tuple:
    import pandas as pd
    import numpy as np
    import json
    
    if ext == 'csv':
        df = pd.read_csv(file_path)
    elif ext == 'xlsx':
        df = pd.read_excel(file_path)
    elif ext == 'parquet':
        df = pd.read_parquet(file_path)
        
    num_rows = len(df)
    num_cols = len(df.columns)
    duplicates = int(df.duplicated().sum())
    
    missing_counts = df.isnull().sum().to_dict()
    dtypes = df.dtypes.astype(str).to_dict()
    numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
    
    outliers_count = {}
    for col in numeric_cols:
        Q1 = df[col].quantile(0.25)
        Q3 = df[col].quantile(0.75)
        IQR = Q3 - Q1
        outliers = ((df[col] < (Q1 - 1.5 * IQR)) | (df[col] > (Q3 + 1.5 * IQR))).sum()
        outliers_count[col] = int(outliers)
        
    correlation_matrix = []
    if len(numeric_cols) > 1:
        corr_df = df[numeric_cols].corr().fillna(0)
        for i, row_col in enumerate(corr_df.columns):
            for j, col_col in enumerate(corr_df.columns):
                correlation_matrix.append({
                    "x": row_col,
                    "y": col_col,
                    "value": round(float(corr_df.iloc[i, j]), 2)
                })

    # Leakage Keywords
    LEAKAGE_KEYWORDS = [
        "revenue", "profit", "closing_stock", "ending_stock", "stockout", 
        "total_amount", "gross_sales", "net_sales", "margin", "total_sales"
    ]
    
    # Identify Date Column (Only ONE primary date column)
    date_candidate = None
    for col in df.columns:
        col_lower = col.lower().strip()
        col_type = str(df[col].dtype)
        # Check explicit datetime type or date-like naming
        if "datetime" in col_type or col_lower in ["date", "datetime", "timestamp", "ds", "time"] or col_lower.endswith(("_date", "_time")):
            date_candidate = col
            break
        # If object/string, try to parse
        if not pd.api.types.is_numeric_dtype(df[col]):
            try:
                sample = df[col].dropna().head(10)
                if len(sample) > 0:
                    parsed = pd.to_datetime(sample, errors='raise')
                    if parsed.dt.year.min() > 1980: # reasonable calendar year
                        date_candidate = col
                        break
            except Exception:
                pass

    # Identify Primary Target Candidate (Only ONE target column)
    # Retail / inventory forecasting target priorities
    TARGET_PRIORITIES = ["units_sold", "sales", "quantity", "demand", "volume", "orders", "target", "y"]
    target_candidate = None
    
    # Priority 1: Exact matches in priority list
    for t in TARGET_PRIORITIES:
        for col in numeric_cols:
            if col.lower().strip() == t:
                target_candidate = col
                break
        if target_candidate:
            break
            
    # Priority 2: Substring matches for units_sold / sales / demand
    if not target_candidate:
        for col in numeric_cols:
            col_lower = col.lower().strip()
            if any(k in col_lower for k in ["units_sold", "sales", "demand", "quantity", "volume"]) and not any(l in col_lower for l in LEAKAGE_KEYWORDS):
                target_candidate = col
                break
                
    # Priority 3: Fallback numeric column with > 10 unique values (excluding leakage/id/prices/costs)
    if not target_candidate:
        for col in numeric_cols:
            col_lower = col.lower().strip()
            if col != date_candidate and not any(l in col_lower for l in LEAKAGE_KEYWORDS) and not any(i in col_lower for i in ["price", "cost", "discount", "id"]):
                if df[col].nunique() > 10:
                    target_candidate = col
                    break
                    
    target_suggestions = [target_candidate] if target_candidate else []

    eda_data = {
        "num_rows": num_rows,
        "num_cols": num_cols,
        "duplicates": duplicates,
        "missing": missing_counts,
        "dtypes": dtypes,
        "outliers": outliers_count,
        "target_suggestions": target_suggestions,
        "correlation_matrix": correlation_matrix
    }

    eda_path = file_path.replace(f".{ext}", "_eda.json")
    with open(eda_path, "w") as f:
        json.dump(eda_data, f)
        
    schema_def = []
    for col in df.columns:
        col_type = str(df[col].dtype)
        unique_count = df[col].nunique()
        is_numeric = pd.api.types.is_numeric_dtype(df[col])
        col_lower = col.lower().strip()
        
        # Check target
        if col == target_candidate:
            schema_def.append({
                "name": col,
                "role": "target",
                "confidence": 0.98,
                "type": col_type
            })
            continue
            
        # Check date
        if col == date_candidate:
            schema_def.append({
                "name": col,
                "role": "date",
                "confidence": 0.99,
                "type": col_type
            })
            continue
            
        # Check target leakage columns
        if any(col_lower == k or f"_{k}" in col_lower or f"{k}_" in col_lower for k in LEAKAGE_KEYWORDS):
            schema_def.append({
                "name": col,
                "role": "ignore",
                "confidence": 0.99,
                "type": col_type
            })
            continue
            
        # Check identifiers
        is_identifier = (
            col_lower.endswith(("_id", "_key", "_sku", "_code")) or
            col_lower.startswith(("id_", "sku_")) or
            col_lower in ["id", "uuid", "sku", "code", "key"] or
            (unique_count == num_rows and not is_numeric)
        )
        if is_identifier:
            schema_def.append({
                "name": col,
                "role": "identifier",
                "confidence": 0.95,
                "type": col_type
            })
            continue
            
        # Check categorical
        if not is_numeric or unique_count < 15:
            schema_def.append({
                "name": col,
                "role": "categorical",
                "confidence": 0.90,
                "type": col_type
            })
            continue
            
        # Numerical feature
        schema_def.append({
            "name": col,
            "role": "numerical",
            "confidence": 0.90,
            "type": col_type
        })
    
    schema_path = file_path.replace(f".{ext}", "_schema.json")
    with open(schema_path, "w") as f:
        json.dump(schema_def, f)
        
    return num_rows, num_cols

async def profile_dataset(dataset_id: int, file_path: str, ext: str):
    from app.db.database import AsyncSessionLocal
    import asyncio
    async with AsyncSessionLocal() as db:
        async def set_status(s: str):
            logging.info(f"Dataset {dataset_id} status updated to: {s}")
            async with db.begin():
                d = await db.get(Dataset, dataset_id)
                if d: d.status = s
                
        try:
            await set_status("validating")
            await asyncio.sleep(0.1)
            
            await set_status("reading")
            await asyncio.sleep(0.1)
            
            # Offload heavy pandas processing to a background thread with 120s timeout
            num_rows, num_cols = await asyncio.wait_for(
                asyncio.to_thread(_process_dataset_sync, file_path, ext),
                timeout=120.0
            )
            
            await set_status("cleaning")
            await asyncio.sleep(0.1)
            
            await set_status("generating_features")
            await asyncio.sleep(0.1)
            
            async with db.begin():
                dataset = await db.get(Dataset, dataset_id)
                if dataset:
                    dataset.num_rows = num_rows
                    dataset.num_columns = num_cols
                    dataset.status = "ready"
            logging.info(f"Dataset {dataset_id} processing completed successfully.")
        except asyncio.TimeoutError:
            logging.error(f"Dataset {dataset_id} processing timed out after 120 seconds.")
            async with db.begin():
                dataset = await db.get(Dataset, dataset_id)
                if dataset:
                    dataset.status = "error"
                    dataset.error_message = "Processing exceeded 120 seconds timeout."
        except Exception as e:
            logging.error(f"Dataset {dataset_id} processing failed: {traceback.format_exc()}")
            async with db.begin():
                dataset = await db.get(Dataset, dataset_id)
                if dataset:
                    dataset.status = "error"
                    dataset.error_message = str(e)


@router.get("/")
async def list_datasets(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(select(Dataset).where(Dataset.user_id == current_user.id))
    return result.scalars().all()

@router.delete("/{dataset_id}")
async def delete_dataset(
    dataset_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    dataset = await db.get(Dataset, dataset_id)
    if not dataset or dataset.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Dataset not found")
        
    # Remove file
    path = os.path.join(UPLOAD_DIR, dataset.storage_path)
    if os.path.exists(path):
        os.remove(path)
        
    await db.delete(dataset)
    await db.commit()
    return {"message": "Dataset deleted"}

@router.get("/{dataset_id}/status")
async def get_dataset_status(
    dataset_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    dataset = await db.get(Dataset, dataset_id)
    if not dataset or dataset.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return {"status": dataset.status}

@router.put("/{dataset_id}/rename")
async def rename_dataset(
    dataset_id: int,
    payload: DatasetRename,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    dataset = await db.get(Dataset, dataset_id)
    if not dataset or dataset.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Dataset not found")
        
    dataset.name = payload.name
    await db.commit()
    return {"message": "Dataset renamed"}

@router.get("/{dataset_id}/preview")
async def preview_dataset(
    dataset_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    dataset = await db.get(Dataset, dataset_id)
    if not dataset or dataset.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Dataset not found")
        
    if dataset.status != "ready":
        raise HTTPException(status_code=400, detail="Dataset is not ready yet")
        
    path = os.path.join(UPLOAD_DIR, dataset.storage_path)
    try:
        if dataset.file_type == 'csv':
            df = pd.read_csv(path, nrows=5)
        elif dataset.file_type == 'xlsx':
            df = pd.read_excel(path, nrows=5)
        elif dataset.file_type == 'parquet':
            df = pd.read_parquet(path).head(5)
            
        return {
            "columns": df.columns.tolist(),
            "data": df.fillna("NaN").to_dict(orient="records")
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{dataset_id}/eda")
async def get_dataset_eda(
    dataset_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    dataset = await db.get(Dataset, dataset_id)
    if not dataset or dataset.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Dataset not found")
        
    if dataset.status != "ready":
        raise HTTPException(status_code=400, detail="Dataset EDA is not ready yet")
        
    base_name = dataset.storage_path.rsplit('.', 1)[0]
    eda_path = os.path.join(UPLOAD_DIR, f"{base_name}_eda.json")
    
    if not os.path.exists(eda_path):
        raise HTTPException(status_code=404, detail="EDA data not found")
        
    with open(eda_path, "r") as f:
        return json.load(f)

@router.get("/{dataset_id}/schema")
async def get_dataset_schema(
    dataset_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    dataset = await db.get(Dataset, dataset_id)
    if not dataset or dataset.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Dataset not found")
        
    base_name = dataset.storage_path.rsplit('.', 1)[0]
    schema_path = os.path.join(UPLOAD_DIR, f"{base_name}_schema.json")
    
    if not os.path.exists(schema_path):
        raise HTTPException(status_code=404, detail="Schema data not found")
        
    with open(schema_path, "r") as f:
        return json.load(f)

@router.put("/{dataset_id}/schema")
async def update_dataset_schema(
    dataset_id: int,
    payload: DatasetSchemaUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    dataset = await db.get(Dataset, dataset_id)
    if not dataset or dataset.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Dataset not found")
        
    base_name = dataset.storage_path.rsplit('.', 1)[0]
    schema_path = os.path.join(UPLOAD_DIR, f"{base_name}_schema.json")
    
    with open(schema_path, "w") as f:
        json.dump([col.model_dump() for col in payload.columns], f)
        
    return {"message": "Schema updated successfully"}
