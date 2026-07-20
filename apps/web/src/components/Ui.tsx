import { ArrowDownOutlined, ArrowUpOutlined } from '@ant-design/icons';
import { Card, Progress, Tag } from 'antd';
import type { Metric, TaskStatus, Tone } from '../types';

export function MetricCard({ metric }: { metric: Metric }) {
  const negative = metric.trend.startsWith('-');
  return (
    <Card className={`metric-card tone-${metric.tone}`} variant="borderless">
      <div className="metric-top">
        <span>{metric.label}</span>
        <Tag color={negative ? 'green' : metric.tone === 'red' ? 'red' : 'blue'}>
          {negative ? <ArrowDownOutlined /> : <ArrowUpOutlined />} {metric.trend}
        </Tag>
      </div>
      <strong>{metric.value}</strong>
      <i />
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
  return <Tag color={color[status] ?? 'default'}>{status}</Tag>;
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
