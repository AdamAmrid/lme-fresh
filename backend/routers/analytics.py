import os
import sys
import subprocess
import pandas as pd
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
import traceback
from sqlalchemy import create_engine
from pydantic import BaseModel
from backend.models.risk_model import get_unified_student_report
from backend.models.learner_state import TelemetryLog
import backend.models.risk_model as risk_model
from backend.models.risk_model import train_risk_model
from typing import List, Optional, Dict, Any

from backend.models.learner_state import User
import backend.models.risk_model as risk_model
from backend.models.risk_model import train_risk_model

from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError

analytics_router = APIRouter()

# Target DB dynamically relative to the backend folder to support the seeded database
from backend.database import engine as ENGINE

SECRET_KEY = os.getenv("JWT_SECRET", "supersecretkey")
ALGORITHM = "HS256"

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/token")

def get_current_user(token: str = Depends(oauth2_scheme)):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        role: str = payload.get("role")
        if role is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        # Wrap into a dummy User class mimicking what would've been returned
        return User(id=payload.get("id"), email=payload.get("sub"), name=payload.get("name"), role=role)
    except JWTError:
        raise HTTPException(status_code=401, detail="Could not validate credentials")

def check_instructor(current_user: User = Depends(get_current_user)):
    if current_user.role != "instructor":
        raise HTTPException(status_code=403, detail="Not authorized")
    return current_user

# --------------------------------------------------------------------------------
# Pydantic Schemas
# --------------------------------------------------------------------------------

class StaticProfile(BaseModel):
    student_id: str
    name: str
    email: str
    modules_attempted: List[str]
    first_seen: str
    last_seen: str
    total_sessions: int

class BehavioralDimension(BaseModel):
    fredricks_dimension: str = "Behavioral"
    avg_idle_time_per_session: float
    avg_attempt_count_per_question: float
    participation_rate: float
    total_mistakes: int

class CognitiveDimension(BaseModel):
    fredricks_dimension: str = "Cognitive"
    mastery_trajectory: List[float]
    hint_dependency_per_session: List[float]
    si_trend: List[float]
    avg_hint_level_used: float

class EmotionalDimension(BaseModel):
    fredricks_dimension: str = "Emotional"
    unengaged_ratio: float
    struggling_ratio: float
    engaged_ratio: float
    recovery_events: int
    frustration_index: float

class RiskScoreProfile(BaseModel):
    risk_score: float
    risk_label: str
    dominant_weakness: str
    suggested_intervention: str

class EngagementHeatmapDatum(BaseModel):
    session_index: int
    dominant_state: str
    avg_SI: float
    avg_mastery: float
    hints_used: float
    avg_idle_time: float
    frustration_index: float

class StudentProfileResponse(BaseModel):
    static_profile: StaticProfile
    behavioral: BehavioralDimension
    cognitive: CognitiveDimension
    emotional: EmotionalDimension
    risk: RiskScoreProfile
    engagement_heatmap_data: List[EngagementHeatmapDatum]
    session_logs: Dict[int, List[Dict[str, Any]]]

class CohortHeatmapSession(BaseModel):
    session_index: int
    dominant_state: str
    avg_SI: float

class CohortEngagementHeatmap(BaseModel):
    student_id: str
    student_name: str
    sessions: List[CohortHeatmapSession]

class ClassStateDistribution(BaseModel):
    engaged_pct: float
    struggling_pct: float
    unengaged_pct: float

class MostStruggledQuestion(BaseModel):
    question_text: str
    avg_SI: float
    rank: int

class CohortStudent(BaseModel):
    student_id: str
    student_name: str
    risk_score: float
    risk_label: str
    dominant_state: str
    session_count: int
    last_active: str
    engaged_ratio: float = 0.0
    struggling_ratio: float = 0.0
    unengaged_ratio: float = 0.0
    sessions: Optional[List[CohortHeatmapSession]] = None

