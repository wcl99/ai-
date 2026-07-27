"""Expose the FastAPI HTTP/WebSocket boundary and assemble backend dependencies."""

import asyncio
import re
import uuid
from contextlib import asynccontextmanager, suppress
from pathlib import Path
from urllib.parse import urlsplit

from fastapi import Depends, FastAPI, Query, Request, Response, WebSocket, WebSocketDisconnect
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse
from pydantic import ValidationError
from sqlalchemy import and_, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.exceptions import HTTPException as StarletteHTTPException

from .auth import (
    AuthenticationError,
    create_token,
    current_user,
    decode_token,
    password_hash,
    require_roles,
)
from .config import Settings, get_settings
from .db import SessionLocal, get_session
from .engine import (
    get_engine_client,
    redact_sensitive,
    redact_sensitive_text,
    resolve_xiaoyi_org_id,
)
from .errors import AppError
from .models import AiLog, Asset, AuditLog, Organization, QAMessage, Report, ScanPlan, Task, TaskEvent, User, Vulnerability, XiaoyiPlanMapping
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
    AuditLogRead,
    AssetRead,
    AssetUpdate,
    LoginRequest,
    LoginResponse,
    OrganizationRead,
    OrganizationUpdate,
    PageData,
    DomainPrecheckRequest,
    PortPrecheckRequest,
    QAMessageCreate,
    QAMessageRead,
    ReportListRead,
    ReportRead,
    ScanPlanAssetUpdate,
    ScanPlanCreate,
    ScanPlanRead,
    TaskCreate,
    TaskEventRead,
    TaskListRead,
    TaskRead,
    UserCreate,
    UserRead,
    UserUpdate,
    VulnerabilityListRead,
    VulnerabilityRead,
    VulnerabilityUpdate,
)
from .services import add_audit, create_plan, create_task, get_plan, normalize_asset_list, safe_report_path
from .sync import sync_forever


def envelope(data=None, *, message="ok") -> dict:
    return {"success": True, "message": message, "data": data}


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
@app.exception_handler(AuthenticationError)
async def authentication_error_handler(_: Request, __: AuthenticationError):
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
async def app_error_handler(_: Request, exc: AppError):
    return JSONResponse(
        status_code=exc.status_code,
        content={"success": False, "code": exc.code, "message": exc.message, "details": exc.details},
    )


@app.exception_handler(RequestValidationError)
async def validation_error_handler(_: Request, exc: RequestValidationError):
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


@app.post("/api/v1/auth/login", response_model=LoginResponse)
@app.post("/api/auth/login", response_model=LoginResponse)
async def login(payload: LoginRequest, response: Response, session: AsyncSession = Depends(get_session), settings: Settings = Depends(get_settings)):
    # Before this body runs, FastAPI validates LoginRequest and resolves both dependencies.
    # A valid password becomes a signed JWT returned in JSON and an HTTP-only cookie.
    username = payload.username.strip().lower()
    query = select(User).where(User.username == username, User.is_active.is_(True))
    if payload.org_id:
        query = query.where(User.org_id == payload.org_id)
    users = list(await session.scalars(query.limit(2)))
    if len(users) != 1 or not password_hash.verify(payload.password, users[0].password_hash):
        raise AuthenticationError
    user = users[0]
    token = create_token(user, settings)
    response.set_cookie(
        "access_token",
        token,
        max_age=settings.jwt_ttl_seconds,
        httponly=True,
        samesite=settings.cookie_samesite,
        secure=settings.cookie_secure,
    )
    return LoginResponse(token=token, expires_in=settings.jwt_ttl_seconds, user=UserRead.model_validate(user))


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
async def list_assets(page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100), user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    where = Asset.org_id == user.org_id
    total = await session.scalar(select(func.count()).select_from(Asset).where(where))
    items = list(await session.scalars(select(Asset).where(where).order_by(Asset.created_at.desc(), Asset.id.desc()).offset((page - 1) * page_size).limit(page_size)))
    return envelope(page_data([AssetRead.model_validate(item) for item in items], total or 0, page, page_size))


