export type Tone = 'blue' | 'green' | 'orange' | 'red' | 'purple' | 'gray';

export interface Metric {
  label: string;
  value: string;
  trend: string;
  tone: Tone;
  icon?: string;
}

export type TaskStatus = '进行中' | '排队中' | '已完成' | '异常' | '已停止';

export interface TaskRecord {
  id: string;
  name: string;
  type: string;
  target: string;
  creator: string;
  createdAt: string;
  status: TaskStatus;
  progress: number;
  priority: '高' | '中' | '低';
}

export type Severity = '严重' | '高危' | '中危' | '低危';

export interface VulnerabilityRecord {
  id: string;
  title: string;
  source: string;
  asset: string;
  task: string;
  discoveredAt: string;
  updatedAt: string;
  status: '待修复' | '修复中' | '待复测' | '已修复';
  severity: Severity;
  tags: string[];
  description: string;
}

export interface ReportRecord {
  id: string;
  name: string;
  type: string;
  group: string;
  task: string;
  createdAt: string;
  status: '待确认' | '已完成';
  exported: boolean;
  risks: Partial<Record<Severity, number>>;
}
