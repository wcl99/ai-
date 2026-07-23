import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, field_validator

class ApiEnvelope[T](BaseModel):
    success: bool = True
    message: str = "ok"
    data: T


class PageData[T](BaseModel):
    items: list[T]
    total: int
    page: int
    page_size: int


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=80)
    password: str = Field(min_length=8, max_length=256)
    org_id: uuid.UUID | None = None


class UserRead(ORMModel):
    id: uuid.UUID
    org_id: uuid.UUID
    username: str
    name: str
    role: str
    is_active: bool
    is_digital_human: bool


UserRole = Literal["admin", "security_expert", "operator", "auditor"]


class UserCreate(BaseModel):
    username: str = Field(min_length=1, max_length=80, pattern=r"^[A-Za-z0-9_.-]+$")
    name: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=8, max_length=256)
    role: UserRole = "operator"
    is_digital_human: bool = False

    @field_validator("username", "name", mode="before")
    @classmethod
    def normalize_identity(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value


class UserUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    role: UserRole | None = None
    is_active: bool | None = None
    is_digital_human: bool | None = None

    @field_validator("name", mode="before")
    @classmethod
    def normalize_name(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value


class OrganizationRead(ORMModel):
    id: uuid.UUID
    name: str
    created_at: datetime
    updated_at: datetime


class OrganizationUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=120)

    @field_validator("name", mode="before")
    @classmethod
    def normalize_name(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value


class LoginResponse(BaseModel):
    success: bool = True
    token: str
    token_type: str = "Bearer"
    expires_in: int
    user: UserRead


AssetType = Literal["domain", "ip", "http", "network_range", "ip_port"]


class AssetCreate(BaseModel):
    asset_type: AssetType
    address: str = Field(min_length=1, max_length=512)
    asset_key: str | None = Field(default=None, max_length=512)
    service: str | None = Field(default=None, max_length=80)
    owner: str | None = Field(default=None, max_length=120)
    authorized: bool = False
    plan_id: uuid.UUID | None = None
    data: dict = Field(default_factory=dict)

    @field_validator("address")
    @classmethod
    def normalize_address(cls, value: str) -> str:
        value = value.strip()
        if any(char in value for char in "\r\n\x00"):
            raise ValueError("资产地址包含非法字符")
        return value


class AssetUpdate(BaseModel):
    authorized: bool | None = None
    owner: str | None = Field(default=None, max_length=120)


class AssetRead(ORMModel):
    id: uuid.UUID
    plan_id: uuid.UUID | None
    asset_key: str
    asset_type: str
    address: str
    service: str | None
    owner: str | None
    authorized: bool
    data_json: dict
    created_at: datetime
    updated_at: datetime


class ScanPlanCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    test_type: Literal["discovery", "standard"] = "standard"
    targets: list[str] = Field(min_length=1, max_length=64)
    asset_list: list[dict] = Field(default_factory=list, max_length=128)
    templates: list[str] = Field(default_factory=list, max_length=32)
    description: str | None = Field(default=None, max_length=4000)
    time_limit: int | None = Field(default=None, ge=1, le=1440)
    authorization_confirmed: bool = False


class ScanPlanRead(ORMModel):
    id: uuid.UUID
    name: str
    test_type: str
    status: str
    targets: list
    asset_list: list
    templates: list
    description: str | None
    time_limit: int | None
    snapshot: dict
    created_at: datetime


class TaskCreate(BaseModel):
    plan_id: uuid.UUID
    request_id: str | None = Field(default=None, min_length=8, max_length=80)


class TaskRead(ORMModel):
    id: uuid.UUID
    plan_id: uuid.UUID
    parent_id: uuid.UUID | None
    external_task_id: str | None
    name: str
    status: str
    phase: str
    progress: float
    sync_failures: int
    error_code: str | None
    error_message: str | None
    created_at: datetime
    updated_at: datetime


class TaskListRead(TaskRead):
    plan_name: str
    test_type: str
    targets: list[str]
    created_by_name: str


class TaskEventRead(ORMModel):
    id: uuid.UUID
    event_type: str
    message: str
    data_json: dict
    created_at: datetime


class QAMessageCreate(BaseModel):
    content: str = Field(min_length=1, max_length=10_000)

    @field_validator("content", mode="before")
    @classmethod
    def normalize_content(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value


class QAMessageRead(ORMModel):
    id: uuid.UUID
    task_id: uuid.UUID
    user_id: uuid.UUID
    role: str
    content: str
    created_at: datetime


class VulnerabilityUpdate(BaseModel):
    status: Literal["OPEN", "FIXING", "RETESTING", "FIXED"]


class VulnerabilityRead(ORMModel):
    id: uuid.UUID
    plan_id: uuid.UUID
    task_id: uuid.UUID | None
    asset_key: str | None
    title: str
    severity: str
    status: str
    description: str | None
    data_json: dict
    created_at: datetime
    updated_at: datetime


class VulnerabilityListRead(ORMModel):
    id: uuid.UUID
    plan_id: uuid.UUID
    task_id: uuid.UUID | None
    asset_key: str | None
    title: str
    severity: str
    status: str
    description: str | None
    created_at: datetime
    updated_at: datetime
    task_name: str | None
    tags: list[str]


class ReportRead(ORMModel):
    id: uuid.UUID
    plan_id: uuid.UUID
    task_id: uuid.UUID | None
    filename: str
    format: str
    report_level: str | None
    external_url: str | None
    status: str
    created_at: datetime


class ReportListRead(ReportRead):
    plan_name: str
    task_name: str | None


class AuditLogRead(ORMModel):
    id: uuid.UUID
    actor_id: uuid.UUID
    action: str
    resource_type: str
    resource_id: str
    outcome: str
    details_json: dict
    created_at: datetime


class AiLogRead(ORMModel):
    id: uuid.UUID
    plan_id: uuid.UUID
    user_id: uuid.UUID
    level: str
    log_type: str
    agent_type: str
    action: str | None
    content: str
    details_json: dict
    created_at: datetime


class AiPlanCreate(BaseModel):
    plan_name: str | None = Field(default=None, max_length=200)
    org_id: uuid.UUID | None = None
    test_type: Literal["discovery", "standard"] = "discovery"
    targets: list[str] | None = Field(default=None, max_length=64)
    target: str | None = Field(default=None, max_length=8000)
    templates: list[str] = Field(default_factory=list, max_length=32)
    concurrency_mode: str | None = Field(default=None, max_length=32)
    concurrency_count: int | None = Field(default=None, ge=1, le=20)
    time_limit: int | None = Field(default=None, ge=1, le=1440)
    description: str | None = Field(default=None, max_length=4000)


class AiPlanStart(BaseModel):
    plan_id: uuid.UUID
    org_id: uuid.UUID | None = None
    time_limit: int | None = Field(default=None, ge=1, le=1440)
    description: str | None = Field(default=None, max_length=4000)


class AiAssetUpload(BaseModel):
    plan_id: uuid.UUID
    org_id: uuid.UUID | None = None
    asset: dict


class AiVulnerabilityUpload(BaseModel):
    plan_id: uuid.UUID
    task_id: uuid.UUID | None = None
    org_id: uuid.UUID | None = None
    asset_key: str | None = Field(default=None, max_length=512)
    severity: Literal["critical", "high", "medium", "low", "unknown"] | None = None
    title: str | None = Field(default=None, max_length=300)
    data: dict


class AiReportUpload(BaseModel):
    plan_id: uuid.UUID
    task_id: uuid.UUID | None = None
    org_id: uuid.UUID | None = None
    format: Literal["md", "html", "txt"] = "md"
    report_level: str | None = Field(default=None, max_length=32)
    filename: str | None = Field(default=None, max_length=255)
    external_url: HttpUrl | None = None
    content: str | None = Field(default=None, max_length=5_000_000)


class AiLogUpload(BaseModel):
    plan_id: uuid.UUID
    org_id: uuid.UUID | None = None
    timestamp: datetime | None = None
    level: Literal["debug", "info", "warning", "error"] = "info"
    type: str = Field(default="external", max_length=64)
    agent_type: str = Field(default="ai_digital_human", max_length=64)
    action: str | None = Field(default=None, max_length=120)
    details: dict = Field(default_factory=dict)
    content: str = Field(min_length=1, max_length=100_000)
