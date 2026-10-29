# Repository Guidelines

## Project Structure & Module Organization

BiletFlow uses Python 3.12, FastAPI, and PostgreSQL 16.

- `apps/api/app/`: API code; `routers/` handles endpoints, `services/` contains business rules, `schemas.py` defines API bodies, and `views.py` builds responses.
- `apps/api/db/schema.sql`: authoritative database schema; keep `app/models.py` synchronized.
- `apps/api/tests/`: pytest suites and shared fixtures/helpers.
- `apps/web/src/`: React/Vite web screens and shared forms.
- `apps/mobile/src/`: Expo staff app, API/session modules, and Jest tests.
- `docs/`: requirements, architecture, operations, and `api/openapi.yaml` contract.
- `scripts/`: backup, restore, and local HTTP smoke test. Event images use external URLs.
- `apps/api/db/migrations/`: ordered SQL migrations; never edit a merged migration or `baseline.sql`.

## Build, Test, and Development Commands

Run from the repository root unless stated otherwise:

- `docker compose up --build`: build and start the web app, auto-reloading API, PostgreSQL, and Mailpit; seed demo data on first startup.
- `docker compose run --rm api pytest`: run the backend suite.
- `docker compose logs -f api`: follow API logs.
- `docker compose up -d db`: start PostgreSQL for local Python development.

`apps/web`: `npm ci`, `npm test`, `npm run build`. `apps/mobile` (Node 24): `npm ci`, `npm test`, `npm run typecheck`, `npm run check:dependencies`, `npm run export`.

## Coding Style & Naming Conventions

Use four-space indentation, snake_case functions/modules, PascalCase classes, and uppercase constants. Follow existing type annotations and import grouping. API JSON uses camelCase. Web code uses two-space indentation and Prettier (`npm run format` in `apps/web`). Preserve the existing mobile style.

Keep endpoints thin, business logic in services, and explicit commits in routers. Use stable `ApiError` codes documented in `docs/api/error-codes.md`. Add email/PDF text in Kazakh, Russian, and English through `services/messages.py`.

## Testing Guidelines

Name suites `test_<area>.py` and functions `test_<behavior>`. Reuse `tests/helpers.py` and the `api` fixture, which validates responses against OpenAPI. Tests recreate `biletflow_test`; point `TEST_DATABASE_URL` only at a disposable database. No numeric coverage threshold is configured. Add regression tests for behavior changes. Run a focused suite with `docker compose run --rm api pytest tests/test_checkout.py`.

## Commit & Pull Request Guidelines

Use concise commit subjects, optionally prefixed by area (`Backend:`, `API contract:`). Branch from `main` as `ALN-<ticket>-<slug>`. Describe behavior changes and validation in PRs, reference the ticket, and obtain one reviewer. Submit OpenAPI changes in a separate PR before implementation.

## Security & Configuration

Use `.env.example` for local configuration; never commit secrets. Replace JWT/QR secrets for shared deployments. Store money as integer tiyin and preserve simulated payment labels.
