# Report Overview Material Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the report overview from the approved 1920×1080 SVG while exposing truthful report lifecycle, distribution, trend, recent report, export, and insight data.

**Architecture:** Extend the existing `reports` table and FastAPI report endpoints instead of adding another state store. The existing overview endpoint remains the single page-data source and performs organization-scoped SQL aggregation; the React page renders it with native SVG charts and the existing Ant Design shell.

**Tech Stack:** FastAPI, SQLAlchemy async, Alembic, PostgreSQL/SQLite tests, React 18, TypeScript, TanStack Query, Ant Design, SVG, Vitest, pytest.

---

### Task 1: Persist first successful report view and export

**Files:**
- Create: `apps/api/alembic/versions/0010_add_report_lifecycle.py`
- Modify: `apps/api/app/models.py:161-174`
- Modify: `apps/api/app/schemas.py:372-405`
- Test: `apps/api/tests/test_api.py`

- [ ] **Step 1: Write failing lifecycle tests**

Add tests that create a UTF-8 Markdown report in `tmp_path`, preview it twice, download it twice, and assert from a fresh session that `first_viewed_at`, `first_viewed_by`, `first_exported_at`, and `first_exported_by` are set once and never overwritten. Add failure cases for a missing file and unsupported preview format and assert all four fields remain `NULL`.

- [ ] **Step 2: Run the lifecycle tests and verify RED**

Run: `cd apps/api; python -m pytest tests/test_api.py -k "report_lifecycle" -v`

Expected: FAIL because the lifecycle columns and response fields do not exist.

- [ ] **Step 3: Add the lifecycle columns and migration**

Add nullable timezone-aware timestamps and nullable user foreign keys:

```python
first_viewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
first_viewed_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
first_exported_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
first_exported_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
```

Create migration `0010_add_report_lifecycle` with the four columns plus indexes `(org_id, first_viewed_at)` and `(org_id, first_exported_at)`. Expose the four nullable fields in `ReportRead`.

- [ ] **Step 4: Record lifecycle state only after successful validation**

In preview and download endpoints, validate file existence, format, size, and UTF-8 decoding first. Then use conditional SQL updates so repeated requests cannot replace the first actor or timestamp:

```python
if report.first_viewed_at is None:
    report.first_viewed_at = now
    report.first_viewed_by = user.id
if report.first_exported_at is None:  # download only
    report.first_exported_at = now
    report.first_exported_by = user.id
```

Direct download records both viewed and exported. Preserve existing audit records and organization scoping.

- [ ] **Step 5: Run lifecycle tests and verify GREEN**

Run: `cd apps/api; python -m pytest tests/test_api.py -k "report_lifecycle" -v`

Expected: PASS.

### Task 2: Return the complete report overview data model

**Files:**
- Modify: `apps/api/app/schemas.py:389-405`
- Modify: `apps/api/app/main.py:1140-1235`
- Test: `apps/api/tests/test_api.py:32-201`
- Test: `apps/api/tests/performance/test_overview_queries.py`

- [ ] **Step 1: Replace the old overview assertions with failing material-model assertions**

Seed reports across two organizations, two months, viewed/unviewed, exported/unexported, multiple plan `test_type` values, and plans with confirmed vulnerabilities. Assert the response contains:

```json
{
  "metrics": {
    "total": {"value": 6, "change_percent": null},
    "monthly_new": {"value": 3, "change_percent": 50.0},
    "pending_export": {"value": 2, "change_percent": null},
    "exported": {"value": 4, "change_percent": null},
    "pending_confirmation": {"value": 1, "change_percent": null},
    "monthly_delivered": {"value": 2, "change_percent": 100.0}
  },
  "latest_reports": [],
  "recent_exports": [],
  "insights": []
}
```

Also assert fixed source keys (`penetration`, `code_audit`, `emergency`, `data_analysis`, `other`) and risk keys (`critical`, `high`, `medium`, `low`, `none`) are returned with zero-filled categories and do not contain another organization’s data.

- [ ] **Step 2: Run the overview tests and verify RED**

Run: `cd apps/api; python -m pytest tests/test_api.py -k "overview_analytics" -v`

Expected: FAIL because the endpoint still returns `ready`, `partial`, `recent_7d`, and report-level distribution.

- [ ] **Step 3: Define explicit response schemas**

Add `ReportMetricValueRead(value: int, change_percent: float | None)`, six named metric fields, `RecentReportRead`, and `RecentExportRead`. Replace `level_distribution` with `risk_distribution` and add `latest_reports` and `recent_exports` to `ReportOverviewRead`.

- [ ] **Step 4: Implement organization-scoped aggregation**

Use SQL `CASE`, `COUNT`, `MAX`, joins, and a vulnerability severity-rank subquery. Classify standard, two-high-one-weak, two-clear-two-solid, and MLPS modes as penetration; retain zero rows for unsupported source types. Calculate month boundaries with `ZoneInfo(timezone_name)`, compare month-to-date with the same elapsed interval of the prior month, and return `null` when the comparison baseline is zero. Produce deterministic insights from the six metrics and confirmed-risk counts only.

- [ ] **Step 5: Add recent lists without N+1 queries**

Fetch five newest reports joined to plan creator, and five newest exported reports joined to exporting user. Return source label, date/time, report title/filename, creator/exporter, format, and lifecycle status.

- [ ] **Step 6: Run overview and performance tests and verify GREEN**

