from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from openai import OpenAI
import os, logging
from dotenv import load_dotenv

load_dotenv()
router = APIRouter(tags=["hints"])
logger = logging.getLogger("LME-Hints")
api_key = os.getenv("OPENAI_API_KEY")
if not api_key:
    logger.warning("OPENAI_API_KEY not found in environment. AI hints will be disabled.")
    client = None
else:
    client = OpenAI(api_key=api_key)


class HintMessage(BaseModel):
    role: str        # "user" or "assistant"
    content: str


class HintRequest(BaseModel):
    question_text: str
    module: str
    attempt_count: int
    current_score: float       # mastery as decimal 0.0–1.0
    difficulty: str
    total_mistakes: int
    answered_count: int
    total_questions: int
    history: list[HintMessage]  # full session hint conversation history
    hints_on_question: int = 0  # how many hints already received on THIS question


class HintResponse(BaseModel):
    hint: str
    intent: str
    scaffolding_level: int     # 1–4


@router.post("/hint", response_model=HintResponse)
async def get_hint(req: HintRequest):
    if not os.getenv("OPENAI_API_KEY"):
        raise HTTPException(status_code=500, detail="OpenAI API key not configured")

    # ── STEP 1: SCAFFOLDING LEVEL FROM MASTERY (Vygotsky ZPD) ─────────
    if req.current_score >= 0.80:
        scaffolding_level = 1
        scaffolding_desc = (
            "highly autonomous. Use open-ended probes only. Trust the student. "
            "Focus on enrichment and deeper thinking."
        )
    elif req.current_score >= 0.60:
        scaffolding_level = 2
        scaffolding_desc = (
            "mostly independent. Ask guiding questions. "
            "Encourage self-monitoring before hinting directly."
        )
    elif req.current_score >= 0.40:
        scaffolding_level = 3
        scaffolding_desc = (
            "needing regular support. Break down the problem into steps. "
            "Be more explicit about the approach needed."
        )
    else:
        scaffolding_level = 4
        scaffolding_desc = (
            "requiring substantial guidance. Give explicit step-by-step instruction. "
            "Be direct and supportive."
        )

    # ── STEP 2: SELECT TUTORING INTENT (combined escalation signal) ──
    # escalation = failed attempts + hints already asked on this question
    escalation = req.attempt_count + req.hints_on_question

    if escalation >= 6 or req.attempt_count >= 5:
        intent = "Reassure"
        intent_desc = (
            "The student is very frustrated after many failures. First warmly acknowledge "
            "the difficulty and normalize struggle ('this is a tough one!'). "
            "Then give a very direct hint. Lead with empathy before guidance."
        )
    elif escalation >= 4 or req.attempt_count >= 3:
        intent = "Teach"
        intent_desc = (
            "Multiple failed attempts and/or hint requests indicate a conceptual gap. "
            "Explicitly explain the key concept, formula, or reasoning approach. "
            "Build on any hints already given — be more specific. Still don't give the answer."
        )
    elif escalation >= 2 or req.attempt_count == 2:
        intent = "Hint"
        intent_desc = (
            "Second escalation event. Provide a more specific targeted clue than before. "
            "Be more direct than previous hints but still don't give the answer."
        )
    elif escalation == 1 or req.attempt_count == 1:
        intent = "Guide Self-Correction"
        intent_desc = (
            "First hint request. Prompt the student to find their own error. "
            "Ask a targeted question that directs attention to the specific mistake without revealing it."
        )
    else:
        intent = "Encourage"
        intent_desc = "Provide warm encouragement and a gentle nudge in the right direction."

    # ── STEP 3: BUILD DYNAMIC SYSTEM PROMPT ───────────────────────────
    scaf_behaviour = {
        1: "Use open-ended probes. Minimal intervention. The student is doing well — trust them to figure it out with a light nudge.",
        2: "Ask guiding questions first. Encourage self-monitoring. Only hint directly if they push back.",
        3: "Break down the problem into smaller steps. Be more explicit about the method or formula needed.",
        4: "Give clear, explicit step-by-step guidance. This student needs substantial support — be direct but still encouraging.",
    }

    system_prompt = f"""You are an expert, encouraging tutor inside an adaptive learning app \
called LME (Learner Modeling Engine). You implement a research-based Intelligent Tutoring \
System (ITS) grounded in Vygotsky's Zone of Proximal Development and Productive Failure theory.

ABSOLUTE RULES — never break these:
1. NEVER give the direct answer to any question — this is the most important rule
2. Always guide the student to think for themselves
3. Maximum 2–3 sentences per response — be concise
4. Be warm, encouraging, and age-appropriate at all times
5. Never be condescending or make the student feel bad for struggling
6. Adapt language complexity to the difficulty level:
   - Easy questions: simple everyday language
   - Medium questions: clear academic language
   - Hard questions: more technical, precise language

YOUR CURRENT TUTORING INTENT: {intent}
Intent guidance: {intent_desc}

CURRENT STUDENT PROFILE:
- Module: {req.module}
- Question difficulty: {req.difficulty}
- Mastery score this session: {round(req.current_score * 100)}%
- Failed attempts on this question: {req.attempt_count}
- Total mistakes this session: {req.total_mistakes}
- Progress: {req.answered_count} of {req.total_questions} questions answered
- Scaffolding level: {scaffolding_level}/4 — this student is {scaffolding_desc}

SCAFFOLDING BEHAVIOUR FOR THIS STUDENT:
{scaf_behaviour[scaffolding_level]}

CURRENT QUESTION: {req.question_text}

{f'''IMPORTANT — PRIOR HINTS ON THIS QUESTION:
The student has already received {req.hints_on_question} hint(s) on this exact question.
You MUST be MORE SPECIFIC than what you said before.
Do NOT repeat phrases or ideas from previous hints — build directly on them.
Each successive hint should reveal one more concrete step toward the solution.''' if req.hints_on_question > 0 else ''}

You are in an ongoing tutoring conversation that spans the full session.
Be consistent with what you have already told the student.
Build on previous hints — never repeat yourself.
If the student is on a different question now, acknowledge the transition naturally."""

    # ── STEP 4: BUILD MESSAGES WITH FULL SESSION HISTORY ──────────────
    messages = [{"role": "system", "content": system_prompt}]
    for msg in req.history:
        messages.append({"role": msg.role, "content": msg.content})

    current_user_msg = (
        f"I'm working on this {req.module} question ({req.difficulty} difficulty): "
        f'"{req.question_text}". '
        f"I've tried {req.attempt_count} time(s) and got it wrong. Please help me."
    )
    messages.append({"role": "user", "content": current_user_msg})

    # ── STEP 5: CALL OPENAI ────────────────────────────────────────────
    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            max_tokens=150,
            temperature=0.7
        )
        hint = response.choices[0].message.content.strip()

        logger.info(
            f"[HINT] intent={intent} | scaffolding={scaffolding_level} | "
            f"attempts={req.attempt_count} | hints_on_q={req.hints_on_question} | "
            f"escalation={req.attempt_count + req.hints_on_question} | "
            f"score={round(req.current_score * 100)}% | "
            f"history_msgs={len(req.history)} | module={req.module}"
        )

        return HintResponse(hint=hint, intent=intent, scaffolding_level=scaffolding_level)

    except Exception as e:
        logger.error(f"[HINT] OpenAI error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"OpenAI error: {str(e)}")
