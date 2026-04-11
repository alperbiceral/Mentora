from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
import json
import logging
import re

from config import GEMINI_API_KEY, GEMINI_MODEL
from deps import get_db
from models import AIAssistantMessage, Course, CourseBlock, User
from google import genai

router = APIRouter(prefix="/ai-assistant", tags=["ai-assistant"])
logger = logging.getLogger("mentora.ai_assistant")

SYSTEM_PROMPT = """You are Mentora's schedule assistant. You help students manage their weekly course schedule.

STRICT RULES:
- You can ONLY help with course schedule management (moving, swapping, clearing course blocks).
- If the user asks about anything unrelated to schedule management, politely decline and say you can only help with schedule changes.
- You MUST respond with ONLY a JSON object (no markdown fences, no extra text).

RESPONSE FORMAT (always return this exact JSON structure):
{
  "reply": "A friendly message to the user explaining what you did or why you can't do it",
  "actions": [...]
}

AVAILABLE ACTIONS:

1. move_block — Move a course block to a new day/time:
   {"action": "move_block", "course_name": "CS461", "from_day": "Mon", "from_start": "09:00", "to_day": "Wed", "to_start": "17:30"}
   Notes: The duration stays the same. "from_start" identifies which block to move. Times must be in HH:MM 24-hour format. Days must be Mon/Tue/Wed/Thu/Fri/Sat/Sun.

2. clear_day — Remove all course blocks from a day and redistribute them to other days:
   {"action": "clear_day", "day": "Mon", "redistributions": [
     {"course_name": "CS461", "from_start": "09:00", "to_day": "Wed", "to_start": "14:00"},
     {"course_name": "MATH201", "from_start": "11:00", "to_day": "Thu", "to_start": "10:00"}
   ]}
   Notes: You must look at the current schedule and find free slots on other days. Do NOT place blocks where other blocks already exist. Each redistribution moves one block.

3. swap_blocks — Swap times of two course blocks:
   {"action": "swap_blocks", "block_a": {"course_name": "CS461", "day": "Mon", "start": "09:00"}, "block_b": {"course_name": "MATH201", "day": "Wed", "start": "14:00"}}

IMPORTANT CONSTRAINTS:
- Times MUST be rounded to 30-minute boundaries (minutes only 00 or 30).
- Do NOT create overlapping blocks on the same day.
- Check the current schedule carefully before proposing actions.
- If you cannot fulfill the request (e.g., the time slot is occupied), explain why in "reply" and return "actions": [].
- If the user mentions a course that doesn't exist in their schedule, tell them and return "actions": [].

The user's current schedule is provided below as USER_SCHEDULE.
"""


class ChatRequest(BaseModel):
    username: str
    message: str


class ChatResponse(BaseModel):
    reply: str
    actions_taken: list


class HistoryMessage(BaseModel):
    message_id: int
    role: str
    text: str
    actions: list[str]
    created_at: str

    class Config:
        from_attributes = True


def _time_to_minutes(t: str) -> int:
    h, m = t.split(":")
    return int(h) * 60 + int(m)


def _minutes_to_time(mins: int) -> str:
    return f"{mins // 60:02d}:{mins % 60:02d}"


def _blocks_overlap(day1: str, s1: str, e1: str, day2: str, s2: str, e2: str) -> bool:
    if day1 != day2:
        return False
    return _time_to_minutes(s1) < _time_to_minutes(e2) and _time_to_minutes(s2) < _time_to_minutes(e1)


def _find_block(db: Session, username: str, course_name: str, day: str, start: str):
    """Find a CourseBlock by matching course name, day, and start time."""
    return (
        db.query(CourseBlock)
        .join(Course)
        .filter(
            Course.username == username,
            Course.name.ilike(f"%{course_name}%"),
            CourseBlock.day == day,
            CourseBlock.start == start,
        )
        .first()
    )


def _check_conflict(db: Session, username: str, day: str, start: str, end: str, exclude_block_id: int | None = None) -> bool:
    """Return True if placing a block at day/start/end would conflict with existing blocks."""
    all_blocks = (
        db.query(CourseBlock)
        .join(Course)
        .filter(Course.username == username, CourseBlock.day == day)
        .all()
    )
    for b in all_blocks:
        if exclude_block_id and b.block_id == exclude_block_id:
            continue
        if _blocks_overlap(day, start, end, day, b.start, b.end):
            return True
    return False


def _execute_move_block(db: Session, username: str, action: dict) -> str:
    course_name = action.get("course_name", "")
    from_day = action.get("from_day", "")
    from_start = action.get("from_start", "")
    to_day = action.get("to_day", "")
    to_start = action.get("to_start", "")

    block = _find_block(db, username, course_name, from_day, from_start)
    if not block:
        return f"Could not find a block for '{course_name}' on {from_day} at {from_start}."

    duration = _time_to_minutes(block.end) - _time_to_minutes(block.start)
    to_end = _minutes_to_time(_time_to_minutes(to_start) + duration)

    if _check_conflict(db, username, to_day, to_start, to_end, exclude_block_id=block.block_id):
        return f"Cannot move '{course_name}' to {to_day} {to_start}–{to_end}: time slot is occupied."

    block.day = to_day
    block.start = to_start
    block.end = to_end
    db.commit()
    return f"Moved '{course_name}' from {from_day} {from_start} to {to_day} {to_start}–{to_end}."


def _execute_clear_day(db: Session, username: str, action: dict) -> str:
    day = action.get("day", "")
    redistributions = action.get("redistributions", [])
    results = []

    for r in redistributions:
        move_action = {
            "course_name": r.get("course_name", ""),
            "from_day": day,
            "from_start": r.get("from_start", ""),
            "to_day": r.get("to_day", ""),
            "to_start": r.get("to_start", ""),
        }
        result = _execute_move_block(db, username, move_action)
        results.append(result)

    return " | ".join(results)


def _execute_swap_blocks(db: Session, username: str, action: dict) -> str:
    a = action.get("block_a", {})
    b = action.get("block_b", {})

    block_a = _find_block(db, username, a.get("course_name", ""), a.get("day", ""), a.get("start", ""))
    block_b = _find_block(db, username, b.get("course_name", ""), b.get("day", ""), b.get("start", ""))

    if not block_a:
        return f"Could not find block for '{a.get('course_name')}' on {a.get('day')} at {a.get('start')}."
    if not block_b:
        return f"Could not find block for '{b.get('course_name')}' on {b.get('day')} at {b.get('start')}."

    a_day, a_start, a_end = block_a.day, block_a.start, block_a.end
    b_day, b_start, b_end = block_b.day, block_b.start, block_b.end

    block_a.day = b_day
    block_a.start = b_start
    block_a.end = _minutes_to_time(
        _time_to_minutes(b_start) + (_time_to_minutes(a_end) - _time_to_minutes(a_start))
    )

    block_b.day = a_day
    block_b.start = a_start
    block_b.end = _minutes_to_time(
        _time_to_minutes(a_start) + (_time_to_minutes(b_end) - _time_to_minutes(b_start))
    )

    db.commit()
    return (
        f"Swapped '{a.get('course_name')}' ({a_day} {a_start}) with "
        f"'{b.get('course_name')}' ({b_day} {b_start})."
    )


ACTION_HANDLERS = {
    "move_block": _execute_move_block,
    "clear_day": _execute_clear_day,
    "swap_blocks": _execute_swap_blocks,
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
    return json.dumps(schedule, indent=2)


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


@router.post("/chat", response_model=ChatResponse)
async def ai_assistant_chat(req: ChatRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == req.username).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    _save_message(db, req.username, "user", req.message)

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
