import {
  CheckCircleFilled,
  CloudServerOutlined,
  DatabaseOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Card, Form, Input, Skeleton, Tag, message } from 'antd';
import { useEffect, useState } from 'react';
import { getOrganization, getRuntimeSettings, updateOrganization } from '../api/resources';
import { ManagementPageHeader } from '../components/ManagementPageHeader';

export function ManagementSettingsPage() {
  const queryClient = useQueryClient();
  const organization = useQuery({ queryKey: ['organization'], queryFn: getOrganization });
  const runtime = useQuery({ queryKey: ['runtime-settings'], queryFn: getRuntimeSettings });
  const [organizationName, setOrganizationName] = useState('');

  useEffect(() => {
    if (organization.data) setOrganizationName(organization.data.name);
  }, [organization.data]);

  const saveOrganization = useMutation({
    mutationFn: () => updateOrganization(organizationName),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['organization'] });
      message.success('组织信息已保存');
    },
  });

  const error = organization.error ?? runtime.error;
  return (
    <div className="page management-page settings-page-v2">
      <ManagementPageHeader
        eyebrow="平台配置"
        title="系统设置"
        description="维护组织信息并查看平台真实运行状态。引擎凭据始终由服务端环境注入。"
        actions={<Tag color={runtime.data?.engine_configured ? 'green' : 'orange'}>{runtime.data?.engine_configured ? '服务已就绪' : '等待配置'}</Tag>}
      />
      {error && <Alert type="error" showIcon message={error instanceof Error ? error.message : '设置加载失败'} action={<Button onClick={() => { organization.refetch(); runtime.refetch(); }}>重试</Button>} />}
      <div className="management-settings-grid">
        <Card className="management-panel management-panel-wide" variant="borderless">
          <div className="management-panel-title"><span><SafetyCertificateOutlined /></span><div><h3>组织信息</h3><p>该名称用于任务、报告和审计记录的组织归属。</p></div></div>
          {organization.isPending ? <Skeleton active paragraph={{ rows: 2 }} /> : (
            <Form layout="vertical" onFinish={() => saveOrganization.mutate()}>
              <Form.Item label="组织名称" required>
                <Input value={organizationName} maxLength={120} onChange={(event) => setOrganizationName(event.target.value)} />
              </Form.Item>
              {saveOrganization.isError && <Alert type="error" showIcon message={saveOrganization.error.message} />}
              <Button type="primary" htmlType="submit" loading={saveOrganization.isPending} disabled={!organizationName.trim()}>保存设置</Button>
            </Form>
          )}
        </Card>
        <Card className="management-panel" variant="borderless">
          <div className="management-panel-title"><span><CloudServerOutlined /></span><div><h3>运行状态</h3><p>以下内容直接来自平台运行配置。</p></div></div>
          {runtime.isPending ? <Skeleton active paragraph={{ rows: 5 }} /> : runtime.data && (
            <dl className="settings-definition-list">
              <div><dt>应用</dt><dd>{runtime.data.app_name}</dd></div>
              <div><dt>引擎模式</dt><dd><Tag color="blue">{runtime.data.engine_mode}</Tag></dd></div>
              <div><dt>引擎状态</dt><dd><Tag icon={<CheckCircleFilled />} color={runtime.data.engine_configured ? 'green' : 'orange'}>{runtime.data.engine_configured ? '已配置' : '未配置'}</Tag></dd></div>
              <div><dt>同步周期</dt><dd>{runtime.data.sync_interval_seconds} 秒</dd></div>
              <div><dt>失败重试</dt><dd>{runtime.data.engine_retry_limit} 次</dd></div>
            </dl>
          )}
        </Card>
        <Card className="management-panel" variant="borderless">
          <div className="management-panel-title"><span><DatabaseOutlined /></span><div><h3>报告与数据</h3><p>保留当前单体架构和离线报告链路。</p></div></div>
          <dl className="settings-definition-list">
            <div><dt>报告存储</dt><dd>{runtime.data?.report_storage ?? '—'}</dd></div>
            <div><dt>敏感凭据</dt><dd><Tag color="green">仅服务端可见</Tag></dd></div>
            <div><dt>授权边界</dt><dd><Tag color="blue">任务前确认</Tag></dd></div>
          </dl>
        </Card>
      </div>
    </div>
  );
}
