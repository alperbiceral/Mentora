from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import date as date_cls, datetime

from deps import get_db
from models import Profile, StudySession, StudyHistory, User, Personality, Emotion
from schemas import StudySessionCreate, StudySessionResponse, StudyHistoryCreate, StudyHistoryResponse
from scheduling_conflicts import find_schedule_conflict

router = APIRouter(prefix="/study-sessions", tags=["study-sessions"])


@router.options("")
async def options_sessions():
    return {}


@router.get("/{username}", response_model=list[StudySessionResponse])
async def list_sessions(username: str, limit: int = 100, db: Session = Depends(get_db)):
    sessions = (
        db.query(StudySession)
        .filter(StudySession.username == username)
        .order_by(StudySession.ended_at.desc())
        .limit(limit)
        .all()
    )
    return sessions


@router.get("/{username}/scheduled-today", response_model=list[StudySessionResponse])
async def list_scheduled_sessions_today(username: str, db: Session = Depends(get_db)):
    """Return today's scheduled study sessions from study_sessions table.

    Includes sessions regardless of whether their time has passed.
    Matches by today's weekday (e.g. all Tuesdays), independent of week.
    Excludes ad-hoc timer sessions by filtering to scheduler-created mode='study'.
    """
    today = date_cls.today()
    # PostgreSQL EXTRACT(dow): Sunday=0, Monday=1, ..., Saturday=6.
    today_dow = (today.weekday() + 1) % 7
    sessions = (
        db.query(StudySession)
        .filter(StudySession.username == username)
        .filter(StudySession.mode == "study")
        .filter(func.extract("dow", StudySession.started_at) == today_dow)
        .order_by(StudySession.started_at.asc())
        .all()
    )
    return sessions


@router.post("", response_model=StudySessionResponse)
async def create_session(payload: StudySessionCreate, db: Session = Depends(get_db)):
    if payload.duration_minutes <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Duration must be positive",
        )
    if payload.started_at >= payload.ended_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Session start time must be earlier than end time",
        )

    profile = db.query(Profile).filter(Profile.username == payload.username).first()
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profile not found",
        )

    conflict_message = find_schedule_conflict(
        db,
        payload.username,
        payload.started_at,
        payload.ended_at,
    )
    if conflict_message:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Study session conflicts with existing schedule: {conflict_message}",
        )

    session = StudySession(**payload.model_dump())
    profile.study_hours += payload.duration_minutes / 60.0
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


@router.post("/history", response_model=StudyHistoryResponse)
async def create_study_history(payload: StudyHistoryCreate, db: Session = Depends(get_db)):
    if payload.study_duration <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Study duration must be positive",
        )

    history = StudyHistory(**payload.model_dump())
    db.add(history)
    db.commit()
    db.refresh(history)
    return history


def get_latest_personality_for_user(username: str, db: Session):
    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    personality = (
        db.query(Personality)
        .filter(Personality.user_id == user.user_id)
        .order_by(Personality.test_date.desc())
        .first()
    )

    if not personality:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Personality not found",
        )

    return {"scores": personality.personality_scores}


def get_emotion_scores_for_day(username: str, db: Session):
    day = date_cls.today()

    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    emotion = (
        db.query(Emotion)
        .filter(Emotion.user_id == user.user_id)
        .filter(Emotion.emotion_test_date == day)
        .first()
    )

    if not emotion:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Emotion scores not found for the given day",
        )

    return {"scores": emotion.emotion_scores}
