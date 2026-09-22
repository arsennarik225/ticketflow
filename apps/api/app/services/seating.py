"""Assigned seating (§4.3.1, bonus).

Venues are predefined layouts (sections -> rows -> seats with a price category). An event
uses a layout by setting events.venue_id, and each price category is sold by one ticket
type (ticket_types.seat_category). Seat status is never stored:
  sold         a valid or checked-in ticket has the seat
  held         an open, unexpired checkout holds it (seat_holds)
  unavailable  blocked by the organizer, or no ticket type on sale for its category
  available    everything else
Choosing seats happens under the event row lock (see checkout.open_session), and a unique
index on tickets(event_id, seat_id) makes a double sale impossible even so.
"""
import uuid
from collections import Counter
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.errors import conflict, invalid, not_found
from app.models import CheckoutSession, Event, Seat, SeatHold, Ticket, TicketType, Venue, VenueRow, VenueSection
from app.schemas import (
    CategoryCount, MapRow, MapSeat, MapSection, SeatMapOut, VenueOut, VenueRowOut, VenueSeatOut,
    VenueSectionOut, VenueSummaryOut, money,
)
from app.services.events import sales_block


def load_venue(db: Session, venue_id) -> Venue:
    try:
        venue_id = uuid.UUID(str(venue_id))
    except ValueError:
        raise not_found("Venue") from None
    venue = db.scalar(select(Venue).where(Venue.id == venue_id).options(
        selectinload(Venue.sections).selectinload(VenueSection.rows).selectinload(VenueRow.seats)))
    if venue is None:
        raise not_found("Venue")
    return venue


def seats_of(venue: Venue) -> list[Seat]:
    return [seat for section in venue.sections for row in section.rows for seat in row.seats]


def categories(venue: Venue) -> set[str]:
    return {seat.price_category for seat in seats_of(venue)}


def venue_summary(venue: Venue) -> VenueSummaryOut:
    seats = seats_of(venue)
    totals, accessible = Counter(s.price_category for s in seats), Counter(s.price_category for s in seats if s.accessible)
    return VenueSummaryOut(
        id=str(venue.id), name=venue.name, city=venue.city, address=venue.address, seat_count=len(seats),
        price_categories=[CategoryCount(price_category=c, seats=n, accessible=accessible[c])
                          for c, n in sorted(totals.items())],
    )


def venue_out(venue: Venue) -> VenueOut:
    return VenueOut(**venue_summary(venue).model_dump(), sections=[
        VenueSectionOut(id=str(section.id), name=section.name, rows=[
            VenueRowOut(id=str(row.id), label=row.label, seats=[
                VenueSeatOut(id=str(s.id), number=s.number, price_category=s.price_category, accessible=s.accessible)
                for s in row.seats])
            for row in section.rows])
        for section in venue.sections])


def taken(db: Session, event_id: uuid.UUID, now: datetime) -> tuple[set, set]:
    """(sold seat ids, held seat ids) for the event."""
    sold = set(db.scalars(select(Ticket.seat_id).where(
        Ticket.event_id == event_id, Ticket.seat_id.is_not(None), Ticket.status.in_(("valid", "checked_in")))))
    held = set(db.scalars(
        select(SeatHold.seat_id).join(CheckoutSession, CheckoutSession.id == SeatHold.session_id)
        .where(CheckoutSession.event_id == event_id, CheckoutSession.status == "open",
               CheckoutSession.expires_at > now)))
    return sold, held


def sellable_types(event: Event, paid_sales_active: bool, now: datetime) -> dict[str, TicketType]:
    """Seat category -> the ticket type that can sell it right now."""
    if sales_block(event, now):
        return {}
    return {
        t.seat_category: t for t in event.ticket_types
        if t.seat_category and not t.hidden
        and (t.sales_start_at is None or t.sales_start_at <= now)
        and (t.sales_end_at is None or now < t.sales_end_at)
        and (t.price == 0 or paid_sales_active)
    }


def seat_map(db: Session, event: Event, paid_sales_active: bool, now: datetime) -> SeatMapOut:
    if event.venue_id is None:
        raise not_found("Seat map")
    venue = load_venue(db, event.venue_id)
    sold, held = taken(db, event.id, now)
    blocked = {s.id for s in event.blocked_seats}
    types = sellable_types(event, paid_sales_active, now)

    def status(seat: Seat) -> str:
        if seat.id in sold:
            return "sold"
        if seat.id in held:
            return "held"
        if seat.id in blocked or seat.price_category not in types:
            return "unavailable"
        return "available"

    return SeatMapOut(event_id=str(event.id), venue_id=str(venue.id), venue_name=venue.name, sections=[
        MapSection(name=section.name, rows=[
            MapRow(label=row.label, seats=[
                MapSeat(id=str(s.id), number=s.number, price_category=s.price_category, accessible=s.accessible,
                        status=status(s),
                        ticket_type_id=str(types[s.price_category].id) if s.price_category in types else None,
                        price=money(types[s.price_category].price) if s.price_category in types else None)
                for s in row.seats])
            for row in section.rows])
        for section in venue.sections])


def choose_seats(db: Session, event: Event, seat_ids: list[str], now: datetime) -> list[tuple[Seat, TicketType]]:
    """Check the buyer's seats (the caller holds the event row lock). Returns each seat with
    the ticket type that prices it, in the buyer's order."""
    if event.venue_id is None:
        raise invalid("not_a_seated_event", "This event has no seat map. Send items instead of seatIds.")
    seats = {str(s.id): s for s in seats_of(load_venue(db, event.venue_id))}
    if len(set(seat_ids)) != len(seat_ids):
        raise invalid("duplicate_seat", "Each seat can be chosen once.")
    sold, held = taken(db, event.id, now)
    blocked = {s.id for s in event.blocked_seats}
    types = {t.seat_category: t for t in event.ticket_types if t.seat_category and not t.hidden}
    chosen = []
    for seat_id in seat_ids:
        seat = seats.get(seat_id.lower())
        if seat is None:
            raise invalid("unknown_seat", "That seat is not in this event's seat map.")
        if seat.id in blocked or seat.price_category not in types:
            raise conflict("seat_unavailable", f"Seat {seat.label} is not for sale.")
        if seat.id in sold or seat.id in held:
            raise conflict("seat_taken", f"Seat {seat.label} was just taken. Pick another one.")
        chosen.append((seat, types[seat.price_category]))
    return chosen