@app.post("/api/v1/assets", response_model=AssetRead, status_code=201)
async def add_asset(payload: AssetCreate, user: User = Depends(require_roles("admin", "operator", "security_expert")), session: AsyncSession = Depends(get_session)):
    asset = Asset(org_id=user.org_id, plan_id=payload.plan_id, asset_key=payload.asset_key or payload.address.lower(), asset_type=payload.asset_type, address=payload.address, service=payload.service, owner=payload.owner, authorized=payload.authorized, data_json=payload.data)
    session.add(asset)
    await session.flush()
    await add_audit(session, user, "asset.create", "asset", asset.id)
    await session.commit()
    await session.refresh(asset)
    return asset


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
async def read_plan(plan_id: uuid.UUID, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    return await get_plan(session, plan_id, user)


@app.patch("/api/v1/scan-plans/{plan_id}/assets", response_model=ScanPlanRead)
async def update_plan_assets(plan_id: uuid.UUID, payload: ScanPlanAssetUpdate, user: User = Depends(require_roles("admin", "operator", "security_expert")), session: AsyncSession = Depends(get_session)):
    plan = await get_plan(session, plan_id, user)
    if plan.status != "DRAFT":
        raise AppError(409, "PLAN_NOT_DRAFT", "Scan plan assets can only be changed before confirmation")
    asset_list = normalize_asset_list(payload.asset_list)
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
    plan = await get_plan(session, plan_id, user)
    if plan.status == "READY":
        return plan
    if plan.status != "DRAFT":
        raise AppError(409, "PLAN_NOT_DRAFT", "只有草稿计划可以确认")
    mapping = await session.scalar(
        select(XiaoyiPlanMapping).where(XiaoyiPlanMapping.plan_id == plan.id)
    )
    if mapping is None:
        mapping = XiaoyiPlanMapping(plan_id=plan.id)
        session.add(mapping)
        await session.flush()
    plan.status = "READY"
    plan.snapshot = {
        **plan.snapshot,
        "authorization_confirmed": True,
        "confirmed_by": str(user.id),
        "xiaoyi_context": {
            "org_id": resolve_xiaoyi_org_id(settings),
            "user_id": settings.xiaoyi_user_id or user.username,
            "plan_id": mapping.id,
            "scan_mode": plan.test_type,
            "scan_speed": "quick",
            "download_intermediate_results": True,
        },
    }
    await add_audit(session, user, "plan.confirm", "scan_plan", plan.id)
    await session.commit()
    await session.refresh(plan)
    return plan


@app.get("/api/v1/tasks", response_model=ApiEnvelope[PageData[TaskListRead]])
async def list_tasks(
    status: str | None = Query(default=None, max_length=32),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
):
    criteria = [Task.org_id == user.org_id]
    if status:
        criteria.append(Task.status == status)
    plan_join = and_(Task.plan_id == ScanPlan.id, ScanPlan.org_id == user.org_id)
    creator_join = and_(Task.created_by == User.id, User.org_id == user.org_id)
    total = await session.scalar(
        select(func.count())
        .select_from(Task)
        .join(ScanPlan, plan_join)
        .join(User, creator_join)
        .where(*criteria)
    )
    rows = (
        await session.execute(
            select(Task, ScanPlan, User.name)
            .join(ScanPlan, plan_join)
            .join(User, creator_join)
            .where(*criteria)
            .order_by(Task.created_at.desc(), Task.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
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
    return envelope(page_data(items, total or 0, page, page_size))


@app.post("/api/v1/tasks", response_model=TaskRead, status_code=201)
async def add_task(payload: TaskCreate, user: User = Depends(require_roles("admin", "operator", "security_expert")), session: AsyncSession = Depends(get_session)):
    # The service creates an idempotent platform task; the background sync calls Xiaoyi.
    plan = await get_plan(session, payload.plan_id, user)
    return await create_task(session, plan, user, payload.request_id)


async def scoped_task(session: AsyncSession, task_id: uuid.UUID, user: User) -> Task:
    task = await session.scalar(select(Task).where(Task.id == task_id, Task.org_id == user.org_id))
    if task is None:
        raise AppError(404, "TASK_NOT_FOUND", "Task not found")
    return task


async def result_task(session: AsyncSession, task_id: uuid.UUID | None, plan_id: uuid.UUID, user: User) -> Task | None:
    if task_id is None:
        return None
    task = await scoped_task(session, task_id, user)
    if task.plan_id != plan_id:
        raise AppError(422, "TASK_PLAN_MISMATCH", "Task does not belong to the specified plan")
    return task


@app.get("/api/v1/tasks/{task_id}", response_model=TaskRead)
async def read_task(task_id: uuid.UUID, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    return await scoped_task(session, task_id, user)


@app.get("/api/v1/tasks/{task_id}/children")
async def task_children(task_id: uuid.UUID, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    await scoped_task(session, task_id, user)
    items = list(await session.scalars(select(Task).where(Task.parent_id == task_id, Task.org_id == user.org_id)))
    return envelope([TaskRead.model_validate(item) for item in items])


@app.get("/api/v1/tasks/{task_id}/tools")
async def task_tools(task_id: uuid.UUID, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    task = await scoped_task(session, task_id, user)
    if not task.external_task_id:
        return envelope([])
    client = get_engine_client(get_settings())
    return envelope(await client.get_tools(task.external_task_id))


@app.get("/api/v1/tasks/{task_id}/events")
async def task_events(task_id: uuid.UUID, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    await scoped_task(session, task_id, user)
    items = list(await session.scalars(select(TaskEvent).where(TaskEvent.task_id == task_id).order_by(TaskEvent.created_at)))
    return envelope([TaskEventRead.model_validate(item) for item in items])


@app.get("/api/v1/tasks/{task_id}/qa/messages")
async def task_qa_messages(task_id: uuid.UUID, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    await scoped_task(session, task_id, user)
    items = list(
        await session.scalars(
            select(QAMessage)
            .where(QAMessage.task_id == task_id, QAMessage.org_id == user.org_id)
            .order_by(QAMessage.created_at)
        )
    )
    return envelope([QAMessageRead.model_validate(item) for item in items])


@app.post("/api/v1/tasks/{task_id}/qa/messages", response_model=QAMessageRead, status_code=201)
async def add_task_qa_message(task_id: uuid.UUID, payload: QAMessageCreate, user: User = Depends(require_roles("admin", "operator", "security_expert")), session: AsyncSession = Depends(get_session)):
    await scoped_task(session, task_id, user)
    item = QAMessage(
        org_id=user.org_id,
        task_id=task_id,
        user_id=user.id,
        role="user",
        content=payload.content,
    )
    session.add(item)
    await session.flush()
    await add_audit(session, user, "task.qa_message.create", "task", task_id)
    await session.commit()
    await session.refresh(item)
    return item


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
    retried = await create_task(session, plan, user)
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


@app.get(
    "/api/v1/vulnerabilities",
    response_model=ApiEnvelope[PageData[VulnerabilityListRead]],
)
async def list_vulnerabilities(
    severity: str | None = None,
    status: str | None = None,
    task_id: uuid.UUID | None = None,
    plan_id: uuid.UUID | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
):
    criteria = [Vulnerability.org_id == user.org_id]
    if severity:
        criteria.append(Vulnerability.severity == severity)
    if status:
        criteria.append(Vulnerability.status == status)
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
            .offset((page - 1) * page_size)
            .limit(page_size)
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
    return envelope(page_data(items, total or 0, page, page_size))


@app.get("/api/v1/vulnerabilities/{vulnerability_id}", response_model=VulnerabilityRead)
async def read_vulnerability(vulnerability_id: uuid.UUID, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    item = await session.scalar(select(Vulnerability).where(Vulnerability.id == vulnerability_id, Vulnerability.org_id == user.org_id))
    if item is None:
        raise AppError(404, "VULNERABILITY_NOT_FOUND", "Vulnerability not found")
    return item


@app.patch("/api/v1/vulnerabilities/{vulnerability_id}", response_model=VulnerabilityRead)
async def update_vulnerability(vulnerability_id: uuid.UUID, payload: VulnerabilityUpdate, user: User = Depends(require_roles("admin", "operator", "security_expert")), session: AsyncSession = Depends(get_session)):
    item = await read_vulnerability(vulnerability_id, user, session)
    item.status = payload.status
    await add_audit(session, user, "vulnerability.update", "vulnerability", item.id, {"status": payload.status})
    await session.commit()
    await session.refresh(item)
    return item


@app.get("/api/v1/reports", response_model=ApiEnvelope[PageData[ReportListRead]])
async def list_reports(
    task_id: uuid.UUID | None = None,
    plan_id: uuid.UUID | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user: User = Depends(current_user),
    session: AsyncSession = Depends(get_session),
):
    criteria = [Report.org_id == user.org_id]
    if task_id:
        criteria.append(Report.task_id == task_id)
    if plan_id:
        criteria.append(Report.plan_id == plan_id)
    plan_join = and_(Report.plan_id == ScanPlan.id, ScanPlan.org_id == user.org_id)
    total = await session.scalar(
        select(func.count())
        .select_from(Report)
        .join(ScanPlan, plan_join)
        .where(*criteria)
    )
    rows = (
        await session.execute(
            select(Report, ScanPlan.name, Task.name)
            .join(ScanPlan, plan_join)
            .outerjoin(
                Task,
                and_(Report.task_id == Task.id, Task.org_id == user.org_id),
            )
            .where(*criteria)
            .order_by(Report.created_at.desc(), Report.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
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
    return envelope(page_data(items, total or 0, page, page_size))


async def scoped_report(session: AsyncSession, report_id: uuid.UUID, user: User) -> Report:
    report = await session.scalar(select(Report).where(Report.id == report_id, Report.org_id == user.org_id))
    if report is None:
        raise AppError(404, "REPORT_NOT_FOUND", "Report not found")
    return report


@app.get("/api/v1/reports/{report_id}", response_model=ReportRead)
async def read_report(report_id: uuid.UUID, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    report = await scoped_report(session, report_id, user)
    return ReportRead.model_validate(
        {
            **ReportRead.model_validate(report).model_dump(),
            "external_url": public_report_url(report.external_url),
        }
    )


@app.get("/api/v1/reports/{report_id}/download")
async def download_report(report_id: uuid.UUID, user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    report = await scoped_report(session, report_id, user)
    if not report.local_path or not Path(report.local_path).is_file():
        raise AppError(404, "REPORT_FILE_NOT_FOUND", "Report file not found")
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


@app.get("/api/v1/dashboard/summary")
async def dashboard_summary(user: User = Depends(current_user), session: AsyncSession = Depends(get_session)):
    async def count(model, *criteria):
        return await session.scalar(select(func.count()).select_from(model).where(model.org_id == user.org_id, *criteria)) or 0
    return envelope({"assets": await count(Asset), "running_tasks": await count(Task, Task.status.in_(["QUEUED", "RUNNING", "CANCELLING"])), "open_vulnerabilities": await count(Vulnerability, Vulnerability.status != "FIXED"), "reports": await count(Report)})


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
    except WebSocketDisconnect:
        return


def digital_user_dependency():
    async def dependency(user: User = Depends(current_user)) -> User:
        if not user.is_digital_human and user.role != "admin":
            raise AppError(403, "FORBIDDEN", "Digital-human account required")
        return user
    return dependency


@app.post("/api/ai/create-test-plan")
async def ai_create_plan(payload: AiPlanCreate, user: User = Depends(digital_user_dependency()), session: AsyncSession = Depends(get_session)):
    if payload.org_id and payload.org_id != user.org_id:
        raise AppError(403, "FORBIDDEN", "Organization mismatch")
    targets = payload.targets or [item.strip() for item in re.split(r"[\r\n;,]+", payload.target or "") if item.strip()]
    plan_payload = ScanPlanCreate(name=payload.plan_name or "AI penetration test", test_type=payload.test_type, targets=targets, templates=payload.templates, description=payload.description, time_limit=payload.time_limit, authorization_confirmed=False)
    plan = await create_plan(session, plan_payload, user)
    return envelope({"plan_id": str(plan.id), "status": plan.status})


@app.post("/api/ai/start-test-plan")
async def ai_start_plan(payload: AiPlanStart, user: User = Depends(digital_user_dependency()), session: AsyncSession = Depends(get_session)):
    if payload.org_id and payload.org_id != user.org_id:
        raise AppError(403, "FORBIDDEN", "Organization mismatch")
    plan = await get_plan(session, payload.plan_id, user)
    task = await create_task(session, plan, user)
    return envelope({"task_id": str(task.id), "status": task.status})


@app.post("/api/ai/upload-asset")
async def ai_upload_asset(payload: AiAssetUpload, user: User = Depends(digital_user_dependency()), session: AsyncSession = Depends(get_session)):
    await get_plan(session, payload.plan_id, user)
    address = str(payload.asset.get("address") or payload.asset.get("host") or payload.asset.get("domain") or "").strip()
    if not address:
        raise AppError(422, "INVALID_ASSET", "Asset address is required")
    key = str(payload.asset.get("asset_key") or address).lower()
    asset = await session.scalar(select(Asset).where(Asset.org_id == user.org_id, Asset.asset_key == key))
    if asset is None:
        asset = Asset(org_id=user.org_id, plan_id=payload.plan_id, asset_key=key, asset_type=str(payload.asset.get("asset_type") or "domain"), address=address, authorized=False, data_json=payload.asset)
        session.add(asset)
    else:
        asset.data_json = {**asset.data_json, **payload.asset}
    await session.commit()
    await session.refresh(asset)
    return envelope({"asset_id": str(asset.id)})


@app.post("/api/ai/upload-vulnerability")
async def ai_upload_vulnerability(payload: AiVulnerabilityUpload, user: User = Depends(digital_user_dependency()), session: AsyncSession = Depends(get_session)):
    await get_plan(session, payload.plan_id, user)
    task = await result_task(session, payload.task_id, payload.plan_id, user)
    data = redact_sensitive(payload.data)
    item = Vulnerability(org_id=user.org_id, plan_id=payload.plan_id, task_id=task.id if task else None, asset_key=payload.asset_key, title=payload.title or str(data.get("title") or data.get("name") or "Untitled vulnerability"), severity=payload.severity or str(data.get("severity") or "unknown").lower(), description=data.get("description"), data_json=data)
    session.add(item)
    await session.commit()
    await session.refresh(item)
    return envelope({"vulnerability_id": str(item.id)})


@app.post("/api/ai/upload-report")
async def ai_upload_report(payload: AiReportUpload, user: User = Depends(digital_user_dependency()), session: AsyncSession = Depends(get_session), settings: Settings = Depends(get_settings)):
    if payload.external_url and (
        payload.external_url.username or payload.external_url.password
    ):
        raise AppError(422, "INVALID_REPORT_URL", "Report URL cannot contain credentials")
    await get_plan(session, payload.plan_id, user)
    task = await result_task(session, payload.task_id, payload.plan_id, user)
    if payload.content is None and payload.external_url is None:
        raise AppError(422, "INVALID_REPORT", "Report content or external URL is required")
    filename = payload.filename or f"{payload.plan_id}.{payload.format}"
    local_path = None
    if payload.content is not None:
        path = safe_report_path(settings.report_dir / str(user.org_id), filename)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(payload.content, encoding="utf-8")
        local_path = str(path)
    report = Report(org_id=user.org_id, plan_id=payload.plan_id, task_id=task.id if task else None, filename=Path(filename).name, format=payload.format, report_level=payload.report_level, local_path=local_path, external_url=str(payload.external_url) if payload.external_url else None)
    session.add(report)
    await session.commit()
    await session.refresh(report)
    return envelope({"report_id": str(report.id)})


@app.post("/api/ai/upload-log")
async def ai_upload_log(payload: AiLogUpload, user: User = Depends(digital_user_dependency()), session: AsyncSession = Depends(get_session)):
    await get_plan(session, payload.plan_id, user)
    item = AiLog(org_id=user.org_id, plan_id=payload.plan_id, user_id=user.id, level=payload.level, log_type=payload.type, agent_type=payload.agent_type, action=payload.action, content=redact_sensitive_text(payload.content), details_json=redact_sensitive(payload.details))
    if payload.timestamp:
        item.created_at = payload.timestamp
    session.add(item)
    await session.commit()
    return envelope({"log_id": str(item.id)})


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
