from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import date, datetime, timedelta
import json
import logging
import random

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
'''

@router.post("/{username}")
async def create_local_schedule(username: str, db: Session = Depends(get_db)):
    """Local scheduler that uses ECTS (from description), OCEAN, and today's emotion.

    This function places sessions directly into free 30-minute slots and persists them.
    """

    # Gather user courses
    courses = db.query(Course).filter(Course.username == username).all()
    # Gather course blocks (unavailable slots)
    blocks = db.query(CourseBlock).join(Course).filter(Course.username == username).all()
    availability = {}
    for b in blocks:
        availability.setdefault(b.day, []).append({"start": b.start, "end": b.end, "course": b.course.name})

    # Resolve user
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

    # --- Constants ---
    MINUTES_PER_ECTS_TOTAL = 1500
    WEEKS_PER_TERM = 15
    MIN_SESSIONS_PER_DAY = 2
    MAX_SESSIONS_PER_DAY = 6
    MIN_FOCUS_PER_SESSION = 30   # minutes
    MAX_FOCUS_PER_SESSION = 90   # minutes
    DEFAULT_DAY_START = 8
    DEFAULT_DAY_END = 22
    SLOT_MINUTES = 30

    import re

    def extract_ects(description: str) -> float:
        if not description:
            return 0.0

        # All patterns tried in order of specificity.
        # Each pattern captures the numeric credit value.
        patterns = [
            # "ECTS Credits: 6" / "ECTS Credits of the Course: 6,5"
            r"ECTS\s+Credits?[^0-9\n\r]{0,30}([0-9]+(?:[.,][0-9]+)?)",
            # "AKTS Kredisi: 6" / "AKTS: 6"  (Turkish equivalent)
            r"AKTS[^0-9\n\r]{0,30}([0-9]+(?:[.,][0-9]+)?)",
            # "6 ECTS" / "6.5 ECTS" / "6,5 ECTS"
            r"([0-9]+(?:[.,][0-9]+)?)\s*ECTS",
            # "6 AKTS"
            r"([0-9]+(?:[.,][0-9]+)?)\s*AKTS",
            # Generic: "ECTS: 6" / "ects 6"
            r"ECTS[^0-9\n\r]{0,10}([0-9]+(?:[.,][0-9]+)?)",
            # "Credit Hours: 3" / "Credit Value: 6" / "Credits: 6"
            r"Credits?(?:\s+(?:Hours?|Value|Points?))?\s*[:\-]?\s*([0-9]+(?:[.,][0-9]+)?)",
            # "Course Credits: 6" / "Course Credit: 3"
            r"Course\s+Credits?\s*[:\-]\s*([0-9]+(?:[.,][0-9]+)?)",
            # "Kredi: 6"  (Turkish)
            r"Kredi\s*[:\-]?\s*([0-9]+(?:[.,][0-9]+)?)",
        ]

        for pat in patterns:
            m = re.search(pat, description, re.I)
            if m:
                value = float(m.group(1).replace(",", "."))
                # Sanity-check: ECTS values are typically 1–30
                if 1.0 <= value <= 30.0:
                    return value

        return 0.0

    def get_personality(name: str, default: float = 3.0) -> float:
        try:
            return float(personality_scores.get(name, default))
        except Exception:
            return default

    def compute_daily_energy(em: dict) -> float:
        if not em:
            return 0.0
        joy     = em.get("joy",     0) or 0
        neutral = em.get("neutral", 0) or 0
        sadness = em.get("sadness", 0) or 0
        fear    = em.get("fear",    0) or 0
        anger   = em.get("anger",   0) or 0
        disgust = em.get("disgust", 0) or 0
        energy  = 8 * joy + 2 * neutral - 2.5 * (sadness + fear + anger + disgust)
        return 0.0 if neutral > 0.6 else energy

    def build_day_slots(day_short: str):
        """Return (day_start_datetime, list_of_bool_slots) for a weekday."""
        base = date.fromisoformat(upcoming_week_dates[day_short])
        start_dt = datetime.combine(base, datetime.min.time()).replace(hour=DEFAULT_DAY_START)
        end_dt   = start_dt.replace(hour=DEFAULT_DAY_END)
        total_slots = int((end_dt - start_dt).seconds / (SLOT_MINUTES * 60))
        slots = [True] * total_slots
        for b in availability.get(day_short, []):
            try:
                s_h, s_m = map(int, b["start"].split(":"))
                e_h, e_m = map(int, b["end"].split(":"))
                block_start = start_dt.replace(hour=s_h, minute=s_m)
                block_end   = start_dt.replace(hour=e_h, minute=e_m)
                if block_end <= start_dt or block_start >= end_dt:
                    continue
                bs = max(0, int((block_start - start_dt).seconds / (SLOT_MINUTES * 60)))
                be = min(total_slots, int((block_end - start_dt).seconds / (SLOT_MINUTES * 60)))
                for i in range(bs, be):
                    slots[i] = False
            except Exception:
                logger.exception("Error parsing block times for %s: %s", day_short, b)
        return start_dt, slots

    def find_all_fits(slots: list, blocks_needed: int) -> list:
        """Return all valid starting indices where `blocks_needed` consecutive free slots exist."""
        valid = []
        for i in range(len(slots) - blocks_needed + 1):
            if all(slots[i:i + blocks_needed]):
                valid.append(i)
        return valid

    # --- Compute upcoming week dates ---
    today_date = date.today()
    days_until_next_monday = 7 - today_date.weekday()
    next_monday = today_date + timedelta(days=days_until_next_monday)
    week_days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    upcoming_week_dates = {
        dname: (next_monday + timedelta(days=i)).isoformat()
        for i, dname in enumerate(week_days)
    }

    # --- Build course records with weekly time budget ---
    course_records = []
    for c in courses:
        ects = extract_ects(c.description or "")
        weekly_minutes = int(round((ects * MINUTES_PER_ECTS_TOTAL) / max(1, WEEKS_PER_TERM)))
        course_records.append({"name": c.name, "ects": ects, "weekly_minutes": weekly_minutes, "remaining": weekly_minutes})

    if course_records and all(cr["weekly_minutes"] == 0 for cr in course_records):
        DEFAULT_WEEKLY_PER_COURSE = 120
        for cr in course_records:
            cr["weekly_minutes"] = DEFAULT_WEEKLY_PER_COURSE
            cr["remaining"]      = DEFAULT_WEEKLY_PER_COURSE

    total_week_minutes = sum(cr["weekly_minutes"] for cr in course_records)
    if total_week_minutes <= 0:
        raise HTTPException(status_code=400, detail="No weekly minutes to schedule")

    # --- Personality / energy ---
    C = get_personality("conscientiousness", 3.0)
    N = get_personality("neuroticism",       3.0)
    daily_energy = compute_daily_energy(emotion_scores)

    # Focus duration per session (minutes)
    raw_focus  = int(round((C - N + 0.5 * daily_energy) * 10))
    focus_base = max(MIN_FOCUS_PER_SESSION, min(MAX_FOCUS_PER_SESSION, raw_focus))

    # --- Build slot maps for each day ---
    day_start_and_slots: dict = {}
    available_days: list = []
    for d in week_days:
        start_dt, slots = build_day_slots(d)
        day_start_and_slots[d] = (start_dt, slots)
        if any(slots):
            available_days.append(d)

    if not available_days:
        logger.warning("No free slots for user %s; falling back to default window", username)
        default_slots = int(((DEFAULT_DAY_END - DEFAULT_DAY_START) * 60) / SLOT_MINUTES)
        for d in week_days:
            base_dt = datetime.combine(date.fromisoformat(upcoming_week_dates[d]), datetime.min.time()).replace(hour=DEFAULT_DAY_START)
            day_start_and_slots[d] = (base_dt, [True] * default_slots)
        available_days = week_days[:]

    # =========================================================
    # PHASE 1 – Calculate total study sessions for the week
    # =========================================================
    # Per-day session count driven by personality + emotion
    raw_count = int(round(C + 0.5 * daily_energy))
    sessions_per_day = max(MIN_SESSIONS_PER_DAY, min(MAX_SESSIONS_PER_DAY, raw_count))

    total_sessions = sessions_per_day * len(available_days)
    logger.info("Scheduling %d total sessions across %d days (%d/day) for %s",
                total_sessions, len(available_days), sessions_per_day, username)

    # =========================================================
    # PHASE 2 – Distribute courses among those sessions
    # =========================================================
    # Each course gets a share of sessions proportional to its weekly_minutes budget.
    course_records.sort(key=lambda x: x["weekly_minutes"], reverse=True)

    # Compute session counts per course (proportional, at least 1 each)
    raw_shares = [
        max(1, round(cr["weekly_minutes"] / total_week_minutes * total_sessions))
        for cr in course_records
    ]
    # Adjust so sum equals total_sessions
    share_sum = sum(raw_shares)
    if share_sum != total_sessions:
        diff = total_sessions - share_sum
        # Add/remove from the course with the largest budget
        raw_shares[0] = max(1, raw_shares[0] + diff)

    # Build flat ordered list of (course_record, focus_minutes) assignments
    # =========================================================
    # PHASE 3 – Calculate duration for each session
    # =========================================================
    session_assignments = []  # list of dicts: {course, focus}
    for cr, n_sessions in zip(course_records, raw_shares):
        # Spread the course budget evenly across its allocated sessions
        per_session = max(
            MIN_FOCUS_PER_SESSION,
            min(focus_base, cr["weekly_minutes"] // max(1, n_sessions))
        )
        for _ in range(n_sessions):
            session_assignments.append({"course": cr, "focus": per_session})

    # Shuffle to avoid same-course clustering on the same day
    random.shuffle(session_assignments)

    # Distribute sessions across available days (round-robin by day order)
    day_session_map: dict = {d: [] for d in available_days}
    day_cycle = list(available_days)
    for idx, sa in enumerate(session_assignments):
        target_day = day_cycle[idx % len(day_cycle)]
        day_session_map[target_day].append(sa)

    # =========================================================
    # PHASE 4 – Place sessions as consecutive blocks, randomly in the day
    # =========================================================
    # Sessions are grouped into 1–3 study blocks per day.
    # Each block is placed as a single contiguous unit at a random free position.
    # If the whole block doesn't fit, sessions fall back to individual random placement.
    
    # ≤ 2 sessions → 1 block
    # 3–4 sessions → 2 blocks
    # 5+ sessions → 3 blocks

    def resolve_session_slots(sa: dict) -> dict | None:
        """Resolve final focus minutes and slot count for a session assignment.
        Returns a dict {course, focus, blocks} or None if it cannot fit at all."""
        cr    = sa["course"]
        focus = sa["focus"]
        if cr["remaining"] <= 0:
            return None
        focus = min(focus, cr["remaining"])
        if focus < MIN_FOCUS_PER_SESSION:
            return None
        break_min = 5
        bk = max(1, (focus + break_min + SLOT_MINUTES - 1) // SLOT_MINUTES)
        return {"course": cr, "focus": focus, "blocks": bk}

    def commit_session(cr: dict, fit: int, bk: int, slots: list, start_dt: datetime, day: str):
        """Mark slots as occupied and persist a StudySession. Returns created dict or None."""
        for i in range(fit, fit + bk):
            slots[i] = False
        session_start     = start_dt + timedelta(minutes=fit * SLOT_MINUTES)
        session_end       = session_start + timedelta(minutes=bk * SLOT_MINUTES)
        allocated_minutes = bk * SLOT_MINUTES
        actual_focus      = min(cr["focus"], allocated_minutes)
        actual_break      = allocated_minutes - actual_focus
        cr["course"]["remaining"] -= actual_focus
        try:
            ns = StudySession(
                username=username,
                mode="study",
                timer_type=cr["course"]["name"],
                duration_minutes=allocated_minutes,
                focus_minutes=actual_focus,
                break_minutes=actual_break,
                cycles=None,
                started_at=session_start,
                ended_at=session_end,
            )
            db.add(ns)
            db.commit()
            db.refresh(ns)
            return {
                "session_id":       ns.session_id,
                "username":         ns.username,
                "mode":             ns.mode,
                "timer_type":       ns.timer_type,
                "duration_minutes": ns.duration_minutes,
                "started_at":       ns.started_at.isoformat(),
                "ended_at":         ns.ended_at.isoformat(),
            }
        except Exception:
            logger.exception("Failed saving session for %s on %s", cr["course"]["name"], day)
            return None

    created = []
    for d in week_days:
        sessions_today = day_session_map.get(d, [])
        if not sessions_today:
            continue

        start_dt, slots = day_start_and_slots[d]
        slots = list(slots)  # local mutable copy

        # Shuffle within the day for variety
        random.shuffle(sessions_today)

        # Resolve slot sizes for all sessions upfront
        resolved = [r for sa in sessions_today if (r := resolve_session_slots(sa)) is not None]
        if not resolved:
            continue

        # Decide how many blocks to split sessions into based on count
        n = len(resolved)
        if n <= 2:
            num_blocks = 1
        elif n <= 4:
            num_blocks = 2
        else:
            num_blocks = 3

        # Split resolved sessions into num_blocks consecutive groups
        block_size = (n + num_blocks - 1) // num_blocks
        study_blocks = [resolved[i:i + block_size] for i in range(0, n, block_size)]

        for block in study_blocks:
            total_block_slots = sum(s["blocks"] for s in block)

            # Try to place the entire block as one contiguous chunk
            valid_starts = find_all_fits(slots, total_block_slots)

            if valid_starts:
                # Random position for the block
                fit    = random.choice(valid_starts)
                cursor = fit
                for s_info in block:
                    result = commit_session(s_info, cursor, s_info["blocks"], slots, start_dt, d)
                    if result:
                        created.append(result)
                    cursor += s_info["blocks"]
            else:
                # Block doesn't fit as a whole — fall back to individual random placement
                logger.debug("Block of %d slots doesn't fit on %s; placing sessions individually", total_block_slots, d)
                for s_info in block:
                    bk = s_info["blocks"]
                    vs = find_all_fits(slots, bk)
                    # Shrink if needed
                    if not vs:
                        shrunk = False
                        for f in range(s_info["focus"] - SLOT_MINUTES, MIN_FOCUS_PER_SESSION - 1, -SLOT_MINUTES):
                            new_bk = max(1, (f + 5 + SLOT_MINUTES - 1) // SLOT_MINUTES)
                            vs = find_all_fits(slots, new_bk)
                            if vs:
                                s_info["focus"]  = f
                                s_info["blocks"] = new_bk
                                bk               = new_bk
                                shrunk           = True
                                break
                        if not shrunk:
                            logger.debug("No slot for %s on %s; skipping", s_info["course"]["name"], d)
                            continue
                    fit    = random.choice(vs)
                    result = commit_session(s_info, fit, bk, slots, start_dt, d)
                    if result:
                        created.append(result)

    return {"created": len(created), "sessions": created}