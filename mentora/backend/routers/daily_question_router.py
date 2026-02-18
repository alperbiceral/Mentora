from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func, select
from datetime import date, datetime
from typing import Optional
import json
import logging

from config import GEMINI_API_KEY, GEMINI_MODEL
from deps import get_db
from models import DailyQuestion, Profile, Course
from schemas import DailyQuestionResponse, AnswerQuestionRequest
from google import genai
from google.genai import types

router = APIRouter(prefix="/daily-question", tags=["daily_question"])

logger = logging.getLogger("mentora.daily_question")


@router.get("/{username}", response_model=DailyQuestionResponse)
async def get_daily_question(username: str, db: Session = Depends(get_db)):
    """
    Get today's question for a user. If not exists, generate with Gemini AI.
    """
    today = date.today()
    
    # Check if today's question exists
    existing_question = db.query(DailyQuestion).filter(
        DailyQuestion.username == username,
        DailyQuestion.question_date == today
    ).first()
    
    if existing_question:
        return DailyQuestionResponse(
            question_id=existing_question.question_id,
            question_text=existing_question.question_text,
            option_a=existing_question.option_a,
            option_b=existing_question.option_b,
            option_c=existing_question.option_c,
            option_d=existing_question.option_d,
            answered=existing_question.answered_at is not None,
            is_correct=existing_question.is_correct,
            selected_answer=existing_question.selected_answer,
        )
    
    # Generate new question
    question_data = await generate_question_with_gemini(username, db)
    
    # Save to database
    new_question = DailyQuestion(
        username=username,
        question_date=today,
        question_text=question_data["question"],
        correct_answer=question_data["correct_answer"],
        option_a=question_data["option_a"],
        option_b=question_data["option_b"],
        option_c=question_data["option_c"],
        option_d=question_data["option_d"],
    )
    
    db.add(new_question)
    db.commit()
    db.refresh(new_question)
    
    return DailyQuestionResponse(
        question_id=new_question.question_id,
        question_text=new_question.question_text,
        option_a=new_question.option_a,
        option_b=new_question.option_b,
        option_c=new_question.option_c,
        option_d=new_question.option_d,
        answered=False,
        is_correct=None,
        selected_answer=None,
    )


@router.post("/{question_id}/answer")
async def answer_question(
    question_id: int,
    request: AnswerQuestionRequest,
    db: Session = Depends(get_db)
):
    """
    Submit answer for a daily question. Updates streak if correct and within time limit.
    """
    question = db.query(DailyQuestion).filter(
        DailyQuestion.question_id == question_id
    ).first()
    
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")
    
    if question.answered_at is not None:
        raise HTTPException(status_code=400, detail="Question already answered")
    
    # Check if answer is correct
    is_correct = request.selected_answer.upper() == question.correct_answer.upper()
    
    # Update question
    question.answered_at = datetime.utcnow()
    question.selected_answer = request.selected_answer.upper()
    question.response_time_seconds = request.response_time_seconds
    question.is_correct = is_correct
    
    # Update streak in profile
    profile = db.query(Profile).filter(Profile.username == question.username).first()
    
    if profile:
        if is_correct and request.response_time_seconds <= 15:
            # Increment streak
            profile.streak_count += 1
            streak_updated = True
            new_streak = profile.streak_count
        else:
            # Reset streak
            profile.streak_count = 0
            streak_updated = True
            new_streak = 0
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
    """
    Get user's current streak count.
    """
    profile = db.query(Profile).filter(Profile.username == username).first()
    
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    
    # Check if yesterday's question was answered correctly
    yesterday = date.today()
    from datetime import timedelta
    yesterday = yesterday - timedelta(days=1)
    
    yesterday_question = db.query(DailyQuestion).filter(
        DailyQuestion.username == username,
        DailyQuestion.question_date == yesterday
    ).first()
    
    # If yesterday's question wasn't answered or was wrong, reset streak
    if yesterday_question:
        if yesterday_question.answered_at is None or not yesterday_question.is_correct:
            if profile.streak_count > 0:
                profile.streak_count = 0
                db.commit()
    
    return {
        "username": username,
        "streak_count": profile.streak_count,
    }


async def generate_question_with_gemini(username: str, db: Session) -> dict:
    """
    Generate a multiple-choice question using Gemini AI based on user's courses.
    """
    # Get user's courses with descriptions
    courses = db.query(Course).filter(Course.username == username).all()
    
    course_topics = []
    for course in courses:
        if course.description and course.description.strip():
            course_topics.append(f"{course.name}: {course.description}")
    
    # Create prompt based on whether user has course topics
    if course_topics:
        topics_text = "\n".join(course_topics)
        prompt = f"""Based on these course topics:
{topics_text}

Generate ONE multiple-choice question in ENGLISH related to these topics. 

IMPORTANT:
- The question should be suitable for 14-15 year old high school students
- Make it moderate difficulty - not too easy, not too hard
- Focus on fundamental concepts and basic understanding
- Avoid advanced terminology or complex theories
- The question should be clear and straightforward

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
    else:
        prompt = """Generate ONE general knowledge multiple-choice question in ENGLISH.

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
    
    try:
        client = genai.Client(api_key=GEMINI_API_KEY)
        response = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=prompt,
        )
        
        response_text = response.text.strip()
        
        # Remove markdown code blocks if present
        if response_text.startswith("```"):
            lines = response_text.split("\n")
            response_text = "\n".join(lines[1:-1]) if len(lines) > 2 else response_text
        
        response_text = response_text.strip()
        if response_text.startswith("json"):
            response_text = response_text[4:].strip()
        
        question_data = json.loads(response_text)
        
        # Validate the response
        required_fields = ["question", "correct_answer", "option_a", "option_b", "option_c", "option_d"]
        for field in required_fields:
            if field not in question_data:
                raise ValueError(f"Missing field: {field}")
        
        # Ensure correct_answer is uppercase A, B, C, or D
        question_data["correct_answer"] = question_data["correct_answer"].upper()
        if question_data["correct_answer"] not in ["A", "B", "C", "D"]:
            question_data["correct_answer"] = "A"  # Default fallback
        
        return question_data
        
    except Exception as e:
        logger.error(f"Error generating question with Gemini: {e}")
        # Fallback question
        return {
            "question": "What is the capital of France?",
            "correct_answer": "A",
            "option_a": "Paris",
            "option_b": "London",
            "option_c": "Berlin",
            "option_d": "Madrid"
        }
