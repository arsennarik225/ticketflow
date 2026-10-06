"""Event rules shared by many endpoints: derived status, paid-sales activation,
whether sales are open, and who may manage or scan an event."""
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import Select, and_, or_, select
from sqlalchemy.orm import Session

from app.errors import conflict, forbidden, invalid, not_found
from app.models import (
    Campaign, Event, OrganizerProfile, Payment, PayoutAccount, PlatformSettings,
    StaffAssignment, TicketType, User, utcnow,
)


def platform_settings(db: Session) -> PlatformSettings:
    return db.get(PlatformSettings, 1)


def parse_id(value: str | None, what: str) -> uuid.UUID:
    """Path and body ids are strings; a malformed one simply does not exist."""
    try:
        return uuid.UUID(str(value))
    except ValueError:
        raise not_found(what) from None


# ------------------------------------------------------------------ status

def api_status(event: Event, now: datetime) -> str:
    """draft / cancelled are stored; upcoming / active / completed come from the dates."""
    if event.status != "published":
        return event.status
    if now < event.starts_at:
        return "upcoming"
    if now < event.ends_at:
        return "active"
    return "completed"


def status_condition(status: str, now: datetime):
    """SQL filter for an API status (the inverse of api_status)."""
    published = Event.status == "published"
    return {
        "draft": Event.status == "draft",
        "cancelled": Event.status == "cancelled",
        "upcoming": and_(published, Event.starts_at > now),
        "active": and_(published, Event.starts_at <= now, Event.ends_at > now),
        "completed": and_(published, Event.ends_at <= now),
    }[status]


def sales_block(event: Event, now: datetime) -> tuple[str, str] | None:
    """Why nobody can buy tickets for this event right now, or None if they can."""
    if event.suspended_at:
        return "event_suspended", "This event has been suspended by BiletFlow."
    if event.status == "draft":
        return "event_not_published", "This event is not published yet."
    if event.status == "cancelled":
        return "event_cancelled", "This event was cancelled."
    if now >= event.ends_at:
        return "event_ended", "This event has already ended."
    if event.registration_opens_at and now < event.registration_opens_at:
        return "registration_not_open", "Registration has not opened yet."
    if event.registration_closes_at and now >= event.registration_closes_at:
        return "registration_closed", "Registration is closed."
    return None


def ensure_sales_open(event: Event, now: datetime) -> None:
    if block := sales_block(event, now):
        raise conflict(*block)


def check_event_fields(values: dict) -> None:
    """Rules that span fields; `values` is the event after the change."""
    try:
        ZoneInfo(values["time_zone"])
    except (ZoneInfoNotFoundError, ValueError):
        raise invalid("invalid_time_zone", "timeZone must be an IANA name such as Asia/Almaty.") from None
    if values["ends_at"] <= values["starts_at"]:
        raise invalid("invalid_dates", "endsAt must be after startsAt.")
    opens, closes = values.get("registration_opens_at"), values.get("registration_closes_at")
    if opens and closes and closes <= opens:
        raise invalid("invalid_dates", "registrationClosesAt must be after registrationOpensAt.")


# ------------------------------------------------------------------ paid-sales activation (§3.2)

@dataclass
class Activation:
    has_paid_ticket_type: bool
    identity_verified: bool
    fee_paid: bool
    payout_account_connected: bool
    terms_accepted: bool
    suspended_reason: str | None  # set when a Platform Admin suspended paid sales

    @property
    def active(self) -> bool:
        steps = (self.has_paid_ticket_type, self.identity_verified, self.fee_paid,
                 self.payout_account_connected, self.terms_accepted)
        return all(steps) and self.suspended_reason is None


