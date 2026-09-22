-- BiletFlow database schema (PostgreSQL 16)
--
-- This file is the source of truth for the data model. The API applies it to an
-- empty database on first start. To change the schema: edit this file, keep
-- app/models.py in sync, then reset your local database:
--     docker compose down -v && docker compose up --build
--
-- Conventions
--   * UUID primary keys, snake_case names, TIMESTAMPTZ for every point in time.
--   * Money is BIGINT in tiyin (1 KZT = 100 tiyin). Never a float (SRS §7).
--   * Rows that make up history (orders, tickets, payments, check-ins, audit log)
--     are never deleted, only moved to another status.
--   * Section numbers such as §4.6 point to docs/BiletFlow_SRS_Initial_Draft.pdf.


-- ============================================================ Accounts (§4.1)

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE CHECK (email = lower(email)),
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    language TEXT NOT NULL DEFAULT 'ru' CHECK (language IN ('kk', 'ru', 'en')),  -- emails and PDF tickets (§7)
    email_verified BOOLEAN NOT NULL DEFAULT false,
    is_platform_admin BOOLEAN NOT NULL DEFAULT false,
    suspended_at TIMESTAMPTZ,                    -- set by a Platform Admin (§4.12)
    suspended_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One row per signed-in device. Logout or a password reset revokes it.
CREATE TABLE auth_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    refresh_token_hash TEXT NOT NULL UNIQUE,     -- sha256; the raw token is never stored
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX auth_sessions_user_idx ON auth_sessions (user_id);

-- Single-use links sent by email.
CREATE TABLE user_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    purpose TEXT NOT NULL CHECK (purpose IN ('verify_email', 'reset_password')),
    token_hash TEXT NOT NULL UNIQUE,             -- sha256; the raw token is only in the email
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Having a profile is what makes a user an organizer.
CREATE TABLE organizer_profiles (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    display_name TEXT NOT NULL,
    description TEXT,
    contact_email TEXT NOT NULL,
    contact_phone TEXT,
    -- Simulated identity check (§3.2 step 2). No identity documents are stored.
    identity_status TEXT NOT NULL DEFAULT 'not_submitted'
        CHECK (identity_status IN ('not_submitted', 'pending', 'verified', 'rejected')),
    identity_legal_name TEXT,
    identity_document_type TEXT
        CHECK (identity_document_type IN ('individual_id', 'business_registration')),
    identity_verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Simulated payout account (§3.2 step 4). Only a masked label is kept, never bank data.
CREATE TABLE payout_accounts (
    user_id UUID PRIMARY KEY REFERENCES organizer_profiles(user_id) ON DELETE CASCADE,
    account_holder_name TEXT NOT NULL,
    masked_account TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'connected', 'rejected')),
    connected_at TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ============================================================ Platform settings (§4.12)

-- Exactly one row. Platform Admins edit it through /admin/settings.
CREATE TABLE platform_settings (
    id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    activation_fee BIGINT NOT NULL CHECK (activation_fee >= 0),          -- tiyin, per event
    processing_fee_bps INT NOT NULL CHECK (processing_fee_bps BETWEEN 0 AND 10000),  -- 250 = 2.5 %
    processing_fee_paid_by TEXT NOT NULL CHECK (processing_fee_paid_by IN ('organizer', 'attendee')),
    checkout_hold_minutes INT NOT NULL CHECK (checkout_hold_minutes BETWEEN 1 AND 120),
    guest_checkout_enabled BOOLEAN NOT NULL,
    terms_version TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Defaults for the open questions in README.md; change them without a deploy.
INSERT INTO platform_settings
    (activation_fee, processing_fee_bps, processing_fee_paid_by,
     checkout_hold_minutes, guest_checkout_enabled, terms_version)
VALUES (500000, 250, 'organizer', 10, true, '2026-09');


-- ============================================================ Venue layouts (§4.3.1, bonus)

-- Predefined seating layouts; there is no layout editor (§4.3.1). One layout is inserted
-- at the end of this file. Organizers pick a layout per event and price its categories
-- with ticket types (ticket_types.seat_category).
CREATE TABLE venues (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    city TEXT NOT NULL,
    address TEXT
);

CREATE TABLE venue_sections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    venue_id UUID NOT NULL REFERENCES venues(id),
    name TEXT NOT NULL,
    position INT NOT NULL,
    UNIQUE (venue_id, name)
);

CREATE TABLE venue_rows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    section_id UUID NOT NULL REFERENCES venue_sections(id),
    label TEXT NOT NULL,                         -- A, B, C...
    position INT NOT NULL,
    UNIQUE (section_id, label)
);

