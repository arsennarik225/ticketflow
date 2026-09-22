"""ORM models. They mirror db/schema.sql, which is the source of truth;
tests/test_schema.py fails if the two drift apart. Money columns are tiyin."""
import uuid
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import BigInteger, Column, ForeignKey, Identity, LargeBinary, Numeric, Table, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def utcnow() -> datetime:
    return datetime.now(UTC)


def uuid_pk():
    return mapped_column(primary_key=True, default=uuid.uuid4)


def created_at():
    return mapped_column(default=utcnow)


def money():
    return mapped_column(BigInteger)


# ------------------------------------------------------------------ accounts

class User(Base):
    __tablename__ = "users"
    id: Mapped[uuid.UUID] = uuid_pk()
    email: Mapped[str] = mapped_column(unique=True)
    password_hash: Mapped[str]
    full_name: Mapped[str]
    language: Mapped[str] = mapped_column(default="ru")  # kk | ru | en
    email_verified: Mapped[bool] = mapped_column(default=False)
    is_platform_admin: Mapped[bool] = mapped_column(default=False)
    suspended_at: Mapped[datetime | None]
    suspended_reason: Mapped[str | None]
    created_at: Mapped[datetime] = created_at()

    organizer_profile: Mapped["OrganizerProfile | None"] = relationship(back_populates="user")


class AuthSession(Base):
    __tablename__ = "auth_sessions"
    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    refresh_token_hash: Mapped[str] = mapped_column(unique=True)
    expires_at: Mapped[datetime]
    revoked_at: Mapped[datetime | None]
    created_at: Mapped[datetime] = created_at()

    user: Mapped[User] = relationship()


class UserToken(Base):
    __tablename__ = "user_tokens"
    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    purpose: Mapped[str]  # verify_email | reset_password
    token_hash: Mapped[str] = mapped_column(unique=True)
    expires_at: Mapped[datetime]
    used_at: Mapped[datetime | None]
    created_at: Mapped[datetime] = created_at()

    user: Mapped[User] = relationship()


class OrganizerProfile(Base):
    __tablename__ = "organizer_profiles"
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), primary_key=True)
    display_name: Mapped[str]
    description: Mapped[str | None]
    contact_email: Mapped[str]
    contact_phone: Mapped[str | None]
    identity_status: Mapped[str] = mapped_column(default="not_submitted")
    identity_legal_name: Mapped[str | None]
    identity_document_type: Mapped[str | None]
    identity_verified_at: Mapped[datetime | None]
    created_at: Mapped[datetime] = created_at()

    user: Mapped[User] = relationship(back_populates="organizer_profile")
    payout_account: Mapped["PayoutAccount | None"] = relationship()


class PayoutAccount(Base):
    __tablename__ = "payout_accounts"
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizer_profiles.user_id"), primary_key=True
    )
    account_holder_name: Mapped[str]
    masked_account: Mapped[str]
    status: Mapped[str]  # pending | connected | rejected
    connected_at: Mapped[datetime] = mapped_column(default=utcnow)


class PlatformSettings(Base):
    __tablename__ = "platform_settings"
    id: Mapped[int] = mapped_column(primary_key=True, default=1)
    activation_fee: Mapped[int] = money()
    processing_fee_bps: Mapped[int]  # basis points: 250 = 2.5 %
    processing_fee_paid_by: Mapped[str]  # organizer | attendee
    checkout_hold_minutes: Mapped[int]
    guest_checkout_enabled: Mapped[bool]
    terms_version: Mapped[str]
    updated_at: Mapped[datetime] = mapped_column(default=utcnow, onupdate=utcnow)


# ------------------------------------------------------------------ venue layouts (assigned seating)

class Venue(Base):
    __tablename__ = "venues"
    id: Mapped[uuid.UUID] = uuid_pk()
    name: Mapped[str]
    city: Mapped[str]
    address: Mapped[str | None]

    sections: Mapped[list["VenueSection"]] = relationship(order_by="VenueSection.position")


class VenueSection(Base):
    __tablename__ = "venue_sections"
    id: Mapped[uuid.UUID] = uuid_pk()
    venue_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("venues.id"))
    name: Mapped[str]
    position: Mapped[int]

    rows: Mapped[list["VenueRow"]] = relationship(back_populates="section", order_by="VenueRow.position")


class VenueRow(Base):
    __tablename__ = "venue_rows"
    id: Mapped[uuid.UUID] = uuid_pk()
    section_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("venue_sections.id"))
    label: Mapped[str]
    position: Mapped[int]

    section: Mapped[VenueSection] = relationship(back_populates="rows")
    seats: Mapped[list["Seat"]] = relationship(back_populates="row", order_by="Seat.number")


