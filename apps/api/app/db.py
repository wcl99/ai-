"""Create the shared async database engine and request-scoped SQLAlchemy sessions."""

from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from .config import get_settings


class Base(DeclarativeBase):
    pass


settings = get_settings()
# The engine owns the connection pool; SessionLocal creates lightweight transaction sessions.
engine = create_async_engine(settings.database_connection_url, pool_pre_ping=True)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)


# FastAPI calls this dependency once per request and closes the session after the response.
async def get_session() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as session:
        yield session
