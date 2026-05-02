from datetime import datetime
from typing import Iterable

from sqlalchemy.orm import Session

from models import Course, CourseBlock, StudySession

WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


def time_to_minutes(value: str) -> int:
    hour, minute = [int(part) for part in value.split(":")]
    return hour * 60 + minute


def minutes_to_time(minutes: int) -> str:
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


def blocks_overlap(day1: str, start1: str, end1: str, day2: str, start2: str, end2: str) -> bool:
    if day1 != day2:
        return False
    return time_to_minutes(start1) < time_to_minutes(end2) and time_to_minutes(start2) < time_to_minutes(end1)


def weekday_from_datetime(value: datetime) -> str:
    return WEEKDAYS[value.weekday()]


def find_schedule_conflict(
    db: Session,
    username: str,
    start_at: datetime,
    end_at: datetime,
    exclude_session_id: int | None = None,
) -> str | None:
    target_day = weekday_from_datetime(start_at)
    target_start = start_at.strftime("%H:%M")
    target_end = end_at.strftime("%H:%M")

    course_blocks = (
        db.query(CourseBlock)
        .join(Course)
        .filter(Course.username == username, CourseBlock.day == target_day)
        .all()
    )
    for block in course_blocks:
        if blocks_overlap(target_day, target_start, target_end, block.day, block.start, block.end):
            return (
                f"Conflicts with course '{block.course.name}' "
                f"({block.day} {block.start}-{block.end})."
            )

    sessions = db.query(StudySession).filter(StudySession.username == username).all()
    for session in sessions:
        if exclude_session_id and session.session_id == exclude_session_id:
            continue
        if start_at < session.ended_at and session.started_at < end_at:
            session_day = weekday_from_datetime(session.started_at)
            return (
                f"Conflicts with study session #{session.session_id} "
                f"({session_day} {session.started_at.strftime('%H:%M')}-{session.ended_at.strftime('%H:%M')})."
            )
    return None


def find_study_conflict_for_course_blocks(
    db: Session,
    username: str,
    blocks: Iterable[tuple[str, str, str]],
) -> str | None:
    sessions = db.query(StudySession).filter(StudySession.username == username).all()
    for day, start, end in blocks:
        for session in sessions:
            session_day = weekday_from_datetime(session.started_at)
            session_start = session.started_at.strftime("%H:%M")
            session_end = session.ended_at.strftime("%H:%M")
            if blocks_overlap(day, start, end, session_day, session_start, session_end):
                return (
                    f"Course block {day} {start}-{end} conflicts with study session "
                    f"#{session.session_id} ({session_day} {session_start}-{session_end})."
                )
    return None