class Seat(Base):
    __tablename__ = "seats"
    id: Mapped[uuid.UUID] = uuid_pk()
    row_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("venue_rows.id"))
    number: Mapped[int]
    price_category: Mapped[str]
    accessible: Mapped[bool] = mapped_column(default=False)

    row: Mapped[VenueRow] = relationship(back_populates="seats")

    @property
    def label(self) -> str:
        return f"{self.row.section.name} {self.row.label}{self.number}"


# ------------------------------------------------------------------ events

event_blocked_seats = Table(
    "event_blocked_seats",
    Base.metadata,
    Column("event_id", ForeignKey("events.id"), primary_key=True),
    Column("seat_id", ForeignKey("seats.id"), primary_key=True),
)


class Event(Base):
    __tablename__ = "events"
    id: Mapped[uuid.UUID] = uuid_pk()
    organizer_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizer_profiles.user_id"))
    title: Mapped[str]
    description: Mapped[str | None]
    category: Mapped[str | None]
    image_url: Mapped[str | None]
    venue_name: Mapped[str]
    address: Mapped[str | None]
    city: Mapped[str]
    starts_at: Mapped[datetime]
    ends_at: Mapped[datetime]
    time_zone: Mapped[str]
    visibility: Mapped[str] = mapped_column(default="public")  # public | unlisted | private
    registration_opens_at: Mapped[datetime | None]
    registration_closes_at: Mapped[datetime | None]
    capacity: Mapped[int | None]
    refund_policy: Mapped[str | None]
    status: Mapped[str] = mapped_column(default="draft")  # draft | published | cancelled
    published_at: Mapped[datetime | None]
    cancelled_at: Mapped[datetime | None]
    cancel_reason: Mapped[str | None]
    terms_version: Mapped[str | None]
    terms_accepted_at: Mapped[datetime | None]
    paid_sales_suspended_at: Mapped[datetime | None]
    paid_sales_suspended_reason: Mapped[str | None]
    suspended_at: Mapped[datetime | None]
    suspended_reason: Mapped[str | None]
    venue_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("venues.id"))
    duplicated_from_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("events.id"))
    created_at: Mapped[datetime] = created_at()
    updated_at: Mapped[datetime] = mapped_column(default=utcnow, onupdate=utcnow)

    organizer: Mapped[OrganizerProfile] = relationship()
    venue: Mapped[Venue | None] = relationship()
    blocked_seats: Mapped[list[Seat]] = relationship(secondary=event_blocked_seats)
    ticket_types: Mapped[list["TicketType"]] = relationship(
        back_populates="event", order_by="TicketType.created_at"
    )


class EventReport(Base):
    __tablename__ = "event_reports"
    id: Mapped[uuid.UUID] = uuid_pk()
    event_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("events.id"))
    reporter_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    reason: Mapped[str]
    created_at: Mapped[datetime] = created_at()

    event: Mapped[Event] = relationship()


class StaffAssignment(Base):
    __tablename__ = "staff_assignments"
    id: Mapped[uuid.UUID] = uuid_pk()
    event_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("events.id"))
    email: Mapped[str]
    can_reverse_check_in: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = created_at()


# ------------------------------------------------------------------ ticket types and campaigns

class TicketType(Base):
    __tablename__ = "ticket_types"
    id: Mapped[uuid.UUID] = uuid_pk()
    event_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("events.id"))
    name: Mapped[str]
    description: Mapped[str | None]
    price: Mapped[int] = money()
    quantity: Mapped[int]
    sales_start_at: Mapped[datetime | None]
    sales_end_at: Mapped[datetime | None]
    max_per_order: Mapped[int | None]
    hidden: Mapped[bool] = mapped_column(default=False)
    seat_category: Mapped[str | None]  # assigned seating: the seats.price_category it sells
    created_at: Mapped[datetime] = created_at()
    updated_at: Mapped[datetime] = mapped_column(default=utcnow, onupdate=utcnow)

    event: Mapped[Event] = relationship(back_populates="ticket_types")


campaign_ticket_types = Table(
    "campaign_ticket_types",
    Base.metadata,
    Column("campaign_id", ForeignKey("campaigns.id"), primary_key=True),
    Column("ticket_type_id", ForeignKey("ticket_types.id"), primary_key=True),
)


class Campaign(Base):
    __tablename__ = "campaigns"
    id: Mapped[uuid.UUID] = uuid_pk()
    event_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("events.id"))
    name: Mapped[str]
    code: Mapped[str] = mapped_column(unique=True)
    token: Mapped[str] = mapped_column(unique=True)
    discount_type: Mapped[str]  # percentage | fixed_amount
    percent_off: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    amount_off: Mapped[int | None] = money()
    valid_from: Mapped[datetime | None]
    valid_until: Mapped[datetime | None]
    max_redemptions: Mapped[int | None]
    disabled: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = created_at()
    updated_at: Mapped[datetime] = mapped_column(default=utcnow, onupdate=utcnow)

    event: Mapped[Event] = relationship()
    ticket_types: Mapped[list[TicketType]] = relationship(secondary=campaign_ticket_types)


