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


class FriendRequestCreate(BaseModel):
    from_username: str
    to_username: str


class FriendRequestAction(BaseModel):
    username: str


class FriendRequestResponse(BaseModel):
    request_id: int
    from_username: str
    to_username: str
    status: str
    created_at: datetime

    class Config:
        from_attributes = True


class FriendRequestsList(BaseModel):
    incoming: list[FriendRequestResponse]
    outgoing: list[FriendRequestResponse]


class FriendProfile(BaseModel):
    username: str
    full_name: str
    university: Optional[str]
    streak_count: int
    profile_photo: Optional[str]


class FriendListResponse(BaseModel):
    friends: list[FriendProfile]


class FriendSearchResponse(BaseModel):
    results: list[FriendProfile]


class ChatThreadCreate(BaseModel):
    username: str
    friend_username: str


class ChatGroupCreate(BaseModel):
    username: str
    title: str
    member_usernames: list[str]
    group_photo: Optional[str] = None


class ChatGroupUpdate(BaseModel):
    username: str
    title: Optional[str] = None
    group_photo: Optional[str] = None
    add_members: Optional[list[str]] = None
    remove_members: Optional[list[str]] = None


class ChatThreadAction(BaseModel):
    username: str


class ChatMessageCreate(BaseModel):
    thread_id: int
    sender: str
    content: str


class ChatMessageResponse(BaseModel):
    message_id: int
    thread_id: int
    sender: str
    content: str
    created_at: datetime

    class Config:
        from_attributes = True


class ChatThreadItem(BaseModel):
    thread_id: int
    is_group: bool
    friend_username: Optional[str] = None
    title: Optional[str] = None
    owner_username: Optional[str] = None
    group_photo: Optional[str] = None
    members_count: int = 0
    last_message: Optional[str]
    last_message_at: Optional[datetime]


class ChatThreadsResponse(BaseModel):
    threads: list[ChatThreadItem]
