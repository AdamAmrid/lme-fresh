# Squirrel AI — Learner Modeling Engine (LME)
## Project Summary & Development Log
> Last updated: 2026-03-30

---

## 1. System Architecture Overview

```
┌─────────────────────┐        WebSocket (ws://)       ┌──────────────────────┐
│   Student Browser    │ ◄────────────────────────────► │   FastAPI Backend     │
│   (StudentQuiz.jsx)  │     JSON telemetry packets     │   (ws.py router)      │
└─────────────────────┘                                 └──────────┬───────────┘
                                                                   │  broadcast
┌─────────────────────┐        WebSocket (ws://)                  ▼
│  Instructor Browser  │ ◄──────────────────────────── ┌──────────────────────┐
│ (InstructorDashboard)│     dashboard_update JSON      │  ConnectionManager   │
└─────────────────────┘                                │  (in-memory state)   │
                                                        └──────────┬───────────┘
                                                                   │
                                                        ┌──────────▼───────────┐
                                                        │   ML Model (RF)      │
                                                        │   + OULAD Pipeline   │
                                                        └──────────────────────┘
```

### Tech Stack
| Layer | Technology |
|---|---|
| Frontend | React (Vite), vanilla CSS, react-icons |
| Backend | FastAPI, WebSockets, SQLAlchemy |
| Database | SQLite (`lme.db`) — session logs |
| ML Model | scikit-learn RandomForestClassifier |
| Training Data | OULAD Open University Dataset |
| Explainability | SHAP (feature importance report) |
| Auth | JWT (python-jose) |

---

## 2. Core Components

### 2.1 Backend — `backend/routers/ws.py`
The WebSocket router is the brain of the system. It handles:
- **Student connections** (`/ws/student/{client_id}`) — JWT authentication, telemetry reception
- **Instructor connections** (`/ws/instructor`) — JWT authentication, real-time dashboard feed
- **ConnectionManager** — in-memory registry of all active sockets + state cache

### 2.2 Frontend — `frontend/src/pages/StudentQuiz.jsx`
The student-facing quiz interface. Responsibilities:
- Module selection (Maths / Logic)
- Question rendering and answer submission
- 5-second telemetry heartbeat
- Idle time tracking (mouse/keyboard activity)
- Toast notifications from AI feedback
- Navigation (previous, skip, done)

### 2.3 Frontend — `frontend/src/pages/InstructorDashboard.jsx`
Real-time instructor view. Responsibilities:
- Live Learner Feed (all connected students + their states)
- Student detail panel (struggle index, mastery, active question)
- Custom intervention (send hints to specific students)
- Auto-updates via WebSocket without manual refresh

### 2.4 ML Model — `backend/models/ml_model.py`
- `LearnerModel` class with `initialize()` and `predict()` methods
- On startup: checks for `model.pkl` → loads if exists, trains from OULAD if not
- `predict()` takes 4 proxy features and returns `"Engaged"` / `"Struggling"` / `"Unengaged"`

### 2.5 OULAD Pipeline — `backend/preprocessing/oulad_pipeline.py`
- Loads `studentVle.csv`, `studentAssessment.csv`, `studentRegistration.csv`
- Aggregates per-student: total clicks, average score, submission rate, withdrawal flag
- Assigns heuristic labels for training:
  - **Engaged**: score ≥ 70 AND clicks > median
  - **Struggling**: score < 50 AND clicks > median
  - **Unengaged**: clicks < 30% of median
- Returns feature matrix X and label vector y

---

## 3. Telemetry Pipeline (How Data Flows)

