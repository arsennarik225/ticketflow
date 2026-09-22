"""Ticket counts. Nothing is stored as a counter: sold / refunded / checked-in come
from the tickets table, and held = quantities in open, unexpired checkout sessions.
Counting under the event row lock (see events.lock_event) keeps checkout atomic."""
import uuid
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import CheckoutSession, CheckoutSessionItem, Event, Ticket, TicketType


@dataclass
class Counts:
    sold: int = 0  # valid + checked in
    held: int = 0
    refunded: int = 0
    checked_in: int = 0


def counts_by_ticket_type(db: Session, event_ids: list[uuid.UUID], now: datetime) -> dict[uuid.UUID, Counts]:
    counts: dict[uuid.UUID, Counts] = {}
    if not event_ids:
        return counts
    tickets = db.execute(
        select(
            Ticket.ticket_type_id,
            func.count().filter(Ticket.status.in_(("valid", "checked_in"))),
            func.count().filter(Ticket.status == "refunded"),
            func.count().filter(Ticket.status == "checked_in"),
        )
        .where(Ticket.event_id.in_(event_ids))
        .group_by(Ticket.ticket_type_id)
    )
    for type_id, sold, refunded, checked_in in tickets:
        counts[type_id] = Counts(sold=sold, refunded=refunded, checked_in=checked_in)
    holds = db.execute(
        select(CheckoutSessionItem.ticket_type_id, func.sum(CheckoutSessionItem.quantity))
        .join(CheckoutSession, CheckoutSession.id == CheckoutSessionItem.session_id)
        .where(
            CheckoutSession.event_id.in_(event_ids),
            CheckoutSession.status == "open",
            CheckoutSession.expires_at > now,
        )
        .group_by(CheckoutSessionItem.ticket_type_id)
    )
    for type_id, held in holds:
        counts.setdefault(type_id, Counts()).held = int(held)
    return counts


def event_remaining(event: Event, counts: dict[uuid.UUID, Counts]) -> int | None:
    """Seats left under the event-wide capacity, or None when there is no capacity."""
    if event.capacity is None:
        return None
    used = sum(c.sold + c.held for type_id, c in counts.items()
               if type_id in {t.id for t in event.ticket_types})
    return max(0, event.capacity - used)


def available(ticket_type: TicketType, counts: dict[uuid.UUID, Counts], remaining: int | None) -> int:
    c = counts.get(ticket_type.id, Counts())
    left = max(0, ticket_type.quantity - c.sold - c.held)
    return left if remaining is None else min(left, remaining)
