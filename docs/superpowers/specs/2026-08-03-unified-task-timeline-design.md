# Unified Task Timeline Design

## Goal

Redesign the penetration task session around one readable orchestration timeline.
Tool activity and task conversation must share the same surface and hierarchy,
while repeated tool callbacks are grouped so non-technical customers can follow
the job without scanning dozens of nearly identical cards.

## Scope

- Change only the running and historical task session page.
- Keep the pre-task requirement consultation unchanged.
- Keep the left task/result rail and the floating task composer.
- Preserve all existing REST endpoints, polling, callback data, and redaction.
- Add no dependency, backend contract, service, or right-side expert panel.

## Unified Surface

The central column contains one white `TaskActivityTimeline` surface. It replaces
the separate execution monitor, tool feed, and task conversation cards with one
continuous timeline. Task status remains the timeline header summary instead of
being rendered as a separate elevated card.

All visible entries share one vertical rail and one spacing system:

1. Task state summary.
2. Phase groups containing tool activity.
3. Customer questions and Xiaoyi task answers.
4. Important task-level failures and result milestones.

Entries use separators and whitespace rather than nested cards. The floating
composer remains outside the surface as the only elevated viewport element.

## Tool Classification and Consolidation

Tool calls are classified by their normalized Xiaoyi phase. Unknown or empty
phases fall into `其他执行步骤` rather than creating one group per callback.

Each phase group shows only:

- customer-readable phase label;
- unique tool count and total call count;
- completed, running, and failed counts;
- derived phase progress;
- first and latest callback timestamps.

Calls with the same normalized phase and tool name are consolidated into one
tool row. The row shows the tool name, state, call count (`调用 × N`), progress,
and the latest timestamp. The group is closed by default. Expanding it reveals
the consolidated tool rows; expanding a tool row reveals its individual calls,
narratives, errors, arguments, and raw return previews.

No callback is discarded. Consolidation only changes presentation.

## Timeline Ordering and Timestamps

Phase groups are ordered by their first valid callback timestamp. Groups without
a timestamp follow timestamped groups in stable API order. Task QA messages use
their own creation timestamp and are merged into the same timeline order.

Visible timestamps use the browser's local timezone and the fixed format
`YYYY-MM-DD HH:mm:ss`. Invalid or missing timestamps display `时间待同步`.
Expanded call details retain each original callback timestamp.

For phase groups spanning multiple calls, the summary displays a range when the
first and latest timestamps differ; otherwise it displays one timestamp.

## Conversation Entries

Existing task QA messages render as timeline entries, not chat cards in a second
section. Customer entries are labelled `您`; Xiaoyi responses are labelled
`小易任务助手`. Both show their timestamp beside the label and preserve line
breaks in the content.

The existing `/api/v1/tasks/{task_id}/qa/messages` flow remains unchanged. New
messages appear in the same timeline after the query cache is updated.

## Status and Progress

The timeline header shows the current task phase, task status, overall progress,
and last update time. Each phase derives progress from consolidated calls:

- completed or failed terminal calls count as finished work;
- running calls remain unfinished;
- an empty phase reports zero percent;
- progress is rounded to an integer from 0 to 100.

Failed calls remain visually identifiable in the group summary, but their full
errors stay inside the closed detail disclosure.

## Empty, Loading, and Error States

- With no tools and no QA messages, show one inline waiting row inside the
  timeline rather than a separate empty card.
- Task loading and boundary errors retain the existing page-level states.
- QA submission errors remain immediately above the floating composer.
- Invalid callback timestamps never break sorting or rendering.

## Responsive Behavior

The current two-column task workbench remains. The central timeline uses the
space released by the deleted expert panel. On narrower layouts the task rail
stacks above the timeline, and timeline rows keep a single readable column.
The composer remains fixed with the existing safe offsets.

## Verification

Frontend tests must prove:

- there is one central orchestration surface, not separate tool and conversation
  cards;
- repeated calls with the same phase and tool name consolidate into one row;
- phase summaries show counts, progress, and timestamp or timestamp range;
- task questions and Xiaoyi answers share the timeline with tool groups;
- technical payloads and individual calls remain closed by default;
- the existing QA composer still posts to the task QA endpoint;
- all frontend tests, lint, TypeScript checking, and production build pass.
