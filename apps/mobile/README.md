# BiletFlow Staff

The existing React Native / Expo SDK 57 app is retained. It supports verified staff sign-in,
assigned events, attendance totals, camera verification, deliberate admission, manual search,
and authorized undo. The MVP is **online-only**; backend offline endpoints are reserved for
future clients. Tokens use SecureStore; ticket results stay in memory.

## Run on a phone

1. Start the backend from the repository root: `docker compose up -d --build`.
2. Put the computer and phone on the same Wi-Fi. Find the computer's LAN IP, for example
   `192.168.1.20`. Open `http://192.168.1.20:8000/health` on the phone; expect `{"status":"ok"}`.
3. Use **Node 24**. In `apps/mobile`:

   ```bash
   cp .env.example .env
   # Set EXPO_PUBLIC_API_URL=http://192.168.1.20:8000/v1 in .env
   npm ci
   npm start
   ```

4. Open the terminal's project QR in an **Expo Go build matching SDK 57**. A version
   mismatch requires a matching Expo Go/development build; see [SETUP.md](SETUP.md).
5. Sign in as `staff@biletflow.kz` / `demo12345`, select an assigned event, allow camera
   access, scan a ticket PDF on another screen or on paper, and press **Check in**.

A real phone cannot use the computer's `localhost`. An Expo tunnel does not tunnel the API.
For new staff, register and verify in the web app, then assign that exact email under the
organizer's **Staff** tab. If demo dates are old, duplicate an event, update dates, publish,
and assign staff again. To test campaign/email links on the phone, also set root WEB_URL
and API_URL to LAN URLs and recreate the API with `docker compose up -d api`.

## Acceptance checklist

- Valid verification shows the attendee and seat; it does not admit anyone by itself.
- Check in once; rescan the same digital/paper ticket and expect **already used**.
- Reject campaign, forged, wrong-event, refunded, and cancelled tickets.
- Search by name/email/ticket number; manually admit a valid attendee.
- Undo a recent admission; test staff with and without reversal permission.
- Deny camera permission and use search; enable permission again in phone settings.
- Disconnect during admission or undo; verify the result against the server before retrying.
- Sign out/reopen, remove an assignment, and test session/access recovery.
- Repeat on physical iPhone and Android, including paper scanning and large text.

Detailed cases: [camera/scanning](SCANNING.md), [search/undo/reconciliation](OPERATIONS.md).
Watch API requests with `docker compose logs -f api`; reproduce calls at `/docs`.

## Automated checks and installable builds

```bash
npm run typecheck
npm test
npm run check:dependencies
npm run export
```

Export compiles native JavaScript; it does not produce an APK/IPA or verify a physical camera.
For an internal Android APK, configure an Expo account and a reachable HTTPS API in `.env`:

```bash
npx eas-cli login
npx eas-cli build:configure
npx eas-cli build --platform android --profile preview
```

For iPhone use `--platform ios --profile preview`; Apple Developer access and registered
physical devices are required. Store publication is outside the MVP. Build-time public
variables contain only the API address, never secrets. Production builds require HTTPS.
