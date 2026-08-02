import { fireEvent, render, screen } from '@testing-library/react';
import { TaskConversation } from './TaskConversation';

const messages = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    task_id: '22222222-2222-4222-8222-222222222222',
    user_id: '33333333-3333-4333-8333-333333333333',
    role: 'user',
    content: '为什么失败？',
    created_at: '2026-08-03T02:14:10Z',
  },
  {
    id: '44444444-4444-4444-8444-444444444444',
    task_id: '22222222-2222-4222-8222-222222222222',
    user_id: '33333333-3333-4333-8333-333333333333',
    role: 'assistant',
    content: '归档文件异常，正在保留现场并等待重试。',
    created_at: '2026-08-03T02:14:11Z',
  },
];

describe('TaskConversation', () => {
  it('shows the task conversation and keeps its composer floating', () => {
    const onInputChange = vi.fn();
    const onSend = vi.fn();
    const view = render(
      <TaskConversation
        messages={messages}
        phase="SCANNING"
        progress={36}
        input="继续检查"
        sending={false}
        onInputChange={onInputChange}
        onSend={onSend}
      />,
    );

    expect(screen.getByRole('log', { name: '任务对话' })).toBeInTheDocument();
    expect(screen.getByText('为什么失败？')).toBeInTheDocument();
    expect(screen.getByText('归档文件异常，正在保留现场并等待重试。')).toBeInTheDocument();
    expect(screen.getByText('SCANNING')).toBeInTheDocument();
    expect(screen.getByText('36%')).toBeInTheDocument();
    expect(view.container.querySelector('.task-conversation-composer--floating'))
      .toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('向任务提问'), {
      target: { value: '解释失败原因' },
    });
    expect(onInputChange).toHaveBeenCalledWith('解释失败原因');
    fireEvent.click(screen.getByRole('button', { name: '发送任务问题' }));
    expect(onSend).toHaveBeenCalledOnce();
  });

  it('shows send errors and disables empty questions', () => {
    render(
      <TaskConversation
        messages={[]}
        phase={null}
        progress={0}
        input=""
        sending={false}
        error="问题发送失败"
        onInputChange={vi.fn()}
        onSend={vi.fn()}
      />,
    );

    expect(screen.getByText('还没有任务对话')).toBeInTheDocument();
    expect(screen.getByText('问题发送失败')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '发送任务问题' })).toBeDisabled();
  });
});
