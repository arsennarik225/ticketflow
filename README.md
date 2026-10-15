# BiletFlow

Event ticketing platform for Kazakhstan. Student project.

**Requirements:** [`docs/BiletFlow_SRS_Initial_Draft.pdf`](docs/BiletFlow_SRS_Initial_Draft.pdf) — the source of truth.
**API contract:** [`docs/api/openapi.yaml`](docs/api/openapi.yaml) — what the web and mobile apps build against.
**Error codes:** [`docs/api/error-codes.md`](docs/api/error-codes.md) — what the apps translate.
**How to check this:** [`docs/HOW-TO-CHECK.md`](docs/HOW-TO-CHECK.md)

## Run it

You need Docker Desktop. From the repository root:

```bash
docker compose up --build
```

The first start creates the database and loads demo data. Then open:

| What | Where |
| --- | --- |
| API | http://localhost:8000/v1 |
| API docs — try every request here | http://localhost:8000/docs |
| Emails the API sends (verification, tickets…) | http://localhost:8025 |
| PostgreSQL (for DBeaver, TablePlus…) | `localhost:5433`, user / password / database: `biletflow` |

Demo accounts, all with password `demo12345`:

| Email | Role |
| --- | --- |
| `admin@biletflow.kz` | Platform Admin (emails in English) |
| `organizer@biletflow.kz` | Organizer with 5 events: paid, free, seated, draft, finished (Russian) |
| `staff@biletflow.kz` | Event Admin — use this in the scanner app (Russian) |
| `attendee@biletflow.kz` | Attendee with tickets, seats, and a support case (Kazakh) |

Payments are simulated. Use `tok_success`, `tok_declined`, or `tok_insufficient_funds` as the payment token.

```bash
docker compose run --rm api pytest   # run the backend tests
docker compose logs -f api           # watch the API log
docker compose down -v               # stop and wipe the database (demo data returns on next start)
                                     # a schema change no longer needs this: see docs/database.md
scripts/backup.sh                    # back up the database (restore: scripts/restore.sh <file>)
```

A port already in use? Copy `.env.example` to `.env` and change it there.

## Folders

```
apps/api/     FastAPI backend — done, see apps/api/README.md
apps/web/     Web app for attendees, organizers, admins — to build, see apps/web/README.md
apps/mobile/  Ticket-scanner app for Event Admins — to build, see apps/mobile/README.md
docs/         Requirements, API contract, database and architecture notes
```

## Stack

Python 3.12 + FastAPI + PostgreSQL 16, run with Docker Compose — reasons in
[`docs/architecture.md`](docs/architecture.md). Data model: [`docs/database.md`](docs/database.md).
Backups and a secure demo deployment: [`docs/operations.md`](docs/operations.md).
Web and mobile are not started; SRS §9 recommends React (Next.js), React Native (Expo), TypeScript, Tailwind.

## Rules nobody should break

From the SRS, not opinions. The backend enforces all of them; the apps must not work around them.

- Money is an **integer in tiyin** (1 KZT = 100). Never a float. (§7)
- Payments are **simulated**, always flagged, never shown as real money. (§4.6)
- Tickets are issued **only after payment succeeds**. (§4.6)
- Checkout **holds** tickets atomically — two people can't buy the same last ticket. (§4.3.1, §7)
- Paper and phone ticket share **one identifier** — not two admissions. (§4.7)
- A **Campaign QR is never admission**. The scanner rejects it. (§4.14)
- Discounts are calculated **on the server**, never sent by the client. (§4.14)
- Check-in is **online only**, and a ticket can't be used twice. (§4.8)

## Decisions (defaults)

The SRS left these open (§12). The backend uses the defaults below. A Platform Admin can change
guest checkout, the fee amounts, who pays the processing fee, and the hold time at
`PATCH /v1/admin/settings`, without a deploy.

| Question | Default |
| --- | --- |
| Guest checkout, or must attendees register? | Guests can buy; they get tickets by email |
| Activation fee amount, refundable? | 5 000 KZT per event, not refundable |
| Processing fee — organizer or attendee pays? | Organizer: 2.5 % deducted from the payout |
| How long does checkout hold tickets? | 10 minutes |
| Payment sandbox, or our own simulation? | Our own simulation, labelled as such |
| Language of emails and PDF tickets | Russian, unless the account or checkout picks Kazakh or English |

Also: private events open only through a campaign link (the organizer's invite), and refunds
are always full.

## Features

Everything the SRS requires for the MVP (§8), plus the bonus features: assigned seating with a
predefined 160-seat hall (§4.3.1), calendar export with one-click Google/Outlook links (§4.11),
offline scanning with later sync, and file attachments in support chat. GA4 analytics is optional
and belongs in the web app.

## Working agreement

Branch `ALN-<ticket>-<slug>` off `main`. PR with one reviewer (SRS §13.2).
Changes to `openapi.yaml` go in their own PR — all three apps depend on it. The backend tests
check every response against it, so the code and the contract cannot quietly drift apart.
