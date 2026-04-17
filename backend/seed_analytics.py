import os
import random
from datetime import datetime, timedelta
import bcrypt
from sqlalchemy import create_engine, Column, Integer, String, Float, Boolean, Text
from sqlalchemy.orm import declarative_base, sessionmaker

# Database setup
DATABASE_URL = "sqlite:///./lme.db"
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_password_hash(password):
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    name = Column(String)
    hashed_password = Column(String)
    role = Column(String)

class TelemetryLog(Base):
    __tablename__ = "telemetry_logs"
    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(String)
    student_name = Column(String)
    module = Column(String)
    current_question_text = Column(String)
    idle_time = Column(Float)
    attempt_count = Column(Integer)
    is_correct = Column(Boolean)
    current_score = Column(Float)
    total_mistakes = Column(Integer)
    total_idle_time = Column(Float)
    answered_count = Column(Integer)
    total_hints_requested = Column(Integer)
    learner_state = Column(String)
    struggle_index = Column(Float)
    timestamp = Column(String)
    type = Column(String)

# In case tables aren't completely initialized yet
Base.metadata.create_all(bind=engine)

math_questions = [
    "What is 5 + 7?", "What is 15 * 3?", "Solve for x: 2x + 4 = 10", 
    "What is the square root of 144?", "If y = x^2 and x = 4, what is y?", 
    "What is 20% of 150?", "Solve: 5(x - 2) = 15", "What is the derivative of x^2?", 
    "What is the value of pi to 2 decimal places?", "What is 100 / 4?"
]

logic_questions = [
    "Which number comes next: 2, 4, 6, 8, ?", "If all A are B, and all B are C, then:", 
    "Find the odd one out: Dog, Cat, Bird, Table", "Which comes next: A, C, E, G, ?", 
    "If yesterday was Tuesday, what is tomorrow?", "1, 1, 2, 3, 5, 8, ?", 
    "What gets wetter as it dries?", "I have keys but no locks. I have space but no room... What am I?", 
    "Some months have 30 days, some have 31. How many have 28?", 
    "Mary's father has five daughters: Nana, Nene, Nini, Nono, and?"
]

profiles = [
    {"type": "engaged", "count": 30},
    {"type": "mixed", "count": 40},
    {"type": "at-risk", "count": 30}
]

def calculate_state(is_correct, attempt_count, idle_time):
    if is_correct:
        return "Engaged"
    elif attempt_count == 0 and idle_time < 20:
        return "Engaged"
    elif idle_time > 60:
        return "Unengaged"
    elif idle_time >= 30 or attempt_count >= 3:
        return "Struggling"
    else:
        return "Engaged"

def calculate_si(idle_time, attempt_count, current_score):
    return (0.4 * (idle_time / 120.0)) + (0.4 * (attempt_count / 5.0)) - (0.2 * (current_score / 1.0))

