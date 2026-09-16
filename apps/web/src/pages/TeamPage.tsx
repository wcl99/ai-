import {
  ApartmentOutlined,
  DeleteOutlined,
  DownOutlined,
  EditOutlined,
  ImportOutlined,
  InfoCircleOutlined,
  PlusOutlined,
  SearchOutlined,
  TeamOutlined,
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
  const [editing, setEditing] = useState<TeamUser | null>(null);
  const [viewing, setViewing] = useState<TeamUser | null>(null);
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
  const editUser = useMutation({
    mutationFn: ({ id, name, role }: { id: string; name: string; role: UserRole }) => updateUser(id, { name, role }),
    onSuccess: async () => {
      setEditing(null);
      await queryClient.invalidateQueries({ queryKey: ['users'] });
      message.success('成员信息已更新');
    },
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
    { title: '用户名', dataIndex: 'username', render: (username, item) => <div className="team-member-cell"><span>{username.slice(0, 2).toUpperCase()}</span><div><strong>{username}</strong><small>ID: {item.id.slice(0, 8)}</small></div></div> },
    { title: '姓名', dataIndex: 'name' },
    { title: '邮箱', key: 'email', render: () => '—' },
    { title: '角色', dataIndex: 'role', width: 150, render: (role: UserRole) => <Tag color={role === 'admin' ? 'blue' : undefined}>{roleLabels[role]}</Tag> },
    { title: '状态', dataIndex: 'is_active', width: 110, render: (active) => <Tag color={active ? 'green' : 'default'}>{active ? '活跃' : '未激活'}</Tag> },
    { title: '最后登录', key: 'last_login', width: 120, render: () => '—' },
    { title: '创建时间', key: 'created_at', width: 120, render: () => '—' },
    { title: '操作', key: 'action', width: 205, render: (_, item) => <div className="material-team-actions"><Button type="link" aria-label={`编辑 ${item.name}`} icon={<EditOutlined />} onClick={() => setEditing(item)}>编辑</Button><Button type="link" aria-label={`详情 ${item.name}`} icon={<InfoCircleOutlined />} onClick={() => setViewing(item)}>详情</Button><Tooltip title="服务端暂未提供删除接口"><Button disabled type="text" aria-label={`删除 ${item.name}`} icon={<DeleteOutlined />} /></Tooltip><Switch checked={item.is_active} loading={toggleUser.isPending} onChange={(checked) => toggleUser.mutate({ id: item.id, is_active: checked })} aria-label={`切换 ${item.name} 状态`} /></div> },
  ];

  return (
    <div className="page management-page material-team-page">
      <div className="material-page-heading"><div><h2>团队管理</h2><p>团队管理 - 管理组织架构、成员账号与角色权限</p></div><div className="material-page-actions"><Tooltip title="暂未开放"><Button disabled icon={<ImportOutlined />}>批量导入</Button></Tooltip><Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>添加成员</Button></div></div>
      <div className="material-team-layout">
        <aside className="material-team-tree">
          <header><ApartmentOutlined /><strong>组织架构</strong></header>
          <Input allowClear prefix={<SearchOutlined />} placeholder="搜索关键词" />
          <nav className="material-org-tree" aria-label="组织架构">
            <button className="active" type="button"><DownOutlined /><ApartmentOutlined /> 全部组织</button>
            <div className="material-org-branch">
              <button type="button"><DownOutlined /><TeamOutlined /> 研发中心</button>
              <div className="material-org-branch material-org-branch--nested">
                <button type="button"><span />安全实验室</button>
                <button type="button"><span />架构组</button>
              </div>
              <button type="button"><span /><TeamOutlined /> 市场部</button>
              <button type="button"><span /><TeamOutlined /> 人力资源</button>
            </div>
          </nav>
        </aside>
        <main className="material-team-main">
          <div className="material-team-summary">
            <div><span>当前部门</span><strong>全部组织</strong><small>组织内所有平台账号</small></div>
            <div><span>部门成员</span><strong>{users.data?.total ?? '—'}</strong><small>启用 {items.filter((item) => item.is_active).length} 人</small></div>
          </div>
          <section className="material-team-table">
            <header><h3 className="sr-only">成员列表</h3><div className="material-team-status-filter"><Tag color="orange">管理员</Tag><Tag color="blue">测试员</Tag><Tag color="purple">审计员</Tag><Select aria-label="用户状态" value={status} onChange={setStatus} options={[{ value: 'all', label: '全部状态' }, { value: 'active', label: '活跃' }, { value: 'disabled', label: '未激活' }]} /></div><div><Input allowClear prefix={<SearchOutlined />} placeholder="搜索用户名、姓名或邮箱..." value={keyword} onChange={(event) => setKeyword(event.target.value)} /><Button type="primary">搜索</Button><Button onClick={() => { setKeyword(''); setStatus('all'); }}>重置</Button></div></header>
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
      <Modal title="编辑成员" open={Boolean(editing)} onCancel={() => setEditing(null)} footer={null} destroyOnHidden>
        {editing && <Form layout="vertical" initialValues={{ name: editing.name, role: editing.role }} onFinish={(values: { name: string; role: UserRole }) => editUser.mutate({ id: editing.id, ...values })}>
          <Form.Item label="姓名" name="name" rules={[{ required: true, message: '请输入姓名' }]}><Input /></Form.Item>
          <Form.Item label="角色" name="role"><Select options={Object.entries(roleLabels).map(([value, label]) => ({ value, label }))} /></Form.Item>
          <div className="management-form-actions"><Button onClick={() => setEditing(null)}>取消</Button><Button type="primary" htmlType="submit" loading={editUser.isPending}>保存</Button></div>
        </Form>}
      </Modal>
      <Modal title="成员详情" open={Boolean(viewing)} onCancel={() => setViewing(null)} footer={<Button onClick={() => setViewing(null)}>关闭</Button>}>
        {viewing && <dl className="material-member-detail"><div><dt>用户名</dt><dd>{viewing.username}</dd></div><div><dt>姓名</dt><dd>{viewing.name}</dd></div><div><dt>角色</dt><dd>{roleLabels[viewing.role]}</dd></div><div><dt>状态</dt><dd>{viewing.is_active ? '活跃' : '未激活'}</dd></div></dl>}
      </Modal>
    </div>
  );
}
