from datetime import datetime
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
    full_name: str | None = None
    school: str | None = None
    description: str | None = None
    age: int | None = None
    department: str | None = None


class ProfileResponse(BaseModel):
    id: int
    user_id: int
    full_name: str | None
    school: str | None
    description: str | None
    age: int | None
    department: str | None
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
