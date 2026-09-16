"""add AI callback receipts

Revision ID: 0007_add_ai_callback_receipts
Revises: 0006_add_plan_consultation
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0007_add_ai_callback_receipts"
down_revision: str | None = "0006_add_plan_consultation"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    if inspector.has_table("ai_callback_receipts"):
        return
    op.create_table(
        "ai_callback_receipts",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("org_id", sa.Uuid(), nullable=False),
        sa.Column("result_type", sa.String(length=32), nullable=False),
        sa.Column("payload_hash", sa.String(length=64), nullable=False),
        sa.Column("resource_type", sa.String(length=32), nullable=False),
        sa.Column("resource_id", sa.String(length=80), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["org_id"], ["organizations.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("org_id", "result_type", "payload_hash"),
    )
    op.create_index(
        "ix_ai_callback_receipts_org_id", "ai_callback_receipts", ["org_id"]
    )


def downgrade() -> None:
    op.drop_index(
        "ix_ai_callback_receipts_org_id", table_name="ai_callback_receipts"
    )
    op.drop_table("ai_callback_receipts")
