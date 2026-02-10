from __future__ import annotations

from fastapi import APIRouter, Body, Depends, HTTPException, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from deps import get_db
from models import (
    ChatMessage,
    ChatParticipant,
    ChatThread,
    Group,
    GroupInvite,
    GroupJoinRequest,
    GroupMember,
    Profile,
    StudySession,
)
from schemas import (
    GroupAction,
    GroupCreate,
    GroupInviteAction,
    GroupInviteCreate,
    GroupInviteItem,
    GroupJoinRequestAction,
    GroupJoinRequestCreate,
    GroupJoinRequestItem,
    GroupListItem,
    GroupListResponse,
    GroupLeaderboardEntry,
    GroupMemberItem,
    GroupMembersResponse,
    GroupRequestsList,
    GroupTransferOwner,
    GroupUpdate,
)

router = APIRouter(prefix="/groups", tags=["groups"])


def _ensure_profile(db: Session, username: str) -> None:
    if not db.query(Profile).filter(Profile.username == username).first():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profile not found",
        )


def _is_member(db: Session, group_id: int, username: str) -> bool:
    return (
        db.query(GroupMember)
        .filter(GroupMember.group_id == group_id, GroupMember.username == username)
        .first()
        is not None
    )


def _member_count(db: Session, group_id: int) -> int:
    return (
        db.query(GroupMember)
        .filter(GroupMember.group_id == group_id)
        .count()
    )


def _add_member(db: Session, group_id: int, username: str, role: str = "member") -> None:
    exists = (
        db.query(GroupMember)
        .filter(GroupMember.group_id == group_id, GroupMember.username == username)
        .first()
    )
    if exists:
        return
    db.add(
        GroupMember(
            group_id=group_id,
            username=username,
            role=role,
        )
    )


def _add_chat_participant(db: Session, thread_id: int, username: str) -> None:
    exists = (
        db.query(ChatParticipant)
        .filter(
            ChatParticipant.thread_id == thread_id,
            ChatParticipant.username == username,
        )
        .first()
    )
    if exists:
        return
    db.add(ChatParticipant(thread_id=thread_id, username=username))


def _get_group(db: Session, group_id: int) -> Group:
    group = db.query(Group).filter(Group.group_id == group_id).first()
    if not group:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Group not found",
        )
    return group


def _ensure_owner(group: Group, username: str) -> None:
    if group.owner_username != username:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only owner can manage this group",
        )


@router.post("", response_model=GroupListItem)
async def create_group(payload: GroupCreate, db: Session = Depends(get_db)):
    name = payload.name.strip()
    if not name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Group name is required",
        )

    _ensure_profile(db, payload.username)

    thread = ChatThread(
        user_a=payload.username,
        user_b=payload.username,
        is_group=True,
        title=f"{name} Chat",
        owner_username=payload.username,
        group_photo=payload.group_photo,
    )
    db.add(thread)
    db.commit()
    db.refresh(thread)

    group = Group(
        name=name,
        description=payload.description,
        is_public=payload.is_public,
        owner_username=payload.username,
        group_photo=payload.group_photo,
        chat_thread_id=thread.thread_id,
    )
    db.add(group)
    db.commit()
    db.refresh(group)

    _add_member(db, group.group_id, payload.username, role="owner")
    _add_chat_participant(db, thread.thread_id, payload.username)

    invitees = list({u for u in (payload.invitees or []) if u != payload.username})
    for invitee in invitees:
        _ensure_profile(db, invitee)
        db.add(
            GroupInvite(
                group_id=group.group_id,
                from_username=payload.username,
                to_username=invitee,
                status="pending",
            )
        )
    if invitees:
        db.commit()

    return GroupListItem(
        group_id=group.group_id,
        name=group.name,
        description=group.description,
        group_photo=group.group_photo,
        is_public=group.is_public,
        owner_username=group.owner_username,
        members_count=_member_count(db, group.group_id),
        chat_thread_id=group.chat_thread_id,
        is_member=True,
        is_owner=True,
    )


