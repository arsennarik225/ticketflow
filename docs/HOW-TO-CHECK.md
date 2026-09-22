# How to check this

## 1. Start it (2 minutes)

```bash
docker compose up --build
```

Wait for `Application startup complete`. The first build downloads Python packages, so it is slower.

## 2. Run the tests

```bash
docker compose run --rm api pytest
```

All tests should pass. They cover every rule in the README and validate every response against
`docs/api/openapi.yaml`.

## 3. Try the core flow (SRS §13.4) in the browser

Open http://localhost:8000/docs, press **Authorize** after signing in (`POST /auth/login`, copy
`accessToken`). Demo password for every account: `demo12345`.

1. As `organizer@biletflow.kz`: `GET /organizer/events` — four events in different states.
2. Create a campaign for "Astana Jazz Night": `POST /organizer/events/{id}/campaigns`, then
   `GET /organizer/campaigns/{id}/qr` shows the orange "NOT A TICKET" QR.
3. Without signing in: `GET /events/{id}?campaignToken=…` shows the promo applied.
4. As `attendee@biletflow.kz`: `POST /checkout/sessions`, then
   `POST /checkout/sessions/{id}/confirm` with payment token `tok_success`.
   The email with PDF tickets appears at http://localhost:8025.
5. `POST /support/cases` with the ticket id — the organizer gets the case.
6. As `staff@biletflow.kz`: `POST /checkin/events/{id}/verify` with the ticket's `qrPayload`
   (valid), then with the campaign link (rejected). Check in twice: the second time is refused.

## 4. Look at the database

Connect any SQL client to `localhost:5433`, user, password, and database `biletflow`.
The diagram and table guide are in `docs/database.md`.

## What to review

- `docs/api/openapi.yaml` — the contract the web and mobile teams build on.
- `apps/api/db/schema.sql` — the data model.
- The defaults for the open questions in `README.md` → "Decisions".

## What is deliberately missing

Assigned seating (§4.3.1) is a bonus feature and is not built. The web and mobile apps are not
started; their folders hold short guides for the teams.
