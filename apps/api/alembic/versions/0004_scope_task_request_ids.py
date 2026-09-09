"""Scope task request IDs to an organization."""

import sqlalchemy as sa
from alembic import op

revision = "0004_scope_task_request_ids"
down_revision = "0003_add_task_sync_failures"
branch_labels = None
depends_on = None


def unique_constraint(columns: set[str]) -> dict | None:
    for constraint in sa.inspect(op.get_bind()).get_unique_constraints("tasks"):
        if set(constraint["column_names"]) == columns:
            return constraint
    return None


def upgrade() -> None:
    if unique_constraint({"org_id", "request_id"}):
        return
    old = unique_constraint({"request_id"})
    with op.batch_alter_table(
        "tasks",
        naming_convention={"uq": "uq_%(table_name)s_%(column_0_name)s"},
    ) as batch:
        if old:
            batch.drop_constraint(old["name"] or "uq_tasks_request_id", type_="unique")
        batch.create_unique_constraint(
            "uq_tasks_org_request_id",
            ["org_id", "request_id"],
        )


def downgrade() -> None:
    if unique_constraint({"request_id"}):
        return
    scoped = unique_constraint({"org_id", "request_id"})
    with op.batch_alter_table(
        "tasks",
        naming_convention={"uq": "uq_%(table_name)s_%(column_0_name)s"},
    ) as batch:
        if scoped:
            batch.drop_constraint(
                scoped["name"] or "uq_tasks_org_id",
                type_="unique",
            )
        batch.create_unique_constraint("uq_tasks_request_id", ["request_id"])
