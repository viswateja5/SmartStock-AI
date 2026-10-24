import os
import json
from typing import Optional, List
from fastapi import APIRouter, Request, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
import pandas as pd
import numpy as np

from app.core.exceptions import APIError
from app.db.database import get_db
from app.models.user import User
from app.models.dataset import Dataset
from app.api.deps import get_current_user_optional
from app.schemas.inventory import InventoryOptimizationRequest, InventoryOptimizationResponse
from app.services.optimization_service import OptimizationService

router = APIRouter(
    tags=["Dashboard & Recommendations"]
)

UPLOAD_DIR = os.path.join(os.getcwd(), "data", "uploads")


def _extract_dataset_summary(file_path: str, ext: str, dataset_name: str, dataset_id: int) -> dict:
    base_name = file_path.rsplit('.', 1)[0]
    schema_path = f"{base_name}_schema.json"
    
    if not os.path.exists(file_path) or not os.path.exists(schema_path):
        return None
        
    try:
        with open(schema_path, "r") as f:
            schema = json.load(f)
            
        date_cols = [c["name"] for c in schema if c.get("role") == "date"]
        target_cols = [c["name"] for c in schema if c.get("role") == "target"]
        
        if not date_cols or not target_cols:
            return None
            
        date_col = date_cols[0]
        target_col = target_cols[0]
        
        if ext == 'csv':
            df = pd.read_csv(file_path)
        elif ext == 'xlsx':
            df = pd.read_excel(file_path)
        elif ext == 'parquet':
            df = pd.read_parquet(file_path)
        else:
            return None
            
        total_rows = len(df)
        total_columns = len(df.columns)
        
        # Parse dates and clean
        df[date_col] = pd.to_datetime(df[date_col], format='mixed', errors='coerce')
        df = df.dropna(subset=[date_col, target_col]).sort_values(date_col).reset_index(drop=True)
        
        if len(df) == 0:
            return None
            
        min_date = df[date_col].min().strftime('%Y-%m-%d')
        max_date = df[date_col].max().strftime('%Y-%m-%d')
        
        total_demand = float(df[target_col].sum())
        
        # Aggregate daily series
        daily = df.groupby(df[date_col].dt.strftime('%Y-%m-%d'))[target_col].sum().reset_index()
        daily.columns = ['date', 'actual']
        daily = daily.sort_values('date').reset_index(drop=True)
        
        avg_daily_demand = float(daily['actual'].mean()) if len(daily) > 0 else 0.0
        
        # Take last 60 daily points for charts
        historical_series = [
            {"date": str(row['date']), "actual": round(float(row['actual']), 1)}
            for _, row in daily.tail(60).iterrows()
        ]
        
        # Product / SKU detection
        prod_col = next((c for c in df.columns if any(k in c.lower() for k in ["product_id", "product_name", "sku", "item"])), None)
        active_skus_count = int(df[prod_col].nunique()) if prod_col else 1
        
        # Store / Channel detection
        store_col = next((c for c in df.columns if any(k in c.lower() for k in ["store_id", "store", "branch", "channel"])), None)
        active_stores_count = int(df[store_col].nunique()) if store_col else 1
        
        # Category breakdown
        cat_col = next((c for c in df.columns if any(k in c.lower() for k in ["category", "dept", "department", "segment", "type"])), None)
        category_distribution = []
        if cat_col:
            cat_grouped = df.groupby(cat_col)[target_col].sum().sort_values(ascending=False).head(6)
            category_distribution = [
                {"category": str(k), "value": round(float(v), 1)}
                for k, v in cat_grouped.items()
            ]
            
        # Top Products
        top_products = []
        if prod_col:
            top_p = df.groupby(prod_col)[target_col].sum().sort_values(ascending=False).head(5)
            top_products = [
                {"name": str(k), "volume": round(float(v), 1)}
                for k, v in top_p.items()
            ]
            
        # Real Data Alerts
        recent_alerts = []
        recent_alerts.append({
            "title": "Dataset Verified",
            "message": f"Successfully loaded {total_rows:,} records across {len(daily):,} timeline periods.",
            "severity": "low"
        })
        
        # Check stockout flag or low inventory if available
        stockout_col = next((c for c in df.columns if "stockout" in c.lower()), None)
        if stockout_col:
            stockout_count = int(df[stockout_col].sum()) if df[stockout_col].dtype in ['int64', 'float64'] else 0
            if stockout_count > 0:
                recent_alerts.append({
                    "title": "Stockout Incidents Recorded",
                    "message": f"{stockout_count} historical stockout instances recorded in dataset.",
                    "severity": "medium"
                })
                
        inventory_col = next((c for c in df.columns if any(k in c.lower() for k in ["inventory", "closing_stock", "opening_stock"])), None)
        if inventory_col:
            total_inv = float(df[inventory_col].iloc[-1]) if len(df) > 0 else 0
            recent_alerts.append({
                "title": "Current Stock Position",
                "message": f"Latest recorded stock: {total_inv:,.0f} units in inventory column.",
                "severity": "low"
            })
            
        return {
            "id": dataset_id,
            "name": dataset_name,
            "total_rows": total_rows,
            "total_columns": total_columns,
            "date_col": date_col,
            "target_col": target_col,
            "date_range": [min_date, max_date],
            "total_demand": round(total_demand, 1),
            "avg_daily_demand": round(avg_daily_demand, 1),
            "active_skus_count": active_skus_count,
            "active_stores_count": active_stores_count,
            "historical_series": historical_series,
            "category_distribution": category_distribution,
            "top_products": top_products,
            "recent_alerts": recent_alerts
        }
    except Exception as e:
        return None


