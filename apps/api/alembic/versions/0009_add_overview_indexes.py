"""add overview analytics indexes

Revision ID: 0009_add_overview_indexes
Revises: 0008_scope_assets_by_plan
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0009_add_overview_indexes"
down_revision: str | None = "0008_scope_assets_by_plan"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    vulnerability_indexes = {
        item["name"] for item in inspector.get_indexes("vulnerabilities")
    }
    report_indexes = {item["name"] for item in inspector.get_indexes("reports")}
    if "ix_vulnerabilities_org_created" not in vulnerability_indexes:
        op.create_index(
            "ix_vulnerabilities_org_created",
            "vulnerabilities",
            ["org_id", "created_at"],
        )
    if "ix_reports_org_created" not in report_indexes:
        op.create_index(
            "ix_reports_org_created",
            "reports",
            ["org_id", "created_at"],
        )


def downgrade() -> None:
    op.drop_index("ix_reports_org_created", table_name="reports")
    op.drop_index("ix_vulnerabilities_org_created", table_name="vulnerabilities")
