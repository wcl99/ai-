import { fireEvent, render, screen, within } from '@testing-library/react';
import type { TaskQAMessage } from '../api/pentest';
import type { PentestToolEvent } from '../pages/pentestToolFeed';
import { TaskConversation } from './TaskConversation';
import taskStyles from '../styles.css?raw';

const messages: TaskQAMessage[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    task_id: '22222222-2222-4222-8222-222222222222',
    user_id: '33333333-3333-4333-8333-333333333333',
    role: 'user',
    content: '为什么失败？',
    created_at: '2026-08-03T10:03:00',
  },
  {
    id: '44444444-4444-4444-8444-444444444444',
    task_id: '22222222-2222-4222-8222-222222222222',
    user_id: '33333333-3333-4333-8333-333333333333',
    role: 'assistant',
    content: '归档文件异常，正在保留现场并等待重试。',
    created_at: '2026-08-03T10:05:00',
  },
];

const tools: PentestToolEvent[] = [
  {
    id: 'subfinder:1',
    name: 'run_subfinder',
    phase: 'INFORMATION_GATHERING',
    state: 'success',
    arguments: { domain: 'example.test' },
    resultPreview: '{"subdomains":["www.example.test"]}',
    steps: [],
    narratives: [],
    startedAt: '2026-08-03T10:00:00',
  },
  {
    id: 'subfinder:2',
    name: 'run_subfinder',
    phase: 'RECON',
    state: 'failed',
    steps: [],
    narratives: [],
    error: 'temporary failure',
    startedAt: '2026-08-03T10:02:00',
  },
  {
    id: 'emails:1',
    name: 'get_emails',
    phase: 'SCANNING',
    state: 'running',
    steps: [],
    narratives: [],
    startedAt: '2026-08-03T10:04:00',
  },
];

describe('TaskConversation', () => {
  it('centers tool markers on the timeline rail', () => {
    expect(taskStyles).toContain('.task-activity-stream::before{left:41px;');
    expect(taskStyles).toMatch(/task-tool-card>\.task-timeline-marker\{left:-31px/);
  });

  it('renders each tool call as a timeline item with a customer-readable explanation', () => {
    const onInputChange = vi.fn();
    const onSend = vi.fn();
    const onToolSelect = vi.fn();
    const view = render(
      <TaskConversation
        messages={messages}
        tools={tools}
        status="RUNNING"
        updatedAt="2026-08-03T10:06:00"
        phase="SCANNING"
        progress={36}
        input="继续检查"
        sending={false}
        onInputChange={onInputChange}
        onSend={onSend}
        onToolSelect={onToolSelect}
      />,
    );

    const timeline = screen.getByRole('log', { name: '任务编排时间线' });
    expect(view.container.querySelectorAll('.task-activity-timeline')).toHaveLength(1);
    expect(view.container.querySelector('.task-conversation')).not.toBeInTheDocument();
    expect(view.container.querySelectorAll('.task-tool-timeline-entry')).toHaveLength(3);
    expect(view.container.querySelectorAll('.task-tool-intent')).toHaveLength(3);
    expect(view.container.querySelectorAll('.task-tool-intent-icon')).toHaveLength(2);
    expect(view.container.querySelectorAll('.task-tool-card')).toHaveLength(3);
    expect(view.container.querySelector('.task-phase-entry')).not.toBeInTheDocument();
    expect(view.container.querySelector('.task-tool-intent')?.textContent?.trim()).toMatch(
      /^调用 run_subfinder 工具，目的是枚举目标的公开子域名/,
    );
    expect(within(timeline).getAllByText('run_subfinder')).toHaveLength(4);
    expect(within(timeline).getAllByText(/目的是枚举目标的公开子域名/).length).toBeGreaterThan(0);
    expect(within(timeline).queryByText('查看调用')).not.toBeInTheDocument();
    expect(within(timeline).queryByText('收起调用')).not.toBeInTheDocument();
    expect(view.container.querySelector('details')).not.toBeInTheDocument();
    expect(view.container.querySelector('.task-tool-calls')).not.toBeInTheDocument();
    expect(within(timeline).getByText('为什么失败？')).toBeInTheDocument();
    expect(within(timeline).getByText('平台任务助手')).toBeInTheDocument();
    expect(within(timeline).queryByText(/小易/)).not.toBeInTheDocument();
    expect(within(timeline).getByText('2026-08-03 10:05:00')).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: '打开 run_subfinder 执行监控' })[0]);
    expect(onToolSelect).toHaveBeenCalledWith(tools[0]);

    expect(view.container.querySelector('.task-conversation-composer--floating'))
      .toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('向任务提问'), {
      target: { value: '解释失败原因' },
    });
    expect(onInputChange).toHaveBeenCalledWith('解释失败原因');
    fireEvent.click(screen.getByRole('button', { name: '发送任务问题' }));
    expect(onSend).toHaveBeenCalledOnce();
  });

  it('shows one inline empty state and disables empty questions', () => {
    render(
      <TaskConversation
        messages={[]}
        tools={[]}
        status="QUEUED"
        updatedAt={undefined}
        phase={null}
        progress={0}
        input=""
        sending={false}
        error="问题发送失败"
        onInputChange={vi.fn()}
        onSend={vi.fn()}
      />,
    );

    expect(screen.getByText('正在等待平台返回任务编排信息')).toBeInTheDocument();
    expect(screen.queryByText('任务已开始，您可以补充测试信息')).not.toBeInTheDocument();
    expect(screen.queryByText(/白盒账号、特殊入口、测试限制或业务窗口/)).not.toBeInTheDocument();
    expect(screen.getByText('问题发送失败')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '发送任务问题' })).toBeDisabled();
  });
});
