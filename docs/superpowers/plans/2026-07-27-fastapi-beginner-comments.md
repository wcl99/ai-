# FastAPI Beginner Comments And Learning Guide Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add durable beginner-oriented comments to the FastAPI backend and create a request-flow-first learning guide without changing runtime behavior.

**Architecture:** Keep production code comments short and focused on framework or architectural boundaries. Put detailed teaching content in one standalone guide that traces login and authorized scan creation through the existing modular monolith.

**Tech Stack:** Python 3.12, FastAPI, Pydantic v2, SQLAlchemy asyncio, JWT, httpx, websockets, pytest, Ruff.

---

## File Structure

- Modify `apps/api/app/config.py`
  Explain environment-backed settings, cached settings, and security validation.
- Modify `apps/api/app/db.py`
  Explain the async engine, session factory, and `Depends(get_session)` lifecycle.
- Modify `apps/api/app/auth.py`
  Explain token creation, credential lookup, current-user resolution, and role dependencies.
- Modify `apps/api/app/schemas.py`
  Explain Pydantic's API-boundary responsibility.
- Modify `apps/api/app/models.py`
  Explain ORM persistence and platform/external ID separation.
- Modify `apps/api/app/main.py`
  Explain application lifespan, middleware, exception handlers, route dependencies, login, health, precheck WebSocket, task creation, and SPA fallback.
- Modify `apps/api/app/services.py`
  Explain the service-layer rules for plans, frozen snapshots, and task creation.
- Modify `apps/api/app/engine.py`
  Explain the Mock/Xiaoyi adapter boundary and reusable precheck session.
- Modify `apps/api/app/sync.py`
  Explain background synchronization and error isolation.
- Create `docs/fastapi-beginner-guide.md`
  Provide the detailed file map, request lifecycle, two end-to-end walkthroughs, error model, learning commands, and safe exercises.

## Task 1: Record A Clean Backend Baseline

**Files:**
- Test: `apps/api/tests/`

- [ ] **Step 1: Run Ruff before comment changes**

Run from `apps/api`:

```powershell
& 'C:\Users\86152\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' -m ruff check .
```

Expected: exit code 0.

- [ ] **Step 2: Run the backend suite before comment changes**

Run from `apps/api`:

```powershell
& 'C:\Users\86152\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' -m pytest -q
```

Expected: all existing tests pass.

## Task 2: Comment The FastAPI Foundation

**Files:**
- Modify: `apps/api/app/config.py`
- Modify: `apps/api/app/db.py`
- Modify: `apps/api/app/auth.py`
- Modify: `apps/api/app/schemas.py`
- Modify: `apps/api/app/models.py`

- [ ] **Step 1: Add module-level responsibility docstrings**

Use short docstrings that answer one question per file:

```python
"""Load environment-backed application settings and enforce runtime security rules."""
```

```python
"""Create the shared async database engine and request-scoped SQLAlchemy sessions."""
```

```python
"""Issue JWTs and expose FastAPI authentication and role-check dependencies."""
```

```python
"""Define Pydantic models used to validate and serialize the public API boundary."""
```

```python
"""Define SQLAlchemy models that persist platform business state."""
```

- [ ] **Step 2: Comment non-obvious FastAPI and SQLAlchemy boundaries**

Add concise comments immediately above the relevant code:

```python
# FastAPI calls this dependency once per request and closes the session after the response.
async def get_session() -> AsyncIterator[AsyncSession]:
```

```python
# Depends(current_user) turns authentication into a reusable route dependency.
def require_roles(*roles: str):
```

Explain that `Settings` reads environment variables, `get_settings()` is cached, schemas do not write the database, and `external_task_id` belongs to Xiaoyi while `Task.id` belongs to the platform.

- [ ] **Step 3: Check only the foundation diff**

Run:

```powershell
git diff --check -- apps/api/app/config.py apps/api/app/db.py apps/api/app/auth.py apps/api/app/schemas.py apps/api/app/models.py
```

Expected: no whitespace errors and no executable statement changes.

## Task 3: Comment The Request And Engine Flow

**Files:**
- Modify: `apps/api/app/main.py`
- Modify: `apps/api/app/services.py`
- Modify: `apps/api/app/engine.py`
- Modify: `apps/api/app/sync.py`

- [ ] **Step 1: Add module-level responsibility docstrings**

Add concise descriptions before imports:

```python
"""Expose the FastAPI HTTP/WebSocket boundary and assemble backend dependencies."""
```

```python
"""Implement business rules shared by HTTP routes and digital-human endpoints."""
```

```python
"""Adapt platform operations to either the contract Mock or the external Xiaoyi engine."""
```

```python
"""Synchronize active platform tasks with Xiaoyi without blocking request handlers."""
```

