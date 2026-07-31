import json
import sqlite3
import uuid
from datetime import UTC, datetime

from alembic import command
from alembic.config import Config

from app.config import get_settings


def test_xiaoyi_mapping_migration_invalidates_stale_ready_snapshots(
    tmp_path, monkeypatch
):
    database = tmp_path / "migration.db"
    monkeypatch.setenv(
        "DATABASE_URL", f"sqlite+aiosqlite:///{database.as_posix()}"
    )
    monkeypatch.setenv(
        "JWT_SECRET", "migration-test-secret-that-is-at-least-32-characters"
    )
    get_settings.cache_clear()
    config = Config("alembic.ini")
    command.upgrade(config, "0004_scope_task_request_ids")
    with sqlite3.connect(database) as connection:
        connection.execute("DROP TABLE IF EXISTS ai_callback_receipts")
        connection.commit()

    org_id = uuid.uuid4().hex
    user_id = uuid.uuid4().hex
    plan_id = uuid.uuid4().hex
    now = datetime.now(UTC).isoformat()
    snapshot = {
        "authorization_confirmed": True,
        "confirmed_by": user_id,
        "xiaoyi_context": {
            "org_id": "stale-uuid",
            "user_id": "admin",
            "plan_id": "stale-uuid",
        },
    }
    with sqlite3.connect(database) as connection:
        connection.execute(
            "INSERT INTO organizations (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)",
            (org_id, "Migration Test", now, now),
        )
        connection.execute(
            """INSERT INTO users
            (id, org_id, username, name, password_hash, role, is_active,
             is_digital_human, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (user_id, org_id, "admin", "Admin", "hash", "admin", 1, 0, now, now),
        )
        connection.execute(
            """INSERT INTO scan_plans
            (id, org_id, created_by, name, test_type, status, targets, asset_list,
             templates, description, time_limit, snapshot, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                plan_id,
                org_id,
                user_id,
                "Stale ready plan",
                "standard",
                "READY",
                "[]",
                "[]",
                "[]",
                None,
                None,
                json.dumps(snapshot),
                now,
                now,
            ),
        )
        connection.commit()

    command.upgrade(config, "head")

    with sqlite3.connect(database) as connection:
        status, stored_snapshot = connection.execute(
            "SELECT status, snapshot FROM scan_plans WHERE id = ?", (plan_id,)
        ).fetchone()
        mapping = connection.execute(
            "SELECT id FROM xiaoyi_plan_mappings WHERE plan_id = ?", (plan_id,)
        ).fetchone()
        receipt_columns = {
            row[1]
            for row in connection.execute(
                "PRAGMA table_info(ai_callback_receipts)"
            ).fetchall()
        }
        asset_unique_indexes = [
            {
                row[2]
                for row in connection.execute(
                    f"PRAGMA index_info('{index[1]}')"
                ).fetchall()
            }
            for index in connection.execute("PRAGMA index_list('assets')").fetchall()
            if index[2]
        ]
    stored_snapshot = json.loads(stored_snapshot)
    assert status == "DRAFT"
    assert stored_snapshot["authorization_confirmed"] is False
    assert "confirmed_by" not in stored_snapshot
    assert "xiaoyi_context" not in stored_snapshot
    assert mapping and mapping[0] > 0
    assert receipt_columns == {
        "id",
        "org_id",
        "result_type",
        "payload_hash",
        "resource_type",
        "resource_id",
        "created_at",
    }
    assert {"org_id", "plan_id", "asset_key"} in asset_unique_indexes
    get_settings.cache_clear()
