import { z } from 'zod';
import type {
  AssetRecord,
  PageResult,
  ReportRecord,
  Severity,
  TaskRecord,
  TaskStatus,
  VulnerabilityRecord,
} from '../types';
import { apiRequest, apiTextRequest } from './client';
import { userSchema } from './schemas';

const uuid = z.string().uuid();
const timestamp = z.string();
const taskStatusFilterSchema = z.enum([
  'QUEUED', 'RUNNING', 'CANCELLING', 'SUCCEEDED', 'PARTIAL_SUCCEEDED', 'FAILED', 'CANCELLED',
]);
const assetTypeSchema = z.enum(['domain', 'ip', 'http', 'network_range', 'ip_port']);
const vulnerabilityStatusSchema = z.enum(['OPEN', 'FIXING', 'RETESTING', 'FIXED']);
const vulnerabilitySeverityFilterSchema = z.enum(['critical', 'high', 'medium', 'low', 'unknown']);
const overviewRangeSchema = z.enum(['today', '3d', '7d', 'all']);
export type TaskStatusCode = z.infer<typeof taskStatusFilterSchema>;
export type VulnerabilityStatusCode = z.infer<typeof vulnerabilityStatusSchema>;
export type VulnerabilitySeverityCode = z.infer<typeof vulnerabilitySeverityFilterSchema>;
export type OverviewRange = z.infer<typeof overviewRangeSchema>;

function pageEnvelope<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    success: z.literal(true),
    message: z.string(),
    data: z.object({
      items: z.array(item),
      total: z.number().int().nonnegative(),
      page: z.number().int().positive(),
      page_size: z.number().int().positive(),
    }),
  });
}

const taskSchema = z.object({
  id: uuid,
  plan_id: uuid,
  parent_id: uuid.nullable(),
  external_task_id: z.string().nullable(),
  name: z.string(),
  status: z.string(),
  phase: z.string(),
  progress: z.number(),
  sync_failures: z.number().int(),
  error_code: z.string().nullable(),
  error_message: z.string().nullable(),
  created_at: timestamp,
  updated_at: timestamp,
  plan_name: z.string(),
  test_type: z.string(),
  targets: z.array(z.string()),
  created_by_name: z.string(),
});

const assetSchema = z.object({
  id: uuid,
  plan_id: uuid.nullable(),
  asset_key: z.string(),
  asset_type: z.string(),
  address: z.string(),
  service: z.string().nullable(),
  owner: z.string().nullable(),
  authorized: z.boolean(),
  data_json: z.record(z.string(), z.unknown()),
  created_at: timestamp,
  updated_at: timestamp,
});

const vulnerabilityListSchema = z.object({
  id: uuid,
  plan_id: uuid,
  task_id: uuid.nullable(),
  asset_key: z.string().nullable(),
  title: z.string(),
  severity: z.string(),
  status: z.string(),
  description: z.string().nullable(),
  created_at: timestamp,
  updated_at: timestamp,
  task_name: z.string().nullable(),
  tags: z.array(z.string()),
});

const vulnerabilityDetailSchema = vulnerabilityListSchema
  .omit({ task_name: true, tags: true })
  .extend({ data_json: z.record(z.string(), z.unknown()) });

const reportSchema = z.object({
  id: uuid,
  plan_id: uuid,
  task_id: uuid.nullable(),
  filename: z.string(),
  format: z.string(),
  report_level: z.string().nullable(),
  external_url: z.string().nullable(),
  status: z.string(),
  created_at: timestamp,
  plan_name: z.string(),
  task_name: z.string().nullable(),
});

