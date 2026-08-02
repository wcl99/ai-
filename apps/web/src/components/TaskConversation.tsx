import { SendOutlined } from '@ant-design/icons';
import { Alert, Button, Input, Progress } from 'antd';
import type { TaskQAMessage } from '../api/pentest';

type TaskConversationProps = {
  messages: TaskQAMessage[];
  phase: string | null;
  progress: number;
  input: string;
  sending: boolean;
  error?: string | null;
  onInputChange: (value: string) => void;
  onSend: () => void;
};

export function TaskConversation({
  messages,
  phase,
  progress,
  input,
  sending,
  error,
  onInputChange,
  onSend,
}: TaskConversationProps) {
  const safeProgress = Math.min(100, Math.max(0, Math.round(progress)));

  return (
    <>
      <section className="task-conversation" role="log" aria-label="任务对话" aria-live="polite">
        <header>
          <div>
            <span>持续会话</span>
            <h3>任务对话</h3>
          </div>
          <small>小易回传与客户追问</small>
        </header>
        <div className="task-conversation-messages">
          {messages.length === 0 ? (
            <div className="task-conversation-empty">
              <strong>还没有任务对话</strong>
              <p>任务执行期间可在下方追问进度、失败原因或结果含义。</p>
            </div>
          ) : messages.map((message) => {
            const isUser = message.role === 'user';
            return (
              <article
                className={`task-conversation-message ${isUser ? 'task-conversation-message--user' : 'task-conversation-message--assistant'}`}
                key={message.id}
              >
                <div>
                  <strong>{isUser ? '您' : '任务助手'}</strong>
                  <time>{new Date(message.created_at).toLocaleString()}</time>
                </div>
                <p>{message.content}</p>
              </article>
            );
          })}
        </div>
      </section>

      <div className="task-conversation-composer task-conversation-composer--floating">
        <div className="task-conversation-progress">
          <span>{phase || '等待阶段信息'}</span>
          <strong>{safeProgress}%</strong>
          <Progress percent={safeProgress} showInfo={false} size="small" />
        </div>
        {error ? <Alert type="error" showIcon message={error} /> : null}
        <div className="task-conversation-input-row">
          <Input.TextArea
            aria-label="向任务提问"
            autoSize={{ minRows: 1, maxRows: 3 }}
            value={input}
            placeholder="向任务提问，例如：为什么失败？"
            onChange={(event) => onInputChange(event.target.value)}
            onPressEnter={(event) => {
              if (!event.shiftKey) {
                event.preventDefault();
                onSend();
              }
            }}
          />
          <Button
            aria-label="发送任务问题"
            type="primary"
            shape="circle"
            icon={<SendOutlined />}
            loading={sending}
            disabled={!input.trim()}
            onClick={onSend}
          />
        </div>
      </div>
    </>
  );
}
