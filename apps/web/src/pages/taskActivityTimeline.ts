import type { TaskQAMessage } from '../api/pentest';
import type { PentestToolEvent } from './pentestToolFeed';

export type TaskToolSummary = {
  key: string;
  name: string;
  callCount: number;
  state: PentestToolEvent['state'];
  progress: number;
  latestAt?: string;
  calls: PentestToolEvent[];
};

export type TaskPhaseGroup = {
  key: string;
  label: string;
  totalCalls: number;
  uniqueTools: number;
  completedCalls: number;
  failedCalls: number;
  runningCalls: number;
  progress: number;
  startedAt?: string;
  updatedAt?: string;
  tools: TaskToolSummary[];
};

export type TaskTimelineEntry =
  | { kind: 'phase'; id: string; timestamp?: string; group: TaskPhaseGroup }
  | { kind: 'message'; id: string; timestamp?: string; message: TaskQAMessage };

type PhaseCategory = { key: string; label: string };

function phaseCategory(phase: string): PhaseCategory {
  const value = phase.trim().toLowerCase();
  if (/init|start|prepare|初始化|准备/.test(value)) {
    return { key: 'initialization', label: '任务初始化' };
  }
  if (/recon|information|discover|asset|subdomain|fingerprint|信息|资产|侦察/.test(value)) {
    return { key: 'discovery', label: '信息收集' };
  }
  if (/scan|vulnerab|detect|probe|漏洞|探测|扫描/.test(value)) {
    return { key: 'scanning', label: '漏洞探测' };
  }
  if (/exploit|validate|verify|fuzz|penetrat|利用|验证|渗透/.test(value)) {
    return { key: 'exploitation', label: '验证利用' };
  }
  if (/report|summary|finish|complete|报告|总结/.test(value)) {
    return { key: 'reporting', label: '报告生成' };
  }
  return { key: 'other', label: '其他执行步骤' };
}

function timeValue(value?: string) {
  if (!value) return undefined;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function firstAndLatest(values: Array<string | undefined>) {
  const valid = values
    .flatMap((value) => {
      const timestamp = timeValue(value);
      return timestamp === undefined || value === undefined ? [] : [{ value, timestamp }];
    })
    .sort((left, right) => left.timestamp - right.timestamp);
  return {
    first: valid[0]?.value,
    latest: valid.at(-1)?.value,
  };
}

function toolState(calls: PentestToolEvent[]): PentestToolEvent['state'] {
  if (calls.some((call) => call.state === 'failed')) return 'failed';
  if (calls.some((call) => call.state === 'running')) return 'running';
  return 'success';
}

function terminalProgress(calls: PentestToolEvent[]) {
  if (calls.length === 0) return 0;
  const terminal = calls.filter((call) => call.state !== 'running').length;
  return Math.round((terminal / calls.length) * 100);
}

export function groupTaskTools(tools: PentestToolEvent[]): TaskPhaseGroup[] {
  const phases = new Map<string, { category: PhaseCategory; tools: PentestToolEvent[]; order: number }>();
  tools.forEach((tool, index) => {
    const category = phaseCategory(tool.phase);
    const current = phases.get(category.key);
    if (current) current.tools.push(tool);
    else phases.set(category.key, { category, tools: [tool], order: index });
  });

  return [...phases.values()].map(({ category, tools: phaseTools, order }) => {
    const consolidated = new Map<string, { name: string; calls: PentestToolEvent[]; order: number }>();
    phaseTools.forEach((tool, index) => {
      const key = tool.name.trim().toLowerCase() || '未知工具';
      const current = consolidated.get(key);
      if (current) current.calls.push(tool);
      else consolidated.set(key, { name: tool.name || '未知工具', calls: [tool], order: index });
    });
    const tools = [...consolidated.entries()]
      .sort((left, right) => left[1].order - right[1].order)
      .map(([key, item]): TaskToolSummary => {
        const range = firstAndLatest(item.calls.map((call) => call.startedAt));
        return {
          key: `${category.key}:${key}`,
          name: item.name,
          callCount: item.calls.length,
          state: toolState(item.calls),
          progress: terminalProgress(item.calls),
          latestAt: range.latest,
          calls: [...item.calls].sort((left, right) => (
            (timeValue(left.startedAt) ?? Number.MAX_SAFE_INTEGER)
            - (timeValue(right.startedAt) ?? Number.MAX_SAFE_INTEGER)
          )),
        };
      });
    const range = firstAndLatest(phaseTools.map((tool) => tool.startedAt));
    const completedCalls = phaseTools.filter((tool) => tool.state === 'success').length;
    const failedCalls = phaseTools.filter((tool) => tool.state === 'failed').length;
    const runningCalls = phaseTools.filter((tool) => tool.state === 'running').length;
    return {
      key: category.key,
      label: category.label,
      totalCalls: phaseTools.length,
      uniqueTools: tools.length,
      completedCalls,
      failedCalls,
      runningCalls,
      progress: terminalProgress(phaseTools),
      startedAt: range.first,
      updatedAt: range.latest,
      tools,
      order,
    };
  }).sort((left, right) => {
    const leftTime = timeValue(left.startedAt);
    const rightTime = timeValue(right.startedAt);
    if (leftTime !== undefined && rightTime !== undefined) return leftTime - rightTime;
    if (leftTime !== undefined) return -1;
    if (rightTime !== undefined) return 1;
    return left.order - right.order;
  }).map(({ order: _order, ...group }) => group);
}

export function buildTaskTimeline(
  groups: TaskPhaseGroup[],
  messages: TaskQAMessage[],
): TaskTimelineEntry[] {
  const entries: Array<TaskTimelineEntry & { order: number }> = [
    ...groups.map((group, index) => ({
      kind: 'phase' as const,
      id: `phase:${group.key}`,
      timestamp: group.startedAt,
      group,
      order: index,
    })),
    ...messages.map((message, index) => ({
      kind: 'message' as const,
      id: `message:${message.id}`,
      timestamp: message.created_at,
      message,
      order: groups.length + index,
    })),
  ];
  return entries.sort((left, right) => {
    const leftTime = timeValue(left.timestamp);
    const rightTime = timeValue(right.timestamp);
    if (leftTime !== undefined && rightTime !== undefined) return leftTime - rightTime || left.order - right.order;
    if (leftTime !== undefined) return -1;
    if (rightTime !== undefined) return 1;
    return left.order - right.order;
  }).map(({ order: _order, ...entry }) => entry);
}

export function formatActivityTime(value?: string) {
  const timestamp = timeValue(value);
  if (timestamp === undefined) return '时间待同步';
  const date = new Date(timestamp);
  const two = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())} ${two(date.getHours())}:${two(date.getMinutes())}:${two(date.getSeconds())}`;
}

export function formatActivityRange(startedAt?: string, updatedAt?: string) {
  const start = formatActivityTime(startedAt);
  const end = formatActivityTime(updatedAt);
  if (start === '时间待同步') return end;
  if (end === '时间待同步' || start === end) return start;
  return `${start} — ${end}`;
}
