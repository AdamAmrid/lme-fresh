import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL") or os.getenv("POSTGRES_URL")

# Automatic Fallback for Local/Cloud distinction
if not DATABASE_URL:
    # Local Development
    DATABASE_URL = "sqlite:///./lme.db"
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
else:
    # Cloud Production (Postgres on Vercel/Supabase/Heroku)
    # Fix for SQLAlchemy 1.4+ which requires "postgresql://" instead of "postgres://"
    if DATABASE_URL.startswith("postgres://"):
        DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)
    engine = create_engine(DATABASE_URL)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
