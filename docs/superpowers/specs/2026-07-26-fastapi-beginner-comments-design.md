# FastAPI Beginner Comments And Learning Guide Design

## Goal

Help a beginner understand how this repository's FastAPI backend handles a request without changing any API behavior, database schema, dependency, or deployment architecture.

The teaching material follows real request paths instead of explaining framework features in isolation. A reader should be able to start at an HTTP request, locate the responsible route, and follow validation, authentication, database access, business logic, engine integration, and the response back to the browser.

## Chosen Approach

Use a request-flow-first structure:

1. Add short, durable comments at important framework and module boundaries.
2. Keep detailed explanations in `docs/fastapi-beginner-guide.md`.
3. Teach with two concrete flows: login and authorized scan-task creation.

This avoids line-by-line comments that would make production code noisy and quickly become stale.

## Code Comment Scope

Comments will explain why a framework boundary exists, not restate obvious Python syntax.

- `apps/api/app/main.py`
  - FastAPI application creation and lifespan startup/shutdown.
  - Middleware and exception handlers.
  - Route decorators, request models, response models, and dependency injection.
  - Login, scan-plan confirmation, task creation, precheck WebSocket proxy, health endpoints, and SPA fallback.
- `apps/api/app/config.py`
  - Environment-backed settings, cached settings, and production security validation.
- `apps/api/app/db.py`
  - Async SQLAlchemy engine, session factory, and request-scoped session dependency.
- `apps/api/app/auth.py`
  - JWT creation/decoding, cookie or bearer-token lookup, current-user dependency, and role guards.
- `apps/api/app/schemas.py`
  - Pydantic request/response boundary and the distinction from ORM models.
- `apps/api/app/models.py`
  - SQLAlchemy persistence models and the separation between platform IDs and external engine IDs.
- `apps/api/app/services.py`
  - Business rules kept outside route handlers, especially plan creation, confirmation snapshot handling, and task creation.
- `apps/api/app/engine.py`
  - Mock versus Xiaoyi adapters, outbound HTTP/WebSocket boundaries, and external-response normalization.
- `apps/api/app/sync.py`
  - Background task synchronization and why it is started and stopped through application lifespan.

Comments will be added only where a beginner otherwise needs to infer a non-obvious framework concept or architectural rule.

## Learning Guide Structure

Create `docs/fastapi-beginner-guide.md` with these sections:

1. What FastAPI is responsible for in this repository.
2. A map of the backend files and their single responsibility.
3. How `uvicorn app.main:app` finds and starts the application.
4. Request lifecycle: route matching, Pydantic validation, dependencies, business service, database commit, response serialization.
5. Login walkthrough:
   - `POST /api/v1/auth/login`
   - `LoginRequest`
   - SQLAlchemy query
   - password verification
   - JWT creation
   - HTTP-only cookie
6. Authorized scan walkthrough:
   - create `DRAFT` plan
   - save precheck assets
   - confirm and freeze the snapshot
   - create a platform task
   - call the Xiaoyi adapter once
   - synchronize status and results
7. REST versus WebSocket in the precheck flow.
8. Error handling and stable platform error responses.
9. Safe local learning commands and suggested breakpoints.
10. Beginner exercises that use Mock mode and never trigger a real scan.

The guide will link to exact repository files and use small excerpts only when they clarify a concept.

## Data Flow

The central teaching model is:

```text
Browser request
  -> FastAPI route in main.py
  -> Pydantic schema validation
  -> Depends(...) authentication/database dependencies
  -> service-layer business rules
  -> SQLAlchemy models and transaction
  -> optional Xiaoyi engine adapter
  -> response model serialization
  -> browser response
```

For WebSocket precheck, the guide will show the separate long-lived path:

```text
Browser WebSocket
  -> platform authentication
  -> FastAPI WebSocket route
  -> one reusable Xiaoyi WebSocket session
  -> normalized result
  -> browser WebSocket
```

## Error Handling

The documentation will distinguish four common failure categories:

- Pydantic validation failures before route business logic runs.
- Authentication and authorization failures from dependencies.
- Business-rule failures raised as `AppError`.
- Xiaoyi/network failures normalized at the engine boundary.

No new exception type or response format will be introduced.

## Verification

Because the implementation changes comments and documentation only, verification focuses on proving there was no behavioral change:

- Run `python -m ruff check apps/api`.
- Run the complete backend test suite with `python -m pytest apps/api/tests -q`.
- Review the diff to confirm only comments and the beginner guide changed.
- Scan the guide for placeholder text, stale route names, secrets, and unauthorized real-scan examples.

## Non-Goals

- No route, schema, database, authentication, or engine behavior changes.
- No refactoring of the large `main.py` file.
- No new dependency, service, tutorial application, or example credentials.
- No frontend changes and no settings-page work.
- No real target scanning in examples or tests.

## Success Criteria

- A beginner can identify which file to open for routing, validation, persistence, authentication, business logic, Xiaoyi integration, and background synchronization.
- The login and authorized scan flows can be followed end to end from the guide.
- Production code comments explain architectural intent without repeating obvious syntax.
- Ruff and all backend tests pass unchanged.
