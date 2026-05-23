from fastapi import FastAPI, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.background import BackgroundScheduler
import torch
import pandas as pd
import numpy as np
import logging
import os
import joblib
from datetime import datetime, timedelta

from database import fetch_historical_data
from pipeline import preprocess_data, SCALER_PATH
from model import AQMSPredictor
from train import train_model, MODEL_PATH

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="AQMS ML Prediction Service")

# Allow CORS since frontend might hit it directly or via proxy
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

scheduler = BackgroundScheduler()

def scheduled_training():
    logger.info("Running scheduled training...")
    train_model(epochs=50)

@app.on_event("startup")
def startup_event():
    logger.info("Starting up ML service...")
    # Schedule retraining every day at 2 AM
    scheduler.add_job(scheduled_training, 'cron', hour=2, minute=0)
    scheduler.start()
    
    # If model doesn't exist, try to train one immediately (non-blocking)
    if not os.path.exists(MODEL_PATH):
        logger.info("Model not found. Initializing background training.")
        scheduler.add_job(scheduled_training, 'date', run_date=datetime.now() + timedelta(seconds=10))

@app.on_event("shutdown")
def shutdown_event():
    scheduler.shutdown()

def get_predictions(device_id=None, seq_length=24, pred_length=24):
    if not os.path.exists(MODEL_PATH):
        raise HTTPException(status_code=503, detail="Model is currently training or not available.")
    if not os.path.exists(SCALER_PATH):
        raise HTTPException(status_code=503, detail="Scaler is not available.")
        
    raw_data = fetch_historical_data(device_id=device_id, days=60) # Fetch recent data to get the last sequence
    if not raw_data or len(raw_data) < seq_length:
        logger.warning('Unable to generate forecast due to insufficient historical data.');
        raise HTTPException(status_code=503, detail="Not enough historical data to make a prediction.")
        
    df = pd.DataFrame(raw_data)
    df['time'] = pd.to_datetime(df['time'])
    df.set_index('time', inplace=True)
    df = df.resample('1H').mean().interpolate(method='linear').bfill().ffill().fillna(0)
    
    # Get the last seq_length hours
    last_seq = df.tail(seq_length)
    features = ['pm2_5', 'temperature', 'humidity']
    
    scaler = joblib.load(SCALER_PATH)
    scaled_seq = scaler.transform(last_seq[features])
    
    X_tensor = torch.tensor(scaled_seq, dtype=torch.float32).unsqueeze(0) # Add batch dimension (1, seq_length, 3)
    
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    model = AQMSPredictor(input_dim=3, pred_length=pred_length).to(device)
    model.load_state_dict(torch.load(MODEL_PATH, map_location=device))
    model.eval()
    
    with torch.no_grad():
        X_tensor = X_tensor.to(device)
        pred_scaled = model(X_tensor) # shape: (1, pred_length, 3)
        pred_scaled = pred_scaled.squeeze(0).cpu().numpy() # shape: (pred_length, 3)
        
    # Inverse transform
    pred_actual = scaler.inverse_transform(pred_scaled)
    
    # Generate future timestamps
    last_time = last_seq.index[-1]
    future_times = [last_time + timedelta(hours=i+1) for i in range(pred_length)]
    
    predictions = []
    for i in range(pred_length):
        predictions.append({
            "time": future_times[i].isoformat(),
            "pm2_5_cal": float(max(0, pred_actual[i][0])), # Ensure no negative values
            "temperature": float(pred_actual[i][1]),
            "humidity": float(max(0, min(100, pred_actual[i][2]))) # Clamp humidity 0-100
        })
        
    return predictions

@app.get("/api/ml/predict/city")
def predict_city():
    return get_predictions(device_id=None)

@app.get("/api/ml/predict/device/{device_id}")
def predict_device(device_id: str):
    return get_predictions(device_id=device_id)

@app.post("/api/ml/train")
def trigger_training(background_tasks: BackgroundTasks):
    background_tasks.add_task(train_model)
    return {"message": "Training started in background."}
