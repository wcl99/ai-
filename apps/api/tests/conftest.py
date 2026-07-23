import os

os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///:memory:"
os.environ["DATABASE_PASSWORD"] = ""
os.environ["APP_ENVIRONMENT"] = "test"
os.environ["JWT_SECRET"] = "test-secret-that-is-at-least-32-characters"
os.environ["ENGINE_MODE"] = "mock"
os.environ["XIAOYI_BASE_URL"] = "http://127.0.0.1:1"
os.environ["XIAOYI_TOKEN"] = ""

import pytest
from httpx import ASGITransport, AsyncClient

from app.auth import password_hash
from app.db import Base, SessionLocal, engine
from app.main import app
from app.models import Organization, User


@pytest.fixture(autouse=True)
async def database():
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    async with SessionLocal() as session:
        org = Organization(name="Test Organization")
        session.add(org)
        await session.flush()
        session.add(
            User(
                org_id=org.id,
                username="admin",
                name="Test Admin",
                password_hash=password_hash.hash("correct-horse-battery-staple"),
                role="admin",
            )
        )
        await session.commit()
    yield
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.drop_all)


@pytest.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as value:
        yield value


@pytest.fixture
async def authenticated_client(client):
    response = await client.post(
        "/api/v1/auth/login",
        json={"username": "admin", "password": "correct-horse-battery-staple"},
    )
    assert response.status_code == 200
    return client
