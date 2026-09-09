# BiletFlow

Event ticketing platform for Kazakhstan. Student project.

**Requirements:** [`docs/BiletFlow_SRS_Initial_Draft.pdf`](docs/BiletFlow_SRS_Initial_Draft.pdf) — the source of truth.
**API contract:** [`docs/api/openapi.yaml`](docs/api/openapi.yaml) — read before writing code.
**How to check this:** [`docs/HOW-TO-CHECK.md`](docs/HOW-TO-CHECK.md)

Weeks 1–2 groundwork only (SRS §13.3). No app code yet.

## Folders

```
apps/web/     Web app — attendee, organizer, admin
apps/mobile/  Ticket-scanner app for Event Admins
apps/api/     FastAPI backend
docs/         Requirements + API contract
```

## Stack

Python + FastAPI + PostgreSQL (leaning, not final). Docker for deployment (SRS §8).
Web and mobile stack not confirmed — SRS §9 recommends React, React Native, TypeScript, Tailwind.

Still owed: the short written rationale for FastAPI + Postgres that SRS §9 asks for.

## See the API contract

Paste `docs/api/openapi.yaml` into **[editor.swagger.io](https://editor.swagger.io)** — easiest way.
Or run `npx @redocly/cli preview-docs docs/api/openapi.yaml`.

It covers only the core flow (SRS §13.4): create event → share campaign QR → apply promo →
pick ticket → simulated checkout → issue ticket → support → verify entry.
Analytics, event history, admin portal, seating, and calendar export come later.

## Rules nobody should break

From the SRS, not opinions. Getting these wrong breaks the demo.

- Money is an **integer in tiyin** (1 KZT = 100). Never a float. (§7)
- Payments are **simulated**, always flagged, never shown as real money. (§4.6)
- Tickets are issued **only after payment succeeds**. (§4.6)
- Checkout **holds** tickets atomically — two people can't buy the same last seat. (§4.3.1, §7)
- Paper and phone ticket share **one identifier** — not two admissions. (§4.7)
- A **Campaign QR is never admission**. The scanner must reject it. (§4.14)
- Discounts are calculated **on the server**, never sent by the client. (§4.14)
- Check-in is **online only**, and a ticket can't be used twice. (§4.8)

## FastAPI warning

FastAPI generates its own `/openapi.json` from your Pydantic models, so you'll have two
specs that drift apart. **`docs/api/openapi.yaml` is the source of truth** — build models
to match it, not the reverse.

## Decide before coding

| Question | SRS |
| --- | --- |
| Guest checkout, or must attendees register? | §12 |
| Activation fee amount, refundable? | §3.3, §12 |
| Processing fee — organizer or attendee pays? | §12 |
| How long does checkout hold tickets? | §4.3.1 |
| Payment sandbox, or our own simulation? | §12 |

## Working agreement

Branch `ALN-<ticket>-<slug>` off `main`. PR with one reviewer (SRS §13.2).
Changes to `openapi.yaml` go in their own PR — all three apps depend on it.