class CohortAnalyticsResponse(BaseModel):
    students: List[CohortStudent]
    class_state_distribution: ClassStateDistribution
    most_struggled_questions: List[MostStruggledQuestion]
    engagement_heatmap: List[CohortEngagementHeatmap]
    at_risk_students: List[CohortStudent]

class RiskFeatures(BaseModel):
    avg_SI: float
    hint_dependency_score: float
    unengaged_ratio: float
    avg_attempt_count: float
    session_count: int

class RiskPrediction(BaseModel):
    student_id: str
    student_name: str
    risk_score: float
    risk_label: str
    dominant_weakness: str
    suggested_intervention: str
    features: RiskFeatures

class RiskPredictionsResponse(BaseModel):
    predictions: List[RiskPrediction]
    model_mode: str

# --------------------------------------------------------------------------------
# Endpoints
# --------------------------------------------------------------------------------

@analytics_router.get("/student/{student_id}", response_model=StudentProfileResponse)
def get_student_profile(student_id: str, _: User = Depends(check_instructor)):
    try:
        try:
            train_risk_model()
        except Exception as trm_e:
            print(f"⚠️ Risk Model Training skipped: {trm_e}")

        # Attempt to load data
        users_df = pd.read_sql("SELECT * FROM users WHERE email=? OR id=? OR name=?", ENGINE, params=(student_id, student_id, student_id))
        df = pd.read_sql("SELECT * FROM telemetry_logs WHERE student_id=?", ENGINE, params=(student_id,))
        
        # If student exists but has no history, return an empty profile
        if df.empty:
            name = student_id
            email = student_id
            if not users_df.empty:
                name = users_df.iloc[0].get("name", student_id)
                email = users_df.iloc[0].get("email", student_id)
                
            return {
                "static_profile": {
                    "student_id": student_id,
                    "name": str(name),
                    "email": str(email),
                    "modules_attempted": [],
                    "first_seen": "Never",
                    "last_seen": "Never",
                    "total_sessions": 0
                },
                "behavioral": {"avg_idle_time_per_session": 0.0, "avg_attempt_count_per_question": 0.0, "participation_rate": 0.0, "total_mistakes": 0},
                "cognitive": {"mastery_trajectory": [], "hint_dependency_per_session": [], "si_trend": [], "avg_hint_level_used": 0.0},
                "emotional": {"unengaged_ratio": 0.0, "struggling_ratio": 0.0, "engaged_ratio": 0.0, "recovery_events": 0, "frustration_index": 0.0},
                "risk": {"risk_score": 0.0, "risk_label": "low", "dominant_weakness": "none", "suggested_intervention": "No data yet"},
                "engagement_heatmap_data": [],
                "session_logs": {}
            }
    except Exception as e:
        # ABSOLUTE SAFETY: Catch every possible failure and print TRACEBACK to terminal
        print("\n" + "!"*60)
        print(f"🔥 CRITICAL ERROR IN ANALYTICS ROUTE for {student_id}")
        traceback.print_exc()
        print("!"*60 + "\n")
        # Return a safe blank profile so the UI doesn't crash or get blocked by CORS
        return {
                "static_profile": {"student_id": student_id, "name": "Error Recovery", "email": student_id, "modules_attempted": [], "first_seen": "N/A", "last_seen": "N/A", "total_sessions": 0},
                "behavioral": {"avg_idle_time_per_session": 0, "avg_attempt_count_per_question": 0, "participation_rate": 0, "total_mistakes": 0},
                "cognitive": {"mastery_trajectory": [], "hint_dependency_per_session": [], "si_trend": [], "avg_hint_level_used": 0},
                "emotional": {"unengaged_ratio": 0, "struggling_ratio": 0, "engaged_ratio": 0, "recovery_events": 0, "frustration_index": 0},
                "risk": {"risk_score": 0, "risk_label": "low", "dominant_weakness": "error", "suggested_intervention": "Check terminal logs"},
                "engagement_heatmap_data": [],
                "session_logs": {}
            }

    # Rest of the processing logic (only runs if df is NOT empty)
    # Static extraction
    name = student_id
    email = ""
    if not users_df.empty:
        user_row = users_df.iloc[0]
        name = user_row.get("name", student_id)
        email = user_row.get("email", "")

    # Grouping logic (Advanced boundary detection)
    df['datetime'] = pd.to_datetime(df['timestamp'], format='mixed', utc=True)
    df['date'] = df['datetime'].dt.date
    df = df.sort_values('datetime')
    
    # Deduplicate logs to prevent phantom event counts (especially for merged profiles)
    df = df.drop_duplicates(subset=['timestamp', 'current_question_text', 'type', 'learner_state', 'struggle_index'])
    
    # Filter out "In Lobby" noise rows, but ALWAYS keep "session_complete" rows so final scores are preserved
    is_lobby = df['current_question_text'].isin(['In Lobby', 'None', 'Selecting...', ''])
    is_session_end = df['type'] == 'session_complete'
    df = df[~is_lobby | is_session_end]
    
    if df.empty:
        # Fallback to empty profile return if cleaning left nothing
        return {
            "static_profile": {"student_id": student_id, "name": str(name), "email": str(email), "modules_attempted": [], "first_seen": "Never", "last_seen": "Never", "total_sessions": 0},
            "behavioral": {"avg_idle_time_per_session": 0.0, "avg_attempt_count_per_question": 0.0, "participation_rate": 0.0, "total_mistakes": 0},
            "cognitive": {"mastery_trajectory": [], "hint_dependency_per_session": [], "si_trend": [], "avg_hint_level_used": 0.0},
            "emotional": {"unengaged_ratio": 0.0, "struggling_ratio": 0.0, "engaged_ratio": 0.0, "recovery_events": 0, "frustration_index": 0.0},
            "risk": {"risk_score": 0.0, "risk_label": "low", "dominant_weakness": "none", "suggested_intervention": "No real session data yet"},
            "engagement_heatmap_data": [],
            "session_logs": {}
        }
    
    # A true "Session" boundary occurs when the prior row was a completion, module switched (to something other than lobby), or >5 min passed
    is_not_lobby_switch = (~df['module'].shift().isin(['In Lobby', 'None', '', None]))
    boundary = (df['type'].shift() == 'session_complete') | \
               (df['datetime'].diff() > pd.Timedelta(minutes=5)) | \
               ((df['module'] != df['module'].shift()) & is_not_lobby_switch)
    
    # Critical Fix: The first row always triggers a 'change' because .shift() is NaN.
    # We must explicitly set the first boundary to False to ensure we start at Session 1.
    boundary.iloc[0] = False
    
    df['session_index'] = boundary.cumsum() + 1
    
    session_count = df['session_index'].nunique()
    
    first_seen = df['timestamp'].min()
    last_seen = df['timestamp'].max()
    modules = df['module'].dropna().unique().tolist()
    
    # Behavioral (Internal Aggregation for Trajectory)
    valid_q_df = df[(df['is_correct'] == True) & ~df['current_question_text'].isin(['In Lobby', 'None', 'Selecting...', '', None])]
    true_ans_counts = valid_q_df.groupby('session_index')['current_question_text'].nunique()
    
    session_maxes = df.groupby('session_index')[['total_hints_requested', 'total_mistakes', 'total_idle_time', 'attempt_count']].max()
    session_maxes['answered_count'] = true_ans_counts.reindex(session_maxes.index, fill_value=0)

    # --- RESTORED STABLE LOCAL LOGIC ---
    avg_idle = session_maxes['total_idle_time'].mean()
    avg_attempt = df['attempt_count'].mean()
    
    answered_sum = int(session_maxes['answered_count'].sum())
    participation_rate = min(1.0, answered_sum / max(1, session_count * 10))
    total_mistakes = int(session_maxes['total_mistakes'].sum())
    
    # Cognitive
    si_trend = df.groupby('session_index')['struggle_index'].mean().tolist()
    # Fredricks: Cognitive — Mastery trajectory smoothed via EMA (α=0.3).
    # Literature: EMA preferred over simple mean as it weights recent sessions more heavily (citation 14, 18)
    alpha = 0.3
    raw_mastery = df.groupby('session_index')['current_score'].mean().tolist()
    ema_mastery = []
    for i, m_val in enumerate(raw_mastery):
        if i == 0:
            ema_mastery.append(round(m_val, 4))
        else:
            ema_val = alpha * m_val + (1 - alpha) * ema_mastery[-1]
            ema_mastery.append(round(ema_val, 4))
    mastery_trajectory = ema_mastery
    
    hint_dependency_per_session = []
    # Fixed UI Trajectory: Use deltas for cumulative hints per session
    for s_id in sorted(df['session_index'].unique()):
        sdf = df[df['session_index'] == s_id]
        if sdf.empty: continue
        
        # Discrete session hints = max - min
        sess_hints = float(sdf['total_hints_requested'].max() - sdf['total_hints_requested'].min())
        
        # Use audited answer count for this session
        sess_ans = max(1, true_ans_counts.get(s_id, 0))
        
        hint_dependency_per_session.append(sess_hints / sess_ans)
        
    avg_hint_level = sum(hint_dependency_per_session) / max(1, len(hint_dependency_per_session))
    
    # Fredricks: Emotional
    total_rows = len(df)
    un_ratio = sum(df['learner_state'] == 'Unengaged') / total_rows
    st_ratio = sum(df['learner_state'] == 'Struggling') / total_rows
    en_ratio = sum(df['learner_state'] == 'Engaged') / total_rows
    
    # Fredricks: Emotional — Recovery/Resilience metric. 
    # Logic: transition from Struggling to Engaged within session, confirmed by hintless correct attempt.
    # HARDENING: Only counts if NO hints were used for the CURRENT question.
    recovery_events = 0
    for s_idx in sorted(df['session_index'].unique()):
        sdf = df[df['session_index'] == s_idx].copy()
        sdf['hints_at_q_start'] = sdf.groupby('current_question_text')['total_hints_requested'].transform('first')
        sdf = sdf.reset_index(drop=True)
        
        recovered_questions = set()
        for i in range(len(sdf) - 1):
            row_n  = sdf.iloc[i]
            row_n1 = sdf.iloc[i + 1]
            q_text = str(row_n1['current_question_text'])
            
            if (row_n['learner_state'] == 'Struggling'
                    and row_n1['learner_state'] == 'Engaged'
                    and bool(row_n1['is_correct'])
                    and row_n1['total_hints_requested'] == row_n1['hints_at_q_start']
                    and q_text not in recovered_questions):
                recovery_events += 1
                recovered_questions.add(q_text)
            
    # Fredricks: Emotional — Frustration proxy. Literature: frequency of short-latency repeated errors (Barrouillet et al. 2004, citation 6)
    frustration_rows = len(df[(df['attempt_count'] >= 3) & (df['is_correct'] == False) & (df['idle_time'] < 10)])
    frust = round(min(1.0, frustration_rows / max(len(df), 1)), 4)
    
    # Heatmap & Detailed Session Logs
    heatmap = []
    session_logs = {}
    
    for s_idx in sorted(df['session_index'].unique()):
        sdf = df[df['session_index'] == s_idx]
        
        # Aggregated Metrics for Table
        dom_state = sdf['learner_state'].mode()
        dom_state_val = dom_state[0] if not dom_state.empty else "Unknown"
        
        # Mastery logic for this session (EMA index)
        idx_offset = int(s_idx) - 1
        sess_mastery = mastery_trajectory[idx_offset] if idx_offset < len(mastery_trajectory) else 0.0
        
        # Hint logic
        ans = max(1, sdf.groupby('session_index')['answered_count'].max().iloc[0])
        hints = float(sdf.groupby('session_index')['total_hints_requested'].max().iloc[0])
        hint_dep = hints / ans
        
        # Frustration index for this session
        s_frust_rows = len(sdf[(sdf['attempt_count'] >= 3) & (sdf['is_correct'] == False) & (sdf['idle_time'] < 10)])
        s_frust = round(min(1.0, s_frust_rows / max(len(sdf), 1)), 4)

        mean_si = sdf['struggle_index'].mean()
        clean_si = round(float(mean_si), 2) if pd.notna(mean_si) else None

        # Per-Session ML-Driven Weakness Inference
        un_ratio_sess = len(sdf[sdf['learner_state'] == 'Unengaged']) / max(len(sdf), 1)
        session_metrics = {
            "avg_SI": float(mean_si) if pd.notna(mean_si) else 0.0,
            "hint_dependency_score": float(hint_dep),
            "unengaged_ratio": float(un_ratio_sess),
            "avg_attempt_count": float(sdf['attempt_count'].mean()),
            "avg_idle_time": float(sdf['idle_time'].mean()),
            "frustration_index": float(s_frust),
            "session_count": 1,
            "participation": 1.0,
            "avg_mastery": float(sess_mastery)
        }
        sess_inf = risk_model.infer_risk_score(session_metrics)

        heatmap.append({
            "session_index": int(s_idx),
            "dominant_state": str(dom_state_val),
            "avg_SI": clean_si,
            "avg_mastery": float(sess_mastery),
            "session_score": float(sdf['current_score'].max()),
            "hints_used": float(hint_dep),
            "avg_idle_time": float(sdf['idle_time'].mean()),
            "frustration_index": float(s_frust),
            "dominant_weakness": sess_inf["dominant_weakness"]
        })
        
        # Compute exact hints requested per question dynamically from DB logs
        q_hints = sdf[sdf['type'].isin(['request_hint', 'hint_received'])].groupby('current_question_text').size().to_dict()
        
        # Question-level logs for drill-down - Filter out heartbeats (interval_updates) to show only meaningful events
        action_df = sdf[sdf['type'].isin(['submit_answer', 'session_complete', 'request_hint', 'state_change', 'hint_received'])].copy()
        action_df['question_hints'] = action_df['current_question_text'].map(q_hints).fillna(0)
        
        session_logs[int(s_idx)] = action_df[['current_question_text', 'question_hints', 'struggle_index', 'learner_state', 'is_correct', 'timestamp']].sort_values('timestamp').to_dict('records')
        
    # Recalculate global features for centralized risk inference
    avg_hint_dependency = sum(hint_dependency_per_session) / max(1, len(hint_dependency_per_session))
    avg_si_val = float(df['struggle_index'].mean())
    
    frustration_rows = len(df[(df['attempt_count'] >= 3) & (df['is_correct'] == False) & (df['idle_time'] < 10)])
    frust = round(min(1.0, frustration_rows / max(len(df), 1)), 4)

    # Centralized ML-Driven Risk Inference
    risk_metrics = {
        "avg_SI": avg_si_val,
        "hint_dependency_score": avg_hint_dependency,
        "unengaged_ratio": float(un_ratio),
        "avg_attempt_count": float(avg_attempt),
        "avg_idle_time": float(avg_idle),
        "frustration_index": float(frust),
        "session_count": int(session_count),
        "participation": float(participation_rate),
        "avg_mastery": float(mastery_trajectory[-1]) if mastery_trajectory else 1.0
    }
    inf = risk_model.infer_risk_score(risk_metrics)
    risk_score = inf["risk_score"]
    is_ml_driven = inf["is_ml_driven"]
    dominant_weakness = inf["dominant_weakness"]
    suggested_intervention = inf["suggested_intervention"]
    
    # Consistency Logic for Presentation UI
    risk_label = "low" if risk_score < 0.30 else ("medium" if risk_score < 0.50 else "high")

    return {
        "static_profile": {
            "student_id": student_id,
            "name": str(name),
            "email": str(email),
            "modules_attempted": [str(m) for m in modules],
            "first_seen": str(first_seen),
            "last_seen": str(last_seen),
            "total_sessions": session_count
        },
        "behavioral": {
            "avg_idle_time_per_session": float(avg_idle),
            "avg_attempt_count_per_question": float(avg_attempt),
            "participation_rate": float(participation_rate),
            "total_mistakes": total_mistakes
        },
        "cognitive": {
            "mastery_trajectory": [float(m) for m in mastery_trajectory],
            "hint_dependency_per_session": hint_dependency_per_session,
            "si_trend": [float(s) for s in si_trend],
            "avg_hint_level_used": float(avg_hint_level)
        },
        "emotional": {
            "unengaged_ratio": float(un_ratio),
            "struggling_ratio": float(st_ratio),
            "engaged_ratio": float(en_ratio),
            "recovery_events": recovery_events,
            "frustration_index": frust
        },
        "risk": {
            "risk_score": risk_score,
            "risk_label": risk_label,
            "dominant_weakness": dominant_weakness,
            "suggested_intervention": suggested_intervention
        },
        "engagement_heatmap_data": heatmap,
        "session_logs": session_logs
    }

