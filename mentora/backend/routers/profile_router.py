from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from deps import get_current_user, get_db
from models import Profile, User
from schemas import ProfileCreate, ProfileResponse, ProfileUpdate

router = APIRouter(prefix="/profile", tags=["profile"])


@router.options("")
async def options_profile():
    return {}


@router.get("", response_model=ProfileResponse)
async def get_profile(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = db.query(Profile).filter(Profile.user_id == current_user.id).first()
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profile not found",
        )
    return profile


@router.post("", response_model=ProfileResponse)
async def create_profile(
    profile_data: ProfileCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    existing_profile = (
        db.query(Profile).filter(Profile.user_id == current_user.id).first()
    )
    if existing_profile:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Profile already exists",
        )

    new_profile = Profile(
        user_id=current_user.id,
        full_name=profile_data.full_name,
        school=profile_data.school,
        description=profile_data.description,
        age=profile_data.age,
        department=profile_data.department,
    )

    db.add(new_profile)
    db.commit()
    db.refresh(new_profile)
    return new_profile


@router.put("", response_model=ProfileResponse)
async def update_profile(
    profile_data: ProfileUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    profile = db.query(Profile).filter(Profile.user_id == current_user.id).first()
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profile not found",
        )

    if profile_data.full_name is not None:
        profile.full_name = profile_data.full_name
    if profile_data.school is not None:
        profile.school = profile_data.school
    if profile_data.description is not None:
        profile.description = profile_data.description
    if profile_data.age is not None:
        profile.age = profile_data.age
    if profile_data.department is not None:
        profile.department = profile_data.department

    db.commit()
    db.refresh(profile)
    return profile
