from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import date, datetime, timedelta
import math
import json
import logging
import random

from config import GEMINI_API_KEY, GEMINI_MODEL
from deps import get_db
from models import Course, CourseBlock, Personality, Emotion, StudyHistory, StudySession, User
from schemas import WeeklyStudyHoursRequest
from google import genai

router = APIRouter(prefix="/scheduler", tags=["scheduler"])

logger = logging.getLogger("mentora.scheduler")

@router.post("/{username}")
async def create_local_schedule(
    username: str,
    payload: WeeklyStudyHoursRequest,
    db: Session = Depends(get_db),
):
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

    user_history_records: list[StudyHistory] = []

    # Clear old scheduled sessions before creating a fresh plan.
    try:
        existing_session_ids = [
            sid
            for (sid,) in db.query(StudySession.session_id)
            .filter(StudySession.username == username)
            .all()
        ]

        if existing_session_ids:
            user_history_records = (
                db.query(StudyHistory)
                .filter(StudyHistory.study_session_id.in_(existing_session_ids))
                .all()
            )

            db.query(StudyHistory).filter(
                StudyHistory.study_session_id.in_(existing_session_ids)
            ).update(
                {StudyHistory.study_session_id: None},
                synchronize_session=False,
            )

            deleted_sessions = (
                db.query(StudySession)
                .filter(StudySession.username == username)
                .delete(synchronize_session=False)
            )
            db.commit()
            logger.info(
                "Cleared %d existing study sessions for user %s before scheduling",
                deleted_sessions,
                username,
            )
    except Exception:
        db.rollback()
        logger.exception("Failed to clear existing sessions for user %s", username)
        raise HTTPException(status_code=500, detail="Failed to reset previous schedule")

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
    MIN_SESSIONS_PER_DAY = 1
    MAX_SESSIONS_PER_DAY = 10
    SESSION_DURATION_MINUTES = 60
    DEFAULT_DAY_START = 8
    DEFAULT_DAY_END = 22
    SLOT_MINUTES = 30
    SESSION_BLOCKS = SESSION_DURATION_MINUTES // SLOT_MINUTES  # 2 blocks of 30 minutes
    MIN_FOCUS_PER_SESSION = 30
    MAX_FOCUS_PER_SESSION = 60
    MIN_BREAK_PER_SESSION = 0
    MAX_BREAK_PER_SESSION = 30

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

    def normalize_trait(value, default: float = 0.5) -> float:
        """Normalize personality values from common scales into 0..1."""
        try:
            v = float(value)
        except Exception:
            return default

        # Stored format in this project is usually -1..1
        if -1.0 <= v <= 1.0:
            return (v + 1.0) / 2.0

        # Sometimes traits may already be 0..1
        if 0.0 <= v <= 1.0:
            return v

        # 1..5 scale
        if 1.0 <= v <= 5.0:
            return (v - 1.0) / 4.0

        # 0..100 scale
        if 0.0 <= v <= 100.0:
            return v / 100.0

        return default

    def get_personality(name: str, default: float = 0.5) -> float:
        return normalize_trait(personality_scores.get(name), default)

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

    # --- Compute next week dates ---
    today_date = date.today()
    current_monday = today_date - timedelta(days=today_date.weekday())
    next_monday = current_monday + timedelta(days=7)
    week_days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    upcoming_week_dates = {
        dname: (next_monday + timedelta(days=i)).isoformat()
        for i, dname in enumerate(week_days)
    }
    # Schedule the full next week.
    schedulable_days = week_days[:]

    # --- Build course records with weekly importance weights ---
    # Importance is the only course-level weighting signal now.
    course_records = []
    for c in courses:
        ects = extract_ects(c.description or "")
        course_importance_level = getattr(c, "importance_level", None)
        if course_importance_level is None or course_importance_level <= 0:
            course_importance_level = ects
        if course_importance_level is None or course_importance_level <= 0:
            course_importance_level = 1.0
        course_records.append(
            {
                "name": c.name,
                "ects": ects,
                "course_importance_level": course_importance_level,
            }
        )

    if not course_records:
        raise HTTPException(status_code=400, detail="No courses to schedule")

    total_importance = sum(max(1.0, cr["course_importance_level"]) for cr in course_records)
    if total_importance <= 0:
        raise HTTPException(status_code=400, detail="No course importance to schedule")

    # --- Personality / energy ---
    O = get_personality("openness",          0.5)
    C = get_personality("conscientiousness", 0.5)
    E = get_personality("extraversion",      0.5)
    N = get_personality("neuroticism",       0.5)
    daily_energy = compute_daily_energy(emotion_scores)
    energy_norm = max(-1.0, min(1.0, daily_energy / 6.0))

    # Personality/emotion-driven base split inside a fixed 60-minute session.
    conscientiousness_extremity = abs(C - 0.5) * 4
    raw_focus_base = int(
        round(
            34
            + 6 * conscientiousness_extremity
            - 8 * (N - 0.5)
            + 5 * energy_norm
            + 2 * abs(E - 0.5)
        )
    )
    focus_base = max(MIN_FOCUS_PER_SESSION, min(MAX_FOCUS_PER_SESSION, raw_focus_base))
    focus_variance = int(round(2 + 6 * O))

    # Personality/emotion modifies planning efficiency too.
    effective_focus_credit = int(
        round(
            focus_base
            * (
                0.9
                + 0.25 * conscientiousness_extremity
                - 0.2 * N
                + 0.15 * max(0.0, energy_norm)
            )
        )
    )
    effective_focus_credit = max(30, min(60, effective_focus_credit))

    # --- Study history effect on focus/break ---
    # Note: history is user-scoped through previous study_session_id links.
    recent_cutoff = today - timedelta(days=30)
    recent_history = [
        h
        for h in user_history_records
        if h.date and h.date >= recent_cutoff and (h.study_duration or 0) > 0
    ]

    history_consistency = min(1.0, len(recent_history) / 20.0) if recent_history else 0.0
    history_avg_duration = (
        sum(h.study_duration for h in recent_history) / len(recent_history)
        if recent_history
        else 0.0
    )

    # Per-course duration tendency from history.
    course_history_avg: dict[str, float] = {}
    course_duration_acc: dict[str, list[float]] = {}
    for h in recent_history:
        key = (h.course_name or "").strip().lower()
        if not key:
            continue
        course_duration_acc.setdefault(key, []).append(float(h.study_duration))
    for k, vals in course_duration_acc.items():
        if vals:
            course_history_avg[k] = sum(vals) / len(vals)

    # Global history bias: longer historical sessions increase suggested focus, shorter reduce it.
    if history_avg_duration > 0:
        global_history_bias = int(round((history_avg_duration - focus_base) * 0.25))
        focus_base = max(
            MIN_FOCUS_PER_SESSION,
            min(MAX_FOCUS_PER_SESSION, focus_base + max(-8, min(8, global_history_bias))),
        )

    # Consistent recent studying narrows variability for steadier routines.
    if history_consistency >= 0.7:
        focus_variance = max(1, focus_variance - 2)
    elif history_consistency <= 0.2:
        focus_variance = min(8, focus_variance + 1)

    # --- Build slot maps for each day ---
    day_start_and_slots: dict = {}
    available_days: list = []
    for d in schedulable_days:
        start_dt, slots = build_day_slots(d)
        day_start_and_slots[d] = (start_dt, slots)
        if any(slots):
            available_days.append(d)

    if not available_days:
        logger.warning("No free slots for user %s; falling back to default window", username)
        default_slots = int(((DEFAULT_DAY_END - DEFAULT_DAY_START) * 60) / SLOT_MINUTES)
        for d in schedulable_days:
            base_dt = datetime.combine(date.fromisoformat(upcoming_week_dates[d]), datetime.min.time()).replace(hour=DEFAULT_DAY_START)
            day_start_and_slots[d] = (base_dt, [True] * default_slots)
        available_days = schedulable_days[:]

    # =========================================================
    # PHASE 1 – Use provided weekly hours or derive from personality
    # =========================================================
    day_session_targets: dict[str, int] = {}
    if payload.weekly_study_hours is None:
        # Positive correlation with conscientiousness, inverse with neuroticism.
        # C, N are normalized to 0..1, output is clamped to a practical weekly range.
        weekly_study_hours = 14.0 + 16.0 * C + 10.0 * (1.0 - N)
        weekly_study_hours = max(8.0, min(45.0, weekly_study_hours))
        logger.info(
            "Weekly study hours not provided for %s; derived %.2f from personality (C=%.3f, N=%.3f)",
            username,
            weekly_study_hours,
            C,
            N,
        )
    else:
        weekly_study_hours = max(0.0, float(payload.weekly_study_hours))
        if weekly_study_hours <= 0:
            raise HTTPException(status_code=400, detail="weekly_study_hours must be positive")

    half_hour_units = max(1, int(math.floor(weekly_study_hours * 2.0 + 0.5)))
    target_minutes = half_hour_units * 30
    full_sessions, remainder_minutes = divmod(target_minutes, 60)
    total_sessions = full_sessions + (1 if remainder_minutes > 0 else 0)
    if total_sessions <= 0:
        raise HTTPException(status_code=400, detail="No sessions can be created from the provided hours")

    max_possible_sessions = len(available_days) * MAX_SESSIONS_PER_DAY
    if total_sessions > max_possible_sessions:
        logger.warning(
            "Requested %d sessions from %.2f weekly hours, but only %d fit in available days; capping.",
            total_sessions,
            weekly_study_hours,
            max_possible_sessions,
        )
        total_sessions = max_possible_sessions
        target_minutes = total_sessions * 60
        full_sessions, remainder_minutes = divmod(target_minutes, 60)

    # Higher conscientiousness keeps weekend consistency; lower values reduce it.
    weekend_adjust = 0.2 if C >= 0.7 else (-0.15 if C <= 0.35 else 0.0)
    day_multiplier = {
        "Mon": 1.05,
        "Tue": 1.05,
        "Wed": 1.0,
        "Thu": 1.0,
        "Fri": 0.95,
        "Sat": 0.85 + weekend_adjust,
        "Sun": 0.9 + weekend_adjust,
    }

    total_weight = sum(day_multiplier.get(d, 1.0) for d in available_days) or 1.0
    for d in available_days:
        day_share = total_sessions * (day_multiplier.get(d, 1.0) / total_weight)
        day_count = int(math.ceil(day_share))
        day_session_targets[d] = max(MIN_SESSIONS_PER_DAY, min(MAX_SESSIONS_PER_DAY, day_count))

    def _rebalance_day_targets(targets: dict[str, int], desired_total: int) -> dict[str, int]:
        current_total = sum(targets.values())
        ordered_days = sorted(
            targets.keys(),
            key=lambda day: (targets[day], day_multiplier.get(day, 1.0)),
            reverse=True,
        )
        if current_total > desired_total:
            idx = 0
            while current_total > desired_total and ordered_days:
                day = ordered_days[idx % len(ordered_days)]
                if targets[day] > MIN_SESSIONS_PER_DAY:
                    targets[day] -= 1
                    current_total -= 1
                idx += 1
        elif current_total < desired_total:
            idx = 0
            while current_total < desired_total and ordered_days:
                day = ordered_days[idx % len(ordered_days)]
                if targets[day] < MAX_SESSIONS_PER_DAY:
                    targets[day] += 1
                    current_total += 1
                idx += 1
        return targets

    day_session_targets = _rebalance_day_targets(day_session_targets, total_sessions)

    total_sessions = sum(day_session_targets.values())
    logger.info(
        "Scheduling %d total sessions across %d days for %s with per-day targets=%s",
        total_sessions,
        len(available_days),
        username,
        day_session_targets,
    )

    # =========================================================
    # PHASE 2 – Distribute courses among those sessions
    # =========================================================
    # Each course gets a share of sessions proportional to its importance level.
    course_records.sort(
        key=lambda x: x["course_importance_level"],
        reverse=True,
    )

    # Compute session counts per course (proportional to importance).
    raw_shares = [
        int(round(max(1.0, cr["course_importance_level"]) / total_importance * total_sessions))
        for cr in course_records
    ]

    # Ensure at least one session if we have budgeted time
    if total_sessions > 0 and sum(raw_shares) == 0:
        raw_shares[0] = 1

    # Adjust so sum equals total_sessions while preserving non-negative counts
    share_sum = sum(raw_shares)
    if share_sum < total_sessions:
        idx = 0
        while share_sum < total_sessions and raw_shares:
            raw_shares[idx % len(raw_shares)] += 1
            share_sum += 1
            idx += 1
    elif share_sum > total_sessions:
        idx = len(raw_shares) - 1
        while share_sum > total_sessions and raw_shares:
            j = idx % len(raw_shares)
            if raw_shares[j] > 0:
                raw_shares[j] -= 1
                share_sum -= 1
            idx -= 1

    # Build flat ordered list of (course_record, focus_minutes) assignments
    # =========================================================
    # PHASE 3 – Calculate duration for each session
    # =========================================================
    session_assignments = []  # list of dicts: {course, focus, duration_minutes}

    def build_focus_for_duration(duration_minutes: int, course_name: str) -> int:
        if duration_minutes <= 30:
            return 15

        course_key = (course_name or "").strip().lower()
        course_duration_bias = 0
        if course_key in course_history_avg:
            course_duration_bias = int(
                round((course_history_avg[course_key] - focus_base) * 0.2)
            )

        consistency_bias = int(round((history_consistency - 0.5) * 4))
        raw_focus = int(
            round(
                (duration_minutes * 0.55)
                + (8 * conscientiousness_extremity)
                - (8 * (N - 0.5))
                + (5 * energy_norm)
                + (2 * abs(E - 0.5))
                + course_duration_bias
                + consistency_bias
            )
        )
        max_focus = max(MIN_FOCUS_PER_SESSION, duration_minutes - MIN_BREAK_PER_SESSION)
        return max(MIN_FOCUS_PER_SESSION, min(max_focus, raw_focus))

    durations = [60] * full_sessions
    if remainder_minutes > 0:
        durations.append(remainder_minutes)

    for cr, n_sessions in zip(course_records, raw_shares):
        effective_sessions = max(0, n_sessions)
        for _ in range(effective_sessions):
            if not durations:
                break
            duration_minutes = durations.pop(0)
            session_assignments.append(
                {
                    "course": cr,
                    "duration_minutes": duration_minutes,
                    "focus": build_focus_for_duration(duration_minutes, cr["name"]),
                }
            )

    logger.info(
        "Session allocation after importance split: %d assignments from %d requested",
        len(session_assignments),
        total_sessions,
    )

    # Shuffle to avoid same-course clustering on the same day
    random.shuffle(session_assignments)

    # Distribute sessions across available days (round-robin by day order)
    day_session_map: dict = {d: [] for d in available_days}
    day_cycle = list(available_days)

    # First pass: satisfy each day's personality-driven target count fairly.
    # This prevents weekend starvation when assignments are fewer than total quotas.
    cursor = 0
    remaining_quota = {d: max(0, day_session_targets.get(d, 0)) for d in day_cycle}
    while cursor < len(session_assignments) and any(q > 0 for q in remaining_quota.values()):
        progressed = False
        for d in day_cycle:
            if cursor >= len(session_assignments):
                break
            if remaining_quota[d] <= 0:
                continue
            day_session_map[d].append(session_assignments[cursor])
            cursor += 1
            remaining_quota[d] -= 1
            progressed = True
        if not progressed:
            break

    # Second pass: distribute any leftovers round-robin.
    rr = 0
    while cursor < len(session_assignments) and day_cycle:
        target_day = day_cycle[rr % len(day_cycle)]
        day_session_map[target_day].append(session_assignments[cursor])
        cursor += 1
        rr += 1

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
        cr = sa["course"]
        focus = sa["focus"]
        duration_minutes = sa["duration_minutes"]
        if focus < MIN_FOCUS_PER_SESSION:
            return None
        bk = max(1, int(math.ceil(duration_minutes / SLOT_MINUTES)))
        return {"course": cr, "focus": focus, "blocks": bk}

    def commit_session(cr: dict, fit: int, bk: int, slots: list, start_dt: datetime, day: str):
        """Mark slots as occupied and persist a StudySession. Returns created dict or None."""
        for i in range(fit, fit + bk):
            slots[i] = False
        session_start     = start_dt + timedelta(minutes=fit * SLOT_MINUTES)
        allocated_minutes = bk * SLOT_MINUTES
        session_end       = session_start + timedelta(minutes=allocated_minutes)
        max_focus_allowed = min(MAX_FOCUS_PER_SESSION, allocated_minutes - MIN_BREAK_PER_SESSION)
        actual_focus = max(MIN_FOCUS_PER_SESSION, min(cr["focus"], max_focus_allowed))
        actual_break = allocated_minutes - actual_focus
        actual_break = max(MIN_BREAK_PER_SESSION, min(MAX_BREAK_PER_SESSION, actual_break))
        actual_focus = allocated_minutes - actual_break
        try:
            ns = StudySession(
                username=username,
                mode="study",
                timer_type=cr["course"]["name"],
                duration_minutes=SESSION_DURATION_MINUTES,
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
    for d in schedulable_days:
        sessions_today = day_session_map.get(d, [])
        if not sessions_today:
            continue

        start_dt, slots = day_start_and_slots[d]
        slots = list(slots)  # local mutable copy

        # Shuffle within the day for variety
        random.shuffle(sessions_today)

        # Apply per-session dynamic split for this day based on personality and emotion.
        day_bias = 0
        if d in {"Mon", "Tue"} and energy_norm >= 0:
            day_bias = 1
        elif d in {"Sat", "Sun"} and (energy_norm < 0 or N >= 0.6):
            day_bias = -1

        for sa in sessions_today:
            jitter = random.randint(-focus_variance, focus_variance)
            target_focus = sa["focus"] + day_bias + jitter
            target_focus = max(MIN_FOCUS_PER_SESSION, min(MAX_FOCUS_PER_SESSION, target_focus))
            sa["focus"] = target_focus
            sa["break"] = SESSION_DURATION_MINUTES - target_focus

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

        # Dynamic pacing by personality/emotion while keeping each session fixed at 60 mins.
        if energy_norm < -0.4 or N >= 0.65:
            num_blocks = min(3, num_blocks + 1)
        elif C >= 0.75 and energy_norm > 0.2:
            num_blocks = max(1, num_blocks - 1)

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
                    if not vs:
                        logger.debug("No 60-minute slot for %s on %s; skipping", s_info["course"]["name"], d)
                        continue
                    fit    = random.choice(vs)
                    result = commit_session(s_info, fit, bk, slots, start_dt, d)
                    if result:
                        created.append(result)

    return {"created": len(created), "sessions": created}