@router.get("", response_model=GroupListResponse)
async def list_groups(username: str, db: Session = Depends(get_db)):
    _ensure_profile(db, username)

    membership_ids = (
        db.query(GroupMember.group_id)
        .filter(GroupMember.username == username)
        .subquery()
    )

    groups = (
        db.query(Group)
        .filter(or_(Group.is_public.is_(True), Group.group_id.in_(membership_ids)))
        .order_by(Group.created_at.desc())
        .all()
    )

    items: list[GroupListItem] = []
    for group in groups:
        is_member = _is_member(db, group.group_id, username)
        items.append(
            GroupListItem(
                group_id=group.group_id,
                name=group.name,
                description=group.description,
                group_photo=group.group_photo,
                is_public=group.is_public,
                owner_username=group.owner_username,
                members_count=_member_count(db, group.group_id),
                chat_thread_id=group.chat_thread_id,
                is_member=is_member,
                is_owner=group.owner_username == username,
            )
        )

    return {"groups": items}


@router.get("/{group_id}/members", response_model=GroupMembersResponse)
async def list_group_members(group_id: int, db: Session = Depends(get_db)):
    group = _get_group(db, group_id)
    members = (
        db.query(GroupMember)
        .filter(GroupMember.group_id == group.group_id)
        .order_by(GroupMember.added_at.asc())
        .all()
    )
    return {
        "members": [
            GroupMemberItem(username=member.username, role=member.role)
            for member in members
        ]
    }


@router.get("/{group_id}/leaderboard", response_model=list[GroupLeaderboardEntry])
async def group_leaderboard(
    group_id: int,
    metric: str = "hours",
    db: Session = Depends(get_db),
):
    if metric not in {"hours", "streak"}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid metric",
        )

    group = _get_group(db, group_id)
    members = (
        db.query(GroupMember)
        .filter(GroupMember.group_id == group.group_id)
        .all()
    )
    member_usernames = [member.username for member in members]
    if not member_usernames:
        return []

    profiles = (
        db.query(Profile)
        .filter(Profile.username.in_(member_usernames))
        .all()
    )

    hours_map: dict[str, float] = {}
    if metric == "hours":
        totals = (
            db.query(
                StudySession.username,
                func.coalesce(func.sum(StudySession.duration_minutes), 0),
            )
            .filter(
                StudySession.username.in_(member_usernames),
                StudySession.started_at >= group.created_at,
            )
            .group_by(StudySession.username)
            .all()
        )
        hours_map = {
            username: float(total_minutes or 0) / 60.0
            for username, total_minutes in totals
        }

    entries: list[GroupLeaderboardEntry] = []
    for profile in profiles:
        study_hours = hours_map.get(profile.username, 0.0)
        metric_value = study_hours if metric == "hours" else profile.streak_count
        entries.append(
            GroupLeaderboardEntry(
                rank=0,
                username=profile.username,
                full_name=profile.full_name,
                university=profile.university,
                study_hours=study_hours,
                streak_count=profile.streak_count,
                profile_photo=profile.profile_photo,
            )
        )

    entries.sort(
        key=lambda entry: (
            entry.study_hours if metric == "hours" else entry.streak_count
        ),
        reverse=True,
    )
    for index, entry in enumerate(entries, start=1):
        entry.rank = index

    return entries


@router.put("/{group_id}", response_model=GroupListItem)
async def update_group(
    group_id: int,
    payload: GroupUpdate,
    db: Session = Depends(get_db),
):
    group = _get_group(db, group_id)
    _ensure_owner(group, payload.username)

    if payload.name is not None:
        name = payload.name.strip()
        if not name:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Group name is required",
            )
        group.name = name
        thread = (
            db.query(ChatThread)
            .filter(ChatThread.thread_id == group.chat_thread_id)
            .first()
        )
        if thread:
            thread.title = f"{name} Chat"

    if payload.description is not None:
        group.description = payload.description

    if payload.is_public is not None:
        group.is_public = payload.is_public

    if payload.group_photo is not None:
        group.group_photo = payload.group_photo
        thread = (
            db.query(ChatThread)
            .filter(ChatThread.thread_id == group.chat_thread_id)
            .first()
        )
        if thread:
            thread.group_photo = payload.group_photo

    add_members = list({u for u in (payload.add_members or [])})
    remove_members = list({u for u in (payload.remove_members or [])})

    if add_members:
        for username in add_members:
            if _is_member(db, group.group_id, username):
                continue
            _ensure_profile(db, username)
            existing_invite = (
                db.query(GroupInvite)
                .filter(
                    GroupInvite.group_id == group.group_id,
                    GroupInvite.to_username == username,
                    GroupInvite.status == "pending",
                )
                .first()
            )
            if existing_invite:
                continue
            db.add(
                GroupInvite(
                    group_id=group.group_id,
                    from_username=payload.username,
                    to_username=username,
                    status="pending",
                )
            )

    if remove_members:
        if group.owner_username in remove_members:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot remove group owner",
            )
        (
            db.query(GroupMember)
            .filter(
                GroupMember.group_id == group.group_id,
                GroupMember.username.in_(remove_members),
            )
            .delete(synchronize_session=False)
        )
        (
            db.query(ChatParticipant)
            .filter(
                ChatParticipant.thread_id == group.chat_thread_id,
                ChatParticipant.username.in_(remove_members),
            )
            .delete(synchronize_session=False)
        )

    db.commit()

    return GroupListItem(
        group_id=group.group_id,
        name=group.name,
        description=group.description,
        group_photo=group.group_photo,
        is_public=group.is_public,
        owner_username=group.owner_username,
        members_count=_member_count(db, group.group_id),
        chat_thread_id=group.chat_thread_id,
        is_member=True,
        is_owner=True,
    )


