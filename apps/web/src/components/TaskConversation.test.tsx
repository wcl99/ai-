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
    phase: 'INFORMATION_GATHERING',
    state: 'running',
    steps: [],
    narratives: [],
    startedAt: '2026-08-03T10:04:00',
  },
];

describe('TaskConversation', () => {
  it('positions phase markers against the timeline row instead of the summary content', () => {
    expect(taskStyles).toContain('.task-phase-entry>summary{display:grid;');
    expect(taskStyles).not.toContain('.task-phase-entry>summary{position:relative;');
  });

  it('renders grouped tools and QA messages in one timestamped timeline', () => {
    const onInputChange = vi.fn();
    const onSend = vi.fn();
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
      />,
    );

    const timeline = screen.getByRole('log', { name: '任务编排时间线' });
    expect(view.container.querySelectorAll('.task-activity-timeline')).toHaveLength(1);
    expect(view.container.querySelector('.task-conversation')).not.toBeInTheDocument();
    expect(within(timeline).getByText('信息收集')).toBeInTheDocument();
    expect(within(timeline).getByText('3 次调用')).toBeInTheDocument();
    expect(within(timeline).getByText('2 个工具')).toBeInTheDocument();
    expect(within(timeline).getByText('调用 × 2')).toBeInTheDocument();
    expect(within(timeline).getByText('2026-08-03 10:00:00 — 2026-08-03 10:04:00'))
      .toBeInTheDocument();
    expect(within(timeline).getByText('为什么失败？')).toBeInTheDocument();
    expect(within(timeline).getByText('平台任务助手')).toBeInTheDocument();
    expect(within(timeline).queryByText(/小易/)).not.toBeInTheDocument();
    expect(within(timeline).getByText('2026-08-03 10:05:00')).toBeInTheDocument();

    const phaseDetails = within(timeline).getByText('信息收集').closest('details');
    expect(phaseDetails).not.toHaveAttribute('open');
    expect(phaseDetails?.querySelector('.task-phase-disclosure')).toHaveTextContent('展开详情');
    const toolDetails = within(timeline).getByText('run_subfinder').closest('details');
    expect(toolDetails).not.toHaveAttribute('open');
    expect(toolDetails?.querySelector('.task-tool-actions')).toHaveTextContent('查看调用');
    expect(toolDetails).toContainElement(within(timeline).getByText('temporary failure'));
    expect(toolDetails).toContainElement(within(timeline).getByText(/www\.example\.test/));

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
    expect(screen.getByText('任务已开始，您可以补充测试信息')).toBeInTheDocument();
    expect(screen.getByText(/白盒账号、特殊入口、测试限制或业务窗口/)).toBeInTheDocument();
    expect(screen.getByText('问题发送失败')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '发送任务问题' })).toBeDisabled();
  });
});
