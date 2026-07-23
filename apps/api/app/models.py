import uuid
from datetime import UTC, datetime

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


def utcnow() -> datetime:
    return datetime.now(UTC)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )


class Organization(Base, TimestampMixin):
    __tablename__ = "organizations"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(120), unique=True)


class User(Base, TimestampMixin):
    __tablename__ = "users"
    __table_args__ = (UniqueConstraint("org_id", "username"),)
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"), index=True)
    username: Mapped[str] = mapped_column(String(80))
    name: Mapped[str] = mapped_column(String(120))
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(32), default="operator")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_digital_human: Mapped[bool] = mapped_column(Boolean, default=False)


class Asset(Base, TimestampMixin):
    __tablename__ = "assets"
    __table_args__ = (UniqueConstraint("org_id", "asset_key"),)
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"), index=True)
    plan_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("scan_plans.id"), index=True)
    asset_key: Mapped[str] = mapped_column(String(512))
    asset_type: Mapped[str] = mapped_column(String(32))
    address: Mapped[str] = mapped_column(String(512))
    service: Mapped[str | None] = mapped_column(String(80))
    owner: Mapped[str | None] = mapped_column(String(120))
    authorized: Mapped[bool] = mapped_column(Boolean, default=False)
    data_json: Mapped[dict] = mapped_column(JSON, default=dict)


class ScanPlan(Base, TimestampMixin):
    __tablename__ = "scan_plans"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"), index=True)
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    name: Mapped[str] = mapped_column(String(200))
    test_type: Mapped[str] = mapped_column(String(32), default="standard")
    status: Mapped[str] = mapped_column(String(32), default="DRAFT")
    targets: Mapped[list] = mapped_column(JSON, default=list)
    asset_list: Mapped[list] = mapped_column(JSON, default=list)
    templates: Mapped[list] = mapped_column(JSON, default=list)
    description: Mapped[str | None] = mapped_column(Text)
    time_limit: Mapped[int | None] = mapped_column(Integer)
    snapshot: Mapped[dict] = mapped_column(JSON, default=dict)


class Task(Base, TimestampMixin):
    __tablename__ = "tasks"
    __table_args__ = (UniqueConstraint("org_id", "request_id"),)
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"), index=True)
    plan_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("scan_plans.id"), index=True)
    parent_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("tasks.id"), index=True)
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    request_id: Mapped[str] = mapped_column(String(80))
    external_task_id: Mapped[str | None] = mapped_column(String(160), unique=True)
    name: Mapped[str] = mapped_column(String(200))
    status: Mapped[str] = mapped_column(String(32), default="QUEUED", index=True)
    phase: Mapped[str] = mapped_column(String(32), default="INIT")
    progress: Mapped[float] = mapped_column(Float, default=0)
    sync_failures: Mapped[int] = mapped_column(Integer, default=0)
    error_code: Mapped[str | None] = mapped_column(String(80))
    error_message: Mapped[str | None] = mapped_column(Text)
    raw_external: Mapped[dict] = mapped_column(JSON, default=dict)


class TaskEvent(Base):
    __tablename__ = "task_events"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    task_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tasks.id"), index=True)
    event_type: Mapped[str] = mapped_column(String(64))
    message: Mapped[str] = mapped_column(Text)
    data_json: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class QAMessage(Base):
    __tablename__ = "qa_messages"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"), index=True)
    task_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tasks.id"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    role: Mapped[str] = mapped_column(String(16), default="user")
    content: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Vulnerability(Base, TimestampMixin):
    __tablename__ = "vulnerabilities"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"), index=True)
    plan_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("scan_plans.id"), index=True)
    task_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("tasks.id"), index=True)
    asset_key: Mapped[str | None] = mapped_column(String(512))
    title: Mapped[str] = mapped_column(String(300))
    severity: Mapped[str] = mapped_column(String(32), default="medium")
    status: Mapped[str] = mapped_column(String(32), default="OPEN")
    description: Mapped[str | None] = mapped_column(Text)
    data_json: Mapped[dict] = mapped_column(JSON, default=dict)


class Report(Base, TimestampMixin):
    __tablename__ = "reports"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"), index=True)
    plan_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("scan_plans.id"), index=True)
    task_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("tasks.id"), index=True)
    filename: Mapped[str] = mapped_column(String(255))
    format: Mapped[str] = mapped_column(String(16), default="md")
    report_level: Mapped[str | None] = mapped_column(String(32))
    local_path: Mapped[str | None] = mapped_column(String(1000))
    external_url: Mapped[str | None] = mapped_column(String(2000))
    status: Mapped[str] = mapped_column(String(32), default="READY")


class AiLog(Base):
    __tablename__ = "ai_logs"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"), index=True)
    plan_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("scan_plans.id"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    level: Mapped[str] = mapped_column(String(16), default="info")
    log_type: Mapped[str] = mapped_column(String(64), default="external")
    agent_type: Mapped[str] = mapped_column(String(64), default="ai_digital_human")
    action: Mapped[str | None] = mapped_column(String(120))
    content: Mapped[str] = mapped_column(Text)
    details_json: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class AuditLog(Base):
    __tablename__ = "audit_logs"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id"), index=True)
    actor_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    action: Mapped[str] = mapped_column(String(100))
    resource_type: Mapped[str] = mapped_column(String(64))
    resource_id: Mapped[str] = mapped_column(String(80))
    outcome: Mapped[str] = mapped_column(String(32), default="success")
    details_json: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
