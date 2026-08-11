# Overview Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the vulnerability and report overview placeholders with accurate, timezone-aware analytics supporting today, 3-day, 7-day, and historical ranges at 10k-row interactive performance.

**Architecture:** Add two organization-scoped overview endpoints backed by database aggregation and composite indexes. Keep time-window and zero-fill logic in one focused service, expose typed response schemas, and render the returned distributions and trends with existing React/CSS primitives.

**Tech Stack:** FastAPI, SQLAlchemy 2 async, Alembic, PostgreSQL/SQLite, Pydantic, React, TanStack Query, Ant Design, Vitest.

---

### Task 1: Time-window and bucket logic

**Files:**
- Create: `apps/api/app/overview_analytics.py`
- Test: `apps/api/tests/test_overview_analytics.py`

- [ ] **Step 1: Write failing unit tests**

Cover `today`, `3d`, `7d`, and `all` with a fixed `now`, including Asia/Shanghai midnight, current-hour inclusion, 72 hourly buckets, seven daily buckets, historical daily/monthly selection, invalid timezone fallback, and zero filling.

```python
def test_today_starts_at_customer_midnight_and_includes_current_hour():
    window = build_window("today", "Asia/Shanghai", now=datetime(2026, 8, 11, 2, 30, tzinfo=UTC))
    assert window.start_utc == datetime(2026, 8, 10, 16, 0, tzinfo=UTC)
    assert window.granularity == "hour"
    assert len(window.buckets) == 11

def test_fill_buckets_preserves_counts_and_adds_zeroes():
    window = build_window("7d", "Asia/Shanghai", now=datetime(2026, 8, 11, 2, 30, tzinfo=UTC))
    result = fill_buckets(window, {"2026-08-10": 4})
    assert sum(point.count for point in result) == 4
    assert len(result) == 7
```

- [ ] **Step 2: Run tests and verify RED**

Run from `apps/api`:

```powershell
& '..\..\.venv\Scripts\python.exe' -m pytest tests/test_overview_analytics.py -q
```

Expected: import failure because `app.overview_analytics` does not exist.

- [ ] **Step 3: Implement the minimal standard-library service**

Create immutable `TrendWindow` and `TrendPoint` dataclasses plus the three listed functions. The implementation floors local time to the selected range boundary, converts the filter boundary back to UTC, emits hour/day/month bucket keys, and fills missing keys with zero.

```python
OverviewRange = Literal["today", "3d", "7d", "all"]
Granularity = Literal["hour", "day", "month"]

@dataclass(frozen=True)
class TrendPoint:
    start: str
    count: int

@dataclass(frozen=True)
class TrendWindow:
    range_name: OverviewRange
    timezone_name: str
    granularity: Granularity
    start_utc: datetime
    end_utc: datetime
    buckets: tuple[str, ...]
```

Use `zoneinfo.ZoneInfo`, UTC filter boundaries, PostgreSQL `timezone/date_trunc`, SQLite `strftime`, and deterministic bucket keys. Do not load report or vulnerability rows into Python.

- [ ] **Step 4: Run the unit tests and verify GREEN**

Run the same command; expected all tests pass.

- [ ] **Step 5: Commit**

```powershell
git add apps/api/app/overview_analytics.py apps/api/tests/test_overview_analytics.py
git commit -m "feat(api): add overview time buckets"
```

### Task 2: Overview schemas, indexes, and API aggregation

**Files:**
- Modify: `apps/api/app/schemas.py`
- Modify: `apps/api/app/main.py`
- Modify: `apps/api/app/models.py`
- Create: `apps/api/alembic/versions/0009_add_overview_indexes.py`
- Test: `apps/api/tests/test_api.py`

- [ ] **Step 1: Write failing endpoint tests**

Seed vulnerabilities and reports at fixed timestamps for two organizations. Assert organization isolation, metrics, source fallback, report-level fallback, today/3d/7d/all parameters, timezone validation, and zero-filled trend points.

```python
response = await authenticated_client.get(
    "/api/v1/vulnerabilities/overview?range=7d&timezone=Asia%2FShanghai"
)
assert response.status_code == 200
assert response.json()["data"]["metrics"]["total"] == 3
assert sum(item["count"] for item in response.json()["data"]["trend"]) == 3

reports = await authenticated_client.get(
    "/api/v1/reports/overview?range=today&timezone=Asia%2FShanghai"
)
assert reports.json()["data"]["range"] == "today"
assert reports.json()["data"]["granularity"] == "hour"
```

