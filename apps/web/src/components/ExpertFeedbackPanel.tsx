import { RobotOutlined, SendOutlined, UserOutlined } from '@ant-design/icons';
import { Button, Input } from 'antd';
import type { ExpertFeedbackMessage } from '../pages/pentestFeedback';

type ExpertFeedbackPanelProps = {
  messages: ExpertFeedbackMessage[];
  speaker: string;
  input: string;
  sending: boolean;
  onInputChange: (value: string) => void;
  onSend: () => void;
};

export function ExpertFeedbackPanel({
  messages,
  speaker,
  input,
  sending,
  onInputChange,
  onSend,
}: ExpertFeedbackPanelProps) {
  return (
    <aside
      aria-label="专家咨询区"
      className="expert-consultation expert-consultation--enter"
    >
      <header>
        <div><RobotOutlined /><strong>专家咨询区</strong></div>
        <span>汇总任务关键反馈</span>
      </header>
      <div className="expert-speaker">当前主讲：{speaker}</div>
      <div className="consultation-messages" aria-live="polite">
        {messages.map((message) => (
          <article
            className={`consultation-message ${message.role} ${message.tone ?? ''}`}
            key={message.id}
          >
            <i>{message.role === 'user' ? <UserOutlined /> : <RobotOutlined />}</i>
            <div>
              <strong>{message.speaker}</strong>
              {message.role !== 'user' && message.content.length > 220 ? (
                <>
                  <p className="consultation-message-summary">{message.content.slice(0, 180).trim()}…</p>
                  <details className="consultation-message-details">
                    <summary>查看完整回复</summary>
                    <p>{message.content}</p>
                  </details>
                </>
              ) : <p>{message.content}</p>}
            </div>
          </article>
        ))}
      </div>
      <div className="consultation-input">
        <Input
          aria-label="向专家提问"
          value={input}
          placeholder="向专家提问（如：为什么失败？）"
          onChange={(event) => onInputChange(event.target.value)}
          onPressEnter={onSend}
          suffix={(
            <Button
              aria-label="发送专家问题"
              type="text"
              icon={<SendOutlined />}
              loading={sending}
              disabled={!input.trim()}
              onClick={onSend}
            />
          )}
        />
      </div>
    </aside>
  );
}
