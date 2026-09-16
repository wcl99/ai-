# Central Task Conversation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the task session's right expert panel, preserve Xiaoyi feedback in a compact central conversation, and keep task QA available through a floating bottom composer.

**Architecture:** Keep the planning page and all existing REST queries unchanged. The task session becomes a two-column grid; its central stream renders compact normalized tool events plus an inline QA conversation, while a focused `TaskConversation` component owns message presentation and the fixed composer.

**Tech Stack:** React 18, TypeScript, Ant Design, TanStack Query, Vitest, Testing Library, existing CSS.

---

### Task 1: Lock the new session behavior with failing tests

**Files:**
- Modify: `apps/web/src/pages/PentestSessionPage.test.tsx`

- [ ] **Step 1: Replace the old side-panel assertions with central conversation assertions**

Add assertions equivalent to:

```tsx
expect(screen.queryByRole('complementary', { name: '专家咨询区' }))
  .not.toBeInTheDocument();
expect(screen.getByRole('log', { name: '任务对话' })).toBeInTheDocument();
expect(view.container.querySelector('.task-conversation-composer--floating'))
  .toBeInTheDocument();
```

For tool content, assert that the tool name and progress remain visible while the
narrative and raw result live inside a closed `details` element.

- [ ] **Step 2: Update the QA interaction test to use the new task composer labels**

Use `向任务提问` and `发送任务问题`, then retain the existing assertion that the
request posts `{ content }` to `/api/v1/tasks/{taskId}/qa/messages` and that both
messages render centrally.

- [ ] **Step 3: Run the focused test and verify RED**

Run:

```powershell
npm run test -- PentestSessionPage.test.tsx
```

Expected: failures because the expert panel is still present and the central
conversation/floating composer do not exist.

- [ ] **Step 4: Commit the failing behavioral contract**

```powershell
git add apps/web/src/pages/PentestSessionPage.test.tsx
git commit -m "test(web): define central task conversation"
```

### Task 2: Add the central task conversation component

**Files:**
- Create: `apps/web/src/components/TaskConversation.tsx`
- Create: `apps/web/src/components/TaskConversation.test.tsx`

- [ ] **Step 1: Write focused component tests**

Cover these behaviors:

```tsx
expect(screen.getByRole('log', { name: '任务对话' })).toBeInTheDocument();
expect(screen.getByText('为什么失败？')).toBeInTheDocument();
expect(screen.getByLabelText('向任务提问')).toHaveValue('继续检查');
expect(view.container.querySelector('.task-conversation-composer--floating'))
  .toBeInTheDocument();
```

Verify change and send callbacks, disabled-empty behavior, sending state, and an
inline error message.

- [ ] **Step 2: Run the component test and verify RED**

Run:

```powershell
npm run test -- TaskConversation.test.tsx
```

Expected: failure because `TaskConversation.tsx` does not exist.

- [ ] **Step 3: Implement the minimal component**

The component accepts existing `TaskQAMessage[]`, phase, progress, input,
sending, optional error, and callbacks. Render a central `role="log"` message
section followed by a fixed composer:

```tsx
<section className="task-conversation" role="log" aria-label="任务对话">
  {messages.map((message) => (
    <article className={`task-conversation-message task-conversation-message--${message.role}`}>
      <strong>{message.role === 'user' ? '您' : '任务助手'}</strong>
      <p>{message.content}</p>
    </article>
  ))}
</section>
<div className="task-conversation-composer task-conversation-composer--floating">
  <div className="task-conversation-progress">
    <span>{phase || '等待阶段信息'}</span><span>{Math.round(progress)}%</span>
  </div>
  <Input aria-label="向任务提问" value={input} onPressEnter={onSend} />
</div>
```

Use the existing Ant Design button and icons; add no dependency.

- [ ] **Step 4: Run the focused component test and verify GREEN**

Run:

```powershell
npm run test -- TaskConversation.test.tsx
```

Expected: all component tests pass.

- [ ] **Step 5: Commit the component**

```powershell
git add apps/web/src/components/TaskConversation.tsx apps/web/src/components/TaskConversation.test.tsx
git commit -m "feat(web): add central task conversation"
```

### Task 3: Integrate compact tools and the floating conversation into the session

**Files:**
- Modify: `apps/web/src/pages/PentestPage.tsx`
- Modify: `apps/web/src/styles.css`
- Test: `apps/web/src/pages/PentestSessionPage.test.tsx`

- [ ] **Step 1: Remove the task-session `ExpertFeedbackPanel`**

Keep the existing planning-page use. In `PentestSessionPage`, remove the
`buildPentestFeedback` memo and the final side-panel render. Import and render
`TaskConversation` inside the central `<main>` using `qaQuery.data`, `qaError`,
`task.phase`, `task.progress`, and the existing mutation callbacks.

- [ ] **Step 2: Collapse all verbose tool content**

Keep the compact card header visible. Add an Ant Design progress bar derived
from tool state/steps. Move `orchestrator-steps`, `orchestrator-narratives`, tool
errors, arguments, and raw result previews into one closed disclosure:

```tsx
<Progress percent={toolProgress(tool)} size="small" showInfo={false} />
<details className="orchestrator-technical-details">
  <summary>查看详细信息</summary>
  {/* steps, narratives, errors, arguments, and results */}
</details>
```

The collapsed header must continue showing the tool name, phase, status tag,
and progress.

- [ ] **Step 3: Convert the workbench to two columns and add composer clearance**

Replace the session grid with `250px minmax(0, 1fr)`. Remove session-only expert
panel responsive rules. Give the central stream bottom padding matching the
floating composer height. Position the composer with `position: fixed`, a
bounded width, and responsive left/right offsets; use transform/opacity only
for transitions and disable motion under `prefers-reduced-motion`.

- [ ] **Step 4: Run the session test and verify GREEN**

Run:

```powershell
npm run test -- PentestSessionPage.test.tsx TaskConversation.test.tsx
```

Expected: all focused tests pass.

- [ ] **Step 5: Commit the integration**

```powershell
git add apps/web/src/pages/PentestPage.tsx apps/web/src/styles.css apps/web/src/pages/PentestSessionPage.test.tsx
git commit -m "feat(web): centralize Xiaoyi task feedback"
```

### Task 4: Full verification

**Files:**
- Verify only; no new files expected.

- [ ] **Step 1: Run all frontend tests**

```powershell
npm run test
```

Expected: all Vitest tests pass with zero failures.

- [ ] **Step 2: Run lint**

```powershell
npm run lint
```

Expected: zero ESLint errors.

- [ ] **Step 3: Run the production build**

```powershell
npm run build
```

Expected: TypeScript check and Vite build both exit 0.

- [ ] **Step 4: Review the final diff**

Confirm the diff contains no backend/API changes, no new dependency, no expert
side panel in the task session, and no accidental changes under
`apps/api/data/`.

- [ ] **Step 5: Commit any final verification-only corrections**

If a correction was required, commit only the relevant frontend files with a
focused Conventional Commit message.
