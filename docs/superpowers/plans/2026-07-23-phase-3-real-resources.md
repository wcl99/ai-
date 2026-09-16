# Phase 3 Real Resource Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove production business mocks from task, asset, vulnerability, report, dashboard, and overview pages by consuming only the confirmed platform API contracts.

**Architecture:** Extend the existing native-fetch boundary with typed resource schemas, pure API-to-view-model mappers, and a text-response helper for report preview. Pages keep their existing layout, CSS classes, icons, and assets while TanStack Query owns server pagination, loading, retry, errors, mutations, and cache invalidation. Unsupported metrics and filters are removed or shown as explicit unavailable/empty states instead of being synthesized.

**Tech Stack:** React 18, TypeScript strict, TanStack Query, Zod, Ant Design, Vitest, Testing Library, native fetch.

---

### Task 1: Define and test the resource API boundary

**Files:**
- Modify: `apps/web/src/api/client.ts`
- Modify: `apps/web/src/api/client.test.ts`
- Create: `apps/web/src/api/resources.ts`
- Create: `apps/web/src/api/resources.test.ts`
- Modify: `apps/web/src/types.ts`

- [ ] Write failing tests that validate and map one task, asset, vulnerability, and report page; assert snake_case fields become the existing Chinese view fields without invented priority, risk, export, trend, or source values.
- [ ] Write failing tests that query parameters use `URLSearchParams`, omit undefined filters, and report preview accepts authenticated `text/plain` while normalizing non-2xx platform errors.
- [ ] Run `node_modules/vitest/vitest.mjs run src/api/client.test.ts src/api/resources.test.ts` and confirm failures identify the missing resource functions.
- [ ] Add `apiTextRequest(path, options)` beside `apiRequest`; it must use `credentials: 'include'`, return text only for `response.ok`, and reuse the same normalized `ApiError` parsing for failures.
- [ ] Add Zod schemas for `ApiEnvelope<PageData<T>>`, all four confirmed list DTOs, `AssetCreate`, `VulnerabilityUpdate`, and report text.
- [ ] Export `listTasks`, `listAssets`, `createAsset`, `listVulnerabilities`, `updateVulnerability`, `listReports`, and `previewReport`. Keep download as a same-origin URL builder because browser navigation supplies the HttpOnly cookie.
- [ ] Update display types so every property has a server source. Use nullable fields or `—`; do not retain task priority, asset risk/source/last-scan, or report risk/export/group fields.
- [ ] Rerun focused tests and confirm they pass.

### Task 2: Replace task and vulnerability list mocks

**Files:**
- Modify: `apps/web/src/pages/ListPages.tsx`
- Create: `apps/web/src/pages/ListPages.test.tsx`

- [ ] Write failing page tests for task and vulnerability loading, populated data, true empty state, retryable 500 error, server-driven page changes, and supported status/severity filters.
- [ ] Add query state local to each page (`page`, `pageSize`, confirmed filters), with query keys containing every server parameter.
- [ ] Replace static metrics with totals supported by the response. Status totals may use `page_size=1` filtered count queries; trend text must be empty because no history endpoint exists.
- [ ] Keep the table/card DOM and visual classes, but remove unsupported search/type/date/priority/source controls and columns rather than simulating them locally.
- [ ] Add shared inline loading, empty, and error-with-retry rendering inside the existing data card; a failed request must not show stale mock rows.
- [ ] Wire vulnerability status updates to `PATCH /api/v1/vulnerabilities/{id}`, restrict choices to `OPEN`, `FIXING`, `RETESTING`, `FIXED`, and invalidate vulnerability queries after success.
- [ ] Rerun `src/pages/ListPages.test.tsx` and the existing `src/App.test.tsx`.

### Task 3: Replace asset and report mocks, including existing actions

**Files:**
- Modify: `apps/web/src/pages/ManagementPages.tsx`
- Modify: `apps/web/src/pages/ManagementPages.test.tsx`
- Modify: `apps/web/src/pages/ListPages.tsx`
- Modify: `apps/web/src/pages/ListPages.test.tsx`

