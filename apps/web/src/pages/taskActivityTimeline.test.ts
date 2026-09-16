import type { TaskQAMessage } from '../api/pentest';
import type { PentestToolEvent } from './pentestToolFeed';
import {
  buildTaskTimeline,
  formatActivityRange,
  formatActivityTime,
  groupTaskTools,
} from './taskActivityTimeline';

const toolEvents: PentestToolEvent[] = [
  {
    id: 'subfinder:1',
    name: 'run_subfinder',
    phase: 'INFORMATION_GATHERING',
    state: 'success',
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

describe('task activity timeline', () => {
  it('groups a phase and consolidates repeated tool calls', () => {
    const groups = groupTaskTools(toolEvents);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      key: 'discovery',
      label: '信息收集',
      totalCalls: 3,
      uniqueTools: 2,
      completedCalls: 1,
      failedCalls: 1,
      runningCalls: 1,
      progress: 67,
      startedAt: '2026-08-03T10:00:00',
      updatedAt: '2026-08-03T10:04:00',
    });
    expect(groups[0].tools[0]).toMatchObject({
      name: 'run_subfinder',
      callCount: 2,
      state: 'failed',
      progress: 100,
      latestAt: '2026-08-03T10:02:00',
    });
    expect(groups[0].tools[0].calls.map((call) => call.id))
      .toEqual(['subfinder:1', 'subfinder:2']);
  });

  it('merges phase groups and QA messages in timestamp order', () => {
    const reportTool: PentestToolEvent = {
      id: 'report:1',
      name: 'generate_report',
      phase: 'REPORT_GENERATION',
      state: 'running',
      steps: [],
      narratives: [],
      startedAt: '2026-08-03T11:00:00',
    };
    const message: TaskQAMessage = {
      id: '11111111-1111-4111-8111-111111111111',
      task_id: '22222222-2222-4222-8222-222222222222',
      user_id: '33333333-3333-4333-8333-333333333333',
      role: 'user',
      content: '现在进行到哪一步？',
      created_at: '2026-08-03T10:30:00',
    };

    const entries = buildTaskTimeline(
      groupTaskTools([...toolEvents, reportTool]),
      [message],
    );

    expect(entries.map((entry) => entry.kind)).toEqual(['phase', 'message', 'phase']);
    expect(entries[0].id).toBe('phase:discovery');
    expect(entries[1].id).toBe(`message:${message.id}`);
    expect(entries[2].id).toBe('phase:reporting');
  });

  it('formats local timestamps and safely handles missing values', () => {
    expect(formatActivityTime('2026-08-03T10:00:00')).toBe('2026-08-03 10:00:00');
    expect(formatActivityRange(
      '2026-08-03T10:00:00',
      '2026-08-03T10:04:00',
    )).toBe('2026-08-03 10:00:00 — 2026-08-03 10:04:00');
    expect(formatActivityTime('invalid')).toBe('时间待同步');
    expect(formatActivityRange()).toBe('时间待同步');
  });
});
