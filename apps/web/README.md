# Web app (to build)

Attendee, organizer, and admin screens. The backend is ready: run `docker compose up` in the
repo root and build against http://localhost:8000/v1 (docs at http://localhost:8000/docs).
SRS §9 suggests React (Next.js), TypeScript, Tailwind.

## Before you start

- Generate typed API models from the contract instead of writing them by hand:
  `npx openapi-typescript ../../docs/api/openapi.yaml -o src/api/schema.d.ts`
- Run it at http://localhost:3000, or set `WEB_URL` in `.env`: email links and Campaign QR
  codes point there.

## Things that are easy to get wrong

- **Money** is an integer in tiyin: show `amount / 100` KZT. Never send prices or discounts;
  the server computes them from the ticket types and the promo code.
- **Label payments as a demonstration.** Every payment has `simulated: true` (SRS §4.6).
  Test tokens: `tok_success`, `tok_declined`, `tok_insufficient_funds`.
- **Errors:** branch on `error.code` and show your own translated text (Kazakh, Russian,
  English — SRS §7). `error.message` is only an English fallback.
- **Auth:** the access token lasts 15 minutes. On 401 call `POST /auth/refresh`; the refresh
  token rotates, so store the new one every time.
- **Missing fields:** optional fields are left out, never `null`.
- **Event images** are links (`imageUrl`, http/https). There is no upload endpoint yet.

## Pages the backend links to

Emails and Campaign QR codes open these routes, so the app needs them:

| Route | What it does |
| --- | --- |
| `/verify-email?token=…` | `POST /auth/verify-email`, then the user is signed in |
| `/reset-password?token=…` | form -> `POST /auth/password/reset` |
| `/events/:id?campaign=…` | event page; pass `campaign` as `campaignToken` to `GET /events/{id}` and to checkout |
| `/orders/:id` | order and tickets (`GET /me/orders/{id}`) |
| `/support/:id` | support thread (`GET /support/cases/{id}`, poll for new messages) |

## Checkout flow

1. `POST /checkout/sessions` holds the tickets. Show a countdown to `expiresAt`.
   Guests must send one attendee per ticket.
2. Optional: `PUT /checkout/sessions/{id}/promo-code` with a typed `code`.
3. `POST /checkout/sessions/{id}/confirm` with an `Idempotency-Key` header. Create the key once
   per "Pay" click and reuse it if you retry the same request. If `requiresPayment` is false
   (free tickets), show no payment form.
4. A 402 means the payment failed; let the buyer try again while the hold lasts. A 410 means
   the hold expired; start again.

## Organizer and admin screens

- Paid events: show the checklist from `GET /organizer/events/{id}/activation`.
- Campaigns: the QR PNG needs the auth header, so fetch it and use a blob URL for `<img>`/download.
- Dashboard: `/organizer/events/{id}/analytics` (§4.15) and `/history` (§4.16);
  the list filter `status=upcoming|active|completed|cancelled` gives the past-events views.
- Admin portal: everything under `/admin` (Platform Admin only).
- Calendar (§4.11): link to `/v1/events/{id}/calendar.ics`; build Google Calendar links from
  the event fields.
- Assigned seating (bonus) is not in the backend.
