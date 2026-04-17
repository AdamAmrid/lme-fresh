import os
import random
from datetime import datetime, timedelta
import bcrypt
from sqlalchemy import create_engine, Column, Integer, String, Float, Boolean, Text
from sqlalchemy.orm import declarative_base, sessionmaker

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

Base.metadata.create_all(bind=engine)

math_questions = ["What is 12 × 7?", "Solve for x: 2x + 5 = 17", "What is √144?", "What is 15% of 200?", "Simplify: 3/4 + 1/6", "What is 2³ × 5?", "Find the area of a circle with radius 4", "What is the LCM of 8 and 12?", "Solve: 5x − 3 = 22", "What is 0.25 as a fraction?"]
logic_questions = ["If all A are B and all B are C, are all A C?", "Which number comes next: 2, 4, 8, 16, __?", "If today is Monday, what day is it in 100 days?", "A bat and ball cost $1.10. The bat costs $1 more. How much is the ball?", "What is the odd one out: 3, 5, 7, 8, 11?", "If FAST → SLOW, then WARM → ?", "Complete: 1, 1, 2, 3, 5, 8, __", "If some cats are dogs and all dogs are fish, can some cats be fish?", "What comes next: AZ, BY, CX, __?", "How many months have 28 days?"]

profiles = [
    {"type": "engaged", "count": 50},
    {"type": "mixed", "count": 30},
    {"type": "at-risk", "count": 20}
]

def calculate_state(is_correct, attempt_count, idle_time):
    if is_correct: return "Engaged"
    elif attempt_count == 0 and idle_time < 20: return "Engaged"
    elif idle_time > 60: return "Unengaged"
    elif idle_time >= 30 or attempt_count >= 3: return "Struggling"
    else: return "Engaged"

def calculate_si(idle_time, attempt_count, current_score):
    return (0.4 * (idle_time / 120.0)) + (0.4 * (attempt_count / 5.0)) - (0.2 * (current_score / 1.0))

def seed():
    session = SessionLocal()
    
    print("Clearing purely artificial database bounds...")
    session.query(TelemetryLog).delete()
    session.query(User).filter(User.role == 'student').delete()
    session.commit()
    
    students = []
    now = datetime.now()
    summary = {"engaged": 0, "mixed": 0, "at-risk": 0}
    idx = 1
    users_inserted = 0
    
    for p_type in profiles:
        for _ in range(p_type["count"]):
            email = f"student{idx}@example.com"
            name = f"Student {idx}"
            user = session.query(User).filter(User.email == email).first()
            if not user:
                user = User(email=email, name=name, hashed_password=get_password_hash("student123"), role="student")
                session.add(user)
                session.commit()
                session.refresh(user)
                users_inserted += 1
            
            students.append({"user": user, "type": p_type["type"]})
            idx += 1

    total_telemetry = 0
    for student_data in students:
        user = student_data["user"]
        p_type = student_data["type"]
        student_id_str = str(user.email)
        
        for session_idx in range(5):
            module = "maths" if session_idx % 2 == 0 else "logic"
            questions = random.sample(math_questions, 8) if module == "maths" else random.sample(logic_questions, 8)
            
            days_ago = 30 - (session_idx * 6)
            session_start = now - timedelta(days=days_ago) + timedelta(minutes=random.randint(0, 720))
            current_time = session_start
            
            total_mistakes = 0
            total_idle_time = 0.0
            answered_count = 0
            total_hints = 0
            
            # Allow organic score starting lines
            current_score = random.uniform(0.40, 0.85) if p_type == "engaged" else (random.uniform(0.20, 0.60) if p_type == "mixed" else random.uniform(0.10, 0.40))
            
            # Universal hints rule - Real classrooms have everyone use hints!
            max_hints = random.randint(1, 5)

            for q_idx in range(8):
                is_last = (q_idx == 7)
                q_text = questions[q_idx]
                
                # Introduce ~15% organic behavioral crossover (e.g., At-Risk students randomly getting high scores, Engaged students occasionally zoning out)
                # This naturally pushes the accuracy to exactly ~80% geometrically!
                actual_type = p_type
                if random.random() < 0.15:
                    actual_type = random.choice(["engaged", "mixed", "at-risk"])
                
                if actual_type == "engaged":
                    target_si = random.uniform(0.05, 0.40)
                    is_correct = True if random.random() < 0.85 else False
                elif actual_type == "mixed":
                    target_si = random.uniform(0.30, 0.65)
                    is_correct = True if random.random() < 0.50 else False
                else: 
                    target_si = random.uniform(0.60, 0.95)
                    is_correct = True if random.random() < 0.20 else False
                
                if is_correct:
                    current_score = min(1.0, current_score + random.uniform(0.02, 0.08))
                    answered_count += 1
                else:
                    total_mistakes += 1
                
                # Hints are organically queried by all students (engaged students double-checking, at-risk students guessing)
                if total_hints < max_hints and random.random() < 0.4:
                    total_hints += 1

                is_unengaged = False
                if actual_type == "at-risk" and random.random() < 0.60:
                    is_unengaged = True
                    idle_time = random.uniform(65, 110)
                    attempt_count = 0
                    is_correct = False
                else:
                    if actual_type == "engaged": attempt_count = 1 if is_correct else random.randint(1, 2)
                    elif actual_type == "mixed": attempt_count = random.randint(1, 3)
                    else: attempt_count = random.randint(2, 5)
                        
                    required_si_component = max(0, target_si + (0.2 * current_score))
                    attempt_comp = 0.4 * (attempt_count / 5.0)
                    idle_comp = max(0, required_si_component - attempt_comp)
                    idle_time = max(1.0, min(120.0, (idle_comp / 0.4) * 120.0))
                
                total_idle_time += idle_time
                actual_si = calculate_si(idle_time, attempt_count, current_score)
                state = calculate_state(is_correct, attempt_count, idle_time)
                
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

    print(f"\n=====================================")
    print(f"✅ Organic Classroom Database Seed Complete!")
    print(f"=====================================")

if __name__ == "__main__":
    seed()
