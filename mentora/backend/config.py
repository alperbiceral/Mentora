from pathlib import Path
from dotenv import load_dotenv
import os

ROOT_DIR = Path(__file__).resolve().parent.parent
ENV_PATH = ROOT_DIR / ".env"
load_dotenv(dotenv_path=ENV_PATH)

DATABASE_URL = os.getenv("DATABASE_URL")
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "your-secret-key")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
JWT_EXPIRATION_HOURS = int(os.getenv("JWT_EXPIRATION_HOURS", "24"))

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
