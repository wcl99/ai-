import {
  ApiOutlined,
  ClockCircleOutlined,
  MessageOutlined,
  SendOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Alert, Button, Input, Progress, Tag } from 'antd';
import { useMemo } from 'react';
import type { TaskQAMessage } from '../api/pentest';
import type { PentestToolEvent } from '../pages/pentestToolFeed';
import {
  buildTaskTimeline,
  formatActivityRange,
  formatActivityTime,
  groupTaskTools,
  type TaskPhaseGroup,
  type TaskToolSummary,
} from '../pages/taskActivityTimeline';

type TaskConversationProps = {
  messages: TaskQAMessage[];
  tools: PentestToolEvent[];
  status: string;
  updatedAt?: string;
  phase: string | null;
  progress: number;
  input: string;
  sending: boolean;
  error?: string | null;
  onInputChange: (value: string) => void;
  onSend: () => void;
};

const stateLabels = {
  success: '完成',
  failed: '失败',
  running: '处理中',
} as const;

const stateColors = {
  success: 'green',
  failed: 'red',
  running: 'blue',
} as const;

function ToolActivity({ tool }: { tool: TaskToolSummary }) {
  return (
    <details className={`task-tool-entry task-tool-entry--${tool.state}`}>
      <summary>
        <span className="task-tool-icon"><ApiOutlined /></span>
        <span className="task-tool-name">
          <strong>{tool.name}</strong>
          <small>{formatActivityTime(tool.latestAt)}</small>
        </span>
        <span className="task-tool-count">调用 × {tool.callCount}</span>
        <span className="task-tool-actions">
          <Tag color={stateColors[tool.state]}>{stateLabels[tool.state]}</Tag>
          <span className="task-disclosure-label task-disclosure-label--closed">查看调用</span>
          <span className="task-disclosure-label task-disclosure-label--open">收起调用</span>
        </span>
      </summary>
      <div className="task-tool-calls">
        {tool.calls.map((call, index) => (
          <article className="task-tool-call" key={call.id}>
            <header>
              <strong>第 {index + 1} 次调用</strong>
              <time>{formatActivityTime(call.startedAt)}</time>
              <Tag color={stateColors[call.state]}>{stateLabels[call.state]}</Tag>
            </header>
            <div className="task-tool-call-phase">阶段：{call.phase}</div>
            {call.steps.length ? (
              <div className="orchestrator-steps">
                {call.steps.map((step, stepIndex) => (
                  <Tag key={`${step.label}:${stepIndex}`}>{step.label} · {step.status}</Tag>
                ))}
              </div>
            ) : null}
            {call.narratives.length ? (
              <div className="orchestrator-narratives" aria-label="客户可读的执行说明">
                {call.narratives.map((narrative, narrativeIndex) => (
                  <section
                    className={`orchestrator-narrative orchestrator-narrative--${narrative.state}`}
                    key={`${narrative.actor}:${narrative.message}:${narrative.timestamp ?? narrativeIndex}`}
                  >
                    <header>
                      <strong>{narrative.actor}</strong>
                      <span>{narrative.state === 'waiting' ? '等待前置结果' : narrative.state === 'running' ? '正在执行' : narrative.state === 'completed' ? '已完成' : narrative.state === 'failed' ? '执行异常' : '状态更新'}</span>
                    </header>
                    <p className="orchestrator-narrative-message">{narrative.message}</p>
                    <p className="orchestrator-narrative-explanation"><b>这一步在做什么：</b>{narrative.explanation}</p>
                    {narrative.repeatCount > 1 ? <small>已合并 {narrative.repeatCount} 条过程更新</small> : null}
                    {narrative.timestamp ? <time>{formatActivityTime(narrative.timestamp)}</time> : null}
                  </section>
                ))}
              </div>
            ) : null}
            {call.error ? <div className="task-tool-call-error">{call.error}</div> : null}
            {call.arguments ? (
              <div className="orchestrator-payload">
                <span>调用参数</span>
                <pre>{JSON.stringify(call.arguments, null, 2)}</pre>
              </div>
            ) : null}
            {call.resultPreview ? (
              <div className="orchestrator-payload">
                <span>接口原始返回</span>
                <pre>{call.resultPreview}</pre>
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </details>
  );
}

function PhaseActivity({ group }: { group: TaskPhaseGroup }) {
  const state = group.failedCalls > 0 ? 'failed' : group.runningCalls > 0 ? 'running' : 'success';
  return (
    <details className={`task-activity-entry task-phase-entry task-phase-entry--${state}`}>
      <summary>
        <span className="task-timeline-marker"><ApiOutlined /></span>
        <span className="task-phase-title">
          <strong>{group.label}</strong>
          <time>{formatActivityRange(group.startedAt, group.updatedAt)}</time>
        </span>
        <span className="task-phase-metrics">
          <span>{group.totalCalls} 次调用</span>
          <span>{group.uniqueTools} 个工具</span>
          {group.failedCalls ? <span className="task-phase-failed">{group.failedCalls} 次失败</span> : null}
        </span>
        <span className="task-phase-progress">
          <strong>{group.progress}%</strong>
          <Progress percent={group.progress} showInfo={false} size="small" />
        </span>
        <span className="task-phase-disclosure">
          <span className="task-phase-disclosure--closed">展开详情</span>
          <span className="task-phase-disclosure--open">收起详情</span>
        </span>
      </summary>
      <div className="task-phase-tools">
        {group.tools.map((tool) => <ToolActivity tool={tool} key={tool.key} />)}
      </div>
    </details>
  );
}

function ConversationActivity({ message }: { message: TaskQAMessage }) {
  const isUser = message.role === 'user';
  return (
    <article className={`task-activity-entry task-message-entry task-message-entry--${isUser ? 'user' : 'assistant'}`}>
      <span className="task-timeline-marker">{isUser ? <UserOutlined /> : <MessageOutlined />}</span>
      <div>
        <header>
          <strong>{isUser ? '您' : '小易任务助手'}</strong>
          <time>{formatActivityTime(message.created_at)}</time>
        </header>
        <p>{message.content}</p>
      </div>
    </article>
  );
}

export function TaskConversation({
  messages,
  tools,
  status,
  updatedAt,
  phase,
  progress,
  input,
  sending,
  error,
  onInputChange,
  onSend,
}: TaskConversationProps) {
  const safeProgress = Math.min(100, Math.max(0, Math.round(progress)));
  const entries = useMemo(
    () => buildTaskTimeline(groupTaskTools(tools), messages),
    [messages, tools],
  );

  return (
    <>
      <section
        className="task-activity-timeline"
        role="log"
        aria-label="任务编排时间线"
        aria-live="polite"
      >
        <header className="task-activity-header">
          <div>
            <span>任务实时编排</span>
            <h3>执行时间线</h3>
            <p>工具调用、阶段进度和任务对话按时间统一展示</p>
          </div>
          <div className="task-activity-status">
            <Tag color={status === 'FAILED' ? 'red' : status === 'SUCCEEDED' ? 'green' : 'blue'}>{status}</Tag>
            <strong>{safeProgress}%</strong>
            <time><ClockCircleOutlined /> {formatActivityTime(updatedAt)}</time>
          </div>
        </header>
        <div className="task-activity-stream">
          {messages.length === 0 ? (
            <article className="task-activity-entry task-message-entry task-message-entry--assistant task-intake-prompt">
              <span className="task-timeline-marker"><MessageOutlined /></span>
              <div>
                <header><strong>小易任务助手</strong></header>
                <p><b>任务已开始，您可以补充测试信息</b></p>
                <p>如有白盒账号、特殊入口、测试限制或业务窗口，请在下方对话框发送；不回复不会影响任务继续执行。</p>
              </div>
            </article>
          ) : null}
          {entries.length === 0 ? (
            <div className="task-activity-empty">
              <span className="task-timeline-marker"><ClockCircleOutlined /></span>
              <div>
                <strong>正在等待小易返回任务编排信息</strong>
                <p>收到阶段、工具或对话更新后会自动显示在这里。</p>
              </div>
            </div>
          ) : entries.map((entry) => (
            entry.kind === 'phase'
              ? <PhaseActivity group={entry.group} key={entry.id} />
              : <ConversationActivity message={entry.message} key={entry.id} />
          ))}
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
