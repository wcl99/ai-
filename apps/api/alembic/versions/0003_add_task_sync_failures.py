"""Persist task synchronization failures."""

import sqlalchemy as sa
from alembic import op

revision = "0003_add_task_sync_failures"
down_revision = "0002_add_qa_messages"
branch_labels = None
depends_on = None


def has_column(name: str) -> bool:
    return any(
        column["name"] == name
        for column in sa.inspect(op.get_bind()).get_columns("tasks")
    )


def upgrade() -> None:
    if not has_column("sync_failures"):
        op.add_column(
            "tasks",
            sa.Column("sync_failures", sa.Integer(), server_default="0", nullable=False),
        )


def downgrade() -> None:
    if has_column("sync_failures"):
        op.drop_column("tasks", "sync_failures")