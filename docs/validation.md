# Validation — 29 October 2026

## Integration and scope

The review branch starts from `696e87b` on main, including the merged staff app, database
migrations, and check-in concurrency fix. The staff app's runtime/screens/tests are retained.
Its packages received compatible patch updates; Node 24 and Expo SDK 57 remain required.
The web replaces hard-coded event/order screens with API-backed workflows. Duplicate browser
scanner screens and unused Tailwind configuration were removed. There is one web app and one
native staff app, using the existing backend and database.

Retained bonuses: seating, calendar export, and support attachments. The staff app is online-only,
as required by the MVP. Existing offline backend endpoints remain available for future clients.
Real payments/payouts, GA4, arbitrary venue editors, and app-store publication are excluded.

## Specification coverage

| SRS area | Implementation / verification |
| --- | --- |
| 4.1 Accounts and roles | Registration, verification, login/logout/reset, profiles; API and client tests |
| 4.2–4.3 Events and tickets | Event lifecycle, visibility, capacity, sales windows, limits, preview; web + API |
| 4.4–4.6 Free/paid checkout | Atomic holds, activation checklist, server totals/promos, simulated payments and retries |
| 4.7 Tickets | Canonical QR, account downloads, email PDFs; PDF layout inspected |
| 4.8 Staff app | Assigned events, camera/search, explicit admission, duplicate rejection, authorized undo; 316 Jest tests |
| 4.9–4.10 Refunds/notifications | Cancellation/refund invalidation, audit entries, Mailpit and authenticated TLS SMTP tests |
| 4.11 Calendar | Existing .ics / Google / Outlook links exposed in event and order screens |
| 4.12 Administration | Search, moderation, activation, payments, settings, reports; server authorization retained |
| 4.13 Support | Contextual cases, polling replies, status/assignment, escalation, attachments |
| 4.14 Campaigns | Server-created codes/QR, validated discounts, redemption reports, scanner rejection |
| 4.15–4.16 Analytics/history | Server-derived tables, filters, retained activity and past events, safe duplication |
| 7–8 Deployment/data | Docker builds, HTTPS configuration, backups, existing-data migration regressions |

## Passed locally

- Backend: **193 pytest tests**, including migrations, old-schema compatibility, concurrency,
  contract validation, SMTP, and first administrator setup.
- Web: **11 tests**, TypeScript, production build, and generated contract types.
- Staff app: **316 tests**, TypeScript, Expo dependency compatibility, Android/iOS bundles.
- Existing database upgraded without reset; all eight pre-existing events were retained.
- Earlier backup recovery was verified in a separate temporary database.
- Local HTTP smoke test covers checkout/retry, PDFs, campaign rejection, check-in/undo, backend
  offline sync, support, analytics, refunds, moderation, reports, and duplication.

The smoke script creates clearly named retained test records in the disposable demo database.
GitHub Actions runs the automated checks on pushes and pull requests.

## Release gates and dependency notes

Use the [browser checklist](HOW-TO-CHECK.md) and [phone checklist](../apps/mobile/README.md).
Physical iPhone/Android camera, paper scanning, secure storage, installation, and Wi-Fi checks
remain device acceptance steps. Native JavaScript export does not verify them. Real DNS,
HTTPS certificates, external SMTP, and encrypted hosting storage need server acceptance.

Web dependency audit is clean. Compatible mobile dependency fixes were applied. Expo/Jest
still inherit low-severity `deepmerge` reports; Expo CLI inherits a high-severity `zod` report
and its parent-package reports. These are development-tool dependencies. No incompatible
Zod/Expo major-version override or forced SDK downgrade was applied to hide the advisories.
Track the [Zod advisory](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) before production release.
