from typing import List, Optional

from datetime import date

import warnings
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from transformers import pipeline

# Suppress known non-actionable warnings from HF libraries
warnings.filterwarnings(
    "ignore",
    category=FutureWarning,
    module=r"huggingface_hub.file_download",
)
warnings.filterwarnings(
    "ignore",
    category=UserWarning,
    message=r"`return_all_scores` is now deprecated.*",
)

from deps import get_db
from models import Emotion, User

router = APIRouter(prefix="/emotion", tags=["emotion"])

# Pre-load classifier once at import time
classifier = pipeline(
    "text-classification",
    model="j-hartmann/emotion-english-distilroberta-base",
    top_k=None,
)


class EmotionRequest(BaseModel):
    text: str
    username: Optional[str] = None


class EmotionScore(BaseModel):
    label: str
    score: float


class EmotionResponse(BaseModel):
    text: str
    scores: List[EmotionScore]


@router.options("")
async def options_emotion():
    return {}


@router.post("/analyze", response_model=EmotionResponse)
async def analyze_emotion(req: EmotionRequest, db: Session = Depends(get_db)):
    """Analyze input text and return emotion scores sorted by score desc.

    If `username` is provided, persist the emotion scores into `emotion` table.
    """
    result = classifier(req.text)
    scores = result[0]
    sorted_scores = sorted(scores, key=lambda e: e["score"], reverse=True)

    # Persist if username supplied
    if req.username:
        user = db.query(User).filter(User.username == req.username).first()
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found",
            )

        # convert list of {label, score} to dict
        scores_dict = {e["label"]: float(e["score"]) for e in scores}
        emotion_row = Emotion(
            user_id=user.user_id,
            emotion_test_date=date.today(),
            emotion_scores=scores_dict,
        )
        db.add(emotion_row)
        db.commit()
        db.refresh(emotion_row)

    return EmotionResponse(
        text=req.text,
        scores=[EmotionScore(label=e["label"], score=e["score"]) for e in sorted_scores],
    )