@router.get("/dashboard")
async def get_dashboard_summary(
    request: Request,
    dataset_id: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    """
    Returns live operations and forecast analytics derived strictly from imported datasets.
    """
    # Query datasets from database
    query = select(Dataset).where(Dataset.status == "ready").order_by(Dataset.created_at.desc())
    result = await db.execute(query)
    all_datasets = result.scalars().all()
    
    if not all_datasets:
        return {
            "has_datasets": false,
            "total_datasets": 0,
            "datasets": [],
            "active_dataset": None
        }
        
    dataset_list = [
        {
            "id": d.id,
            "name": d.name,
            "rows": d.num_rows,
            "created_at": d.created_at.strftime('%Y-%m-%d %H:%M') if d.created_at else ""
        }
        for d in all_datasets
    ]
    
    # Select chosen dataset or the newest ready dataset with valid file
    chosen_dataset = None
    if dataset_id is not None:
        chosen_dataset = next((d for d in all_datasets if d.id == dataset_id), None)
        
    active_summary = None
    if chosen_dataset:
        file_path = os.path.join(UPLOAD_DIR, chosen_dataset.storage_path)
        active_summary = _extract_dataset_summary(file_path, chosen_dataset.file_type, chosen_dataset.name, chosen_dataset.id)
        
    # If chosen not found or failed, iterate through available ready datasets
    if not active_summary:
        for d in all_datasets:
            file_path = os.path.join(UPLOAD_DIR, d.storage_path)
            summary = _extract_dataset_summary(file_path, d.file_type, d.name, d.id)
            if summary:
                active_summary = summary
                break
                
    if not active_summary:
        return {
            "has_datasets": False,
            "total_datasets": len(all_datasets),
            "datasets": dataset_list,
            "active_dataset": None
        }
        
    return {
        "has_datasets": True,
        "total_datasets": len(all_datasets),
        "datasets": dataset_list,
        "active_dataset": active_summary
    }


@router.post("/recommend", response_model=InventoryOptimizationResponse)
async def get_inventory_recommendation(request: Request, payload: InventoryOptimizationRequest):
    """
    Wraps the Inventory Optimization Engine to return actionable insights.
    """
    try:
        response = OptimizationService.optimize(payload)
        return response
    except Exception as e:
        raise APIError(str(e), status_code=500)
