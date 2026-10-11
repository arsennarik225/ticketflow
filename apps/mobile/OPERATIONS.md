# Phase 4: manual search, admission, and reversal

All operations remain online and scoped to the selected assigned event. From its dashboard,
choose **Scan ticket QR** or **Search attendee / ticket**. Returning to the dashboard destroys
the open tool's local ticket state; reopening search starts with an empty query and obtains
fresh server matches. Reopening the scanner performs fresh server verification.

## Contract and state ownership

The existing authenticated client supplies the `/v1` base URL, bearer tokens, coordinated
401 refresh, and session-generation checks. No new navigation tree or persistent ticket cache
is introduced. `AttendeeSearchSession` owns one mounted search's query, results, confirmation,
and mutation state, following the scanner's synchronous guards and generation checks.

| Operation | Endpoint | Body / result |
| --- | --- | --- |
| Assigned events | `GET /v1/checkin/events?assignedOnly=true` | Existing authoritative event selection |
| Search | `GET /v1/checkin/events/{eventId}/attendees?q=...` | Operational matches, counts, `canReverseCheckIn` |
| Totals | `GET /v1/checkin/events/{eventId}/attendees` | Existing dashboard counts and capability |
| Manual check-in | `POST /v1/checkin/events/{eventId}/check-ins` | `{ "ticketId": "<server ticket ID>" }`; confirmed check-in or structured 409 |
| Reverse | `DELETE /v1/checkin/check-ins/{checkInId}` | Empty 204 confirmation |
| QR verification / admission | Existing `/verify` and `/check-ins` POSTs | `{ "qrPayload": "<opaque scanned value>" }` |

Search trims input and validates 2–100 Unicode characters before any request. Typing does not
request; use Search or the keyboard's Search action. Repeated submits while that query is pending
are ignored, including keyboard submissions. Editing the query immediately clears old
matches and invalidates outstanding responses. Responses must have recognized ticket statuses,
unique ticket IDs, valid operational fields/counts, and a Boolean reversal capability. The UI
labels matches as capped at 50 and asks staff to narrow a full result set.

Cards display name, email, ticket number/type, text status, optional seat label, and check-in
time in the event's timezone. `ticketId` and active `checkInId` are kept for their respective
requests; raw internal IDs, order IDs, QR payloads, and arbitrary server messages are not shown.

Only a fresh `valid` row without an active check-in offers admission. A synchronous lock blocks
double taps and concurrent row mutations; old row references are rejected. The backend decides
admission, including when the row changed since searching. QR and manual requests share
`submitAdmission` (confirmation and 409 decoding) and `resultCopy` (operational language).

Undo requires an active server `checkInId` and `canReverseCheckIn === true` from search. It opens
a modal identifying the attendee and ticket, with Cancel and a destructive Confirm reversal
button. The scrollable dialog respects device safe areas, including with Larger Text enabled.
The capability is UI guidance; DELETE authorizes again on the server. No ticket ID is
substituted for a check-in ID, and no local history is deleted.

Confirmed mutation outcomes are independent of subsequent read errors. Each completed mutation
attempt refreshes both search and dashboard totals; no count, ticket status, or active ID is
changed optimistically. A successful search supplies the current ID or removes it when absent.
A reversed ticket is admitted again only if the new response says `valid` without an active ID.
Failed refreshes retain old matches/counts, mark them stale, and disable row actions until search
succeeds. A successful mutation's confirmation remains visible.

Reversal-specific 403 (`cannot_reverse_check_in`) displays permission loss, hides Undo, and
reconciles. Assignment 403 returns through the existing event access-loss flow. A record-level
404 displays unavailable and refreshes search; event 403/404 during search returns to the list.
DELETE is idempotent: an already-reversed record returns 204. The UI says the server confirms
the record is reversed, without attributing the original reversal to this device.

Network failures, 408, 5xx, and malformed mutation responses show **outcome unknown**, never
success or an automatic mutation retry. Read reconciliation cannot establish which device
performed an earlier change; the uncertainty message remains alongside current server status.
Leaving during a pending request cannot cancel work the server has already received.

