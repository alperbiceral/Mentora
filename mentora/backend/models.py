from datetime import date
from typing import List, Optional

from sqlalchemy import (
    String,
    Integer,
    Float,
    Date,
    ForeignKey,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import (
    DeclarativeBase,
    Mapped,
    mapped_column,
    relationship,
)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    user_id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(50), nullable=False)
    email: Mapped[str] = mapped_column(String(120), nullable=False)
    school: Mapped[Optional[str]] = mapped_column(String(50))
    pass_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    badges: Mapped[str] = mapped_column(Text, nullable=False, default="")
    last_login_date: Mapped[date] = mapped_column(
        Date,
        nullable=False,
        default=date.today,
    )
    streak: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    full_name: Mapped[Optional[str]] = mapped_column(String(100))
    description: Mapped[Optional[str]] = mapped_column(Text)
    age: Mapped[Optional[int]] = mapped_column(Integer)
    department: Mapped[Optional[str]] = mapped_column(String(100))

    # Relationships
    feedbacks = relationship("UserFeedback", back_populates="user")
    personalities = relationship("Personality", back_populates="user")
    emotions = relationship("Emotion", back_populates="user")
    academic_info = relationship("AcademicInfo", back_populates="user", uselist=False)
    posts = relationship("Post", back_populates="owner")


class UserFeedback(Base):
    __tablename__ = "user_feedback"

    feedback_id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.user_id"), nullable=False)
    feedback_message: Mapped[str] = mapped_column(String(1000), nullable=False)
    feedback_tone: Mapped[str] = mapped_column(String, nullable=False)

    user = relationship("User", back_populates="feedbacks")


class Personality(Base):
    __tablename__ = "personality"

    personality_id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.user_id"), nullable=False)
    personality_scores: Mapped[dict] = mapped_column(JSONB)
    test_date: Mapped[date] = mapped_column(Date, nullable=False)

    user = relationship("User", back_populates="personalities")


class Emotion(Base):
    __tablename__ = "emotion"

    emotion_id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.user_id"), nullable=False)
    emotion_test_date: Mapped[date] = mapped_column(Date, nullable=False)
    emotion_scores: Mapped[dict] = mapped_column(JSONB)

    user = relationship("User", back_populates="emotions")


class AcademicInfo(Base):
    __tablename__ = "academic_info"

    academic_info_id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.user_id"), nullable=False)

    syllabus: Mapped[Optional[str]]
    courses: Mapped[dict] = mapped_column(JSONB)
    assignments: Mapped[dict] = mapped_column(JSONB)
    transcript: Mapped[Optional[str]]

    user = relationship("User", back_populates="academic_info")


class Plan(Base):
    __tablename__ = "plan"

    plan_id: Mapped[int] = mapped_column(primary_key=True)
    goal: Mapped[str] = mapped_column(String, nullable=False)
    last_modified: Mapped[date] = mapped_column(Date, nullable=False)
    success_rate: Mapped[float] = mapped_column(Float, nullable=False)

    weekly_plans = relationship("WeeklyPlan", back_populates="plan")


class WeeklyPlan(Base):
    __tablename__ = "weekly_plan"

    weekly_plan_id: Mapped[int] = mapped_column(primary_key=True)
    plan_id: Mapped[int] = mapped_column(ForeignKey("plan.plan_id"), nullable=False)

    weekly_schedule: Mapped[str] = mapped_column(String, nullable=False)
    subject_variation: Mapped[int] = mapped_column(Integer, nullable=False)
    weekly_goal: Mapped[str] = mapped_column(String, nullable=False)
    upcoming_assignments: Mapped[dict] = mapped_column(JSONB, nullable=False)
    weekly_completion_rate: Mapped[float] = mapped_column(Float, nullable=False)

    plan = relationship("Plan", back_populates="weekly_plans")
    daily_plans = relationship("DailyPlan", back_populates="weekly_plan")


class DailyPlan(Base):
    __tablename__ = "daily_plan"

    daily_plan_id: Mapped[int] = mapped_column(primary_key=True)
    weekly_plan_id: Mapped[int] = mapped_column(
        ForeignKey("weekly_plan.weekly_plan_id"),
        nullable=False,
    )

    study_session_num: Mapped[int] = mapped_column(Integer, nullable=False)
    subject_variation: Mapped[int] = mapped_column(Integer, nullable=False)
    daily_feedback_freq: Mapped[int] = mapped_column(Integer, nullable=False)
    daily_schedule: Mapped[dict] = mapped_column(JSONB, nullable=False)
    assignments: Mapped[dict] = mapped_column(JSONB, nullable=False)
    daily_completion_rate: Mapped[float] = mapped_column(Float, nullable=False)

    weekly_plan = relationship("WeeklyPlan", back_populates="daily_plans")
    tasks = relationship("Task", back_populates="daily_plan")


class Task(Base):
    __tablename__ = "task"

    task_id: Mapped[int] = mapped_column(primary_key=True)
    daily_plan_id: Mapped[int] = mapped_column(
        ForeignKey("daily_plan.daily_plan_id"),
        nullable=False,
    )

    focus_duration: Mapped[int] = mapped_column(Integer, nullable=False)
    break_duration: Mapped[int] = mapped_column(Integer, nullable=False)
    break_recommendation: Mapped[str] = mapped_column(String, nullable=False)
    assignment: Mapped[str] = mapped_column(String(50), nullable=False)

    daily_plan = relationship("DailyPlan", back_populates="tasks")


class StudyGroup(Base):
    __tablename__ = "study_group"

    study_group_id: Mapped[int] = mapped_column(primary_key=True)
    enrolled_users: Mapped[int] = mapped_column(Integer, nullable=False)
    group_name: Mapped[str] = mapped_column(String(50), nullable=False)
    group_info: Mapped[str] = mapped_column(String(1000), nullable=False)

    posts = relationship("Post", back_populates="study_group")


class Post(Base):
    __tablename__ = "post"

    post_id: Mapped[int] = mapped_column(primary_key=True)
    study_group_id: Mapped[int] = mapped_column(
        ForeignKey("study_group.study_group_id"),
        nullable=False,
    )
    owner_user_id: Mapped[int] = mapped_column(
        ForeignKey("users.user_id"),
        nullable=False,
    )

    post_message: Mapped[str] = mapped_column(String(2000), nullable=False)
    created_at: Mapped[date] = mapped_column(Date, nullable=False)

    study_group = relationship("StudyGroup", back_populates="posts")
    owner = relationship("User", back_populates="posts")
