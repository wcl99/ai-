# Optional Xiaoyi Organization ID Design

## Goal

Allow a confirmed platform scan plan to reach Xiaoyi when `XIAOYI_ORG_ID` is
not configured. Live contract verification showed that
`POST /api/osCore/chat` accepts a complete task body without `org_id`.

## Scope

- Keep `XIAOYI_ORG_ID` as an optional deployment setting.
- Include `org_id` in the Xiaoyi chat body only when it is configured.
- Do not send `org_id: null`, a placeholder, or a locally invented value.
- Keep `user_id`, `plan_id`, scan settings, and `asset_list` required.
- Keep authorization confirmation, asset discovery, and CDN blocking unchanged.
- Do not change Xiaoyi task polling, tool retrieval, stop, or WebSocket routes.

## Data Flow

When a user confirms a plan, the platform freezes the Xiaoyi context. The
context records `org_id` only when deployment configuration supplies one. The
payload builder validates all required fields and conditionally copies the
optional `org_id` into the body sent to `/api/osCore/chat`.

## Error Handling

Missing `org_id` is not an application error. A configured value must still be
a positive integer. Existing errors for missing user ID, invalid plan ID,
missing assets, CDN uncertainty, and upstream failures remain unchanged.

## Verification

- Unit test: a Xiaoyi payload without `org_id` is valid and omits the key.
- Unit test: a configured positive `org_id` remains present.
- Regression test: invalid configured organization values remain rejected.
- Full API test suite and Ruff checks pass.
- Deployment health check passes.
- A website/API flow against the authorized target creates a Xiaoyi task and
  immediately stops it; no long-running scan is left behind.
