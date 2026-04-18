import os
import sys
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

# Initialize app
load_dotenv()
app = FastAPI(title="Learner Modeling Engine API")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Standard imports from sibling folders (routers and models)
from database import Base, engine
from routers import auth, ws, hints, questions
from routers.analytics import analytics_router
from routers import student

# Ensure database tables are created
try:
    Base.metadata.create_all(bind=engine)
    print("Database tables synchronized successfully.")
except Exception as e:
    print(f"Database sync warning (safe if tables exist): {e}")

# Register Routers with /api prefix for Vercel compatibility
app.include_router(auth.router, prefix="/api")
app.include_router(ws.router, prefix="/api")
app.include_router(hints.router, prefix="/api")
app.include_router(analytics_router, prefix="/api/analytics", tags=["analytics"])
app.include_router(student.router, prefix="/api/student", tags=["student"])
app.include_router(questions.router, prefix="/api/questions", tags=["questions"])

@app.get("/api/health")
def health_check():
    return {"status": "healthy", "environment": "vercel"}

@app.get("/")
def read_root():
    return {"message": "LME Backend is running"}
