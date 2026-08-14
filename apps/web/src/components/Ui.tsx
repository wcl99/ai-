import {
  ArrowDownOutlined,
  ArrowUpOutlined,
} from '@ant-design/icons';
import { Card, Progress, Tag } from 'antd';
import type { Metric, Severity, TaskStatus, Tone } from '../types';

const severityLabels: Record<string, Severity> = {
  critical: '严重',
  high: '高危',
  medium: '中危',
  low: '低危',
  info: '未知',
};

const severityTagColors: Record<Severity, string> = {
  严重: 'red',
  高危: 'orange',
  中危: 'blue',
  低危: 'green',
  未知: 'default',
};

export function SeverityTag({ severity, className }: { severity: string; className?: string }) {
  const normalized = severityLabels[severity.toLowerCase()] ?? severity;
  const label: Severity = normalized in severityTagColors ? normalized as Severity : '未知';
  return <Tag className={className} color={severityTagColors[label]}>{label}</Tag>;
}

export function MetricCard({ metric }: { metric: Metric }) {
  const negative = metric.trend?.startsWith('-') ?? false;
  const metricIcons: Record<string, string> = {
    任务总数: 'metric-task',
    进行中任务: 'metric-task-clock',
    高危风险: 'metric-warning',
    资产总数: 'metric-database',
    漏洞总数: 'metric-vulnerability-total',
    全部任务: 'metric-task-all',
    排队中: 'metric-task-queued',
    进行中: 'metric-task-running',
    已完成: 'metric-task-completed',
    异常任务: 'metric-task-abnormal',
    今日新增: 'metric-task-today',
    高危漏洞: 'metric-vulnerability-high',
    中危漏洞: 'metric-vulnerability-medium',
    待修复: 'metric-vulnerability-pending',
    待复测: 'metric-vulnerability-retest',
    已修复: 'metric-vulnerability-fixed',
    报告总数: 'metric-report-total',
    本周新增: 'metric-report-weekly',
    待导出: 'metric-report-pending-export',
    已导出: 'metric-report-exported',
    待确认: 'metric-report-pending-confirm',
    本月交付: 'metric-report-delivered',
  };
  const icon = metric.icon ?? metricIcons[metric.label];
  return (
    <Card className={`metric-card tone-${metric.tone}`} variant="borderless">
      <div className="metric-top">
        <span>{metric.label}</span>
        {metric.trend && (
          <Tag color={negative ? 'green' : metric.tone === 'red' ? 'red' : 'blue'}>
            {negative ? <ArrowDownOutlined /> : <ArrowUpOutlined />} {metric.trend}
          </Tag>
        )}
      </div>
      <strong>{metric.value}</strong>
      {icon && <i><img src={'/ui-icons/' + icon + '.png'} alt="" /></i>}
    </Card>
  );
}

export function StatusTag({ status }: { status: TaskStatus | string }) {
  const color: Record<string, string> = {
    进行中: 'blue',
    排队中: 'orange',
    已完成: 'green',
    异常: 'red',
    已停止: 'default',
    待修复: 'orange',
    修复中: 'blue',
    待复测: 'cyan',
    已修复: 'green',
    待确认: 'orange',
  };
  const icon = ['异常', '已停止'].includes(status)
    ? 'error'
    : ['排队中', '待修复', '待复测', '待确认'].includes(status)
      ? 'warning'
      : 'success';
  return (
    <Tag className="design-status-tag" color={color[status] ?? 'default'}>
      <img src={'/ui-icons/status-' + icon + '.png'} alt="" />
      {status}
    </Tag>
  );
}

export function ProgressCell({ value, tone = 'blue' }: { value: number; tone?: Tone }) {
  const colors: Record<Tone, string> = {
    blue: '#1264d8',
    green: '#138760',
    orange: '#f59c36',
    red: '#d7464c',
    purple: '#7437e8',
    gray: '#8a94a6',
  };
  return <Progress percent={value} size="small" strokeColor={colors[tone]} />;
}

export function SectionTitle({
  icon,
  title,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="section-title">
      <span className="section-icon">{icon}</span>
      <h3>{title}</h3>
      {action && <div className="section-action">{action}</div>}
    </div>
  );
}
