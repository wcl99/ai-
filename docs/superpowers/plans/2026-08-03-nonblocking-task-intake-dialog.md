# Nonblocking Task Intake Dialog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove every expert-consultation sidebar and ask for optional supplemental information in the existing central task conversation after a task has started.

**Architecture:** Keep plan creation, CDN/asset precheck, authorization, and task creation unchanged. Remove the planning-only sidebar state/component, and let `TaskConversation` render a local guidance entry when the current task has no persisted QA messages; real replies continue through the existing task QA API.

**Tech Stack:** React 18, TypeScript, Ant Design, TanStack Query, Vitest, Testing Library, existing platform REST APIs.

---

### Task 1: Lock the new behavior with tests

**Files:**
- Modify: `apps/web/src/pages/PentestPage.test.tsx`
- Modify: `apps/web/src/components/TaskConversation.test.tsx`
- Delete: `apps/web/src/components/ExpertFeedbackPanel.test.tsx`

- [ ] **Step 1: Replace the planning-page sidebar assertions**

After rendering `PentestPage`, assert that no complementary region named `专家咨询区` exists. After creating the draft plan, assert the same condition and keep the existing precheck and task-navigation assertions.

```tsx
expect(screen.queryByRole('complementary', { name: '专家咨询区' })).not.toBeInTheDocument();
```

- [ ] **Step 2: Add the empty-conversation guidance test**

Render `TaskConversation` with `messages={[]}` and assert that the central timeline contains the nonblocking prompt.

```tsx
expect(screen.getByText('任务已开始，您可以补充测试信息')).toBeInTheDocument();
expect(screen.getByText(/白盒账号、特殊入口、测试限制或业务窗口/)).toBeInTheDocument();
```

- [ ] **Step 3: Verify the new tests fail before implementation**

Run `npm --prefix apps/web run test -- PentestPage.test.tsx TaskConversation.test.tsx`.

Expected: failures because the sidebar still exists and the task guidance entry does not.

### Task 2: Remove the planning expert sidebar

**Files:**
- Modify: `apps/web/src/pages/PentestPage.tsx`
- Delete: `apps/web/src/components/ExpertFeedbackPanel.tsx`

- [ ] **Step 1: Remove sidebar-only imports and state**

Remove `ExpertFeedbackPanel`, `ExpertFeedbackMessage`, `planningQuestion`, `planningMessages`, and `sendPlanningQuestion`. Keep `consultScanPlan` in `analyze` so the plan's existing requirement-analysis result is still shown inside the plan workbench.

- [ ] **Step 2: Remove the sidebar wrapper and render**

Return only the existing `pentest-welcome` content from `PentestPage`; remove the trailing `ExpertFeedbackPanel` render.

```tsx
return (
  <div className="pentest-welcome">
    {/* existing target form and planning workbench */}
  </div>
);
```

- [ ] **Step 3: Delete the orphaned component**

Delete `apps/web/src/components/ExpertFeedbackPanel.tsx`; confirm no production or test import remains.

- [ ] **Step 4: Run the planning-page test**

Run `npm --prefix apps/web run test -- PentestPage.test.tsx`.

Expected: all `PentestPage` tests pass and the precheck/task API call counts remain unchanged.

### Task 3: Add the nonblocking central prompt

**Files:**
- Modify: `apps/web/src/components/TaskConversation.tsx`
- Modify: `apps/web/src/components/TaskConversation.test.tsx`

- [ ] **Step 1: Render guidance only when persisted QA history is empty**

Add a local timeline article before generated entries when `messages.length === 0`. It must not call an API or modify task state.

```tsx
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
```

- [ ] **Step 2: Preserve real conversation behavior**

When `messages` is non-empty, render only persisted conversation entries so the local prompt does not repeat after a user reply or page refresh with history.

- [ ] **Step 3: Run component and session tests**

Run `npm --prefix apps/web run test -- TaskConversation.test.tsx PentestSessionPage.test.tsx`.

Expected: all tests pass, including existing task QA submission and central timeline coverage.

### Task 4: Remove obsolete sidebar styling

**Files:**
- Modify: `apps/web/src/styles.css`

- [ ] **Step 1: Delete sidebar and planning-grid selectors**

Remove `.pentest-consultation-layout`, `.pentest-consultation-layout--planning`, `.expert-consultation`, `.expert-speaker`, `.consultation-*`, `.expert-consultation--enter`, and their responsive/reduced-motion overrides. Preserve unrelated `.orchestrator-narrative` styles by splitting any combined rule before deletion.

- [ ] **Step 2: Confirm no sidebar selectors remain**

Run `Get-ChildItem apps/web/src -Recurse -File | Select-String -Pattern 'ExpertFeedbackPanel|专家咨询区|expert-consultation|consultation-message|pentest-consultation-layout'`.

Expected: no matches.

- [ ] **Step 3: Run the focused frontend suite**

Run `npm --prefix apps/web run test -- PentestPage.test.tsx TaskConversation.test.tsx PentestSessionPage.test.tsx`.

Expected: all focused tests pass.

### Task 5: Full verification, commit, push, and deploy

**Files:**
- Verify: `apps/web/src/**`

- [ ] **Step 1: Run all frontend checks**

Run the following commands:

```powershell
npm --prefix apps/web run test
npm --prefix apps/web run lint
npm --prefix apps/web exec tsc -- --noEmit
npm --prefix apps/web run build
```

Expected: tests, ESLint, TypeScript, and production build all pass.

- [ ] **Step 2: Confirm the change set is scoped**

Run `git diff --check` and `git status --short`.

Expected: only the planned web files and plan document are changed; `apps/api/data/` remains untracked and is not staged.

- [ ] **Step 3: Commit and push**

Stage only the planned files, commit with `feat(web): move task intake into central conversation`, then push `codex/project-handoff`. Never stage `apps/api/data/`.

- [ ] **Step 4: Update the existing server deployment and verify readiness**

Use the repository's existing deployment helper and verify `http://101.43.119.26:8000` serves the updated frontend and the API health endpoint reports ready.
