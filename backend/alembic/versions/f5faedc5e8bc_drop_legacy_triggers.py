"""drop_legacy_triggers

Revision ID: f5faedc5e8bc
Revises: f4faedc5e8bb
Create Date: 2026-07-22 17:07:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f5faedc5e8bc'
down_revision: Union[str, None] = 'f4faedc5e8bb'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Drop legacy triggers on mcqs table that reference non-existent columns (like NEW.user_id)
    op.execute("DROP TRIGGER IF EXISTS trigger_sync_user_category_stats ON mcqs;")
    op.execute("DROP TRIGGER IF EXISTS sync_user_category_stats_trigger ON mcqs;")
    op.execute("DROP FUNCTION IF EXISTS sync_user_category_stats CASCADE;")
    op.execute("DROP TABLE IF EXISTS user_category_stats CASCADE;")


def downgrade() -> None:
    pass
