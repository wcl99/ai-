# Unified Task Timeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge Xiaoyi tool activity and task QA into one timestamped orchestration timeline, with repeated tool calls consolidated by phase and tool name.

**Architecture:** Add one pure timeline normalization module that classifies phases, consolidates repeated tools, formats timestamps, and merges phase groups with QA messages. Refactor the existing `TaskConversation` component into the single central timeline surface plus its existing floating composer, then replace the separate tool-feed markup in `PentestSessionPage` with that component.

**Tech Stack:** React 18, TypeScript, Ant Design, TanStack Query, Vitest, Testing Library, existing CSS.

---

### Task 1: Normalize and group task activity

**Files:**
- Create: `apps/web/src/pages/taskActivityTimeline.ts`
- Create: `apps/web/src/pages/taskActivityTimeline.test.ts`

- [ ] **Step 1: Write the failing grouping tests**

Define fixtures with two `run_subfinder` events in `INFORMATION_GATHERING`, one
successful and one failed, plus a running `get_emails` event. Assert the wished-for
API:

```ts
const groups = groupTaskTools(events);
expect(groups).toHaveLength(1);
expect(groups[0]).toMatchObject({
  label: '信息收集',
  totalCalls: 3,
  uniqueTools: 2,
  completedCalls: 1,
  failedCalls: 1,
  runningCalls: 1,
  progress: 67,
});
expect(groups[0].tools[0]).toMatchObject({ name: 'run_subfinder', callCount: 2 });
expect(groups[0].startedAt).toBe('2026-08-03T02:00:00Z');
expect(groups[0].updatedAt).toBe('2026-08-03T02:04:00Z');
```

Also test `buildTaskTimeline(groups, messages)` orders a QA message between phase
groups by timestamp, and `formatActivityTime('invalid')` returns `时间待同步`.

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
& $node node_modules/vitest/vitest.mjs run src/pages/taskActivityTimeline.test.ts
```

Expected: FAIL because `taskActivityTimeline.ts` does not exist.

- [ ] **Step 3: Implement the minimal pure normalizer**

Export these focused types and functions:

```ts
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

export function groupTaskTools(tools: PentestToolEvent[]): TaskPhaseGroup[];
export function buildTaskTimeline(
  groups: TaskPhaseGroup[],
  messages: TaskQAMessage[],
): TaskTimelineEntry[];
export function formatActivityTime(value?: string): string;
export function formatActivityRange(startedAt?: string, updatedAt?: string): string;
```

Classify phase strings with small regular expressions into initialization,
discovery, scanning, exploitation, reporting, or other. Consolidate with a
`Map` keyed by phase category and lower-cased tool name. Count success and failed
calls as terminal work when deriving progress. Sort valid timestamps first and
retain input order when timestamps are missing or equal.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the Task 1 Vitest command again. Expected: all new tests pass.

- [ ] **Step 5: Commit the normalizer**

```powershell
git add apps/web/src/pages/taskActivityTimeline.ts apps/web/src/pages/taskActivityTimeline.test.ts
git commit -m "feat(web): group task activity by phase"
```

### Task 2: Render tools and QA in one timeline surface

**Files:**
- Modify: `apps/web/src/components/TaskConversation.tsx`
- Modify: `apps/web/src/components/TaskConversation.test.tsx`

- [ ] **Step 1: Replace the component test with the unified-surface contract**

Render two duplicate tool events and two QA messages. Assert:

```tsx
expect(screen.getByRole('log', { name: '任务编排时间线' })).toBeInTheDocument();
expect(view.container.querySelectorAll('.task-activity-timeline')).toHaveLength(1);
expect(screen.getByText('信息收集')).toBeInTheDocument();
expect(screen.getByText('3 次调用')).toBeInTheDocument();
expect(screen.getByText('调用 × 2')).toBeInTheDocument();
expect(screen.getByText('2026-08-03 10:00:00')).toBeInTheDocument();
expect(screen.getByText('为什么失败？')).toBeInTheDocument();
expect(screen.getByText('小易任务助手')).toBeInTheDocument();
```

Assert the phase and tool disclosures are closed, individual error/payload text is
contained within them, and the floating composer callbacks still work.

- [ ] **Step 2: Run the component test and verify RED**

Run:

```powershell
& $node node_modules/vitest/vitest.mjs run src/components/TaskConversation.test.tsx
```

Expected: FAIL because the component still renders a separate QA card and accepts
no tool events.

- [ ] **Step 3: Implement the unified component**

Extend props with `tools`, `status`, and `updatedAt`. Use `groupTaskTools` and
`buildTaskTimeline` with `useMemo`. Render exactly one central surface:

```tsx
<section className="task-activity-timeline" role="log" aria-label="任务编排时间线">
  <header className="task-activity-header">...</header>
  <div className="task-activity-stream">
    {entries.map((entry) => entry.kind === 'phase'
      ? <PhaseActivity key={entry.id} group={entry.group} />
      : <ConversationActivity key={entry.id} message={entry.message} />)}
  </div>
