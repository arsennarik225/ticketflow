# How to test BiletFlow

## Start and automated checks

```bash
docker compose up -d --build
docker compose exec api pytest -q
cd apps/web
npm ci
npm test
npm run build
cd ../mobile
# Use Node 24 for the staff app.
npm ci
npm run typecheck
npm test
npm run check:dependencies
npm run export
```

Backend tests recreate **biletflow_test**, never the demo database. Do not point
TEST_DATABASE_URL at data you need. Generated API types are refreshed from `apps/web`
with `npm run api:types`. GitHub Actions runs the same checks.

Run `python3 scripts/smoke.py` from the repository root for the full HTTP walkthrough
against the running local demo. It creates clearly named test events and retained simulated
orders; do not use it on a deployment holding real user data.

## Browser walkthrough

Open http://localhost:3000 and http://localhost:8025 (test emails).
Demo password: `demo12345`. Use separate browser profiles/windows to keep roles separate.

1. **Organizer** (`organizer@biletflow.kz`): create a future event, add a free ticket type,
   preview, and publish. Edit venue/time and confirm the update notification.
2. Add a paid ticket type. In **Activation**, complete the simulated verification, payout,
   fee, and terms steps (default terms version `2026-09`). Paid sales should then work.
3. In **Campaigns**, create a discount with a redemption limit. Download its distinctly
   labelled Campaign QR, open its event link, and check that the promo is pre-applied.
4. **Attendee** (`attendee@biletflow.kz`): buy a ticket. First choose a declined simulated
   result: no ticket is issued. Retry successfully and verify discount/total/order.
   Free checkout should show no payment selector. Check guest delivery separately.
5. Download the PDF from **My orders**; print at 100% scale. Check name, event, date,
   venue, ticket number, and readable QR. Add the event through a calendar link.
6. Open **Support** from the order or ticket. Reply as organizer, change status, assign
   using the organizer/staff user ID, attach a PNG/PDF, and escalate to platform support.
7. As organizer, assign `staff@biletflow.kz` under **Staff**, including **Allow undo**.
   Follow the [phone test guide](../apps/mobile/README.md); scan the printed PDF and
   test duplicate entry, manual search, undo, and Campaign QR rejection.
8. Review **Analytics**, date/ticket-type filters, attendees, orders, and history. Refund
   a paid order and cancel a free registration; neither ticket should admit afterward.
9. Duplicate a completed/cancelled event: configuration is copied, transactions are not.
10. **Admin** (`admin@biletflow.kz`): search users/events/orders, inspect activation, review
    reports/payments, suspend paid sales or an event, export CSV, and change settings.
    Confirm sales stop and other users cannot open organizer/admin resources.
11. Switch Kazakh/Russian/English and repeat the attendee flow at phone width. Names,
    keyboard focus, status labels, and seat buttons must remain readable.

Optional seating: configure the predefined venue **before orders exist**, select blocked
seats, and create one priced ticket type for each seat category. Open the public map in
two sessions: held/sold seats should update, and a conflicting checkout must fail.

## Old demo data and debugging

An existing database may contain only completed demo events. Preserve it: duplicate an
old event, update the dates, publish, and assign staff again. To deliberately start over
with disposable local data only, `docker compose down -v` deletes the database.

Check browser Network requests and `docker compose logs -f api`. API errors have a stable
code documented in `docs/api/error-codes.md`. Reproduce with http://localhost:8000/docs.
Use [deployment instructions](deployment.md) for an HTTPS server; keep the physical-device
checklist as a release gate even when all automated checks pass.
