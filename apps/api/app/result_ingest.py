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


@dataclass(frozen=True)
class ResultContext:
    plan: ScanPlan
    task: Task | None


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
    plan_id: uuid.UUID | int,
    task_id: uuid.UUID | str | None,
    org_id: uuid.UUID | int | None = None,
) -> ResultContext:
    if isinstance(org_id, uuid.UUID) and org_id != user.org_id:
        raise AppError(403, "FORBIDDEN", "Organization mismatch")
    if isinstance(plan_id, int):
        mapping = await session.get(XiaoyiPlanMapping, plan_id)
        if mapping is None:
            raise AppError(404, "PLAN_NOT_FOUND", "小易计划映射不存在")
        plan = await get_plan(session, mapping.plan_id, user)
    else:
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
    if task is not None and task.plan_id != plan.id:
        raise AppError(
            422,
            "TASK_PLAN_MISMATCH",
            "Task does not belong to the specified plan",
        )
    return ResultContext(plan=plan, task=task)
