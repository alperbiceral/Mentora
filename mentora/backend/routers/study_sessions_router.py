from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from deps import get_db
from models import Profile, StudySession
from schemas import StudySessionCreate, StudySessionResponse

router = APIRouter(prefix="/study-sessions", tags=["study-sessions"])


@router.options("")
async def options_sessions():
    return {}


@router.get("/{username}", response_model=list[StudySessionResponse])
async def list_sessions(username: str, limit: int = 20, db: Session = Depends(get_db)):
    sessions = (
        db.query(StudySession)
        .filter(StudySession.username == username)
        .order_by(StudySession.ended_at.desc())
        .limit(limit)
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

    profile = db.query(Profile).filter(Profile.username == payload.username).first()
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profile not found",
        )

    session = StudySession(**payload.model_dump())
    profile.study_hours += payload.duration_minutes / 60.0
    db.add(session)
    db.commit()
    db.refresh(session)
    return session