</section>
```

`PhaseActivity` uses one closed `details` summary showing phase counts, progress,
and time range. Its expanded body renders divider rows for consolidated tools.
Each tool row shows latest time and `调用 × N`; one nested closed disclosure holds
individual callbacks and their existing narratives, steps, errors, parameters,
and raw results. `ConversationActivity` is a plain timeline row with speaker,
timestamp, and content. Keep the existing composer markup after the surface.

- [ ] **Step 4: Run the component test and verify GREEN**

Run the Task 2 Vitest command again. Expected: all component tests pass.

- [ ] **Step 5: Commit the unified component**

```powershell
git add apps/web/src/components/TaskConversation.tsx apps/web/src/components/TaskConversation.test.tsx
git commit -m "feat(web): render unified task activity timeline"
```

### Task 3: Replace the separate session feeds

**Files:**
- Modify: `apps/web/src/pages/PentestPage.tsx`
- Modify: `apps/web/src/pages/PentestSessionPage.test.tsx`
- Modify: `apps/web/src/styles.css`

- [ ] **Step 1: Write the failing page integration assertions**

Add a second `run_subfinder` tool callback to the existing task-session fixture.
Assert there is one `任务编排时间线` log, duplicate tools consolidate to one
visible summary with `调用 × 2`, timestamps render, QA text shares that log, and
the old `.orchestrator-feed` and `.task-conversation` elements are absent.

- [ ] **Step 2: Run the page test and verify RED**

Run:

```powershell
& $node node_modules/vitest/vitest.mjs run src/pages/PentestSessionPage.test.tsx
```

Expected: FAIL because `PentestPage` still renders the old tool feed separately.

- [ ] **Step 3: Integrate the unified component**

Delete the `orchestrator-feed` JSX and session-only `toolProgress` helper from
`PentestPage.tsx`. Pass the normalized `orchestratorTools`, task status, update
time, QA messages, progress, phase, composer state, and callbacks into the one
`TaskConversation` render.

Replace old tool-feed and QA-card styles with:

- `.task-activity-timeline` as the only white central surface;
- `.task-activity-stream` as one vertical rail;
- `.task-phase-entry` and `.task-message-entry` as border-separated rows, not cards;
- compact group metrics and timestamps;
- indented tool rows and nested technical disclosures;
- retained floating composer offsets and responsive behavior.

Do not change planning-page expert consultation styles.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```powershell
& $node node_modules/vitest/vitest.mjs run src/pages/taskActivityTimeline.test.ts src/components/TaskConversation.test.tsx src/pages/PentestSessionPage.test.tsx
```

Expected: all focused tests pass.

- [ ] **Step 5: Commit the integration**

```powershell
git add apps/web/src/pages/PentestPage.tsx apps/web/src/pages/PentestSessionPage.test.tsx apps/web/src/styles.css
git commit -m "feat(web): unify task tools and conversation"
```

### Task 4: Full verification and delivery

**Files:**
- Verify only.

- [ ] **Step 1: Run the complete frontend suite**

```powershell
& $node node_modules/vitest/vitest.mjs run
```

Expected: every Vitest test passes with zero failures.

- [ ] **Step 2: Run lint and TypeScript checking**

```powershell
& $node node_modules/eslint/bin/eslint.js .
& $node node_modules/typescript/bin/tsc --noEmit
```

Expected: both commands exit zero without errors.

- [ ] **Step 3: Build the production frontend**

```powershell
& $node node_modules/vite/bin/vite.js build
```

Expected: Vite exits zero and writes `apps/web/dist`.

- [ ] **Step 4: Review and publish**

Run `git diff --check`, confirm only `apps/api/data/` remains untracked, push
`codex/project-handoff`, package the commit with the prebuilt deployment flow,
deploy it to `101.43.119.26:8000`, and verify `/health/ready` returns HTTP 200 with
`{"status":"ready"}` and the production JavaScript contains
`task-activity-timeline`.
