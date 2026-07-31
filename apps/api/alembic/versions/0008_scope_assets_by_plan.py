"""scope callback assets by plan

Revision ID: 0008_scope_assets_by_plan
Revises: 0007_add_ai_callback_receipts
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0008_scope_assets_by_plan"
down_revision: str | None = "0007_add_ai_callback_receipts"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

OLD_COLUMNS = {"org_id", "asset_key"}
NEW_COLUMNS = {"org_id", "plan_id", "asset_key"}
NEW_NAME = "uq_assets_org_plan_asset_key"


def _constraints() -> list[dict]:
    return sa.inspect(op.get_bind()).get_unique_constraints("assets")


def upgrade() -> None:
    constraints = _constraints()
    if any(set(item["column_names"]) == NEW_COLUMNS for item in constraints):
        return
    old = next(
        (item for item in constraints if set(item["column_names"]) == OLD_COLUMNS),
        None,
    )
    bind = op.get_bind()
    if bind.dialect.name == "sqlite":
        naming_convention = {
            "uq": "uq_%(table_name)s_%(column_0_name)s_%(column_1_name)s"
        }
        with op.batch_alter_table(
            "assets",
            recreate="always",
            naming_convention=naming_convention,
        ) as batch:
            if old:
                batch.drop_constraint(
                    old["name"] or "uq_assets_org_id_asset_key",
                    type_="unique",
                )
            batch.create_unique_constraint(
                NEW_NAME,
                ["org_id", "plan_id", "asset_key"],
            )
        return
    if old and old["name"]:
        op.drop_constraint(old["name"], "assets", type_="unique")
    op.create_unique_constraint(
        NEW_NAME,
        "assets",
        ["org_id", "plan_id", "asset_key"],
    )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "sqlite":
        with op.batch_alter_table("assets", recreate="always") as batch:
            batch.drop_constraint(NEW_NAME, type_="unique")
            batch.create_unique_constraint(
                "uq_assets_org_asset_key",
                ["org_id", "asset_key"],
            )
        return
    op.drop_constraint(NEW_NAME, "assets", type_="unique")
    op.create_unique_constraint(
        "uq_assets_org_asset_key",
        "assets",
        ["org_id", "asset_key"],
    )
