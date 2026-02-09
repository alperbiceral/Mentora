from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field

router = APIRouter(prefix="/ocean", tags=["ocean"])


class OceanAnswer(BaseModel):
    value: int = Field(..., ge=1, le=5)


answers: list[Optional[int]] = [None] * 20


def set_answer(question_number: int, value: int) -> None:
    answers[question_number - 1] = value


def make_handler(question_number: int):
    async def handler(payload: OceanAnswer):
        set_answer(question_number, payload.value)
        return {"question": question_number, "value": payload.value}

    return handler


for question_number in range(1, 21):
    router.add_api_route(
        f"/{question_number}",
        make_handler(question_number),
        methods=["POST"],
    )


@router.get("")
async def get_all_answers():
    return {"answers": answers}


@router.get("/{question_number}")
async def get_answer(question_number: int):
    if question_number < 1 or question_number > 20:
        return {"question": question_number, "value": None}
    return {"question": question_number, "value": answers[question_number - 1]}
