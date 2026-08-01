from fastapi import APIRouter, Request
from app.core.exceptions import APIError
from slowapi import Limiter
from slowapi.util import get_remote_address
import pandas as pd
import joblib

from pydantic import BaseModel
import asyncio
from sqlalchemy.future import select
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import Depends
from app.db.database import get_db
from app.models.dataset import Dataset
from app.api.deps import get_current_user
from app.models.user import User

class TrainRequest(BaseModel):
    dataset_id: int
    horizon: int
    model_type: str

from app.schemas.forecast import ExplanationRequest, ExplanationResponse
from fastapi_cache.decorator import cache
from app.core.config import settings
from app.core.logging import logger

limiter = Limiter(key_func=get_remote_address)
router = APIRouter(
    tags=["Forecasting & Predictions"]
)

_model = None
_xai_engine = None

def get_xai_engine():
    global _model, _xai_engine
    if _xai_engine is None:
        try:
            from app.ml.xai_engine import XAIEngine
            _model = joblib.load(settings.MODEL_PATH)
            df = pd.read_csv(settings.DATA_PATH)
            X_train = df.drop(columns=['Date', 'Sales'], errors='ignore').select_dtypes(include=['number'])
            _xai_engine = XAIEngine(model=_model, X_train=X_train)
            logger.info("xai_engine_initialized")
        except Exception as e:
            logger.error("xai_engine_init_failed", error=str(e))
            raise RuntimeError("Model or training data not found for XAI Engine.")
    return _model, _xai_engine

@router.post("/predict")
@limiter.limit("200/minute")
@cache(expire=3600)
async def predict_demand(request: Request, payload: ExplanationRequest):
    """
    Returns raw demand forecast for the given features.
    """
    model, _ = get_xai_engine()
    df = pd.DataFrame([payload.features])
    
    try:
        # Enforce column matching logic would go here
        prediction = float(model.predict(df)[0])
        return {"prediction": prediction}
    except Exception as e:
        raise APIError(str(e), status_code=400)

@router.post("/explain", response_model=ExplanationResponse)
@limiter.limit("50/minute")
@cache(expire=3600)
async def explain_forecast(request: Request, payload: ExplanationRequest):
    """
    Generates a local LIME explanation and Plain English translation.
    """
    try:
        model, xai = get_xai_engine()
        X_instance = pd.DataFrame([payload.features])
        
        missing_cols = set(xai.X_train.columns) - set(X_instance.columns)
        for col in missing_cols:
            X_instance[col] = 0
            
        X_instance = X_instance[xai.X_train.columns]
        prediction = float(model.predict(X_instance)[0])
        
        explanation_dict = xai.explain_local_lime(X_instance)
        
        plain_english = xai.generate_english_explanation(
            prediction=prediction,
            base_value=explanation_dict["base_value"],
            lime_values_list=explanation_dict["lime_values"]
        )
        
        shap_values_fake = {cond: val for cond, val in explanation_dict["lime_values"]}
        
        logger.info("forecast_explained", prediction=prediction)
        
        return ExplanationResponse(
            prediction=prediction,
            shap_values=shap_values_fake,
            base_value=explanation_dict["base_value"],
            plain_english_explanation=plain_english
        )
        
    except Exception as e:
        logger.error("explain_forecast_failed", error=str(e))
        raise APIError(str(e), status_code=500)

@router.post("/train")
async def train_model_endpoint(
    request: Request,
    payload: TrainRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    import os
    import time
    start_time = time.time()
    
    logger.info("training_request_received", request_url=str(request.url), dataset_id=payload.dataset_id, model_type=payload.model_type)
    
    dataset = await db.get(Dataset, payload.dataset_id)
    if not dataset or dataset.user_id != current_user.id:
        logger.error("training_failed", error="Dataset not found or unauthorized", dataset_id=payload.dataset_id)
        raise APIError(f"Dataset {payload.dataset_id} not found or unauthorized", status_code=404)
        
    upload_dir = os.path.join(os.getcwd(), "data", "uploads")
    absolute_path = os.path.join(upload_dir, dataset.storage_path)
    logger.info("resolved_file_path", absolute_path=absolute_path)
    
    if not os.path.exists(absolute_path):
        logger.error("training_failed", error="Dataset file missing on disk", absolute_path=absolute_path)
        raise APIError(f"Dataset file missing at {absolute_path}", status_code=400)
        
    logger.info("training_started", dataset_id=dataset.id, model_type=payload.model_type)
        
    try:
        from app.ml.dynamic_forecasting import run_pipeline
        # Pass the absolute path down to the pipeline
        result = run_pipeline(absolute_path, payload.model_type, payload.horizon)
        execution_time = time.time() - start_time
        logger.info("training_completed", dataset_id=dataset.id, execution_time=execution_time, metrics=result.get("metrics"))
        return result
    except Exception as e:
        execution_time = time.time() - start_time
        logger.exception("training_failed", error=str(e), dataset_id=dataset.id, execution_time=execution_time)
        raise APIError(f"Training failed: {str(e)}", status_code=500)
