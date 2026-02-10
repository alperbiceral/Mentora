from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from deps import get_db
from models import Friend, FriendRequest, Profile
from schemas import (
    FriendListResponse,
    FriendProfile,
    FriendRequestAction,
    FriendRequestCreate,
    FriendRequestResponse,
    FriendRequestsList,
    FriendSearchResponse,
)

router = APIRouter(prefix="/friends", tags=["friends"])


def _to_profile_item(profile: Profile) -> FriendProfile:
    return FriendProfile(
        username=profile.username,
        full_name=profile.full_name,
        university=profile.university,
        streak_count=profile.streak_count,
        study_hours=profile.study_hours,
        profile_photo=profile.profile_photo,
    )


@router.get("/search", response_model=FriendSearchResponse)
async def search_profiles(query: str, requester: str | None = None, db: Session = Depends(get_db)):
    if not query:
        return {"results": []}

    profiles = (
        db.query(Profile)
        .filter(Profile.username.ilike(f"{query}%"))
        .limit(10)
        .all()
    )

    results = [p for p in profiles if not requester or p.username != requester]
    return {"results": [_to_profile_item(p) for p in results]}


@router.post("/request", response_model=FriendRequestResponse)
async def send_friend_request(payload: FriendRequestCreate, db: Session = Depends(get_db)):
    if payload.from_username == payload.to_username:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot add yourself",
        )

    from_profile = db.query(Profile).filter(Profile.username == payload.from_username).first()
    to_profile = db.query(Profile).filter(Profile.username == payload.to_username).first()
    if not from_profile or not to_profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profile not found",
        )

    existing_friend = db.query(Friend).filter(
        or_(
            (Friend.user_a == payload.from_username) & (Friend.user_b == payload.to_username),
            (Friend.user_a == payload.to_username) & (Friend.user_b == payload.from_username),
        )
    ).first()
    if existing_friend:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Already friends",
        )

    existing_request = db.query(FriendRequest).filter(
        or_(
            (FriendRequest.from_username == payload.from_username)
            & (FriendRequest.to_username == payload.to_username)
            & (FriendRequest.status == "pending"),
            (FriendRequest.from_username == payload.to_username)
            & (FriendRequest.to_username == payload.from_username)
            & (FriendRequest.status == "pending"),
        )
    ).first()
    if existing_request:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Request already pending",
        )

    request = FriendRequest(
        from_username=payload.from_username,
        to_username=payload.to_username,
        status="pending",
    )
    db.add(request)
    db.commit()
    db.refresh(request)
    return request


@router.get("/requests/{username}", response_model=FriendRequestsList)
async def list_requests(username: str, db: Session = Depends(get_db)):
    incoming = (
        db.query(FriendRequest)
        .filter(
            FriendRequest.to_username == username,
            FriendRequest.status == "pending",
        )
        .order_by(FriendRequest.created_at.desc())
        .all()
    )
    outgoing = (
        db.query(FriendRequest)
        .filter(
            FriendRequest.from_username == username,
            FriendRequest.status == "pending",
        )
        .order_by(FriendRequest.created_at.desc())
        .all()
    )
    return {"incoming": incoming, "outgoing": outgoing}


@router.post("/requests/{request_id}/accept", response_model=FriendRequestResponse)
async def accept_request(
    request_id: int,
    payload: FriendRequestAction,
    db: Session = Depends(get_db),
):
    request = db.query(FriendRequest).filter(FriendRequest.request_id == request_id).first()
    if not request or request.to_username != payload.username:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Request not found",
        )

    request.status = "accepted"
    db.add(Friend(user_a=request.from_username, user_b=request.to_username))
    db.commit()
    db.refresh(request)
    return request


@router.post("/requests/{request_id}/decline", response_model=FriendRequestResponse)
async def decline_request(
    request_id: int,
    payload: FriendRequestAction,
    db: Session = Depends(get_db),
):
    request = db.query(FriendRequest).filter(FriendRequest.request_id == request_id).first()
    if not request or request.to_username != payload.username:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Request not found",
        )

    request.status = "declined"
    db.commit()
    db.refresh(request)
    return request


@router.post("/requests/{request_id}/cancel", response_model=FriendRequestResponse)
async def cancel_request(
    request_id: int,
    payload: FriendRequestAction,
    db: Session = Depends(get_db),
):
    request = db.query(FriendRequest).filter(FriendRequest.request_id == request_id).first()
    if not request or request.from_username != payload.username:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Request not found",
        )
    if request.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Request is not pending",
        )

    request.status = "canceled"
    db.commit()
    db.refresh(request)
    return request


@router.get("/list/{username}", response_model=FriendListResponse)
async def list_friends(username: str, db: Session = Depends(get_db)):
    friend_rows = db.query(Friend).filter(
        or_(Friend.user_a == username, Friend.user_b == username)
    ).all()

    friend_usernames = [
        row.user_b if row.user_a == username else row.user_a for row in friend_rows
    ]
    if not friend_usernames:
        return {"friends": []}

    profiles = db.query(Profile).filter(Profile.username.in_(friend_usernames)).all()
    return {"friends": [_to_profile_item(p) for p in profiles]}
