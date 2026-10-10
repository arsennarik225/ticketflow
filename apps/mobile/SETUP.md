# Event Admin mobile: assigned events and entrance operations

Phase 4 adds manual attendee/ticket search, manual admission, and authorized check-in reversal
to the Phase 1–3 authentication, assigned-events/dashboard, and QR scanner workflow. The app remains online-only.
Organizer analytics and offline support are not implemented.
See [OPERATIONS.md](OPERATIONS.md) for the Phase 4 architecture and device acceptance procedure.
See [SCANNING.md](SCANNING.md) for the Phase 3 device procedure and operational behavior.
The existing README includes future offline functionality; those instructions do not apply here.

## Local setup (Ubuntu + iPhone / Expo Go)

1. Start the existing development backend from the repository root, if it is not already running:

   ```sh
   docker compose up --build
   ```

   Wait for API startup and open `http://localhost:8000/docs` on Ubuntu. Compose seeds demo
   accounts only when the database has no users; it does not reset an existing database.
   For a backend without Docker, follow [the API setup](../api/README.md) and bind Uvicorn
   to `0.0.0.0` so the phone can reach it.

2. Use Node 24 LTS (`.nvmrc`) and open another terminal:

   ```sh
   cd ~/Desktop/ticketflow/apps/mobile
   node --version
   ```

   Run `npm ci` only if dependencies are not installed. If `.env` does not exist, copy
   `.env.example` to `.env`; preserve an existing local configuration.
   Set `EXPO_PUBLIC_API_URL` to your reachable backend URL **including `/v1`**, for example
   `http://192.168.1.20:8000/v1`, replacing that sample address with Ubuntu's Wi-Fi/LAN IPv4
   address from Settings → Network or `hostname -I`. The phone cannot use Ubuntu's `localhost`.
   Use the actual published API port if it differs from 8000. Release builds require HTTPS.
   The public URL is configuration, not a secret; never put passwords or tokens in environment variables.

3. Connect Ubuntu and the iPhone to the same network. In iPhone Safari, open
   `http://<UBUNTU-LAN-IP>:8000/health`; it must respond before testing the app.
   Permit local access to the API port and Metro (usually 8081) in Ubuntu's firewall.
   Enable Expo Go under iPhone Settings → Privacy & Security → Local Network.

