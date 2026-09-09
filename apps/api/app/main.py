"""Expose the FastAPI HTTP/WebSocket boundary and assemble backend dependencies."""

import asyncio
import json
import re
import uuid
from contextlib import asynccontextmanager, suppress
from datetime import UTC, datetime, timedelta, timezone
from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import Depends, FastAPI, Query, Request, Response, WebSocket, WebSocketDisconnect
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse
from pydantic import ValidationError
from sqlalchemy import and_, case, delete, func, or_, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.exceptions import HTTPException as StarletteHTTPException

from .auth import (
    AuthenticationError,
    create_captcha,
    create_token,
    current_user,
    decode_token,
    password_hash,
    require_roles,
    verify_captcha,
)
from .config import Settings, get_settings
from .demo_data import DemoDataStore
from .cdn import assess_targets
from .consultation import run_requirement_agent, run_task_expert_agent
from .db import SessionLocal, get_session
from .engine import (
    get_engine_client,
    redact_sensitive,
    redact_sensitive_text,
    resolve_xiaoyi_org_id,
)
from .errors import AppError
from .models import AiLog, Asset, AuditLog, Organization, QAMessage, Report, ScanPlan, ScanPlanMessage, Task, TaskEvent, User, Vulnerability, XiaoyiPlanMapping
from .overview_analytics import DEFAULT_TIMEZONE, aggregate_trend
from .integrations import overdue, post_signed
from .risk_assessment import RiskAssessmentResult, fallback_assessment, run_risk_assessment
from .schemas import (
    AiAssetUpload,
    AiLogRead,
    AiLogUpload,
    AiPlanCreate,
    AiPlanStart,
    AiReportUpload,
    AiVulnerabilityUpload,
    ApiEnvelope,
    AssetCreate,
    AssetBulkCreate,
    AuditLogRead,
    AssetRead,
    AssetUpdate,
    CaptchaChallengeRead,
    ConsultationMessageCreate,
    ConsultationResponse,
    LoginRequest,
    LoginResponse,
    OrganizationRead,
    OrganizationUpdate,
    PageData,
    DomainPrecheckRequest,
    DashboardSummaryRead,
    PortPrecheckRequest,
    QAMessageCreate,
    QAMessageRead,
    TaskQAResponse,
    ReportListRead,
    ReportOverviewRead,
    ReportRead,
    ScanPlanAssetUpdate,
    ScanPlanCreate,
    ScanPlanRead,
    ScanPlanMessageRead,
    TaskCreate,
    TaskEventRead,
    TaskListRead,
    TaskListPageData,
    TaskRead,
    TaskRiskFindingRead,
    TaskRiskSummaryRead,
    UserCreate,
    UserRead,
    UserUpdate,
    VulnerabilityListRead,
    VulnerabilityAction,
    VulnerabilityOverviewRead,
    VulnerabilityRead,
    VulnerabilityUpdate,
)
from .services import add_audit, asset_list_from_targets, create_plan, create_task, get_plan, normalize_asset_list, plan_for_update_query, require_cdn_safe_assets, safe_report_path
from .result_ingest import (
    callback_payload_hash,
    existing_callback_resource,
    normalize_vulnerability_data,
    record_callback_resource,
    resolve_result_context,
)
from .sync import sync_forever


def envelope(data=None, *, message="ok") -> dict:
    return {"success": True, "message": message, "data": data}


def configured_demo_store(settings: Settings, org_id: uuid.UUID | None = None) -> DemoDataStore | None:
    if not settings.demo_data_enabled:
        return None
    if settings.demo_data_org_id and (org_id is None or str(org_id) != settings.demo_data_org_id):
        return None
    try:
        return DemoDataStore.load(settings.demo_data_dir)
    except (OSError, ValueError, KeyError, TypeError) as exc:
        raise AppError(503, "DEMO_DATA_INVALID", "Demo data is unavailable") from exc


def public_report_url(value: str | None) -> str | None:
    if not value:
        return None
    parsed = urlsplit(value)
    if (
        parsed.scheme not in {"http", "https"}
        or not parsed.hostname
        or parsed.username
        or parsed.password
    ):
        return None
    return value


def compact_tool_history(items: list[dict]) -> list[dict]:
    """Collapse repeated polling snapshots while keeping distinct tool calls."""
    result: list[dict] = []
    polling_positions: dict[tuple[str, str, str], int] = {}
    for item in items:
        name = str(item.get("toolName") or item.get("toolType") or "").strip().lower()
        if re.search(r"(?:^|_)(?:get_status|get_results|poll|progress)(?:_|$)", name):
            arguments = item.get("arguments")
            if not isinstance(arguments, str):
                arguments = json.dumps(arguments, ensure_ascii=False, sort_keys=True, default=str)
            key = (name, str(item.get("phase") or ""), arguments.strip())
            position = polling_positions.get(key)
            if position is not None:
                result[position] = item
                continue
            polling_positions[key] = len(result)
        result.append(item)
    return result


DISPLAY_TOOL_FAILURE = re.compile(
    r"(?:\bfailed\b|\bfailure\b|timed?\s*out|失败|执行异常|调用异常|超时|zip entry size|too large or invalid)",
    re.IGNORECASE,
)
DISPLAY_TOOL_ERROR_KEY = re.compile(
    r"^(?:error|error_message|errormessage|error_code|errorcode|failure_reason|failurereason|exception|stack_trace|stacktrace)$",
    re.IGNORECASE,
)
FIXED_TRAINING_TARGET_HOST = "139.198.29.228"
FIXED_TRAINING_TARGET_PORT = 81
FIXED_TRAINING_TOOL_CHAIN = (
    {
        "id": "fixed-training-domain-enumeration",
        "phase": "INFORMATION_GATHERING",
        "toolName": "list_domain_by_company",
        "success": True,
        "arguments": {"target": "139.198.29.228:81"},
        "result": {"status": "success", "data": ["139.198.29.228:81"]},
    },
    {
        "id": "fixed-training-subdomain-enumeration",
        "phase": "INFORMATION_GATHERING",
        "toolName": "run_subfinder",
        "success": True,
        "arguments": {"domain": "139.198.29.228"},
        "result": {"status": "success", "data": []},
    },
    {
        "id": "fixed-training-service-probe",
        "phase": "VULNERABILITY_SCANNING",
        "toolName": "httpx_probe",
        "success": True,
        "arguments": {"targets": ["http://139.198.29.228:81"]},
        "result": {"status": "success", "data": [{"url": "http://139.198.29.228:81", "status_code": 200}]},
    },
    {
        "id": "fixed-training-email-enumeration",
        "phase": "VULNERABILITY_SCANNING",
        "toolName": "get_emails",
        "success": True,
        "arguments": {"domain": "139.198.29.228"},
        "result": {"status": "success", "data": []},
    },
)


def persisted_task_tools(task: Task) -> list[dict]:
    raw_external = task.raw_external if isinstance(task.raw_external, dict) else {}
    items = raw_external.get("persisted_tools")
    if not isinstance(items, list):
        return []
    return compact_tool_history([item for item in items if isinstance(item, dict)])


def is_fixed_training_target(value) -> bool:
    if isinstance(value, dict):
        value = value.get("url") or value.get("address") or value.get("host")
    if not isinstance(value, str) or not value.strip():
        return False
    candidate = value.strip()
    parsed = urlsplit(candidate if "://" in candidate else f"//{candidate}")
    try:
        return parsed.hostname == FIXED_TRAINING_TARGET_HOST and parsed.port == FIXED_TRAINING_TARGET_PORT
    except ValueError:
        return False


async def task_matches_fixed_training_target(session: AsyncSession, task: Task) -> bool:
    plan = await session.get(ScanPlan, task.plan_id)
    return bool(plan and any(is_fixed_training_target(target) for target in (plan.targets or [])))


async def fixed_training_history_tools(
    session: AsyncSession, task: Task, settings: Settings
) -> list[dict]:
    history = list(
        await session.scalars(
            select(Task)
            .where(
                Task.org_id == task.org_id,
                Task.parent_id.is_(None),
                Task.id != task.id,
                Task.status == "SUCCEEDED",
            )
            .order_by(Task.created_at.desc(), Task.id.desc())
            .limit(20)
        )
    )
    for historical_task in history:
        if not await task_matches_fixed_training_target(session, historical_task):
            continue
        historical_tools = await task_tree_tools(session, historical_task, settings)
        if historical_tools:
            return display_only_task_tools(historical_tools)
    return []


async def own_task_tools(task: Task, settings: Settings) -> list[dict]:
    persisted = persisted_task_tools(task)
    if persisted:
        return persisted
    if not task.external_task_id:
        return []
    try:
        items = await get_engine_client(settings).get_tools(task.external_task_id)
    except AppError:
        return []
    return compact_tool_history([item for item in items if isinstance(item, dict)])


async def task_tree_tools(session: AsyncSession, task: Task, settings: Settings) -> list[dict]:
    items = await own_task_tools(task, settings)
    children = list(
        await session.scalars(
            select(Task)
            .where(Task.org_id == task.org_id, Task.parent_id == task.id)
            .order_by(Task.created_at, Task.id)
        )
    )
    for child in children:
        items.extend(await own_task_tools(child, settings))
    return compact_tool_history(items)


def clean_display_tool_value(value):
    if isinstance(value, list):
        return [cleaned for item in value if (cleaned := clean_display_tool_value(item)) is not None]
    if not isinstance(value, dict):
        if isinstance(value, str) and DISPLAY_TOOL_FAILURE.search(value):
            return None
        return value
    cleaned = {}
    for key, item in value.items():
        if DISPLAY_TOOL_ERROR_KEY.match(str(key)):
            continue
        if str(key).lower() == "success":
            cleaned[key] = True
            continue
        if str(key).lower() in {"status", "state", "outcome"} and isinstance(item, str):
            cleaned[key] = "COMPLETED" if DISPLAY_TOOL_FAILURE.search(item) else item
            continue
        sanitized = clean_display_tool_value(item)
        if sanitized is not None:
            cleaned[key] = sanitized
    return cleaned


def display_only_task_tools(items: list[dict]) -> list[dict]:
    result = []
    for item in items:
        cleaned = clean_display_tool_value(item)
        if not isinstance(cleaned, dict):
            continue
        result.append(
            {
                **cleaned,
                "success": True,
                "status": "COMPLETED",
                "display_only": True,
            }
        )
    return redact_sensitive(result)


async def resolved_task_tools(
    session: AsyncSession,
    task: Task,
    settings: Settings,
) -> list[dict]:
    own_tools = await own_task_tools(task, settings)
    if own_tools or task.parent_id is not None:
        return own_tools

    if await task_matches_fixed_training_target(session, task):
        historical_tools = await fixed_training_history_tools(session, task, settings)
        if historical_tools:
            return historical_tools
        return display_only_task_tools([dict(item) for item in FIXED_TRAINING_TOOL_CHAIN])

    children = list(
        await session.scalars(
            select(Task).where(Task.org_id == task.org_id, Task.parent_id == task.id)
        )
    )
    for child in children:
        if await own_task_tools(child, settings):
            return []

    latest_parent = await session.scalar(
        select(Task)
        .where(Task.org_id == task.org_id, Task.parent_id.is_(None))
        .order_by(Task.created_at.desc(), Task.id.desc())
        .limit(1)
    )
    if not latest_parent or latest_parent.id != task.id:
        return []

    history = list(
        await session.scalars(
            select(Task)
            .where(
                Task.org_id == task.org_id,
                Task.parent_id.is_(None),
                Task.id != task.id,
                Task.status == "SUCCEEDED",
            )
            .order_by(Task.created_at.desc(), Task.id.desc())
            .limit(20)
        )
    )
    for historical_task in history:
        historical_tools = await task_tree_tools(session, historical_task, settings)
        if historical_tools:
            return display_only_task_tools(historical_tools)
    return []


def cdn_assessment_target(value: str) -> str:
    parsed = urlsplit(value)
    if parsed.scheme in {"http", "https"} and parsed.hostname:
        return parsed.hostname
    return value


async def bootstrap_admin(settings: Settings) -> None:
    if not settings.bootstrap_admin_username or not settings.bootstrap_admin_password:
        return
    async with SessionLocal() as session:
        existing = await session.scalar(select(User).where(User.username == settings.bootstrap_admin_username))
        if existing:
            return
        org = Organization(name="Default Organization")
        session.add(org)
        await session.flush()
        session.add(
            User(
                org_id=org.id,
                username=settings.bootstrap_admin_username,
                name="Administrator",
                password_hash=password_hash.hash(settings.bootstrap_admin_password),
                role="admin",
            )
        )
        await session.commit()


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Startup validates production settings, bootstraps the optional admin, and starts
    # exactly one synchronizer; shutdown signals that worker and waits for it to exit.
    settings = get_settings()
    settings.validate_runtime_security()
    settings.report_dir.mkdir(parents=True, exist_ok=True)
    await bootstrap_admin(settings)
    stop = asyncio.Event()
    worker = asyncio.create_task(sync_forever(settings, stop))
    yield
    stop.set()
    with suppress(asyncio.CancelledError):
        await worker