- [ ] **Step 2: Explain application assembly in `main.py`**

Comment these exact boundaries without restating syntax:

- `lifespan`: bootstrap admin, start one background synchronizer, and stop it cleanly.
- `app = FastAPI(...)`: the object imported by Uvicorn.
- CORS middleware: browser-origin policy, not authentication.
- exception handlers: convert internal exceptions into stable JSON responses.
- `/health/live` versus `/health/ready`: process health versus database readiness.
- `Depends(...)`: FastAPI resolves authentication and database sessions before entering a route.

- [ ] **Step 3: Explain the two teaching routes and WebSocket bridge**

Add comments around:

- `login`: validate credentials, create JWT, set HTTP-only cookie.
- plan confirmation and task creation: freeze authorized input before calling Xiaoyi.
- `/api/v1/prechecks/ws`: authenticate the browser socket and reuse one upstream Xiaoyi socket.
- SPA fallback: serve static files only after API routes fail to match.

- [ ] **Step 4: Explain service, engine, and sync separation**

Document that:

- `services.py` owns business invariants and database transactions.
- `engine.py` owns external payloads, timeouts, and response normalization.
- `sync.py` polls only active tasks, isolates failures per iteration, and persists normalized platform status.

- [ ] **Step 5: Check only the request-flow diff**

Run:

```powershell
git diff --check -- apps/api/app/main.py apps/api/app/services.py apps/api/app/engine.py apps/api/app/sync.py
```

Expected: no whitespace errors and no route, signature, status, or payload changes.

## Task 4: Write The Beginner Guide

**Files:**
- Create: `docs/fastapi-beginner-guide.md`

- [ ] **Step 1: Add the backend file map**

Create a table mapping each file to a beginner-friendly responsibility. Explicitly distinguish:

- FastAPI routes (`main.py`)
- validation/serialization (`schemas.py`)
- persistence (`models.py`, `db.py`)
- business rules (`services.py`)
- external integration (`engine.py`)
- background work (`sync.py`)

- [ ] **Step 2: Explain application startup and request lifecycle**

Show how this command resolves the application:

```powershell
python -m uvicorn app.main:app --reload --app-dir apps/api
```

Then explain this flow:

```text
HTTP request -> route -> Pydantic -> Depends -> service -> SQLAlchemy -> response model
```

- [ ] **Step 3: Walk through login end to end**

Trace `POST /api/v1/auth/login` through `LoginRequest`, `get_session`, password verification, JWT creation, HTTP-only cookie, and `UserRead` serialization. Explain why a 401 can occur before a protected route body runs.

- [ ] **Step 4: Walk through authorized scan creation end to end**

Trace `DRAFT` plan creation, precheck asset persistence, confirmation, snapshot freeze, idempotent platform task creation, one Xiaoyi Chat call, and background synchronization. State clearly that examples use Mock mode and do not scan a real target.

- [ ] **Step 5: Explain REST, WebSocket, and error handling**

Compare short-lived REST requests with the reusable precheck WebSocket. Describe Pydantic 422 responses, authentication 401, role/business errors, and normalized engine errors.

- [ ] **Step 6: Add safe learning commands and exercises**

Include commands for Swagger UI, local Mock mode, Ruff, pytest, and suggested breakpoints. Add exercises for reading `/health/ready`, tracing login, and tracing a Mock task; exclude real credentials and real scan targets.

- [ ] **Step 7: Self-review the guide**

Run:

```powershell
Select-String -Path docs/fastapi-beginner-guide.md -Pattern 'TBD|TODO|sk-|真实密码|真实目标'
git diff --check -- docs/fastapi-beginner-guide.md
```

Expected: no placeholders, secrets, unsafe examples, or whitespace errors.

## Task 5: Full Verification And Commit

**Files:**
- Modify: `apps/api/app/*.py` comments only
- Create: `docs/fastapi-beginner-guide.md`

- [ ] **Step 1: Run Ruff**

Run from `apps/api`:

```powershell
& 'C:\Users\86152\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' -m ruff check .
```

Expected: exit code 0.

- [ ] **Step 2: Run the full backend suite**

Run from `apps/api`:

```powershell
& 'C:\Users\86152\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' -m pytest -q
```

Expected: all tests pass with zero failures.

- [ ] **Step 3: Prove executable behavior did not change**

Run:

```powershell
git diff --word-diff=porcelain -- apps/api/app
git diff --check
```

Review every Python hunk and confirm additions are comments/docstrings only.

- [ ] **Step 4: Commit the teaching changes**

Run:

```powershell
git add apps/api/app docs/fastapi-beginner-guide.md
git commit -m "docs(api): explain fastapi request flow"
```

Expected: one focused documentation commit; local runtime data remains untracked and unstaged.
