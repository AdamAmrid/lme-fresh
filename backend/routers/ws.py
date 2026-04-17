from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException
import json
import logging
import os
from datetime import datetime
from typing import List, Dict
from jose import jwt, JWTError
from dotenv import load_dotenv

from database import SessionLocal
from models.learner_state import TelemetryLog, User
import models.risk_model as risk_model
from pydantic import BaseModel

# Load workspace environment variables
load_dotenv()
SECRET_KEY = os.getenv("JWT_SECRET", "supersecretkey")

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("LME-WebSocket")

router = APIRouter(tags=["websocket"])

class InterventionRequest(BaseModel):
    student_id: str
    message: str

class ConnectionManager:
    def __init__(self):
        self.students = {}
        self.instructors = []
        self.latest_student_states = {} # Cache for initial instructor sync
        # Bug 3 Fix: Per-student debounce tracking
        self.last_state: Dict[str, str] = {}
        self.last_broadcast_time: Dict[str, float] = {}

    async def connect_student(self, websocket: WebSocket, student_id: str):
        await websocket.accept()
        self.students[student_id] = websocket

    async def connect_instructor(self, websocket: WebSocket):
        await websocket.accept()
        self.instructors.append(websocket)

    def disconnect_student(self, student_id: str, websocket: WebSocket):
        # Identity Check: Only remove the socket if it's the one currently being tracked.
        # This prevents "Ghost Disconnections" during rapid re-leads.
        if student_id in self.students and self.students[student_id] == websocket:
            del self.students[student_id]
        
        # NOTE: We intentionally keep latest_student_states after disconnect.
        # This ensures instructor REFRESH still shows the last known state
        # without requiring the student to log out and back in.

    def disconnect_instructor(self, websocket: WebSocket):
        if websocket in self.instructors:
            self.instructors.remove(websocket)

    async def send_to_student(self, student_id: str, message: dict):
        if student_id in self.students:
            await self.students[student_id].send_text(json.dumps(message))

    async def broadcast_instructors(self, message: dict):
        for connection in self.instructors:
            try:
                await connection.send_text(json.dumps(message))
            except:
                pass

manager = ConnectionManager()

@router.post("/intervention")
async def send_intervention(req: InterventionRequest):
    if req.student_id in manager.students:
        # We broadcast the alert natively to their active websocket
        await manager.send_to_student(req.student_id, {"message": req.message, "state": "Struggling", "intervention": True})
        return {"status": "success", "message": "Hint broadcasted"}
    raise HTTPException(status_code=404, detail="Student not actively connected")

