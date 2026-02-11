from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from deps import get_db
from models import Course, CourseBlock, Profile
from schemas import CourseCreate, CourseResponse, CourseUpdate

router = APIRouter(prefix="/courses", tags=["courses"])


@router.options("")
async def options_courses():
    return {}


@router.get("/{username}", response_model=list[CourseResponse])
async def list_courses(username: str, db: Session = Depends(get_db)):
    courses = db.query(Course).filter(Course.username == username).all()
    return courses


@router.post("", response_model=CourseResponse, status_code=status.HTTP_201_CREATED)
async def create_course(payload: CourseCreate, db: Session = Depends(get_db)):
    profile = db.query(Profile).filter(Profile.username == payload.username).first()
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profile not found",
        )

    course = Course(
        username=payload.username,
        name=payload.name,
        description=payload.description,
        instructor=payload.instructor,
        location=payload.location,
        color=payload.color,
    )
    course.blocks = [
        CourseBlock(day=block.day, start=block.start, end=block.end)
        for block in payload.blocks
    ]

    db.add(course)
    db.commit()
    db.refresh(course)
    return course


@router.put("/{course_id}", response_model=CourseResponse)
async def update_course(
    course_id: int,
    payload: CourseUpdate,
    db: Session = Depends(get_db),
):
    course = db.query(Course).filter(Course.course_id == course_id).first()
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course not found",
        )

    if course.username != payload.username:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not allowed to edit this course",
        )

    course.name = payload.name
    course.description = payload.description
    course.instructor = payload.instructor
    course.location = payload.location
    if payload.color is not None:
        course.color = payload.color

    course.blocks.clear()
    course.blocks = [
        CourseBlock(day=block.day, start=block.start, end=block.end)
        for block in payload.blocks
    ]

    db.commit()
    db.refresh(course)
    return course
