from sqlalchemy import Column, Integer, String, Float, DateTime, Boolean
from database import Base
from pydantic import BaseModel
from datetime import datetime

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    role = Column(String)
    name = Column(String)

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

class UserCreate(BaseModel):
    email: str
    password: str
    role: str
    name: str

class UserLogin(BaseModel):
    email: str
    password: str

class UserResponse(BaseModel):
    id: int
    email: str
    role: str
    name: str
    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str