CREATE TABLE seats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    row_id UUID NOT NULL REFERENCES venue_rows(id),
    number INT NOT NULL CHECK (number >= 1),
    price_category TEXT NOT NULL,                -- e.g. premium, standard, balcony
    accessible BOOLEAN NOT NULL DEFAULT false,   -- wheelchair-accessible place
    UNIQUE (row_id, number)
);


-- ============================================================ Events (§4.2, §4.5)

CREATE TABLE events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organizer_id UUID NOT NULL REFERENCES organizer_profiles(user_id),
    title TEXT NOT NULL,
    description TEXT,
    category TEXT,
    image_url TEXT,
    venue_name TEXT NOT NULL,
    address TEXT,
    city TEXT NOT NULL,
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    time_zone TEXT NOT NULL,                     -- IANA name, e.g. Asia/Almaty
    visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'unlisted', 'private')),
    registration_opens_at TIMESTAMPTZ,
    registration_closes_at TIMESTAMPTZ,
    capacity INT CHECK (capacity >= 0),          -- NULL = limited only by ticket types
    refund_policy TEXT,
    -- Stored lifecycle. The API derives upcoming / active / completed from the dates.
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'cancelled')),
    published_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    cancel_reason TEXT,
    -- Paid-sales activation (§3.2). The fee payment lives in payments.
    terms_version TEXT,
    terms_accepted_at TIMESTAMPTZ,
    paid_sales_suspended_at TIMESTAMPTZ,         -- set by a Platform Admin (§4.5)
    paid_sales_suspended_reason TEXT,
    -- Moderation (§4.12): a suspended event is hidden and cannot sell.
    suspended_at TIMESTAMPTZ,
    suspended_reason TEXT,
    -- Assigned seating (§4.3.1): set = seats are sold from this venue's layout.
    venue_id UUID REFERENCES venues(id),
    duplicated_from_id UUID REFERENCES events(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (ends_at > starts_at)
);
CREATE INDEX events_organizer_idx ON events (organizer_id);
CREATE INDEX events_listing_idx ON events (status, visibility, starts_at);

-- Seats the organizer took out of sale for one event (sound desk, camera platform...).
CREATE TABLE event_blocked_seats (
    event_id UUID NOT NULL REFERENCES events(id),
    seat_id UUID NOT NULL REFERENCES seats(id),
    PRIMARY KEY (event_id, seat_id)
);

-- Anyone signed in can flag an event for Platform Admins to review (§4.12).
CREATE TABLE event_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id),
    reporter_id UUID NOT NULL REFERENCES users(id),
    reason TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Event Admins (§1.3). Matched by email, so staff can be assigned before they sign up.
CREATE TABLE staff_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id),
    email TEXT NOT NULL CHECK (email = lower(email)),
    can_reverse_check_in BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (event_id, email)
);
CREATE INDEX staff_assignments_email_idx ON staff_assignments (email);


-- ============================================================ Tickets types and campaigns (§4.3, §4.14)

CREATE TABLE ticket_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id),
    name TEXT NOT NULL,
    description TEXT,
    price BIGINT NOT NULL CHECK (price >= 0),    -- tiyin; 0 = free ticket
    quantity INT NOT NULL CHECK (quantity >= 0),
    sales_start_at TIMESTAMPTZ,
    sales_end_at TIMESTAMPTZ,
    max_per_order INT CHECK (max_per_order >= 1),
    hidden BOOLEAN NOT NULL DEFAULT false,       -- withdrawn from sale, never deleted
    seat_category TEXT,                          -- assigned seating: the seats.price_category it sells
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ticket_types_event_idx ON ticket_types (event_id);
-- One ticket type per seat category, so every seat has exactly one price.
CREATE UNIQUE INDEX ticket_types_one_per_seat_category ON ticket_types (event_id, seat_category)
    WHERE seat_category IS NOT NULL;

-- One campaign = one promo code + one Campaign QR Code (§4.14).
CREATE TABLE campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id),
    name TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE,                   -- typed code, upper case, e.g. JAZZ-7KQ2
    token TEXT NOT NULL UNIQUE,                  -- opaque token inside the Campaign QR link
    discount_type TEXT NOT NULL CHECK (discount_type IN ('percentage', 'fixed_amount')),
    percent_off NUMERIC(5, 2) CHECK (percent_off BETWEEN 0 AND 100),
    amount_off BIGINT CHECK (amount_off > 0),    -- tiyin, off the whole order
    valid_from TIMESTAMPTZ,
    valid_until TIMESTAMPTZ,
    max_redemptions INT CHECK (max_redemptions >= 0),   -- NULL = unlimited
    disabled BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (discount_type <> 'percentage' OR percent_off IS NOT NULL),
    CHECK (discount_type <> 'fixed_amount' OR amount_off IS NOT NULL)
);
CREATE INDEX campaigns_event_idx ON campaigns (event_id);

