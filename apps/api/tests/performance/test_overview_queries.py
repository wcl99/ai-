"""Optional PostgreSQL performance guard for the overview endpoints."""

import os
import time
import uuid
from datetime import UTC, datetime, timedelta

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import insert, text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.auth import current_user
from app.db import Base, get_session
from app.main import app
from app.models import Organization, Report, ScanPlan, User, Vulnerability


PERF_URL = os.getenv("OVERVIEW_PERF_DATABASE_URL")
pytestmark = pytest.mark.skipif(
    not PERF_URL,
    reason="OVERVIEW_PERF_DATABASE_URL is not configured",
)


def async_url(value: str) -> str:
    if value.startswith("postgresql://"):
        return value.replace("postgresql://", "postgresql+asyncpg://", 1)
    return value


async def test_overview_endpoints_p95_under_300ms_at_10k_rows():
    schema = f"overview_perf_{uuid.uuid4().hex}"
    database_url = async_url(PERF_URL or "")
    admin_engine = create_async_engine(database_url, isolation_level="AUTOCOMMIT")
    engine = None
    try:
        async with admin_engine.connect() as connection:
            await connection.execute(text(f'CREATE SCHEMA "{schema}"'))
        engine = create_async_engine(
            database_url,
            connect_args={"server_settings": {"search_path": schema}},
        )
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        sessions = async_sessionmaker(engine, expire_on_commit=False)
        now = datetime.now(UTC)
        async with sessions() as session:
            organization = Organization(name=f"Overview performance {schema}")
            session.add(organization)
            await session.flush()
            user = User(
                org_id=organization.id,
                username="overview-perf",
                name="Overview Performance",
                password_hash="not-used",
                role="admin",
            )
            session.add(user)
            await session.flush()
            plan = ScanPlan(
                org_id=organization.id,
                created_by=user.id,
                name="Overview performance plan",
                test_type="standard",
                status="READY",
                snapshot={},
            )
            session.add(plan)
            await session.flush()
            vulnerability_rows = [
                {
                    "id": uuid.uuid4(),
                    "org_id": organization.id,
                    "plan_id": plan.id,
                    "title": f"Finding {index}",
                    "severity": ("critical", "high", "medium", "low")[index % 4],
                    "status": ("OPEN", "RETESTING", "FIXED")[index % 3],
                    "data_json": {"source_tool": "xiaoyi" if index % 2 else "nuclei"},
                    "created_at": now - timedelta(hours=index % 720),
                    "updated_at": now,
                }
                for index in range(10_000)
            ]
            report_rows = [
                {
                    "id": uuid.uuid4(),
                    "org_id": organization.id,
                    "plan_id": plan.id,
                    "filename": f"report-{index}.md",
                    "format": "md",
                    "report_level": "partial" if index % 5 == 0 else "standard",
                    "external_url": "https://example.invalid/report" if index % 2 else None,
                    "status": "READY",
                    "created_at": now - timedelta(hours=index % 720),
                    "updated_at": now,
                }
                for index in range(10_000)
            ]
            await session.execute(insert(Vulnerability), vulnerability_rows)
            await session.execute(insert(Report), report_rows)
            await session.commit()

        async def performance_session():
            async with sessions() as session:
                yield session

        async def performance_user():
            return user

        app.dependency_overrides[get_session] = performance_session
        app.dependency_overrides[current_user] = performance_user
        samples = []
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://performance") as client:
            paths = (
                "/api/v1/vulnerabilities/overview?range=all&timezone=Asia%2FShanghai",
                "/api/v1/reports/overview?range=all&timezone=Asia%2FShanghai",
            )
            for path in paths:
                assert (await client.get(path)).status_code == 200
            for index in range(20):
                path = paths[index % len(paths)]
                started = time.perf_counter()
                response = await client.get(path)
                samples.append((time.perf_counter() - started) * 1000)
                assert response.status_code == 200
        p95 = sorted(samples)[int(len(samples) * 0.95) - 1]
        assert p95 <= 300, f"overview endpoint P95 was {p95:.1f}ms"
    finally:
        app.dependency_overrides.pop(get_session, None)
        app.dependency_overrides.pop(current_user, None)
        if engine is not None:
            await engine.dispose()
        async with admin_engine.connect() as connection:
            await connection.execute(text(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE'))
        await admin_engine.dispose()