- [ ] Rewrite the asset test around QueryClient and mocked fetch: list data comes from `/api/v1/assets`, create submits the exact API payload, 403 remains visible, and success invalidates/refetches the first page.
- [ ] Replace `initialAssets` and local insertion with `useQuery`/`useMutation`; keep the existing authorization checkbox and modal, map `type` to `asset_type`, and send no invented `data` fields.
- [ ] Remove unsupported asset search/risk/source/last-scan behavior and columns. Keep import/export/scan controls disabled until their contracts exist, with explanatory accessible labels.
- [ ] Add report tests for populated/empty/error pages, server pagination, preview text, unsupported-preview errors, and a download link equal to `/api/v1/reports/{id}/download`.
- [ ] Replace report mock data with `listReports`; show only filename, format, plan/task, created time, status, preview, and download because those are the confirmed fields.
- [ ] Preview text in an Ant Design drawer using `previewReport`; render it as plain text (`white-space: pre-wrap`) and never inject returned HTML with `dangerouslySetInnerHTML`.
- [ ] Rerun both page test files.

### Task 4: Make dashboard and overview summaries truthful

**Files:**
- Modify: `apps/web/src/pages/DashboardPage.tsx`
- Modify: `apps/web/src/pages/OverviewPages.tsx`
- Modify: `apps/web/src/App.test.tsx`

- [ ] Extend App tests with deterministic fetch routes for auth and all resource endpoints; assert dashboard totals and recent rows come from responses rather than `src/data/mock.ts`.
- [ ] Query only page-size-one counts for total task/asset/vulnerability/report metrics and a three-item task page for recent tasks.
- [ ] Remove percentage trends, generated charts, AI narratives, ranked assets, severity distributions, and recommendations that lack server history or aggregation sources. Preserve their card slots as honest empty states such as `暂无历史趋势数据` where retaining layout matters.
- [ ] On vulnerability/report overview pages, use real total counts and latest rows. Severity/status totals may use the confirmed list filters; report weekly/delivery/export figures must not be inferred.
- [ ] Ensure API errors show the same retryable error state and do not fall back to design mock values.
- [ ] Rerun `src/App.test.tsx` and all resource page tests.

### Task 5: Remove the production mock path and verify Phase 3

**Files:**
- Delete: `apps/web/src/data/mock.ts` if `rg` proves no production imports remain; otherwise reduce it to test-only fixtures outside production imports.
- Verify: `apps/web/src`
- Verify: `apps/api`

- [ ] Run `rg -n "data/mock|initialAssets|1,284|3,247|18,735|2,845|1,286" apps/web/src --glob "!*.test.*"`; expected result is no production business mock import or known fake metric value.
- [ ] Run frontend focused tests, then full test, lint, and production build.
- [ ] Run backend Ruff and Pytest to prove the consumers required no contract regression.
- [ ] Run `git diff --check`, inspect status/stat, and request an independent review focused on fake-data leakage, query invalidation, error states, and credential safety.
- [ ] Resolve every Critical/Important finding and repeat all gates.
- [ ] Commit only Phase 3 as `feat(web): connect resource pages to platform API`.

## Verification Commands

```powershell
node node_modules/vitest/vitest.mjs run src/api/resources.test.ts src/pages/ListPages.test.tsx src/pages/ManagementPages.test.tsx src/App.test.tsx
npm --prefix apps/web run test
npm --prefix apps/web run lint
npm --prefix apps/web run build
python -m ruff check apps/api
python -m pytest apps/api/tests
git diff --check
git status --short
```

## Self-review

- All Phase 3 resources and existing confirmed mutations/actions have a task and test.
- Every displayed field is traceable to `docs/api-contract.md`; unsupported UI behavior is removed or disabled.
- No settings UI, backend schema, database migration, microservice, or dependency change is included.
- No placeholder implementation steps or ambiguous resource names remain.
