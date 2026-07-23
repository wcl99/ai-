export type Tone = 'blue' | 'green' | 'orange' | 'red' | 'purple' | 'gray';

export interface Metric {
  label: string;
  value: string;
  trend?: string;
  tone: Tone;
  icon?: string;
}

export type TaskStatus = '排队中' | '进行中' | '取消中' | '已完成' | '部分完成' | '异常' | '已停止' | '未知';

export interface TaskRecord {
  id: string;
  name: string;
  planName: string;
  type: string;
  target: string;
  creator: string;
  createdAt: string;
  status: TaskStatus;
  statusCode: string;
  phase: string;
  progress: number;
  errorMessage: string | null;
}

export type Severity = '严重' | '高危' | '中危' | '低危' | '未知';

export interface VulnerabilityRecord {
  id: string;
  title: string;
  asset: string;
  task: string;
  discoveredAt: string;
  updatedAt: string;
  status: '待修复' | '修复中' | '待复测' | '已修复' | '未知';
  statusCode: string;
  severity: Severity;
  tags: string[];
  description: string | null;
}

export interface AssetRecord {
  id: string;
  key: string;
  address: string;
  type: string;
  service: string | null;
  owner: string | null;
  authorized: boolean;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ReportRecord {
  id: string;
  name: string;
  format: string;
  plan: string;
  task: string;
  createdAt: string;
  status: string;
  externalUrl: string | null;
  previewSupported: boolean;
}

export interface PageResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
