# Phase 3: QR verification and admission

This phase adds QR camera scanning for the selected assigned event, server verification,
and a separate **Check in** action. Manual search and authorized Undo are now available from
the same event dashboard; see [OPERATIONS.md](OPERATIONS.md). Offline verification/sync and
organizer/attendee mobile functionality remain outside this app.

## Camera and architecture

`expo-camera ~57.0.6` was added with `npx expo install expo-camera`, using Expo SDK 57's
supported version. It includes QR scanning in Expo Go on physical iOS/Android devices;
there is no second scanner library. See the [SDK 57 camera documentation](https://docs.expo.dev/versions/v57.0.0/sdk/camera/).
The package/lockfile changes add this dependency and its transitive dependencies only.
The config plugin enables barcode scanning and a camera-purpose description, disables the
Android audio-recording permission, and omits the iOS microphone-purpose description.
No microphone permission is requested. Plugin permission text applies to custom builds;
Expo Go displays its own native permission text.

`EventDashboardScreen` owns attendance state and mounts one `TicketScanner` within the selected
event. `QrCamera` checks permission without prompting, offers an explicit permission request,
and handles denied/permanently denied permissions, settings, permission-query failures,
native initialization errors, and a 12-second startup timeout. It captures only QR codes from
the back camera, after native readiness. The preview unmounts while a result/request is shown,
on navigation, and while the app is inactive.

`TicketScanSession` is a feature-local state machine with synchronous phase guards and a
request generation. Repeated native emissions cannot start another verification; repeated
button taps cannot start another admission. Completed results require **Scan next ticket**
before capture restarts. Leaving the scanner discards its payload/result and ignores late
responses and callbacks. No scanned payloads are logged or persisted. The payload is opaque:
only the API's 1–2,000-character transport bound is checked locally.

The existing auth/session client supplies bearer tokens and coordinated refresh. Real
background-to-foreground transitions revalidate `/me` and return to the event list. Brief
inactivity, such as an iOS permission dialog, pauses capture without resetting navigation.
Interrupted verification must be repeated; an interrupted admission is uncertain. Leaving
during admission cannot cancel work already accepted by the server; reverify that ticket
after returning if confirmation was not seen.

## Server contract and results

The Phase 2 reads remain `GET /v1/checkin/events?assignedOnly=true` and
`GET /v1/checkin/events/{eventId}/attendees` without `q`. Every scan uses the authoritative
selected event ID; no event ID is derived from QR contents.

Both Phase 3 endpoints send `{ "qrPayload": "<opaque scanned value>" }`:

- `POST /v1/checkin/events/{eventId}/verify` returns a snapshot, and never admits anyone.
- `POST /v1/checkin/events/{eventId}/check-ins` is sent only after deliberate confirmation.
  A decoded success confirms admission. A structured HTTP 409 is decoded as `VerifyResult`
  by this endpoint's wrapper only; the shared client retains its generic error behavior.

| Server result | Staff message | Check in offered? |
| --- | --- | --- |
| `valid` | Valid ticket; verified only | Yes |
| `invalid` | Invalid ticket | No |
| `cancelled` | Cancelled ticket | No |
| `refunded` | Refunded ticket | No |
| `already_used` | Already checked in; do not admit again | No |
| `wrong_event` | Ticket belongs to another event | No |
| `rejected_campaign_qr` | Campaign QR — not an admission ticket | No |

Ticket details use only returned attendee name, ticket number/type, and optional seat information.
The decoder also checks response identity against the selected event and confirmed admission
against the verified ticket. Returned QR/PDF URLs and raw server messages are not retained/rendered.
Unknown or inconsistent response shapes do not offer admission.

A successful verification does not refresh or increment totals. Confirmed admission calls the
existing attendance refresh, never a local count increment. Totals refresh errors leave the
confirmed admission visible with stale/unavailable totals. Access loss (403/404 or removal from
the assigned-only list) still closes protected operational screens, using Phase 2 behavior.

Transport failures, HTTP 408/5xx, and malformed admission confirmations/refusals produce
**Check-in outcome unknown**. No automatic mutation retry occurs for those failures.
**Reverify ticket** reads the same QR again. If the server reports `already_used`, it confirms
an active check-in but cannot attribute it to this device's earlier request. If it reports
`valid`, another explicit **Check in** is required. A normal 401 may still use the existing
authenticated retry after token rotation; an ended session returns to sign-in.

## Ubuntu + iPhone / Expo Go procedure

1. Start the existing backend from `~/Desktop/ticketflow` with `docker compose up --build`
   if needed. Check `http://localhost:8000/docs`. Use a disposable development database:
   successful admission changes real test ticket state. Authorized staff can reverse a check-in
   through manual search; the scanner itself has no Undo button.
2. Use Node 24, enter `apps/mobile`, and run `npm ci` if dependencies are absent or stale.
   Preserve `.env`; set `EXPO_PUBLIC_API_URL=http://<UBUNTU-LAN-IP>:8000/v1`. Put the phone
   and Ubuntu on the same network. Open `http://<UBUNTU-LAN-IP>:8000/health` in iPhone Safari.
   Allow LAN traffic to API port 8000 and Metro port 8081.
3. Update Expo Go for SDK 57 and enable its Local Network access in iPhone settings. Sign into
   the same Expo account in Expo Go and CLI, as required by [Expo's iOS guidance](https://expo.dev/changelog/expo-go-57-login):

   ```sh
   npx expo login
   npm start -- --go --lan
   ```

   Scan Metro's launch QR with the iPhone Camera. After any API URL change, stop/restart Metro
   with `npm start -- --go --lan --clear` and fully reload the app. This launch QR is unrelated
   to an admission ticket.
4. Prepare current, published events assigned to the staff account using the fixture steps in
   [SETUP.md](SETUP.md). In a seeded local database the staff login is `staff@biletflow.kz` /
   `demo12345`; these are documented development credentials. Keep two assigned events for
   switching tests. Sign into the mobile app as staff and choose the correct event.
5. Obtain real test ticket QRs on Ubuntu. In Swagger, log in as the seeded attendee
   (`attendee@biletflow.kz` / `demo12345`), Authorize with its access token, and use
   `GET /v1/me/orders`. Choose a `valid` ticket whose `eventId` matches the selected event.
   Download `GET /v1/me/tickets/{ticketId}/pdf` while authorized as that buyer/attendee and
   open the PDF on Ubuntu's screen, large enough to scan. Keep several unused tickets.
   The organizer's `GET /v1/organizer/events/{eventId}/orders` also supplies ticket IDs and
   statuses for fixture management; it does not grant buyer access to the PDF endpoint.
6. Tap **Scan ticket QR**. On first use, verify that no native prompt appears until **Allow
   camera access**. Deny it, confirm clear recovery/settings controls, then grant it in
   iPhone Settings → Apps → Expo Go → Camera and return. Reopen the event/scanner after a
   full background transition. A simulator or unusable camera must show a retryable error.
7. Scan one unused ticket. Keep its QR in frame: only one result should appear. Confirm the
   attendee/ticket identity, **Valid ticket**, and **Check in** action. Compare totals with
   the attendees endpoint: verification alone must not change them. Tap **Check in** repeatedly;
   while submitting the action is disabled. Only **Check-in confirmed** permits entry.
   Totals should refetch. The camera stays stopped until **Scan next ticket**.
8. Tap **Scan next ticket** and scan the same QR: expect **Already checked in**, with no
   Check in action. Choose another event and scan the original QR: expect the wrong-event
   message. For a campaign QR, authorize Swagger as organizer, list
   `GET /v1/organizer/events/{eventId}/campaigns`, then download
   `GET /v1/organizer/campaigns/{campaignId}/qr`. Display/scan it: it must explicitly reject
   a campaign QR and never offer Check in. Scan an unrelated QR for the invalid case.
9. For cancelled/refunded cases, save the corresponding valid ticket PDFs first: the PDF
   endpoint refuses downloads after cancellation/refund. As organizer, cancel an unused free
   order using `POST /v1/organizer/orders/{orderId}/cancel` with
   `{"reason":"Phase 3 manual test"}`. Refund an unused paid order with
   `POST /v1/organizer/orders/{orderId}/refund`, the same body, and a unique `Idempotency-Key`
   such as `phase3-refund-<orderId>`. Scan the saved QRs and verify distinct rejection messages.
10. Test a race: verify a fresh valid ticket on the phone but do not press Check in. In Swagger,
    authorize as assigned staff and submit `POST /v1/checkin/events/{eventId}/check-ins` with
    that ticket's actual `qrPayload` from its ticket response. Now press Check in on the phone:
    expect the structured 409 to show Already checked in, never a fresh success. Similarly,
    cancelling/refunding between verification and admission must override the old valid result.
11. Stop only the API (`docker compose stop api`) while Metro continues. Scan or reverify and
    confirm a safe retryable verification error. Restore it with `docker compose start api`.
    To test stale responses, pause the API (`docker compose pause api`), start a verify or
    admission, navigate back and select another event, then `docker compose unpause api`
    within 15 seconds. Old results must not appear under the new event. If an admission was
    sent, reverify that original ticket before deciding what happened.
12. Remove the selected event's staff assignment through the existing organizer API while
    retaining another assignment. A verify/admission 403, manual assignment refresh, or the
    next active 30-second check must return to the list with a notice. Test logout during
    verification and session revocation via the password-reset procedure in SETUP.md; no
    late response should reopen the scanner. Background during admission, return and reselect
    the event, and reverify the original QR instead of assuming its outcome.
13. Check long event/attendee names, Larger Text, VoiceOver, all permission/retry controls,
    and screen-reader status labels. Confirm meaning is clear without color. Android follows
    the same steps on a physical Expo Go device; hardware Back should first leave the scanner,
    then return from the dashboard to the event list.

## Deterministic lost-response and totals-error tests

For a lost response **after** the backend commits, use an external development HTTP proxy;
turning off Wi-Fi at an arbitrary moment cannot prove that ordering. If `mitmdump` is available
on Ubuntu, save this temporary addon as `/tmp/biletflow-drop-admission.py`:

```python
from mitmproxy import http

class DropOneAdmission:
    dropped = False

    def response(self, flow: http.HTTPFlow):
        if (not self.dropped and flow.request.method == "POST"
                and flow.request.path.endswith("/check-ins")
                and flow.response is not None and flow.response.status_code == 201):
            self.dropped = True
            flow.kill()

addons = [DropOneAdmission()]
```

Run `mitmdump -q --mode reverse:http://127.0.0.1:8000 --listen-host 0.0.0.0 --listen-port 8001 -s /tmp/biletflow-drop-admission.py`.
Set the mobile API URL to `http://<UBUNTU-LAN-IP>:8001/v1`, permit port 8001, restart Metro
with `--clear`, and sign in again. Scan a fresh ticket and Check in. The app must show
**Check-in outcome unknown**, never automatically POST again. **Reverify ticket** must show
**Already checked in**. Restore the normal URL after testing and stop the proxy. The addon
does not log QR payloads or bearer tokens and makes no backend/mobile code changes.

For totals-refresh failure, use the proxy's response override to return 503 on the attendees
GET immediately after a successful admission. Leave the POST confirmation intact: the app
must keep **Check-in confirmed** and label the old totals as stale. Override only the relevant
GET, otherwise a 403/404 would correctly trigger access-loss navigation. Automated tests cover
this case and malformed success/refusal bodies without requiring a physical camera.

## Validation

From `apps/mobile`: `npm run typecheck`, `npm test`, `npx expo-doctor`, and
`npx expo install --check`. No lint/format scripts are configured; use `git diff --check`.
For both native bundles:

```sh
EXPO_NO_DOTENV=1 EXPO_PUBLIC_API_URL=https://api.example.test/v1 npx expo export --platform android --platform ios --max-workers 1 --output-dir /tmp/ticketflow-mobile-phase3-export
```

Jest supplies controlled native camera events; it does not prove physical QR recognition,
camera permission behavior, focus, or device layout. The device steps above still need a real
iPhone/Android device. Dependency installation reported 59 npm advisories (12 moderate,
47 high); no forced upgrades were applied.
