# Central Task Conversation Design

## Goal

Replace the task execution page's right-hand expert consultation panel with a
single central task conversation. The central stream must retain Xiaoyi stage
callbacks, tool execution updates, progress, platform results, and user task
questions without overwhelming non-technical users with raw payloads.

## Scope

- Change only the running/history task session page.
- Keep the pre-task requirement consultation flow unchanged.
- Preserve the existing platform REST APIs and polling behavior.
- Do not add dependencies, services, or backend contracts.

## Layout

The task session becomes a two-column workbench:

1. The existing task and result rail remains on the left.
2. The central column expands into the space previously occupied by the expert
   panel.

The separate `ExpertFeedbackPanel` is not rendered in task sessions. The central
column receives enough bottom padding for a floating task composer, so the
composer never obscures the final timeline item.

On narrow screens the layout collapses to one column. The composer remains
fixed near the bottom viewport edge with safe horizontal margins.

## Central Conversation Stream

The central stream is the durable task conversation and contains:

- Xiaoyi phase callbacks and tool executions.
- Consolidated tool progress and state changes.
- Important success and failure summaries.
- User questions and task-agent answers.

Each tool entry is compact by default and shows only the tool name, phase,
current state, and progress/status summary. Repeated updates for the same tool
remain consolidated by the existing normalization layer.

Narrative messages, parameters, raw responses, full errors, timestamps, and
other technical material live in a closed `details` disclosure titled
"查看详细信息". Nothing is discarded; it is only hidden by default.

Task questions and answers appear in an inline "任务对话" section within the
central stream. It uses the existing task QA endpoint and keeps the conversation
associated with the current platform task.

## Floating Composer

A single-line task conversation composer remains visible at the bottom of the
session viewport.

- Enter and the send button submit the current question.
- Loading and disabled states use the existing mutation state.
- Inline errors remain visible next to the conversation, not in a separate side
  panel.
- The composer is positioned relative to the task-session content area and
  adapts when the left navigation or viewport width changes.
- Reduced-motion preferences are respected.

## Data Flow

No API changes are required:

1. Existing polling retrieves task, child, tool, event, vulnerability, report,
   and QA data.
2. Existing tool normalization produces the compact tool records.
3. Tool records render in the central conversation with closed details.
4. Existing QA records render below the tool conversation.
5. The floating composer posts through `/api/v1/tasks/{task_id}/qa/messages` and
   refreshes the same central conversation.

## Error Handling

- Task-level failures remain visible in the task monitor.
- Tool failures show a failed state in the compact header; the full error is
  available inside the disclosure.
- QA submission failures render inline above the composer.
- Empty tool and QA states use short non-technical waiting copy.

## Verification

Frontend tests must prove:

- The task session has no expert consultation complementary region.
- Xiaoyi tools and progress remain visible in the central stream.
- Narratives, raw payloads, and full errors are inside a closed disclosure.
- Task QA messages render centrally.
- The floating composer submits through the existing QA API.
- The responsive layout does not restore the removed right column.

The complete frontend unit suite, lint, TypeScript production build, and the
existing task-session interaction tests must pass.