- [ ] **Step 2: Run focused API tests and verify RED**

```powershell
& '..\..\.venv\Scripts\python.exe' -m pytest tests/test_api.py -k 'overview_analytics' -q
```

Expected: 404 for both new endpoints.

- [ ] **Step 3: Add typed response schemas**

Add Pydantic models for `TrendPointRead`, distribution items, vulnerability metrics/overview, and report metrics/overview. Range values are `today`, `3d`, `7d`, `all`; `granularity` is `hour`, `day`, or `month`.

- [ ] **Step 4: Add exact database aggregations**

Register `/api/v1/vulnerabilities/overview` before `/api/v1/vulnerabilities/{vulnerability_id}` and `/api/v1/reports/overview` before `/api/v1/reports/{report_id}` so `overview` is not parsed as a UUID.

Use conditional `SUM(CASE WHEN condition THEN 1 ELSE 0 END)` expressions for metrics, `GROUP BY` for distributions, `data_json["source_tool"].as_string()` for vulnerability sources, `external_url IS NOT NULL` for report sources, `report_level` for levels, and the Task 1 bucket expression for trend. Every query must include `org_id == user.org_id`.

- [ ] **Step 5: Add composite indexes and migration**

Define and migrate:

```python
op.create_index(
    "ix_vulnerabilities_org_created",
    "vulnerabilities",
    ["org_id", "created_at"],
)
op.create_index(
    "ix_reports_org_created",
    "reports",
    ["org_id", "created_at"],
)
```

Downgrade drops only these two indexes.

- [ ] **Step 6: Run focused tests and migration tests**

```powershell
& '..\..\.venv\Scripts\python.exe' -m pytest tests/test_api.py -k 'overview_analytics' -q
& '..\..\.venv\Scripts\python.exe' -m pytest tests/test_migrations.py -q
```

Expected: all pass.

- [ ] **Step 7: Commit**

```powershell
git add apps/api/app apps/api/alembic/versions apps/api/tests/test_api.py
git commit -m "feat(api): aggregate overview analytics"
```

### Task 3: Typed frontend API client

**Files:**
- Modify: `apps/web/src/api/resources.ts`
- Test: `apps/web/src/api/resources.test.ts`

- [ ] **Step 1: Write failing client tests**

Assert exact URLs and response mapping for both endpoints:

```typescript
await getReportOverview({ range: 'today', timezone: 'Asia/Shanghai' });
expect(fetch).toHaveBeenCalledWith(
  '/api/v1/reports/overview?range=today&timezone=Asia%2FShanghai',
  expect.anything(),
);
```

Also reject malformed trend counts and unsupported granularity via Zod.

- [ ] **Step 2: Run client tests and verify RED**

```powershell
& '.\node_modules\.bin\vitest.cmd' run src/api/resources.test.ts
```

Expected: missing exported overview client functions.

- [ ] **Step 3: Add schemas, types, and client functions**

Define `OverviewRange`, `TrendPoint`, `DistributionItem`, `VulnerabilityOverview`, and `ReportOverview`; build query strings with existing `params()`; validate envelopes with Zod.

- [ ] **Step 4: Run client tests and verify GREEN**

Run the same command; expected pass.

- [ ] **Step 5: Commit**

```powershell
git add apps/web/src/api/resources.ts apps/web/src/api/resources.test.ts
git commit -m "feat(web): add overview analytics client"
```

### Task 4: Render complete vulnerability and report overview cards

**Files:**
- Modify: `apps/web/src/pages/OverviewPages.tsx`
- Modify: `apps/web/src/styles.css`
- Modify: `apps/web/src/App.test.tsx`

- [ ] **Step 1: Write failing page tests**

Mock overview responses and assert:

- both pages show `当日 / 3日 / 7日 / 历史`;
- clicking a range requests the matching parameter;
- vulnerability trend/source and report source/trend/level/insight render real labels/counts;
- old placeholder strings are absent;
- errors expose retry without displaying fabricated zeroes.

```typescript
expect(screen.queryByText('当前接口未提供来源聚合')).not.toBeInTheDocument();
expect(screen.getByText('平台生成')).toBeInTheDocument();
expect(screen.getByText('小易回传')).toBeInTheDocument();
```

- [ ] **Step 2: Run page tests and verify RED**

```powershell
& '.\node_modules\.bin\vitest.cmd' run src/App.test.tsx
```

Expected: overview endpoint mocks are unused and old placeholders remain.

