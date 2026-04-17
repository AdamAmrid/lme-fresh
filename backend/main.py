from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os

# Load workspace environment variables FIRST
load_dotenv()

from database import Base, engine
from routers import auth, ws, hints, questions
# Initialize the SQLAlchemy models
Base.metadata.create_all(bind=engine)

from contextlib import asynccontextmanager
from models.risk_model import train_risk_model

@asynccontextmanager
async def lifespan(app: FastAPI):
    train_risk_model()
    yield

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Relax for cloud deployment
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from routers.analytics import analytics_router
from routers import student

app.include_router(auth.router, prefix="/api")
app.include_router(ws.router, prefix="/api")
app.include_router(hints.router, prefix="/api")
app.include_router(analytics_router, prefix="/api/analytics", tags=["analytics"])
app.include_router(student.router, prefix="/api/student", tags=["student"])
app.include_router(questions.router, prefix="/api/questions", tags=["questions"])

@app.get("/")
def root():
    return {"status": "Learner Modeling Engine Backend OK"}
