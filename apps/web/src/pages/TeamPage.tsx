import { PlusOutlined, TeamOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Card, Form, Input, Modal, Select, Switch, Table, Tag, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';
import { createUser, listUsers, updateUser } from '../api/resources';
import type { CreateUserInput, TeamUser, UserRole } from '../api/resources';
import { ManagementPageHeader } from '../components/ManagementPageHeader';

const roleLabels: Record<UserRole, string> = {
  admin: '管理员',
  security_expert: '安全专家',
  operator: '操作员',
  auditor: '审计员',
};

export function TeamPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm<CreateUserInput>();
  const users = useQuery({ queryKey: ['users', page], queryFn: () => listUsers({ page, pageSize: 20 }) });
  const addUser = useMutation({
    mutationFn: createUser,
    onSuccess: async () => {
      setOpen(false);
      form.resetFields();
      await queryClient.invalidateQueries({ queryKey: ['users'] });
      message.success('成员已添加');
    },
  });
  const toggleUser = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) => updateUser(id, { is_active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });

  const items = users.data?.items ?? [];
  const columns: ColumnsType<TeamUser> = [
    { title: '成员', dataIndex: 'name', render: (name, item) => <div className="team-member-cell"><span>{name.slice(0, 1).toUpperCase()}</span><div><strong>{name}</strong><small>@{item.username}</small></div></div> },
    { title: '角色', dataIndex: 'role', width: 150, render: (role: UserRole) => <Tag color={role === 'admin' ? 'blue' : undefined}>{roleLabels[role]}</Tag> },
    { title: '账号类型', dataIndex: 'is_digital_human', width: 140, render: (digital) => digital ? '数字人' : '平台成员' },
    { title: '状态', dataIndex: 'is_active', width: 120, render: (active) => <Tag color={active ? 'green' : 'default'}>{active ? '已启用' : '已停用'}</Tag> },
    { title: '启用', key: 'action', width: 100, render: (_, item) => <Switch checked={item.is_active} loading={toggleUser.isPending} onChange={(checked) => toggleUser.mutate({ id: item.id, is_active: checked })} aria-label={`切换 ${item.name} 状态`} /> },
  ];

  return (
    <div className="page management-page team-page">
      <ManagementPageHeader eyebrow="成员与角色" title="团队管理" description="管理可登录平台的成员、角色和账号状态。" actions={<Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>添加成员</Button>} />
      <div className="management-stat-strip">
        <div><span>成员总数</span><strong>{users.data?.total ?? '—'}</strong></div>
        <div><span>当前页启用</span><strong>{users.isSuccess ? items.filter((item) => item.is_active).length : '—'}</strong></div>
        <div><span>数字人账号</span><strong>{users.isSuccess ? items.filter((item) => item.is_digital_human).length : '—'}</strong></div>
        <TeamOutlined />
      </div>
      <Card className="management-table-panel" variant="borderless">
        {users.isError && <Alert type="error" showIcon message={users.error.message} action={<Button onClick={() => users.refetch()}>重试</Button>} />}
        <Table rowKey="id" columns={columns} dataSource={items} loading={users.isPending} locale={{ emptyText: '暂无团队成员' }} pagination={{ current: page, pageSize: 20, total: users.data?.total ?? 0, showSizeChanger: false, onChange: setPage }} />
      </Card>
      <Modal title="添加成员" open={open} onCancel={() => setOpen(false)} footer={null} destroyOnHidden>
        <Form form={form} layout="vertical" initialValues={{ role: 'operator', is_digital_human: false }} onFinish={(values) => addUser.mutate(values)}>
          <Form.Item label="姓名" name="name" rules={[{ required: true, message: '请输入姓名' }]}><Input maxLength={120} /></Form.Item>
          <Form.Item label="账号" name="username" rules={[{ required: true, message: '请输入账号' }, { pattern: /^[A-Za-z0-9_.-]+$/, message: '仅支持字母、数字、点、横线和下划线' }]}><Input maxLength={80} /></Form.Item>
          <Form.Item label="初始密码" name="password" rules={[{ required: true, min: 8, message: '密码至少 8 位' }]}><Input.Password autoComplete="new-password" /></Form.Item>
          <Form.Item label="角色" name="role"><Select options={Object.entries(roleLabels).map(([value, label]) => ({ value, label }))} /></Form.Item>
          <Form.Item label="数字人账号" name="is_digital_human" valuePropName="checked"><Switch /></Form.Item>
          {addUser.isError && <Alert className="management-form-error" type="error" showIcon message={addUser.error.message} />}
          <div className="management-form-actions"><Button onClick={() => setOpen(false)}>取消</Button><Button type="primary" htmlType="submit" loading={addUser.isPending}>确认添加</Button></div>
        </Form>
      </Modal>
    </div>
  );
}