# ------------------------------------------------------------------ checkout

class CheckoutSession(Base):
    __tablename__ = "checkout_sessions"
    id: Mapped[uuid.UUID] = uuid_pk()
    event_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("events.id"))
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    status: Mapped[str] = mapped_column(default="open")  # open | confirmed | expired | abandoned
    campaign_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("campaigns.id"))
    attendees: Mapped[list] = mapped_column(JSONB, default=list)
    subtotal: Mapped[int] = money()
    discount: Mapped[int] = money()
    processing_fee: Mapped[int] = money()
    processing_fee_paid_by: Mapped[str]
    total: Mapped[int] = money()
    expires_at: Mapped[datetime]
    idempotency_key: Mapped[str | None]
    language: Mapped[str] = mapped_column(default="ru")
    created_at: Mapped[datetime] = created_at()
    updated_at: Mapped[datetime] = mapped_column(default=utcnow, onupdate=utcnow)

    event: Mapped[Event] = relationship()
    campaign: Mapped[Campaign | None] = relationship()
    items: Mapped[list["CheckoutSessionItem"]] = relationship(cascade="all, delete-orphan")
    seat_holds: Mapped[list["SeatHold"]] = relationship(cascade="all, delete-orphan",
                                                        order_by="SeatHold.position")
    order: Mapped["Order | None"] = relationship(back_populates="checkout_session")


class CheckoutSessionItem(Base):
    __tablename__ = "checkout_session_items"
    session_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("checkout_sessions.id"), primary_key=True
    )
    ticket_type_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("ticket_types.id"), primary_key=True)
    quantity: Mapped[int]
    unit_price: Mapped[int] = money()

    ticket_type: Mapped[TicketType] = relationship()


class SeatHold(Base):
    __tablename__ = "seat_holds"
    session_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("checkout_sessions.id"), primary_key=True)
    seat_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("seats.id"), primary_key=True)
    ticket_type_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("ticket_types.id"))
    position: Mapped[int]

    seat: Mapped[Seat] = relationship()


# ------------------------------------------------------------------ orders, tickets, money

class Order(Base):
    __tablename__ = "orders"
    id: Mapped[uuid.UUID] = uuid_pk()
    order_number: Mapped[str] = mapped_column(unique=True)
    event_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("events.id"))
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    checkout_session_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("checkout_sessions.id"), unique=True
    )
    buyer_name: Mapped[str]
    buyer_email: Mapped[str]
    status: Mapped[str] = mapped_column(default="confirmed")  # confirmed | cancelled | refunded
    subtotal: Mapped[int] = money()
    discount: Mapped[int] = money()
    processing_fee: Mapped[int] = money()
    processing_fee_paid_by: Mapped[str]
    total: Mapped[int] = money()
    language: Mapped[str] = mapped_column(default="ru")
    created_at: Mapped[datetime] = created_at()
    cancelled_at: Mapped[datetime | None]
    cancel_reason: Mapped[str | None]

    event: Mapped[Event] = relationship()
    checkout_session: Mapped[CheckoutSession] = relationship(back_populates="order")
    items: Mapped[list["OrderItem"]] = relationship()
    tickets: Mapped[list["Ticket"]] = relationship(
        back_populates="order", order_by="Ticket.created_at, Ticket.ticket_number"
    )
    payment: Mapped["Payment | None"] = relationship(viewonly=True)
    refund: Mapped["Refund | None"] = relationship(viewonly=True)
    redemption: Mapped["PromoRedemption | None"] = relationship(viewonly=True)


class OrderItem(Base):
    __tablename__ = "order_items"
    id: Mapped[uuid.UUID] = uuid_pk()
    order_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("orders.id"))
    ticket_type_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("ticket_types.id"))
    quantity: Mapped[int]
    unit_price: Mapped[int] = money()
    seat_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("seats.id"))


class Ticket(Base):
    __tablename__ = "tickets"
    id: Mapped[uuid.UUID] = uuid_pk()
    ticket_number: Mapped[str] = mapped_column(unique=True)
    order_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("orders.id"))
    event_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("events.id"))
    ticket_type_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("ticket_types.id"))
    attendee_name: Mapped[str]
    attendee_email: Mapped[str]
    attendee_phone: Mapped[str | None]
    seat_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("seats.id"))
    status: Mapped[str] = mapped_column(default="valid")  # valid | checked_in | cancelled | refunded
    created_at: Mapped[datetime] = created_at()

    order: Mapped[Order] = relationship(back_populates="tickets")
    event: Mapped[Event] = relationship()
    ticket_type: Mapped[TicketType] = relationship()
    seat: Mapped[Seat | None] = relationship()


