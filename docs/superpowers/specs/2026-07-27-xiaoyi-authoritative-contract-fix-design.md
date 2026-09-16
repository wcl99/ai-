# Xiaoyi Authoritative Contract Fix Design

Date: 2026-07-27

## Goal

Fix the confirmed-task dispatch path so the platform can start and observe an authorized Xiaoyi scan while preserving the current monolith, database models, authorization boundary, task scheduler, and UI assets.

The first live acceptance target is restricted to `139.198.31.136`, TCP port `81`, service `http`. No host discovery, extra ports, or unrelated targets are permitted.

## Sources Of Truth And Responsibility Boundaries

The four reference documents beside the repository are read together:

- `aiscanner工作流程图.md` defines platform orchestration: plan preparation, confirmation, task creation, execution state, and result presentation.
- `WebSocket对接设计方案.md` is authoritative for precheck and final Xiaoyi request shapes. It supersedes older `can_*` and `scan_*` conventions.
- `xiaoyi对接流程图.md` defines the upstream lifecycle: create the task, persist the returned task identifier, poll task/children/tools, stop, and synchronize results.
- `数字人对接文档.md` defines the separate authenticated integration used to start platform plans and upload assets, vulnerabilities, reports, and logs. It complements the main scan lifecycle but does not replace `/api/osCore/chat` as the Xiaoyi scan entry.

When earlier repository design notes disagree with these files, this document and the four references win. In particular, the earlier core-path design said to send a platform `request_id` upstream; the authoritative WebSocket document does not include that field and requires the final chat body to match the form contract. The platform keeps `request_id` locally for idempotency but does not send it to Xiaoyi.

## Selected Approach

Add one pure outbound-contract builder at the existing Xiaoyi adapter boundary. Platform plans continue using the current internal representation. At confirmation, the platform freezes enough actor and plan context to build the documented Xiaoyi payload. At dispatch, the adapter converts only the frozen snapshot and sends only documented fields.

This is preferred to replacing platform schemas with Xiaoyi schemas because it avoids spreading an external contract through the UI, persistence model, and platform APIs. It is preferred to calling Xiaoyi directly from a test script because direct calls would bypass authorization, audit, and local idempotency.

No microservice, dependency, queue, or external identity table is added.

## Frozen Context

Confirmation freezes these Xiaoyi context values alongside the existing internal snapshot:

- `org_id`: a Java-Integer-compatible Xiaoyi organization ID configured explicitly with `XIAOYI_ORG_ID`. Xiaoyi mode fails closed when this authoritative organization mapping is absent.
- `user_id`: `XIAOYI_USER_ID` when configured, otherwise the confirming platform username, matching the logical string form shown in the reference document.
- `plan_id`: a collision-free positive integer allocated from the platform database's `xiaoyi_plan_mappings` table. The mapping is created with the platform plan and remains stable for its lifetime.
- `scan_mode`: the platform `test_type`.
- `scan_speed`: `quick` unless a future confirmed form field explicitly supplies another documented value.
- `download_intermediate_results`: `true`.

The context is immutable after confirmation. Existing confirmed plans that lack this context are not silently reinterpreted; a new plan must be confirmed after deployment.

## Asset Conversion

The internal authorized asset remains unchanged in the platform snapshot:

```json
{
  "host": "139.198.31.136",
  "hostType": "ip",
  "ports": [
    {"port": 81, "state": "open", "service": "http", "protocol": "tcp"}
  ]
}
```

The outbound Xiaoyi asset is:

```json
{
  "asset_type": "ip_port",
  "asset_address": [
    {"address": "139.198.31.136", "port": 81, "service": "http"}
  ],
  "whitebox_context": ""
}
```

Rules:

- Each selected open port becomes one `asset_address` entry.
- Address, port, and service are copied from the frozen authorized asset only.
- Duplicate address/port pairs are removed without widening scope.
- `whitebox_context` is copied only when it was explicitly supplied; otherwise it is an empty string.
- Domain, IP, HTTP, and network-range forms follow the corresponding `asset_type` shapes in the authoritative document.
- Deprecated `can_subdomain`, `can_port`, `scan_subdomain`, and `scan_port` fields are rejected recursively before network dispatch.
- Empty or unconvertible assets fail locally and never call Xiaoyi.

