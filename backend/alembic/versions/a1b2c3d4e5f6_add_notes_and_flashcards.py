"""add_notes_and_flashcards

Revision ID: a1b2c3d4e5f6
Revises: c41f9d0e3b7a
Create Date: 2026-09-23 20:15:00.000000

Adds per-user Study materials tables: editable notes and flip flashcards
with lightweight spaced-repetition state (box / next_due).
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = 'c41f9d0e3b7a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS notes (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            title TEXT NOT NULL DEFAULT 'Untitled Note',
            content TEXT NOT NULL,
            book_title TEXT,
            page_number INTEGER,
            source_context TEXT,
            created_at TIMESTAMP NOT NULL DEFAULT now(),
            updated_at TIMESTAMP NOT NULL DEFAULT now()
        );
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_notes_user_id ON notes (user_id);")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS flashcards (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            front TEXT NOT NULL,
            back TEXT NOT NULL,
            topic TEXT,
            book_title TEXT,
            page_number INTEGER,
            box INTEGER NOT NULL DEFAULT 0,
            last_reviewed TIMESTAMP,
            next_due TIMESTAMP,
            review_count INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMP NOT NULL DEFAULT now()
        );
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_flashcards_user_id ON flashcards (user_id);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_flashcards_user_next_due ON flashcards (user_id, next_due);")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS flashcards CASCADE;")
    op.execute("DROP TABLE IF EXISTS notes CASCADE;")
