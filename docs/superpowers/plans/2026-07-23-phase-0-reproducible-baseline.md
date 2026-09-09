# Phase 0 Reproducible Baseline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing frontend and backend checks reproducible on local Windows development and GitHub Actions without changing application behavior.

**Architecture:** Keep the current npm and Python packaging. CI uses Node.js 20 and Python 3.12, installs only lockfile/project-declared dependencies, and runs the same commands documented in README.

**Tech Stack:** GitHub Actions, Node.js 20, npm, Python 3.12, Ruff, Pytest, Vitest, Vite, TypeScript.

---

### Task 1: Verify the clean baseline in the supported runtimes

**Files:**
- Read: `apps/web/package-lock.json`
- Read: `apps/api/pyproject.toml`

- [ ] **Step 1: Install frontend dependencies from the lockfile**

Run: `npm --prefix apps/web ci`

Expected: exit code 0 and no changes to `apps/web/package-lock.json`.

- [ ] **Step 2: Install backend development dependencies in Python 3.12**

Run: `python -m pip install -e "apps/api[dev]"`

Expected: exit code 0 with Ruff and Pytest available in the same interpreter.

- [ ] **Step 3: Run the existing frontend baseline**

```powershell
npm --prefix apps/web run build
npm --prefix apps/web run lint
npm --prefix apps/web run test
```

Expected: all three commands exit 0.

- [ ] **Step 4: Run the existing backend baseline**

```powershell
python -m ruff check apps/api
python -m pytest apps/api/tests
```

Expected: both commands exit 0.

- [ ] **Step 5: Stop on a pre-existing failure**

If any baseline check fails, record the exact failure and create a separate corrective task before changing CI or README. Do not hide failures with relaxed flags.

### Task 2: Add the continuous integration gate

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Add the workflow**

Create exactly this workflow:

```yaml
name: CI

on:
  push:
  pull_request:

permissions:
  contents: read

jobs:
  web:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: apps/web
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
          cache-dependency-path: apps/web/package-lock.json
      - run: npm ci
      - run: npm run build
      - run: npm run lint
      - run: npm run test

  api:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
          cache: pip
          cache-dependency-path: apps/api/pyproject.toml
      - run: python -m pip install -e "apps/api[dev]"
      - run: python -m ruff check apps/api
      - run: python -m pytest apps/api/tests
```

- [ ] **Step 2: Validate workflow invariants**

Run:

```powershell
Select-String -Path .github/workflows/ci.yml -Pattern 'node-version: 20','python-version: "3.12"','npm ci','python -m pytest apps/api/tests'
```

Expected: each required invariant is present exactly once.

### Task 3: Document the supported toolchain and single verification gate

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add a supported toolchain section**

Add after “在另一台电脑继续”:

```markdown
## 支持的开发工具链

- Node.js 20.x 与 npm 锁文件安装；CI 使用 Node.js 20。
- Python 3.12；后端开发依赖通过 `python -m pip install -e "apps/api[dev]"` 安装。
- Docker Desktop 与 Docker Compose v2，用于 PostgreSQL 和完整验证环境。

本地命令和 CI 使用同一组构建、Lint 与测试入口。不要用其他 Python 版本生成或提交环境产物。
```

- [ ] **Step 2: Expand the verification commands**

Make the README verification block contain:

```powershell
npm --prefix apps/web ci
npm --prefix apps/web run build
npm --prefix apps/web run lint
npm --prefix apps/web run test
python -m pip install -e "apps/api[dev]"
python -m ruff check apps/api
python -m pytest apps/api/tests
```

- [ ] **Step 3: Verify the documentation is internally consistent**

Run:

```powershell
rg -n "Node.js 20|Python 3.12|npm --prefix apps/web run lint|pip install -e" README.md
```

Expected: supported versions and every added command are present.

### Task 4: Verify Phase 0 and review the diff

**Files:**
- Verify: `.github/workflows/ci.yml`
- Verify: `README.md`
- Verify: `docs/superpowers/plans/2026-07-23-stable-launch-roadmap.md`
- Verify: `docs/superpowers/plans/2026-07-23-phase-0-reproducible-baseline.md`

- [ ] **Step 1: Re-run all local gates**

```powershell
npm --prefix apps/web run build
npm --prefix apps/web run lint
npm --prefix apps/web run test
python -m ruff check apps/api
python -m pytest apps/api/tests
```

Expected: all commands exit 0.

- [ ] **Step 2: Check repository hygiene**

```powershell
git diff --check
git status --short
git diff --stat
```

Expected: no whitespace errors; only the two plan documents, workflow, and README are changed or untracked.

- [ ] **Step 3: Commit Phase 0**

```powershell
git add README.md .github/workflows/ci.yml docs/superpowers/plans/2026-07-23-stable-launch-roadmap.md docs/superpowers/plans/2026-07-23-phase-0-reproducible-baseline.md
git commit -m "chore: establish reproducible validation baseline"
```

Expected: one Conventional Commit containing only Phase 0 planning, CI, and documentation.
