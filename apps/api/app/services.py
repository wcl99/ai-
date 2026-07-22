import uuid
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .errors import AppError
from .models import AuditLog, ScanPlan, Task, TaskEvent, User
from .schemas import ScanPlanCreate


async def get_plan(session: AsyncSession, plan_id: uuid.UUID, user: User) -> ScanPlan:
    plan = await session.scalar(
        select(ScanPlan).where(ScanPlan.id == plan_id, ScanPlan.org_id == user.org_id)
    )
    if plan is None:
        raise AppError(404, "PLAN_NOT_FOUND", "扫描计划不存在")
    return plan


async def create_plan(
    session: AsyncSession, payload: ScanPlanCreate, user: User
) -> ScanPlan:
    targets = [item.strip() for item in payload.targets if item.strip()]
    if not targets:
        raise AppError(422, "INVALID_TARGET", "至少需要一个有效目标")
    status = "READY" if payload.authorization_confirmed else "DRAFT"
    snapshot = {
        "test_type": payload.test_type,
        "targets": targets,
        "asset_list": payload.asset_list,
        "templates": payload.templates,
        "description": payload.description,
        "time_limit": payload.time_limit,
        "authorization_confirmed": payload.authorization_confirmed,
    }
    plan = ScanPlan(
        org_id=user.org_id,
        created_by=user.id,
        name=payload.name,
        test_type=payload.test_type,
        status=status,
        targets=targets,
        asset_list=payload.asset_list,
        templates=payload.templates,
        description=payload.description,
        time_limit=payload.time_limit,
        snapshot=snapshot,
    )
    session.add(plan)
    await session.flush()
    await add_audit(session, user, "plan.create", "scan_plan", plan.id)
    await session.commit()
    await session.refresh(plan)
    return plan


async def create_task(
    session: AsyncSession, plan: ScanPlan, user: User, request_id: str | None = None
) -> Task:
    if plan.status != "READY":
        raise AppError(409, "PLAN_NOT_READY", "扫描计划尚未确认授权范围")
    request_id = request_id or str(uuid.uuid4())
    existing = await session.scalar(select(Task).where(Task.request_id == request_id))
    if existing:
        if existing.org_id != user.org_id:
            raise AppError(403, "FORBIDDEN", "幂等键不属于当前组织")
        return existing
    task = Task(
        org_id=user.org_id,
        plan_id=plan.id,
        created_by=user.id,
        request_id=request_id,
        name=plan.name,
        status="QUEUED",
        phase="INIT",
    )
    session.add(task)
    await session.flush()
    session.add(TaskEvent(task_id=task.id, event_type="created", message="平台任务已创建"))
    await add_audit(session, user, "task.create", "task", task.id)
    await session.commit()
    await session.refresh(task)
    return task


async def add_audit(
    session: AsyncSession,
    user: User,
    action: str,
    resource_type: str,
    resource_id: uuid.UUID | str,
    details: dict | None = None,
) -> None:
    session.add(
        AuditLog(
            org_id=user.org_id,
            actor_id=user.id,
            action=action,
            resource_type=resource_type,
            resource_id=str(resource_id),
            details_json=details or {},
        )
    )


def safe_report_path(root: Path, filename: str) -> Path:
    safe_name = Path(filename).name
    if not safe_name or safe_name in {".", ".."}:
        raise AppError(422, "INVALID_REPORT_FILENAME", "报告文件名无效")
    root = root.resolve()
    path = (root / safe_name).resolve()
    if path.parent != root:
        raise AppError(422, "INVALID_REPORT_FILENAME", "报告文件路径无效")
    return path
