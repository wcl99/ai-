"""add scan plan consultation state

Revision ID: 0006_add_plan_consultation
Revises: 0005_add_xiaoyi_plan_mappings
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0006_add_plan_consultation"
down_revision: str | None = "0005_add_xiaoyi_plan_mappings"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    columns = {item["name"] for item in inspector.get_columns("scan_plans")}
    if "analysis_json" not in columns:
        op.add_column(
            "scan_plans",
            sa.Column("analysis_json", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
        )
    if not inspector.has_table("scan_plan_messages"):
        op.create_table(
            "scan_plan_messages",
            sa.Column("id", sa.Uuid(), nullable=False),
            sa.Column("org_id", sa.Uuid(), nullable=False),
            sa.Column("plan_id", sa.Uuid(), nullable=False),
            sa.Column("user_id", sa.Uuid(), nullable=False),
            sa.Column("role", sa.String(length=16), nullable=False),
            sa.Column("content", sa.Text(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["org_id"], ["organizations.id"]),
            sa.ForeignKeyConstraint(["plan_id"], ["scan_plans.id"]),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_scan_plan_messages_org_id", "scan_plan_messages", ["org_id"])
        op.create_index("ix_scan_plan_messages_plan_id", "scan_plan_messages", ["plan_id"])


def downgrade() -> None:
    op.drop_index("ix_scan_plan_messages_plan_id", table_name="scan_plan_messages")
    op.drop_index("ix_scan_plan_messages_org_id", table_name="scan_plan_messages")
    op.drop_table("scan_plan_messages")
    op.drop_column("scan_plans", "analysis_json")