```
Student interaction
       │
       ▼
idleTime.current += 1/s  (reset on mousemove/keydown/click)
       │
Every 5s (heartbeat):
       ▼
buildTelemetryPacket({
  student_id, student_name, module,
  current_question_text,
  idle_time, attempt_count, is_correct,
  current_score, totalMistakes, totalIdleTime,
  type: 'interval_update' | 'submit_answer' | 'session_complete' | ...
})
       │
       ▼
WebSocket → backend ws.py
       │
       ├── LOBBY GUARD: if module == "Selecting..." → broadcast lobby state → skip AI
       │
       ├── 1. Struggle Index: SI = 0.4*(idle/120) + 0.4*(attempts/5) - 0.2*(score)
       │
       ├── 2. Proxy Feature Mapping:
       │       sum_clicks_proxy = (120 - idle_time) * 10
       │       avg_score_proxy  = current_score * 100
       │       submission_rate  = 1.0 (hardcoded)
       │       withdrawal_flag  = 0   (hardcoded)
       │
       ├── 3. ML Inference: learner_model.predict(...)
       │
       ├── 4. Heuristic Override [⚠️ currently overrides ML]:
       │       idle > 60  → "Unengaged"
       │       idle ≥ 30  → "Struggling"
       │       else       → "Engaged"
       │
       ├── 5. Message Generation (event-driven, not state-driven):
       │       submit_answer + is_correct → "Excellent! That's correct! 🎉"
       │       Struggling + attempts ≥ 3 → "You've tried this a few times..."
       │       Struggling + idle ≥ 30    → "You seem stuck..."
       │       Unengaged                 → "You've been inactive... 👋"
       │       Engaged heartbeat         → null (no notification)
       │
       ├── 6. Debounce: skip if same state + same message + < 3s elapsed
       │       EXCEPTION: correct_answer events always bypass debounce
       │
       ├── 7. Send to Student: { state, message }
       │
       ├── 8. Send to Instructor: dashboard_update { student_id, state, si, ... }
       │
       └── 9. SQLite Log: telemetry_logs table
```

---

## 4. Features Implemented

### 4.1 Quiz Navigation
| Feature | Description |
|---|---|
| **Module Selection** | Student picks Maths or Logic from lobby screen |
| **← Previous** | Navigate to previous question (disabled on Q1) |
| **Skip for now →** | Jump to next unanswered question (forward only, no wrap) |
| **Done ✓** | Appears on last question — ends session immediately regardless of skip state |
| **← Lobby** | Returns to module selection, resets all state, notifies admin instantly |
| **Progress Dots** | Visual indicator per question: orange=current, cyan ✓=answered, grey=pending |
| **Progress Bar** | Fills based on answered count (not question index) |

### 4.2 Session Completion Logic
- Session ends when:
  1. Student correctly answers the **last question** (by index), OR
  2. Student clicks **Done ✓** on the last question, OR
  3. All questions from current position forward are already answered
- Skipped questions are **not forced** — student is not brought back
- **Start New Session** uses `handleBackToLobby()` (not page reload) to keep WS alive

### 4.3 Idle Time Definition
```
idleTime = seconds since last { mousemove | keydown | click }
Resets to 0 on any user interaction.
Increments every 1s while student is stationary.
Thresholds: 30s → Struggling, 60s → Unengaged
```

### 4.4 Notification (Toast) System
| Trigger | Message | Color |
|---|---|---|
| Correct answer (`submit_answer + is_correct`) | "Excellent! That's correct, keep it up! 🎉" | Teal (Engaged) |
| Idle ≥ 30s | "You seem stuck. Take your time..." | Orange (Struggling) |
| 3+ failed attempts | "You've tried this a few times. Hint: try breaking the problem..." | Orange (Struggling) |
| Idle ≥ 60s | "You've been inactive for a while. Ready to continue? 👋" | Red (Unengaged) |
| Engaged heartbeat | *(no notification — silent state update only)* | — |

**Toast behaviour:**
- Auto-dismisses after **5 seconds** with a draining progress bar
- ✕ button available to close manually at any time
- Closing does NOT re-trigger the same notification
- Moving to next question resets the notification tracker (fresh slate)

### 4.5 Lobby Guard
Students in the lobby produce NO AI state classification. The system:
- **Student side**: Heartbeat is suppressed (no packets sent from lobby)
- **Backend side**: Lobby packets update the instructor dashboard with "In Lobby" status but skip all ML/heuristic classification
- **Instructor side**: Live Feed shows **"🕐 In Lobby"** (neutral grey), detail panel shows "Waiting to start a module..." instead of any AI state