Changing tools/events, logout, session expiry, account changes, and assignment loss unmount
the feature. Its query, personal data, confirmation, and IDs are cleared; late responses cannot
affect a new query, screen, or session. Existing background auth revalidation and assignment
polling remain in place.

## Ubuntu + iPhone + Expo Go acceptance procedure

Use only disposable local development tickets for mutation tests.

1. From `~/Desktop/ticketflow`, start the existing backend with `docker compose up --build`
   if needed. Open `http://localhost:8000/docs` on Ubuntu. Follow [SETUP.md](SETUP.md) to prepare
   two current published events assigned to a verified Event Admin and valid test tickets.
   Use an attendee's `GET /v1/me/orders` to obtain ticket numbers/IDs; obtain its ticket PDF
   using `GET /v1/me/tickets/{ticketId}/pdf` for cross-tool QR tests. Keep cancelled/refunded
   tickets too, if available. The mobile app has no fixture bypass.
2. On Ubuntu, run `hostname -I` and identify the reachable LAN IPv4 address. Preserve the
   existing `apps/mobile/.env`, setting only `EXPO_PUBLIC_API_URL=http://<LAN-IP>:8000/v1` as
   needed. Connect the iPhone to the same LAN and open `http://<LAN-IP>:8000/health` in Safari.
   Permit local access to ports 8000 and Metro's displayed port (usually 8081).
3. Use Node 24. In `apps/mobile`, run `npm ci` only if dependencies are absent. Use the
   compatible Expo Go version described in [SETUP.md](SETUP.md), sign into the same Expo
   account in CLI and the phone, and run:

   ```sh
   cd ~/Desktop/ticketflow/apps/mobile
   npx expo login
   npm start -- --go --lan --clear
   ```

   Scan the launch QR with iPhone Camera and open Expo Go. Permit Local Network access.
   Sign into BiletFlow as assigned staff; select event A. A Metro tunnel alone does not expose
   the API, and Ubuntu cannot run the iOS simulator.
4. Tap **Search attendee / ticket**. Empty input and one trimmed character must not submit.
   Paste more than 100 characters: Search stays disabled. Type a real name, email, then ticket
   number, with leading/trailing spaces; requests occur only on Search/keyboard submission.
   Compare each result to Swagger's attendees endpoint with the same `q`. Check identity,
   type, status, optional seat, and timezone-labelled timestamp. Search random text for no
   matches. With 50 matching tickets, expect the cap/refine message rather than a full-list claim.
5. Search an unused ticket and tap **Check in <number>** repeatedly. One mutation should run.
   Wait for **Check-in confirmed** before admitting. Confirm totals refresh, status becomes
   Already checked in, Check in disappears, and the staff-authorized GET now returns an active
   `checkInId`. Cancelled/refunded rows must never offer admission.
6. Test stale admission: search another valid ticket on the phone; before tapping Check in,
   submit `POST /v1/checkin/events/{eventId}/check-ins` in Swagger as assigned staff with
   `{ "ticketId": "<that ticket ID>" }`. Tap Check in on the phone. Expect **Already checked in**
   and a refusal explanation, no new confirmation or optimistic count increment.
7. As organizer in Swagger, list `GET /v1/organizer/events/{eventId}/staff`. There is no update
   endpoint: remove the existing assignment with
   `DELETE /v1/organizer/events/{eventId}/staff/{assignmentId}`, then immediately recreate it
   using `POST /v1/organizer/events/{eventId}/staff` with
   `{ "email": "<staff email>", "canReverseCheckIn": false }`. Refresh search for a checked-in
   ticket: no Undo. Keep a second assignment throughout so the staff role remains. To set true,
   delete/recreate A's assignment with `canReverseCheckIn: true`, then refresh: Undo appears. Tap it,
   verify the identifying modal, then Cancel: no DELETE or changed state. Tap again and Confirm
   reversal: wait for **Reversal confirmed**. Compare totals/search to the backend; active ID
   disappears only after refresh, and Check in returns only if the server reports valid.
