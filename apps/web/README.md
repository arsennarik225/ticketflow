# Web app

React + Vite + TypeScript. Plain CSS, React Router, built-in `fetch`, and local component
state. All business rules remain in the FastAPI backend.

## Run

From the repository root, `docker compose up --build` serves everything at
http://localhost:3000. Emails appear at http://localhost:8025.

For live frontend editing (Node 22.12+):

```bash
docker compose up -d db mail api
cd apps/web
npm ci
npm run dev
```

Stop the Docker web service first if it occupies port 3000: `docker compose stop web`.
Vite proxies `/v1` to localhost:8000. No frontend environment file is needed.

## Code map

- `events.tsx`: discovery, seats, checkout, orders, printable tickets.
- `organizer.tsx`: event setup, ticket types, activation, campaigns, sales, staff, insights.
- `support.tsx`, `admin.tsx`, `auth.tsx`: the named workflows.
- `api.ts`: session, refresh-token rotation, HTTP errors, authenticated downloads.
- `ui.tsx`: reusable forms, lists, loading/errors, paging.
- `i18n.tsx`, `styles.css`: Kazakh/Russian/English text and responsive styling.
- `api-schema.d.ts`: generated types; do not edit manually.

`npm test` checks client/session behavior. `npm run build` type-checks and builds static
files. `npm run api:types` regenerates the web types from the contract.
`npm run format` formats web source. See [testing](../../docs/HOW-TO-CHECK.md)
and [deployment](../../docs/deployment.md).

Dates in forms use the device time zone; event display uses the event's IANA time zone.
Prices are entered as KZT and sent as integer tiyin. A guest receives PDFs by email;
account downloads require sign-in and, for guest orders, a verified matching email.
