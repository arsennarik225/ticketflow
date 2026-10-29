# BiletFlow API

FastAPI + PostgreSQL. Implements every operation in [`docs/api/openapi.yaml`](../../docs/api/openapi.yaml).
Design notes: [`docs/architecture.md`](../../docs/architecture.md), [`docs/database.md`](../../docs/database.md).

## Run

With Docker (recommended), from the repository root: `docker compose up --build`.
Code in `apps/api/app` is mounted into the container, so edits reload the API on their own.

Without Docker (Python 3.12, and the database from `docker compose up -d db`):

```bash
cd apps/api
python3.12 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
.venv/bin/python -m app.initdb            # create tables (add SEED_DEMO_DATA=true for demo data)
.venv/bin/uvicorn app.main:app --reload   # http://localhost:8000/docs
```

## Test

```bash
docker compose run --rm api pytest      # in Docker
cd apps/api && .venv/bin/pytest         # locally (needs the db container)
```

Tests use a separate database, `biletflow_test`, recreated on every run. The `api` fixture
checks **every response** against `openapi.yaml`, so a field or status code that drifts from
the contract fails the build.

## Layout

```
app/main.py        app setup: /v1 routes, CORS, errors, /docs from the contract
app/routers/       endpoints, grouped like the contract tags
app/services/      business rules (checkout, pricing, inventory, seating, refunds, PDFs, email, …)
app/services/messages.py   every email and PDF text in Kazakh, Russian, English
app/models.py      tables (mirror of db/schema.sql)
app/schemas.py     request/response bodies (camelCase JSON)
app/views.py       rows -> response bodies
app/initdb.py      applies db/schema.sql; app/seed.py loads demo data
db/schema.sql      the database schema, the source of truth
tests/             one file per area; helpers.py builds users, events, purchases
```

## Adding or changing an endpoint

1. Change `docs/api/openapi.yaml` first (own PR — the apps depend on it).
2. Add the body in `app/schemas.py`, the route in `app/routers/`, rules in `app/services/`.
3. Write a test with the `api` fixture; it will also check your response against the contract.

Conventions: routers call `db.commit()` themselves; raise `ApiError` helpers from `app/errors.py`
(`conflict`, `invalid`, `not_found`, …) with a stable `code` and add it to
`docs/api/error-codes.md`; write important actions to the audit log with `services.audit.record`;
send email only through `services.notify`, with its text in all three languages in `messages.py`.

## Settings

Environment variables (defaults work locally; see `.env.example` in the repo root):

| Variable | Meaning |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection |
| `JWT_SECRET`, `QR_SECRET` | Sign access tokens and ticket QR codes — change for any shared deployment |
| `WEB_URL`, `API_URL` | Used in email links, Campaign QR links, `pdfUrl`, `qrImageUrl` |
| `SMTP_HOST`, `SMTP_PORT` | Mail server; empty host = print emails to the log |
| `SMTP_USERNAME`, `SMTP_PASSWORD` | Optional SMTP authentication |
| `SMTP_STARTTLS`, `SMTP_SSL` | Enable STARTTLS (587) or implicit TLS (465) for a server deployment |
| `CORS_ORIGINS` | Allowed browser origins, comma-separated or `*` |
| `SEED_DEMO_DATA` | `true` loads demo data into an empty database |

Business settings (fees, hold time, guest checkout, terms version) live in the
`platform_settings` table and are changed through `/v1/admin/settings`.

## Simulations

Nothing real happens with money or identity (SRS §3.2, §8):

- Payment tokens: `tok_success` (or anything else) succeeds, `tok_declined` and
  `tok_insufficient_funds` fail with 402.
- Identity verification is approved at once; payout accounts store only `****` + last 4 characters.
- Every payment and refund carries `simulated: true`.

Backups and deploying a demo server securely: [`docs/operations.md`](../../docs/operations.md).
Runnable HTTPS deployment: [`docs/deployment.md`](../../docs/deployment.md). Promote a verified
account with `python -m app.admin email@example.kz` from the API environment.