@router.post("/{group_id}/leave")
async def leave_group(
    group_id: int,
    payload: GroupAction,
    db: Session = Depends(get_db),
):
    group = _get_group(db, group_id)
    if group.owner_username == payload.username:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Owner cannot leave the group",
        )
    (
        db.query(GroupMember)
        .filter(
            GroupMember.group_id == group.group_id,
            GroupMember.username == payload.username,
        )
        .delete(synchronize_session=False)
    )
    (
        db.query(ChatParticipant)
        .filter(
            ChatParticipant.thread_id == group.chat_thread_id,
            ChatParticipant.username == payload.username,
        )
        .delete(synchronize_session=False)
    )
    db.commit()
    return {"detail": "Left group"}


@router.delete("/{group_id}")
async def delete_group(
    group_id: int,
    username: str | None = None,
    payload: GroupAction | None = Body(default=None),
    db: Session = Depends(get_db),
):
    group = _get_group(db, group_id)
    resolved_username = payload.username if payload else username
    if not resolved_username:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username is required",
        )
    _ensure_owner(group, resolved_username)

    (
        db.query(ChatMessage)
        .filter(ChatMessage.thread_id == group.chat_thread_id)
        .delete(synchronize_session=False)
    )
    (
        db.query(ChatParticipant)
        .filter(ChatParticipant.thread_id == group.chat_thread_id)
        .delete(synchronize_session=False)
    )
    (
        db.query(GroupInvite)
        .filter(GroupInvite.group_id == group.group_id)
        .delete(synchronize_session=False)
    )
    (
        db.query(GroupJoinRequest)
        .filter(GroupJoinRequest.group_id == group.group_id)
        .delete(synchronize_session=False)
    )
    (
        db.query(GroupMember)
        .filter(GroupMember.group_id == group.group_id)
        .delete(synchronize_session=False)
    )
    (
        db.query(Group)
        .filter(Group.group_id == group.group_id)
        .delete(synchronize_session=False)
    )
    (
        db.query(ChatThread)
        .filter(ChatThread.thread_id == group.chat_thread_id)
        .delete(synchronize_session=False)
    )
    db.commit()
    return {"detail": "Group deleted"}


@router.post("/{group_id}/delete")
async def delete_group_post(
    group_id: int,
    payload: GroupAction,
    db: Session = Depends(get_db),
):
    return await delete_group(
        group_id=group_id,
        username=payload.username,
        payload=payload,
        db=db,
    )


@router.post("/{group_id}/transfer-owner")
async def transfer_owner(
    group_id: int,
    payload: GroupTransferOwner,
    db: Session = Depends(get_db),
):
    group = _get_group(db, group_id)
    _ensure_owner(group, payload.username)

    if payload.new_owner_username == group.owner_username:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User is already the owner",
        )
    if not _is_member(db, group.group_id, payload.new_owner_username):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New owner must be a member",
        )

    group.owner_username = payload.new_owner_username
    thread = (
        db.query(ChatThread)
        .filter(ChatThread.thread_id == group.chat_thread_id)
        .first()
    )
    if thread:
        thread.owner_username = payload.new_owner_username

    (
        db.query(GroupMember)
        .filter(GroupMember.group_id == group.group_id)
        .update({"role": "member"})
    )
    (
        db.query(GroupMember)
        .filter(
            GroupMember.group_id == group.group_id,
            GroupMember.username == payload.new_owner_username,
        )
        .update({"role": "owner"})
    )

    db.commit()
    return {"detail": "Owner transferred"}


