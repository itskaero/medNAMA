import sys
from pathlib import Path

# Add backend directory to path
sys.path.append(str(Path(__file__).resolve().parent.parent))

from sqlalchemy import text
from app.database import engine

def migrate():
    with engine.connect() as conn:
        # Check/Add columns with commit
        queries = [
            ("timer_mode", "ALTER TABLE quiz_attempts ADD COLUMN timer_mode TEXT DEFAULT 'none';"),
            ("timer_value", "ALTER TABLE quiz_attempts ADD COLUMN timer_value INTEGER;"),
            ("feedback_mode", "ALTER TABLE quiz_attempts ADD COLUMN feedback_mode TEXT DEFAULT 'tutor';")
        ]
        
        for col_name, sql in queries:
            try:
                conn.execute(text(sql))
                conn.commit()
                print(f"Successfully added column {col_name}")
            except Exception as e:
                # If column exists, postgres throws DuplicateColumn. Rollback and continue.
                conn.rollback()
                print(f"Column {col_name} check: {e}")

if __name__ == "__main__":
    migrate()
