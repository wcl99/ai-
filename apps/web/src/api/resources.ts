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

const uuid = z.string().uuid();
const timestamp = z.string();
const taskStatusFilterSchema = z.enum([
  'QUEUED', 'RUNNING', 'CANCELLING', 'SUCCEEDED', 'PARTIAL_SUCCEEDED', 'FAILED', 'CANCELLED',
]);
const assetTypeSchema = z.enum(['domain', 'ip', 'http', 'network_range', 'ip_port']);
const vulnerabilityStatusSchema = z.enum(['OPEN', 'FIXING', 'RETESTING', 'FIXED']);
const vulnerabilitySeverityFilterSchema = z.enum(['critical', 'high', 'medium', 'low', 'unknown']);
export type TaskStatusCode = z.infer<typeof taskStatusFilterSchema>;
export type VulnerabilityStatusCode = z.infer<typeof vulnerabilityStatusSchema>;
export type VulnerabilitySeverityCode = z.infer<typeof vulnerabilitySeverityFilterSchema>;

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
  page: number;
  pageSize: number;
}) {
  const severity = vulnerabilitySeverityFilterSchema.optional().parse(input.severity);
  const status = vulnerabilityStatusSchema.optional().parse(input.status);
  const query = params([
    ['severity', severity], ['status', status], ['page', input.page], ['page_size', input.pageSize],
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

export function previewReport(id: string) {
  return apiTextRequest(`/api/v1/reports/${id}/content`);
}

export function reportDownloadUrl(id: string) {
  return `/api/v1/reports/${id}/download`;
}
