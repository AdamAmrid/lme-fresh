from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Dict, Any
from datetime import datetime

from database import get_db
from models.learner_state import TelemetryLog

router = APIRouter()

@router.get("/progress")
def get_student_progress(email: str, db: Session = Depends(get_db)):
    if not email:
        raise HTTPException(status_code=400, detail="Email is required")
        
    modules = ["maths", "logic"]
    response_data = {}
    
    for mod in modules:
        # Get Max Mastery from the highest current_score for this module
        max_mastery_val = db.query(func.max(TelemetryLog.current_score)).filter(
            TelemetryLog.student_id == email,
            TelemetryLog.module == mod
        ).scalar()
        max_mastery = float(max_mastery_val) if max_mastery_val is not None else 0.0
        
        # Calculate Total Sessions by counting unique 'session_complete' events
        # or distinct login periods (we'll use session_complete as a proxy)
        total_sessions = db.query(func.count(TelemetryLog.id)).filter(
            TelemetryLog.student_id == email,
            TelemetryLog.module == mod,
            TelemetryLog.type == "session_complete"
        ).scalar() or 0
        
        # Get Last Timestamp (most recent activity)
        last_log = db.query(TelemetryLog.timestamp).filter(
            TelemetryLog.student_id == email,
            TelemetryLog.module == mod
        ).order_by(TelemetryLog.id.desc()).first()
        
        last_timestamp = last_log[0] if last_log else None
        
        response_data[mod] = {
            "max_mastery": max_mastery,
            "total_sessions": total_sessions,
            "last_timestamp": last_timestamp
        }
        
    return response_data
