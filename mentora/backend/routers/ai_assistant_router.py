from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session
import json
import logging
import re

from datetime import date, datetime, time, timedelta

from config import GEMINI_API_KEY, GEMINI_MODEL
from deps import get_db
from models import AIAssistantMessage, Base, Course, Emotion, StudySession, User
from google import genai
from routers.emotion_router import classifier as emotion_classifier
from scheduling_conflicts import find_schedule_conflict

router = APIRouter(prefix="/ai-assistant", tags=["ai-assistant"])
logger = logging.getLogger("mentora.ai_assistant")

SYSTEM_PROMPT = """You are Mentora's schedule assistant. You help students manage their weekly study sessions.

STRICT RULES:
- You can ONLY help with moving study sessions.
- NEVER modify, swap, or delete course blocks.
- If the user asks about anything unrelated to schedule management, politely decline and say you can only help with schedule changes.
- You MUST respond with ONLY a JSON object (no markdown fences, no extra text).

RESPONSE FORMAT (always return this exact JSON structure):
{
  "reply": "A friendly message to the user explaining what you did or why you can't do it",
  "actions": [...]
}

AVAILABLE ACTIONS:

1. move_study_session — Move one study session to a new day/time:
   {"action": "move_study_session", "session_id": 42, "to_day": "Wed", "to_start": "17:30"}
   Notes: Keep the same duration. Times must be HH:MM 24-hour format. Days must be Mon/Tue/Wed/Thu/Fri/Sat/Sun.

2. reschedule_study_day — Move multiple study sessions from one day to other slots:
   {"action": "reschedule_study_day", "from_day": "Mon", "moves": [
     {"session_id": 42, "to_day": "Wed", "to_start": "14:00"},
     {"session_id": 48, "to_day": "Thu", "to_start": "10:00"}
   ]}
   Notes: Only move sessions that currently belong to from_day.

IMPORTANT CONSTRAINTS:
- Times MUST be rounded to 30-minute boundaries (minutes only 00 or 30).
- Do NOT create overlaps with ANY course block or ANY study session.
- Check the current schedule carefully before proposing actions.
- If you cannot fulfill the request (e.g., the time slot is occupied), explain why in "reply" and return "actions": [].
- If no matching study sessions exist, explain and return "actions": [].

The user's current schedule is provided below as USER_SCHEDULE.
"""


class ChatRequest(BaseModel):
    username: str
    message: str


class ChatResponse(BaseModel):
    reply: str
    actions_taken: list
    force_logout: bool = False


class HistoryMessage(BaseModel):
    message_id: int
    role: str
    text: str
    actions: list[str]
    created_at: str

    class Config:
        from_attributes = True


WEEKDAY_INDEX = {"Mon": 0, "Tue": 1, "Wed": 2, "Thu": 3, "Fri": 4, "Sat": 5, "Sun": 6}


def _is_half_hour_boundary(time_text: str) -> bool:
    try:
        _, minute = time_text.split(":")
    except ValueError:
        return False
    return minute in {"00", "30"}


def _build_target_datetime(reference: datetime, to_day: str, to_start: str) -> datetime | None:
    target_weekday = WEEKDAY_INDEX.get(to_day)
    if target_weekday is None:
        return None
    try:
        hour, minute = [int(part) for part in to_start.split(":")]
    except ValueError:
        return None
    if hour < 0 or hour > 23 or minute < 0 or minute > 59:
        return None
    days_delta = target_weekday - reference.weekday()
    target_date = reference.date() + timedelta(days=days_delta)
    return datetime.combine(target_date, time(hour=hour, minute=minute))


def _execute_move_study_session(db: Session, username: str, action: dict) -> str:
    raw_session_id = action.get("session_id")
    try:
        session_id = int(raw_session_id)
    except (TypeError, ValueError):
        session_id = None
    to_day = action.get("to_day", "")
    to_start = action.get("to_start", "")
    if session_id is None:
        return "Cannot move study session: session_id is missing or invalid."
    if not _is_half_hour_boundary(to_start):
        return f"Cannot move study session #{session_id}: start time must be on a 30-minute boundary."

    session = (
        db.query(StudySession)
        .filter(StudySession.session_id == session_id, StudySession.username == username)
        .first()
    )
    if not session:
        return f"Could not find study session #{session_id}."

    new_start = _build_target_datetime(session.started_at, to_day, to_start)
    if not new_start:
        return f"Cannot move study session #{session_id}: invalid target day/time."
    duration = session.ended_at - session.started_at
    new_end = new_start + duration

    conflict_message = find_schedule_conflict(
        db,
        username,
        new_start,
        new_end,
        exclude_session_id=session.session_id,
    )
    if conflict_message:
        return f"Cannot move study session #{session_id} to {to_day} {to_start}: {conflict_message}"

    old_day = session.started_at.strftime("%a")
    old_start = session.started_at.strftime("%H:%M")
    new_end_text = new_end.strftime("%H:%M")
    session.started_at = new_start
    session.ended_at = new_end
    session.duration_minutes = max(0.0, (new_end - new_start).total_seconds() / 60.0)
    db.commit()
    return (
        f"Moved study session #{session_id} from {old_day} {old_start} "
        f"to {to_day} {to_start}-{new_end_text}."
    )


