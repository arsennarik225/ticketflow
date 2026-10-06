# Event Admin mobile: authentication foundation

Phase 1 provides sign-in, secure session restoration/rotation, a backend-driven Event Admin
access gate, and logout. Event selection and ticket operations are not implemented yet.
The existing README describes the eventual scanner; its offline instructions do not apply here.

## Local setup (Ubuntu + iPhone)

Use Node 24 LTS (`.nvmrc`), then from `apps/mobile`:

```sh
npm ci
cp .env.example .env
```

Set `EXPO_PUBLIC_API_URL` in `.env` to your reachable backend URL **including `/v1`**.
For local Wi-Fi development, use the Ubuntu computer's LAN address, for example
`http://192.168.1.20:8000/v1`. The phone cannot use your computer's `localhost`.
The backend must already be running and reachable on port 8000. A release build requires HTTPS.
The public URL is configuration, not a secret; never place passwords or tokens in environment variables.

Install an Expo Go version supporting SDK 57 on your iPhone. Keep both devices on the same
network, grant Expo Go local-network access, and sign in to the same Expo account on the
computer and Expo Go if prompted:

```sh
npx expo login
npm start
```

Scan the terminal QR using the iPhone Camera app and open it in Expo Go. This QR opens the
development application; admission-ticket scanning is not part of this phase.
After changing `.env`, reload the application fully. If needed, restart with `npm start -- --clear`.
Allow local connections to Metro (usually port 8081) and the backend in your firewall.
An Expo tunnel changes access to Metro only; the configured API must still be reachable by the phone.

## Manual checks

1. Start without a saved session: the sign-in form should appear. Test an incorrect password.
2. Sign in with an existing verified account assigned as Event Admin: the session-active screen
   should show the real account email. An attendee/organizer/platform-admin-only account should
   see Access Denied. Accounts and assignments are managed outside this app.
3. Close and reopen Expo Go: restoration must check `/me` online before showing access.
4. Wait past the backend access-token lifetime (currently 15 minutes), then return to the app:
   it should refresh the session and remain signed in.
5. Revoke the assignment through the existing backend workflow, then return to the app or use
   Check access again: the account should lose Event Admin access.
6. Turn off connectivity during restoration: the app must show a retry screen, never grant
   offline access. Reconnect and retry.
7. Sign out and reopen the app: the sign-in screen should appear, with no protected back stack.
   If the server cannot be reached, local credentials are still removed and a notice explains
   that server revocation could not be confirmed.

Only Android/iOS are supported. Tokens use Expo SecureStore; they are never stored in
AsyncStorage. On iOS, Keychain entries may survive reinstalling the same application, so use
Sign out when testing a different account. Changing the API URL discards the previous stored session.

## Validation

```sh
npm run typecheck
npm test
npm run doctor
npm run check:dependencies
```

Tests use controlled fetch/native-storage substitutes only in test files. Production requests
always go to the configured backend. There is no offline mode, fake event data, or demo login.

The test renderers are pinned to match Expo's React 19.2.3: `react-test-renderer` 19.2.3
for Jest Expo and `test-renderer` 1.2.0 for React Native Testing Library. The latter's newer
1.3.0 release pulls a reconciler requiring React 19.3, so do not update it independently.
At implementation validation, npm audit reported 58 transitive dependency advisories
(12 moderate, 46 high). Its suggested fixes change major Expo/React Native/Jest versions;
no forced audit upgrade was applied. Reassess these with compatible upstream updates.

## Small architecture

- `api/client.ts`: JSON requests, timeout, bearer headers, 204, safe errors and unknown error bodies.
- `api/auth.ts`: existing login/refresh/logout endpoints only; `/me` is decoded in the session layer.
- `auth/AuthSession.ts`: observable session state, online profile checks, one shared refresh promise,
  at most one authenticated retry, and generation checks to discard results from a signed-out session.
- `auth/sessionStorage.ts`: one protected token-pair entry, scoped to the API URL. Native storage
  operations are serialized so logout cannot be overtaken by an earlier save.
- `auth/AuthProvider.tsx`: React binding and profile revalidation when the app becomes active.
- `navigation/RootNavigator.tsx`: conditional screens with no retained protected back stack.

`/me` must report both verified email and the backend-issued `event_admin` role. Organizer and
Platform Admin roles alone grant no mobile access. Server endpoint authorization remains authoritative.
No biometric authentication is required, so secure storage works in Expo Go.
