from sqlalchemy import text
from app.database import engine

def migrate_quiz_set_columns():
    print("Running database migration to add quiz_set_id and quiz_set_title to mcqs table...")
    with engine.connect() as conn:
        conn.execute(text("ALTER TABLE mcqs ADD COLUMN IF NOT EXISTS quiz_set_id TEXT;"))
        conn.execute(text("ALTER TABLE mcqs ADD COLUMN IF NOT EXISTS quiz_set_title TEXT;"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_mcqs_quiz_set_id ON mcqs (quiz_set_id);"))
        conn.commit()
    print("[OK] Migration completed successfully!")

if __name__ == "__main__":
    migrate_quiz_set_columns()