4. Install/update Expo Go for SDK 57 on the iPhone using [Expo's download selector](https://expo.dev/go).
   Expo's [September 3, 2026 announcement](https://expo.dev/changelog/expo-go-57-login)
   confirms SDK 57 support in the App Store and requires the **same Expo account** in Expo CLI
   and Expo Go on a physical iPhone. This is separate from the BiletFlow staff account.
   Sign into Expo Go using its account icon, then on Ubuntu run:

   ```sh
   npx expo login
   npm start -- --go --lan
   ```

5. Scan the terminal QR with the iPhone Camera and open the link in Expo Go. This QR launches
   the development application. Ubuntu does not run the Xcode iOS simulator; use the physical
   iPhone. After editing `.env`, fully reload; if needed, stop Metro and run
   `npm start -- --go --lan --clear`. A Metro tunnel does not make the configured API reachable.
   If Expo Go reports an incompatible SDK, check its supported SDK against `package.json`
   before changing dependencies.

## Prepare test accounts and events

Use a disposable local development database for these manual data changes. The seeded verified
staff account is `staff@biletflow.kz`, password `demo12345`. The same documented demo password
applies to `organizer@biletflow.kz`, `attendee@biletflow.kz`, and `admin@biletflow.kz`.
These are repository demo credentials, not a production login.

On Ubuntu, use `http://localhost:8000/docs` to call `POST /v1/auth/login` as the organizer, copy
the returned access token into **Authorize**, and use `GET /v1/organizer/events` to obtain real
event IDs. For each event, `GET /v1/organizer/events/{eventId}/staff` returns assignment IDs.
Existing assignments are managed with:

- `POST /v1/organizer/events/{eventId}/staff`, body
  `{"email":"staff@biletflow.kz","canReverseCheckIn":false}`.
- `DELETE /v1/organizer/events/{eventId}/staff/{assignmentId}` to remove that assignment.

Keep at least two currently available events assigned for switching tests. The backend list
returns only published events ending less than one day ago or in the future; old seeded events
can therefore disappear naturally. The staff role requires a matching assignment but does not
require the assigned event to be currently available. An assignment to a draft or old event
can retain the role while the assigned-events list is empty.

For zero totals and a long title, create a fresh event with
`POST /v1/organizer/events` using the fields below and future, timezone-aware dates:

```json
{
  "title": "Phase 2 entrance operations rehearsal with a deliberately long event name for small-screen testing",
  "venueName": "Main entrance rehearsal venue",
  "city": "Almaty",
  "startsAt": "2027-01-15T18:00:00+05:00",
  "endsAt": "2027-01-15T21:00:00+05:00",
  "timeZone": "Asia/Almaty",
  "visibility": "public"
}
```

Replace these dates when they are no longer in the future. Add a free ticket type with
`POST /v1/organizer/events/{eventId}/ticket-types`, body
`{"name":"Rehearsal entry","price":{"amount":0,"currency":"KZT"},"quantity":10}`; then call
`POST /v1/organizer/events/{eventId}/publish` and assign the staff email. Leave it without orders
so its server totals are both zero. Creating these fixtures uses existing backend operations;
the mobile app contains no test-data switch.

## Manual Phase 2 checks

1. **Authentication and list:** Sign out of any restored session, try an incorrect password,
   then sign in as staff. Observe loading followed by the assigned-events list and account email.
   Compare the rows with `GET /v1/checkin/events?assignedOnly=true` authorized as staff in Swagger.
   Check title, time, venue/location, and status. Pull to refresh and use the refresh button;
   existing rows should remain visible during a refresh.
2. **Dashboard:** Select a row. Verify its identity and loading state, then compare Registered
   and Checked in with `GET /v1/checkin/events/{eventId}/attendees` as staff, leaving `q` unset.
   Refresh totals; the event must remain selected and previous totals must not vanish while
   refresh is pending. The percentage is derived from those counts. The zero-order rehearsal
   event must show zero counts and 0%, never `NaN` or infinity. Scan and Search open from this
   dashboard; Undo appears only in search for an active check-in with server permission.
3. **Switching and delayed responses:** Return to the list and select another event with
   different totals. Its loading screen must never show the previous event's counts. For a
   slow-response check, run `docker compose pause api` from the repository root, select event A,
   go back, and select B. Run `docker compose unpause api` within the 15-second request timeout.
   Late A results must not replace B's identity or totals. If the timeout is reached, retry B.
4. **Empty list:** Retain an assignment to a draft or old event, and remove the staff account's
   assignments to currently available events. Refresh the list: it should say no assigned events
   are currently available. Restore the assignments and refresh; rows should return. Removing
   every assignment also removes the backend staff role, which is the separate access-gate case below.
5. **Assignment removed while viewing:** Keep a second assignment so the account remains Event
   Admin. With A's dashboard open on the phone, remove its assignment in Swagger on Ubuntu.
   Refresh totals, or leave the dashboard active for the next 30-second assignment check and
   allow the request to finish. The app must return to the list with a clear access-loss notice.
   A must disappear. Restore its assignment and refresh to select it again. Repeat by unpublishing
   the zero-order rehearsal event: it becomes ineligible for the list even though its assignment
   remains. The dashboard must again close on revalidation.
6. **Role loss and organizer ownership:** Remove all staff assignments, including draft/old ones,
   then background and foreground the app: `/me` revalidation must show Access Denied. Sign in
   as the organizer, attendee, and platform-admin-only demo accounts; each must also be denied
   without an explicit Event Admin assignment. To check ownership with the role present, assign
   the organizer's own verified email to one event and sign in as that organizer: only the explicitly
   assigned event belongs in the mobile list, not all owned events. Remove the temporary assignment.
7. **Network/server failure and retry:** Stop only the API with `docker compose stop api` while
   Metro stays running. Refresh an already loaded list/dashboard and wait for the error: retained
   values must be identified as possibly out of date. Open another event to check its initial
   loading/error state without inherited counts. Restart with `docker compose start api` and retry.
   Restore the app while the API is unavailable to check the Phase 1 session-retry screen; it must
   not grant offline access. Reconnect and retry. Assignment status cannot be confirmed offline.
8. **Session lifetime and logout:** Background the phone for more than the backend's access-token
   lifetime (default 15 minutes), then return; refresh-token rotation should retain access and
   reopen the list with no saved event selection. To end the session immediately, use the existing
   password-forgot/reset endpoints for the test staff account, obtain the reset link/token from
   local Mailpit (`http://localhost:8025`), and set its test password. This revokes its existing
   sessions. A refresh or foreground restore must lead to sign-in, with no dashboard to go back to.
   Sign in with the new password, select an event, sign out, and reopen: no selected event survives.
   Also sign out while the API is stopped; local credentials should clear with a server-revocation notice.
9. **Accessibility and layout:** On the smallest available screen, enable Larger Text and VoiceOver
   in iPhone Accessibility settings. Check the long title wraps, controls remain reachable by
   scrolling, rows announce their identity and button role, and totals/progress have meaningful
   labels. Check loading, error, retry, back, refresh, and sign-out controls by touch and VoiceOver.

For deterministic HTTP 404, 500, and malformed-success-response checks, use a local HTTP debugging
proxy with a response override on the exact list or selected-event attendees request. A totals
403/404 must close the dashboard; 500 or malformed JSON/fields must give a safe retryable error,
with earlier values marked out of date when present. Do not add mobile mocks or change backend
behavior for these checks. There is no organizer API operation to delete a published event and
produce a real 404 in this fixture flow; automated tests cover those injected response cases.
The procedure above is a manual checklist, not a claim that a physical iPhone was tested here.

Only Android/iOS are supported. Tokens use Expo SecureStore; they are never stored in
AsyncStorage. On iOS, Keychain entries may survive reinstalling the same application, so use
Sign out when testing a different account. Changing the API URL discards the previous stored session.

## Validation

```sh
npm run typecheck
npm test
npx expo-doctor
npx expo install --check
```

There are no configured lint or format scripts. An optional Metro bundle check is
`npx expo export --platform android --platform ios --output-dir /tmp/ticketflow-mobile-phase2-export`;
bundle export does not replace native-device testing.

Tests use controlled fetch/native-storage substitutes only in test files. Production requests
always go to the configured backend. There is no offline mode, fake event data, or demo login.

The test renderers are pinned to match Expo's React 19.2.3: `react-test-renderer` 19.2.3
for Jest Expo and `test-renderer` 1.2.0 for React Native Testing Library. The latter's newer
1.3.0 release pulls a reconciler requiring React 19.3, so do not update it independently.
At Phase 1 validation, npm audit reported 58 transitive dependency advisories
(12 moderate, 46 high). Its suggested fixes change major Expo/React Native/Jest versions;
no forced audit upgrade was applied. Reassess these with compatible upstream updates.

## Small architecture

- `api/client.ts`: JSON requests, timeout, bearer headers, 204, safe errors and unknown error bodies.
- `api/auth.ts`: existing login/refresh/logout endpoints only; `/me` is decoded in the session layer.
- `auth/AuthSession.ts`: observable session state, online profile checks, one shared refresh promise,
  at most one authenticated retry, and generation checks to discard results from a signed-out session.
- `auth/sessionStorage.ts`: one protected token-pair entry, scoped to the API URL. Native storage
  operations are serialized so logout cannot be overtaken by an earlier save.
- `auth/AuthProvider.tsx`: React binding and profile revalidation after returning from the background.
- `navigation/RootNavigator.tsx`: conditional screens with no retained protected back stack.
- `api/checkin.ts`: typed, runtime-validated assigned-event and attendance reads.
- `features/events/EventWorkflow.tsx`: selection, assignment revalidation, access-loss handling,
  and Android hardware-back behavior.
- `features/events/useRemoteResource.ts`: independent asynchronous resource state and refresh.
- `features/events/EventDetails.tsx`: shared event identity and dates in the event's time zone.
- `screens/AssignedEventsScreen.tsx` and `screens/EventDashboardScreen.tsx`: the Phase 2 views.
- `api/ticketCheckin.ts`: typed verification/admission requests and endpoint-specific 409 decoding.
- `features/scanning/TicketScanSession.ts`: ephemeral scan lifecycle, synchronous request guards,
  stale-response protection, and uncertain-outcome reconciliation.
- `features/scanning/QrCamera.tsx`: native camera permission, initialization, QR-only capture, and cleanup.
- `features/scanning/TicketScanner.tsx`: operational results and deliberate admission/re-verification actions.

The Phase 2 typed API wrapper uses `AuthSession.request`, retaining Phase 1 bearer
headers, its shared rotating-refresh promise, and one authenticated retry. Every event-list request
uses `/checkin/events?assignedOnly=true`; callers cannot opt into ownership-based results.
Totals requests use `/checkin/events/{eventId}/attendees` with no `q`, using the authoritative
server ID. The app validates response fields before they enter feature state and tolerates omitted
optional fields. It never derives assignment from organizer ownership.

Event context uses API fields `id`, `title`, `startsAt`, `endsAt`, `timeZone`, `venueName`, `city`,
`status`, and optional `address`. Rows show the title, status, start, time zone, venue, and city;
the dashboard adds the end time and address when present. The list envelope's `total` is validated.

Feature-local selection switches between the list and a dashboard keyed by selected event ID.
List data and attendance totals have independent loading, refresh, data, and error state. Request
generation and unmount checks reject late responses; changing events creates fresh totals state.
The assigned list is revalidated on selection, with manual totals refresh, and every 30 seconds
while a dashboard is active. A missing selected ID or selected-event 403/404 clears selection and
returns to the list with a notice. A totals 403/404 also drops the cached list before reloading it.
Transient errors preserve earlier content with a stale-data notice;
these in-memory values do not provide offline authorization.

`registered` and `checkedIn` are server totals. Progress is derived for display, with 0% for zero
registered. Optional `canReverseCheckIn` is retained with that event's attendance state for a later
phase; it creates no Undo UI and is never an authorization boundary. Background-to-foreground session restoration
temporarily unmounts protected screens, so successful restoration returns to the list. Sign-out,
session expiry, and account changes also discard selection and totals.
Transient inactivity from a native permission dialog pauses capture without restoring the entire
session. An interrupted verification must be repeated; an interrupted admission has an uncertain
outcome. A full background transition still revalidates `/me` and returns to the event list.

`/me` must report both verified email and the backend-issued `event_admin` role. Organizer and
Platform Admin roles alone grant no mobile access. Server endpoint authorization remains authoritative.
No biometric authentication is required, so secure storage works in Expo Go.