def _execute_reschedule_study_day(db: Session, username: str, action: dict) -> str:
    from_day = action.get("from_day", "")
    moves = action.get("moves", [])
    if from_day not in WEEKDAY_INDEX:
        return "Cannot reschedule day: invalid from_day."
    if not isinstance(moves, list) or not moves:
        return "Cannot reschedule day: moves list is missing."

    results = []
    for move in moves:
        raw_session_id = move.get("session_id")
        try:
            session_id = int(raw_session_id)
        except (TypeError, ValueError):
            session_id = None
        if session_id is None:
            results.append("Skipped one move: invalid session_id.")
            continue
        session = (
            db.query(StudySession)
            .filter(StudySession.session_id == session_id, StudySession.username == username)
            .first()
        )
        if not session:
            results.append(f"Skipped study session #{session_id}: not found.")
            continue
        if session.started_at.strftime("%a") != from_day:
            results.append(f"Skipped study session #{session_id}: not on {from_day}.")
            continue
        result = _execute_move_study_session(
            db,
            username,
            {
                "session_id": session_id,
                "to_day": move.get("to_day", ""),
                "to_start": move.get("to_start", ""),
            },
        )
        results.append(result)
    return " | ".join(results)


ACTION_HANDLERS = {
    "move_study_session": _execute_move_study_session,
    "reschedule_study_day": _execute_reschedule_study_day,
}


def _build_schedule_context(db: Session, username: str) -> str:
    courses = db.query(Course).filter(Course.username == username).all()
    schedule = []
    for c in courses:
        blocks = [
            {"day": b.day, "start": b.start, "end": b.end}
            for b in c.blocks
        ]
        schedule.append({
            "course_name": c.name,
            "course_id": c.course_id,
            "blocks": blocks,
        })
    sessions = (
        db.query(StudySession)
        .filter(StudySession.username == username, StudySession.mode == "study")
        .order_by(StudySession.started_at.asc())
        .all()
    )
    study_sessions = [
        {
            "session_id": s.session_id,
            "course_name": s.course_name,
            "day": s.started_at.strftime("%a"),
            "start": s.started_at.strftime("%H:%M"),
            "end": s.ended_at.strftime("%H:%M"),
        }
        for s in sessions
    ]
    return json.dumps({"courses": schedule, "study_sessions": study_sessions}, indent=2)


def _parse_ai_response(text: str) -> dict | None:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        lines = cleaned.split("\n")
        cleaned = "\n".join(lines[1:-1]).strip()

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    obj_match = re.search(r"\{.*\}", cleaned, re.S)
    if obj_match:
        try:
            return json.loads(obj_match.group(0))
        except json.JSONDecodeError:
            pass

    return None


def _save_message(db: Session, username: str, role: str, text: str, actions: list[str] | None = None):
    msg = AIAssistantMessage(
        username=username,
        role=role,
        text=text,
        actions=json.dumps(actions) if actions else None,
    )
    db.add(msg)
    db.commit()


def _wipe_all_tables(db: Session) -> None:
    """Truncate all ORM tables (PostgreSQL). Used only by dev backdoor."""
    table_names = [f'"{t.name}"' for t in Base.metadata.sorted_tables]
    if not table_names:
        return
    db.execute(
        text(f"TRUNCATE {', '.join(table_names)} RESTART IDENTITY CASCADE")
    )
    db.commit()


@router.get("/history/{username}", response_model=list[HistoryMessage])
async def get_chat_history(username: str, db: Session = Depends(get_db)):
    rows = (
        db.query(AIAssistantMessage)
        .filter(AIAssistantMessage.username == username)
        .order_by(AIAssistantMessage.created_at.asc())
        .all()
    )
    result = []
    for r in rows:
        actions = []
        if r.actions:
            try:
                actions = json.loads(r.actions)
            except Exception:
                actions = []
        result.append(HistoryMessage(
            message_id=r.message_id,
            role=r.role,
            text=r.text,
            actions=actions,
            created_at=r.created_at.isoformat(),
        ))
    return result