- [ ] **Step 3: Implement minimal reusable visual primitives**

Keep components local to `OverviewPages.tsx`:

```tsx
function RangeSelector(props: { value: OverviewRange; onChange(value: OverviewRange): void }) {
  return <Radio.Group value={props.value} onChange={(event) => props.onChange(event.target.value)} options={[
    { value: 'today', label: '当日' },
    { value: '3d', label: '3日' },
    { value: '7d', label: '7日' },
    { value: 'all', label: '历史' },
  ]} />;
}

function TrendChart({ points }: { points: TrendPoint[] }) {
  const max = Math.max(1, ...points.map((point) => point.count));
  return <div className="overview-trend-bars">{points.map((point) => (
    <i key={point.start} style={{ height: `${Math.max(2, point.count / max * 100)}%` }} title={`${point.start}: ${point.count}`} />
  ))}</div>;
}

function DistributionBars({ items }: { items: DistributionItem[] }) {
  const total = items.reduce((sum, item) => sum + item.count, 0);
  return <div className="rank-bars">{items.map((item) => (
    <div key={item.key}><span>{item.label}</span><Progress percent={total ? Math.round(item.count / total * 100) : 0} showInfo={false} /><b>{item.count}</b></div>
  ))}</div>;
}
```

Use existing Ant Design `Radio.Group`/`Progress` and CSS/SVG. Determine the timezone with `Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai'`. Replace the seven vulnerability metric requests with one overview request plus the existing recent-items request.

- [ ] **Step 4: Add responsive card styles without a chart dependency**

Add only selectors required by the three components: range control alignment, zero-baseline bars/line, axis labels, distribution rows, and insight list. Preserve the current 2K layout and card dimensions.

- [ ] **Step 5: Run page tests and verify GREEN**

Run the same command; expected pass.

- [ ] **Step 6: Commit**

```powershell
git add apps/web/src/pages/OverviewPages.tsx apps/web/src/styles.css apps/web/src/App.test.tsx
git commit -m "feat(web): complete overview analytics"
```

### Task 5: Performance and full verification

**Files:**
- Create: `apps/api/tests/performance/test_overview_queries.py`
- Modify: `docs/api-contract.md`

- [ ] **Step 1: Add a PostgreSQL-only 10k-row performance check**

Mark the test skipped unless `OVERVIEW_PERF_DATABASE_URL` is set. Seed 10k organization-scoped rows in one transaction, warm each endpoint, measure repeated calls with `time.perf_counter()`, and assert P95 under 300ms. Keep generated data isolated to a temporary organization and delete it in teardown.

- [ ] **Step 2: Document the new contracts**

Document query parameters, timezone fallback, bucket definitions, response fields, source/level classification, and performance target in `docs/api-contract.md`.

- [ ] **Step 3: Run complete verification**

API from `apps/api`:

```powershell
& '..\..\.venv\Scripts\python.exe' -m ruff check .
& '..\..\.venv\Scripts\python.exe' -m pytest tests -q
```

Web from `apps/web`:

```powershell
& '.\node_modules\.bin\vitest.cmd' run
& '.\node_modules\.bin\eslint.cmd' .
& '.\node_modules\.bin\tsc.cmd' --noEmit
& '.\node_modules\.bin\vite.cmd' build
```

Expected: all commands exit 0; the optional performance test reports skipped without its dedicated database URL.

- [ ] **Step 4: Commit**

```powershell
git add apps/api/tests/performance docs/api-contract.md
git commit -m "test(overview): verify analytics performance"
```

### Task 6: Push, deploy, and production smoke test

**Files:**
- No tracked source files.

- [ ] **Step 1: Confirm only intended files are committed**

```powershell
git status --short
git log --oneline origin/codex/project-handoff..HEAD
```

Preserve user/runtime untracked files under `apps/api/data`, `output`, and `素材`.

- [ ] **Step 2: Push the branch**

```powershell
git push origin codex/project-handoff
```

- [ ] **Step 3: Deploy through the existing overlay-image path**

Build the verified frontend, overlay `apps/api/app` and static output on the current healthy API image, back up the server `.env`, update `API_IMAGE`, restart only the API service, and wait for `/health/ready` plus container health.

- [ ] **Step 4: Smoke-test all four ranges**

Authenticate through the platform API and call both overview endpoints for `today`, `3d`, `7d`, and `all`. Verify status 200, organization-scoped totals, valid granularity, chronological points, and that trend sums match direct counts for each range.
