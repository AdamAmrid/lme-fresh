import os
import sys

# Ensure the root directory is in the path so 'backend.xxx' imports work
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()
app = FastAPI(title="Learner Modeling Engine API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from backend.database import Base, engine
from backend.routers import auth, ws, hints, questions
from backend.routers.analytics import analytics_router
from backend.routers import student

try:
    Base.metadata.create_all(bind=engine)
except Exception as e:
    print(f"DB Sync: {e}")

app.include_router(auth.router, prefix="/api")
app.include_router(ws.router, prefix="/api")
app.include_router(hints.router, prefix="/api")
app.include_router(analytics_router, prefix="/api/analytics", tags=["analytics"])
app.include_router(student.router, prefix="/api/student", tags=["student"])
app.include_router(questions.router, prefix="/api/questions", tags=["questions"])

@app.get("/api/health")
def health():
    return {"status": "healthy"}