class Payment(Base):
    __tablename__ = "payments"
    id: Mapped[uuid.UUID] = uuid_pk()
    purpose: Mapped[str]  # ticket_order | activation_fee
    status: Mapped[str]  # succeeded | failed | refunded
    amount: Mapped[int] = money()
    fee: Mapped[int] = mapped_column(BigInteger, default=0)
    simulated: Mapped[bool] = mapped_column(default=True)
    payer_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    event_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("events.id"))
    order_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("orders.id"))
    checkout_session_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("checkout_sessions.id"))
    failure_code: Mapped[str | None]
    created_at: Mapped[datetime] = created_at()


class Refund(Base):
    __tablename__ = "refunds"
    id: Mapped[uuid.UUID] = uuid_pk()
    order_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("orders.id"), unique=True)
    payment_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("payments.id"))
    amount: Mapped[int] = money()
    reason: Mapped[str]
    simulated: Mapped[bool] = mapped_column(default=True)
    idempotency_key: Mapped[str]
    created_by_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = created_at()


class PromoRedemption(Base):
    __tablename__ = "promo_redemptions"
    id: Mapped[uuid.UUID] = uuid_pk()
    campaign_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("campaigns.id"))
    order_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("orders.id"), unique=True)
    discount: Mapped[int] = money()
    created_at: Mapped[datetime] = created_at()

    campaign: Mapped[Campaign] = relationship()


# ------------------------------------------------------------------ check-in

class CheckIn(Base):
    __tablename__ = "check_ins"
    id: Mapped[uuid.UUID] = uuid_pk()
    ticket_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tickets.id"))
    event_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("events.id"))
    checked_in_by_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    method: Mapped[str]  # qr | manual
    checked_in_at: Mapped[datetime] = mapped_column(default=utcnow)
    reversed_at: Mapped[datetime | None]
    reversed_by_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))

    ticket: Mapped[Ticket] = relationship()


# ------------------------------------------------------------------ support

class SupportCase(Base):
    __tablename__ = "support_cases"
    id: Mapped[uuid.UUID] = uuid_pk()
    requester_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    handled_by: Mapped[str]  # organizer | platform
    category: Mapped[str]
    subject: Mapped[str]
    status: Mapped[str] = mapped_column(default="open")
    event_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("events.id"))
    order_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("orders.id"))
    ticket_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("tickets.id"))
    assignee_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = created_at()
    updated_at: Mapped[datetime] = mapped_column(default=utcnow, onupdate=utcnow)

    requester: Mapped[User] = relationship(foreign_keys=[requester_id])
    event: Mapped[Event | None] = relationship()
    messages: Mapped[list["SupportMessage"]] = relationship(order_by="SupportMessage.created_at")


class SupportMessage(Base):
    __tablename__ = "support_messages"
    id: Mapped[uuid.UUID] = uuid_pk()
    case_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("support_cases.id"))
    author_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    body: Mapped[str]
    created_at: Mapped[datetime] = created_at()

    author: Mapped[User] = relationship()
    attachments: Mapped[list["SupportAttachment"]] = relationship(order_by="SupportAttachment.created_at")


class SupportAttachment(Base):
    __tablename__ = "support_attachments"
    id: Mapped[uuid.UUID] = uuid_pk()
    message_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("support_messages.id"))
    filename: Mapped[str]
    content_type: Mapped[str]  # image/png | image/jpeg | application/pdf
    size_bytes: Mapped[int]
    data: Mapped[bytes] = mapped_column(LargeBinary, deferred=True)  # loaded only for downloads
    created_at: Mapped[datetime] = created_at()


# ------------------------------------------------------------------ notifications and audit

class Notification(Base):
    __tablename__ = "notifications"
    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    email: Mapped[str]
    kind: Mapped[str]
    subject: Mapped[str]
    body: Mapped[str]
    created_at: Mapped[datetime] = created_at()


class AuditEntry(Base):
    __tablename__ = "audit_log"
    id: Mapped[int] = mapped_column(BigInteger, Identity(always=True), primary_key=True)
    event_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("events.id"))
    actor_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    action: Mapped[str]
    entity_type: Mapped[str]
    entity_id: Mapped[str | None]
    description: Mapped[str]
    created_at: Mapped[datetime] = created_at()

    actor: Mapped[User | None] = relationship()


schema_info = Table("schema_info", Base.metadata, Column("checksum", Text, nullable=False))
