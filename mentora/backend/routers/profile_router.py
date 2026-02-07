from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from deps import get_db
from models import Profile
from schemas import ProfileCreate, ProfileResponse, ProfileUpdate

router = APIRouter(prefix="/profile", tags=["profile"])


@router.options("")
async def options_profile():
    return {}


@router.get("/{username}", response_model=ProfileResponse)
async def get_profile(username: str, db: Session = Depends(get_db)):
    profile = db.query(Profile).filter(Profile.username == username).first()
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profile not found",
        )
    return profile


@router.post("", response_model=ProfileResponse)
async def create_profile(
    profile_data: ProfileCreate,
    db: Session = Depends(get_db),
):
    existing = (
        db.query(Profile)
        .filter(Profile.username == profile_data.username)
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Profile already exists",
        )

    profile = Profile(**profile_data.model_dump())
    db.add(profile)
    db.commit()
    db.refresh(profile)
    return profile


@router.put("/{username}", response_model=ProfileResponse)
async def update_profile(
    username: str,
    profile_data: ProfileUpdate,
    db: Session = Depends(get_db),
):
    profile = db.query(Profile).filter(Profile.username == username).first()
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profile not found",
        )

    update_data = profile_data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(profile, key, value)

    db.commit()
    db.refresh(profile)
    return profile
