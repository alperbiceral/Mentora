from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import logging

from database import engine
from routers.auth_router import router as auth_router
from routers.chat_router import router as chat_router
from routers.courses_router import router as courses_router
from routers.friends_router import router as friends_router
from routers.groups_router import router as groups_router
from routers.profile_router import router as profile_router
from routers.ocean_router import router as ocean_router
from routers.emotion_router import router as emotion_router
from routers.study_sessions_router import router as study_sessions_router
from routers.daily_question_router import router as daily_question_router
import models

# Create tables
models.Base.metadata.create_all(bind=engine)

logging.basicConfig(level=logging.INFO)
app = FastAPI(title="Mentora API")

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Development only - allow all origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routes
@app.get("/")
async def root():
    return {"message": "Welcome to Mentora API"}

app.include_router(auth_router)
app.include_router(profile_router)
app.include_router(courses_router)
app.include_router(friends_router)
app.include_router(chat_router)
app.include_router(groups_router)
app.include_router(ocean_router)
app.include_router(emotion_router)
app.include_router(study_sessions_router)
app.include_router(daily_question_router)