-- Ticket types a campaign applies to. No rows = every ticket type of the event.
CREATE TABLE campaign_ticket_types (
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    ticket_type_id UUID NOT NULL REFERENCES ticket_types(id),
    PRIMARY KEY (campaign_id, ticket_type_id)
);


-- ============================================================ Checkout (§4.6)

-- A checkout in progress. While it is open and not expired, its items hold inventory
-- and its campaign holds one redemption. Nothing is issued until it is confirmed.
CREATE TABLE checkout_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id),
    user_id UUID REFERENCES users(id),           -- NULL for guest checkout
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'confirmed', 'expired', 'abandoned')),
    campaign_id UUID REFERENCES campaigns(id),
    attendees JSONB NOT NULL DEFAULT '[]',       -- [{"fullName", "email", "phone"}], one per ticket
    subtotal BIGINT NOT NULL CHECK (subtotal >= 0),
    discount BIGINT NOT NULL DEFAULT 0 CHECK (discount >= 0),
    processing_fee BIGINT NOT NULL DEFAULT 0 CHECK (processing_fee >= 0),
    processing_fee_paid_by TEXT NOT NULL CHECK (processing_fee_paid_by IN ('organizer', 'attendee')),
    total BIGINT NOT NULL CHECK (total >= 0),    -- what the buyer pays
    expires_at TIMESTAMPTZ NOT NULL,
    idempotency_key TEXT,                        -- remembered by a successful confirm
    language TEXT NOT NULL DEFAULT 'ru' CHECK (language IN ('kk', 'ru', 'en')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX checkout_sessions_open_idx ON checkout_sessions (event_id, expires_at) WHERE status = 'open';

CREATE TABLE checkout_session_items (
    session_id UUID NOT NULL REFERENCES checkout_sessions(id) ON DELETE CASCADE,
    ticket_type_id UUID NOT NULL REFERENCES ticket_types(id),
    quantity INT NOT NULL CHECK (quantity >= 1),
    unit_price BIGINT NOT NULL CHECK (unit_price >= 0),  -- price when the hold was taken
    PRIMARY KEY (session_id, ticket_type_id)
);

-- Seats held by a checkout (the Seat Hold of §6). A hold counts only while its session is
-- open and not expired, so abandoned or timed-out checkouts release seats on their own.
CREATE TABLE seat_holds (
    session_id UUID NOT NULL REFERENCES checkout_sessions(id) ON DELETE CASCADE,
    seat_id UUID NOT NULL REFERENCES seats(id),
    ticket_type_id UUID NOT NULL REFERENCES ticket_types(id),  -- the price of this seat
    position INT NOT NULL,                       -- order chosen by the buyer; attendee i sits here
    PRIMARY KEY (session_id, seat_id)
);


-- ============================================================ Orders and tickets (§4.4, §4.7, §4.9)

CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number TEXT NOT NULL UNIQUE,           -- shown to people, e.g. ORD-7K3M9QXD
    event_id UUID NOT NULL REFERENCES events(id),
    user_id UUID REFERENCES users(id),           -- NULL for guest orders
    checkout_session_id UUID NOT NULL UNIQUE REFERENCES checkout_sessions(id),
    buyer_name TEXT NOT NULL,
    buyer_email TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled', 'refunded')),
    subtotal BIGINT NOT NULL,
    discount BIGINT NOT NULL,
    processing_fee BIGINT NOT NULL,              -- the processor's charge for this order
    processing_fee_paid_by TEXT NOT NULL CHECK (processing_fee_paid_by IN ('organizer', 'attendee')),
    total BIGINT NOT NULL,                       -- what the buyer paid; 0 = free registration
    language TEXT NOT NULL DEFAULT 'ru' CHECK (language IN ('kk', 'ru', 'en')),  -- of emails and PDFs
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    cancelled_at TIMESTAMPTZ,
    cancel_reason TEXT
);
CREATE INDEX orders_event_idx ON orders (event_id, created_at);
CREATE INDEX orders_user_idx ON orders (user_id);