@router.websocket("/ws/{client_id}")
async def websocket_student(websocket: WebSocket, client_id: str):
    if client_id == "instructor":
        await websocket.accept()
        logger.info("Admin Console attempting secure connection...")
        try:
            # 1. Secure Handshake
            data = await websocket.receive_text()
            payload = json.loads(data)
            
            if payload.get("type") != "authenticate" or not payload.get("token"):
                logger.warning("Admin handshake failed: Missing authentication packet.")
                await websocket.close(code=1008)
                return
            
            try:
                decoded = jwt.decode(payload.get("token"), SECRET_KEY, algorithms=["HS256"])
                # Verify user still exists in DB (handles deleted accounts with live tokens)
                _db = SessionLocal()
                try:
                    db_user = _db.query(User).filter(User.email == decoded.get("sub")).first()
                    if not db_user:
                        logger.warning(f"Admin token valid but user '{decoded.get('sub')}' no longer exists in DB.")
                        await websocket.close(code=1008)
                        return
                finally:
                    _db.close()
                logger.info("Admin Console AUTHENTICATED successfully.")
            except JWTError as e:
                logger.error(f"Admin authentication failed: {str(e)}")
                await websocket.close(code=1008)
                return

            manager.instructors.append(websocket)
            logger.info(f"Admin dashboard connected. Syncing {len(manager.latest_student_states)} students.")
            # Bootstrap: Send the latest known state of all active students
            for state in manager.latest_student_states.values():
                await websocket.send_text(json.dumps(state))
            while True:
                await websocket.receive_text()
        except Exception:
            manager.disconnect_instructor(websocket)
        return

    await manager.connect_student(websocket, client_id)
    db = SessionLocal()
    
    try:
        # Require JWT authentication on the first handshake
        student_name = client_id  # will be overwritten from JWT below
        try:
            data = await websocket.receive_text()
            first_payload = json.loads(data)
            
            if first_payload.get("type") != "authenticate" or not first_payload.get("token"):
                logger.warning(f"Student {client_id} handshake failed: Missing token.")
                await websocket.close(code=1008)
                return
            
            try:
                # Capture decoded token so we can extract the real name
                decoded_token = jwt.decode(first_payload.get("token"), SECRET_KEY, algorithms=["HS256"])
                student_name = decoded_token.get("name", client_id)
                # Verify user still exists in DB
                db_user = db.query(User).filter(User.email == decoded_token.get("sub")).first()
                if not db_user:
                    logger.warning(f"Student token valid but user '{decoded_token.get('sub')}' no longer exists in DB. Rejecting.")
                    await websocket.close(code=1008)
                    return

                # ALLOW email OR integer ID as a valid client_id for security handshake
                is_id_match = str(db_user.id) == str(client_id)
                is_email_match = db_user.email.lower() == str(client_id).lower()

                if not (is_id_match or is_email_match):
                    logger.warning(f"Security Alert: Student {client_id} identity mismatch with token {db_user.email}")
                    await websocket.close(code=1008)
                    return

                logger.info(f"Student {client_id} ({student_name}) AUTHENTICATED successfully.")
            except JWTError as e:
                logger.error(f"Student {client_id} authentication failed: {str(e)}")
                await websocket.close(code=1008)
                return
        except Exception as e:
            logger.error(f"Handshake error for {client_id}: {str(e)}")
            await websocket.close(code=1008)
            return

        # ── PRESENCE BROADCAST ──────────────────────────────────────────────────
        # Immediately announce this student to all instructors so their dashboards
        # show the name right away — even before the first telemetry packet.
        # This also populates the bootstrap cache so instructor REFRESH always works.
        presence_packet = {
            "student_id": client_id,
            "student_name": student_name,
            "state": "Engaged",
            "si": 0,
            "current_score": 0,
            "idle_time": 0,
            "current_question": "In Lobby",
            "module": "Selecting...",
            "help_needed": False,
            "totalMistakes": 0,
            "totalIdleTime": 0,
            "totalHints": 0
        }
        manager.latest_student_states[client_id] = presence_packet
        await manager.broadcast_instructors(presence_packet)
        logger.info(f"Presence broadcast sent for {client_id} ({student_name}).")

        # The original code had manager.connect_student(websocket, client_id) here again,
        # but it's already called before the try block. Removing the duplicate.
        # await manager.connect_student(websocket, client_id)
        
        while True:
            data = await websocket.receive_text()
            payload = json.loads(data)
            
            prev = manager.latest_student_states.get(client_id, {})
            idle_time = payload.get("idle_time", 0)
            attempt_count = payload.get("attempt_count", 0)
            current_score = payload.get("current_score", 0.0)
            total_mistakes = payload.get("totalMistakes", prev.get("totalMistakes", 0))
            module = payload.get("module", "")
            question_text = payload.get("current_question_text", "")

            # LOBBY GUARD: Detect if student is back in lobby
            is_lobby = (module == "Selecting..." or question_text == "In Lobby")
            
            if is_lobby:
                final_state = "Engaged"  # Force back to Engaged if in lobby
                si = 0.0                 # CRITICAL: Define si to prevent NameError crash
            else:
                # 1. Struggle Index Computation
                si = 0.4 * (idle_time / 120.0) + 0.4 * (attempt_count / 5.0) - 0.2 * (current_score / 1.0)

            # 2. Compute proxy features (kept for logging / future cross-session ML use)
            answered_count = payload.get("answeredCount", 0)
            sum_clicks_proxy = (attempt_count * 20) + (answered_count * 15) + max(0, (60 - idle_time) * 5)
            avg_score_proxy = current_score * 100
            submission_rate_proxy = min(1.0, answered_count / 10.0)
            withdrawal_flag_proxy = 0

            # 3. ML model inference (deprecated legacy placeholder removed)
            # 4. RULE-BASED CLASSIFICATION (drives the actual student state)
            #    These thresholds are designed for minute-scale quiz sessions.
            #    The OULAD ML model is better suited for semester-scale profiling.
            is_correct_event = payload.get("type") == "submit_answer" and payload.get("is_correct")

            if is_correct_event:
                # Correct answer — always Engaged, highest priority
                final_state = "Engaged"

            elif attempt_count == 0 and idle_time < 20:
                # Immunity window: student just arrived on a new question and is reading
                final_state = "Engaged"

            elif idle_time > 60:
                # Extended inactivity — student has stopped engaging
                final_state = "Unengaged"

            elif idle_time >= 30 or attempt_count >= 3:
                # Stuck on a question: either idle for 30s or made 3+ wrong attempts
                final_state = "Struggling"

            else:
                # Active, recent interaction, no distress signals
                final_state = "Engaged"

            logger.info(
                f"[RULES] idle={idle_time}s | attempts={attempt_count} | "
                f"correct_event={is_correct_event} → State: {final_state}"
            )

            # 4. Generate State Feedback Message
            # IMPORTANT: Message and State are now independent:
            #   - State is ALWAYS sent (controls the UI badge colour)
            #   - Message is ONLY sent when there's a meaningful human event
            msg = None

            if final_state == "Engaged":
                # Only celebrate when the student actually answers correctly
                if payload.get("type") == "submit_answer" and payload.get("is_correct"):
                    msg = "Excellent! That's correct, keep it up! 🎉"

            elif final_state == "Struggling":
                # Too many wrong attempts — give a structured hint
                if attempt_count >= 3:
                    msg = "You've tried this a few times. Hint: try breaking the problem into smaller steps!"
                elif idle_time >= 30:
                    msg = "You seem stuck. Take your time — or request a hint from your instructor."

            elif final_state == "Unengaged":
                msg = "You've been inactive for a while. Ready to continue? 👋"

            # Bug 3 Fix: State debounce — prevent spam but always deliver event-driven messages
            import time
            now = time.time()
            last_st = manager.last_state.get(client_id)
            last_bt = manager.last_broadcast_time.get(client_id, 0)
            last_msg = manager.last_state.get(f"{client_id}_msg")

            # ALWAYS send if it's a correct answer event — never debounce this
            is_correct_event = payload.get("type") == "submit_answer" and payload.get("is_correct")

            # Debounce: skip if state AND message are identical AND within 3s window
            should_send = (
                is_correct_event or
                (final_state != last_st) or
                (msg != last_msg) or
                ((now - last_bt) >= 3)
            )

            if should_send:
                manager.last_state[client_id] = final_state
                manager.last_state[f"{client_id}_msg"] = msg
                manager.last_broadcast_time[client_id] = now
                logger.info(f"Syncing State with student {client_id}: {final_state} → msg: '{msg}'")
                await manager.send_to_student(client_id, {"message": msg, "state": final_state})
            else:
                logger.debug(f"Debounced state for {client_id}: {final_state} (same as last, <3s)")
                
            # 5. Handle Specialized Message Types
            msg_type = payload.get("type")
            prev_cached_state = manager.latest_student_states.get(client_id, {}).get("state")
            
            if msg_type == "session_complete":
                final_state = "Finished"
                # Trigger real-time ML inference for the terminal log
                try:
                    prediction = risk_model.predict(client_id)
                    if prediction.get("features"):
                        status_icon = "⚠️" if prediction["risk_label"] != "low" else "✅"
                        logger.info("\n" + "="*50)
                        logger.info(f"LIVE ML PREDICTION FOR: {payload.get('student_name', client_id)}")
                        logger.info(f"Result: {status_icon} {prediction['risk_label'].upper()}")
                        logger.info(f"Risk Score: {prediction['risk_score'] * 100:.2f}%")
                        logger.info(f"Primary Weakness: {prediction['dominant_weakness']}")
                        logger.info(f"ML Driven? {prediction.get('is_ml_driven', False)}")
                        logger.info("="*50 + "\n")
                except Exception as ml_err:
                    logger.error(f"Failed to run real-time ML log: {ml_err}")
            elif msg_type == "request_hint":
                await manager.broadcast_instructors({
                    "student_id": client_id,
                    "alert_type": "help_needed",
                    "message": "Student is requesting guidance!"
                })
                final_state = "Struggling"
            elif prev_cached_state == "Finished" and msg_type in ["interval_update", None]:
                # Prevent trailing background heartbeats from the "Session Complete" page from reviving the student 
                # UNLESS they are explicitly back in the lobby (module == Selecting...)
                if module == "Selecting...":
                    final_state = "Engaged"
                else:
                    final_state = "Finished"

            # 6. Broadcast to Instructor dashboards
            dashboard_update = {
                "student_id": client_id,
                "student_name": payload.get("student_name", client_id),
                "state": final_state,
                "si": round(si, 3),
                "current_score": current_score,
                "idle_time": idle_time,
                "current_question": payload.get("current_question_text", "Unknown"),
                "module": payload.get("module", "Unknown"),
                "help_needed": msg_type == "request_hint",
                "history": payload.get("history", []),
                "totalMistakes": total_mistakes,
                "totalIdleTime": payload.get("totalIdleTime", prev.get("totalIdleTime", 0)),
                "totalHints": payload.get("totalHintsRequested", prev.get("totalHints", 0)),
            }
            # Cache the extremely latest state universally so the latch holds safely
            manager.latest_student_states[client_id] = dashboard_update
                
            await manager.broadcast_instructors(dashboard_update)
            
            # 6. SQLite Logging
            log = TelemetryLog(
                student_id=client_id,
                student_name=payload.get("student_name", client_id),
                module=module,
                current_question_text=question_text,
                idle_time=float(idle_time),
                attempt_count=attempt_count,
                is_correct=is_correct_event,
                current_score=float(current_score),
                total_mistakes=total_mistakes,
                total_idle_time=float(payload.get("totalIdleTime", 0)),
                answered_count=answered_count,
                total_hints_requested=int(payload.get("totalHintsRequested", 0)),
                learner_state=final_state,
                struggle_index=float(si),
                timestamp=datetime.utcnow().isoformat() + "Z",
                type=msg_type if msg_type else "interval_update"
            )
            db.add(log)
            db.commit()

    except WebSocketDisconnect:
        manager.disconnect_student(client_id, websocket)
        # Notify all instructor dashboards so they auto-remove the stale entry
        await manager.broadcast_instructors({
            "type": "student_disconnected",
            "student_id": client_id
        })
        logger.info(f"Student {client_id} disconnected — instructors notified.")
    except Exception as e:
        logger.error(f"Unexpected WS Error for {client_id}: {str(e)}")
        manager.disconnect_student(client_id, websocket)
        await manager.broadcast_instructors({
            "type": "student_disconnected",
            "student_id": client_id
        })
    finally:
        db.close()
