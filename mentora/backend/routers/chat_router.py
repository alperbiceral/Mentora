from __future__ import annotations

import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from database import SessionLocal
from deps import get_db
from models import ChatMessage, ChatParticipant, ChatThread, Friend, Profile
from schemas import (
    ChatGroupCreate,
    ChatGroupUpdate,
    ChatMessageCreate,
    ChatMessageResponse,
    ChatThreadAction,
    ChatThreadCreate,
    ChatThreadItem,
    ChatThreadsResponse,
)

router = APIRouter(prefix="/chat", tags=["chat"])


class ConnectionManager:
    def __init__(self) -> None:
        self.active: dict[str, set[WebSocket]] = {}

    async def connect(self, username: str, websocket: WebSocket) -> None:
        await websocket.accept()
        self.active.setdefault(username, set()).add(websocket)

    def disconnect(self, username: str, websocket: WebSocket) -> None:
        if username not in self.active:
            return
        self.active[username].discard(websocket)
        if not self.active[username]:
            self.active.pop(username, None)

    async def send_to(self, username: str, payload: dict) -> None:
        if username not in self.active:
            return
        dead: list[WebSocket] = []
        for ws in self.active.get(username, set()):
            try:
                await ws.send_json(payload)
            except RuntimeError:
                dead.append(ws)
        for ws in dead:
            self.disconnect(username, ws)


manager = ConnectionManager()


def _thread_friend(thread: ChatThread, username: str) -> str:
    return thread.user_b if thread.user_a == username else thread.user_a


def _participants_for_thread(db: Session, thread_id: int) -> list[str]:
    rows = (
        db.query(ChatParticipant)
        .filter(ChatParticipant.thread_id == thread_id)
        .all()
    )
    return [row.username for row in rows]


def _ensure_participant(db: Session, thread: ChatThread, username: str) -> None:
    participants = _participants_for_thread(db, thread.thread_id)
    if participants:
        if username not in participants:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not a participant",
            )
        return
    if username not in (thread.user_a, thread.user_b):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a participant",
        )


def _ensure_friendship(db: Session, username: str, friend_username: str) -> None:
    is_friend = (
        db.query(Friend)
        .filter(
            or_(
                (Friend.user_a == username) & (Friend.user_b == friend_username),
                (Friend.user_a == friend_username) & (Friend.user_b == username),
            )
        )
        .first()
    )
    if not is_friend:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Users are not friends",
        )


@router.get("/threads/{username}", response_model=ChatThreadsResponse)
async def list_threads(username: str, db: Session = Depends(get_db)):
    legacy_threads = (
        db.query(ChatThread)
        .filter(or_(ChatThread.user_a == username, ChatThread.user_b == username))
        .all()
    )
    needs_commit = False
    for legacy in legacy_threads:
        existing_members = _participants_for_thread(db, legacy.thread_id)
        if not existing_members:
            db.add_all(
                [
                    ChatParticipant(
                        thread_id=legacy.thread_id,
                        username=legacy.user_a,
                    ),
                    ChatParticipant(
                        thread_id=legacy.thread_id,
                        username=legacy.user_b,
                    ),
                ]
            )
            needs_commit = True
    if needs_commit:
        db.commit()

    threads = (
        db.query(ChatThread)
        .join(ChatParticipant, ChatParticipant.thread_id == ChatThread.thread_id)
        .filter(ChatParticipant.username == username)
        .order_by(ChatThread.updated_at.desc())
        .all()
    )

    items: list[ChatThreadItem] = []
    for thread in threads:
        last_message = (
            db.query(ChatMessage)
            .filter(ChatMessage.thread_id == thread.thread_id)
            .order_by(ChatMessage.created_at.desc())
            .first()
        )
        members_count = (
            db.query(ChatParticipant)
            .filter(ChatParticipant.thread_id == thread.thread_id)
            .count()
        )
        items.append(
            ChatThreadItem(
                thread_id=thread.thread_id,
                is_group=thread.is_group,
                friend_username=(
                    _thread_friend(thread, username) if not thread.is_group else None
                ),
                title=thread.title,
                owner_username=thread.owner_username,
                group_photo=thread.group_photo,
                members_count=members_count,
                last_message=last_message.content if last_message else None,
                last_message_at=last_message.created_at if last_message else None,
            )
        )

    return {"threads": items}