Run: `cd apps/api; python -m pytest tests/test_api.py tests/performance/test_overview_queries.py -k "overview" -v`

Expected: PASS with the existing query-count ceiling adjusted only for the two explicit recent-list queries.

### Task 3: Map the new API contract in the web client

**Files:**
- Modify: `apps/web/src/api/resources.ts:94-149`
- Modify: `apps/web/src/api/resources.test.ts:35-68`

- [ ] **Step 1: Write a failing Zod mapping test**

Return all six metric objects, fixed source/risk distributions, trend points, latest reports, recent exports, and insights from the fetch mock. Assert camelCase fields such as `monthlyNew`, `pendingConfirmation`, `riskDistribution`, `latestReports`, and `recentExports`.

- [ ] **Step 2: Run the resource test and verify RED**

Run: `cd apps/web; npm test -- src/api/resources.test.ts`

Expected: FAIL because the schema still expects the old report metrics.

- [ ] **Step 3: Update the Zod schema and mapper**

Validate every count as a non-negative integer, comparison as nullable finite number, timestamps with the existing timestamp schema, and lifecycle arrays with explicit object schemas. Keep `getReportOverview({ range, timezone })` and its URL unchanged.

- [ ] **Step 4: Run the resource test and verify GREEN**

Run: `cd apps/web; npm test -- src/api/resources.test.ts`

Expected: PASS.

### Task 4: Add the native SVG chart integration

**Files:**
- Create: `apps/web/src/components/OverviewChart.tsx`
- Test: `apps/web/src/components/OverviewChart.test.tsx`

- [ ] **Step 1: Write a failing chart rendering test**

Render bar and donut variants, change their data, and assert truthful labels, totals, accessible names, and responsive SVG view boxes.

- [ ] **Step 2: Run the chart test and verify RED**

Run: `cd apps/web; npm test -- src/components/OverviewChart.test.tsx`

Expected: FAIL because `OverviewChart` does not exist.

- [ ] **Step 3: Implement the chart component**

Implement bar and donut variants with native SVG `viewBox`, accessible labels, `<title>` values, source colors, rounded bars, and zero-data handling. Keep sizing entirely container-driven.

- [ ] **Step 4: Run the chart test and verify GREEN**

Run: `cd apps/web; npm test -- src/components/OverviewChart.test.tsx`

Expected: PASS.

### Task 5: Rebuild the page to the 1920×1080 SVG

**Files:**
- Modify: `apps/web/src/pages/OverviewPages.tsx:138-174`
- Modify: `apps/web/src/styles.css`
- Modify: `apps/web/src/App.test.tsx:55-63,186-192`

- [ ] **Step 1: Write failing page assertions for the SVG hierarchy**

Update the report overview fixture and assert six metric cards, source and risk donut chart regions, range selector inside the trend-card header, five recent-report cards, recent-export table headings, report insight copy, and links to the report list. Assert loading and failed requests render dashes or local retry states instead of zero data.

- [ ] **Step 2: Run the page tests and verify RED**

Run: `cd apps/web; npm test -- src/App.test.tsx -t "report"`

Expected: FAIL because the old four-card layout and distribution bars are still rendered.

- [ ] **Step 3: Implement the SVG-matched structure**

Render four page layers in this order: six equal lifecycle cards; three equal chart cards; five recent-report cards with the material arrow control; and a bottom split row containing the recent-export table and report insights. Use real API values and user names, accessible buttons/links, semantic headings, and stable empty/loading/error dimensions.

- [ ] **Step 4: Configure chart options from real data**

Use thick donut series with center labels and right-side legends for source/risk. Use rounded blue bars, quiet grid lines, compact axis labels, and real tooltips for trend. The selected range remains one of today, 3d, 7d, or all and sits at the trend-card title edge.

- [ ] **Step 5: Add scoped desktop styles**

Scope new CSS under `.report-overview-material`; match the SVG’s pale blue-gray canvas, white cards, 12px radii, restrained shadows, 24px gaps, and fixed 1920×1080 proportions using a fluid content grid with a desktop minimum width. Do not add narrow-screen reflow rules because the approved target is a single desktop/2K browser format.

- [ ] **Step 6: Run page tests and verify GREEN**

Run: `cd apps/web; npm test -- src/App.test.tsx -t "report"`

Expected: PASS.

### Task 6: Full verification and visual comparison

**Files:**
- Modify if required by verified defects: files listed above only

- [ ] **Step 1: Run backend quality gates**

Run: `cd apps/api; python -m ruff check app tests alembic; python -m pytest`

Expected: all checks pass with zero failures.

- [ ] **Step 2: Verify the migration graph**

Run: `cd apps/api; python -m alembic heads`

Expected: exactly one head, `0010_add_report_lifecycle`.

- [ ] **Step 3: Run frontend quality gates**

Run: `cd apps/web; npm test; npm run lint; npm run build`

Expected: all commands exit zero.

- [ ] **Step 4: Perform the 1920×1080 visual check**

Start the existing API/web stack, load `/reports/overview` at a 1920×1080 viewport, capture a screenshot, and compare it with `素材/报告总览.svg`. Correct only measured spacing, alignment, overflow, typography, chart, and state-display differences.

- [ ] **Step 5: Review the final diff and commit**

Run: `git diff --check; git status --short; git diff --stat`

Stage only the implementation, tests, migration, lockfile, and plan. Preserve the user’s unrelated deleted ZIP, generated data, output, and material files. Commit with `feat(report): rebuild overview from material`.
