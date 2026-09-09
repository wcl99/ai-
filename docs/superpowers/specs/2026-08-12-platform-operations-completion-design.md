# Platform Operations Completion Design

## Scope

Complete the login, overview, task center, and vulnerability center workflows while preserving the penetration-test intake and execution pages.

## Authentication

The API issues a short-lived signed arithmetic captcha challenge. The browser renders the prompt, submits the answer with the challenge token, and refreshes it after any failed login. The token contains only the operands, expiry, and nonce and is validated with the existing JWT secret, so deployment needs no new service or database table.

## Overview

A dashboard overview endpoint aggregates task, asset, and vulnerability metrics plus a time-bucketed vulnerability severity trend. It builds a bounded security context and asks the existing DeepSeek-compatible model for three sections: warnings, priority findings, and remediation advice. If the model is unavailable or returns invalid data, deterministic summaries derived from the same metrics remain visible.

## Task Center

Task list rows retain the reference layout and add target summary, AI summary, detail, pause, and delete actions. Summary and detail use the task, plan, events, vulnerabilities, and reports already owned by the platform. Pause is available only for active tasks and uses the existing cancellation path. Delete is restricted to terminal tasks and removes dependent task-owned records transactionally after explicit confirmation.

## Vulnerability Center

The list exposes detail, disposition, and delete actions. Detail opens the material-matched right drawer; its primary action navigates to the material-matched full detail page. Disposition updates the existing vulnerability status state machine. Delete is role-protected, organization-scoped, and requires explicit confirmation.

## Verification

Each behavior is introduced through failing API or component tests. Final verification covers backend tests and Ruff, frontend tests, lint and production build, responsive Playwright screenshots, Git diff checks, a scoped commit, push, server release with rollback, and public health/page checks.