8. With Undo already visible (or its confirmation open), delete/recreate A's assignment with
   permission false from Swagger. Complete both calls before the app's next 30-second assignment
   check; if it observes the temporary removal, reselect A and repeat after restoring true.
   Confirm on the phone. Expect **Reversal not permitted**, no false confirmation, and the
   checked-in state retained. Restore true and refresh. For an already-reversed case, open
   confirmation on the phone, DELETE that exact active ID as authorized staff in Swagger,
   then confirm on the phone. Its idempotent 204 should reconcile without decrementing twice.
9. Check cross-tool consistency: scan and admit a fresh ticket using [SCANNING.md](SCANNING.md).
   Return to the event, open Search, and search it: Already checked in. Reverse it with permission,
   return to the event, reopen Scan, and scan the same PDF: the backend should now report Valid
   ticket. Verification alone must not admit it. Search starts empty whenever reopened.
10. Test read failure with Metro running: `docker compose stop api`, then Refresh results.
    Old matches remain with a stale notice and disabled mutations. Restart using
    `docker compose start api`, then refresh. To test late reads, `docker compose pause api`,
    submit a query, edit it or leave/select event B, and `docker compose unpause api` within
    15 seconds. Old rows, confirmation, and IDs must never appear under B or a newer query.
11. During a pending search or mutation, test Sign out and assignment removal. As organizer,
    remove A's assignment with `DELETE /v1/organizer/events/{eventId}/staff/{assignmentId}`,
    keeping a second assignment. Refresh totals/assignments or allow the 30-second active poll.
    Expect access-loss navigation and cleared protected data. Test session revocation using
    [SETUP.md's password-reset procedure](SETUP.md); background/return also revalidates auth.
    Restore permissions/assignments after the test. Re-search any ticket whose mutation was
    interrupted instead of guessing its outcome.
12. Enable VoiceOver and Larger Text on the iPhone. Confirm readable statuses, distinct ticket
    button labels, keyboard Search, scrollable results, and a readable reversal modal with Cancel
    and Confirm. Check small-screen layout and long names. On Android, hardware Back should
    dismiss the confirmation first, then leave Search, then leave the selected event.

## Controlled mutation-response loss and failed reconciliation

For deterministic response loss **after commit**, use a development reverse proxy; switching
Wi-Fi off at a random instant does not prove commit timing. With `mitmdump` installed on Ubuntu,
save this addon outside the repository as `/tmp/biletflow-drop-reversal.py`:

```python
from mitmproxy import http

class DropOneReversal:
    dropped = False

    def response(self, flow: http.HTTPFlow):
        if (not self.dropped and flow.request.method == "DELETE"
                and flow.request.path.startswith("/v1/checkin/check-ins/")
                and flow.response is not None and flow.response.status_code == 204):
            self.dropped = True
            flow.kill()

addons = [DropOneReversal()]
```

Run:

```sh
mitmdump -q --mode reverse:http://127.0.0.1:8000 --listen-host 0.0.0.0 --listen-port 8001 -s /tmp/biletflow-drop-reversal.py
```

Temporarily use API port 8001 in the local `.env`, permit that port, restart Metro with `--clear`,
and sign in. Reverse a checked-in ticket. Expect **Reversal outcome unknown**, no automatic
DELETE retry, and a fresh search showing current server status. Never expect **Reversal confirmed**
for that lost response. The admission proxy in [SCANNING.md](SCANNING.md) also tests manual POST
response loss. Restore port 8000 and stop the proxy afterward; never log bearer tokens or payloads.

To test confirmed mutations followed by read failure, configure the proxy to return 503 for
the attendees GETs only after a successful POST/DELETE, preserving the mutation response. The
confirmation must survive; both stale totals and stale matches must be labelled. Restore reads
and Refresh results/totals. Automated tests additionally exercise malformed responses and a
record-level DELETE 404, without modifying backend code or deleting audit records.

## Known backend release blocker from final QA

Source review found an existing race in
[`undo_check_in`](../api/app/routers/checkin.py): it loads the check-in and tests `reversed_at`
before acquiring the ticket row lock, without refreshing that check-in afterward. This behavior
also exists on the base branch; this mobile QA phase does not change backend code.

The problematic interleaving is:

1. Request A loads active check-in C1 and pauses before locking the ticket.
2. Request B reverses C1 and commits.
3. Another admission creates active check-in C2 for the same ticket and commits.
4. A resumes with its stale C1 object, locks the ticket, and sets its status to `valid`, while
   C2 remains active. Counts and QR verification can then contradict the active check-in.

A controlled source-level simulation of the existing handler reproduced that inconsistent
state. It was **not** a live PostgreSQL concurrency test. Release sign-off requires a separate
backend fix and a database-backed regression for this interleaving. Mobile single-request guards
cannot coordinate multiple devices. The mobile contract and normal reversal tests still pass;
they do not establish server correctness for this concurrent case.

## Final iPhone acceptance gate

After the setup and detailed cases above, run this complete sequence on the release candidate.
Mark a step complete only after observing it on the phone; Jest camera events are simulated.

- Sign out, try invalid credentials, then sign in with verified assigned staff. Check loading,
  safe errors, password clearing after failure, and successful retry. Reopen the app to check
  restoration; use SETUP.md's expiry/revocation procedure to check renewed and ended sessions.
- Compare the list to `GET /v1/checkin/events?assignedOnly=true`. Select A, compare totals to
  the attendees endpoint, switch to B, and confirm A's counts and operational state disappear.
  Check an organizer-only account is denied and an assigned organizer sees only assigned events.
- Deny/recover camera permission, scan a valid ticket, and confirm verification alone does not
  admit it. Press Check in once, wait for confirmation, then Scan next. Rescan the used ticket;
  test wrong-event, campaign, invalid, cancelled, and refunded results as in SCANNING.md.
- Open Search. Check trimming, 2–100 characters, no-match/error states, and repeated keyboard
  submits during a delayed request. Manually admit another ticket; test a stale-row 409 via
  Swagger. Confirm the UI waits for admission instead of prematurely requesting a refresh.
- With permission false, confirm Undo is absent. With permission true, open the identifying
  dialog, cancel once, then confirm. Check counts, current status, and disappearance of the active
  ID. Test permission removed after rendering and an already-reversed record using the steps above.
- Check scanner → search after admission and search → scanner after reversal. Then test stopped
  API, failed refresh, and dropped mutation response through the documented proxy: preserve
  confirmed results, mark stale reads, and never invent a success for a lost response.
- Start a delayed search, sign out, sign in as a different assigned staff account, select its
  event, then let the old response finish. No old query, person, active ID, or event may appear;
  an old session's late 401 must not sign out the new account. Also test assignment removal and
  background/foreground revalidation. Logout must leave no protected back navigation.
- Enable VoiceOver and Larger Text. Check long names, status announcements, all touch targets,
  keyboard Search, totals, scrolling, and the reversal dialog's Cancel/Confirm controls. On a
  notched iPhone, scroll a tall dialog to both ends and check the notch/home indicator do not
  cover controls. Record the device, OS/Expo Go versions, date, and any failures for handoff.

## Validation

Run from `apps/mobile`: `npm run typecheck`, `npm test`, `npx expo-doctor`, and
`npx expo install --check`. There are no configured lint/format scripts; use `git diff --check`.
Native bundle smoke check (placeholder API URL; does not load the local `.env`):

```sh
EXPO_NO_DOTENV=1 EXPO_PUBLIC_API_URL=https://api.example.test/v1 npx expo export --platform android --platform ios --max-workers 1 --output-dir /tmp/ticketflow-mobile-phase4-export
```

API, state-machine, and rendered workflow tests cover contract validation, request races,
server refusal, permission changes, uncertainty, reconciliation, tool/event switching, and
protected-state cleanup. Native camera events are controlled in Jest; device accessibility,
layout, and real camera behavior still require the manual iPhone procedure above.
