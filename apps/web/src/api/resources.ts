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
import { sanitizeDisplayText } from '../vendorDisplay';

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
  first_viewed_at: timestamp.nullable().optional(),
  first_viewed_by: uuid.nullable().optional(),
  first_exported_at: timestamp.nullable().optional(),
  first_exported_by: uuid.nullable().optional(),
  created_at: timestamp,
  plan_name: z.string(),
  task_name: z.string().nullable(),
});

const trendPointSchema = z.object({ start: z.string(), count: z.number().int().nonnegative() });
const distributionItemSchema = z.object({
  key: z.string(), label: z.string(), count: z.number().int().nonnegative(),
});

const taskRiskSummarySchema = z.object({
  task_id: uuid,
  vulnerabilities: z.array(z.object({
    id: uuid,
    title: z.string(),
    severity: z.string(),
    status: z.string(),
    asset_key: z.string().nullable(),
    description: z.string().nullable(),
    cvss_score: z.number().min(0).max(10).nullable(),
  })),
  score: z.number().min(0).max(10).nullable(),
  level: z.string(),
  rationale: z.string(),
  source: z.enum(['deepseek', 'platform', 'unavailable']),
  message: z.string().nullable(),
});
const taskListEnvelope = pageEnvelope(taskSchema).extend({
  data: pageEnvelope(taskSchema).shape.data.extend({
    metrics: z.object({
      total: z.number().int().nonnegative(),
      queued: z.number().int().nonnegative(),
      running: z.number().int().nonnegative(),
      completed: z.number().int().nonnegative(),
      failed: z.number().int().nonnegative(),
      cancelled: z.number().int().nonnegative(),
    }).optional(),
  }),
});
const dashboardSummarySchema = z.object({
  success: z.literal(true),
  message: z.string(),
  data: z.object({
    metrics: z.record(z.string(), z.number().int().nonnegative()),
    ai_summary: z.object({
      warnings: z.array(z.string()),
      priority_findings: z.array(z.string()),
      remediation: z.array(z.string()),
      source: z.enum(['deepseek', 'fallback']),
    }),
    risk_trend: z.array(z.object({
      start: z.string(),
      critical: z.number().int().nonnegative(),
      high: z.number().int().nonnegative(),
      medium: z.number().int().nonnegative(),
      low: z.number().int().nonnegative(),
    })),
  }),
});
const vulnerabilityOverviewSchema = z.object({
  success: z.literal(true), message: z.string(), data: z.object({
    range: overviewRangeSchema, timezone: z.string(), granularity: z.enum(['hour','day','month']),
    metrics: z.object({ total:z.number(), critical:z.number(), high:z.number(), medium:z.number(), low:z.number(), unknown:z.number(), open:z.number(), retesting:z.number(), fixed:z.number() }),
    risk_distribution:z.array(distributionItemSchema), source_distribution:z.array(distributionItemSchema), trend:z.array(trendPointSchema), recommendations:z.array(z.string())
  })
});
const reportOverviewSchema = z.object({
  success: z.literal(true),
  message: z.string(),
  data: z.object({
    range: overviewRangeSchema,
    timezone: z.string(),
    granularity: z.enum(['hour', 'day', 'month']),
    metrics: z.object({
      total: z.object({ value: z.number().int().nonnegative(), change_percent: z.number().finite().nullable() }),
      monthly_new: z.object({ value: z.number().int().nonnegative(), change_percent: z.number().finite().nullable() }),
      pending_export: z.object({ value: z.number().int().nonnegative(), change_percent: z.number().finite().nullable() }),
      exported: z.object({ value: z.number().int().nonnegative(), change_percent: z.number().finite().nullable() }),
      pending_confirmation: z.object({ value: z.number().int().nonnegative(), change_percent: z.number().finite().nullable() }),
      monthly_delivered: z.object({ value: z.number().int().nonnegative(), change_percent: z.number().finite().nullable() }),
    }),
    source_distribution: z.array(distributionItemSchema),
    risk_distribution: z.array(distributionItemSchema),
    trend: z.array(trendPointSchema),
    latest_reports: z.array(z.object({
      id: uuid, filename: z.string(), source: z.string(), source_label: z.string(),
      creator_name: z.string(), created_at: timestamp,
    })),
    recent_exports: z.array(z.object({
      id: uuid, filename: z.string(), source: z.string(), source_label: z.string(),
      format: z.string(), exporter_name: z.string(), status: z.string(), exported_at: timestamp,
    })),
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
    updatedAt: item.updated_at,
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
    firstViewedAt: item.first_viewed_at ?? null,
    firstExportedAt: item.first_exported_at ?? null,
  };
}

export async function listTasks(input: { status?: TaskStatusCode; keyword?: string; testType?: string; creator?: string; createdFrom?: string; createdTo?: string; page: number; pageSize: number }) {
  const status = taskStatusFilterSchema.optional().parse(input.status);
  const query = params([['status', status], ['keyword', input.keyword], ['test_type', input.testType], ['creator', input.creator], ['created_from', input.createdFrom], ['created_to', input.createdTo], ['page', input.page], ['page_size', input.pageSize]]);
  const response = await apiRequest(`/api/v1/tasks?${query}`, taskListEnvelope);
  return { ...result(response.data, mapTask), metrics: response.data.metrics };
}

export async function getTaskRiskSummary(id: string) {
  const response = await apiRequest(`/api/v1/tasks/${uuid.parse(id)}/risk-summary`, taskRiskSummarySchema);
  return response;
}

export async function stopTask(id: string) {
  return apiRequest(`/api/v1/tasks/${uuid.parse(id)}/stop`, taskSchema, { method: 'POST' });
}

export async function deleteTask(id: string) {
  return apiRequest(`/api/v1/tasks/${uuid.parse(id)}`, z.object({
    success: z.literal(true), message: z.string(), data: z.null(),
  }), { method: 'DELETE' });
}

export async function getVulnerability(id: string) {
  const response = await apiRequest(`/api/v1/vulnerabilities/${uuid.parse(id)}`, vulnerabilityDetailSchema);
  const base = mapVulnerability({ ...response, task_name: null, tags: tagsFromData(response.data_json) });
  const text = (key: string) => typeof response.data_json[key] === 'string' ? response.data_json[key] as string : null;
  const textFrom = (...keys: string[]) => keys.map(text).find((value): value is string => Boolean(value)) ?? null;
  const booleanFrom = (...keys: string[]) => {
    const value = keys.map((key) => response.data_json[key]).find((entry) => typeof entry === 'boolean');
    return typeof value === 'boolean' ? value : null;
  };
  const numberFrom = (...keys: string[]) => {
    const value = keys.map((key) => response.data_json[key]).find((entry) => typeof entry === 'number');
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  };
  return {
    ...base,
    sourceTool: text('source_tool'),
    url: text('http_url') ?? text('url'),
    httpMethod: text('http_method'),
    payload: text('payload'),
    httpRequest: text('http_request') ?? text('request_example'),
    httpResponse: text('http_response') ?? text('response_example'),
    aiRiskSummary: textFrom('ai_risk_summary', 'risk_summary', 'ai_summary'),
    remediation: text('vuln_suggestions') ?? text('remediation') ?? text('recommendation'),
    assigneeName: textFrom('assignee_name', 'assignee', 'owner_name', 'responsible_person'),
    dueDate: textFrom('due_date', 'deadline', 'repair_deadline', 'fix_deadline'),
    teamName: textFrom('team_name', 'team', 'owner_team'),
    businessName: textFrom('business_name', 'business', 'business_line'),
    reportStatus: textFrom('report_status', 'report_link_status'),
    manualRetest: booleanFrom('manual_retest', 'requires_manual_retest'),
    cvssScore: numberFrom('cvss_score', 'cvss'),
    priorityScore: numberFrom('priority_score'),
    duplicateCount: numberFrom('duplicate_count'),
    slaEscalated: booleanFrom('sla_escalated'),
    ticketSynced: booleanFrom('ticket_synced'),
    ticketSyncError: text('ticket_sync_error'),
    favorite: response.data_json.favorite === true,
    ticketId: text('ticket_id'),
    resolution: text('resolution'),
    actionHistory: Array.isArray(response.data_json.action_history) ? response.data_json.action_history : [],
    comments: Array.isArray(response.data_json.comments) ? response.data_json.comments : [],
  };
}

export async function actOnVulnerability(id: string, action: 'favorite' | 'assign' | 'retest' | 'close_retest' | 'set_due_date' | 'add_report' | 'create_ticket' | 'ignore' | 'false_positive' | 'comment', value?: string | boolean) {
  await apiRequest(`/api/v1/vulnerabilities/${uuid.parse(id)}/actions`, vulnerabilityDetailSchema, { method: 'POST', body: { action, value } });
  return getVulnerability(id);
}

export async function submitRetestResult(id: string, passed: boolean) {
  await apiRequest(`/api/v1/vulnerabilities/${uuid.parse(id)}/retest-result?passed=${passed}`, vulnerabilityDetailSchema, { method: 'POST' });
  return getVulnerability(id);
}

export async function escalateVulnerabilitySla() {
  return apiRequest('/api/v1/vulnerabilities/sla/escalate', z.object({ escalated: z.number().int().nonnegative() }), { method: 'POST' });
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
  keyword?: string;
  asset?: string;
  createdFrom?: string;
  createdTo?: string;
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
    ['keyword', input.keyword],
    ['asset', input.asset],
    ['created_from', input.createdFrom],
    ['created_to', input.createdTo],
    ['page', input.page],
    ['page_size', input.pageSize],
  ]);
  const response = await apiRequest(`/api/v1/vulnerabilities?${query}`, pageEnvelope(vulnerabilityListSchema));
  return result(response.data, mapVulnerability);
}

