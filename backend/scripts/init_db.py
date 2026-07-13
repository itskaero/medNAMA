"""Create database tables and pgvector extension."""

import sys
from pathlib import Path

# Allow running as `python scripts/init_db.py` from backend/
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import text

from app.database import engine
from app.models import Base


def init_db() -> None:
    """Create the pgvector extension and all tables."""
    with engine.connect() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        conn.commit()
    Base.metadata.create_all(engine)
    print("OK - Database tables created.")


if __name__ == "__main__":
    init_db()