@analytics_router.get("/cohort", response_model=CohortAnalyticsResponse)
def get_cohort_analytics(_: User = Depends(check_instructor)):
    train_risk_model()  # Always refresh cache before predicting
    try:
        df = pd.read_sql("SELECT * FROM telemetry_logs", ENGINE)
        users_df = pd.read_sql("SELECT email, name FROM users", ENGINE)
        user_map = dict(zip(users_df['email'], users_df['name']))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
        
    # Deduplicate logs to prevent phantom event counts
    df = df.drop_duplicates(subset=['student_id', 'timestamp', 'current_question_text', 'type', 'learner_state', 'struggle_index'])
    
    # Filter out "In Lobby" noise rows, but ALWAYS keep "session_complete" rows so boundaries are preserved
    is_lobby = df['current_question_text'].isin(['In Lobby', 'None', 'Selecting...', ''])
    is_session_end = df['type'] == 'session_complete'
    df = df[~is_lobby | is_session_end]
    
    if df.empty:
        return {
            "students": [],
            "class_state_distribution": {"engaged_pct": 0, "struggling_pct": 0, "unengaged_pct": 0},
            "most_struggled_questions": [],
            "engagement_heatmap": [],
            "at_risk_students": []
        }
        
    total_logs = len(df)
    eng_pct = sum(df['learner_state'] == 'Engaged') / max(total_logs, 1)
    str_pct = sum(df['learner_state'] == 'Struggling') / max(total_logs, 1)
    un_pct = sum(df['learner_state'] == 'Unengaged') / max(total_logs, 1)
    
    most_struggled = []
    q_group = df.groupby('current_question_text')['struggle_index'].mean().sort_values(ascending=False).head(5)
    rank = 1
    for q_text, avg_si in q_group.items():
        if str(q_text) not in ['', 'In Lobby', 'None', 'Selecting...']:
            most_struggled.append({
                "question_text": str(q_text),
                "avg_SI": float(avg_si),
                "rank": rank
            })
            rank += 1
            
    students_list = []
    heatmap_list = []
    
    for sid, sdf in df.groupby('student_id'):
        # --- THE GRAND UNIFICATION ---
        # No more manual Pandas grouping or thresholding here.
        # Everything (Cleaning, Metrics, Risk, Sessions) comes from ONE function.
        report = get_unified_student_report(sdf)
        
        # Build standard response objects from the Unified Report
        stu_obj = {
            "student_id": str(sid),
            "student_name": user_map.get(str(sid), report.get("student_name", str(sid))),
            "risk_score": report["risk_score"],
            "risk_label": report["risk_label"],
            "dominant_state": report["dominant_state"],
            "session_count": report["metrics"].get("session_count", 0),
            "last_active": report["last_active"],
            "engaged_ratio": (sdf['learner_state'] == 'Engaged').sum() / max(len(sdf), 1),
            "struggling_ratio": (sdf['learner_state'] == 'Struggling').sum() / max(len(sdf), 1),
            "unengaged_ratio": report["metrics"].get("unengaged_ratio", 0),
            "sessions": report["sessions"]
        }
        
        # Ensure student_name is correctly set if missing from report
        if stu_obj["student_name"] == str(sid):
            name_find = sdf['student_name'].iloc[0] if 'student_name' in sdf.columns and pd.notna(sdf['student_name'].iloc[0]) else str(sid)
            stu_obj["student_name"] = str(name_find)

        students_list.append(stu_obj)
        heatmap_list.append({
            "student_id": str(sid),
            "student_name": stu_obj["student_name"],
            "sessions": report["sessions"]
        })
        
    at_risk = [s for s in students_list if s["risk_label"] == "high"]
    
    # Sort students by most recently active so new quizzes appear at the very top instead of alphabetically
    students_list.sort(key=lambda x: x["last_active"], reverse=True)
    
    return {
        "unification_version": "v1.1-force-sync",
        "students": students_list,
        "class_state_distribution": {
            "engaged_pct": float(eng_pct),
            "struggling_pct": float(str_pct),
            "unengaged_pct": float(un_pct)
        },
        "most_struggled_questions": most_struggled,
        "engagement_heatmap": heatmap_list,
        "at_risk_students": at_risk
    }