### 4.6 Admin Dashboard — Real-Time Sync
| Event | Admin Dashboard Behaviour |
|---|---|
| Student connects | Immediately shows student name with "🕐 In Lobby" |
| Student picks module | Card updates with module name and Engaged state |
| Student goes idle 30s | Card updates to Struggling (orange) |
| Student goes idle 60s | Card updates to Unengaged (red) |
| Student clicks "← Lobby" | Card reverts to "🕐 In Lobby" instantly |
| Student clicks "Start New Session" | Card reverts to "🕐 In Lobby" instantly |
| Student finishes | Card updates to Finished state |
| Student disconnects / refreshes | Card is **removed automatically** (`student_disconnected` event) |
| Instructor refreshes | Student card restored from `latest_student_states` bootstrap cache |

### 4.7 Presence Broadcasting
On authentication success, the backend:
1. Decodes the JWT → extracts real `student_name`
2. Immediately broadcasts a presence packet to all instructors
3. Caches it in `latest_student_states`

This ensures: **instructor refresh always shows student name**, even before first telemetry packet.

### 4.8 State Debouncing
- Backend tracks `last_state`, `last_msg`, `last_broadcast_time` per student
- A packet is sent only if: state changed OR message changed OR 3s elapsed
- **Exception**: `submit_answer + is_correct` always bypasses debounce (correct answer notification must never be lost)

---

## 5. ML Model — Detailed Status

### 5.1 What the model is
- **Algorithm**: RandomForestClassifier (50 trees, random_state=42)
- **Training data**: OULAD dataset (~32,000 students, Open University UK)
- **Input features** (4):
  - `sum_clicks` — total VLE interactions
  - `avg_score` — mean assessment score (0–100)
  - `submission_rate` — assessments submitted (0–1)
  - `withdrawal_flag` — whether student unregistered (0/1)
- **Output classes**: `"Engaged"`, `"Struggling"`, `"Unengaged"`

### 5.2 SHAP Feature Importance (from `shap_report.json`)
| Feature | Importance |
|---|---|
| `sum_clicks` | **70.6%** — dominant signal |
| `avg_score` | 23.6% — significant |
| `submission_rate` | 5.8% — minor |
| `withdrawal_flag` | 0.04% — negligible |

### 5.3 Current Runtime Mapping (Proxy Features)
| OULAD Feature | Real-time Proxy Used |
|---|---|
| `sum_clicks` | `(120 - idle_time) * 10` ← inverse of idle |
| `avg_score` | `current_score * 100` ← mastery index |
| `submission_rate` | `1.0` (hardcoded — always full) |
| `withdrawal_flag` | `0` (hardcoded — never flagged) |

### 5.4 ⚠️ Known Issue: ML Prediction Is Currently Overridden
```python
# ml_state = learner_model.predict(...)   ← IS called ✅
#
# But then unconditionally replaced:
if idle_time > 60:    ml_state = "Unengaged"   # ← heuristic wins
elif idle_time >= 30: ml_state = "Struggling"  # ← heuristic wins
else:                 ml_state = "Engaged"     # ← heuristic wins always
```
**Result**: The ML model runs every heartbeat but its output is always ignored. Classification is entirely heuristic-based at runtime.

### 5.5 Planned Fix (Next Step)
Replace the unconditional override with a **hybrid model** where:
- Hard safety rails apply at extremes (> 60s idle = always Unengaged)
- ML model drives classification in the middle ground (20–60s idle range)
- Proxy features are improved (dynamic `submission_rate` from actual answer history)

---

## 6. Bugs Fixed (Chronological)

