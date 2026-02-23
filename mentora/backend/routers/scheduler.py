from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import date, datetime, timedelta
import json
import logging

from config import GEMINI_API_KEY, GEMINI_MODEL
from deps import get_db
from models import Course, CourseBlock, Personality, Emotion, StudySession, User
from google import genai

router = APIRouter(prefix="/scheduler", tags=["scheduler"])

logger = logging.getLogger("mentora.scheduler")

prompt = '''You are an intelligent scheduler that creates personalized study plans.

Use the provided USER_DATA appended after this instruction to generate a study schedule for the upcoming week.

IMPORTANT INSTRUCTIONS (READ CAREFULLY):
- You MUST return ONLY a JSON array (no surrounding text, no explanation, no markdown fences).
- The JSON must be an array of session objects. Each session object MUST contain exactly the following fields:
  - "course_name": string
  - "session_date": string in ISO format YYYY-MM-DD
  - "start_time": string in 24-hour HH:MM format
  - "end_time": string in 24-hour HH:MM format
  - "focus_minutes": integer
  - "break_minutes": integer
  - "duration_minutes": integer (equal to focus_minutes + break_minutes)
  - "session_type": string (one of "study", "assignment", "review")
                - Rounding rule: ALL `start_time` and `end_time` values MUST be rounded
                    to the nearest 30-minute boundary so the minutes are only `00` or `30`.

- The array should contain one object per scheduled session for the upcoming week.
- Do NOT include any other fields such as "session_id" or commentary.
- Do NOT wrap the JSON in code fences or return any explanatory text.

If you cannot produce a valid schedule, return an empty JSON array: []

INPUT DATA (USER_DATA) AVAILABLE TO YOU:
- "courses": array where each course object may contain:
  - "name": string
  - "description": string (may include workload hints)
  - "course_credit_value": number (ECTS or credit weight) if available
  - "course_importance": number (user-rated priority, optional)
  - "exam_dates": array of ISO date strings (optional)
  - "assignment_dates": array of ISO date strings (optional)
  - "total_effort": integer minutes or hours (optional)
  - "remaining_effort": integer minutes (optional)
  - "study_history_minutes": integer (minutes already spent by user on course, optional)

- "unavailable_blocks": map of weekday short names (Mon,Tue,...) to arrays of {start, end, course}
- "personality_scores": map with OCEAN-like values (assume scale 1-5 unless otherwise specified)
- "today_emotions": map for the day (joy, sadness, fear, anger, disgust, neutral) each 0..1 (may be null)
- "upcoming_week_dates": explicit ISO dates for Mon..Sun (provided)
- "available_days_of_week": optional array of weekday names the user is available (if provided)
- "available_hours_by_day": optional map day->array of time ranges user is available (if provided)

ALGORITHM & CALCULATIONS (you MUST follow these heuristics when producing the schedule):

1) Course Priority Calculation (per course):
    - Use available fields in the course object: course_credit_value, course_importance, exam_dates, upcoming_exam_date,
      assignment_dates, upcoming_assignment_deadline, total_effort (from credits or provided), remaining_effort,
      days_until_next_deadline (deadline_date - scheduling_day).
    - If user study history exists, compute remaining_effort = total_effort - study_history_minutes.
    - Courses with nearer deadlines or exams should receive higher priority.

2) Emotion Calculation (daily):
    - daily_energy = 8 * joy + 2 * neutral - 2.5 * sadness - 2.5 * fear - 2.5 * anger - 2.5 * disgust
    - If neutral > 0.6 (out of 1), set daily_energy = 0
    - Emotions can also modify per-course parameters (e.g., anger -> task perceived difficult; you may reduce session length or add help/simpler tasks)

3) Scheduling Priority Order (must be respected):
    Deadlines > User Availability > Personality > Emotion

4) Weekly Study Load:
    - total_estimated_effort = sum of total_effort for tasks in the week (use total_effort or estimate from credits)
    - daily_study_load = total_estimated_effort / number_of_available_days (available_days_of_week)

5) Daily Session Counts & Durations:
    - daily_session_num = round(conscientiousness_score + 0.3 * daily_energy)
    - focus_duration_per_session_minutes = max(10, round((conscientiousness_score - neuroticism_score + 0.3 * daily_energy) * 10))
    - break_duration_per_session_minutes: aim to fit daily_study_load into available_hours_of_day; compute remaining_time and distribute between breaks
    - subject_variation = floor(openness_score)
    - motivation_frequency = 5 * round(agreeableness / max(1, conscientiousness))
    - suggest_study_group = true if extraversion >= 3 else false

6) Per-day behavior:
    - Use user's unavailable blocks to avoid scheduling sessions at those times.
    - Vary subjects during a day guided by subject_variation and openness.
    - Prioritize sessions with imminent deadlines/exams earlier in the week/day.
    - If daily_emotion indicates low energy, reduce session counts/durations and increase breaks.

OUTPUT REQUIREMENTS:
- Only produce the JSON array of sessions that follows the schema above.
- Times must fall within available hours (if provided) and not overlap unavailable_blocks.
- Spread sessions across the upcoming week respecting daily_study_load and subject variation.

Now generate the schedule based on the appended USER_DATA and the rules above.
'''


