"""initial_schema

Revision ID: f4faedc5e8bb
Revises: 
Create Date: 2026-07-22 15:53:57.511787
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f4faedc5e8bb'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Safe cleanup of legacy columns/tables if they exist in any environment
    op.execute("DROP TABLE IF EXISTS user_category_stats CASCADE;")
    op.execute("DROP INDEX IF EXISTS idx_attempt_answers_telemetry;")
    op.execute("ALTER TABLE books DROP COLUMN IF EXISTS pdf_url;")
    op.execute("DROP INDEX IF EXISTS idx_mcqs_global_category;")
    op.execute("DROP INDEX IF EXISTS idx_mcqs_main_category;")
    op.execute("DROP INDEX IF EXISTS idx_mcqs_quiz_set_id;")
    op.execute("DROP INDEX IF EXISTS idx_mcqs_sub_category;")
    op.execute("DROP INDEX IF EXISTS idx_mcqs_user_category;")
    op.execute("ALTER TABLE mcqs DROP CONSTRAINT IF EXISTS mcqs_user_id_fkey;")
    op.execute("ALTER TABLE mcqs DROP COLUMN IF EXISTS generation_type;")
    op.execute("ALTER TABLE mcqs DROP COLUMN IF EXISTS user_id;")

    # Ensure quiz_attempts columns exist
    op.execute("ALTER TABLE quiz_attempts ADD COLUMN IF NOT EXISTS timer_mode TEXT NOT NULL DEFAULT 'none';")
    op.execute("ALTER TABLE quiz_attempts ADD COLUMN IF NOT EXISTS timer_value INTEGER;")
    op.execute("ALTER TABLE quiz_attempts ADD COLUMN IF NOT EXISTS feedback_mode TEXT NOT NULL DEFAULT 'tutor';")

    # Ensure all application tables exist
    op.execute("""
    CREATE TABLE IF NOT EXISTS chat_conversations (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        title TEXT NOT NULL DEFAULT 'New Conversation',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    """)

    op.execute("""
    CREATE TABLE IF NOT EXISTS chat_messages (
        id SERIAL PRIMARY KEY,
        conversation_id INTEGER NOT NULL REFERENCES chat_conversations(id),
        role TEXT NOT NULL,
        content TEXT,
        answer_json TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    """)

    op.execute("""
    CREATE TABLE IF NOT EXISTS mcq_bookmarks (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        mcq_id INTEGER NOT NULL REFERENCES mcqs(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    """)

    op.execute("""
    CREATE TABLE IF NOT EXISTS concept_bookmarks (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        content TEXT NOT NULL,
        book_title TEXT,
        page_number INTEGER,
        source_context TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    """)

    # Foreign Key and Lookup Indexes
    op.execute("CREATE INDEX IF NOT EXISTS idx_chat_conversations_user ON chat_conversations (user_id);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_chat_messages_conv ON chat_messages (conversation_id);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_mcq_bookmarks_user ON mcq_bookmarks (user_id);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_mcq_bookmarks_mcq ON mcq_bookmarks (mcq_id);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_concept_bookmarks_user ON concept_bookmarks (user_id);")
    op.execute("CREATE INDEX IF NOT EXISTS idx_mcqs_quiz_set_id ON mcqs (quiz_set_id);")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_mcqs_quiz_set_id;")
    op.execute("DROP INDEX IF EXISTS idx_concept_bookmarks_user;")
    op.execute("DROP INDEX IF EXISTS idx_mcq_bookmarks_mcq;")
    op.execute("DROP INDEX IF EXISTS idx_mcq_bookmarks_user;")
    op.execute("DROP INDEX IF EXISTS idx_chat_messages_conv;")
    op.execute("DROP INDEX IF EXISTS idx_chat_conversations_user;")
    op.execute("DROP TABLE IF EXISTS concept_bookmarks CASCADE;")
    op.execute("DROP TABLE IF EXISTS mcq_bookmarks CASCADE;")
    op.execute("DROP TABLE IF EXISTS chat_messages CASCADE;")
    op.execute("DROP TABLE IF EXISTS chat_conversations CASCADE;")

