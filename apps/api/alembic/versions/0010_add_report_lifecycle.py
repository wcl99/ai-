"""add report lifecycle fields

Revision ID: 0010_add_report_lifecycle
Revises: 0009_add_overview_indexes
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0010_add_report_lifecycle"
down_revision: str | None = "0009_add_overview_indexes"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    columns = {item["name"] for item in inspector.get_columns("reports")}
    with op.batch_alter_table("reports") as batch:
        if "first_viewed_at" not in columns:
            batch.add_column(sa.Column("first_viewed_at", sa.DateTime(timezone=True)))
        if "first_viewed_by" not in columns:
            batch.add_column(sa.Column("first_viewed_by", sa.Uuid()))
            batch.create_foreign_key(
                "fk_reports_first_viewed_by_users", "users", ["first_viewed_by"], ["id"]
            )
        if "first_exported_at" not in columns:
            batch.add_column(sa.Column("first_exported_at", sa.DateTime(timezone=True)))
        if "first_exported_by" not in columns:
            batch.add_column(sa.Column("first_exported_by", sa.Uuid()))
            batch.create_foreign_key(
                "fk_reports_first_exported_by_users", "users", ["first_exported_by"], ["id"]
            )

    indexes = {item["name"] for item in sa.inspect(op.get_bind()).get_indexes("reports")}
    if "ix_reports_org_viewed" not in indexes:
        op.create_index("ix_reports_org_viewed", "reports", ["org_id", "first_viewed_at"])
    if "ix_reports_org_exported" not in indexes:
        op.create_index("ix_reports_org_exported", "reports", ["org_id", "first_exported_at"])


def downgrade() -> None:
    op.drop_index("ix_reports_org_exported", table_name="reports")
    op.drop_index("ix_reports_org_viewed", table_name="reports")
    with op.batch_alter_table("reports") as batch:
        batch.drop_constraint("fk_reports_first_exported_by_users", type_="foreignkey")
        batch.drop_constraint("fk_reports_first_viewed_by_users", type_="foreignkey")
        batch.drop_column("first_exported_by")
        batch.drop_column("first_exported_at")
        batch.drop_column("first_viewed_by")
        batch.drop_column("first_viewed_at")
