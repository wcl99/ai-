import { fireEvent, render, screen } from '@testing-library/react';
import { ExpertFeedbackPanel } from './ExpertFeedbackPanel';

describe('ExpertFeedbackPanel', () => {
  it('renders accumulated feedback and submits a follow-up question', () => {
    const onInputChange = vi.fn();
    const onSend = vi.fn();
    const longReply = `关键结论：API 验证命中 1 个漏洞。${'普通过程说明'.repeat(80)}`;

    const view = render(
      <ExpertFeedbackPanel
        messages={[
          {
            id: 'history-1',
            role: 'assistant',
            speaker: '需求分析智能体',
            content: '需求已确认',
          },
          {
            id: 'event-1',
            role: 'assistant',
            speaker: '渗透执行智能体',
            content: longReply,
            tone: 'success',
          },
        ]}
        speaker="渗透执行智能体"
        input="为什么失败？"
        sending={false}
        onInputChange={onInputChange}
        onSend={onSend}
      />,
    );

    expect(screen.getByRole('complementary', { name: '专家咨询区' })).toBeInTheDocument();
    expect(view.container.querySelector('.expert-consultation--enter')).toBeInTheDocument();
    expect(screen.getByText('需求已确认')).toBeInTheDocument();
    expect(screen.getAllByText(/关键结论：API 验证命中 1 个漏洞/).length).toBeGreaterThanOrEqual(1);
    const completeReply = screen.getByText('查看完整回复').closest('details');
    expect(completeReply).not.toHaveAttribute('open');
    expect(completeReply).toContainElement(screen.getByText(longReply));

    fireEvent.change(screen.getByLabelText('向专家提问'), { target: { value: '请解释失败原因' } });
    expect(onInputChange).toHaveBeenCalledWith('请解释失败原因');
    fireEvent.click(screen.getByRole('button', { name: '发送专家问题' }));
    expect(onSend).toHaveBeenCalledTimes(1);
  });
});
