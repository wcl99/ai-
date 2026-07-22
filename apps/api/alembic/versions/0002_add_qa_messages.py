"""Add task QA messages."""

import sqlalchemy as sa
from alembic import op

revision = "0002_add_qa_messages"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    if "qa_messages" in sa.inspect(op.get_bind()).get_table_names():
        return
    op.create_table(
        "qa_messages",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("org_id", sa.Uuid(), nullable=False),
        sa.Column("task_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("role", sa.String(length=16), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["org_id"], ["organizations.id"]),
        sa.ForeignKeyConstraint(["task_id"], ["tasks.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_qa_messages_org_id", "qa_messages", ["org_id"])
    op.create_index("ix_qa_messages_task_id", "qa_messages", ["task_id"])


def downgrade() -> None:
    if "qa_messages" not in sa.inspect(op.get_bind()).get_table_names():
        return
    op.drop_index("ix_qa_messages_task_id", table_name="qa_messages")
    op.drop_index("ix_qa_messages_org_id", table_name="qa_messages")
    op.drop_table("qa_messages")