import {
  ApiOutlined,
  ClockCircleOutlined,
  MessageOutlined,
  RobotOutlined,
  SendOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Alert, Button, Input, Progress, Tag } from 'antd';
import { useMemo } from 'react';
import type { TaskQAMessage } from '../api/pentest';
import type { PentestToolEvent } from '../pages/pentestToolFeed';

const taskStatusLabels: Record<string, string> = {
  QUEUED: '排队中',
  RUNNING: '执行中',
  CANCELLING: '取消中',
  SUCCEEDED: '已完成',
  PARTIAL_SUCCEEDED: '部分完成',
  FAILED: '失败',
  CANCELLED: '已取消',
};
import {
  formatActivityTime,
} from '../pages/taskActivityTimeline';
import { displayPhase, sanitizeDisplayText } from '../vendorDisplay';

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
  onToolSelect?: (tool: PentestToolEvent) => void;
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

function explainToolActivity(tool: PentestToolEvent) {
  const narrative = tool.narratives.find((item) => item.explanation.trim());
  if (narrative) return narrative.explanation;
  const identity = tool.name.toLowerCase();
  if (/subfinder|subdomain|domain_by_company/.test(identity)) {
    return '目的是枚举目标的公开子域名和关联入口，为后续服务识别与漏洞验证补全资产范围。';
  }
  if (/httpx|probe|fingerprint/.test(identity)) {
    return '目的是确认目标入口是否可访问，并识别协议、状态和基础技术特征。';
  }
  if (/email/.test(identity)) {
    return '目的是整理目标公开暴露的联系信息，用于识别可能存在的账号与身份风险。';
  }
  return `目的是完成 ${displayPhase(tool.phase)} 阶段的当前验证，并把结果交给后续步骤。`;
}

function ToolActivity({
  tool,
  onToolSelect,
  showPhaseMarker,
}: {
  tool: PentestToolEvent;
  onToolSelect?: (tool: PentestToolEvent) => void;
  showPhaseMarker: boolean;
}) {
  return (
    <article className={`task-activity-entry task-tool-timeline-entry task-tool-entry--${tool.state}`}>
      <div className="task-tool-intent">
        {showPhaseMarker ? <span className="task-tool-intent-icon" aria-hidden="true"><RobotOutlined /></span> : null}
        <p>
          调用 <code>{tool.name}</code> 工具，{explainToolActivity(tool)}
        </p>
      </div>
      <button
        aria-label={`打开 ${tool.name} 执行监控`}
        className="task-tool-card"
        type="button"
        onClick={() => onToolSelect?.(tool)}
      >
        <span className="task-timeline-marker"><ApiOutlined /></span>
        <span className="task-tool-card-icon" aria-hidden="true"><ApiOutlined /></span>
        <span className="task-tool-card-copy">
          <small>调用工具</small>
          <strong>{tool.name}</strong>
        </span>
        <time>{formatActivityTime(tool.startedAt)}</time>
        <Tag color={stateColors[tool.state]}>{stateLabels[tool.state]}</Tag>
      </button>
    </article>
  );
}

function ConversationActivity({ message }: { message: TaskQAMessage }) {
  const isUser = message.role === 'user';
  return (
    <article className={`task-activity-entry task-message-entry task-message-entry--${isUser ? 'user' : 'assistant'}`}>
      <span className="task-timeline-marker">{isUser ? <UserOutlined /> : <MessageOutlined />}</span>
      <div>
        <header>
          <strong>{isUser ? '您' : '平台任务助手'}</strong>
          <time>{formatActivityTime(message.created_at)}</time>
        </header>
        <p>{sanitizeDisplayText(message.content)}</p>
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
  onToolSelect,
}: TaskConversationProps) {
  const safeProgress = Math.min(100, Math.max(0, Math.round(progress)));
  const entries = useMemo(
    () => [
      ...tools.map((tool, index) => ({
        kind: 'tool' as const,
        id: `tool:${tool.id}`,
        timestamp: tool.startedAt,
        order: index,
        tool,
      })),
      ...messages.map((message, index) => ({
        kind: 'message' as const,
        id: `message:${message.id}`,
        timestamp: message.created_at,
        order: tools.length + index,
        message,
      })),
    ].sort((left, right) => {
      const leftTime = Date.parse(left.timestamp ?? '');
      const rightTime = Date.parse(right.timestamp ?? '');
      if (!Number.isNaN(leftTime) && !Number.isNaN(rightTime)) return leftTime - rightTime || left.order - right.order;
      if (!Number.isNaN(leftTime)) return -1;
      if (!Number.isNaN(rightTime)) return 1;
      return left.order - right.order;
    }),
    [messages, tools],
  );

  return (
    <>
      <section
        className="task-activity-timeline pentest-tool-timeline"
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
            <Tag color={status === 'FAILED' ? 'red' : status === 'SUCCEEDED' ? 'green' : status === 'PARTIAL_SUCCEEDED' ? 'gold' : 'blue'}>
              {taskStatusLabels[status] ?? status}
            </Tag>
            <strong>{safeProgress}%</strong>
            <time><ClockCircleOutlined /> {formatActivityTime(updatedAt)}</time>
          </div>
        </header>
        <div className="task-activity-stream">
          {entries.length === 0 ? (
            <div className="task-activity-empty">
              <span className="task-timeline-marker"><ClockCircleOutlined /></span>
              <div>
                <strong>正在等待平台返回任务编排信息</strong>
                <p>收到阶段、工具或对话更新后会自动显示在这里。</p>
              </div>
            </div>
          ) : (() => {
            const seenPhases = new Set<string>();
            return entries.map((entry) => {
              if (entry.kind === 'message') {
                return <ConversationActivity message={entry.message} key={entry.id} />;
              }
              const phaseKey = displayPhase(entry.tool.phase).trim().toLowerCase();
              const showPhaseMarker = !seenPhases.has(phaseKey);
              seenPhases.add(phaseKey);
              return (
                <ToolActivity
                  tool={entry.tool}
                  key={entry.id}
                  onToolSelect={onToolSelect}
                  showPhaseMarker={showPhaseMarker}
                />
              );
            });
          })()}
        </div>
      </section>

      <div className="task-conversation-composer task-conversation-composer--floating pentest-composer">
        <div className="task-conversation-progress">
          <span>{displayPhase(phase)}</span>
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
