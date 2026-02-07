from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import engine
from routers.auth_router import router as auth_router
from routers.chat_router import router as chat_router
from routers.friends_router import router as friends_router
from routers.groups_router import router as groups_router
from routers.profile_router import router as profile_router
import models

# Create tables
models.Base.metadata.create_all(bind=engine)

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
app.include_router(friends_router)
app.include_router(chat_router)
app.include_router(groups_router)