def activations(db: Session, events: list[Event]) -> dict[uuid.UUID, Activation]:
    """Activation state for many events in four queries."""
    if not events:
        return {}
    ids = [e.id for e in events]
    organizers = {e.organizer_id for e in events}
    paid = set(db.scalars(
        select(TicketType.event_id).where(TicketType.event_id.in_(ids), TicketType.price > 0)
    ))
    fee_paid = set(db.scalars(
        select(Payment.event_id).where(
            Payment.event_id.in_(ids), Payment.purpose == "activation_fee",
            Payment.status == "succeeded",
        )
    ))
    verified = set(db.scalars(
        select(OrganizerProfile.user_id).where(
            OrganizerProfile.user_id.in_(organizers), OrganizerProfile.identity_status == "verified"
        )
    ))
    connected = set(db.scalars(
        select(PayoutAccount.user_id).where(
            PayoutAccount.user_id.in_(organizers), PayoutAccount.status == "connected"
        )
    ))
    return {
        e.id: Activation(
            has_paid_ticket_type=e.id in paid,
            identity_verified=e.organizer_id in verified,
            fee_paid=e.id in fee_paid,
            payout_account_connected=e.organizer_id in connected,
            terms_accepted=e.terms_accepted_at is not None,
            suspended_reason=(e.paid_sales_suspended_reason or "Suspended")
            if e.paid_sales_suspended_at else None,
        )
        for e in events
    }


def activation(db: Session, event: Event) -> Activation:
    return activations(db, [event])[event.id]


# ------------------------------------------------------------------ access

def get_event(db: Session, event_id: str) -> Event:
    event = db.get(Event, parse_id(event_id, "Event"))
    if event is None:
        raise not_found("Event")
    return event


def lock_event(db: Session, event_id: uuid.UUID) -> Event:
    """Row lock held until commit. Everything that counts inventory and then changes it
    takes this lock first, so the count cannot go stale in between."""
    event = db.scalar(
        select(Event).where(Event.id == event_id).with_for_update().execution_options(populate_existing=True)
    )
    if event is None:
        raise not_found("Event")
    return event


def managed_event(db: Session, event_id: str, user: User, *, write: bool = True) -> Event:
    """An event the user organizes. Platform Admins may read (not change) any event."""
    event = get_event(db, event_id)
    if event.organizer_id == user.id or (not write and user.is_platform_admin):
        return event
    raise forbidden("not_event_organizer", "Only this event's organizer can do this.")


def checkin_assignments(user: User) -> Select[tuple[StaffAssignment]]:
    """Staff assignments only authorize the matching verified email."""
    return select(StaffAssignment).where(StaffAssignment.email == user.email, user.email_verified)


def checkin_events(db: Session, user: User, *, assigned_only: bool = False) -> list[Event]:
    assigned = checkin_assignments(user).with_only_columns(StaffAssignment.event_id)
    access = Event.id.in_(assigned)
    if not assigned_only:
        access = or_(Event.organizer_id == user.id, access)
    query = (select(Event)
             .where(access, Event.status == "published", Event.ends_at > utcnow() - timedelta(days=1))
             .order_by(Event.starts_at))
    return list(db.scalars(query))


def can_reverse_check_in(assignment: StaffAssignment | None) -> bool:
    """Call after checkin_access: None means the event's organizer, who may reverse."""
    return assignment is None or assignment.can_reverse_check_in


def checkin_access(db: Session, event_id: str, user: User) -> tuple[Event, StaffAssignment | None]:
    """The organizer has full check-in rights; Event Admins need an assignment that matches
    their verified email. Returns the assignment (None for the organizer)."""
    event = get_event(db, event_id)
    if event.organizer_id == user.id:
        return event, None
    assignment = db.scalar(checkin_assignments(user).where(StaffAssignment.event_id == event.id))
    if assignment:
        return event, assignment
    raise forbidden("not_event_staff", "You are not assigned to this event.")


def campaign_by_token(db: Session, event: Event, token: str | None) -> Campaign | None:
    if not token:
        return None
    return db.scalar(select(Campaign).where(Campaign.token == token, Campaign.event_id == event.id))


def publicly_visible(event: Event, campaign: Campaign | None) -> bool:
    """Drafts and suspended events are hidden. Private events need an invite link,
    which is a Campaign QR / campaign link for that event."""
    if event.status == "draft" or event.suspended_at:
        return False
    return event.visibility != "private" or campaign is not None
