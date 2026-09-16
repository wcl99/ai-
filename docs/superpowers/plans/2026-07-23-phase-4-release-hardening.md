# Phase 4 Release Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the existing React/FastAPI/PostgreSQL validation stack into one same-origin, single-instance release unit with explicit readiness, production configuration checks, recoverable data, and an operator runbook.

**Architecture:** Keep the confirmed monolith. A Node build stage produces the SPA; the existing Python image installs the API, copies the SPA, runs Alembic, and serves API plus browser routes from one FastAPI process. PostgreSQL and the API remain the only long-running Compose services. Health checks, backup/restore, and logging use built-in framework, Docker, PostgreSQL, Python, and PowerShell capabilities only.

**Tech Stack:** Python 3.12, FastAPI/Starlette, SQLAlchemy, React/Vite, Docker multi-stage builds, Docker Compose, PostgreSQL 16, PowerShell.

---

### Task 1: Add production configuration and health contracts

**Files:**
- Modify: `apps/api/app/config.py`
- Modify: `apps/api/app/main.py`
- Modify: `apps/api/tests/test_api.py`
- Create: `apps/api/tests/test_config.py`

- [x] Write failing configuration tests proving production rejects an insecure cookie, placeholder JWT secret, and placeholder bootstrap password while development retains current local defaults.
- [x] Write failing API tests for `GET /health/live` returning without touching external services and `GET /health/ready` executing a database `SELECT 1`.
- [x] Preserve `GET /health` as a compatibility alias for liveness; no engine call or real scan is permitted in any health endpoint.
- [x] Add `app_environment: Literal["development", "test", "production"]` and a `validate_runtime_security()` method. Call it from lifespan before creating directories, bootstrapping users, or starting the sync worker.
- [x] Implement readiness with the existing SQLAlchemy `SessionLocal`; return `503` with a minimal non-sensitive body when the database cannot be reached.
- [x] Run focused config/API tests, Ruff, and the full backend test suite.

### Task 2: Build and serve one same-origin release image

**Files:**
- Modify: `apps/api/Dockerfile`
- Modify: `apps/api/app/config.py`
- Modify: `apps/api/app/main.py`
- Modify: `apps/api/tests/test_api.py`
- Modify: `deploy/compose.yaml`

- [x] Write failing API tests using a temporary static directory: `/` serves `index.html`, existing assets are returned directly, browser routes fall back to the SPA, and `/api/...` misses remain JSON 404 responses.
- [x] Add `static_dir: Path = Path("static")`; serve only files rooted below this directory and never expose dotfiles or arbitrary filesystem paths.
- [x] Register browser fallback after all API routes. Do not intercept `/api`, `/docs`, `/openapi.json`, health paths, or WebSockets.
- [x] Convert `apps/api/Dockerfile` to a Node 20 build stage plus Python 3.12 runtime stage. Use `npm ci`, `npm run build`, copy only `apps/web/dist`, and retain `alembic upgrade head && uvicorn`.
- [x] Change Compose build context to the repository root with `dockerfile: apps/api/Dockerfile`; keep one exposed API port and no separate frontend/Nginx service.
- [ ] Run backend tests, frontend build, and `docker compose config`. Backend and frontend gates passed; Docker CLI is unavailable on this workstation.

### Task 3: Harden the Compose runtime

**Files:**
- Modify: `deploy/compose.yaml`
- Modify: `deploy/.env.example`
- Create: `deploy/smoke.ps1`

- [x] Add API readiness healthcheck using Python stdlib HTTP access to `/health/ready`.
- [x] Add `restart: unless-stopped`, bounded JSON log rotation, stop grace periods, and conservative CPU/memory limits to API and PostgreSQL.
- [x] Set `APP_ENVIRONMENT=production` in Compose. Make the example production cookie secure by default and document that HTTPS termination is required; local HTTP validation must explicitly set `COOKIE_SECURE=false` and `APP_ENVIRONMENT=development`.
- [x] Keep all secrets as required environment values or explicit placeholders in `.env.example`; never embed a usable password/token in Compose.
- [x] Implement `deploy/smoke.ps1` to validate `/health/live`, `/health/ready`, `/`, and `/openapi.json` on a caller-supplied base URL using only `Invoke-WebRequest`.
- [ ] Validate PowerShell syntax through the parser and validate Compose interpolation with non-secret test values. Parser and static YAML checks passed; Docker interpolation awaits a Docker host.

### Task 4: Add scoped backup and restore operations

**Files:**
- Create: `deploy/backup.ps1`
- Create: `deploy/restore.ps1`
- Create: `deploy/README.md`

- [x] Implement backup arguments for compose file, output directory, and project name. Resolve the output path, require it to be outside repository source subdirectories, create a timestamped child, and refuse broad roots.
- [x] Back up PostgreSQL with `pg_dump --format=custom` inside the existing database container, copy the dump to the timestamped host directory, and remove only the known container temporary file.
- [x] Copy `/app/data/reports` from the API container into a separate `reports` backup directory. Write a manifest containing timestamp, compose project, migration head, and filenames but no secrets.
- [x] Implement restore with an explicit `-ConfirmRestore` switch, exact backup directory validation, service availability checks, `pg_restore --clean --if-exists`, and report directory replacement limited to `/app/data/reports`.
- [x] Document preconditions, backup, restore rehearsal, upgrade, migration failure, rollback, engine fallback to `mock`, TLS/cookie requirements, and recovery verification.
- [x] Parse both scripts with the PowerShell AST parser and run a help/dry validation path that does not access Docker.

### Task 5: Verify and commit Phase 4

**Files:**
- Verify: `apps/api`
- Verify: `apps/web`
- Verify: `deploy`
- Verify: `docs/superpowers/plans/2026-07-23-phase-4-release-hardening.md`

- [x] Run backend Ruff and all Pytest tests with a writable dedicated `--basetemp`.
- [x] Run frontend Vitest, TypeScript, ESLint, and Vite production build.
- [ ] Run `docker compose config`; if Docker is available, build the image and run the smoke script against the stack without starting a real Xiaoyi scan. Docker CLI is unavailable on this workstation.
- [x] Run PowerShell parser checks for every deployment script and `git diff --check`.
- [x] Request independent review focused on secret leakage, path safety, readiness correctness, static fallback boundaries, and rollback feasibility.
- [x] Resolve all Critical/Important findings and repeat affected gates.
- [ ] Commit only release-hardening changes as `feat(deploy): harden single-instance release`.

## Exit Criteria

- One image serves SPA and API on the same origin.
- Liveness never depends on PostgreSQL or Xiaoyi; readiness depends on PostgreSQL only.
- Production startup rejects insecure placeholder configuration before bootstrap or synchronization.
- Compose declares health, restart, log, shutdown, and resource policies without adding a service.
- Database and report data have separate, path-scoped backup and restore procedures.
- Settings frontend remains unchanged and no dependency or microservice is added.