const trendPointSchema = z.object({ start: z.string(), count: z.number().int().nonnegative() });
const distributionItemSchema = z.object({
  key: z.string(), label: z.string(), count: z.number().int().nonnegative(),
});
const vulnerabilityOverviewSchema = z.object({
  success: z.literal(true),
  message: z.string(),
  data: z.object({
    range: overviewRangeSchema,
    timezone: z.string(),
    granularity: z.enum(['hour', 'day', 'month']),
    metrics: z.object({
      total: z.number().int().nonnegative(), critical: z.number().int().nonnegative(),
      high: z.number().int().nonnegative(), medium: z.number().int().nonnegative(),
      low: z.number().int().nonnegative(), unknown: z.number().int().nonnegative(),
      open: z.number().int().nonnegative(), retesting: z.number().int().nonnegative(),
      fixed: z.number().int().nonnegative(),
    }),
    risk_distribution: z.array(distributionItemSchema),
    source_distribution: z.array(distributionItemSchema),
    trend: z.array(trendPointSchema),
    recommendations: z.array(z.string()),
  }),
});
const reportOverviewSchema = z.object({
  success: z.literal(true),
  message: z.string(),
  data: z.object({
    range: overviewRangeSchema,
    timezone: z.string(),
    granularity: z.enum(['hour', 'day', 'month']),
    metrics: z.object({
      total: z.number().int().nonnegative(), ready: z.number().int().nonnegative(),
      partial: z.number().int().nonnegative(), recent_7d: z.number().int().nonnegative(),
      latest_at: timestamp.nullable(),
    }),
    source_distribution: z.array(distributionItemSchema),
    level_distribution: z.array(distributionItemSchema),
    trend: z.array(trendPointSchema),
    insights: z.array(z.string()),
  }),
});

export type TrendPoint = z.infer<typeof trendPointSchema>;
export type DistributionItem = z.infer<typeof distributionItemSchema>;

const organizationSchema = z.object({
  id: uuid,
  name: z.string(),
  created_at: timestamp,
  updated_at: timestamp,
});

const runtimeSettingsSchema = z.object({
  app_name: z.string(),
  engine_mode: z.string(),
  engine_configured: z.boolean(),
  engine_retry_limit: z.number().int().nonnegative(),
  sync_interval_seconds: z.number().int().positive(),
  report_storage: z.string(),
});

const runtimeSettingsEnvelope = z.object({
  success: z.literal(true),
  message: z.string(),
  data: runtimeSettingsSchema,
});

const auditLogSchema = z.object({
  id: uuid,
  actor_id: uuid,
  action: z.string(),
  resource_type: z.string(),
  resource_id: z.string(),
  outcome: z.string(),
  details_json: z.record(z.string(), z.unknown()),
  created_at: timestamp,
});

export type Organization = z.infer<typeof organizationSchema>;
export type RuntimeSettings = z.infer<typeof runtimeSettingsSchema>;
export type TeamUser = z.infer<typeof userSchema>;
export type AuditLog = z.infer<typeof auditLogSchema>;
export type UserRole = TeamUser['role'];

const taskStatuses: Record<string, TaskStatus> = {
  QUEUED: '排队中',
  RUNNING: '进行中',
  CANCELLING: '取消中',
  SUCCEEDED: '已完成',
  PARTIAL_SUCCEEDED: '部分完成',
  FAILED: '异常',
  CANCELLED: '已停止',
};

const vulnerabilityStatuses: Record<string, VulnerabilityRecord['status']> = {
  OPEN: '待修复',
  FIXING: '修复中',
  RETESTING: '待复测',
  FIXED: '已修复',
};

const severities: Record<string, Severity> = {
  critical: '严重',
  high: '高危',
  medium: '中危',
  low: '低危',
  unknown: '未知',
};

function result<T, R>(
  raw: { items: T[]; total: number; page: number; page_size: number },
  map: (item: T) => R,
): PageResult<R> {
  return {
    items: raw.items.map(map),
    total: raw.total,
    page: raw.page,
    pageSize: raw.page_size,
  };
}

function params(entries: Array<[string, string | number | undefined]>) {
  const query = new URLSearchParams();
  for (const [key, value] of entries) {
    if (value !== undefined) query.set(key, String(value));
  }
  return query.toString();
}

function mapTask(item: z.infer<typeof taskSchema>): TaskRecord {
  return {
    id: item.id,
    name: item.name,
    planName: item.plan_name,
    type: item.test_type === 'standard' ? '渗透测试' : item.test_type === 'discovery' ? '资产发现' : item.test_type,
    target: item.targets.join(', ') || '—',
    creator: item.created_by_name,
    createdAt: item.created_at,
    status: taskStatuses[item.status] ?? '未知',
    statusCode: item.status,
    phase: item.phase,
    progress: item.progress,
    errorMessage: item.error_message,
  };
}

