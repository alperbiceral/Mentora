from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from deps import get_current_user, get_db
from models import User
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
    user = db.query(User).filter(User.user_id == current_user.user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )
    return user


@router.post("", response_model=ProfileResponse)
async def create_profile(
    profile_data: ProfileCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.user_id == current_user.user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    user.full_name = profile_data.full_name
    user.school = profile_data.school
    user.description = profile_data.description
    user.age = profile_data.age
    user.department = profile_data.department

    db.commit()
    db.refresh(user)
    return user


@router.put("", response_model=ProfileResponse)
async def update_profile(
    profile_data: ProfileUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.user_id == current_user.user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    if profile_data.full_name is not None:
        user.full_name = profile_data.full_name
    if profile_data.school is not None:
        user.school = profile_data.school
    if profile_data.description is not None:
        user.description = profile_data.description
    if profile_data.age is not None:
        user.age = profile_data.age
    if profile_data.department is not None:
        user.department = profile_data.department

    db.commit()
    db.refresh(user)
    return user
