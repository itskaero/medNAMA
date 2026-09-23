"""add_mcq_difficulty

Revision ID: c41f9d0e3b7a
Revises: f5faedc5e8bc
Create Date: 2026-09-23 11:30:00.000000

Adds an optional 1-5 difficulty column to mcqs for AI-generated quiz sets.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c41f9d0e3b7a'
down_revision: Union[str, None] = 'f5faedc5e8bc'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE mcqs ADD COLUMN IF NOT EXISTS difficulty INTEGER;")
    op.execute("ALTER TABLE mcqs DROP CONSTRAINT IF EXISTS mcqs_difficulty_check;")
    op.execute(
        "ALTER TABLE mcqs ADD CONSTRAINT mcqs_difficulty_check "
        "CHECK (difficulty IS NULL OR difficulty BETWEEN 1 AND 5);"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE mcqs DROP CONSTRAINT IF EXISTS mcqs_difficulty_check;")
    op.execute("ALTER TABLE mcqs DROP COLUMN IF EXISTS difficulty;")