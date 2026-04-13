from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func, select
from datetime import date, datetime, timedelta
from typing import Optional
import json
import logging
import random

from config import GEMINI_API_KEY, GEMINI_MODEL
from deps import get_db
from models import DailyQuestion, Profile, Course
from schemas import DailyQuestionResponse, AnswerQuestionRequest
from google import genai
from google.genai import types

router = APIRouter(prefix="/daily-question", tags=["daily_question"])

logger = logging.getLogger("mentora.daily_question")

GENERAL_KNOWLEDGE_MARKER = "__general_knowledge__"


def _courses_with_descriptions(username: str, db: Session) -> list:
    courses = db.query(Course).filter(Course.username == username).all()
    return [c for c in courses if c.description and c.description.strip()]


def _question_response(q: "DailyQuestion") -> DailyQuestionResponse:
    return DailyQuestionResponse(
        question_id=q.question_id,
        question_text=q.question_text,
        option_a=q.option_a,
        option_b=q.option_b,
        option_c=q.option_c,
        option_d=q.option_d,
        answered=q.answered_at is not None,
        is_correct=q.is_correct,
        selected_answer=q.selected_answer,
    )


@router.get("/{username}", response_model=DailyQuestionResponse)
async def get_daily_question(username: str, db: Session = Depends(get_db)):
    today = date.today()

    existing = db.query(DailyQuestion).filter(
        DailyQuestion.username == username,
        DailyQuestion.question_date == today,
    ).first()

    if existing:
        return _question_response(existing)

    courses_desc = _courses_with_descriptions(username, db)

    if courses_desc:
        question_data, source_course = await _generate_course_question(courses_desc, db)
    else:
        question_data, source_course = await _get_or_create_global_question(today, db)

    new_question = DailyQuestion(
        username=username,
        question_date=today,
        question_text=question_data["question"],
        correct_answer=question_data["correct_answer"],
        option_a=question_data["option_a"],
        option_b=question_data["option_b"],
        option_c=question_data["option_c"],
        option_d=question_data["option_d"],
        source_course=source_course,
    )

    db.add(new_question)
    db.commit()
    db.refresh(new_question)

    return _question_response(new_question)


@router.post("/{question_id}/answer")
async def answer_question(
    question_id: int,
    request: AnswerQuestionRequest,
    db: Session = Depends(get_db),
):
    question = db.query(DailyQuestion).filter(
        DailyQuestion.question_id == question_id,
    ).first()

    if not question:
        raise HTTPException(status_code=404, detail="Question not found")

    if question.answered_at is not None:
        raise HTTPException(status_code=400, detail="Question already answered")

    is_correct = request.selected_answer.upper() == question.correct_answer.upper()

    question.answered_at = datetime.utcnow()
    question.selected_answer = request.selected_answer.upper()
    question.response_time_seconds = request.response_time_seconds
    question.is_correct = is_correct

    profile = db.query(Profile).filter(Profile.username == question.username).first()

    if profile:
        if is_correct and request.response_time_seconds <= 15:
            profile.streak_count += 1
        else:
            profile.streak_count = max(0, profile.streak_count - 1)
        streak_updated = True
        new_streak = profile.streak_count
    else:
        streak_updated = False
        new_streak = 0

    db.commit()

    return {
        "correct": is_correct,
        "correct_answer": question.correct_answer,
        "streak_updated": streak_updated,
        "new_streak": new_streak,
        "response_time": request.response_time_seconds,
    }


@router.get("/streak/{username}")
async def get_user_streak(username: str, db: Session = Depends(get_db)):
    profile = db.query(Profile).filter(Profile.username == username).first()

    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    yesterday = date.today() - timedelta(days=1)

    yesterday_question = db.query(DailyQuestion).filter(
        DailyQuestion.username == username,
        DailyQuestion.question_date == yesterday,
    ).first()

    if yesterday_question:
        was_unanswered = yesterday_question.answered_at is None
        was_wrong = not yesterday_question.is_correct if yesterday_question.answered_at else False
        if was_unanswered or was_wrong:
            if profile.streak_count > 0:
                profile.streak_count = max(0, profile.streak_count - 1)
                db.commit()

    return {
        "username": username,
        "streak_count": profile.streak_count,
    }


