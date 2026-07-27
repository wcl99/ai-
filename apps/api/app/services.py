"""Implement business rules shared by HTTP routes and digital-human endpoints."""

import json
import uuid
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from .errors import AppError
from .engine import _contains_deprecated_fields
from .models import AuditLog, ScanPlan, Task, TaskEvent, User
from .schemas import ScanPlanCreate


def _host_type_for_target(target: str) -> str:
    return "ip" if target.replace(".", "").isdigit() else "domain"


def normalize_asset_list(asset_list: list[dict]) -> list[dict]:
    normalized = []
    seen = set()
    for item in asset_list:
        if not isinstance(item, dict):
            raise AppError(422, "INVALID_ASSET_LIST", "Asset list item must be an object")
        host = str(
            item.get("host") or item.get("domain") or item.get("address") or ""
        ).strip().lower()
        if not host:
            raise AppError(422, "INVALID_ASSET_LIST", "Asset host is required")
        host_type = str(item.get("hostType") or item.get("asset_type") or "domain").strip()
        if host_type not in {"domain", "ip"}:
            raise AppError(422, "INVALID_ASSET_LIST", "Asset hostType must be domain or ip")
        ports = item.get("ports", [])
        key = (host, host_type, json.dumps(ports, sort_keys=True, default=str))
        if key in seen:
            continue
        seen.add(key)
        normalized.append({**item, "host": host, "hostType": host_type})
    if not normalized:
        raise AppError(422, "INVALID_ASSET_LIST", "Asset list cannot be empty")
    return normalized


def asset_list_from_targets(targets: list[str]) -> list[dict]:
    return normalize_asset_list(
        [{"host": target, "hostType": _host_type_for_target(target)} for target in targets]
    )


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
    # Store a snapshot beside editable columns so the later task has a complete input record.
    targets = [item.strip() for item in payload.targets if item.strip()]
    if not targets:
        raise AppError(422, "INVALID_TARGET", "至少需要一个有效目标")
    status = "READY" if payload.authorization_confirmed else "DRAFT"
    asset_list = normalize_asset_list(payload.asset_list) if payload.asset_list else []
    snapshot = {
        "test_type": payload.test_type,
        "targets": targets,
        "asset_list": asset_list,
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
        asset_list=asset_list,
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
    # This service owns readiness, payload, and idempotency invariants as one transaction.
    if plan.status != "READY":
        raise AppError(409, "PLAN_NOT_READY", "扫描计划尚未确认授权范围")
    if _contains_deprecated_fields(plan.snapshot):
        raise AppError(
            400,
            "INVALID_ENGINE_PAYLOAD",
            "Scan plan snapshot contains deprecated Xiaoyi fields",
        )
    asset_list = plan.snapshot.get("asset_list") or plan.asset_list
    if asset_list:
        asset_list = normalize_asset_list(asset_list)
    else:
        asset_list = asset_list_from_targets(plan.targets)
    plan.asset_list = asset_list
    plan.snapshot = {**plan.snapshot, "asset_list": asset_list}
    request_id = request_id or str(uuid.uuid4())
    query = select(Task).where(
        Task.org_id == user.org_id,
        Task.request_id == request_id,
    )
    existing = await session.scalar(query)
    if existing:
        # Retrying the same request returns the original task instead of launching twice.
        if existing.plan_id != plan.id:
            raise AppError(
                409,
                "IDEMPOTENCY_CONFLICT",
                "Request ID is already bound to another scan plan",
            )
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
    try:
        await session.flush()
    except IntegrityError:
        await session.rollback()
        existing = await session.scalar(query)
        if existing is None:
            raise
        if existing.plan_id != plan.id:
            raise AppError(
                409,
                "IDEMPOTENCY_CONFLICT",
                "Request ID is already bound to another scan plan",
            ) from None
        return existing
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
