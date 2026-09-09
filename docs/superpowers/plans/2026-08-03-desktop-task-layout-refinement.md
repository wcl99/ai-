# Desktop Task Layout Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the desktop task rail, place vulnerability severity after each vulnerability name, and reserve a non-overlapping disclosure column in the execution timeline.

**Architecture:** Keep all task and vulnerability data unchanged. Add small semantic wrappers to the existing React markup, then use the existing CSS Grid layout to assign explicit desktop columns; no proxy, API, dependency, or responsive behavior changes.

**Tech Stack:** React 18, TypeScript, Ant Design, CSS Grid, Vitest, Testing Library.

---

### Task 1: Lock vulnerability title and severity order

**Files:**
- Modify: `apps/web/src/pages/PentestSessionPage.test.tsx`
- Modify: `apps/web/src/pages/PentestPage.tsx`

- [ ] **Step 1: Add the failing DOM-order assertion**

Find the rendered vulnerability card, select its `.session-task-heading`, and assert that the title and severity are children of the same inline group in title-then-tag order.

```tsx
const finding = screen.getByText('SQL injection').closest('.session-task');
const heading = finding?.querySelector('.session-task-heading');
expect(heading?.children[0]).toHaveTextContent('SQL injection');
expect(heading?.children[1]).toHaveTextContent('HIGH');
```

- [ ] **Step 2: Run the session test and verify RED**

Run `node node_modules/vitest/vitest.mjs run src/pages/PentestSessionPage.test.tsx` from `apps/web`.

Expected: FAIL because `.session-task-heading` does not exist.

- [ ] **Step 3: Add the minimal semantic wrapper**

Render the vulnerability name and severity inside `.session-task-heading`, with the title first and `Tag` second. Keep the asset address below the heading.

```tsx
<div className="session-task-heading">
  <strong>{item.title}</strong>
  <Tag>{item.severity}</Tag>
</div>
```

- [ ] **Step 4: Verify GREEN**

Run the same session test. Expected: all session tests pass.

### Task 2: Add dedicated timeline disclosure regions

**Files:**
- Modify: `apps/web/src/components/TaskConversation.test.tsx`
- Modify: `apps/web/src/components/TaskConversation.tsx`

- [ ] **Step 1: Add failing disclosure assertions**

Assert that a phase summary contains `.task-phase-disclosure` after the progress block and that a tool summary contains `.task-tool-actions` with both the status tag and disclosure label.

```tsx
expect(phaseDetails?.querySelector('.task-phase-disclosure')).toHaveTextContent('展开详情');
expect(toolDetails?.querySelector('.task-tool-actions')).toHaveTextContent('查看调用');
```

- [ ] **Step 2: Run the component test and verify RED**

Run `node node_modules/vitest/vitest.mjs run src/components/TaskConversation.test.tsx`.

Expected: FAIL because the dedicated disclosure wrappers do not exist.

- [ ] **Step 3: Add minimal summary markup**

Append a phase disclosure element after `.task-phase-progress`. Wrap the tool status tag and `.task-disclosure-label` in `.task-tool-actions`.

```tsx
<span className="task-phase-disclosure">展开详情</span>
```

```tsx
<span className="task-tool-actions">
  <Tag color={stateColors[tool.state]}>{stateLabels[tool.state]}</Tag>
  <span className="task-disclosure-label">查看调用</span>
</span>
```

- [ ] **Step 4: Verify GREEN**

Run the same component test. Expected: all component tests pass.

### Task 3: Apply the fixed desktop grid

**Files:**
- Modify: `apps/web/src/styles.css`

- [ ] **Step 1: Widen the task rail**

Set `.execution-workbench--conversation` to `grid-template-columns:320px minmax(0,1fr)` and update the floating composer left offset by the same 70px delta so it remains aligned with the central stream.

- [ ] **Step 2: Style the vulnerability heading**

Make `.session-task-heading` a wrapping inline-flex group with the title first and a non-shrinking tag immediately after it.

```css
.session-task-heading{display:flex;justify-content:flex-start!important;align-items:flex-start;gap:6px;flex-wrap:wrap}
.session-task-heading strong{min-width:0;overflow-wrap:anywhere}
.session-task-heading .ant-tag{flex:0 0 auto;margin:0}
```

- [ ] **Step 3: Reserve a phase disclosure column**

Use four explicit phase-summary columns: `minmax(220px,1fr) auto 180px 76px`. Right-align `.task-phase-disclosure` and keep it on one line.

- [ ] **Step 4: Group tool actions**

Use four tool-summary columns: icon, name, count, actions. Make `.task-tool-actions` an inline-flex group with a fixed gap and no shrinking.

- [ ] **Step 5: Do not add new responsive behavior**

Remove or update only pre-existing overrides that conflict with the new fixed desktop widths. Do not add any new mobile breakpoint or proxy configuration.

### Task 4: Verify, commit, push, and deploy

**Files:**
- Verify: `apps/web/src/**`

- [ ] **Step 1: Run focused tests**

Run the session and conversation tests. Expected: all focused tests pass.

- [ ] **Step 2: Run complete frontend verification**

Run Vitest, ESLint, TypeScript `--noEmit`, and Vite production build using the bundled Node runtime. Expected: every command exits zero.

- [ ] **Step 3: Review the scoped diff**

Run `git diff --check` and `git status --short`. Confirm no proxy file changed and `apps/api/data/` remains untracked.

- [ ] **Step 4: Commit and push**

Commit only the planned layout, test, and documentation files with `feat(web): refine desktop task layout`, then push `codex/project-handoff`.

- [ ] **Step 5: Deploy and verify**

Use the existing release process for `101.43.119.26:8000`. Verify the container is healthy, the public page returns HTTP 200, and the deployed frontend references the newly built asset.