@router.post("/{username}")
async def create_schedule(username: str, db: Session = Depends(get_db)):
    """Generate a weekly study schedule for `username` using Gemini (genai).

    The provided `prompt` variable is used verbatim as the instruction for the model.
    Collected user data (courses, blocks, personality, emotions) is appended after the prompt.
    """

    # Gather user courses
    courses = db.query(Course).filter(Course.username == username).all()
    course_list = []
    for c in courses:
        course_list.append({
            "name": c.name,
            "description": c.description or "",
        })

    # Gather course blocks (unavailable slots)
    blocks = db.query(CourseBlock).join(Course).filter(Course.username == username).all()
    availability = {}
    for b in blocks:
        availability.setdefault(b.day, []).append({"start": b.start, "end": b.end, "course": b.course.name})

    # Resolve user -> user_id for personality/emotion lookups
    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Personality (most recent)
    personality = (
        db.query(Personality)
        .filter(Personality.user_id == user.user_id)
        .order_by(Personality.test_date.desc())
        .first()
    )
    personality_scores = personality.personality_scores if personality else {}

    # Emotions for today
    today = date.today()
    emotion = (
        db.query(Emotion)
        .filter(Emotion.user_id == user.user_id)
        .filter(Emotion.emotion_test_date == today)
        .first()
    )
    emotion_scores = emotion.emotion_scores if emotion else None

    # Build data string to append to prompt (keeps prompt unchanged)
    data_blob = {
        "courses": course_list,
        "unavailable_blocks": availability,
        "personality_scores": personality_scores,
        "today_emotions": emotion_scores,
    }

    # Add explicit upcoming week dates (next week's Monday through Sunday)
    today_date = date.today()
    days_until_next_monday = 7 - today_date.weekday()
    next_monday = today_date + timedelta(days=days_until_next_monday)
    week_days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    upcoming_week_dates = {}
    for i, dname in enumerate(week_days):
        upcoming_week_dates[dname] = (next_monday + timedelta(days=i)).isoformat()

    data_blob["upcoming_week_start"] = next_monday.isoformat()
    data_blob["upcoming_week_dates"] = upcoming_week_dates

    full_input = prompt + "\n\nUSER_DATA:\n" + json.dumps(data_blob, default=str, indent=2)

    try:
        client = genai.Client(api_key=GEMINI_API_KEY)
        response = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=full_input,
        )

        response_text = response.text.strip()

        # Remove markdown fences if present
        if response_text.startswith("```"):
            lines = response_text.split("\n")
            response_text = "\n".join(lines[1:-1]) if len(lines) > 2 else response_text


        # Parsing: the prompt now requests ONLY a JSON array. Try to parse directly.
        schedule_data = None
        candidate = None
        # Remove common surrounding whitespace
        rt = response_text.strip()

        # If response contains fenced block, extract inner text (handles models that still include fences)
        if rt.startswith("```"):
            parts = rt.split("\n")
            if len(parts) > 1:
                # drop the first and last fence lines
                rt = "\n".join(parts[1:-1]).strip()

        # Prefer direct json.loads on cleaned text
        try:
            schedule_data = json.loads(rt)
        except Exception as e:
            logger.error("JSON parse failed on cleaned response: %s", e)
            # Try to find the first JSON array substring
            try:
                import re

                arr_match = re.search(r"\[.*\]", rt, re.S)
                if arr_match:
                    candidate = arr_match.group(0)
                    try:
                        schedule_data = json.loads(candidate)
                    except Exception as e2:
                        logger.error("JSON parse failed on extracted array candidate: %s", e2)
                else:
                    # No array found, try to find first object
                    obj_match = re.search(r"\{.*\}", rt, re.S)
                    if obj_match:
                        candidate = obj_match.group(0)
                        try:
                            parsed_obj = json.loads(candidate)
                            # If the object contains a 'sessions' key, use it
                            schedule_data = parsed_obj.get("sessions") if isinstance(parsed_obj, dict) else None
                        except Exception as e3:
                            logger.error("JSON parse failed on extracted object candidate: %s", e3)
            except Exception as ex:
                logger.error("Error extracting JSON candidate: %s", ex)

        if schedule_data is None:
            logger.error("Failed to parse schedule. AI raw response: %s", response_text)
            raise HTTPException(status_code=500, detail="Failed to parse schedule from AI response")

        if not schedule_data:
            raise HTTPException(status_code=500, detail="Failed to parse schedule from AI response")

        # Expecting schedule_data to be a list of sessions
        sessions = schedule_data if isinstance(schedule_data, list) else schedule_data.get("sessions") or []

        created = []
        for s in sessions:
            try:
                # Map fields from AI output into StudySession model
                course_name = s.get("course_name") or s.get("course") or s.get("subject")
                session_type = s.get("session_type") or s.get("type") or s.get("session_type")
                duration = float(s.get("duration_minutes") or s.get("duration") or 0)
                focus = int(s.get("focus_minutes") or s.get("focus") or 0)
                break_minutes = int(s.get("break_minutes") or s.get("break") or 0)

                # Parse start/end datetimes if provided
                started_at = None
                ended_at = None
                if s.get("started_at"):
                    started_at = datetime.fromisoformat(s.get("started_at"))
                if s.get("ended_at"):
                    ended_at = datetime.fromisoformat(s.get("ended_at"))

                # If only session_date and times provided
                if not started_at and s.get("session_date") and s.get("start_time"):
                    started_at = datetime.fromisoformat(s.get("session_date") + "T" + s.get("start_time"))
                if not ended_at and s.get("session_date") and s.get("end_time"):
                    ended_at = datetime.fromisoformat(s.get("session_date") + "T" + s.get("end_time"))

                # Fallbacks for datetime
                if not started_at:
                    started_at = datetime.utcnow()
                if not ended_at:
                    ended_at = started_at

                new_session = StudySession(
                    username=username,
                    mode=(session_type or "study") if isinstance(session_type, str) else "study",
                    timer_type=(course_name or ""),
                    duration_minutes=duration,
                    focus_minutes=focus,
                    break_minutes=break_minutes,
                    cycles=None,
                    started_at=started_at,
                    ended_at=ended_at,
                )

                db.add(new_session)
                db.commit()
                db.refresh(new_session)

                created.append({
                    "session_id": new_session.session_id,
                    "username": new_session.username,
                    "mode": new_session.mode,
                    "timer_type": new_session.timer_type,
                    "duration_minutes": new_session.duration_minutes,
                })
            except Exception as e:
                logger.error("Error saving session: %s", e)

        return {"created": len(created), "sessions": created}

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error generating schedule with Gemini: %s", e)
        raise HTTPException(status_code=500, detail=str(e))