@router.post("/threads", response_model=ChatThreadItem)
async def create_thread(payload: ChatThreadCreate, db: Session = Depends(get_db)):
    if payload.username == payload.friend_username:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot chat with yourself",
        )

    for username in (payload.username, payload.friend_username):
        if not db.query(Profile).filter(Profile.username == username).first():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Profile not found",
            )

    _ensure_friendship(db, payload.username, payload.friend_username)

    existing = (
        db.query(ChatThread)
        .filter(
            or_(
                (ChatThread.user_a == payload.username)
                & (ChatThread.user_b == payload.friend_username),
                (ChatThread.user_a == payload.friend_username)
                & (ChatThread.user_b == payload.username),
            )
        )
        .first()
    )
    if existing:
        existing_members = _participants_for_thread(db, existing.thread_id)
        if not existing_members:
            db.add_all(
                [
                    ChatParticipant(
                        thread_id=existing.thread_id,
                        username=existing.user_a,
                    ),
                    ChatParticipant(
                        thread_id=existing.thread_id,
                        username=existing.user_b,
                    ),
                ]
            )
            db.commit()
            existing_members = _participants_for_thread(db, existing.thread_id)
        members_count = (
            db.query(ChatParticipant)
            .filter(ChatParticipant.thread_id == existing.thread_id)
            .count()
        )
        return ChatThreadItem(
            thread_id=existing.thread_id,
            is_group=existing.is_group,
            friend_username=_thread_friend(existing, payload.username),
            title=existing.title,
            owner_username=existing.owner_username,
            group_photo=existing.group_photo,
            members_count=members_count,
            last_message=None,
            last_message_at=None,
        )

    thread = ChatThread(
        user_a=payload.username,
        user_b=payload.friend_username,
        is_group=False,
    )
    db.add(thread)
    db.commit()
    db.refresh(thread)

    db.add_all(
        [
            ChatParticipant(thread_id=thread.thread_id, username=payload.username),
            ChatParticipant(
                thread_id=thread.thread_id,
                username=payload.friend_username,
            ),
        ]
    )
    db.commit()

    return ChatThreadItem(
        thread_id=thread.thread_id,
        is_group=False,
        friend_username=_thread_friend(thread, payload.username),
        title=None,
        owner_username=None,
        group_photo=None,
        members_count=2,
        last_message=None,
        last_message_at=None,
    )


@router.post("/groups", response_model=ChatThreadItem)
async def create_group(payload: ChatGroupCreate, db: Session = Depends(get_db)):
    title = payload.title.strip()
    if not title:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Group title is required",
        )

    members = list({m for m in payload.member_usernames if m != payload.username})
    if not members:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Select at least one member",
        )

    if len(members) + 1 > 20:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Group size exceeds 20",
        )

    if not db.query(Profile).filter(Profile.username == payload.username).first():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profile not found",
        )

    for member in members:
        if not db.query(Profile).filter(Profile.username == member).first():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Profile not found",
            )
        _ensure_friendship(db, payload.username, member)

    thread = ChatThread(
        user_a=payload.username,
        user_b=payload.username,
        is_group=True,
        title=title,
        owner_username=payload.username,
        group_photo=payload.group_photo,
    )
    db.add(thread)
    db.commit()
    db.refresh(thread)

    participants = [payload.username] + members
    db.add_all(
        [ChatParticipant(thread_id=thread.thread_id, username=member) for member in participants]
    )
    db.commit()

    return ChatThreadItem(
        thread_id=thread.thread_id,
        is_group=True,
        title=thread.title,
        owner_username=thread.owner_username,
        group_photo=thread.group_photo,
        members_count=len(participants),
        last_message=None,
        last_message_at=None,
    )


@router.get("/messages/{thread_id}", response_model=list[ChatMessageResponse])
async def list_messages(thread_id: int, db: Session = Depends(get_db)):
    messages = (
        db.query(ChatMessage)
        .filter(ChatMessage.thread_id == thread_id)
        .order_by(ChatMessage.created_at.asc())
        .all()
    )
    return messages


@router.post("/messages", response_model=ChatMessageResponse)
async def create_message(payload: ChatMessageCreate, db: Session = Depends(get_db)):
    thread = db.query(ChatThread).filter(ChatThread.thread_id == payload.thread_id).first()
    if not thread:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Thread not found",
        )
    _ensure_participant(db, thread, payload.sender)

    message = ChatMessage(
        thread_id=payload.thread_id,
        sender=payload.sender,
        content=payload.content,
    )
    thread.updated_at = datetime.utcnow()
    db.add(message)
    db.commit()
    db.refresh(message)
    return message


