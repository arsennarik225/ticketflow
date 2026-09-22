# Error codes

Every error is `{"error": {"code": "...", "message": "..."}}`. Show your own translated text
for each `code` (Kazakh, Russian, English); `message` is only an English fallback. The one
exception is a refused check-in, which answers 409 with a `VerifyResult` (see the bottom).

| Code | Status | When |
| --- | --- | --- |
| **General** | | |
| `validation_error` | 422 | A field is missing or malformed; `message` names the field |
| `not_found` | 404 | The thing does not exist, or you may not know it exists |
| `method_not_allowed`, `bad_request` | 405, 400 | Wrong HTTP method or request |
| **Sign-in and accounts** | | |
| `not_authenticated` | 401 | No access token sent |
| `invalid_token` | 401 | Access token invalid or expired: call `/auth/refresh` |
| `session_ended` | 401 | Signed out, password reset, or suspended: sign in again |
| `invalid_refresh_token` | 401 | Refresh token used or expired: sign in again |
| `invalid_credentials` | 401 | Wrong email or password |
| `account_suspended` | 403 | Suspended by a Platform Admin |
| `email_taken` | 409 | Email already registered |
| `token_invalid`, `token_expired` | 410 | Email link already used or too old |
| `organizer_profile_required` | 403 | Create an organizer profile first |
| `platform_admin_only` | 403 | Admin endpoint |
| `not_event_organizer` | 403 | Someone else's event |
| **Events** | | |
| `invalid_time_zone`, `invalid_dates` | 422 | Bad IANA zone, or an end before a start |
| `email_not_verified` | 409 | Verify the email before publishing |
| `no_ticket_types` | 409 | Publishing without a ticket type |
| `event_has_orders` | 409 | Unpublish or change seating after tickets were issued |
| `capacity_below_sold`, `quantity_below_sold` | 409 | Lower than what is already sold or held |
| `no_paid_ticket_type`, `activation_fee_already_paid` | 409 | Activation fee not applicable / already paid |
| `terms_version_mismatch` | 422 | Accept the current terms version |
| **Buying** | | |
| `event_not_published`, `event_cancelled`, `event_ended`, `event_suspended` | 409 | The event cannot sell |
| `registration_not_open`, `registration_closed` | 409 | Outside the registration window |
| `sales_not_started`, `sales_ended`, `ticket_type_unavailable` | 409 | That ticket type is not on sale |
| `paid_sales_not_active` | 409 | Paid tickets not activated, or suspended by an admin |
| `sold_out` | 409 | Not enough tickets left (`message` says how many) |
| `sign_in_required` | 401 | Guest checkout is turned off |
| `unknown_ticket_type`, `max_per_order_exceeded` | 422 | Wrong ticket type or too many per order |
| `attendees_required`, `attendee_count_mismatch` | 422 | Guests must send one attendee per ticket |
| `promo_code_invalid`, `promo_code_expired`, `promo_code_not_started` | 422 | Promo code or campaign link not usable |
| `promo_code_disabled`, `promo_code_exhausted`, `promo_code_not_applicable` | 422 | Stopped, used up, or not for these tickets |
| `payment_method_required` | 422 | Paid order without a payment token |
| `payment_declined`, `insufficient_funds` | 402 | Simulated payment failed; the hold remains, try again |
| `checkout_expired`, `checkout_abandoned` | 410 | Hold is over; start a new checkout |
| `checkout_already_confirmed` | 409 | Confirmed with a different Idempotency-Key |
| **Assigned seating** | | |
| `seat_selection_required` | 422 | Seated event: send `seatIds` |
| `not_a_seated_event` | 422 | General admission: send `items` |
| `unknown_seat`, `duplicate_seat` | 422 | Seat not in this map, or chosen twice |
| `seat_taken` | 409 | Someone else holds or bought it: refresh the map |
| `seat_unavailable` | 409 | Blocked, or no ticket type for its category |
| `unknown_venue`, `unknown_seat_category`, `duplicate_seat_category` | 422, 422, 409 | Seating set-up mistakes |
| `checkout_in_progress` | 409 | Seating can't change during an open checkout |
| **Orders and staff** | | |
| `order_already_refunded`, `order_not_refundable`, `order_is_free` | 409 | Refund not possible |
| `order_is_paid`, `order_not_cancellable` | 409 | Cancel only free, confirmed orders |
| `ticket_not_valid` | 409 | PDF of a cancelled or refunded ticket |
| `staff_already_assigned` | 409 | Same email assigned twice |
| `not_event_staff`, `cannot_reverse_check_in` | 403 | Scanner access or undo not allowed |
| **Support** | | |
| `not_your_case`, `support_staff_only`, `cannot_escalate` | 403 | Case access rules |
| `already_escalated` | 409 | Platform Admins already handle it |
| `context_mismatch`, `invalid_assignee` | 422 | Ticket/order/event don't match, or wrong assignee |
| `file_too_large`, `file_type_not_allowed` | 422 | Attachments: PNG, JPEG, or PDF up to 5 MB |
| **Admin** | | |
| `cannot_suspend_self`, `max_below_redemptions` | 409 | Self-suspension, or a promo limit below its use |

**Check-in refusals** (`POST /checkin/events/{id}/check-ins`, 409, body is a `VerifyResult`):
`result` is `already_used`, `cancelled`, `refunded`, `invalid`, `wrong_event`, or
`rejected_campaign_qr`, with `previousCheckIn` for `already_used`.
