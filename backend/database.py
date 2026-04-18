import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = (
    os.getenv("DATABASE_URL") or 
    os.getenv("POSTGRES_URL") or 
    os.getenv("POSTGRES_URL_NON_POOLING") or 
    os.getenv("STORAGE_URL") or
    os.getenv("PRISMA_DATABASE_URL")
)

if DATABASE_URL:
    print(f"DATABASE_URL found: {DATABASE_URL[:10]}...{DATABASE_URL[-5:]}")
else:
    print("DATABASE_URL NOT FOUND! Falling back to SQLite.")

# Automatic Fallback for Local/Cloud distinction
if not DATABASE_URL:
    # Local Development - Force it to the backend folder to match existing data
    DATABASE_URL = "sqlite:///./backend/lme.db"
    print(f"Using Local SQLite: {DATABASE_URL}")
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