| # | Bug | Root Cause | Fix |
|---|---|---|---|
| 1 | Student name not appearing in admin after refresh | `latest_student_states` was empty until first real telemetry | Presence broadcast on JWT auth; cache persists across disconnects |
| 2 | Struggling status shown in lobby | Local idle prediction timer ran for lobby students | `isInLobby` guard on both backend (skip classification) and frontend (skip timer) |
| 3 | Telemetry heartbeat restarting every second | Unstable `useEffect` deps caused interval destroy/recreate | `useRef` for all rapidly-changing values; empty dep array `[]` on heartbeat |
| 4 | Toast notification re-opening in a loop | `onClose` reset `lastShownMsgRef`, backend debounce re-sent same msg | `onClose` no longer resets the ref; ref only resets on question transition |
| 5 | "Great work!" shown immediately on session start | Engaged state had a default message sent on every heartbeat | Message is now `null` for Engaged unless `is_correct` event detected |
| 6 | Correct answer notification never showing | Debounce blocked it (state unchanged, < 3s elapsed) | `is_correct_event` flag bypasses debounce entirely |
| 7 | Struggling shown at 25s not 30s | ML model prematurely classified Struggling before threshold | Hard `else: ml_state = "Engaged"` forces Engaged below 30s |
| 8 | Admin not updated when student clicks ← Lobby | Lobby packets were silently `continue`d before any broadcast | Guard now broadcasts lobby state to instructors, then `continue`s past AI |
| 9 | Admin not updated on "Start New Session" | `window.location.reload()` caused WS disconnect + unreliable reconnect | Replaced with `handleBackToLobby()` — keeps WS alive, resets React state |
| 10 | Toast color wrong for Unengaged (should be red) | Color derived from message keyword matching (missed "inactive") | Added `state` prop to `FeedbackToast`; color from explicit `styleMap` object |
| 11 | Student disconnects not reflected in admin | Backend didn't notify instructors on WS close | `WebSocketDisconnect` handler now broadcasts `student_disconnected` event |
| 12 | Session forced student to answer all questions | End-of-session required `answeredSet.size >= questions.length` | Session ends when last question (by index) is answered or Done ✓ is clicked |

---

## 7. File Map

```
learner-modeling-engine/
├── backend/
│   ├── main.py                          # FastAPI app + ML model init on startup
│   ├── routers/
│   │   └── ws.py                        # ★ Core: WebSocket router, ML inference, debounce
│   ├── models/
│   │   └── ml_model.py                  # LearnerModel class (RF classifier)
│   ├── preprocessing/
│   │   └── oulad_pipeline.py            # OULAD CSV loader + feature engineering
│   ├── data/oulad/
│   │   ├── studentVle.csv               # 454MB — click/interaction data
│   │   ├── studentAssessment.csv        # Assessment scores
│   │   └── studentRegistration.csv      # Withdrawal data
│   ├── model.pkl                        # Trained model (cached, 121KB)
│   ├── shap_report.json                 # Feature importance output
│   ├── database.py                      # SQLAlchemy setup
│   └── lme.db                           # SQLite database (session logs)
│
└── frontend/src/
    ├── pages/
    │   ├── StudentQuiz.jsx              # ★ Student interface (quiz, telemetry, navigation)
    │   └── InstructorDashboard.jsx      # ★ Admin live feed + intervention panel
    ├── components/
    │   ├── FeedbackToast.jsx            # AI notification popup (color, timer, close)
    │   ├── QuizQuestion.jsx             # Question card + answer options
    │   ├── LearnerCard.jsx              # Student card in the feed
    │   └── StatCard.jsx                 # Summary stat cards (Total/Struggling/Unengaged)
    ├── hooks/
    │   └── useWebSocket.js              # WS connection hook (auth handshake, emit, lastMessage)
    ├── utils/
    │   └── telemetry.js                 # buildTelemetryPacket() helper
    └── data/
        └── quizQuestions.js             # Maths + Logic question banks
```

---

## 8. Next Steps / Open Items

- [ ] **Fix ML override**: Let the trained RF model contribute to state decisions (hybrid approach)
- [ ] **Improve proxy features**: Make `submission_rate` dynamic from actual attempt history
- [ ] **Per-student analytics page**: Time-series of state transitions per session
- [ ] **Instructor hint delivery**: Currently hint is sent but needs full UI on student side
- [ ] **Multi-student load test**: Verify debounce + broadcast holds under 10+ concurrent students
- [ ] **Persistence across sessions**: Session history stored in DB but not yet surfaced in UI analytics
