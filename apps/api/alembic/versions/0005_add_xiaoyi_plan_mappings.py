"""Persist collision-free integer plan IDs for Xiaoyi."""

import sqlalchemy as sa
from alembic import op

revision = "0005_add_xiaoyi_plan_mappings"
down_revision = "0004_scope_task_request_ids"
branch_labels = None
depends_on = None


def upgrade() -> None:
    connection = op.get_bind()
    if not sa.inspect(connection).has_table("xiaoyi_plan_mappings"):
        op.create_table(
            "xiaoyi_plan_mappings",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("plan_id", sa.Uuid(), nullable=False),
            sa.ForeignKeyConstraint(["plan_id"], ["scan_plans.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(
            "ix_xiaoyi_plan_mappings_plan_id",
            "xiaoyi_plan_mappings",
            ["plan_id"],
            unique=True,
        )
    plans = sa.table("scan_plans", sa.column("id", sa.Uuid()))
    mappings = sa.table(
        "xiaoyi_plan_mappings",
        sa.column("id", sa.Integer()),
        sa.column("plan_id", sa.Uuid()),
    )
    existing = set(connection.execute(sa.select(mappings.c.plan_id)).scalars())
    for plan_id in connection.execute(sa.select(plans.c.id).order_by(plans.c.id)).scalars():
        if plan_id not in existing:
            connection.execute(mappings.insert().values(plan_id=plan_id))


def downgrade() -> None:
    op.drop_index(
        "ix_xiaoyi_plan_mappings_plan_id",
        table_name="xiaoyi_plan_mappings",
    )
    op.drop_table("xiaoyi_plan_mappings")
