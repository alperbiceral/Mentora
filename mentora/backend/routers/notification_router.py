from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from deps import get_db
from models import (
    ChatMessage,
    ChatParticipant,
    ChatThread,
    FriendRequest,
    Group,
    GroupInvite,
    GroupJoinRequest,
)

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("/counts/{username}")
async def get_notification_counts(
    username: str,
    friend_since: float = Query(0, description="ms epoch – friends tab"),
    group_since: float = Query(0, description="ms epoch – groups tab"),
    chat_since: float = Query(0, description="ms epoch – chats tab"),
    db: Session = Depends(get_db),
):
    friend_since_dt = (
        datetime.utcfromtimestamp(friend_since / 1000)
        if friend_since > 0
        else datetime.min
    )
    group_since_dt = (
        datetime.utcfromtimestamp(group_since / 1000)
        if group_since > 0
        else datetime.min
    )
    chat_since_dt = (
        datetime.utcfromtimestamp(chat_since / 1000)
        if chat_since > 0
        else datetime.min
    )

    friend_count = (
        db.query(FriendRequest)
        .filter(
            FriendRequest.to_username == username,
            FriendRequest.status == "pending",
            FriendRequest.created_at > friend_since_dt,
        )
        .count()
    )

    invite_count = (
        db.query(GroupInvite)
        .filter(
            GroupInvite.to_username == username,
            GroupInvite.status == "pending",
            GroupInvite.created_at > group_since_dt,
        )
        .count()
    )

    owned_groups = select(Group.group_id).filter(Group.owner_username == username)
    join_count = (
        db.query(GroupJoinRequest)
        .filter(
            GroupJoinRequest.group_id.in_(owned_groups),
            GroupJoinRequest.status == "pending",
            GroupJoinRequest.created_at > group_since_dt,
        )
        .count()
    )

    chat_count = 0
    participant_threads = (
        db.query(ChatThread.thread_id)
        .join(
            ChatParticipant,
            ChatParticipant.thread_id == ChatThread.thread_id,
        )
        .filter(ChatParticipant.username == username)
        .all()
    )
    thread_ids = [row[0] for row in participant_threads]
    for tid in thread_ids:
        has_new = (
            db.query(ChatMessage.message_id)
            .filter(
                ChatMessage.thread_id == tid,
                ChatMessage.created_at > chat_since_dt,
                ChatMessage.sender != username,
            )
            .first()
        )
        if has_new:
            chat_count += 1

    total = friend_count + invite_count + join_count + chat_count
    return {
        "friend_requests": friend_count,
        "group_invites": invite_count + join_count,
        "unread_chats": chat_count,
        "total": total,
    }
