# Scanner app (to build)

The Event Admin app: sign in, pick an event, scan tickets, check people in (SRS §4.8).
SRS §9 suggests React Native with Expo and TypeScript. The backend is ready: see the root README.

## Connecting to the API

- A phone cannot reach `localhost` on your computer. Use your computer's LAN address, e.g.
  `http://192.168.1.20:8000/v1` (same Wi-Fi). The API listens on all interfaces.
- Sign in with `staff@biletflow.kz` / `demo12345` (assigned to the demo events).
- Online only: no offline mode in the MVP.

## Endpoints you need

| Step | Call |
| --- | --- |
| Sign in / keep signed in | `POST /auth/login`, `POST /auth/refresh` |
| Event list (first screen) | `GET /checkin/events` |
| After a scan | `POST /checkin/events/{id}/verify` with `{ qrPayload }` — shows the result, admits nobody |
| Admit | `POST /checkin/events/{id}/check-ins` with `{ qrPayload }` or `{ ticketId }` |
| Counters (registered / checked in) | `GET /checkin/events/{id}/attendees` |
| Manual search | `GET /checkin/events/{id}/attendees?q=` (2+ characters) |
| Undo a mistake | `DELETE /checkin/check-ins/{checkInId}` (403 if the organizer did not allow it) |

## Show results clearly

`result` is one of: `valid` (green, admit), `already_used`, `cancelled`, `refunded`, `invalid`,
`wrong_event` (red, do not admit), `rejected_campaign_qr` (a promo poster, not a ticket).
Use colour **and** text, since staff read it in a hurry. A second check-in of the same ticket
returns 409 with the same shape, including `previousCheckIn`.

## Test tickets

Buy tickets in the web app or in http://localhost:8000/docs, then open the PDF from the email
in http://localhost:8025 and scan it from the screen. Paper and phone tickets carry the same code.