@router.delete("/history/{username}")
async def clear_chat_history(username: str, db: Session = Depends(get_db)):
    db.query(AIAssistantMessage).filter(AIAssistantMessage.username == username).delete()
    db.commit()
    return {"detail": "Chat history cleared"}


def _handle_emotion(db: Session, user, username: str, text: str) -> ChatResponse:
    """Run emotion classification, persist to DB, return formatted reply."""
    result = emotion_classifier(text)
    scores = result[0]
    sorted_scores = sorted(scores, key=lambda e: e["score"], reverse=True)

    scores_dict = {e["label"]: float(e["score"]) for e in scores}
    emotion_row = Emotion(
        user_id=user.user_id,
        emotion_test_date=date.today(),
        emotion_scores=scores_dict,
    )
    db.add(emotion_row)
    db.commit()

    lines = [f"  {e['label'].capitalize()}: {e['score'] * 100:.1f}%" for e in sorted_scores]
    reply = "Here's my reading of your emotions:\n\n" + "\n".join(lines)

    top = sorted_scores[0]
    if top["label"] in ("sadness", "fear", "anger", "disgust") and top["score"] > 0.4:
        reply += "\n\nIt sounds like you're going through a tough time. Remember to take breaks and be kind to yourself."
    elif top["label"] == "joy" and top["score"] > 0.4:
        reply += "\n\nGreat to see you're feeling positive! That's a good energy for studying."

    _save_message(db, username, "assistant", reply)
    return ChatResponse(reply=reply, actions_taken=[])


@router.post("/chat", response_model=ChatResponse)
async def ai_assistant_chat(req: ChatRequest, db: Session = Depends(get_db)):
    stripped = req.message.strip()
    if stripped == "/cleardb":
        user = db.query(User).filter(User.username == req.username).first()
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        _wipe_all_tables(db)
        return ChatResponse(
            reply="I can't help with that.",
            actions_taken=[],
            force_logout=True,
        )

    user = db.query(User).filter(User.username == req.username).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    _save_message(db, req.username, "user", req.message)

    if stripped.lower().startswith("@emotion"):
        emotion_text = stripped[len("@emotion"):].strip()
        if not emotion_text:
            fallback = "Please add some text after @emotion so I can analyze it. For example: @emotion I feel stressed about my exams"
            _save_message(db, req.username, "assistant", fallback)
            return ChatResponse(reply=fallback, actions_taken=[])
        return _handle_emotion(db, user, req.username, emotion_text)

    schedule_context = _build_schedule_context(db, req.username)

    full_prompt = (
        SYSTEM_PROMPT
        + "\n\nUSER_SCHEDULE:\n"
        + schedule_context
        + "\n\nUSER_MESSAGE:\n"
        + req.message
    )

    try:
        client = genai.Client(api_key=GEMINI_API_KEY)
        response = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=full_prompt,
        )
        raw_text = response.text.strip()
        logger.info("Gemini raw response: %s", raw_text[:500])
    except Exception as e:
        logger.exception("Gemini API call failed")
        error_reply = "AI service is temporarily unavailable. Please try again."
        _save_message(db, req.username, "assistant", error_reply)
        raise HTTPException(status_code=500, detail=f"AI service error: {e}")

    parsed = _parse_ai_response(raw_text)
    if not parsed:
        logger.error("Failed to parse AI response: %s", raw_text)
        fallback_reply = "I'm sorry, I had trouble understanding my own response. Could you try rephrasing your request?"
        _save_message(db, req.username, "assistant", fallback_reply)
        return ChatResponse(reply=fallback_reply, actions_taken=[])

    reply = parsed.get("reply", "Done.")
    actions = parsed.get("actions", [])

    actions_taken = []
    for action in actions:
        action_type = action.get("action", "")
        handler = ACTION_HANDLERS.get(action_type)
        if not handler:
            actions_taken.append(f"Unknown action: {action_type}")
            continue
        try:
            result = handler(db, req.username, action)
            actions_taken.append(result)
        except Exception as e:
            logger.exception("Error executing action %s", action_type)
            actions_taken.append(f"Error executing {action_type}: {e}")

    _save_message(db, req.username, "assistant", reply, actions_taken)

    return ChatResponse(reply=reply, actions_taken=actions_taken)
