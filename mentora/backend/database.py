from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, declarative_base
from config import DATABASE_URL

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def ensure_schema_patches() -> None:
    """
    Lightweight migrations for existing databases.

    SQLAlchemy create_all() creates missing tables but does not add new columns
    to tables that already exist. These statements are idempotent (safe to re-run).
    """
    # PostgreSQL 11+: ADD COLUMN IF NOT EXISTS
    with engine.begin() as conn:
        conn.execute(
            text(
                "ALTER TABLE courses ADD COLUMN IF NOT EXISTS section VARCHAR(64)"
            )
        )
        conn.execute(
            text(
                "ALTER TABLE courses ADD COLUMN IF NOT EXISTS importance_level DOUBLE PRECISION"
            )
        )
        conn.execute(
            text(
                "ALTER TABLE study_sessions ADD COLUMN IF NOT EXISTS course_name VARCHAR(200)"
            )
        )
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS chat_read_states (
                    read_state_id SERIAL PRIMARY KEY,
                    thread_id INTEGER NOT NULL REFERENCES chat_threads(thread_id),
                    username VARCHAR(50) NOT NULL,
                    last_read_message_id INTEGER,
                    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
                    UNIQUE(thread_id, username)
                )
                """
            )
        )