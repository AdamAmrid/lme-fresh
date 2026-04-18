from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func
import os, json, logging
from openai import OpenAI
from dotenv import load_dotenv

from backend.database import get_db
from backend.models.learner_state import TelemetryLog

load_dotenv()
router = APIRouter(tags=["AI Question Generator"])
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
logger = logging.getLogger("LME-Questions")

class QuestionGenerationRequest(BaseModel):
    student_email: str
    module: str

@router.post("/generate")
async def generate_adaptive_questions(req: QuestionGenerationRequest, db: Session = Depends(get_db)):
    if not os.getenv("OPENAI_API_KEY"):
        raise HTTPException(status_code=500, detail="OpenAI API key not configured")

    # 1. Fetch Student Metrics from logs
    # We look at the last 50 events to calculate recent performance
    logs = db.query(TelemetryLog).filter(
        TelemetryLog.student_id == req.student_email,
        TelemetryLog.module == req.module
    ).order_by(TelemetryLog.id.desc()).limit(50).all()

    if not logs:
        # Fallback if no logs found despite logic check
        return {"mode": "static", "reason": "No logs found"}

    # Calculate metrics
    avg_mastery = sum([l.current_score for l in logs]) / len(logs)
    avg_si = sum([l.struggle_index for l in logs]) / len(logs)
    
    # Calculate unengaged ratio (e.g. idle_time > 60s)
    unengaged_count = len([l for l in logs if (l.idle_time or 0) > 60])
    unengaged_ratio = unengaged_count / len(logs)

    # 2. Build the System Prompt
    system_prompt = f"""You are an Adaptive Question Generator for the Learner Modeling Engine. Your goal is to generate 10 questions for a specific student based on their calculated Cognitive and Behavioral Level.

STUDENT DOMAIN: {req.module}

Input Metrics (Current Student State):
- Mastery Score: {avg_mastery:.2f} (Determines conceptual difficulty)
- Struggle Index (SI): {avg_si:.2f} (Determines scaffolding needed)
- Unengaged Ratio: {unengaged_ratio:.2f} (Determines narrative complexity/hook)

Level Adaptation Instructions:

Level 1 (Foundational - Mastery < 0.4):
- Generate basic, single-step problems.
- Use clear, non-technical language.
- If SI is high: Break the question into small, manageable logic steps.

Level 2 (Intermediate - Mastery 0.4 - 0.7):
- Generate standard multi-step problems.
- If Unengaged is high: Use a 'Real-World Narrative' (e.g., shopping, gaming, or science) to frame the problem to increase emotional buy-in.

Level 3 (Advanced/Expert - Mastery > 0.7):
- Generate complex, abstract problems with 'distractor' information.
- Reduce explicit hints to encourage high-level critical thinking.

Response Requirement:
Return ONLY a JSON array of 10 objects. Each object must include:
- text: The adapted question.
- options: 4 choices.
- correct: The correct choice.
- difficulty: ("easy", "medium", or "hard").
- adaptation_log: A one-sentence internal note explaining why this matches the student's metrics.
"""

    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Generate 10 adaptive {req.module} questions for this student profile."}
            ],
            response_format={ "type": "json_object" } if "gpt-4o" in "gpt-4o-mini" else None,
            max_tokens=2000,
            temperature=0.7
        )
        
        raw_content = response.choices[0].message.content.strip()
        # Handle cases where AI wraps in markdown blocks
        if raw_content.startswith("```json"):
            raw_content = raw_content.replace("```json", "").replace("```", "").strip()
        
        data = json.loads(raw_content)
        
        # Accept either {"questions": [...]} or just [...]
        questions = data.get("questions") if isinstance(data, dict) else data
        if not questions: questions = data

        return {
            "mode": "adaptive",
            "metrics": {
                "mastery": round(avg_mastery, 2),
                "si": round(avg_si, 2),
                "unengaged": round(unengaged_ratio, 2)
            },
            "questions": questions[:10]
        }

    except Exception as e:
        logger.error(f"Generation error: {str(e)}")
        # Fallback to frontend static if AI fails
        raise HTTPException(status_code=500, detail=str(e))
