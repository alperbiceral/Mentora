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


class ProfileCreate(BaseModel):
    full_name: str
    school: str
    description: str
    age: int
    department: str


class ProfileUpdate(BaseModel):
    full_name: Optional[str] = None
    school: Optional[str] = None
    description: Optional[str] = None
    age: Optional[int] = None
    department: Optional[str] = None


class ProfileResponse(BaseModel):
    id: int
    user_id: int
    full_name: Optional[str]
    school: Optional[str]
    description: Optional[str]
    age: Optional[int]
    department: Optional[str]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str
    user: dict


class UserResponse(BaseModel):
    id: int
    email: str
    username: str
    is_active: bool

    class Config:
        from_attributes = True