@router.post("/invite", response_model=GroupInviteItem)
async def invite_to_group(payload: GroupInviteCreate, db: Session = Depends(get_db)):
    group = db.query(Group).filter(Group.group_id == payload.group_id).first()
    if not group:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Group not found",
        )
    if group.owner_username != payload.from_username:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only owner can invite",
        )

    if _is_member(db, group.group_id, payload.to_username):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Already a member",
        )

    existing = (
        db.query(GroupInvite)
        .filter(
            GroupInvite.group_id == payload.group_id,
            GroupInvite.to_username == payload.to_username,
            GroupInvite.status == "pending",
        )
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invite already pending",
        )

    invite = GroupInvite(
        group_id=payload.group_id,
        from_username=payload.from_username,
        to_username=payload.to_username,
        status="pending",
    )
    db.add(invite)
    db.commit()
    db.refresh(invite)

    return GroupInviteItem(
        invite_id=invite.invite_id,
        group_id=group.group_id,
        group_name=group.name,
        group_photo=group.group_photo,
        from_username=invite.from_username,
        to_username=invite.to_username,
        status=invite.status,
        created_at=invite.created_at,
    )


@router.post("/invites/{invite_id}/accept", response_model=GroupInviteItem)
async def accept_invite(
    invite_id: int,
    payload: GroupInviteAction,
    db: Session = Depends(get_db),
):
    invite = db.query(GroupInvite).filter(GroupInvite.invite_id == invite_id).first()
    if not invite or invite.to_username != payload.username:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invite not found",
        )
    if invite.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invite is not pending",
        )

    group = db.query(Group).filter(Group.group_id == invite.group_id).first()
    if not group:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Group not found",
        )

    if _member_count(db, group.group_id) >= 20:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Group is full",
        )

    invite.status = "accepted"
    _add_member(db, group.group_id, payload.username)
    _add_chat_participant(db, group.chat_thread_id, payload.username)
    db.commit()

    return GroupInviteItem(
        invite_id=invite.invite_id,
        group_id=group.group_id,
        group_name=group.name,
        group_photo=group.group_photo,
        from_username=invite.from_username,
        to_username=invite.to_username,
        status=invite.status,
        created_at=invite.created_at,
    )


@router.post("/invites/{invite_id}/decline", response_model=GroupInviteItem)
async def decline_invite(
    invite_id: int,
    payload: GroupInviteAction,
    db: Session = Depends(get_db),
):
    invite = db.query(GroupInvite).filter(GroupInvite.invite_id == invite_id).first()
    if not invite or invite.to_username != payload.username:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invite not found",
        )
    if invite.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invite is not pending",
        )

    invite.status = "declined"
    group = db.query(Group).filter(Group.group_id == invite.group_id).first()
    db.commit()

    return GroupInviteItem(
        invite_id=invite.invite_id,
        group_id=invite.group_id,
        group_name=group.name if group else "Group",
        group_photo=group.group_photo if group else None,
        from_username=invite.from_username,
        to_username=invite.to_username,
        status=invite.status,
        created_at=invite.created_at,
    )


@router.post("/request", response_model=GroupJoinRequestItem)
async def request_to_join(payload: GroupJoinRequestCreate, db: Session = Depends(get_db)):
    group = db.query(Group).filter(Group.group_id == payload.group_id).first()
    if not group:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Group not found",
        )
    if _is_member(db, group.group_id, payload.username):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Already a member",
        )

    existing = (
        db.query(GroupJoinRequest)
        .filter(
            GroupJoinRequest.group_id == payload.group_id,
            GroupJoinRequest.username == payload.username,
            GroupJoinRequest.status == "pending",
        )
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Request already pending",
        )

    request = GroupJoinRequest(
        group_id=payload.group_id,
        username=payload.username,
        status="pending",
    )
    db.add(request)
    db.commit()
    db.refresh(request)

    return GroupJoinRequestItem(
        request_id=request.request_id,
        group_id=group.group_id,
        group_name=group.name,
        group_photo=group.group_photo,
        username=request.username,
        status=request.status,
        created_at=request.created_at,
    )


