"""Issue JWTs and expose FastAPI authentication and role-check dependencies."""

import uuid
from datetime import UTC, datetime, timedelta

import jwt
from fastapi import Cookie, Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import InvalidTokenError
from pwdlib import PasswordHash
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .config import Settings, get_settings
from .db import get_session
from .models import User

password_hash = PasswordHash.recommended()
bearer = HTTPBearer(auto_error=False)


class AuthenticationError(Exception):
    pass


def create_token(user: User, settings: Settings) -> str:
    # Signed claims let later requests identify the user without storing server-side sessions.
    now = datetime.now(UTC)
    payload = {
        "sub": str(user.id),
        "username": user.username,
        "org_id": str(user.org_id),
        "role": user.role,
        "digital_human": user.is_digital_human,
        "iss": settings.jwt_issuer,
        "iat": now,
        "exp": now + timedelta(seconds=settings.jwt_ttl_seconds),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def decode_token(token: str, settings: Settings) -> dict:
    # Signature, issuer, and expiration are verified before claims are trusted.
    try:
        return jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=["HS256"],
            issuer=settings.jwt_issuer,
        )
    except InvalidTokenError as exc:
        raise AuthenticationError from exc


async def current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    access_token: str | None = Cookie(default=None),
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
) -> User:
    # API clients usually send Bearer tokens; browsers may use the HTTP-only cookie.
    token = credentials.credentials if credentials else access_token
    if not token:
        raise AuthenticationError
    payload = decode_token(token, settings)
    try:
        user_id = uuid.UUID(payload["sub"])
    except (KeyError, TypeError, ValueError) as exc:
        raise AuthenticationError from exc
    user = await session.scalar(select(User).where(User.id == user_id, User.is_active.is_(True)))
    if user is None:
        raise AuthenticationError
    return user


# Depends(current_user) turns authentication and authorization into reusable route dependencies.
def require_roles(*roles: str):
    async def dependency(user: User = Depends(current_user)) -> User:
        if user.role not in roles:
            from .errors import AppError

            raise AppError(403, "FORBIDDEN", "当前账号无权执行此操作")
        return user

    return dependency
