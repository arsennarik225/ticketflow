# Native mobile feature parity

The additional project requirement is that mobile provide the website workflows through
separate native screens while retaining the scanner. The implementation lives in
`apps/mobile/src/platform`; `src/navigation/ScannerNavigator.tsx` preserves entrance
operations. There is no WebView. Both clients use the existing API; this change introduces
no database or OpenAPI contract changes.

## Feature map

| Area | Native mobile behavior |
| --- | --- |
| Accounts | Register, verify email, sign in/out, forgot/reset password, profile, organizer profile, notifications, Kazakh/Russian/English interface |
| Discovery | Search and city filtering, pagination, event details, public/unlisted/private campaign links, reporting |
| Purchase | Ticket quantities, attendee details, live seat availability, checkout holds, promos, server totals, free and simulated paid checkout, retries with idempotency keys |
| Tickets/orders | Order history/details, ticket QR, PDF sharing/saving, guest receipt in the current session, cancellation, refunds, contextual support |
| Calendar | ICS sharing, Google and Outlook links |
| Organizer | Event creation/editing, preview, publishing, unpublishing, cancellation, duplication, ticket types, seating and blocked seats |
| Activation | Simulated identity, payout, activation fee and terms steps; no real financial processing |
| Campaigns | Create/edit discounts, limits, windows, ticket-type restrictions, campaign links and QR downloads |
| Operations | Orders/refunds/cancellations, attendees, staff assignments and reversal permission, analytics filters/tables/progress, audit history |
| Support | Cases/filters, messages, polling, PNG/JPEG/PDF attachments up to 5 MB, download sharing, status/assignment, escalation |
| Platform admin | Users/events/orders/payments/reports, moderation, activation inspection, paid-sales suspension, CSV exports, settings |
| Entrance | Assigned events, totals, camera verification, explicit admission, duplicate rejection, manual search/admission, authorized undo and uncertain-outcome recovery |

Forms use native inputs, switches, dropdowns, and date/time pickers. Tables become labeled
cards suitable for a narrow screen. Files use the OS picker/share sheet. API authorization
still decides what each role can read or change. Menu visibility does not grant access.

## Phone acceptance walkthrough

Start the API and Expo as described in [mobile setup](../apps/mobile/README.md). On the
seeded local database, all four demo accounts below use `demo12345`. Use future published
events; duplicate old demo events and adjust their dates if necessary.

1. **Guest:** browse/search, open an event, choose tickets or seats and supply attendee
   details. Complete free checkout, then try a declined and successful simulated paid
   checkout. Confirm email delivery in Mailpit and the current-session receipt. Retry a
   temporarily interrupted confirmation and verify there is only one order.
2. **Attendee (`attendee@biletflow.kz`):** open My tickets/My orders, display QR, save/share
   PDFs and a calendar entry, request cancellation/refund where allowed, open a linked
   support case, reply and attach a document. Change profile and view notifications.
3. **Organizer (`organizer@biletflow.kz`):** create/edit/preview/publish a future event,
   add free and paid ticket types, finish simulated activation, create a campaign,
   configure seating before orders exist, and assign staff. Review orders, attendees,
   analytics, history and support. Test refunds, cancellation and duplication on test data.
4. **Admin (`admin@biletflow.kz`):** search users/events/orders, review payments/reports,
   inspect activation, suspend/restore a test account or event, suspend paid sales, export
   CSV, and change/restore a setting. Verify the changed rule applies in both clients.
5. **Staff (`staff@biletflow.kz`):** open **Menu → Check in** and run the
   [scanner](../apps/mobile/SCANNING.md) and [search/undo](../apps/mobile/OPERATIONS.md)
   checklists. Organizer/admin roles alone must not show this menu item. After removing
   the last staff assignment, foreground validation must revoke scanner access.
6. **Links:** use **Menu → Open event link** to paste an event/campaign URL, including a
   private event's invitation. In Expo Go, open Verify email or Reset password from the
   sign-in screen and paste the email link/token. Installed builds also support
   `biletflow://events/<id>?campaign=<token>`, `biletflow://verify-email?token=...`, and
   `biletflow://reset-password?token=...`. HTTPS universal links are not configured.
7. **Device behavior:** return from the document picker/share sheet or background the
   app during a partially completed form; successful account revalidation should preserve
   the draft. Sign out and sign in as a different account; the previous user's screens
   and transient checkout data must disappear. Check large text, VoiceOver/TalkBack,
   keyboard scrolling, and Kazakh/Russian/English on physical iPhone and Android.

The app remains online-only. It uses the same simulated payment labels and integer-tiyin
amounts as the website. Guest receipts and retry keys are held only for the current app
session; email remains the durable delivery channel for guests. Sharing a file can save
a copy to a destination chosen by the user; the app deletes its temporary download after
the share sheet finishes.

## Automated verification and limits

Run `npm test`, `npm run typecheck`, `npm run check:dependencies`, and `npm run export` in
`apps/mobile`. The tests cover native role navigation, guest checkout, ticket pricing,
organizer editing, support defaults/uploads, admin settings, file sharing, session
refresh/account changes, deep links, and the existing scanner/search/undo regressions.

Automated tests use controlled API responses; the API suite separately verifies business
rules. Android/iOS export checks bundle compilation, not installation, camera hardware,
OS file sharing, visual layout or real-device API connectivity. Complete the walkthrough
above on both devices before release. Builds and checks do not publish the app or push Git.
