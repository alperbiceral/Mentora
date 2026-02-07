from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class UserRegister(BaseModel):
    email: str
    username: str
    password: str


class UserLogin(BaseModel):
    email: str
    password: str


class ChangePasswordRequest(BaseModel):
    username: str
    old_password: str
    new_password: str


class ProfileCreate(BaseModel):
    username: str
    full_name: str
    email: str
    phone_number: Optional[str] = None
    university: Optional[str] = None
    department: Optional[str] = None
    streak_count: int = 0
    study_hours: float = 0
    personality: Optional[str] = None
    profile_photo: Optional[str] = None


class ProfileUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[str] = None
    phone_number: Optional[str] = None
    university: Optional[str] = None
    department: Optional[str] = None
    streak_count: Optional[int] = None
    study_hours: Optional[float] = None
    personality: Optional[str] = None
    profile_photo: Optional[str] = None


class ProfileResponse(BaseModel):
    profile_id: int
    username: str
    full_name: str
    email: str
    phone_number: Optional[str]
    university: Optional[str]
    department: Optional[str]
    streak_count: int
    study_hours: float
    personality: Optional[str]
    profile_photo: Optional[str]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str
    user: dict


class UserResponse(BaseModel):
    user_id: int
    email: str
    username: str

    class Config:
        from_attributes = True
