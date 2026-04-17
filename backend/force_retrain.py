import sys
import os

# Add backend to path
sys.path.append(os.getcwd())

from backend.models import risk_model

def force_retrain():
    print("Forcing Risk Model Retraining with new Discrete Delta Logic...")
    risk_model.train_risk_model()
    print("Done. Model is calibrated.")

if __name__ == "__main__":
    force_retrain()