@router.post("/requests/{request_id}/approve", response_model=GroupJoinRequestItem)
async def approve_join_request(
    request_id: int,
    payload: GroupJoinRequestAction,
    db: Session = Depends(get_db),
):
    request = (
        db.query(GroupJoinRequest)
        .filter(GroupJoinRequest.request_id == request_id)
        .first()
    )
    if not request or request.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Request not found",
        )

    group = db.query(Group).filter(Group.group_id == request.group_id).first()
    if not group:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Group not found",
        )
    if group.owner_username != payload.username:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only owner can approve",
        )

    if _member_count(db, group.group_id) >= 20:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Group is full",
        )

    request.status = "accepted"
    _add_member(db, group.group_id, request.username)
    _add_chat_participant(db, group.chat_thread_id, request.username)
    db.commit()

    return GroupJoinRequestItem(
        request_id=request.request_id,
        group_id=group.group_id,
        group_name=group.name,
        group_photo=group.group_photo,
        username=request.username,
        status=request.status,
        created_at=request.created_at,
    )


@router.post("/requests/{request_id}/decline", response_model=GroupJoinRequestItem)
async def decline_join_request(
    request_id: int,
    payload: GroupJoinRequestAction,
    db: Session = Depends(get_db),
):
    request = (
        db.query(GroupJoinRequest)
        .filter(GroupJoinRequest.request_id == request_id)
        .first()
    )
    if not request or request.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Request not found",
        )

    group = db.query(Group).filter(Group.group_id == request.group_id).first()
    if not group:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Group not found",
        )
    if group.owner_username != payload.username:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only owner can decline",
        )

    request.status = "declined"
    db.commit()

    return GroupJoinRequestItem(
        request_id=request.request_id,
        group_id=group.group_id,
        group_name=group.name,
        group_photo=group.group_photo,
        username=request.username,
        status=request.status,
        created_at=request.created_at,
    )


@router.get("/requests/{username}", response_model=GroupRequestsList)
async def list_group_requests(username: str, db: Session = Depends(get_db)):
    incoming_invites = (
        db.query(GroupInvite)
        .filter(GroupInvite.to_username == username, GroupInvite.status == "pending")
        .order_by(GroupInvite.created_at.desc())
        .all()
    )
    outgoing_invites = (
        db.query(GroupInvite)
        .filter(GroupInvite.from_username == username, GroupInvite.status == "pending")
        .order_by(GroupInvite.created_at.desc())
        .all()
    )

    owner_groups = (
        db.query(Group.group_id)
        .filter(Group.owner_username == username)
        .subquery()
    )
    incoming_join_requests = (
        db.query(GroupJoinRequest)
        .filter(
            GroupJoinRequest.group_id.in_(owner_groups),
            GroupJoinRequest.status == "pending",
        )
        .order_by(GroupJoinRequest.created_at.desc())
        .all()
    )
    outgoing_join_requests = (
        db.query(GroupJoinRequest)
        .filter(GroupJoinRequest.username == username, GroupJoinRequest.status == "pending")
        .order_by(GroupJoinRequest.created_at.desc())
        .all()
    )

    def invite_item(invite: GroupInvite) -> GroupInviteItem:
        group = db.query(Group).filter(Group.group_id == invite.group_id).first()
        return GroupInviteItem(
            invite_id=invite.invite_id,
            group_id=invite.group_id,
            group_name=group.name if group else "Group",
            group_photo=group.group_photo if group else None,
            from_username=invite.from_username,
            to_username=invite.to_username,
            status=invite.status,
            created_at=invite.created_at,
        )

    def request_item(request: GroupJoinRequest) -> GroupJoinRequestItem:
        group = db.query(Group).filter(Group.group_id == request.group_id).first()
        return GroupJoinRequestItem(
            request_id=request.request_id,
            group_id=request.group_id,
            group_name=group.name if group else "Group",
            group_photo=group.group_photo if group else None,
            username=request.username,
            status=request.status,
            created_at=request.created_at,
        )

    return {
        "incoming_invites": [invite_item(item) for item in incoming_invites],
        "outgoing_invites": [invite_item(item) for item in outgoing_invites],
        "incoming_join_requests": [request_item(item) for item in incoming_join_requests],
        "outgoing_join_requests": [request_item(item) for item in outgoing_join_requests],
    }
