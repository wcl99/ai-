# HTTP-Compatible Analysis Start Design

## Problem

The penetration-test page creates a draft and then calls
`crypto.randomUUID()` before opening the analysis modal. Browsers do not expose
that method on the deployed plain-HTTP IP origin. The thrown exception is
caught without a visible error, so the draft is created but consultation never
starts.

## Design

- Add one local request-ID helper that uses `crypto.randomUUID()` when present.
- Fall back to `crypto.getRandomValues()` and an RFC 4122 version-4 UUID layout
  when `randomUUID()` is unavailable.
- Generate the ID before creating the draft so a capability failure cannot
  leave an invisible orphan draft.
- Render plan-creation errors beside the target form because the modal is not
  open at that stage.
- Keep consultation, CDN checks, authorization, and task creation unchanged.

## Verification

- A component test removes `crypto.randomUUID`, clicks Start Analysis, and
  verifies both draft creation and consultation requests occur.
- Existing penetration-test flow tests remain green.
- Frontend tests, lint, TypeScript, and production build pass.
- The deployed HTTP page sends both POST requests and opens analysis results.