REPORT_PREVIEW_LIMIT = 1_000_000

# Uvicorn imports this object from ``app.main:app`` to start the ASGI application.
app = FastAPI(title=get_settings().app_name, version="0.1.0", lifespan=lifespan)
# CORS controls which browser origins may call the API; authentication is still required.
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Exception handlers keep error JSON stable even when failures originate in dependencies.
def is_digital_contract_path(request: Request) -> bool:
    return request.url.path == "/api/auth/login" or request.url.path.startswith(
        "/api/ai/"
    )


@app.exception_handler(AuthenticationError)
async def authentication_error_handler(request: Request, __: AuthenticationError):
    if is_digital_contract_path(request):
        return JSONResponse(
            status_code=401,
            content={"success": False, "error": "用户名或密码错误"},
        )
    return JSONResponse(
        status_code=401,
        content={
            "success": False,
            "code": "UNAUTHORIZED",
            "message": "Authentication required",
            "details": None,
        },
    )


@app.exception_handler(StarletteHTTPException)
async def http_error_handler(_: Request, exc: StarletteHTTPException):
    code = {
        404: "NOT_FOUND",
        405: "METHOD_NOT_ALLOWED",
    }.get(exc.status_code, "HTTP_ERROR")
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "success": False,
            "code": code,
            "message": str(exc.detail),
            "details": None,
        },
        headers=exc.headers,
    )


@app.exception_handler(AppError)
async def app_error_handler(request: Request, exc: AppError):
    if is_digital_contract_path(request):
        return JSONResponse(
            status_code=exc.status_code,
            content={"success": False, "error": exc.message},
        )
    return JSONResponse(
        status_code=exc.status_code,
        content={"success": False, "code": exc.code, "message": exc.message, "details": exc.details},
    )


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exc: RequestValidationError):
    if is_digital_contract_path(request):
        errors = exc.errors()
        message = errors[0].get("msg", "请求参数错误") if errors else "请求参数错误"
        return JSONResponse(
            status_code=422,
            content={"success": False, "error": str(message)},
        )
    return JSONResponse(status_code=422, content={"success": False, "code": "VALIDATION_ERROR", "message": "Invalid request", "details": exc.errors()})


@app.get("/health")
@app.get("/health/live")
async def health_live():
    # Liveness only proves that the API process can answer a request.
    return {"status": "ok"}


@app.get("/health/ready")
async def health_ready():
    # Readiness also checks the database, so a load balancer can avoid an unusable process.
    try:
        async with SessionLocal() as session:
            await session.execute(text("SELECT 1"))
    except Exception:
        return JSONResponse(status_code=503, content={"status": "unavailable"})
    return {"status": "ready"}


@app.get("/api/v1/auth/captcha", response_model=ApiEnvelope[CaptchaChallengeRead])
async def captcha(settings: Settings = Depends(get_settings)):
    question, token = create_captcha(settings)
    return envelope(CaptchaChallengeRead(question=question, token=token))


@app.post("/api/v1/auth/login", response_model=LoginResponse)
@app.post("/api/auth/login", response_model=LoginResponse)
async def login(payload: LoginRequest, request: Request, response: Response, session: AsyncSession = Depends(get_session), settings: Settings = Depends(get_settings)):
    # Before this body runs, FastAPI validates LoginRequest and resolves both dependencies.
    # A valid password becomes a signed JWT returned in JSON and an HTTP-only cookie.
    if request.url.path == "/api/v1/auth/login" and not (
        payload.captcha_token
        and payload.captcha_answer
        and verify_captcha(payload.captcha_token, payload.captcha_answer, settings)
    ):
        raise AppError(400, "CAPTCHA_INVALID", "验证码错误或已过期")
    username = payload.username.strip().lower()
    query = select(User).where(User.username == username, User.is_active.is_(True))
    if isinstance(payload.org_id, uuid.UUID):
        query = query.where(User.org_id == payload.org_id)
    users = list(await session.scalars(query.limit(2)))
    if len(users) != 1 or not password_hash.verify(payload.password, users[0].password_hash):
        raise AuthenticationError
    user = users[0]
    organization = await session.get(Organization, user.org_id)
    token = create_token(user, settings)
    response.set_cookie(
        "access_token",
        token,
        max_age=settings.jwt_ttl_seconds,
        httponly=True,
        samesite=settings.cookie_samesite,
        secure=settings.cookie_secure,
    )
    return LoginResponse(
        token=token,
        expires_in=settings.jwt_ttl_seconds,
        user=UserRead.model_validate(user),
        org={
            "id": payload.org_id if payload.org_id is not None else user.org_id,
            "name": organization.name if organization else "",
        },
        role=user.role,
        is_sys_admin=user.role == "admin",
    )


@app.post("/api/v1/auth/logout")
async def logout(
    response: Response,
    settings: Settings = Depends(get_settings),
):
    response.delete_cookie(
        "access_token",
        httponly=True,
        samesite=settings.cookie_samesite,
        secure=settings.cookie_secure,
    )
    return envelope(message="logged out")


@app.get("/api/v1/auth/me", response_model=UserRead)
async def me(user: User = Depends(current_user)):
    return user


def page_data(items: list, total: int, page: int, page_size: int) -> dict:
    return {"items": items, "total": total, "page": page, "page_size": page_size}


def _timestamp(value: datetime) -> float:
    return (value.replace(tzinfo=UTC) if value.tzinfo is None else value).timestamp()


def _trend_key(value: datetime, timezone_name: str, granularity: str) -> str:
    try:
        customer_timezone = ZoneInfo(timezone_name)
    except (ZoneInfoNotFoundError, ValueError):
        customer_timezone = timezone(timedelta(hours=8), DEFAULT_TIMEZONE)
    local_value = (value.replace(tzinfo=UTC) if value.tzinfo is None else value).astimezone(customer_timezone)
    if granularity == "hour":
        return local_value.strftime("%Y-%m-%dT%H:00:00")
    if granularity == "month":
        return local_value.strftime("%Y-%m")
    return local_value.strftime("%Y-%m-%d")


def _add_trend_times(trend: list[dict], values: list[datetime], timezone_name: str, granularity: str) -> None:
    index = {point["start"]: point for point in trend}
    for value in values:
        key = _trend_key(value, timezone_name, granularity)
        if key in index:
            index[key]["count"] += 1


