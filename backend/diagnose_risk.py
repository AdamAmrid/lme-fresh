import sys
import os
import pandas as pd
from sqlalchemy import create_engine

# Add backend to path
sys.path.append(os.getcwd())

from backend.database import SessionLocal
from backend.models.learner_state import TelemetryLog
from backend.models import risk_model

def diagnose():
    db = SessionLocal()
    try:
        logs = db.query(TelemetryLog).all()
        df = pd.DataFrame([l.__dict__ for l in logs])
        
        # Clean up SQLAlchemy state
        if '_sa_instance_state' in df.columns:
            df = df.drop(columns=['_sa_instance_state'])
            
        print(f"Total Logs: {len(df)}")
        
        students = df['student_id'].unique()
        for sid in students[:5]:
            sdf = df[df['student_id'] == sid].copy()
            m = risk_model._calculate_student_metrics(sdf)
            inf = risk_model.infer_risk_score(m)
            print(f"\nStudent: {sid}")
            print(f"Metrics: {m}")
            print(f"Prediction: {inf}")
            
    finally:
        db.close()

if __name__ == "__main__":
    diagnose()