@router.delete("/threads/{thread_id}")
async def delete_thread(
    thread_id: int,
    payload: ChatThreadAction,
    db: Session = Depends(get_db),
):
    thread = db.query(ChatThread).filter(ChatThread.thread_id == thread_id).first()
    if not thread:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Thread not found",
        )

    if thread.is_group:
        if thread.owner_username != payload.username:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only the owner can delete this group",
            )
    else:
        _ensure_participant(db, thread, payload.username)

    db.query(ChatMessage).filter(ChatMessage.thread_id == thread_id).delete()
    db.query(ChatParticipant).filter(ChatParticipant.thread_id == thread_id).delete()
    db.delete(thread)
    db.commit()
    return {"message": "Thread deleted"}


@router.get("/groups/{thread_id}/participants", response_model=list[str])
async def list_group_participants(thread_id: int, db: Session = Depends(get_db)):
    thread = db.query(ChatThread).filter(ChatThread.thread_id == thread_id).first()
    if not thread or not thread.is_group:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Group not found",
        )
    participants = _participants_for_thread(db, thread_id)
    return participants


@router.put("/groups/{thread_id}", response_model=ChatThreadItem)
async def update_group(
    thread_id: int,
    payload: ChatGroupUpdate,
    db: Session = Depends(get_db),
):
    thread = db.query(ChatThread).filter(ChatThread.thread_id == thread_id).first()
    if not thread or not thread.is_group:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Group not found",
        )
    if thread.owner_username != payload.username:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the owner can edit this group",
        )

    if payload.title is not None:
        title = payload.title.strip()
        if not title:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Group title is required",
            )
        thread.title = title

    if payload.group_photo is not None:
        thread.group_photo = payload.group_photo

    participants = set(_participants_for_thread(db, thread_id))
    add_members = set(payload.add_members or [])
    remove_members = set(payload.remove_members or [])

    if thread.owner_username in remove_members:
        remove_members.remove(thread.owner_username)

    for member in add_members:
        if member == payload.username:
            continue
        if not db.query(Profile).filter(Profile.username == member).first():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Profile not found",
            )
        _ensure_friendship(db, payload.username, member)

    next_participants = (participants | add_members) - remove_members
    if len(next_participants) > 20:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Group size exceeds 20",
        )

    if add_members:
        db.add_all(
            [
                ChatParticipant(thread_id=thread_id, username=member)
                for member in add_members
                if member not in participants
            ]
        )
    if remove_members:
        db.query(ChatParticipant).filter(
            ChatParticipant.thread_id == thread_id,
            ChatParticipant.username.in_(remove_members),
        ).delete(synchronize_session=False)

    thread.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(thread)

    last_message = (
        db.query(ChatMessage)
        .filter(ChatMessage.thread_id == thread.thread_id)
        .order_by(ChatMessage.created_at.desc())
        .first()
    )

    return ChatThreadItem(
        thread_id=thread.thread_id,
        is_group=True,
        title=thread.title,
        owner_username=thread.owner_username,
        group_photo=thread.group_photo,
        members_count=len(next_participants),
        last_message=last_message.content if last_message else None,
        last_message_at=last_message.created_at if last_message else None,
    )


@router.websocket("/ws/{username}")
async def websocket_chat(websocket: WebSocket, username: str):
    await manager.connect(username, websocket)
    db = SessionLocal()
    try:
        while True:
            raw = await websocket.receive_text()
            try:
                payload = json.loads(raw)
            except json.JSONDecodeError:
                await websocket.send_json({"type": "error", "message": "Invalid JSON"})
                continue

            thread_id = payload.get("thread_id")
            content = (payload.get("content") or "").strip()
            if not thread_id or not content:
                await websocket.send_json(
                    {"type": "error", "message": "Missing thread_id or content"}
                )
                continue

            thread = (
                db.query(ChatThread)
                .filter(ChatThread.thread_id == int(thread_id))
                .first()
            )
            if not thread:
                await websocket.send_json({"type": "error", "message": "Invalid thread"})
                continue
            try:
                _ensure_participant(db, thread, username)
            except HTTPException:
                await websocket.send_json({"type": "error", "message": "Invalid thread"})
                continue

            message = ChatMessage(
                thread_id=thread.thread_id,
                sender=username,
                content=content,
            )
            thread.updated_at = datetime.utcnow()
            db.add(message)
            db.commit()
            db.refresh(message)

            message_payload = {
                "message_id": message.message_id,
                "thread_id": message.thread_id,
                "sender": message.sender,
                "content": message.content,
                "created_at": message.created_at.isoformat(),
            }

            participants = _participants_for_thread(db, thread.thread_id)
            if not participants:
                participants = [thread.user_a, thread.user_b]

            for participant in set(participants):
                await manager.send_to(participant, {"type": "message", "message": message_payload})
    except WebSocketDisconnect:
        manager.disconnect(username, websocket)
    finally:
        db.close()
