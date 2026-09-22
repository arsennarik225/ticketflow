"""Assigned seating (§4.3.1, bonus): predefined venue layouts and per-event seat maps.
Buying seats goes through the normal checkout with `seatIds` (see services/checkout.py)."""
from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query
from sqlalchemy import exists, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import ApiRoute, current_user, organizer
from app.errors import ApiError, conflict, invalid, not_found
from app.models import CheckoutSession, Order, User, Venue, utcnow
from app.schemas import EventOut, ListOf, SeatingIn, SeatMapOut, VenueOut, VenueSummaryOut
from app.services import audit
from app.services.events import activation, campaign_by_token, get_event, lock_event, managed_event, publicly_visible
from app.services.seating import load_venue, seat_map, seats_of, venue_out, venue_summary
from app.views import event_out

router = APIRouter(route_class=ApiRoute, tags=["Seating"])

EventId = Annotated[str, Path(alias="eventId")]


@router.get("/venues", response_model=ListOf[VenueSummaryOut])
def list_venues(db: Session = Depends(get_db)):
    """The predefined layouts an organizer can choose from."""
    venues = [load_venue(db, v) for v in db.scalars(select(Venue.id).order_by(Venue.name))]
    return ListOf(data=[venue_summary(v) for v in venues])


@router.get("/venues/{venueId}", response_model=VenueOut)
def get_venue(venue_id: Annotated[str, Path(alias="venueId")], db: Session = Depends(get_db)):
    return venue_out(load_venue(db, venue_id))


@router.put("/organizer/events/{eventId}/seating", response_model=EventOut)
def configure_seating(body: SeatingIn, event_id: EventId, user: User = Depends(organizer),
                      db: Session = Depends(get_db)):
    """Choose a layout (and seats to keep out of sale), or send venueId null for general
    admission. Only before anyone has an order or a checkout in progress. Then price each
    seat category with a ticket type (seatCategory)."""
    event = lock_event(db, managed_event(db, event_id, user).id)
    if event.status == "cancelled":
        raise conflict("event_cancelled", "This event is cancelled.")
    if db.scalar(select(exists().where(Order.event_id == event.id))):
        raise conflict("event_has_orders", "Seating cannot change after tickets were issued.")
    if db.scalar(select(exists().where(CheckoutSession.event_id == event.id, CheckoutSession.status == "open",
                                       CheckoutSession.expires_at > utcnow()))):
        raise conflict("checkout_in_progress", "Someone is checking out right now. Try again in a few minutes.")
    if body.venue_id is None:
        event.venue_id, event.blocked_seats = None, []
        description = "Switched to general admission"
    else:
        try:
            venue = load_venue(db, body.venue_id)
        except ApiError:
            raise invalid("unknown_venue", "Pick a venue from GET /venues.") from None
        seats = {str(s.id): s for s in seats_of(venue)}
        unknown = [s for s in body.blocked_seat_ids if s.lower() not in seats]
        if unknown:
            raise invalid("unknown_seat", "Every blocked seat must belong to the chosen venue.")
        event.venue_id = venue.id
        event.blocked_seats = [seats[s.lower()] for s in dict.fromkeys(body.blocked_seat_ids)]
        event.venue_name, event.address, event.city = venue.name, venue.address, venue.city
        description = f"Assigned seating: {venue.name}, {len(event.blocked_seats)} seat(s) blocked"
    audit.record(db, "event.seating_updated", description, entity_type="event", entity_id=event.id,
                 event_id=event.id, actor=user)
    db.commit()
    return event_out(db, event, organizer_view=True)


@router.get("/events/{eventId}/seats", response_model=SeatMapOut)
def public_seat_map(event_id: EventId, campaign_token: Annotated[str | None, Query(alias="campaignToken")] = None,
                    db: Session = Depends(get_db)):
    """Seat statuses for the seat-selection screen. Poll it while the buyer is choosing."""
    event = get_event(db, event_id)
    if not publicly_visible(event, campaign_by_token(db, event, campaign_token)):
        raise not_found("Event")
    return seat_map(db, event, activation(db, event).active, utcnow())


@router.get("/organizer/events/{eventId}/seats", response_model=SeatMapOut)
def organizer_seat_map(event_id: EventId, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """The same map for the organizer, drafts included (preview)."""
    event = managed_event(db, event_id, user, write=False)
    return seat_map(db, event, activation(db, event).active, utcnow())