function tagsFromData(data: Record<string, unknown>) {
  const tags = data.tags;
  return Array.isArray(tags) ? tags.filter((tag): tag is string => typeof tag === 'string') : [];
}

function mapAsset(item: z.infer<typeof assetSchema>): AssetRecord {
  return {
    id: item.id,
    key: item.asset_key,
    address: item.address,
    type: item.asset_type,
    service: item.service,
    owner: item.owner,
    authorized: item.authorized,
    tags: tagsFromData(item.data_json),
    createdAt: item.created_at,
    updatedAt: item.updated_at,
  };
}

function mapVulnerability(
  item: z.infer<typeof vulnerabilityListSchema>,
): VulnerabilityRecord {
  return {
    id: item.id,
    title: item.title,
    asset: item.asset_key ?? '—',
    task: item.task_name ?? '—',
    discoveredAt: item.created_at,
    updatedAt: item.updated_at,
    status: vulnerabilityStatuses[item.status] ?? '未知',
    statusCode: item.status,
    severity: severities[item.severity] ?? '未知',
    tags: item.tags,
    description: item.description,
  };
}

function mapReport(item: z.infer<typeof reportSchema>): ReportRecord {
  return {
    id: item.id,
    taskId: item.task_id,
    name: item.filename,
    format: item.format,
    plan: item.plan_name,
    task: item.task_name ?? '—',
    createdAt: item.created_at,
    status: item.status,
    externalUrl: item.external_url,
    previewSupported: ['md', 'html', 'txt'].includes(item.format.toLowerCase()),
  };
}

export async function listTasks(input: { status?: TaskStatusCode; page: number; pageSize: number }) {
  const status = taskStatusFilterSchema.optional().parse(input.status);
  const query = params([['status', status], ['page', input.page], ['page_size', input.pageSize]]);
  const response = await apiRequest(`/api/v1/tasks?${query}`, pageEnvelope(taskSchema));
  return result(response.data, mapTask);
}

export async function listAssets(input: { page: number; pageSize: number }) {
  const query = params([['page', input.page], ['page_size', input.pageSize]]);
  const response = await apiRequest(`/api/v1/assets?${query}`, pageEnvelope(assetSchema));
  return result(response.data, mapAsset);
}

export interface AssetCreateInput {
  asset_type: z.infer<typeof assetTypeSchema>;
  address: string;
  owner: string;
  authorized: boolean;
}

export async function createAsset(input: AssetCreateInput) {
  const payload = z.object({
    asset_type: assetTypeSchema,
    address: z.string().min(1),
    owner: z.string(),
    authorized: z.boolean(),
  }).parse(input);
  const response = await apiRequest('/api/v1/assets', assetSchema, { method: 'POST', body: payload });
  return mapAsset(response);
}

export async function listVulnerabilities(input: {
  severity?: VulnerabilitySeverityCode;
  status?: VulnerabilityStatusCode;
  taskId?: string;
  planId?: string;
  page: number;
  pageSize: number;
}) {
  const severity = vulnerabilitySeverityFilterSchema.optional().parse(input.severity);
  const status = vulnerabilityStatusSchema.optional().parse(input.status);
  const query = params([
    ['severity', severity],
    ['status', status],
    ['task_id', input.taskId],
    ['plan_id', input.planId],
    ['page', input.page],
    ['page_size', input.pageSize],
  ]);
  const response = await apiRequest(`/api/v1/vulnerabilities?${query}`, pageEnvelope(vulnerabilityListSchema));
  return result(response.data, mapVulnerability);
}

export async function updateVulnerability(id: string, status: VulnerabilityStatusCode) {
  const payload = z.object({ status: vulnerabilityStatusSchema }).parse({ status });
  const response = await apiRequest(`/api/v1/vulnerabilities/${id}`, vulnerabilityDetailSchema, {
    method: 'PATCH',
    body: payload,
  });
  return mapVulnerability({ ...response, task_name: null, tags: tagsFromData(response.data_json) });
}

