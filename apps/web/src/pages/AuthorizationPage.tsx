import { AuditOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Card, Select, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';
import { getOrganization, getRuntimeSettings, listAuditLogs } from '../api/resources';
import type { AuditLog } from '../api/resources';
import { ManagementPageHeader } from '../components/ManagementPageHeader';

const AUDIT_PAGE_SIZE = 12;

export function AuthorizationPage() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState<string>();
  const [resourceType, setResourceType] = useState<string>();
  const organization = useQuery({ queryKey: ['organization'], queryFn: getOrganization });
  const runtime = useQuery({ queryKey: ['runtime-settings'], queryFn: getRuntimeSettings });
  const logs = useQuery({ queryKey: ['audit-logs', action, resourceType, page], queryFn: () => listAuditLogs({ action, resourceType, page, pageSize: AUDIT_PAGE_SIZE }) });

  const columns: ColumnsType<AuditLog> = [
    { title: '时间', dataIndex: 'created_at', width: 190, render: (value) => new Date(value).toLocaleString('zh-CN') },
    { title: '动作', dataIndex: 'action', width: 180, render: (value) => <strong>{value}</strong> },
    { title: '资源', key: 'resource', render: (_, item) => <div className="audit-resource"><Tag>{item.resource_type}</Tag><span>{item.resource_id}</span></div> },
    { title: '结果', dataIndex: 'outcome', width: 120, render: (value) => <Tag color={value === 'success' ? 'green' : 'red'}>{value}</Tag> },
    { title: '操作人', dataIndex: 'actor_id', width: 240 },
  ];

  return (
    <div className="page management-page authorization-page">
      <ManagementPageHeader eyebrow="边界与留痕" title="授权管理" description="查看当前组织的执行边界、引擎状态和平台审计记录。" actions={<Button onClick={() => logs.refetch()}>刷新状态</Button>} />
      <div className="authorization-summary">
        <Card variant="borderless" className="authorization-identity">
          <SafetyCertificateOutlined />
          <div><span>当前组织</span><strong>{organization.data?.name ?? '正在读取…'}</strong><small>{organization.data?.id ?? '—'}</small></div>
        </Card>
        <Card variant="borderless" className="authorization-status">
          <div><span>引擎模式</span><strong>{runtime.data?.engine_mode ?? '—'}</strong></div>
          <div><span>连接状态</span><Tag color={runtime.data?.engine_configured ? 'green' : 'orange'}>{runtime.data?.engine_configured ? '已配置' : '未配置'}</Tag></div>
          <div><span>授权机制</span><strong>任务前确认</strong></div>
        </Card>
      </div>
      {(organization.isError || runtime.isError) && <Alert type="error" showIcon message="授权上下文加载失败" />}
      <Card className="management-table-panel audit-panel" variant="borderless">
        <div className="management-table-toolbar"><div><AuditOutlined /><strong>审计记录</strong></div><div><Select allowClear placeholder="筛选动作" value={action} onChange={(value) => { setAction(value); setPage(1); }} options={[{ value: 'user.create', label: '创建成员' }, { value: 'user.update', label: '更新成员' }, { value: 'organization.update', label: '更新组织' }]} /><Select allowClear placeholder="资源类型" value={resourceType} onChange={(value) => { setResourceType(value); setPage(1); }} options={[{ value: 'user', label: '用户' }, { value: 'organization', label: '组织' }, { value: 'task', label: '任务' }, { value: 'scan_plan', label: '扫描计划' }]} /></div></div>
        {logs.isError && <Alert type="error" showIcon message={logs.error.message} action={<Button onClick={() => logs.refetch()}>重试</Button>} />}
        <Table rowKey="id" columns={columns} dataSource={logs.data?.items ?? []} loading={logs.isPending} locale={{ emptyText: '暂无审计记录' }} pagination={{ current: page, pageSize: AUDIT_PAGE_SIZE, total: logs.data?.total ?? 0, showSizeChanger: false, onChange: setPage }} scroll={{ x: 1050 }} />
      </Card>
    </div>
  );
}