export async function updateAsset(id: string, input: Partial<AssetCreateInput>) {
  const payload = z.object({ asset_type: assetTypeSchema.optional(), address: z.string().min(1).optional(), owner: z.string().optional(), authorized: z.boolean().optional() }).parse(input);
  const response = await apiRequest(`/api/v1/assets/${uuid.parse(id)}`, assetSchema, { method: 'PATCH', body: payload });
  return mapAsset(response);
}

export async function createAssetsBulk(assets: AssetCreateInput[]) {
  const payload = z.object({ assets: z.array(z.object({ asset_type: assetTypeSchema, address: z.string().min(1), owner: z.string(), authorized: z.boolean() })).min(1).max(500) }).parse({ assets });
  const response = await apiRequest('/api/v1/assets/bulk', z.array(assetSchema), { method: 'POST', body: payload });
  return response.map(mapAsset);
}

export async function getDashboardSummary() {
  const response = await apiRequest('/api/v1/dashboard/summary', dashboardSummarySchema);
  return {
    metrics: response.data.metrics,
    aiSummary: {
      warnings: response.data.ai_summary.warnings,
      priorityFindings: response.data.ai_summary.priority_findings,
      remediation: response.data.ai_summary.remediation,
      source: response.data.ai_summary.source,
    },
    riskTrend: response.data.risk_trend,
  };
}