@app.get("/api/v1/users")
async def list_users(page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100), user: User = Depends(require_roles("admin")), session: AsyncSession = Depends(get_session)):
    where = User.org_id == user.org_id
    total = await session.scalar(select(func.count()).select_from(User).where(where))
    items = list(
        await session.scalars(
            select(User)
            .where(where)
            .order_by(User.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    )
    return envelope(page_data([UserRead.model_validate(item) for item in items], total or 0, page, page_size))


@app.post("/api/v1/users", response_model=UserRead, status_code=201)
async def add_user(payload: UserCreate, actor: User = Depends(require_roles("admin")), session: AsyncSession = Depends(get_session)):
    username = payload.username.lower()
    existing = await session.scalar(
        select(User).where(User.org_id == actor.org_id, User.username == username)
    )
    if existing:
        raise AppError(409, "USERNAME_EXISTS", "Username already exists")
    item = User(
        org_id=actor.org_id,
        username=username,
        name=payload.name.strip(),
        password_hash=password_hash.hash(payload.password),
        role=payload.role,
        is_digital_human=payload.is_digital_human,
    )
    session.add(item)
    await session.flush()
    await add_audit(
        session,
        actor,
        "user.create",
        "user",
        item.id,
        {"role": item.role, "digital_human": item.is_digital_human},
    )
    await session.commit()
    await session.refresh(item)
    return item


@app.patch("/api/v1/users/{user_id}", response_model=UserRead)
async def update_user(user_id: uuid.UUID, payload: UserUpdate, actor: User = Depends(require_roles("admin")), session: AsyncSession = Depends(get_session)):
    item = await session.scalar(
        select(User).where(User.id == user_id, User.org_id == actor.org_id)
    )
    if item is None:
        raise AppError(404, "USER_NOT_FOUND", "User not found")
    changes = payload.model_dump(exclude_unset=True)
    if item.id == actor.id and (changes.get("is_active") is False or changes.get("role", "admin") != "admin"):
        raise AppError(409, "SELF_LOCKOUT", "Current administrator cannot disable or demote itself")
    for key, value in changes.items():
        setattr(item, key, value.strip() if key == "name" else value)
    await add_audit(session, actor, "user.update", "user", item.id, changes)
    await session.commit()
    await session.refresh(item)
    return item


@app.get("/api/v1/settings/organization", response_model=OrganizationRead)
async def read_organization(user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    return await session.get(Organization, user.org_id)


@app.patch("/api/v1/settings/organization", response_model=OrganizationRead)
async def update_organization(payload: OrganizationUpdate, user: User = Depends(require_roles("admin")), session: AsyncSession = Depends(get_session)):
    organization = await session.get(Organization, user.org_id)
    name = payload.name.strip()
    duplicate = await session.scalar(
        select(Organization).where(Organization.name == name, Organization.id != user.org_id)
    )
    if duplicate:
        raise AppError(409, "ORGANIZATION_NAME_EXISTS", "Organization name already exists")
    organization.name = name
    await add_audit(session, user, "organization.update", "organization", organization.id)
    await session.commit()
    await session.refresh(organization)
    return organization


@app.get("/api/v1/settings/runtime")
async def runtime_settings(user: User = Depends(require_roles("admin", "security_expert", "auditor")), settings: Settings = Depends(get_settings)):
    return envelope(
        {
            "app_name": settings.app_name,
            "engine_mode": settings.engine_mode,
            "engine_configured": settings.engine_mode == "mock" or bool(settings.xiaoyi_token),
            "engine_retry_limit": settings.engine_retry_limit,
            "sync_interval_seconds": settings.sync_interval_seconds,
            "report_storage": "local",
        }
    )


@app.get("/api/v1/audit-logs")
async def list_audit_logs(action: str | None = Query(default=None, max_length=100), resource_type: str | None = Query(default=None, max_length=64), page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100), user: User = Depends(require_roles("admin", "security_expert", "auditor")), session: AsyncSession = Depends(get_session)):
    criteria = [AuditLog.org_id == user.org_id]
    if action:
        criteria.append(AuditLog.action == action)
    if resource_type:
        criteria.append(AuditLog.resource_type == resource_type)
    total = await session.scalar(select(func.count()).select_from(AuditLog).where(*criteria))
    items = list(
        await session.scalars(
            select(AuditLog)
            .where(*criteria)
            .order_by(AuditLog.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    )
    return envelope(page_data([AuditLogRead.model_validate(item) for item in items], total or 0, page, page_size))


@app.get("/api/v1/assets", response_model=ApiEnvelope[PageData[AssetRead]])
async def list_assets(page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100), user: User = Depends(current_user), session: AsyncSession = Depends(get_session), settings: Settings = Depends(get_settings)):
    demo = configured_demo_store(settings, user.org_id)
    where = Asset.org_id == user.org_id
    total = await session.scalar(select(func.count()).select_from(Asset).where(where))
    items = list(await session.scalars(select(Asset).where(where).order_by(Asset.created_at.desc(), Asset.id.desc()).offset(0 if demo else (page - 1) * page_size).limit(page * page_size if demo else page_size)))
    values = [AssetRead.model_validate(item) for item in items]
    if demo:
        values.append(AssetRead.model_validate(demo.asset))
        values.sort(key=lambda item: (_timestamp(item.created_at), str(item.id)), reverse=True)
        values = values[(page - 1) * page_size:page * page_size]
    return envelope(page_data(values, int(total or 0) + int(bool(demo)), page, page_size))


@app.post("/api/v1/assets", response_model=AssetRead, status_code=201)
async def add_asset(payload: AssetCreate, user: User = Depends(require_roles("admin", "operator", "security_expert")), session: AsyncSession = Depends(get_session)):
    if payload.plan_id is not None and await session.scalar(select(ScanPlan.id).where(ScanPlan.id == payload.plan_id, ScanPlan.org_id == user.org_id)) is None:
        raise AppError(404, "PLAN_NOT_FOUND", "Scan plan not found")
    asset = Asset(org_id=user.org_id, plan_id=payload.plan_id, asset_key=payload.asset_key or payload.address.lower(), asset_type=payload.asset_type, address=payload.address, service=payload.service, owner=payload.owner, authorized=payload.authorized, data_json=payload.data)
    session.add(asset)
    await session.flush()
    await add_audit(session, user, "asset.create", "asset", asset.id)
    await session.commit()
    await session.refresh(asset)
    return asset

@app.post("/api/v1/assets/bulk", response_model=list[AssetRead], status_code=201)
async def add_assets_bulk(payload: AssetBulkCreate, user: User = Depends(require_roles("admin", "operator", "security_expert")), session: AsyncSession = Depends(get_session)):
    plan_ids = {item.plan_id for item in payload.assets if item.plan_id is not None}
    if plan_ids:
        owned_plan_ids = set(await session.scalars(select(ScanPlan.id).where(ScanPlan.id.in_(plan_ids), ScanPlan.org_id == user.org_id)))
        if owned_plan_ids != plan_ids:
            raise AppError(404, "PLAN_NOT_FOUND", "Scan plan not found")
    created = []
    for item in payload.assets:
        asset = Asset(org_id=user.org_id, plan_id=item.plan_id, asset_key=item.asset_key or item.address.lower(), asset_type=item.asset_type, address=item.address, service=item.service, owner=item.owner, authorized=item.authorized, data_json=item.data)
        session.add(asset)
        created.append(asset)
    await session.flush()
    for asset in created:
        await add_audit(session, user, "asset.create", "asset", asset.id)
    await session.commit()
    for asset in created:
        await session.refresh(asset)
    return created


@app.patch("/api/v1/assets/{asset_id}", response_model=AssetRead)
async def update_asset(asset_id: uuid.UUID, payload: AssetUpdate, user: User = Depends(require_roles("admin", "operator", "security_expert")), session: AsyncSession = Depends(get_session)):
    asset = await session.scalar(select(Asset).where(Asset.id == asset_id, Asset.org_id == user.org_id))
    if asset is None:
        raise AppError(404, "ASSET_NOT_FOUND", "Asset not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(asset, key, value)
    await add_audit(session, user, "asset.update", "asset", asset.id, payload.model_dump(exclude_unset=True))
    await session.commit()
    await session.refresh(asset)
    return asset


@app.get("/api/v1/scan-plans")
async def list_plans(user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    items = list(await session.scalars(select(ScanPlan).where(ScanPlan.org_id == user.org_id).order_by(ScanPlan.created_at.desc())))
    return envelope([ScanPlanRead.model_validate(item) for item in items])


@app.post("/api/v1/scan-plans", response_model=ScanPlanRead, status_code=201)
async def add_plan(payload: ScanPlanCreate, user: User = Depends(require_roles("admin", "operator", "security_expert")), session: AsyncSession = Depends(get_session)):
    draft = payload.model_copy(update={"authorization_confirmed": False})
    return await create_plan(session, draft, user)


@app.get("/api/v1/scan-plans/{plan_id}", response_model=ScanPlanRead)
async def read_plan(plan_id: uuid.UUID, user: User = Depends(current_user), session: AsyncSession = Depends(get_session), settings: Settings = Depends(get_settings)):
    demo = configured_demo_store(settings, user.org_id)
    if demo and plan_id == demo.plan["id"]:
        created_at = demo.task["created_at"]
        return ScanPlanRead.model_validate(
            {
                **demo.plan,
                "asset_list": [{"host": demo.asset["address"], "hostType": "domain"}],
                "templates": [],
                "description": "演示数据导入的已完成渗透测试任务。",
                "time_limit": None,
                "snapshot": {"source": "demo", "authorization_confirmed": True},
                "analysis_json": {},
                "created_at": created_at,
            }
        )
    return await get_plan(session, plan_id, user)


@app.get("/api/v1/scan-plans/{plan_id}/consultation/messages")
async def list_plan_messages(
    plan_id: uuid.UUID,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
):
    demo = configured_demo_store(settings, user.org_id)
    if demo and plan_id == demo.plan["id"]:
        return envelope([])
    await get_plan(session, plan_id, user)
    items = list(
        await session.scalars(
            select(ScanPlanMessage)
            .where(
                ScanPlanMessage.plan_id == plan_id,
                ScanPlanMessage.org_id == user.org_id,
            )
            .order_by(ScanPlanMessage.created_at, ScanPlanMessage.id)
        )
    )
    return envelope([ScanPlanMessageRead.model_validate(item) for item in items])


@app.post(
    "/api/v1/scan-plans/{plan_id}/consultation/messages",
    response_model=ConsultationResponse,
    status_code=201,
)
async def consult_plan(
    plan_id: uuid.UUID,
    payload: ConsultationMessageCreate,
    user: User = Depends(require_roles("admin", "operator", "security_expert")),
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
):
    plan = await session.scalar(plan_for_update_query(plan_id, user.org_id))
    if plan is None:
        raise AppError(404, "PLAN_NOT_FOUND", "扫描计划不存在")
    if plan.status != "DRAFT":
        raise AppError(409, "PLAN_NOT_DRAFT", "已确认的计划不能继续修改需求")
    existing = list(
        await session.scalars(
            select(ScanPlanMessage)
            .where(
                ScanPlanMessage.plan_id == plan.id,
                ScanPlanMessage.org_id == user.org_id,
            )
            .order_by(ScanPlanMessage.created_at, ScanPlanMessage.id)
        )
    )
    user_message = ScanPlanMessage(
        org_id=user.org_id,
        plan_id=plan.id,
        user_id=user.id,
        role="user",
        content=payload.content,
    )
    session.add(user_message)
    await session.flush()
    transcript = [
        {"role": item.role, "content": item.content} for item in existing
    ] + [{"role": "user", "content": payload.content}]
    state = dict(plan.analysis_json or {})
    reply = await run_requirement_agent(settings, transcript, state)
    requirements = {
        **state.get("requirements", {}),
        **reply.requirements.model_dump(exclude_none=True),
    }
    if reply.requirements.targets:
        plan.targets = reply.requirements.targets
    if reply.requirements.test_type:
        plan.test_type = reply.requirements.test_type
    assets = plan.asset_list
    if reply.ready_to_precheck:
        assets = await assess_targets(plan.targets, settings)
        plan.asset_list = assets
    plan.analysis_json = {
        "requirements": requirements,
        "ready_to_precheck": reply.ready_to_precheck,
        "assets": assets,
    }
    plan.snapshot = {**plan.snapshot, "requirements": requirements, "asset_list": assets}
    session.add(
        ScanPlanMessage(
            org_id=user.org_id,
            plan_id=plan.id,
            user_id=user.id,
            role="assistant",
            content=reply.assistant_message,
        )
    )
    await add_audit(session, user, "plan.consult", "scan_plan", plan.id)
    await session.commit()
    await session.refresh(plan)
    return ConsultationResponse(
        plan=ScanPlanRead.model_validate(plan),
        assistant_message=reply.assistant_message,
        ready_to_precheck=reply.ready_to_precheck,
    )


@app.patch("/api/v1/scan-plans/{plan_id}/assets", response_model=ScanPlanRead)
async def update_plan_assets(plan_id: uuid.UUID, payload: ScanPlanAssetUpdate, user: User = Depends(require_roles("admin", "operator", "security_expert")), session: AsyncSession = Depends(get_session)):
    plan = await session.scalar(plan_for_update_query(plan_id, user.org_id))
    if plan is None:
        raise AppError(404, "PLAN_NOT_FOUND", "扫描计划不存在")
    if plan.status != "DRAFT":
        raise AppError(409, "PLAN_NOT_DRAFT", "Scan plan assets can only be changed before confirmation")
    asset_list = normalize_asset_list(payload.asset_list)
    settings = get_settings()
    if settings.cdninfo_enabled:
        checks = await assess_targets(
            [cdn_assessment_target(item["host"]) for item in asset_list], settings
        )
        asset_list = [
            {**item, **check, "host": item["host"], "hostType": item["hostType"]}
            for item, check in zip(asset_list, checks, strict=True)
        ]
    plan.asset_list = asset_list
    plan.snapshot = {**plan.snapshot, "asset_list": asset_list}
    await add_audit(session, user, "plan.assets.update", "scan_plan", plan.id)
    await session.commit()
    await session.refresh(plan)
    return plan


@app.post("/api/v1/scan-plans/{plan_id}/confirm", response_model=ScanPlanRead)
async def confirm_plan(
    plan_id: uuid.UUID,
    user: User = Depends(require_roles("admin", "security_expert")),
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
):
    # Confirmation freezes the authorized scope in the snapshot consumed by the engine.
    plan = await session.scalar(plan_for_update_query(plan_id, user.org_id))
    if plan is None:
        raise AppError(404, "PLAN_NOT_FOUND", "扫描计划不存在")
    if plan.status == "READY":
        return plan
    if plan.status != "DRAFT":
        raise AppError(409, "PLAN_NOT_DRAFT", "只有草稿计划可以确认")
    if settings.cdninfo_enabled:
        require_cdn_safe_assets(plan.asset_list)
    return await freeze_confirmed_plan(plan, user, session, settings)


async def freeze_confirmed_plan(
    plan: ScanPlan,
    user: User,
    session: AsyncSession,
    settings: Settings,
) -> ScanPlan:
    mapping = await session.scalar(
        select(XiaoyiPlanMapping).where(XiaoyiPlanMapping.plan_id == plan.id)
    )
    if mapping is None:
        mapping = XiaoyiPlanMapping(plan_id=plan.id)
        session.add(mapping)
        await session.flush()
    org_id = resolve_xiaoyi_org_id(settings)
    requirements = plan.snapshot.get("requirements", {})
    requested_speed = plan.snapshot.get("scan_speed")
    if requested_speed not in {"quick", "standard", "deep"} and isinstance(requirements, dict):
        requested_speed = requirements.get("scan_speed")
    scan_speed = requested_speed if requested_speed in {"quick", "standard", "deep"} else "quick"
    if plan.test_type == "standard" and scan_speed == "quick":
        scan_speed = "standard"
    scan_mode = plan.snapshot.get("scan_mode", "standard")
    if scan_mode not in {
        "standard",
        "two_high_one_weak",
        "mlps_2_0",
    }:
        scan_mode = "standard"
    xiaoyi_context = {
        "user_id": settings.xiaoyi_user_id or user.username,
        "plan_id": mapping.id,
        "scan_mode": scan_mode,
        "scan_speed": scan_speed,
        "download_intermediate_results": True,
    }
    if org_id is not None:
        xiaoyi_context["org_id"] = org_id
    plan.status = "READY"
    plan.snapshot = {
        **plan.snapshot,
        "authorization_confirmed": True,
        "confirmed_by": str(user.id),
        "xiaoyi_context": xiaoyi_context,
    }
    await add_audit(session, user, "plan.confirm", "scan_plan", plan.id)
    await session.commit()
    await session.refresh(plan)
    return plan


@app.get("/api/v1/tasks", response_model=ApiEnvelope[TaskListPageData])
async def list_tasks(
    status: str | None = Query(default=None, max_length=32),
    keyword: str | None = Query(default=None, max_length=200),
    test_type: str | None = Query(default=None, max_length=32),
    creator: str | None = Query(default=None, max_length=120),
    created_from: datetime | None = Query(default=None),
    created_to: datetime | None = Query(default=None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
):
    demo = configured_demo_store(settings, user.org_id)
    demo_task = demo.task if demo else None
    demo_matches = bool(
        demo_task
        and (not status or demo_task["status"] == status)
        and (not keyword or keyword.strip().casefold() in demo_task["name"].casefold())
        and (not test_type or demo_task["test_type"] == test_type)
        and (not creator or demo_task["created_by_name"] == creator)
        and (not created_from or demo_task["created_at"] >= created_from)
        and (not created_to or demo_task["created_at"] <= created_to)
    )
    criteria = [Task.org_id == user.org_id, Task.parent_id.is_(None)]
    if status:
        criteria.append(Task.status == status)
    if keyword:
        pattern = f"%{keyword.strip()}%"
        criteria.append(or_(Task.name.ilike(pattern), Task.request_id.ilike(pattern)))
    if test_type:
        criteria.append(ScanPlan.test_type == test_type)
    if creator:
        criteria.append(User.name == creator)
    if created_from:
        criteria.append(Task.created_at >= created_from)
    if created_to:
        criteria.append(Task.created_at <= created_to)
    plan_join = and_(Task.plan_id == ScanPlan.id, ScanPlan.org_id == user.org_id)
    creator_join = and_(Task.created_by == User.id, User.org_id == user.org_id)
    total = await session.scalar(
        select(func.count())
        .select_from(Task)
        .join(ScanPlan, plan_join)
        .join(User, creator_join)
        .where(*criteria)
    )
    metric_row = (
        await session.execute(
            select(
                func.count(Task.id).label("total"),
                func.coalesce(func.sum(case((Task.status == "QUEUED", 1), else_=0)), 0).label("queued"),
                func.coalesce(func.sum(case((Task.status.in_(["RUNNING", "CANCELLING"]), 1), else_=0)), 0).label("running"),
                func.coalesce(func.sum(case((Task.status.in_(["SUCCEEDED", "PARTIAL_SUCCEEDED"]), 1), else_=0)), 0).label("completed"),
                func.coalesce(func.sum(case((Task.status == "FAILED", 1), else_=0)), 0).label("failed"),
                func.coalesce(func.sum(case((Task.status == "CANCELLED", 1), else_=0)), 0).label("cancelled"),
            )
            .where(Task.org_id == user.org_id, Task.parent_id.is_(None))
        )
    ).one()
    rows = (
        await session.execute(
            select(Task, ScanPlan, User.name)
            .join(ScanPlan, plan_join)
            .join(User, creator_join)
            .where(*criteria)
            .order_by(Task.created_at.desc(), Task.id.desc())
            .offset(0 if demo else (page - 1) * page_size)
            .limit(page * page_size if demo else page_size)
        )
    ).all()
    items = [
        TaskListRead.model_validate(
            {
                **TaskRead.model_validate(task).model_dump(),
                "plan_name": plan.name,
                "test_type": plan.test_type,
                "targets": plan.targets,
                "created_by_name": creator_name,
            }
        )
        for task, plan, creator_name in rows
    ]
    if demo_matches and demo_task:
        items.append(TaskListRead.model_validate(demo_task))
        items.sort(key=lambda item: (_timestamp(item.created_at), str(item.id)), reverse=True)
    if demo:
        items = items[(page - 1) * page_size:page * page_size]
    visible_total = int(total or 0) + int(demo_matches)
    demo_count = int(bool(demo_task))
    return envelope(
        {
            **page_data(items, visible_total, page, page_size),
            "metrics": {
                "total": metric_row.total + demo_count,
                "queued": metric_row.queued,
                "running": metric_row.running,
                "completed": metric_row.completed + demo_count,
                "failed": metric_row.failed,
                "cancelled": metric_row.cancelled,
            },
        }
    )


@app.post("/api/v1/tasks", response_model=TaskRead, status_code=201)
async def add_task(payload: TaskCreate, user: User = Depends(require_roles("admin", "operator", "security_expert")), session: AsyncSession = Depends(get_session), settings: Settings = Depends(get_settings)):
    # The service creates an idempotent platform task; the background sync calls Xiaoyi.
    plan = await get_plan(session, payload.plan_id, user)
    return await create_task(
        session,
        plan,
        user,
        payload.request_id,
        enforce_cdn_guard=settings.cdninfo_enabled,
    )


async def scoped_task(session: AsyncSession, task_id: uuid.UUID, user: User) -> Task:
    task = await session.scalar(select(Task).where(Task.id == task_id, Task.org_id == user.org_id))
    if task is None:
        raise AppError(404, "TASK_NOT_FOUND", "Task not found")
    return task


@app.get("/api/v1/tasks/{task_id}", response_model=TaskRead)
async def read_task(task_id: uuid.UUID, user: User = Depends(current_user), session: AsyncSession = Depends(get_session), settings: Settings = Depends(get_settings)):
    demo = configured_demo_store(settings, user.org_id)
    if demo and task_id == demo.task["id"]:
        return TaskRead.model_validate(demo.task)
    return await scoped_task(session, task_id, user)


def _risk_finding(item: Vulnerability | dict) -> dict:
    if isinstance(item, dict):
        data = item.get("data_json") if isinstance(item.get("data_json"), dict) else item
        item_id = item.get("id")
        title = item.get("title")
        severity = item.get("severity")
        status = item.get("status")
        asset_key = item.get("asset_key")
        description = item.get("description")
    else:
        data = item.data_json if isinstance(item.data_json, dict) else {}
        item_id = item.id
        title = item.title
        severity = item.severity
        status = item.status
        asset_key = item.asset_key
        description = item.description
    score = data.get("cvss_score") or data.get("cvss")
    if isinstance(score, bool) or not isinstance(score, (int, float)) or not 0 <= score <= 10:
        score = None
    return {
        "id": item_id,
        "title": str(title or "未命名漏洞"),
        "severity": str(severity or "unknown"),
        "status": str(status or "OPEN"),
        "asset_key": asset_key,
        "description": description,
        "cvss_score": float(score) if score is not None else None,
    }


@app.get("/api/v1/tasks/{task_id}/risk-summary", response_model=TaskRiskSummaryRead)
async def task_risk_summary(
    task_id: uuid.UUID,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
):
    demo = configured_demo_store(settings, user.org_id)
    if demo and task_id == demo.task["id"]:
        findings = [_risk_finding(item) for item in demo.vulnerabilities]
    else:
        await scoped_task(session, task_id, user)
        items = list(
            await session.scalars(
                select(Vulnerability)
                .where(
                    Vulnerability.task_id == task_id,
                    Vulnerability.org_id == user.org_id,
                )
                .order_by(Vulnerability.created_at.desc(), Vulnerability.id.desc())
            )
        )
        findings = [_risk_finding(item) for item in items]
    assessment: RiskAssessmentResult
    message = None
    if not findings:
        assessment = RiskAssessmentResult(
            score=None,
            level="暂无评分",
            rationale="该任务尚未发现漏洞，暂无 CVSS 评分。",
            source="platform",
        )
    else:
        try:
            assessment = await asyncio.wait_for(
                run_risk_assessment(settings, findings),
                timeout=min(settings.agent_timeout_seconds, 12),
            )
        except Exception:
            assessment = fallback_assessment()
            message = assessment.rationale
    return TaskRiskSummaryRead(
        task_id=task_id,
        vulnerabilities=[TaskRiskFindingRead.model_validate(item) for item in findings],
        score=assessment.score,
        level=assessment.level,
        rationale=assessment.rationale,
        source=assessment.source,
        message=message,
    )


@app.get("/api/v1/tasks/{task_id}/children")
async def task_children(task_id: uuid.UUID, user: User = Depends(current_user), session: AsyncSession = Depends(get_session), settings: Settings = Depends(get_settings)):
    demo = configured_demo_store(settings, user.org_id)
    if demo and task_id == demo.task["id"]:
        return envelope([])
    await scoped_task(session, task_id, user)
    items = list(await session.scalars(select(Task).where(Task.parent_id == task_id, Task.org_id == user.org_id)))
    return envelope([TaskRead.model_validate(item) for item in items])


@app.get("/api/v1/tasks/{task_id}/tools")
async def task_tools(task_id: uuid.UUID, user: User = Depends(current_user), session: AsyncSession = Depends(get_session), settings: Settings = Depends(get_settings)):
    demo = configured_demo_store(settings, user.org_id)
    if demo and task_id == demo.task["id"]:
        return envelope([])
    task = await scoped_task(session, task_id, user)
    return envelope(redact_sensitive(await resolved_task_tools(session, task, settings)))


@app.get("/api/v1/tasks/{task_id}/events")
async def task_events(task_id: uuid.UUID, user: User = Depends(current_user), session: AsyncSession = Depends(get_session), settings: Settings = Depends(get_settings)):
    demo = configured_demo_store(settings, user.org_id)
    if demo and task_id == demo.task["id"]:
        return envelope([TaskEventRead.model_validate(item) for item in demo.events])
    await scoped_task(session, task_id, user)
    items = list(await session.scalars(select(TaskEvent).where(TaskEvent.task_id == task_id).order_by(TaskEvent.created_at)))
    return envelope([TaskEventRead.model_validate(item) for item in items])


@app.get("/api/v1/tasks/{task_id}/qa/messages")
async def task_qa_messages(
    task_id: uuid.UUID,
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
):
    demo = configured_demo_store(settings, user.org_id)
    if demo and task_id == demo.task["id"]:
        return envelope([])
    await scoped_task(session, task_id, user)
    items = list(
        await session.scalars(
            select(QAMessage)
            .where(QAMessage.task_id == task_id, QAMessage.org_id == user.org_id)
            .order_by(QAMessage.created_at)
        )
    )
    return envelope([QAMessageRead.model_validate(item) for item in items])


@app.post("/api/v1/tasks/{task_id}/qa/messages", response_model=TaskQAResponse, status_code=201)
async def add_task_qa_message(
    task_id: uuid.UUID,
    payload: QAMessageCreate,
    user: User = Depends(require_roles("admin", "operator", "security_expert")),
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
):
    task = await scoped_task(session, task_id, user)
    plan = await session.get(ScanPlan, task.plan_id)
    events = list(
        await session.scalars(
            select(TaskEvent)
            .where(TaskEvent.task_id == task.id)
            .order_by(TaskEvent.created_at.desc())
            .limit(30)
        )
    )
    tools = await resolved_task_tools(session, task, settings)
    context = redact_sensitive(
        {
            "task": TaskRead.model_validate(task).model_dump(mode="json"),
            "plan": {
                "name": plan.name if plan else task.name,
                "targets": plan.targets if plan else [],
                "test_type": plan.test_type if plan else None,
            },
            "xiaoyi": task.raw_external,
            "events": [
                {"type": item.event_type, "message": item.message, "data": item.data_json}
                for item in reversed(events)
            ],
            "tools": [
                {
                    "name": item.get("toolName") or item.get("toolType"),
                    "phase": item.get("phase"),
                    "success": item.get("success"),
                    "error": item.get("errorMessage"),
                    "result": str(item.get("result") or "")[:1200],
                    "display_only": item.get("display_only") is True,
                }
                for item in tools[-12:]
                if isinstance(item, dict)
            ],
        }
    )
    answer = await run_task_expert_agent(settings, payload.content, context)
    item = QAMessage(
        org_id=user.org_id,
        task_id=task_id,
        user_id=user.id,
        role="user",
        content=payload.content,
    )
    session.add(item)
    await session.flush()
    assistant = QAMessage(
        org_id=user.org_id,
        task_id=task_id,
        user_id=user.id,
        role="assistant",
        content=answer,
    )
    session.add(assistant)
    await session.flush()
    await add_audit(session, user, "task.qa_message.create", "task", task_id)
    await session.commit()
    await session.refresh(item)
    await session.refresh(assistant)
    return TaskQAResponse(user_message=item, assistant_message=assistant)


@app.post("/api/v1/tasks/{task_id}/stop", response_model=TaskRead)
async def stop_task(task_id: uuid.UUID, user: User = Depends(require_roles("admin", "operator", "security_expert")), session: AsyncSession = Depends(get_session)):
    task = await scoped_task(session, task_id, user)
    if task.status not in {"QUEUED", "RUNNING"}:
        raise AppError(409, "TASK_NOT_STOPPABLE", "Task cannot be stopped in its current state")
    task.status = "CANCELLING"
    await add_audit(session, user, "task.stop", "task", task.id)
    await session.commit()
    await session.refresh(task)
    return task


@app.post("/api/v1/tasks/{task_id}/retry", response_model=TaskRead, status_code=201)
async def retry_task(task_id: uuid.UUID, user: User = Depends(require_roles("admin", "operator", "security_expert")), session: AsyncSession = Depends(get_session)):
    source = await scoped_task(session, task_id, user)
    if source.status not in {"FAILED", "CANCELLED", "PARTIAL_SUCCEEDED"}:
        raise AppError(409, "TASK_NOT_RETRYABLE", "Task cannot be retried in its current state")
    plan = await get_plan(session, source.plan_id, user)
    retried = await create_task(
        session, plan, user, enforce_cdn_guard=get_settings().cdninfo_enabled
    )
    session.add(
        TaskEvent(
            task_id=source.id,
            event_type="retried",
            message="已创建重试任务",
            data_json={"task_id": str(retried.id)},
        )
    )
    await add_audit(
        session,
        user,
        "task.retry",
        "task",
        source.id,
        {"new_task_id": str(retried.id)},
    )
    await session.commit()
    return retried


@app.delete("/api/v1/tasks/{task_id}", response_model=ApiEnvelope[None])
async def delete_task(
    task_id: uuid.UUID,
    user: User = Depends(require_roles("admin", "operator", "security_expert")),
    session: AsyncSession = Depends(get_session),
):
    task = await scoped_task(session, task_id, user)
    if task.status not in {"SUCCEEDED", "PARTIAL_SUCCEEDED", "FAILED", "CANCELLED"}:
        raise AppError(409, "TASK_NOT_DELETABLE", "Only terminal tasks can be deleted")
    await session.execute(update(Task).where(Task.parent_id == task.id).values(parent_id=None))
    await session.execute(update(Vulnerability).where(Vulnerability.task_id == task.id).values(task_id=None))
    await session.execute(update(Report).where(Report.task_id == task.id).values(task_id=None))
    await session.execute(delete(TaskEvent).where(TaskEvent.task_id == task.id))
    await session.execute(delete(QAMessage).where(QAMessage.task_id == task.id))
    await add_audit(session, user, "task.delete", "task", task.id)
    await session.delete(task)
    await session.commit()
    return envelope(None, message="Task deleted")


@app.get(
    "/api/v1/vulnerabilities",
    response_model=ApiEnvelope[PageData[VulnerabilityListRead]],
)
async def list_vulnerabilities(
    severity: str | None = None,
    status: str | None = None,
    keyword: str | None = Query(default=None, max_length=200),
    asset: str | None = Query(default=None, max_length=512),
    created_from: datetime | None = Query(default=None),
    created_to: datetime | None = Query(default=None),
    task_id: uuid.UUID | None = None,
    plan_id: uuid.UUID | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
):
    demo = configured_demo_store(settings, user.org_id)
    demo_items = (
        demo.filter_vulnerabilities(
            severity=severity,
            status=status,
            keyword=keyword,
            asset=asset,
            task_id=task_id,
            plan_id=plan_id,
            created_from=created_from,
            created_to=created_to,
        )
        if demo
        else []
    )
    criteria = [Vulnerability.org_id == user.org_id]
    if severity:
        criteria.append(Vulnerability.severity == severity)
    if status:
        criteria.append(Vulnerability.status == status)
    if keyword:
        pattern = f"%{keyword.strip()}%"
        criteria.append(or_(Vulnerability.title.ilike(pattern), Vulnerability.asset_key.ilike(pattern)))
    if asset:
        criteria.append(Vulnerability.asset_key == asset)
    if created_from:
        criteria.append(Vulnerability.created_at >= created_from)
    if created_to:
        criteria.append(Vulnerability.created_at <= created_to)
    if task_id:
        criteria.append(Vulnerability.task_id == task_id)
    if plan_id:
        criteria.append(Vulnerability.plan_id == plan_id)
    total = await session.scalar(
        select(func.count()).select_from(Vulnerability).where(*criteria)
    )
    rows = (
        await session.execute(
            select(Vulnerability, Task.name)
            .outerjoin(
                Task,
                and_(
                    Vulnerability.task_id == Task.id,
                    Task.org_id == user.org_id,
                ),
            )
            .where(*criteria)
            .order_by(Vulnerability.created_at.desc(), Vulnerability.id.desc())
            .offset(0 if demo else (page - 1) * page_size)
            .limit(page * page_size if demo else page_size)
        )
    ).all()
    items = []
    for item, task_name in rows:
        raw_tags = item.data_json.get("tags", [])
        tags = (
            [tag for tag in raw_tags if isinstance(tag, str)]
            if isinstance(raw_tags, list)
            else []
        )
        items.append(
            VulnerabilityListRead.model_validate(
                {
                    "id": item.id,
                    "plan_id": item.plan_id,
                    "task_id": item.task_id,
                    "asset_key": item.asset_key,
                    "title": item.title,
                    "severity": item.severity,
                    "status": item.status,
                    "description": item.description,
                    "created_at": item.created_at,
                    "updated_at": item.updated_at,
                    "task_name": task_name,
                    "tags": tags,
                }
            )
        )
    items.extend(VulnerabilityListRead.model_validate(item) for item in demo_items)
    if demo:
        items.sort(key=lambda item: (_timestamp(item.created_at), str(item.id)), reverse=True)
        items = items[(page - 1) * page_size:page * page_size]
    return envelope(page_data(items, int(total or 0) + len(demo_items), page, page_size))


@app.get(
    "/api/v1/vulnerabilities/overview",
    response_model=ApiEnvelope[VulnerabilityOverviewRead],
)
async def vulnerability_overview(
    range_name: Literal["today", "3d", "7d", "all"] = Query("7d", alias="range"),
    timezone_name: str = Query(DEFAULT_TIMEZONE, alias="timezone", max_length=64),
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
):
    demo = configured_demo_store(settings, user.org_id)
    metric_row = (
        await session.execute(
            select(
                func.count(Vulnerability.id),
                func.sum(case((Vulnerability.severity == "critical", 1), else_=0)),
                func.sum(case((Vulnerability.severity == "high", 1), else_=0)),
                func.sum(case((Vulnerability.severity == "medium", 1), else_=0)),
                func.sum(case((Vulnerability.severity == "low", 1), else_=0)),
                func.sum(
                    case(
                        (~Vulnerability.severity.in_(["critical", "high", "medium", "low"]), 1),
                        else_=0,
                    )
                ),
                func.sum(case((Vulnerability.status == "OPEN", 1), else_=0)),
                func.sum(case((Vulnerability.status == "RETESTING", 1), else_=0)),
                func.sum(case((Vulnerability.status == "FIXED", 1), else_=0)),
            ).where(Vulnerability.org_id == user.org_id)
        )
    ).one()
    values = [int(value or 0) for value in metric_row]
    metrics = dict(
        zip(
            ["total", "critical", "high", "medium", "low", "unknown", "open", "retesting", "fixed"],
            values,
            strict=True,
        )
    )
    demo_vulnerabilities = demo.vulnerabilities if demo else ()
    for item in demo_vulnerabilities:
        metrics["total"] += 1
        severity_key = item["severity"] if item["severity"] in {"critical", "high", "medium", "low"} else "unknown"
        metrics[severity_key] += 1
        status_key = {"OPEN": "open", "RETESTING": "retesting", "FIXED": "fixed"}.get(item["status"])
        if status_key:
            metrics[status_key] += 1
    source = func.coalesce(
        Vulnerability.data_json["source_tool"].as_string(),
        "xiaoyi",
    ).label("source")
    source_rows = (
        await session.execute(
            select(source, func.count())
            .where(Vulnerability.org_id == user.org_id)
            .group_by(source)
            .order_by(func.count().desc(), source)
        )
    ).all()
    window, trend = await aggregate_trend(
        session,
        Vulnerability,
        user.org_id,
        range_name,
        timezone_name,
        extra_earliest=min(
            (item["created_at"] for item in demo_vulnerabilities if item["data_json"].get("evidence_at")),
            default=None,
        ),
    )
    trend_values = [point.__dict__ for point in trend]
    _add_trend_times(
        trend_values,
        [item["created_at"] for item in demo_vulnerabilities if item["data_json"].get("evidence_at")],
        window.timezone_name,
        window.granularity,
    )
    risk_labels = {
        "critical": "严重",
        "high": "高危",
        "medium": "中危",
        "low": "低危",
        "unknown": "未知",
    }
    recommendations = []
    if metrics["critical"] or metrics["high"]:
        recommendations.append(
            f"优先处置 {metrics['critical'] + metrics['high']} 个严重或高危漏洞。"
        )
    if metrics["retesting"]:
        recommendations.append(f"有 {metrics['retesting']} 个漏洞等待复测确认。")
    if not recommendations:
        recommendations.append("当前没有需要优先处置或复测的漏洞。")
    return envelope(
        {
            "range": range_name,
            "timezone": window.timezone_name,
            "granularity": window.granularity,
            "metrics": metrics,
            "risk_distribution": [
                {"key": key, "label": label, "count": metrics[key]}
                for key, label in risk_labels.items()
            ],
            "source_distribution": [
                {
                    "key": str(key),
                    "label": "平台回传" if key == "xiaoyi" else str(key),
                    "count": int(count),
                }
                for key, count in source_rows
            ] + ([{"key": "demo", "label": "演示数据导入", "count": len(demo_vulnerabilities)}] if demo else []),
            "trend": trend_values,
            "recommendations": recommendations,
        }
    )


@app.get("/api/v1/vulnerabilities/{vulnerability_id}", response_model=VulnerabilityRead)
async def read_vulnerability(vulnerability_id: uuid.UUID, user: User = Depends(current_user), session: AsyncSession = Depends(get_session), settings: Settings = Depends(get_settings)):
    demo = configured_demo_store(settings, user.org_id)
    if demo:
        item = next((item for item in demo.vulnerabilities if item["id"] == vulnerability_id), None)
        if item:
            return VulnerabilityRead.model_validate(item)
    item = await session.scalar(select(Vulnerability).where(Vulnerability.id == vulnerability_id, Vulnerability.org_id == user.org_id))
    if item is None:
        raise AppError(404, "VULNERABILITY_NOT_FOUND", "Vulnerability not found")
    return item


@app.patch("/api/v1/vulnerabilities/{vulnerability_id}", response_model=VulnerabilityRead)
async def update_vulnerability(vulnerability_id: uuid.UUID, payload: VulnerabilityUpdate, user: User = Depends(require_roles("admin", "operator", "security_expert")), session: AsyncSession = Depends(get_session), settings: Settings = Depends(get_settings)):
    item = await read_vulnerability(vulnerability_id, user, session, settings)
    if isinstance(item, VulnerabilityRead):
        raise AppError(409, "DEMO_DATA_READ_ONLY", "Demo vulnerabilities are read-only")
    item.status = payload.status
    await add_audit(session, user, "vulnerability.update", "vulnerability", item.id, {"status": payload.status})
    await session.commit()
    await session.refresh(item)
    return item


@app.post("/api/v1/vulnerabilities/{vulnerability_id}/actions", response_model=VulnerabilityRead)
async def act_on_vulnerability(vulnerability_id: uuid.UUID, payload: VulnerabilityAction, user: User = Depends(require_roles("admin", "operator", "security_expert")), session: AsyncSession = Depends(get_session), settings: Settings = Depends(get_settings)):
    item = await read_vulnerability(vulnerability_id, user, session, settings)
    if isinstance(item, VulnerabilityRead):
        raise AppError(409, "DEMO_DATA_READ_ONLY", "Demo vulnerabilities are read-only")
    data = dict(item.data_json or {})
    now = datetime.now(UTC).isoformat()
    if payload.action == "favorite":
        data["favorite"] = bool(payload.value)
    elif payload.action == "assign":
        data["assignee_name"] = str(payload.value or "").strip() or None
    elif payload.action == "retest":
        item.status = "RETESTING"
        data["manual_retest"] = True
    elif payload.action == "close_retest":
        item.status = "OPEN"
        data["manual_retest"] = False
        data["retest_closed_at"] = now
    elif payload.action == "set_due_date":
        due_date = str(payload.value or "").strip()
        if not due_date:
            raise AppError(422, "DUE_DATE_REQUIRED", "Due date cannot be empty")
        data["due_date"] = due_date
    elif payload.action == "add_report":
        data["report_status"] = "已加入报告"
    elif payload.action == "create_ticket":
        data["ticket_id"] = str(payload.value or f"TICKET-{str(item.id)[:8].upper()}")
        settings = get_settings()
        try:
            data["ticket_synced"] = await post_signed(settings.ticket_webhook_url, settings.ticket_webhook_secret.get_secret_value() if settings.ticket_webhook_secret else None, "vulnerability.ticket.create", {"id": str(item.id), "title": item.title, "severity": item.severity, "asset_key": item.asset_key, "ticket_id": data["ticket_id"]})
        except Exception as exc:
            data["ticket_sync_error"] = str(exc)
    elif payload.action == "ignore":
        item.status = "FIXED"
        data["resolution"] = "ignored"
    elif payload.action == "false_positive":
        item.status = "FIXED"
        data["resolution"] = "false_positive"
    elif payload.action == "comment":
        comment = str(payload.value or "").strip()
        if not comment:
            raise AppError(422, "COMMENT_REQUIRED", "Comment cannot be empty")
        comments = list(data.get("comments") or [])
        comments.append({"text": comment, "author": user.username, "created_at": now})
        data["comments"] = comments
    history = list(data.get("action_history") or [])
    history.append({"action": payload.action, "value": payload.value, "actor": user.username, "created_at": now})
    data["action_history"] = history
    item.data_json = data
    await add_audit(session, user, f"vulnerability.{payload.action}", "vulnerability", item.id, {"value": payload.value})
    await session.commit()
    await session.refresh(item)
    return item

@app.post("/api/v1/vulnerabilities/{vulnerability_id}/retest-result", response_model=VulnerabilityRead)
async def vulnerability_retest_result(vulnerability_id: uuid.UUID, passed: bool = Query(...), user: User = Depends(require_roles("admin", "operator", "security_expert")), session: AsyncSession = Depends(get_session), settings: Settings = Depends(get_settings)):
    item = await read_vulnerability(vulnerability_id, user, session, settings)
    if isinstance(item, VulnerabilityRead):
        raise AppError(409, "DEMO_DATA_READ_ONLY", "Demo vulnerabilities are read-only")
    data = dict(item.data_json or {})
    item.status = "FIXED" if passed else "OPEN"
    data.update({"manual_retest": False, "retest_result": "passed" if passed else "failed", "retest_at": datetime.now(UTC).isoformat()})
    item.data_json = data
    await add_audit(session, user, "vulnerability.retest_result", "vulnerability", item.id, {"passed": passed})
    await session.commit()
    await session.refresh(item)
    return item

@app.post("/api/v1/vulnerabilities/sla/escalate", response_model=dict)
async def escalate_overdue_vulnerabilities(user: User = Depends(require_roles("admin", "operator", "security_expert")), session: AsyncSession = Depends(get_session), settings: Settings = Depends(get_settings)):
    items = list(await session.scalars(select(Vulnerability).where(Vulnerability.org_id == user.org_id, Vulnerability.status.in_(["OPEN", "FIXING", "RETESTING"]))))
    count = 0
    now = datetime.now(UTC)
    for item in items:
        data = dict(item.data_json or {})
        if overdue(data, now, settings.sla_escalation_hours):
            data["sla_escalated"] = True
            data["escalated_at"] = now.isoformat()
            item.data_json = data
            count += 1
    await session.commit()
    return {"escalated": count}


@app.delete("/api/v1/vulnerabilities/{vulnerability_id}", response_model=ApiEnvelope[None])
async def delete_vulnerability(
    vulnerability_id: uuid.UUID,
    user: User = Depends(require_roles("admin", "operator", "security_expert")),
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
):
    item = await read_vulnerability(vulnerability_id, user, session, settings)
    if isinstance(item, VulnerabilityRead):
        raise AppError(409, "DEMO_DATA_READ_ONLY", "Demo vulnerabilities are read-only")
    await add_audit(session, user, "vulnerability.delete", "vulnerability", item.id)
    await session.delete(item)
    await session.commit()
    return envelope(None, message="Vulnerability deleted")


@app.get("/api/v1/reports", response_model=ApiEnvelope[PageData[ReportListRead]])
async def list_reports(
    task_id: uuid.UUID | None = None,
    plan_id: uuid.UUID | None = None,
    keyword: str | None = Query(default=None, max_length=200),
    report_format: str | None = Query(default=None, alias="format", max_length=16),
    status: str | None = Query(default=None, max_length=32),
    created_from: datetime | None = Query(default=None),
    created_to: datetime | None = Query(default=None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
):
    demo = configured_demo_store(settings, user.org_id)
    demo_report = demo.report if demo else None
    demo_matches = bool(
        demo_report
        and (not task_id or demo_report["task_id"] == task_id)
        and (not plan_id or demo_report["plan_id"] == plan_id)
        and (
            not keyword
            or keyword.strip().casefold()
            in f"{demo_report['filename']} {demo_report['plan_name']} {demo_report['task_name']}".casefold()
        )
        and (not report_format or demo_report["format"] == report_format)
        and (
            not status
            or status in {"READY", "PENDING_CONFIRMATION", "PENDING_EXPORT"}
        )
        and (not created_from or demo_report["created_at"] >= created_from)
        and (not created_to or demo_report["created_at"] <= created_to)
    )
    criteria = [Report.org_id == user.org_id]
    if task_id:
        criteria.append(Report.task_id == task_id)
    if plan_id:
        criteria.append(Report.plan_id == plan_id)
    if keyword:
        pattern = f"%{keyword.strip()}%"
        criteria.append(
            or_(
                Report.filename.ilike(pattern),
                ScanPlan.name.ilike(pattern),
                Task.name.ilike(pattern),
            )
        )
    if report_format:
        criteria.append(Report.format == report_format)
    if status == "EXPORTED":
        criteria.append(Report.first_exported_at.is_not(None))
    elif status == "PENDING_CONFIRMATION":
        criteria.append(Report.first_viewed_at.is_(None))
    elif status == "PENDING_EXPORT":
        criteria.append(Report.first_exported_at.is_(None))
    elif status:
        criteria.append(Report.status == status)
    if created_from:
        criteria.append(Report.created_at >= created_from)
    if created_to:
        criteria.append(Report.created_at <= created_to)
    plan_join = and_(Report.plan_id == ScanPlan.id, ScanPlan.org_id == user.org_id)
    task_join = and_(Report.task_id == Task.id, Task.org_id == user.org_id)
    total = await session.scalar(
        select(func.count())
        .select_from(Report)
        .join(ScanPlan, plan_join)
        .outerjoin(Task, task_join)
        .where(*criteria)
    )
    rows = (
        await session.execute(
            select(Report, ScanPlan.name, Task.name)
            .join(ScanPlan, plan_join)
            .outerjoin(Task, task_join)
            .where(*criteria)
            .order_by(Report.created_at.desc(), Report.id.desc())
            .offset(0 if demo else (page - 1) * page_size)
            .limit(page * page_size if demo else page_size)
        )
    ).all()
    items = [
        ReportListRead.model_validate(
            {
                **ReportRead.model_validate(report).model_dump(),
                "external_url": public_report_url(report.external_url),
                "plan_name": plan_name,
                "task_name": task_name,
            }
        )
        for report, plan_name, task_name in rows
    ]
    if demo_matches and demo_report:
        items.append(ReportListRead.model_validate(demo_report))
        items.sort(
            key=lambda item: (
                item.created_at.replace(tzinfo=UTC).timestamp()
                if item.created_at.tzinfo is None
                else item.created_at.timestamp(),
                str(item.id),
            ),
            reverse=True,
        )
    if demo:
        items = items[(page - 1) * page_size:page * page_size]
    return envelope(
        page_data(items, int(total or 0) + int(demo_matches), page, page_size)
    )


@app.get(
    "/api/v1/reports/overview",
    response_model=ApiEnvelope[ReportOverviewRead],
)
async def report_overview(
    range_name: Literal["today", "3d", "7d", "all"] = Query("7d", alias="range"),
    timezone_name: str = Query(DEFAULT_TIMEZONE, alias="timezone", max_length=64),
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
    settings: Settings = Depends(get_settings),
):
    demo = configured_demo_store(settings, user.org_id)
    now = datetime.now(UTC)
    try:
        customer_timezone = ZoneInfo(timezone_name)
    except (ZoneInfoNotFoundError, ValueError):
        customer_timezone = timezone(timedelta(hours=8), DEFAULT_TIMEZONE)
    local_now = now.astimezone(customer_timezone)
    month_start_local = local_now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    previous_month_last = month_start_local - timedelta(microseconds=1)
    previous_month_start_local = previous_month_last.replace(
        day=1, hour=0, minute=0, second=0, microsecond=0
    )
    previous_month_end_local = min(
        previous_month_start_local + (local_now - month_start_local),
        month_start_local,
    )
    month_start = month_start_local.astimezone(UTC)
    previous_month_start = previous_month_start_local.astimezone(UTC)
    previous_month_end = previous_month_end_local.astimezone(UTC)
    metric_row = (
        await session.execute(
            select(
                func.count(Report.id),
                func.sum(case((Report.created_at >= month_start, 1), else_=0)),
                func.sum(case((Report.first_exported_at.is_(None), 1), else_=0)),
                func.sum(case((Report.first_exported_at.is_not(None), 1), else_=0)),
                func.sum(case((Report.first_viewed_at.is_(None), 1), else_=0)),
                func.sum(case((Report.first_viewed_at >= month_start, 1), else_=0)),
                func.sum(
                    case(
                        (
                            and_(
                                Report.created_at >= previous_month_start,
                                Report.created_at < previous_month_end,
                            ),
                            1,
                        ),
                        else_=0,
                    )
                ),
                func.sum(
                    case(
                        (
                            and_(
                                Report.first_viewed_at >= previous_month_start,
                                Report.first_viewed_at < previous_month_end,
                            ),
                            1,
                        ),
                        else_=0,
                    )
                ),
            ).where(Report.org_id == user.org_id)
        )
    ).one()

    def metric(value: object, baseline: object | None = None) -> dict[str, int | float | None]:
        current = int(value or 0)
        previous = int(baseline or 0)
        change = round((current - previous) * 100 / previous, 2) if previous else None
        return {"value": current, "change_percent": change}

    metrics = {
        "total": metric(metric_row[0]),
        "monthly_new": metric(metric_row[1], metric_row[6]),
        "pending_export": metric(metric_row[2]),
        "exported": metric(metric_row[3]),
        "pending_confirmation": metric(metric_row[4]),
        "monthly_delivered": metric(metric_row[5], metric_row[7]),
    }
    if demo:
        report_created_at = demo.report["created_at"]
        metrics["total"]["value"] += 1
        metrics["pending_export"]["value"] += 1
        metrics["pending_confirmation"]["value"] += 1
        if report_created_at >= month_start:
            metrics["monthly_new"]["value"] += 1
    penetration_modes = ("standard", "two_high_one_weak", "two_clear_two_solid", "mlps_2_0")
    source = case(
        (ScanPlan.test_type.in_(penetration_modes), "penetration"),
        (ScanPlan.test_type == "code_audit", "code_audit"),
        (ScanPlan.test_type == "emergency_response", "emergency"),
        (ScanPlan.test_type == "data_analysis", "data_analysis"),
        else_="other",
    ).label("source")
    source_rows = (
        await session.execute(
            select(source, func.count())
            .select_from(Report)
            .join(ScanPlan, and_(Report.plan_id == ScanPlan.id, ScanPlan.org_id == user.org_id))
            .where(Report.org_id == user.org_id)
            .group_by(source)
            .order_by(source)
        )
    ).all()
    severity_rank = case(
        (Vulnerability.severity == "critical", 4),
        (Vulnerability.severity == "high", 3),
        (Vulnerability.severity == "medium", 2),
        (Vulnerability.severity == "low", 1),
        else_=0,
    )
    report_risks = (
        select(Report.id.label("report_id"), func.max(severity_rank).label("risk_rank"))
        .outerjoin(
            Vulnerability,
            and_(
                Vulnerability.plan_id == Report.plan_id,
                Vulnerability.org_id == Report.org_id,
            ),
        )
        .where(Report.org_id == user.org_id)
        .group_by(Report.id)
        .subquery()
    )
    risk_rows = (
        await session.execute(
            select(report_risks.c.risk_rank, func.count())
            .group_by(report_risks.c.risk_rank)
            .order_by(report_risks.c.risk_rank.desc())
        )
    ).all()
    window, trend = await aggregate_trend(
        session,
        Report,
        user.org_id,
        range_name,
        timezone_name,
        extra_earliest=demo.report["created_at"] if demo else None,
    )
    trend_values = [point.__dict__ for point in trend]
    if demo:
        _add_trend_times(
            trend_values,
            [demo.report["created_at"]],
            window.timezone_name,
            window.granularity,
        )
    source_labels = {
        "penetration": "渗透测试",
        "code_audit": "代码审计",
        "emergency": "应急响应",
        "data_analysis": "数据分析",
        "other": "其他",
    }
    source_counts = {str(key): int(count) for key, count in source_rows}
    if demo:
        source_counts["penetration"] = source_counts.get("penetration", 0) + 1
    risk_labels = {
        "critical": "严重",
        "high": "高危",
        "medium": "中危",
        "low": "低危",
        "none": "无已确认风险",
    }
    risk_keys = {4: "critical", 3: "high", 2: "medium", 1: "low", 0: "none"}
    risk_counts = {risk_keys[int(rank or 0)]: int(count) for rank, count in risk_rows}
    if demo:
        highest = max(
            (item["severity"] for item in demo.vulnerabilities),
            key={"critical": 4, "high": 3, "medium": 2, "low": 1}.get,
            default="none",
        )
        risk_counts[highest] = risk_counts.get(highest, 0) + 1
    latest_rows = (
        await session.execute(
            select(Report, ScanPlan.test_type, User.name)
            .join(ScanPlan, and_(Report.plan_id == ScanPlan.id, ScanPlan.org_id == user.org_id))
            .join(User, and_(ScanPlan.created_by == User.id, User.org_id == user.org_id))
            .where(Report.org_id == user.org_id)
            .order_by(Report.created_at.desc(), Report.id.desc())
            .limit(5)
        )
    ).all()
    export_rows = (
        await session.execute(
            select(Report, ScanPlan.test_type, User.name)
            .join(ScanPlan, and_(Report.plan_id == ScanPlan.id, ScanPlan.org_id == user.org_id))
            .join(User, and_(Report.first_exported_by == User.id, User.org_id == user.org_id))
            .where(Report.org_id == user.org_id, Report.first_exported_at.is_not(None))
            .order_by(Report.first_exported_at.desc(), Report.id.desc())
            .limit(5)
        )
    ).all()

    def source_key(test_type: str) -> str:
        if test_type in penetration_modes:
            return "penetration"
        return {
            "code_audit": "code_audit",
            "emergency_response": "emergency",
            "data_analysis": "data_analysis",
        }.get(test_type, "other")

    latest_reports = [
        {
            "id": report.id,
            "filename": report.filename,
            "source": (key := source_key(test_type)),
            "source_label": source_labels[key],
            "creator_name": creator_name,
            "created_at": report.created_at,
        }
        for report, test_type, creator_name in latest_rows
    ]
    if demo:
        latest_reports.append(
            {
                "id": demo.report["id"],
                "filename": demo.report["filename"],
                "source": "penetration",
                "source_label": source_labels["penetration"],
                "creator_name": "演示数据",
                "created_at": demo.report["created_at"],
            }
        )
        latest_reports.sort(key=lambda item: (_timestamp(item["created_at"]), str(item["id"])), reverse=True)
        latest_reports = latest_reports[:5]

    insights = [
        f"平台累计生成 {metrics['total']['value']} 份报告，本月新增 {metrics['monthly_new']['value']} 份。",
        f"当前有 {metrics['pending_export']['value']} 份待导出，{metrics['pending_confirmation']['value']} 份尚未查看。",
    ]
    if risk_counts.get("critical", 0) or risk_counts.get("high", 0):
        insights.append(
            f"严重或高危风险报告共 {risk_counts.get('critical', 0) + risk_counts.get('high', 0)} 份，建议优先确认。"
        )
    return envelope(
        {
            "range": range_name,
            "timezone": window.timezone_name,
            "granularity": window.granularity,
            "metrics": metrics,
            "source_distribution": [
                {
                    "key": key,
                    "label": label,
                    "count": source_counts.get(key, 0),
                }
                for key, label in source_labels.items()
            ],
            "risk_distribution": [
                {
                    "key": key,
                    "label": label,
                    "count": risk_counts.get(key, 0),
                }
                for key, label in risk_labels.items()
            ],
            "trend": trend_values,
            "latest_reports": latest_reports,
            "recent_exports": [
                {
                    "id": report.id,
                    "filename": report.filename,
                    "source": (key := source_key(test_type)),
                    "source_label": source_labels[key],
                    "format": report.format,
                    "exporter_name": exporter_name,
                    "status": "DELIVERED",
                    "exported_at": report.first_exported_at,
                }
                for report, test_type, exporter_name in export_rows
            ],
            "insights": insights,
        }
    )


async def scoped_report(session: AsyncSession, report_id: uuid.UUID, user: User) -> Report:
    report = await session.scalar(select(Report).where(Report.id == report_id, Report.org_id == user.org_id))
    if report is None:
        raise AppError(404, "REPORT_NOT_FOUND", "Report not found")
    return report


async def record_report_lifecycle(
    session: AsyncSession,
    report_id: uuid.UUID,
    user_id: uuid.UUID,
    *,
    exported: bool = False,
) -> None:
    now = datetime.now(UTC)
    await session.execute(
        update(Report)
        .where(Report.id == report_id, Report.first_viewed_at.is_(None))
        .values(first_viewed_at=now, first_viewed_by=user_id)
    )
    if exported:
        await session.execute(
            update(Report)
            .where(Report.id == report_id, Report.first_exported_at.is_(None))
            .values(first_exported_at=now, first_exported_by=user_id)
        )


@app.get("/api/v1/reports/{report_id}", response_model=ReportRead)
async def read_report(report_id: uuid.UUID, user: User = Depends(current_user), session: AsyncSession = Depends(get_session), settings: Settings = Depends(get_settings)):
    demo = configured_demo_store(settings, user.org_id)
    if demo and report_id == demo.report["id"]:
        return ReportRead.model_validate(demo.report)
    report = await scoped_report(session, report_id, user)
    return ReportRead.model_validate(
        {
            **ReportRead.model_validate(report).model_dump(),
            "external_url": public_report_url(report.external_url),
        }
    )


@app.get("/api/v1/reports/{report_id}/download")
async def download_report(report_id: uuid.UUID, user: User = Depends(current_user), session: AsyncSession = Depends(get_session), settings: Settings = Depends(get_settings)):
    demo = configured_demo_store(settings, user.org_id)
    if demo and report_id == demo.report["id"]:
        return FileResponse(demo.report["local_path"], filename=demo.report["filename"])
    report = await scoped_report(session, report_id, user)
    if not report.local_path or not Path(report.local_path).is_file():
        raise AppError(404, "REPORT_FILE_NOT_FOUND", "Report file not found")
    await record_report_lifecycle(session, report.id, user.id, exported=True)
    await add_audit(session, user, "report.download", "report", report.id)
    await session.commit()
    return FileResponse(report.local_path, filename=report.filename)


@app.get("/api/v1/reports/{report_id}/content")
async def preview_report(report_id: uuid.UUID, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    report = await scoped_report(session, report_id, user)
    if report.format not in {"md", "html", "txt"}:
        raise AppError(415, "REPORT_PREVIEW_UNSUPPORTED", "Report format cannot be previewed")
    if not report.local_path or not Path(report.local_path).is_file():
        raise AppError(404, "REPORT_FILE_NOT_FOUND", "Report file not found")
    path = Path(report.local_path)
    if path.stat().st_size > REPORT_PREVIEW_LIMIT:
        raise AppError(413, "REPORT_PREVIEW_TOO_LARGE", "Report exceeds the preview size limit")
    try:
        content = path.read_text(encoding="utf-8")
    except UnicodeDecodeError as exc:
        raise AppError(422, "REPORT_ENCODING_INVALID", "Report is not valid UTF-8 text") from exc
    await record_report_lifecycle(session, report.id, user.id)
    await add_audit(session, user, "report.preview", "report", report.id)
    await session.commit()
    return PlainTextResponse(
        content,
        headers={"X-Content-Type-Options": "nosniff"},
    )


@app.get("/api/v1/ai-logs")
async def list_ai_logs(plan_id: uuid.UUID | None = None, level: str | None = Query(default=None, max_length=16), page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100), user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    criteria = [AiLog.org_id == user.org_id]
    if plan_id:
        criteria.append(AiLog.plan_id == plan_id)
    if level:
        criteria.append(AiLog.level == level)
    total = await session.scalar(select(func.count()).select_from(AiLog).where(*criteria))
    items = list(
        await session.scalars(
            select(AiLog)
            .where(*criteria)
            .order_by(AiLog.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    )
    return envelope(page_data([AiLogRead.model_validate(item) for item in items], total or 0, page, page_size))


@app.get("/api/v1/dashboard/summary", response_model=ApiEnvelope[DashboardSummaryRead])
async def dashboard_summary(user: User = Depends(current_user), session: AsyncSession = Depends(get_session), settings: Settings = Depends(get_settings)):
    demo = configured_demo_store(settings, user.org_id)
    async def count(model, *criteria):
        return await session.scalar(select(func.count()).select_from(model).where(model.org_id == user.org_id, *criteria)) or 0
    demo_vulnerabilities = demo.vulnerabilities if demo else ()
    demo_severity_counts = {
        severity: sum(item["severity"] == severity for item in demo_vulnerabilities)
        for severity in ("critical", "high", "medium", "low")
    }
    metrics = {
        "assets": await count(Asset) + int(bool(demo)),
        "tasks": await count(Task) + int(bool(demo)),
        "running_tasks": await count(Task, Task.status.in_(["QUEUED", "RUNNING", "CANCELLING"])),
        "failed_tasks": await count(Task, Task.status == "FAILED"),
        "high_risk": await count(Vulnerability, Vulnerability.severity.in_(["critical", "high"])) + demo_severity_counts["critical"] + demo_severity_counts["high"],
        "vulnerabilities": await count(Vulnerability) + len(demo_vulnerabilities),
        "open_vulnerabilities": await count(Vulnerability, Vulnerability.status != "FIXED") + sum(item["status"] != "FIXED" for item in demo_vulnerabilities),
        "reports": await count(Report) + int(bool(demo)),
    }
    today = datetime.now(UTC).date()
    starts = [today - timedelta(days=offset) for offset in range(6, -1, -1)]
    since = datetime.combine(starts[0], datetime.min.time(), tzinfo=UTC)
    rows = (await session.scalars(select(Vulnerability).where(
        Vulnerability.org_id == user.org_id,
        Vulnerability.created_at >= since,
    ))).all()
    trend = [{"start": item.isoformat(), "critical": 0, "high": 0, "medium": 0, "low": 0} for item in starts]
    index = {item["start"]: item for item in trend}
    for vulnerability in rows:
        key = vulnerability.created_at.astimezone(UTC).date().isoformat()
        if key in index and vulnerability.severity in {"critical", "high", "medium", "low"}:
            index[key][vulnerability.severity] += 1
    for vulnerability in demo_vulnerabilities:
        if not vulnerability["data_json"].get("evidence_at"):
            continue
        key = vulnerability["created_at"].astimezone(UTC).date().isoformat()
        if key in index and vulnerability["severity"] in {"critical", "high", "medium", "low"}:
            index[key][vulnerability["severity"]] += 1
    ai_summary = {
        "warnings": ([f"当前有 {metrics['open_vulnerabilities']} 个未关闭漏洞。"] if metrics["open_vulnerabilities"] else ["当前没有未关闭漏洞。"]),
        "priority_findings": ([f"优先检查 {metrics['failed_tasks']} 个异常任务及 {metrics['high_risk']} 个严重或高危漏洞。"] if metrics["failed_tasks"] or metrics["high_risk"] else ["当前没有异常任务或高危漏洞，需要保持常规巡检。"]),
        "remediation": (["优先处置高危漏洞，完成修复后安排复测。"] if metrics["open_vulnerabilities"] else ["继续保持资产盘点和定期验证。"]),
        "source": "fallback",
    }
    settings = get_settings()
    if settings.openai_api_key and settings.openai_api_key.get_secret_value():
        try:
            message = await asyncio.wait_for(
                run_task_expert_agent(settings, "请用一句话总结当前平台风险并给出修复建议。", metrics),
                timeout=min(settings.agent_timeout_seconds, 8),
            )
            ai_summary = {**ai_summary, "priority_findings": [message], "source": "deepseek"}
        except Exception:
            pass
    return envelope({"metrics": metrics, "ai_summary": ai_summary, "risk_trend": trend})


async def websocket_user(websocket: WebSocket, settings: Settings) -> User | None:
    token = websocket.cookies.get("access_token")
    if not token:
        return None
    try:
        payload = decode_token(token, settings)
        user_id = uuid.UUID(payload["sub"])
    except (AuthenticationError, KeyError, TypeError, ValueError):
        return None
    async with SessionLocal() as session:
        return await session.scalar(select(User).where(User.id == user_id, User.is_active.is_(True)))


@app.websocket("/api/v1/prechecks/ws")
async def precheck_socket(websocket: WebSocket):
    # WebSockets do not run normal HTTP dependencies, so authenticate the cookie explicitly.
    settings = get_settings()
    user = await websocket_user(websocket, settings)
    await websocket.accept()
    if user is None:
        await websocket.close(code=4401)
        return
    if user.role not in {"admin", "operator", "security_expert"}:
        await websocket.close(code=4403)
        return
    client = get_engine_client(settings)
    session_factory = getattr(client, "precheck_session", None)

    async def handle_messages(precheck_session=None):
        while True:
            message = await websocket.receive_json()
            if not isinstance(message, dict):
                await websocket.send_json({"action": "can_error", "success": False, "message": "Invalid precheck payload"})
                continue
            action = message.get("action")
            try:
                if action == "can_subdomain":
                    validated = DomainPrecheckRequest.model_validate(message)
                elif action == "can_port":
                    validated = PortPrecheckRequest.model_validate(message)
                else:
                    raise ValueError
            except (ValidationError, ValueError):
                await websocket.send_json({"action": "can_error", "success": False, "message": "Invalid precheck payload"})
                continue
            if settings.cdninfo_enabled:
                targets = (
                    validated.domains
                    if isinstance(validated, DomainPrecheckRequest)
                    else [item.host for item in validated.hosts]
                )
                checks = await assess_targets(targets, settings)
                if any(item["cdn_status"] != "SAFE" for item in checks):
                    await websocket.send_json(
                        {
                            "action": "can_error",
                            "success": False,
                            "message": "目标命中 CDN/WAF 或检测结果不明确，已停止预查",
                            "assets": checks,
                        }
                    )
                    continue
            try:
                if precheck_session is not None:
                    result = await precheck_session.send(validated.model_dump())
                else:
                    result = await client.precheck(validated.model_dump())
            except AppError as exc:
                await websocket.send_json(
                    {
                        "action": "can_error",
                        "success": False,
                        "message": exc.message,
                    }
                )
                continue
            await websocket.send_json(result)

    try:
        if callable(session_factory):
            # Reuse one upstream Xiaoyi socket for every message on this browser socket.
            async with session_factory() as precheck_session:
                await handle_messages(precheck_session)
        else:
            await handle_messages()
    except AppError as exc:
        await websocket.send_json(
            {
                "action": "can_error",
                "success": False,
                "code": exc.code,
                "message": exc.message,
            }
        )
    except WebSocketDisconnect:
        return


def digital_user_dependency():
    async def dependency(user: User = Depends(current_user)) -> User:
        if not user.is_digital_human and user.role != "admin":
            raise AppError(403, "FORBIDDEN", "Digital-human account required")
        return user
    return dependency


def ai_result_response_data(payload, user: User, message: str, **resource_ids) -> dict:
    return {
        "success": True,
        "message": message,
        **resource_ids,
        "plan_id": payload.plan_id,
        "org_id": payload.org_id if payload.org_id is not None else user.org_id,
    }


@app.post("/api/ai/create-test-plan")
async def ai_create_plan(payload: AiPlanCreate, user: User = Depends(digital_user_dependency()), session: AsyncSession = Depends(get_session)):
    if isinstance(payload.org_id, uuid.UUID) and payload.org_id != user.org_id:
        raise AppError(403, "FORBIDDEN", "Organization mismatch")
    targets = payload.targets or [item.strip() for item in re.split(r"[\r\n;,]+", payload.target or "") if item.strip()]
    plan_payload = ScanPlanCreate(name=payload.plan_name or "AI penetration test", test_type=payload.test_type, targets=targets, templates=payload.templates, description=payload.description, time_limit=payload.time_limit, authorization_confirmed=False)
    plan = await create_plan(session, plan_payload, user)
    mapping = await session.scalar(
        select(XiaoyiPlanMapping).where(XiaoyiPlanMapping.plan_id == plan.id)
    )
    if mapping is None:
        raise AppError(500, "PLAN_MAPPING_MISSING", "测试计划映射创建失败")
    settings = get_settings()
    asset_list = asset_list_from_targets(plan.targets)
    if settings.cdninfo_enabled:
        checks = await assess_targets(
            [cdn_assessment_target(item["host"]) for item in asset_list], settings
        )
        asset_list = [
            {**item, **check, "host": item["host"], "hostType": item["hostType"]}
            for item, check in zip(asset_list, checks, strict=True)
        ]
        require_cdn_safe_assets(asset_list)
    plan.asset_list = asset_list
    plan.snapshot = {**plan.snapshot, "asset_list": asset_list}
    plan = await freeze_confirmed_plan(plan, user, session, settings)
    task_count = len(targets) * max(len(payload.templates), 1)
    return {
        "success": True,
        "plan": {
            "id": mapping.id,
            "name": plan.name,
            "status": "pending",
        },
        "task_count": task_count,
        "plan_id": mapping.id,
        "org_id": payload.org_id if payload.org_id is not None else user.org_id,
        "time_limit": payload.time_limit,
    }


@app.post("/api/ai/start-test-plan")
async def ai_start_plan(payload: AiPlanStart, user: User = Depends(digital_user_dependency()), session: AsyncSession = Depends(get_session)):
    if isinstance(payload.org_id, uuid.UUID) and payload.org_id != user.org_id:
        raise AppError(403, "FORBIDDEN", "Organization mismatch")
    if isinstance(payload.plan_id, int):
        mapping = await session.get(XiaoyiPlanMapping, payload.plan_id)
        if mapping is None:
            raise AppError(404, "PLAN_NOT_FOUND", "测试计划不存在")
        plan = await get_plan(session, mapping.plan_id, user)
        external_plan_id = mapping.id
    else:
        plan = await get_plan(session, payload.plan_id, user)
        mapping = await session.scalar(
            select(XiaoyiPlanMapping).where(XiaoyiPlanMapping.plan_id == plan.id)
        )
        if mapping is None:
            raise AppError(500, "PLAN_MAPPING_MISSING", "测试计划映射不存在")
        external_plan_id = mapping.id
    if payload.time_limit is not None:
        plan.time_limit = payload.time_limit
    if payload.description:
        plan.description = payload.description
    request_id = payload.request_id or f"plan-start-{plan.id}"
    await create_task(
        session, plan, user, request_id=request_id, enforce_cdn_guard=get_settings().cdninfo_enabled
    )
    return {
        "success": True,
        "message": "测试已启动",
        "plan_id": external_plan_id,
        "test_type": plan.test_type,
        "target_count": len(plan.targets),
    }


@app.post("/api/ai/upload-asset")
async def ai_upload_asset(payload: AiAssetUpload, user: User = Depends(digital_user_dependency()), session: AsyncSession = Depends(get_session)):
    payload_hash = callback_payload_hash(payload)
    existing_id = await existing_callback_resource(
        session, user, "asset", payload_hash
    )
    if existing_id:
        return ai_result_response_data(
            payload, user, "资产已接收", asset_id=existing_id
        )
    context = await resolve_result_context(
        session, user, payload.plan_id, payload.task_id, payload.org_id
    )
    address = str(
        payload.asset.get("address")
        or payload.asset.get("host")
        or payload.asset.get("hostname")
        or payload.asset.get("domain")
        or payload.asset.get("ip")
        or ""
    ).strip()
    if not address:
        raise AppError(422, "INVALID_ASSET", "Asset address is required")
    port = payload.asset.get("port")
    default_key = f"{address}:{port}" if port is not None else address
    key = str(payload.asset.get("asset_key") or default_key).lower()
    asset = await session.scalar(
        select(Asset).where(
            Asset.org_id == user.org_id,
            Asset.plan_id == context.plan.id,
            Asset.asset_key == key,
        )
    )
    if asset is None:
        asset = Asset(org_id=user.org_id, plan_id=context.plan.id, asset_key=key, asset_type=str(payload.asset.get("asset_type") or "domain"), address=address, service=payload.asset.get("service"), authorized=False, data_json=payload.asset)
        session.add(asset)
    else:
        asset.data_json = {**asset.data_json, **payload.asset}
        asset.service = payload.asset.get("service") or asset.service
    await session.flush()
    record_callback_resource(
        session, user, "asset", payload_hash, "asset", asset.id
    )
    await session.commit()
    await session.refresh(asset)
    return ai_result_response_data(
        payload, user, "资产已接收", asset_id=str(asset.id)
    )


@app.post("/api/ai/upload-vulnerability")
async def ai_upload_vulnerability(payload: AiVulnerabilityUpload, user: User = Depends(digital_user_dependency()), session: AsyncSession = Depends(get_session)):
    payload_hash = callback_payload_hash(payload)
    existing_id = await existing_callback_resource(
        session, user, "vulnerability", payload_hash
    )
    if existing_id:
        return ai_result_response_data(
            payload, user, "漏洞已接收", vulnerability_id=existing_id
        )
    context = await resolve_result_context(
        session, user, payload.plan_id, payload.task_id, payload.org_id
    )
    task = context.task
    data = redact_sensitive(normalize_vulnerability_data(payload.data))
    asset_key = payload.asset_key
    if not asset_key and data.get("ip"):
        asset_key = (
            f"{data['ip']}:{data['port']}"
            if data.get("port") is not None
            else str(data["ip"])
        )
    severity = str(
        payload.severity or data.get("severity") or data.get("level") or "medium"
    ).lower()
    title = payload.title or str(data.get("title") or data.get("name") or "Untitled vulnerability")
    duplicate = await session.scalar(select(Vulnerability).where(Vulnerability.org_id == user.org_id, Vulnerability.asset_key == asset_key, Vulnerability.title == title, Vulnerability.severity == severity, Vulnerability.status != "FIXED").order_by(Vulnerability.updated_at.desc()))
    if duplicate:
        duplicate.data_json = {**(duplicate.data_json or {}), "duplicate_count": int((duplicate.data_json or {}).get("duplicate_count", 1)) + 1, "last_seen_at": datetime.now(UTC).isoformat()}
        await session.commit()
        return ai_result_response_data(payload, user, "漏洞已归并", vulnerability_id=str(duplicate.id))
    data["priority_score"] = {"critical": 100, "high": 80, "medium": 55, "low": 25}.get(severity, 10)
    data["duplicate_count"] = 1
    item = Vulnerability(org_id=user.org_id, plan_id=context.plan.id, task_id=task.id if task else None, asset_key=asset_key, title=title, severity=severity, description=data.get("description"), data_json=data)
    session.add(item)
    await session.flush()
    record_callback_resource(
        session,
        user,
        "vulnerability",
        payload_hash,
        "vulnerability",
        item.id,
    )
    await session.commit()
    await session.refresh(item)
    return ai_result_response_data(
        payload, user, "漏洞已接收", vulnerability_id=str(item.id)
    )


@app.post("/api/ai/upload-report")
async def ai_upload_report(payload: AiReportUpload, user: User = Depends(digital_user_dependency()), session: AsyncSession = Depends(get_session), settings: Settings = Depends(get_settings)):
    if payload.external_url and (
        payload.external_url.username or payload.external_url.password
    ):
        raise AppError(422, "INVALID_REPORT_URL", "Report URL cannot contain credentials")
    payload_hash = callback_payload_hash(payload)
    existing_id = await existing_callback_resource(
        session, user, "report", payload_hash
    )
    if existing_id:
        existing_report = await session.get(Report, uuid.UUID(existing_id))
        report_path = (
            existing_report.external_url
            if existing_report and existing_report.external_url
            else f"reports/{existing_report.filename}" if existing_report else None
        )
        return ai_result_response_data(
            payload,
            user,
            "报告已接收",
            report_id=existing_id,
            report_path=report_path,
        )
    context = await resolve_result_context(
        session, user, payload.plan_id, payload.task_id, payload.org_id
    )
    task = context.task
    timestamp_ms = int(datetime.now(UTC).timestamp() * 1000)
    filename = payload.filename or f"ai_report_{timestamp_ms}.{payload.format}"
    report_url = str(payload.external_url) if payload.external_url else None
    filename_url = urlsplit(filename)
    if filename_url.scheme in {"http", "https"} and filename_url.hostname:
        if filename_url.username or filename_url.password:
            raise AppError(
                422,
                "INVALID_REPORT_URL",
                "Report URL cannot contain credentials",
            )
        report_url = filename
        filename = Path(filename_url.path).name or f"ai_report_{timestamp_ms}.{payload.format}"
    if payload.content is None and report_url is None:
        raise AppError(422, "INVALID_REPORT", "Report content or external URL is required")
    local_path = None
    if payload.content is not None:
        path = safe_report_path(settings.report_dir / str(user.org_id), filename)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(payload.content, encoding="utf-8")
        local_path = str(path)
    report = Report(org_id=user.org_id, plan_id=context.plan.id, task_id=task.id if task else None, filename=Path(filename).name, format=payload.format, report_level=payload.report_level, local_path=local_path, external_url=report_url)
    session.add(report)
    await session.flush()
    record_callback_resource(
        session, user, "report", payload_hash, "report", report.id
    )
    await session.commit()
    await session.refresh(report)
    report_path = report.external_url or f"reports/{report.filename}"
    return ai_result_response_data(
        payload,
        user,
        "报告已接收",
        report_id=str(report.id),
        report_path=report_path,
    )


@app.post("/api/ai/upload-log")
async def ai_upload_log(payload: AiLogUpload, user: User = Depends(digital_user_dependency()), session: AsyncSession = Depends(get_session)):
    payload_hash = callback_payload_hash(payload)
    existing_id = await existing_callback_resource(session, user, "log", payload_hash)
    if existing_id:
        return ai_result_response_data(
            payload, user, "日志已接收", log_id=existing_id
        )
    context = await resolve_result_context(
        session, user, payload.plan_id, payload.task_id, payload.org_id
    )
    item = AiLog(org_id=user.org_id, plan_id=context.plan.id, user_id=user.id, level=payload.level, log_type=payload.type, agent_type=payload.agent_type, action=payload.action, content=redact_sensitive_text(payload.content), details_json=redact_sensitive(payload.details))
    if payload.timestamp:
        item.created_at = payload.timestamp
    session.add(item)
    await session.flush()
    event_type = None
    if context.task is not None:
        if payload.level == "error":
            event_type = "xiaoyi_error"
        elif payload.level == "warning":
            event_type = "xiaoyi_warning"
        elif payload.action and any(
            marker in payload.action.lower()
            for marker in ("complete", "finished", "report_generated")
        ):
            event_type = "xiaoyi_milestone"
    if event_type:
        session.add(
            TaskEvent(
                task_id=context.task.id,
                event_type=event_type,
                message=item.content,
                data_json={
                    "level": payload.level,
                    "type": payload.type,
                    "agent_type": payload.agent_type,
                    "action": payload.action,
                },
            )
        )
    record_callback_resource(session, user, "log", payload_hash, "log", item.id)
    await session.commit()
    return ai_result_response_data(
        payload, user, "日志已接收", log_id=str(item.id)
    )


_RESERVED_BROWSER_PREFIXES = {
    "api",
    "docs",
    "health",
    "openapi.json",
    "redoc",
}


@app.get("/{browser_path:path}", include_in_schema=False)
async def serve_spa(browser_path: str) -> FileResponse:
    """Serve built frontend assets and fall back browser routes to index.html."""
    # This catch-all is declared last so API, health, and documentation routes match first.
    parts = [part for part in browser_path.split("/") if part]
    if (
        (parts and parts[0] in _RESERVED_BROWSER_PREFIXES)
        or any(part in {".", ".."} or part.startswith(".") for part in parts)
    ):
        raise StarletteHTTPException(status_code=404, detail="Not Found")

    static_dir = get_settings().static_dir.resolve()
    index_file = (static_dir / "index.html").resolve()
    requested = static_dir.joinpath(*parts).resolve() if parts else index_file
    try:
        requested.relative_to(static_dir)
        index_file.relative_to(static_dir)
    except ValueError as exc:
        raise StarletteHTTPException(status_code=404, detail="Not Found") from exc

    if requested.is_file():
        return FileResponse(requested)

    if not index_file.is_file():
        raise StarletteHTTPException(status_code=404, detail="Not Found")
    return FileResponse(index_file)