def seed():
    session = SessionLocal()
    
    # 0. Cleanup old mock data (KEEP Adam)
    from sqlalchemy import text
    try:
        session.execute(text("DELETE FROM telemetry_logs WHERE student_id != 'adam.amrid@um6p.ma'"))
        session.commit()
    except Exception as e:
        print(f"Warning during cleanup: {e}")
        session.rollback()
    
    # 1. Create Users
    students = []
    now = datetime.now()
    
    summary = {
        "engaged": 0,
        "mixed": 0,
        "at-risk": 0
    }
    
    idx = 1
    users_inserted = 0
    
    for p_type in profiles:
        for _ in range(p_type["count"]):
            email = f"student{idx}@example.com"
            name = f"Student {idx}"
            
            user = session.query(User).filter(User.email == email).first()
            if not user:
                user = User(
                    email=email,
                    name=name,
                    hashed_password=get_password_hash("student123"),
                    role="student"
                )
                session.add(user)
                session.commit()
                session.refresh(user)
                users_inserted += 1
            
            students.append({"user": user, "type": p_type["type"]})
            idx += 1

    # 2. Generate Telemetry
    total_telemetry = 0
    
    for student_data in students:
        user = student_data["user"]
        p_type = student_data["type"]
        student_id_str = str(user.id) # Often represented as string ID or email in logs

        # 5 sessions per student
        for session_idx in range(5):
            module = "maths" if session_idx % 2 == 0 else "logic"
            questions = random.sample(math_questions, 8) if module == "maths" else random.sample(logic_questions, 8)
            
            # Spread roughly 1 week apart across the past 30 days
            days_ago = 30 - (session_idx * 6)
            session_start = now - timedelta(days=days_ago) + timedelta(minutes=random.randint(0, 720))
            current_time = session_start
            
            # Reset cumulative session metrics
            total_mistakes = 0
            total_idle_time = 0.0
            answered_count = 0
            total_hints = 0
            
            # Set baseline mastery parameters per profile
            if p_type == "engaged":
                current_score = random.uniform(0.75, 0.85)
                max_hints = random.randint(0, 1)
            elif p_type == "mixed":
                current_score = random.uniform(0.45, 0.6)
                max_hints = random.randint(1, 3)
            else: # at-risk
                current_score = random.uniform(0.10, 0.25)
                max_hints = random.randint(3, 6)

            for q_idx in range(8):
                is_last = (q_idx == 7)
                q_text = questions[q_idx]
                
                # Determine target SI for this row
                if p_type == "engaged":
                    target_si = random.uniform(0.05, 0.20)
                    is_correct = True if random.random() < 0.85 else False
                elif p_type == "mixed":
                    target_si = random.uniform(0.20, 0.55)
                    is_correct = True if random.random() < 0.6 else False
                else: 
                    target_si = random.uniform(0.55, 0.90)
                    is_correct = True if random.random() < 0.25 else False
                
                # Adjust metrics based on correct/incorrect
                if is_correct:
                    current_score = min(1.0, current_score + random.uniform(0.02, 0.08))
                    answered_count += 1
                else:
                    total_mistakes += 1
                
                # Assign hints incrementally
                if total_hints < max_hints and not is_correct and random.random() < 0.6:
                    total_hints += 1

                # Determine attempts and idle time
                is_unengaged = False
                
                # Force frequent 'Unengaged' states for at-risk students
                if p_type == "at-risk" and random.random() < 0.35:
                    is_unengaged = True
                    idle_time = random.uniform(65, 110)
                    attempt_count = 0
                    is_correct = False
                else:
                    if p_type == "engaged":
                        attempt_count = 1 if is_correct else random.randint(1, 2)
                    elif p_type == "mixed":
                        attempt_count = random.randint(1, 3)
                    else:
                        attempt_count = random.randint(2, 5)
                        
                    # Back-calculate idle time to roughly match the target SI
                    # target_si = 0.4*(idle/120) + 0.4*(attempt/5) - 0.2*(score)
                    required_si_component = target_si + (0.2 * current_score)
                    required_si_component = max(0, required_si_component)
                    
                    attempt_comp = 0.4 * (attempt_count / 5.0)
                    idle_comp = required_si_component - attempt_comp
                    if idle_comp < 0: idle_comp = 0
                    
                    idle_time = (idle_comp / 0.4) * 120.0
                    idle_time = max(1.0, min(120.0, idle_time)) # clamp to sensible values
                
                total_idle_time += idle_time
                
                # Compute exact SI and State based on exact formulas
                actual_si = calculate_si(idle_time, attempt_count, current_score)
                state = calculate_state(is_correct, attempt_count, idle_time)
                
                # Time jumps naturally inside the session
                current_time = current_time + timedelta(seconds=int(idle_time) + random.randint(5, 20))
                
                log = TelemetryLog(
                    student_id=student_id_str,
                    student_name=user.name,
                    module=module,
                    current_question_text=q_text,
                    idle_time=float(idle_time),
                    attempt_count=attempt_count,
                    is_correct=is_correct,
                    current_score=float(current_score),
                    total_mistakes=total_mistakes,
                    total_idle_time=float(total_idle_time),
                    answered_count=answered_count,
                    total_hints_requested=total_hints,
                    learner_state=state,
                    struggle_index=float(actual_si),
                    timestamp=current_time.isoformat() + "Z",
                    type="session_complete" if is_last else "interval_update"
                )
                session.add(log)
                total_telemetry += 1
                summary[p_type] += 1
        
    session.commit()
    session.close()

    print(f"\n✅ Learner Database Seed Complete!")
    print(f"=====================================")
    print(f"- New Students Inserted: {users_inserted}")
    print(f"- Total Telemetry Rows Inserted: {total_telemetry}")
    print(f"\n📊 Profile Breakdown:")
    print(f"  - Engaged Rows: {summary['engaged']}")
    print(f"  - Mixed Rows:   {summary['mixed']}")
    print(f"  - At-Risk Rows: {summary['at-risk']}\n")

if __name__ == "__main__":
    seed()