@analytics_router.get("/risk", response_model=RiskPredictionsResponse)
def get_risk_predictions(_: User = Depends(check_instructor)):
    train_risk_model()  # Always refresh cache before predicting
    try:
        # Fetch all unique student identifiers
        df = pd.read_sql("SELECT DISTINCT student_id, student_name FROM telemetry_logs", ENGINE)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
        
    preds = []
    mode = "fallback" if risk_model.is_fallback else "ml"
    
    seen_ids = set()
    for _, row in df.iterrows():
        sid = str(row['student_id'])
        sname = str(row['student_name']) if pd.notna(row['student_name']) else sid
        
        # Deduplication: Skip if we've already processed this student ID
        if sid in seen_ids:
            continue
        seen_ids.add(sid)
        
        r = risk_model.predict(sid)
        if r.get("features"): 
            preds.append({
                "student_id": sid,
                "student_name": sname,
                "risk_score": r["risk_score"],
                "risk_label": r["risk_label"],
                "dominant_weakness": r["dominant_weakness"],
                "suggested_intervention": r["suggested_intervention"],
                "features": r["features"]
            })
            
    # Sort by risk_score descending
    preds.sort(key=lambda x: x["risk_score"], reverse=True)
    
    return {
        "predictions": preds,
        "model_mode": mode
    }

@analytics_router.get("/seed")
def seed_analytics():
    try:
        # Nuke the schema-corrupted database so it can be rebuilt cleanly
        db_path = os.path.join(os.path.dirname(__file__), "..", "lme.db")
        if os.path.exists(db_path):
            try:
                os.remove(db_path)
            except Exception as e:
                pass

        script_path = os.path.join(os.path.dirname(__file__), "..", "seed_analytics.py")
        result = subprocess.run(
            [sys.executable, script_path], 
            cwd=os.path.dirname(script_path), 
            capture_output=True, 
            text=True
        )
        if result.returncode != 0:
            raise HTTPException(status_code=500, detail=f"Seeding failed: {result.stderr}")
            
        return {
            "status": "success", 
            "message": "Demo data successfully seeded", 
            "output": result.stdout
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Subprocess error: {str(e)}")