export async function updateVulnerability(id: string, status: VulnerabilityStatusCode) {
  const payload = z.object({ status: vulnerabilityStatusSchema }).parse({ status });
  const response = await apiRequest(`/api/v1/vulnerabilities/${id}`, vulnerabilityDetailSchema, {
    method: 'PATCH',
    body: payload,
  });
  return mapVulnerability({ ...response, task_name: null, tags: tagsFromData(response.data_json) });
}

export function deleteVulnerability(id: string) {
  return apiRequest(`/api/v1/vulnerabilities/${uuid.parse(id)}`, z.object({
    success: z.literal(true), message: z.string(), data: z.null(),
  }), { method: 'DELETE' });
}

export async function listReports(input: { taskId?: string; planId?: string; keyword?: string; format?: string; status?: string; createdFrom?: string; createdTo?: string; page: number; pageSize: number }) {
  const query = params([
    ['task_id', input.taskId], ['plan_id', input.planId], ['keyword', input.keyword], ['format', input.format], ['status', input.status], ['created_from', input.createdFrom], ['created_to', input.createdTo], ['page', input.page], ['page_size', input.pageSize],
  ]);
  const response = await apiRequest(`/api/v1/reports?${query}`, pageEnvelope(reportSchema));
  return result(response.data, mapReport);
}

export async function getVulnerabilityOverview(input: { range: OverviewRange; timezone: string }) {
  const range = overviewRangeSchema.parse(input.range);
  const { data } = await apiRequest(`/api/v1/vulnerabilities/overview?${params([['range', range], ['timezone', input.timezone]])}`, vulnerabilityOverviewSchema);
  return { range:data.range, timezone:data.timezone, granularity:data.granularity, metrics:data.metrics, riskDistribution:data.risk_distribution, sourceDistribution:data.source_distribution, trend:data.trend, recommendations:data.recommendations };
}

export async function getReportOverview(input: { range: OverviewRange; timezone: string }) {
  const range = overviewRangeSchema.parse(input.range);
  const query = params([['range', range], ['timezone', input.timezone]]);
  const { data } = await apiRequest(`/api/v1/reports/overview?${query}`, reportOverviewSchema);
  return {
    range: data.range,
    timezone: data.timezone,
    granularity: data.granularity,
    metrics: Object.fromEntries(Object.entries(data.metrics).map(([key, item]) => [
      key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()),
      { value: item.value, changePercent: item.change_percent },
    ])) as {
      total: { value: number; changePercent: number | null };
      monthlyNew: { value: number; changePercent: number | null };
      pendingExport: { value: number; changePercent: number | null };
      exported: { value: number; changePercent: number | null };
      pendingConfirmation: { value: number; changePercent: number | null };
      monthlyDelivered: { value: number; changePercent: number | null };
    },
    sourceDistribution: data.source_distribution.map((item) => ({ ...item, label: sanitizeDisplayText(item.label) })),
    riskDistribution: data.risk_distribution,
    trend: data.trend,
    latestReports: data.latest_reports.map((item) => ({
      id: item.id, filename: item.filename, source: item.source, sourceLabel: sanitizeDisplayText(item.source_label),
      creatorName: item.creator_name, createdAt: item.created_at,
    })),
    recentExports: data.recent_exports.map((item) => ({
      id: item.id, filename: item.filename, source: item.source, sourceLabel: sanitizeDisplayText(item.source_label),
      format: item.format, exporterName: item.exporter_name, status: item.status,
      exportedAt: item.exported_at,
    })),
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
