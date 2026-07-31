"""Resolve Xiaoyi callback identities to platform-owned result context."""

import hashlib
import json
import uuid
from dataclasses import dataclass

from pydantic import BaseModel
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from .errors import AppError
from .models import AiCallbackReceipt, ScanPlan, Task, User, XiaoyiPlanMapping
from .services import get_plan


ACTIVE_TASK_STATUSES = {"QUEUED", "RUNNING", "CANCELLING"}
VULNERABILITY_ALIASES = {
    "http_url": (
        "url",
        "target_url",
        "vuln_url",
        "endpoint",
        "uri",
        "request_url",
        "path",
    ),
    "http_method": ("method", "verb"),
    "payload": ("attack_payload", "exploit_payload", "request_payload", "poc"),
    "http_request": ("request_raw", "request_packet", "raw_request", "request"),
    "http_response": (
        "response_raw",
        "response_packet",
        "raw_response",
        "response",
    ),
}


@dataclass(frozen=True)
class ResultContext:
    plan: ScanPlan
    task: Task | None


def normalize_vulnerability_data(data: dict) -> dict:
    normalized = dict(data)
    for canonical, aliases in VULNERABILITY_ALIASES.items():
        if normalized.get(canonical) not in (None, ""):
            continue
        for alias in aliases:
            value = normalized.get(alias)
            if value not in (None, ""):
                normalized[canonical] = value
                break
    return normalized


def callback_payload_hash(payload: BaseModel) -> str:
    encoded = json.dumps(
        payload.model_dump(mode="json"),
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


async def existing_callback_resource(
    session: AsyncSession,
    user: User,
    result_type: str,
    payload_hash: str,
) -> str | None:
    receipt = await session.scalar(
        select(AiCallbackReceipt).where(
            AiCallbackReceipt.org_id == user.org_id,
            AiCallbackReceipt.result_type == result_type,
            AiCallbackReceipt.payload_hash == payload_hash,
        )
    )
    return receipt.resource_id if receipt else None


def record_callback_resource(
    session: AsyncSession,
    user: User,
    result_type: str,
    payload_hash: str,
    resource_type: str,
    resource_id: uuid.UUID | str,
) -> None:
    session.add(
        AiCallbackReceipt(
            org_id=user.org_id,
            result_type=result_type,
            payload_hash=payload_hash,
            resource_type=resource_type,
            resource_id=str(resource_id),
        )
    )


async def resolve_result_context(
    session: AsyncSession,
    user: User,
    plan_id: uuid.UUID | int | None,
    task_id: uuid.UUID | str | None,
    org_id: uuid.UUID | int | None = None,
) -> ResultContext:
    if isinstance(org_id, uuid.UUID) and org_id != user.org_id:
        raise AppError(403, "FORBIDDEN", "Organization mismatch")
    plan = None
    if isinstance(plan_id, int):
        mapping = await session.get(XiaoyiPlanMapping, plan_id)
        if mapping is None:
            raise AppError(404, "PLAN_NOT_FOUND", "小易计划映射不存在")
        plan = await get_plan(session, mapping.plan_id, user)
    elif isinstance(plan_id, uuid.UUID):
        plan = await get_plan(session, plan_id, user)

    task = None
    if isinstance(task_id, uuid.UUID):
        task = await session.scalar(
            select(Task).where(Task.id == task_id, Task.org_id == user.org_id)
        )
    elif task_id:
        identity_filters = [Task.external_task_id == task_id]
        try:
            identity_filters.append(Task.id == uuid.UUID(task_id))
        except ValueError:
            pass
        task = await session.scalar(
            select(Task).where(
                Task.org_id == user.org_id,
                or_(*identity_filters),
            )
        )
    if task_id is not None and task is None:
        raise AppError(404, "TASK_NOT_FOUND", "回传任务不存在")
    if task is not None and plan is not None and task.plan_id != plan.id:
        raise AppError(
            422,
            "TASK_PLAN_MISMATCH",
            "Task does not belong to the specified plan",
        )
    if task is not None and plan is None:
        plan = await get_plan(session, task.plan_id, user)

    if task is None and plan is not None:
        task = await session.scalar(
            select(Task)
            .where(
                Task.org_id == user.org_id,
                Task.plan_id == plan.id,
                Task.parent_id.is_(None),
            )
            .order_by(
                Task.status.in_(ACTIVE_TASK_STATUSES).desc(),
                Task.created_at.desc(),
            )
            .limit(1)
        )

    if task is None and plan is None:
        active_tasks = list(
            await session.scalars(
                select(Task)
                .where(
                    Task.org_id == user.org_id,
                    Task.parent_id.is_(None),
                    Task.status.in_(ACTIVE_TASK_STATUSES),
                )
                .order_by(Task.created_at.desc())
                .limit(2)
            )
        )
        if len(active_tasks) > 1:
            raise AppError(
                409,
                "AMBIGUOUS_TASK",
                "存在多个运行中的任务，无法确定回传归属",
            )
        if not active_tasks:
            raise AppError(404, "TASK_NOT_FOUND", "当前没有可接收回传的任务")
        task = active_tasks[0]
        plan = await get_plan(session, task.plan_id, user)

    if plan is None:
        raise AppError(404, "PLAN_NOT_FOUND", "回传计划不存在")
    return ResultContext(plan=plan, task=task)
