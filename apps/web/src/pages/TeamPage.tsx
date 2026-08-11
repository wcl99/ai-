import {
  ApartmentOutlined,
  DownOutlined,
  ImportOutlined,
  PlusOutlined,
  SearchOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Form, Input, Modal, Select, Switch, Table, Tag, Tooltip, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMemo, useState } from 'react';
import { createUser, listUsers, updateUser } from '../api/resources';
import type { CreateUserInput, TeamUser, UserRole } from '../api/resources';

const roleLabels: Record<UserRole, string> = {
  admin: '管理员',
  security_expert: '安全专家',
  operator: '操作员',
  auditor: '审计员',
};

export function TeamPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState<'all' | 'active' | 'disabled'>('all');
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

  const items = useMemo(() => users.data?.items ?? [], [users.data?.items]);
  const visibleItems = useMemo(() => {
    const normalized = keyword.trim().toLowerCase();
    return items.filter((item) => {
      const matchesKeyword = !normalized || `${item.name} ${item.username} ${roleLabels[item.role]}`.toLowerCase().includes(normalized);
      const matchesStatus = status === 'all' || (status === 'active' ? item.is_active : !item.is_active);
      return matchesKeyword && matchesStatus;
    });
  }, [items, keyword, status]);

  const columns: ColumnsType<TeamUser> = [
    { title: '成员', dataIndex: 'name', render: (name, item) => <div className="team-member-cell"><span>{name.slice(0, 1).toUpperCase()}</span><div><strong>{name}</strong><small>@{item.username}</small></div></div> },
    { title: '所属部门', key: 'department', width: 170, render: (_, item) => item.role === 'admin' ? '平台管理组' : item.is_digital_human ? '智能体账号' : '安全服务组' },
    { title: '角色', dataIndex: 'role', width: 150, render: (role: UserRole) => <Tag color={role === 'admin' ? 'blue' : undefined}>{roleLabels[role]}</Tag> },
    { title: '账号类型', dataIndex: 'is_digital_human', width: 140, render: (digital) => digital ? '数字人' : '平台成员' },
    { title: '状态', dataIndex: 'is_active', width: 120, render: (active) => <Tag color={active ? 'green' : 'default'}>{active ? '已启用' : '已停用'}</Tag> },
    { title: '启用', key: 'action', width: 100, render: (_, item) => <Switch checked={item.is_active} loading={toggleUser.isPending} onChange={(checked) => toggleUser.mutate({ id: item.id, is_active: checked })} aria-label={`切换 ${item.name} 状态`} /> },
  ];

  return (
    <div className="page management-page material-team-page">
      <div className="material-page-heading"><div><h2>团队管理</h2><p>管理组织成员、角色与账号状态。</p></div><div className="material-page-actions"><Tooltip title="暂未开放"><Button disabled icon={<ImportOutlined />}>批量导入</Button></Tooltip><Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>新增成员</Button></div></div>
      <div className="material-team-layout">
        <aside className="material-team-tree">
          <header><ApartmentOutlined /><strong>组织架构</strong></header>
          <Input allowClear prefix={<SearchOutlined />} placeholder="搜索部门" />
          <div className="material-org-root"><span><DownOutlined /> 云盾智意</span><Tag>{users.data?.total ?? 0}</Tag></div>
          <button className="active" type="button"><TeamOutlined /> 全部成员 <b>{users.data?.total ?? 0}</b></button>
          <button type="button"><UserOutlined /> 平台管理组 <b>{items.filter((item) => item.role === 'admin').length}</b></button>
          <button type="button"><UserOutlined /> 安全服务组 <b>{items.filter((item) => item.role !== 'admin' && !item.is_digital_human).length}</b></button>
          <button type="button"><UserOutlined /> 智能体账号 <b>{items.filter((item) => item.is_digital_human).length}</b></button>
          <small>组织编号<br />{items[0]?.org_id ?? '正在读取…'}</small>
        </aside>
        <main className="material-team-main">
          <div className="material-team-summary">
            <div><span>当前部门</span><strong>全部成员</strong><small>组织内所有平台账号</small></div>
            <div><span>成员数量</span><strong>{users.data?.total ?? '—'}</strong><small>启用 {items.filter((item) => item.is_active).length} 人</small></div>
          </div>
          <section className="material-team-table">
            <header><div><h3>成员列表</h3><p>查看并管理组织成员信息</p></div><div><Input allowClear prefix={<SearchOutlined />} placeholder="搜索姓名、账号或角色" value={keyword} onChange={(event) => setKeyword(event.target.value)} /><Select value={status} onChange={setStatus} options={[{ value: 'all', label: '全部状态' }, { value: 'active', label: '已启用' }, { value: 'disabled', label: '已停用' }]} /></div></header>
            {users.isError && <Alert type="error" showIcon message={users.error.message} action={<Button onClick={() => users.refetch()}>重试</Button>} />}
            <Table rowKey="id" columns={columns} dataSource={visibleItems} loading={users.isPending} locale={{ emptyText: '暂无团队成员' }} pagination={{ current: page, pageSize: 20, total: users.data?.total ?? 0, showSizeChanger: false, showTotal: (total) => `共 ${total} 名成员`, onChange: setPage }} scroll={{ x: 1050 }} />
          </section>
        </main>
      </div>
      <Modal title="新增成员" open={open} onCancel={() => setOpen(false)} footer={null} destroyOnHidden>
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