CREATE TABLE order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id),
    ticket_type_id UUID NOT NULL REFERENCES ticket_types(id),
    quantity INT NOT NULL CHECK (quantity >= 1),
    unit_price BIGINT NOT NULL CHECK (unit_price >= 0),
    seat_id UUID REFERENCES seats(id)            -- assigned seating: one item per seat
);
CREATE INDEX order_items_order_idx ON order_items (order_id);

-- The one ticket record. The phone screen and the printed PDF show the same row,
-- so a ticket can never become two admissions (§4.7). The QR payload is a signature
-- of the id, computed on the fly, so it is not stored.
CREATE TABLE tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_number TEXT NOT NULL UNIQUE,          -- shown and printed, e.g. TKT-7K3M-9QXD
    order_id UUID NOT NULL REFERENCES orders(id),
    event_id UUID NOT NULL REFERENCES events(id),
    ticket_type_id UUID NOT NULL REFERENCES ticket_types(id),
    attendee_name TEXT NOT NULL,                 -- the Attendee entity lives on the ticket
    attendee_email TEXT NOT NULL,
    attendee_phone TEXT,
    seat_id UUID REFERENCES seats(id),           -- assigned seating only
    status TEXT NOT NULL DEFAULT 'valid' CHECK (status IN ('valid', 'checked_in', 'cancelled', 'refunded')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX tickets_event_idx ON tickets (event_id, status);
-- A seat can be sold only once per event, even if two checkouts race (§4.3.1).
CREATE UNIQUE INDEX tickets_one_valid_per_seat ON tickets (event_id, seat_id)
    WHERE seat_id IS NOT NULL AND status IN ('valid', 'checked_in');
CREATE INDEX tickets_type_idx ON tickets (ticket_type_id, status);
CREATE INDEX tickets_order_idx ON tickets (order_id);

-- Every payment is simulated (§3.2, §4.6). The CHECK makes that impossible to forget.
CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purpose TEXT NOT NULL CHECK (purpose IN ('ticket_order', 'activation_fee')),
    status TEXT NOT NULL CHECK (status IN ('succeeded', 'failed', 'refunded')),
    amount BIGINT NOT NULL CHECK (amount >= 0),
    fee BIGINT NOT NULL DEFAULT 0 CHECK (fee >= 0),   -- kept by the processor
    simulated BOOLEAN NOT NULL DEFAULT true CHECK (simulated),
    payer_user_id UUID REFERENCES users(id),
    event_id UUID NOT NULL REFERENCES events(id),
    order_id UUID REFERENCES orders(id),              -- NULL for failed attempts and fees
    checkout_session_id UUID REFERENCES checkout_sessions(id),
    failure_code TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX payments_one_activation_fee ON payments (event_id)
    WHERE purpose = 'activation_fee' AND status = 'succeeded';
CREATE INDEX payments_order_idx ON payments (order_id);

-- Full refunds only in the MVP, so at most one per order (§4.9).
CREATE TABLE refunds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL UNIQUE REFERENCES orders(id),
    payment_id UUID NOT NULL REFERENCES payments(id),
    amount BIGINT NOT NULL CHECK (amount >= 0),
    reason TEXT NOT NULL,
    simulated BOOLEAN NOT NULL DEFAULT true CHECK (simulated),
    idempotency_key TEXT NOT NULL,
    created_by_user_id UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Exact campaign attribution: one row per order that used a promo (§4.14).
CREATE TABLE promo_redemptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id),
    order_id UUID NOT NULL UNIQUE REFERENCES orders(id),
    discount BIGINT NOT NULL CHECK (discount >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX promo_redemptions_campaign_idx ON promo_redemptions (campaign_id);


-- ============================================================ Check-in (§4.8)

CREATE TABLE check_ins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES tickets(id),
    event_id UUID NOT NULL REFERENCES events(id),
    checked_in_by_user_id UUID NOT NULL REFERENCES users(id),
    method TEXT NOT NULL CHECK (method IN ('qr', 'manual', 'offline')),
    checked_in_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    reversed_at TIMESTAMPTZ,                     -- "undo" keeps the row for history
    reversed_by_user_id UUID REFERENCES users(id)
);
-- At most one active check-in per ticket: no double entry, even with two scanners at once.
CREATE UNIQUE INDEX check_ins_one_active_per_ticket ON check_ins (ticket_id) WHERE reversed_at IS NULL;
CREATE INDEX check_ins_event_idx ON check_ins (event_id);


-- ============================================================ Support (§4.13)