## Final Chat Payload

For the live acceptance plan, the adapter sends exactly this field set, with identifiers taken from the newly confirmed platform plan:

```json
{
  "org_id": 2,
  "user_id": "beijing1",
  "plan_id": 999,
  "scan_mode": "standard",
  "scan_speed": "quick",
  "download_intermediate_results": true,
  "asset_list": [
    {
      "asset_type": "ip_port",
      "asset_address": [
        {"address": "139.198.31.136", "port": 81, "service": "http"}
      ],
      "whitebox_context": ""
    }
  ]
}
```

Internal fields such as `targets`, `templates`, `description`, `time_limit`, `authorization_confirmed`, `confirmed_by`, and `request_id` remain in platform storage where applicable but are not sent to Xiaoyi.

Live contract evidence on 2026-07-27 confirmed that Xiaoyi rejects UUID strings for `org_id` with a Java `Integer` deserialization error, while numeric `org_id` and `plan_id` values proceed to asset validation. The numeric boundary mapping is therefore part of the authoritative adapter contract rather than a platform database-key change. Organization mapping must be explicit to prevent cross-tenant ambiguity; plan mapping is persisted and unique to prevent collisions.

## Lifecycle

1. Create a platform draft with the single authorized target.
2. Optional WebSocket precheck uses only documented `action` and target fields. The `ip_port` acceptance asset requires no precheck.
3. Confirm the plan, freezing authorization, actor context, scan settings, and selected assets.
4. Create a platform task using a locally unique `request_id`.
5. The scheduler builds the Xiaoyi contract and calls `/api/osCore/chat` once.
6. On success, persist Xiaoyi `taskId` and normalize its status.
7. Poll task status, child tasks, and tool results through the existing synchronization loop.
8. Persist assets, vulnerabilities, reports, and logs through the current platform result paths. Digital-human upload APIs remain available as a complementary result-ingestion path.
9. Stop only through the existing platform task endpoint, which forwards to Xiaoyi.

## Error Handling And Diagnostics

- Xiaoyi 400/422 remains `ENGINE_REJECTED`.
- A bounded, redacted upstream error summary may be stored in the task event and server log. Authorization headers, tokens, passwords, cookies, secrets, and white-box content must never be recorded.
- Authentication failures, missing upstream tasks, invalid JSON, timeout, and connectivity failures retain their existing normalized error codes.
- A rejected dispatch has no external task ID and is never reported as scanning.
- Live retry uses a newly confirmed platform plan/task after the contract fix. It does not replay the old failed task or call Xiaoyi directly.

## Test Strategy

Test-driven implementation proceeds in this order:

1. A failing unit test proves the current internal IP/port asset is converted to the exact documented `ip_port` shape.
2. A failing client test proves `/chat` receives only the documented top-level fields and no `request_id` or internal snapshot fields.
3. Tests prove deprecated fields and empty/unconvertible assets fail before HTTP dispatch.
4. Tests prove confirmation freezes organization, username, plan ID, scan defaults, and authorization context.
5. Tests prove rejection details are bounded and redacted.
6. Run the complete backend suite.
7. Deploy without rebuilding or changing the deferred settings frontend.
8. Create a new plan scoped to `139.198.31.136:81`, confirm it, and start one task.
9. Verify the external task ID, status progression, children/tools synchronization, vulnerabilities, and report ingestion until terminal state or a clearly evidenced upstream blocker.

## Acceptance Criteria

- The final Xiaoyi request matches the authoritative WebSocket document and contains no deprecated or platform-only fields.
- The authorized live target cannot expand beyond `139.198.31.136:81/TCP/HTTP` during conversion or retry.
- Xiaoyi returns and the platform persists a real external task identifier, or the platform exposes a specific redacted upstream contract/identity blocker.
- Task status, children, tools, vulnerabilities, reports, and logs remain visible through the existing platform APIs.
- The settings frontend is unchanged.
- No new microservice or runtime dependency is introduced.
- The full backend test suite passes before deployment.