export async function listReports(input: { taskId?: string; planId?: string; page: number; pageSize: number }) {
  const query = params([
    ['task_id', input.taskId], ['plan_id', input.planId], ['page', input.page], ['page_size', input.pageSize],
  ]);
  const response = await apiRequest(`/api/v1/reports?${query}`, pageEnvelope(reportSchema));
  return result(response.data, mapReport);
}

export async function getVulnerabilityOverview(input: { range: OverviewRange; timezone: string }) {
  const range = overviewRangeSchema.parse(input.range);
  const query = params([['range', range], ['timezone', input.timezone]]);
  const { data } = await apiRequest(`/api/v1/vulnerabilities/overview?${query}`, vulnerabilityOverviewSchema);
  return {
    range: data.range,
    timezone: data.timezone,
    granularity: data.granularity,
    metrics: data.metrics,
    riskDistribution: data.risk_distribution,
    sourceDistribution: data.source_distribution,
    trend: data.trend,
    recommendations: data.recommendations,
  };
}

export async function getReportOverview(input: { range: OverviewRange; timezone: string }) {
  const range = overviewRangeSchema.parse(input.range);
  const query = params([['range', range], ['timezone', input.timezone]]);
  const { data } = await apiRequest(`/api/v1/reports/overview?${query}`, reportOverviewSchema);
  return {
    range: data.range,
    timezone: data.timezone,
    granularity: data.granularity,
    metrics: {
      total: data.metrics.total,
      ready: data.metrics.ready,
      partial: data.metrics.partial,
      recent7d: data.metrics.recent_7d,
      latestAt: data.metrics.latest_at,
    },
    sourceDistribution: data.source_distribution,
    levelDistribution: data.level_distribution,
    trend: data.trend,
    insights: data.insights,
  };
}

export function previewReport(id: string) {
  return apiTextRequest(`/api/v1/reports/${id}/content`);
}

export function reportDownloadUrl(id: string) {
  return `/api/v1/reports/${id}/download`;
}

export function getOrganization() {
  return apiRequest('/api/v1/settings/organization', organizationSchema);
}

export async function getRuntimeSettings() {
  const response = await apiRequest('/api/v1/settings/runtime', runtimeSettingsEnvelope);
  return response.data;
}

export function updateOrganization(name: string) {
  return apiRequest('/api/v1/settings/organization', organizationSchema, {
    method: 'PATCH',
    body: { name: z.string().trim().min(1).max(120).parse(name) },
  });
}

export async function listUsers(input: { page: number; pageSize: number }) {
  const query = params([['page', input.page], ['page_size', input.pageSize]]);
  const response = await apiRequest(`/api/v1/users?${query}`, pageEnvelope(userSchema));
  return result(response.data, (item) => item);
}

const createUserSchema = z.object({
  username: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(120),
  password: z.string().min(8).max(256),
  role: z.enum(['admin', 'security_expert', 'operator', 'auditor']),
  is_digital_human: z.boolean(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

export function createUser(input: CreateUserInput) {
  return apiRequest('/api/v1/users', userSchema, {
    method: 'POST',
    body: createUserSchema.parse(input),
  });
}

const updateUserSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  role: z.enum(['admin', 'security_expert', 'operator', 'auditor']).optional(),
  is_active: z.boolean().optional(),
  is_digital_human: z.boolean().optional(),
});

export function updateUser(id: string, input: z.infer<typeof updateUserSchema>) {
  return apiRequest(`/api/v1/users/${uuid.parse(id)}`, userSchema, {
    method: 'PATCH',
    body: updateUserSchema.parse(input),
  });
}

export async function listAuditLogs(input: {
  action?: string;
  resourceType?: string;
  page: number;
  pageSize: number;
}) {
  const query = params([
    ['action', input.action],
    ['resource_type', input.resourceType],
    ['page', input.page],
    ['page_size', input.pageSize],
  ]);
  const response = await apiRequest(`/api/v1/audit-logs?${query}`, pageEnvelope(auditLogSchema));
  return result(response.data, (item) => item);
}
