# Phase 1 API Contracts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stabilize authentication and list contracts needed by the frontend while preserving the FastAPI modular monolith and organization isolation.

**Architecture:** Keep the existing routes and envelope format. Add typed generic envelope/page schemas, paginated task/vulnerability/report lists with server-derived association summaries, and an HttpOnly-cookie logout endpoint; do not change database tables or expose engine raw payloads.

**Tech Stack:** FastAPI, Pydantic v2, SQLAlchemy async, Pytest, Ruff.

---

### Task 1: Make authentication cookie behavior configurable and add logout

**Files:**
- Modify: `apps/api/app/config.py`
- Modify: `apps/api/app/main.py`
- Test: `apps/api/tests/test_management.py`

- [ ] **Step 1: Write failing tests**

Add tests that assert login sets an HttpOnly, SameSite=Lax cookie using configured `secure=True`, and that `POST /api/v1/auth/logout` expires `access_token`.

- [ ] **Step 2: Verify RED**

Run: `python -m pytest apps/api/tests/test_management.py -k "cookie or logout" -v`

Expected: FAIL because cookie security is hard-coded and logout does not exist.

- [ ] **Step 3: Implement the minimum behavior**

Add `cookie_secure: bool = False` and `cookie_samesite: Literal["lax", "strict"] = "lax"` to `Settings`. Use these values in `response.set_cookie`; add `/api/v1/auth/logout` that calls `delete_cookie` with matching attributes and returns `envelope(message="logged out")`.

- [ ] **Step 4: Verify GREEN**

Run: `python -m pytest apps/api/tests/test_management.py -k "cookie or logout" -v`

Expected: both tests PASS.

### Task 2: Add typed envelopes and paginate tasks/assets

**Files:**
- Modify: `apps/api/app/schemas.py`
- Modify: `apps/api/app/main.py`
- Test: `apps/api/tests/test_api.py`

- [ ] **Step 1: Write failing task/asset contract tests**

Assert that task and asset list responses contain `data.items`, `data.total`, `data.page`, and `data.page_size`; task items must include `plan_name`, `test_type`, `targets`, and `created_by_name` from existing `ScanPlan` and `User` records.

- [ ] **Step 2: Verify RED**

Run: `python -m pytest apps/api/tests/test_api.py -k "list_contract" -v`

Expected: FAIL because tasks return a bare list and task summaries are absent.

- [ ] **Step 3: Add typed API schemas**

Define generic `ApiEnvelope[T]`, generic `PageData[T]`, and `TaskListRead(TaskRead)` with only the four server-derived summary fields. Add `updated_at` to `AssetRead` because it already exists in the model.

- [ ] **Step 4: Implement paginated queries**

Add `page`, `page_size`, and optional `status` to task listing. Query organization-scoped tasks joined to their plan and creator, count with the same criteria, and return the typed page. Add explicit response models to task and asset list routes.

- [ ] **Step 5: Verify GREEN**

Run: `python -m pytest apps/api/tests/test_api.py -k "assets or task" -v`

Expected: all selected tests PASS.

### Task 3: Paginate vulnerabilities and reports with safe summaries

**Files:**
- Modify: `apps/api/app/schemas.py`
- Modify: `apps/api/app/main.py`
- Test: `apps/api/tests/test_results.py`
- Test: `apps/api/tests/test_sync.py`

- [ ] **Step 1: Write failing list contract tests**

Assert paginated metadata for both resources. Vulnerabilities expose `task_name` and a sanitized string-only `tags` list derived from `data_json.tags`; reports expose `plan_name` and nullable `task_name`. No response contains `raw_external`, local filesystem paths, or credentials.

- [ ] **Step 2: Verify RED**

Run: `python -m pytest apps/api/tests/test_results.py apps/api/tests/test_sync.py -k "list_contract" -v`

Expected: FAIL because both endpoints currently return bare lists without summaries.

- [ ] **Step 3: Add list schemas and paginated joins**

Define `VulnerabilityListRead(VulnerabilityRead)` and `ReportListRead(ReportRead)`. Use outer joins for nullable task associations, preserve existing severity/status/task/plan filters, and apply organization scope to the primary resource query.

- [ ] **Step 4: Update existing consumers in backend tests**

Change existing assertions from `response.json()["data"][0]` to `response.json()["data"]["items"][0]` only where the endpoint contract intentionally changed.

- [ ] **Step 5: Verify GREEN**

Run: `python -m pytest apps/api/tests/test_results.py apps/api/tests/test_sync.py -v`

Expected: all selected tests PASS.

### Task 4: Expand organization and permission regression coverage

**Files:**
- Modify: `apps/api/tests/test_management.py`
- Modify: `apps/api/tests/test_api.py`
- Modify: `apps/api/tests/conftest.py` only if a second-organization fixture removes duplication

- [ ] **Step 1: Write regression tests**

Cover unauthenticated list access, an inactive user, cross-organization list isolation, and a digital-human user attempting an admin-only settings operation.

- [ ] **Step 2: Run tests and confirm existing security behavior**

Run: `python -m pytest apps/api/tests/test_management.py apps/api/tests/test_api.py -k "unauthenticated or inactive or cross_organization or digital_human" -v`

Expected: tests PASS if the existing boundary is correct. If a test fails, add the smallest application fix and rerun it through a RED/GREEN cycle.

### Task 5: Publish the contract and verify Phase 1

**Files:**
- Create: `docs/api-contract.md`
- Modify: `deploy/.env.example`
- Modify: `deploy/compose.yaml`
- Verify: all Phase 1 code and tests

- [ ] **Step 1: Document the contract**

Record cookie authentication, logout, the generic envelope, pagination, resource summary fields, supported filters, platform status enums, and standard error fields. State that missing display data is `null`/empty and never fabricated.

- [ ] **Step 2: Add non-secret cookie examples**

Add `COOKIE_SECURE=false` and `COOKIE_SAMESITE=lax` to `deploy/.env.example`; document that production HTTPS must set `COOKIE_SECURE=true`.

- [ ] **Step 3: Run full backend verification**

```powershell
python -m ruff check apps/api
python -m pytest apps/api/tests
```

Expected: Ruff passes and every backend test passes.

- [ ] **Step 4: Review repository hygiene**

```powershell
git diff --check
git status --short
git diff --stat
```

Expected: only Phase 1 plan, contract, backend source/tests, and cookie environment example are changed.

- [ ] **Step 5: Commit Phase 1**

```powershell
git add apps/api deploy/.env.example docs/api-contract.md docs/superpowers/plans/2026-07-23-phase-1-api-contracts.md
git commit -m "feat(api): stabilize frontend resource contracts"
```

Expected: one Conventional Commit containing the reviewed Phase 1 scope.
