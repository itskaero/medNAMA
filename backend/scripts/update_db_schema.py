"""Script to alter the PostgreSQL database to add main_category and sub_category columns."""

import sys
from pathlib import Path
from sqlalchemy import text

# Add backend directory to python path
backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from app.database import engine

def update_schema():
    print("Connecting to database and updating schema...")
    with engine.connect() as conn:
        # Add columns
        conn.execute(text("ALTER TABLE mcqs ADD COLUMN IF NOT EXISTS main_category TEXT;"))
        conn.execute(text("ALTER TABLE mcqs ADD COLUMN IF NOT EXISTS sub_category TEXT;"))
        
        # Add indexes
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_mcqs_main_category ON mcqs (main_category);"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_mcqs_sub_category ON mcqs (sub_category);"))
        
        conn.commit()
        print("Schema updated successfully! Added main_category and sub_category columns.")

if __name__ == "__main__":
    update_schema()