CREATE TABLE support_cases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requester_id UUID NOT NULL REFERENCES users(id),
    -- 'organizer': an attendee asking the event's organizer.
    -- 'platform':  an organizer (or anyone without event context) asking Platform Admins.
    handled_by TEXT NOT NULL CHECK (handled_by IN ('organizer', 'platform')),
    category TEXT NOT NULL CHECK (category IN ('ticket_delivery', 'payment', 'refund',
        'seating', 'event_information', 'check_in', 'account', 'technical')),
    subject TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'in_progress', 'waiting_for_customer', 'resolved')),
    event_id UUID REFERENCES events(id),
    order_id UUID REFERENCES orders(id),
    ticket_id UUID REFERENCES tickets(id),
    assignee_id UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX support_cases_requester_idx ON support_cases (requester_id);
CREATE INDEX support_cases_event_idx ON support_cases (event_id);

CREATE TABLE support_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES support_cases(id),
    author_id UUID NOT NULL REFERENCES users(id),
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX support_messages_case_idx ON support_messages (case_id, created_at);

-- Files on support messages (bonus): screenshots or PDFs, at most 5 MB each. Kept in the
-- database so the MVP needs no separate file storage.
CREATE TABLE support_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES support_messages(id),
    filename TEXT NOT NULL,
    content_type TEXT NOT NULL CHECK (content_type IN ('image/png', 'image/jpeg', 'application/pdf')),
    size_bytes INT NOT NULL CHECK (size_bytes BETWEEN 1 AND 5242880),
    data BYTEA NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX support_attachments_message_idx ON support_attachments (message_id);


-- ============================================================ Notifications and audit (§4.10, §4.16)

-- Every email the platform sends. Also the in-app notification list.
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),           -- NULL when the recipient has no account
    email TEXT NOT NULL,
    kind TEXT NOT NULL,                          -- e.g. order_confirmed, event_cancelled
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx ON notifications (user_id, created_at);

-- Append-only history of important actions. The trigger below rejects edits and deletes.
CREATE TABLE audit_log (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event_id UUID REFERENCES events(id),         -- NULL for account-level actions
    actor_user_id UUID REFERENCES users(id),     -- NULL for system actions
    action TEXT NOT NULL,                        -- e.g. event.published, order.refunded
    entity_type TEXT NOT NULL,                   -- e.g. event, order, ticket
    entity_id TEXT,
    description TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_event_idx ON audit_log (event_id, created_at);

CREATE FUNCTION reject_audit_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'audit_log is append-only';
END;
$$;
CREATE TRIGGER audit_log_append_only BEFORE UPDATE OR DELETE ON audit_log
    FOR EACH ROW EXECUTE FUNCTION reject_audit_change();


-- ============================================================ Bookkeeping

-- Checksum of this file, written on first start. The API refuses to run against a
-- database built from an older version and prints how to reset it.
CREATE TABLE schema_info (
    checksum TEXT NOT NULL
);


-- ============================================================ The predefined layout

-- "BiletFlow Hall", 160 seats: Parterre rows A-H x 14 seats (rows A-C premium, D-H
-- standard, H1-H4 wheelchair accessible) and Balcony rows A-D x 12 seats.
INSERT INTO venues (id, name, city, address)
VALUES ('2f1d7c52-8f0e-4c9a-9b1e-6a3d5e7f0b11', 'BiletFlow Hall', 'Almaty', 'Abay Ave 50');

INSERT INTO venue_sections (venue_id, name, position)
VALUES ('2f1d7c52-8f0e-4c9a-9b1e-6a3d5e7f0b11', 'Parterre', 1),
       ('2f1d7c52-8f0e-4c9a-9b1e-6a3d5e7f0b11', 'Balcony', 2);

INSERT INTO venue_rows (section_id, label, position)
SELECT s.id, chr(64 + n), n
FROM venue_sections s
CROSS JOIN LATERAL generate_series(1, CASE s.name WHEN 'Parterre' THEN 8 ELSE 4 END) AS n
WHERE s.venue_id = '2f1d7c52-8f0e-4c9a-9b1e-6a3d5e7f0b11';

INSERT INTO seats (row_id, number, price_category, accessible)
SELECT r.id, n,
       CASE WHEN s.name = 'Balcony' THEN 'balcony' WHEN r.position <= 3 THEN 'premium' ELSE 'standard' END,
       s.name = 'Parterre' AND r.label = 'H' AND n <= 4
FROM venue_rows r
JOIN venue_sections s ON s.id = r.section_id
CROSS JOIN LATERAL generate_series(1, CASE s.name WHEN 'Parterre' THEN 14 ELSE 12 END) AS n;