def _parse_gemini_json(response_text: str) -> dict:
    text = response_text.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        text = "\n".join(lines[1:-1]) if len(lines) > 2 else text
    text = text.strip()
    if text.startswith("json"):
        text = text[4:].strip()

    question_data = json.loads(text)

    required_fields = ["question", "correct_answer", "option_a", "option_b", "option_c", "option_d"]
    for field in required_fields:
        if field not in question_data:
            raise ValueError(f"Missing field: {field}")

    question_data["correct_answer"] = question_data["correct_answer"].upper()
    if question_data["correct_answer"] not in ["A", "B", "C", "D"]:
        question_data["correct_answer"] = "A"

    return question_data


def _build_course_prompt(course_name: str, description: str) -> str:
    return f"""Based on this course and its syllabus/description:
Course: {course_name}
Description: {description}

Generate ONE multiple-choice question in ENGLISH strictly related to the topics in this description.

IMPORTANT:
- The question MUST be directly about the academic content described above.
- If the description does not contain any meaningful academic content, return ONLY the word FALLBACK (nothing else).
- The question should be suitable for 14-15 year old high school students.
- Make it moderate difficulty - not too easy, not too hard.
- Focus on fundamental concepts and basic understanding.
- Avoid advanced terminology or complex theories.

Return ONLY valid JSON in this exact format:
{{
  "question": "question text here",
  "correct_answer": "A",
  "option_a": "first option",
  "option_b": "second option",
  "option_c": "third option",
  "option_d": "fourth option"
}}

Use only A, B, C, or D for correct_answer."""


_GENERAL_PROMPT = """Generate ONE general knowledge multiple-choice question in ENGLISH.

IMPORTANT:
- The question should be suitable for 14-15 year old high school students
- Make it moderate difficulty - something a typical teenager would know or could figure out
- Topics: basic science, world geography, popular history, technology, sports, or general culture
- Avoid obscure facts, advanced academic knowledge, or specialized topics
- The question should be fun, engaging, and educational

Return ONLY valid JSON in this exact format:
{
  "question": "question text here",
  "correct_answer": "A",
  "option_a": "first option",
  "option_b": "second option",
  "option_c": "third option",
  "option_d": "fourth option"
}

Use only A, B, C, or D for correct_answer."""

_FALLBACK_QUESTION: dict = {
    "question": "What is the capital of France?",
    "correct_answer": "A",
    "option_a": "Paris",
    "option_b": "London",
    "option_c": "Berlin",
    "option_d": "Madrid",
}


async def _generate_course_question(courses_with_desc: list, db: Session) -> tuple[dict, str]:
    """Pick a random course with description and generate a question from it.
    Falls back to general knowledge if Gemini can't use the description."""
    client = genai.Client(api_key=GEMINI_API_KEY)
    chosen = random.choice(courses_with_desc)
    prompt = _build_course_prompt(chosen.name, chosen.description)
    try:
        response = client.models.generate_content(model=GEMINI_MODEL, contents=prompt)
        raw = response.text.strip()
        if raw.upper().startswith("FALLBACK"):
            raise ValueError("Gemini indicated FALLBACK for unusable description")
        return _parse_gemini_json(raw), chosen.name
    except Exception as e:
        logger.warning(f"Course-based question failed for '{chosen.name}', falling back to general: {e}")
        return await _generate_general_question(client)


async def _get_or_create_global_question(today: date, db: Session) -> tuple[dict, str]:
    """Return the shared global question of the day.
    All users without course descriptions get the exact same question."""
    existing_global = db.query(DailyQuestion).filter(
        DailyQuestion.question_date == today,
        DailyQuestion.source_course == GENERAL_KNOWLEDGE_MARKER,
    ).first()

    if existing_global:
        return {
            "question": existing_global.question_text,
            "correct_answer": existing_global.correct_answer,
            "option_a": existing_global.option_a,
            "option_b": existing_global.option_b,
            "option_c": existing_global.option_c,
            "option_d": existing_global.option_d,
        }, GENERAL_KNOWLEDGE_MARKER

    client = genai.Client(api_key=GEMINI_API_KEY)
    return await _generate_general_question(client)


async def _generate_general_question(client) -> tuple[dict, str]:
    """Generate a general knowledge question via Gemini."""
    try:
        response = client.models.generate_content(model=GEMINI_MODEL, contents=_GENERAL_PROMPT)
        return _parse_gemini_json(response.text), GENERAL_KNOWLEDGE_MARKER
    except Exception as e:
        logger.error(f"General question generation failed: {e}")
        return _FALLBACK_QUESTION, GENERAL_KNOWLEDGE_MARKER
