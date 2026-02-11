from datetime import date
from typing import Dict, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from deps import get_current_user, get_db
from models import Personality, User

router = APIRouter(prefix="/ocean", tags=["ocean"])


class OceanAnswer(BaseModel):
    value: int = Field(..., ge=1, le=5)


class OceanProfile(BaseModel):
    openness: float
    conscientiousness: float
    extraversion: float
    agreeableness: float
    neuroticism: float


# Question trait mappings: [openness, conscientiousness, extraversion, agreeableness, neuroticism]
QUESTION_TRAITS = [
    [0, 0, 1, 0, 0],   # 1: konuşkan
    [0, 0, 1, 0, 0],   # 2: dışa dönük, sosyal
    [0, 0, -1, 0, 0],  # 3: sessiz olmaya eğilimli
    [0, 0, 1, 0, 0],   # 4: enerji dolu
    [0, 0, 0, 1, 0],   # 5: yardımsever, bencil olmayan
    [0, 0, 0, 1, 0],   # 6: şefkatli, yumuşak kalpli
    [0, 0, 0, -1, 0],  # 7: başkalarında hata arama eğiliminde
    [0, 0, 0, -1, 0],  # 8: soğuk ve başkalarını umursamayan
    [0, 1, 0, 0, 0],   # 9: kolay vazgeçmeyen
    [0, 1, 0, 0, 0],   # 10: güvenilir, istikrarlı
    [0, 1, 0, 0, 0],   # 11: etrafını derli toplu tutan
    [0, -1, 0, 0, 0],  # 12: dağınık olma eğiliminde
    [0, 0, 0, 0, 1],   # 13: çok endişelenen
    [0, 0, 0, 0, 1],   # 14: sıkça üzgün hisseden
    [0, 0, 0, 0, 1],   # 15: gergin olabilen
    [0, 0, 0, 0, 1],   # 16: ruh hali inişli çıkışlı
    [1, 0, 0, 0, 0],   # 17: birçok şeye merak duyan
    [1, 0, 0, 0, 0],   # 18: özgün, yeni fikirler üreten
    [1, 0, 0, 0, 0],   # 19: yaratıcı
    [1, 0, 0, 0, 0],   # 20: sanatla çok ilgili
]

# Store answers per user: {user_id: [answers]}
user_answers: Dict[int, list[Optional[int]]] = {}


def get_user_answers(user_id: int) -> list[Optional[int]]:
    """Get or create answers list for a user."""
    if user_id not in user_answers:
        user_answers[user_id] = [None] * 20
    return user_answers[user_id]


def set_answer(user_id: int, question_number: int, value: int) -> None:
    answers = get_user_answers(user_id)
    answers[question_number - 1] = value


def calculate_ocean_profile(user_id: int) -> OceanProfile:
    """Calculate OCEAN personality profile based on answers."""
    answers = get_user_answers(user_id)
    scores = [0.0, 0.0, 0.0, 0.0, 0.0]  # O, C, E, A, N
    
    for i, answer in enumerate(answers):
        if answer is not None:
            traits = QUESTION_TRAITS[i]
            for j in range(5):
                scores[j] += answer * traits[j]
    
    normalized_scores = []
    for score in scores:
        # Normalize to 0-100 scale
        normalized = ((score + 20) / 40) * 100
        # Clamp to valid range
        normalized = max(0, min(100, normalized))
        normalized_scores.append(round(normalized, 2))
    
    return OceanProfile(
        openness=normalized_scores[0],
        conscientiousness=normalized_scores[1],
        extraversion=normalized_scores[2],
        agreeableness=normalized_scores[3],
        neuroticism=normalized_scores[4],
    )


def make_handler(question_number: int):
    async def handler(
        payload: OceanAnswer,
        current_user: User = Depends(get_current_user),
    ):
        set_answer(current_user.user_id, question_number, payload.value)
        return {
            "question": question_number,
            "value": payload.value,
            "user_id": current_user.user_id,
        }

    return handler


for question_number in range(1, 21):
    router.add_api_route(
        f"/{question_number}",
        make_handler(question_number),
        methods=["POST"],
    )


@router.get("")
async def get_all_answers(current_user: User = Depends(get_current_user)):
    """Get all answers for the current user."""
    answers = get_user_answers(current_user.user_id)
    return {"answers": answers, "user_id": current_user.user_id}


@router.get("/profile/calculate")
async def get_personality_profile(current_user: User = Depends(get_current_user)):
    """Calculate and return the OCEAN personality profile based on all answers."""
    answers = get_user_answers(current_user.user_id)
    profile = calculate_ocean_profile(current_user.user_id)
    completed = sum(1 for answer in answers if answer is not None)
    
    return {
        "profile": profile,
        "completed": completed,
        "total": 20,
        "is_complete": completed == 20,
    }


@router.post("/profile/save")
async def save_personality_profile(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Save the calculated OCEAN personality profile to the database."""
    answers = get_user_answers(current_user.user_id)
    completed = sum(1 for answer in answers if answer is not None)
    
    if completed < 20:
        raise HTTPException(
            status_code=400,
            detail=f"All 20 questions must be answered. Completed: {completed}/20",
        )
    
    profile = calculate_ocean_profile(current_user.user_id)
    
    # Check if user already has a personality profile
    existing_personality = (
        db.query(Personality)
        .filter(Personality.user_id == current_user.user_id)
        .order_by(Personality.test_date.desc())
        .first()
    )
    
    # Create personality scores dictionary
    personality_scores = {
        "openness": profile.openness,
        "conscientiousness": profile.conscientiousness,
        "extraversion": profile.extraversion,
        "agreeableness": profile.agreeableness,
        "neuroticism": profile.neuroticism,
    }
    
    # Create new personality record
    new_personality = Personality(
        user_id=current_user.user_id,
        personality_scores=personality_scores,
        test_date=date.today(),
    )
    
    db.add(new_personality)
    db.commit()
    db.refresh(new_personality)
    
    return {
        "message": "Personality profile saved successfully",
        "personality_id": new_personality.personality_id,
        "profile": profile,
        "test_date": new_personality.test_date,
    }


@router.get("/{question_number}")
async def get_answer(
    question_number: int,
    current_user: User = Depends(get_current_user),
):
    """Get a specific answer for the current user."""
    if question_number < 1 or question_number > 20:
        return {"question": question_number, "value": None}
    
    answers = get_user_answers(current_user.user_id)
    return {
        "question": question_number,
        "value": answers[question_number - 1],
        "user_id": current_user.user_id,
    }
