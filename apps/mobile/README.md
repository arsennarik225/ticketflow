# BiletFlow Staff mobile

The implemented Event Admin MVP uses React Native, Expo, and TypeScript for Android/iOS.
It supports verified staff sign-in and session restoration, assigned events, attendance totals,
QR verification with deliberate check-in, manual attendee/ticket search and admission, and
authorized check-in reversal. All operational decisions come from the server.

This app is online-only. Offline verification/synchronization, attendee and organizer mobile
features, and analytics are outside its scope. Backend support for an endpoint does not imply
that the mobile app uses it.

## Setup and acceptance

- [SETUP.md](SETUP.md): Ubuntu/iPhone/Expo Go setup, test accounts, authentication and assigned-event checks.
- [SCANNING.md](SCANNING.md): camera permissions, QR results, admission, interrupted requests, and device checks.
- [OPERATIONS.md](OPERATIONS.md): manual search, check-in/reversal, server reconciliation, and final iPhone acceptance.

Use Node 24 and the Expo versions pinned in `package-lock.json`. Configure a reachable API URL
ending in `/v1` through the ignored local `.env`; a physical phone needs the computer's LAN
address instead of its `localhost`. Local HTTP is allowed in development; release builds require
HTTPS. Public Expo environment variables must never contain secrets.

Demo accounts in SETUP.md belong only to the disposable local development database. There is no
demo-login bypass or fixture data in the running app. Tokens are stored only in Expo SecureStore;
ticket results and QR payloads stay in memory and are discarded when leaving their workflow.

## Operational boundaries

The event list always uses `GET /v1/checkin/events?assignedOnly=true`: organizer ownership alone
does not make an event selectable. Verification is a read, and **Valid ticket** alone is not
admission; wait for **Check-in confirmed** after pressing Check in. Refusals use text as well as
visual styling. Manual search accepts 2–100 trimmed characters and returns at most 50 matches.
Undo requires an active `checkInId`, server capability, explicit confirmation, and server approval.
An uncertain mutation outcome must be reconciled with a fresh server read.

## Validation

From this directory run `npm run typecheck`, `npm test`, `npx expo-doctor`, and
`npx expo install --check`; also run `git diff --check`. No lint/format scripts are configured.
OPERATIONS.md includes the Android/iOS bundle command. Automated tests and bundle exports do
not replace physical camera, VoiceOver, Larger Text, and final iPhone acceptance checks.
See its [known backend release blocker](OPERATIONS.md#known-backend-release-blocker-from-final-qa)
before production sign-off; the existing reversal handler needs a separate concurrency fix.
