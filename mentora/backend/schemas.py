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


class StudySessionCreate(BaseModel):
    username: str
    mode: str
    timer_type: Optional[str] = None
    duration_minutes: float
    focus_minutes: Optional[int] = None
    break_minutes: Optional[int] = None
    cycles: Optional[int] = None
    started_at: datetime
    ended_at: datetime


class StudySessionResponse(BaseModel):
    session_id: int
    username: str
    mode: str
    timer_type: Optional[str]
    duration_minutes: float
    focus_minutes: Optional[int]
    break_minutes: Optional[int]
    cycles: Optional[int]
    started_at: datetime
    ended_at: datetime
    created_at: datetime

    class Config:
        from_attributes = True


class CourseBlockCreate(BaseModel):
    day: str
    start: str
    end: str


class CourseCreate(BaseModel):
    username: str
    name: str
    description: Optional[str] = None
    instructor: Optional[str] = None
    location: Optional[str] = None
    color: Optional[str] = None
    blocks: list[CourseBlockCreate] = []


class CourseUpdate(BaseModel):
    username: str
    name: str
    description: Optional[str] = None
    instructor: Optional[str] = None
    location: Optional[str] = None
    color: Optional[str] = None
    blocks: list[CourseBlockCreate] = []


class CourseBlockResponse(BaseModel):
    block_id: int
    day: str
    start: str
    end: str

    class Config:
        from_attributes = True


class CourseResponse(BaseModel):
    course_id: int
    username: str
    name: str
    description: Optional[str]
    instructor: Optional[str]
    location: Optional[str]
    color: Optional[str]
    blocks: list[CourseBlockResponse] = []

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
    study_hours: float
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


class GroupCreate(BaseModel):
    username: str
    name: str
    description: Optional[str] = None
    is_public: bool = False
    group_photo: Optional[str] = None
    invitees: Optional[list[str]] = None


class GroupUpdate(BaseModel):
    username: str
    name: Optional[str] = None
    description: Optional[str] = None
    is_public: Optional[bool] = None
    group_photo: Optional[str] = None
    add_members: Optional[list[str]] = None
    remove_members: Optional[list[str]] = None


class GroupAction(BaseModel):
    username: str


class GroupTransferOwner(BaseModel):
    username: str
    new_owner_username: str


class GroupListItem(BaseModel):
    group_id: int
    name: str
    description: Optional[str]
    group_photo: Optional[str]
    is_public: bool
    owner_username: str
    members_count: int
    chat_thread_id: int
    is_member: bool
    is_owner: bool


class GroupListResponse(BaseModel):
    groups: list[GroupListItem]


class GroupMemberItem(BaseModel):
    username: str
    role: str


class GroupMembersResponse(BaseModel):
    members: list[GroupMemberItem]


class GroupLeaderboardEntry(BaseModel):
    rank: int
    username: str
    full_name: str
    university: Optional[str]
    study_hours: float
    streak_count: int
    profile_photo: Optional[str]


class ProfileLeaderboardEntry(BaseModel):
    rank: int
    username: str
    full_name: str
    university: Optional[str]
    study_hours: float
    streak_count: int
    profile_photo: Optional[str]


class GroupInviteCreate(BaseModel):
    group_id: int
    from_username: str
    to_username: str


class GroupInviteAction(BaseModel):
    username: str


class GroupInviteItem(BaseModel):
    invite_id: int
    group_id: int
    group_name: str
    group_photo: Optional[str]
    from_username: str
    to_username: str
    status: str
    created_at: datetime


class GroupJoinRequestCreate(BaseModel):
    group_id: int
    username: str


class GroupJoinRequestAction(BaseModel):
    username: str


class GroupJoinRequestItem(BaseModel):
    request_id: int
    group_id: int
    group_name: str
    group_photo: Optional[str]
    username: str
    status: str
    created_at: datetime


class GroupRequestsList(BaseModel):
    incoming_invites: list[GroupInviteItem]
    outgoing_invites: list[GroupInviteItem]
    incoming_join_requests: list[GroupJoinRequestItem]
    outgoing_join_requests: list[GroupJoinRequestItem]


class DailyQuestionResponse(BaseModel):
    question_id: int
    question_text: str
    option_a: str
    option_b: str
    option_c: str
    option_d: str
    answered: bool
    is_correct: Optional[bool] = None
    selected_answer: Optional[str] = None


class AnswerQuestionRequest(BaseModel):
    selected_answer: str
    response_time_seconds: float

