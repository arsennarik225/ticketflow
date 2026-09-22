"""Events (§4.2, §4.5): public browsing, organizer management, and paid-sales activation."""
from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query, Response
from sqlalchemy import exists, or_, select
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.deps import ApiRoute, Paging, contains, current_user, organizer
from app.errors import conflict, invalid, not_found
from app.formatting import kzt
from app.models import Event, EventReport, Order, Payment, TicketType, User, utcnow
from app.schemas import (
    ActivationOut, ErrorDetail, EventIn, EventOut, EventPatchIn, EventReportOut, EventStatus, ListOf,
    PaymentOut, ReasonIn, TermsIn,
)
from app.services import audit, notify
from app.services.calendar import event_ics
from app.services.events import (
    activation, campaign_by_token, check_event_fields, get_event, lock_event, managed_event,
    platform_settings, publicly_visible, status_condition,
)
from app.services.inventory import counts_by_ticket_type
from app.services.pricing import campaign_problem, redemptions_used
from app.views import activation_out, applied_promo, event_out, events_out, payment_out, report_out

router = APIRouter(route_class=ApiRoute, tags=["Events"])

EventId = Annotated[str, Path(alias="eventId")]
CampaignToken = Annotated[str | None, Query(alias="campaignToken")]
WITH_TYPES = (selectinload(Event.ticket_types), selectinload(Event.organizer))
REQUIRED = {"title", "venue_name", "city", "starts_at", "ends_at", "time_zone", "visibility"}
NOTIFY_ON = {"starts_at", "ends_at", "time_zone", "venue_name", "address", "city"}  # email ticket holders


# ------------------------------------------------------------------ public

@router.get("/events", response_model=ListOf[EventOut])
def browse_events(q: str | None = None, city: str | None = None, paging: Paging = Depends(),
                  db: Session = Depends(get_db)):
    """Public, published, not-yet-finished events. Unlisted and private ones never appear."""
    query = select(Event).where(Event.status == "published", Event.visibility == "public",
                                Event.suspended_at.is_(None), Event.ends_at > utcnow())
    if q:
        query = query.where(or_(Event.title.ilike(contains(q)), Event.description.ilike(contains(q)),
                                Event.venue_name.ilike(contains(q))))
    if city:
        query = query.where(Event.city.ilike(city.replace("%", "").replace("_", "")))
    rows, total = paging.fetch(db, query.options(*WITH_TYPES).order_by(Event.starts_at, Event.id))
    return ListOf(data=events_out(db, rows, organizer_view=False), total=total)


def visible_event(db: Session, event_id: str, campaign_token: str | None):
    event = get_event(db, event_id)
    campaign = campaign_by_token(db, event, campaign_token)
    if not publicly_visible(event, campaign):
        raise not_found("Event")
    return event, campaign


def promo_link_problem(db: Session, campaign) -> tuple[str, str] | None:
    if campaign is None:
        return "promo_code_invalid", "This promo link is not valid for this event."
    now = utcnow()
    if problem := campaign_problem(campaign, now):
        return problem
    if campaign.max_redemptions is not None and redemptions_used(db, campaign.id, now) >= campaign.max_redemptions:
        return "promo_code_exhausted", "This promo code has been fully used."
    return None


@router.get("/events/{eventId}", response_model=EventOut)
def get_public_event(event_id: EventId, campaign_token: CampaignToken = None, db: Session = Depends(get_db)):
    """With a campaignToken from a Campaign QR link, the promo is validated on the server
    and shown as appliedPromo, or explained in promoError."""
    event, campaign = visible_event(db, event_id, campaign_token)
    promo, error = None, None
    if campaign_token:
        if problem := promo_link_problem(db, campaign):
            error = ErrorDetail(code=problem[0], message=problem[1])
        else:
            # No cart yet: fixed discounts show their amount, percentages show percentOff.
            promo = applied_promo(campaign, campaign.amount_off or 0)
    return event_out(db, event, organizer_view=False, applied_promo=promo, promo_error=error)


@router.get("/events/{eventId}/calendar.ics")
def event_calendar(event_id: EventId, campaign_token: CampaignToken = None, db: Session = Depends(get_db)):
    event, _ = visible_event(db, event_id, campaign_token)
    return Response(event_ics(event), media_type="text/calendar; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="event-{event.id}.ics"'})


@router.post("/events/{eventId}/reports", status_code=201, response_model=EventReportOut)
def report_event(body: ReasonIn, event_id: EventId, user: User = Depends(current_user),
                 db: Session = Depends(get_db)):
    """Flag an event for Platform Admins (§4.12)."""
    event = get_event(db, event_id)
    if event.status == "draft":
        raise not_found("Event")
    report = EventReport(event_id=event.id, reporter_id=user.id, reason=body.reason, event=event)
    db.add(report)
    db.commit()
    return report_out(report)


# ------------------------------------------------------------------ organizer

@router.get("/organizer/events", response_model=ListOf[EventOut])
def my_events(status: EventStatus | None = None, paging: Paging = Depends(), user: User = Depends(organizer),
              db: Session = Depends(get_db)):
    """Status filter gives the Upcoming / Active / Completed / Cancelled views (§4.16)."""
    query = select(Event).where(Event.organizer_id == user.id)
    if status:
        query = query.where(status_condition(status, utcnow()))
    rows, total = paging.fetch(db, query.options(*WITH_TYPES).order_by(Event.starts_at.desc(), Event.id))
    return ListOf(data=events_out(db, rows, organizer_view=True), total=total)


@router.post("/organizer/events", status_code=201, response_model=EventOut)
def create_event(body: EventIn, user: User = Depends(organizer), db: Session = Depends(get_db)):
    values = body.model_dump()
    check_event_fields(values)
    event = Event(organizer_id=user.id, **values)
    db.add(event)
    db.flush()
    audit.record(db, "event.created", f"Created draft “{event.title}”", entity_type="event",
                 entity_id=event.id, event_id=event.id, actor=user)
    db.commit()
    return event_out(db, event, organizer_view=True)


@router.get("/organizer/events/{eventId}", response_model=EventOut)
def get_my_event(event_id: EventId, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Includes drafts and hidden ticket types; this is also the preview."""
    return event_out(db, managed_event(db, event_id, user, write=False), organizer_view=True)


@router.patch("/organizer/events/{eventId}", response_model=EventOut)
def edit_event(body: EventPatchIn, event_id: EventId, user: User = Depends(organizer),
               db: Session = Depends(get_db)):
    event = lock_event(db, managed_event(db, event_id, user).id)
    if event.status == "cancelled":
        raise conflict("event_cancelled", "A cancelled event cannot be edited.")
    changes = {k: v for k, v in body.model_dump(exclude_unset=True).items() if getattr(event, k) != v}
    for field in REQUIRED & changes.keys():
        if changes[field] is None:
            raise invalid("validation_error", f"{field} cannot be empty.")
    check_event_fields({c.key: getattr(event, c.key) for c in Event.__table__.columns} | changes)
    if changes.get("capacity") is not None:
        counts = counts_by_ticket_type(db, [event.id], utcnow()).values()
        taken = sum(c.sold + c.held for c in counts)
        if changes["capacity"] < taken:
            raise conflict("capacity_below_sold",
                           f"Capacity cannot be lower than the tickets already sold or held ({taken}).")
    if not changes:
        return event_out(db, event, organizer_view=True)
    described = [f"capacity {event.capacity} → {changes['capacity']}" if k == "capacity"
                 else k.replace("_", " ") for k in changes]
    for key, value in changes.items():
        setattr(event, key, value)
    audit.record(db, "event.updated", "Updated " + ", ".join(described), entity_type="event",
                 entity_id=event.id, event_id=event.id, actor=user)
    if event.status == "published" and NOTIFY_ON & changes.keys():
        notify.event_updated(db, event)
    db.commit()
    return event_out(db, event, organizer_view=True)


@router.post("/organizer/events/{eventId}/publish", response_model=EventOut)
def publish_event(event_id: EventId, user: User = Depends(organizer), db: Session = Depends(get_db)):
    """Needs a verified email and at least one ticket type. Paid tickets still need
    activation before they can be bought."""
    event = managed_event(db, event_id, user)
    if event.status == "cancelled":
        raise conflict("event_cancelled", "A cancelled event cannot be published.")
    if event.status == "draft":
        if event.suspended_at:
            raise conflict("event_suspended", "This event is suspended by BiletFlow.")
        if not user.email_verified:
            raise conflict("email_not_verified", "Verify your email address before publishing.")
        if not event.ticket_types:
            raise conflict("no_ticket_types", "Add at least one ticket type before publishing.")
        if event.ends_at <= utcnow():
            raise conflict("event_ended", "This event is already over.")
        event.status, event.published_at = "published", utcnow()
        audit.record(db, "event.published", f"Published “{event.title}”", entity_type="event",
                     entity_id=event.id, event_id=event.id, actor=user)
        db.commit()
    return event_out(db, event, organizer_view=True)


@router.post("/organizer/events/{eventId}/unpublish", response_model=EventOut)
def unpublish_event(event_id: EventId, user: User = Depends(organizer), db: Session = Depends(get_db)):
    """Back to draft. Only before anyone has an order; after that, cancel instead."""
    event = managed_event(db, event_id, user)
    if event.status != "published":
        raise conflict("event_not_published", "Only a published event can be unpublished.")
    if db.scalar(select(exists().where(Order.event_id == event.id))):
        raise conflict("event_has_orders", "People already have tickets. Cancel the event instead.")
    event.status, event.published_at = "draft", None
    audit.record(db, "event.unpublished", f"Unpublished “{event.title}”", entity_type="event",
                 entity_id=event.id, event_id=event.id, actor=user)
    db.commit()
    return event_out(db, event, organizer_view=True)


@router.post("/organizer/events/{eventId}/cancel", response_model=EventOut)
def cancel_event(body: ReasonIn, event_id: EventId, user: User = Depends(organizer),
                 db: Session = Depends(get_db)):
    """Stops sales and emails ticket holders. Refunds are issued per order (§4.9)."""
    event = managed_event(db, event_id, user)
    if event.status == "cancelled":
        raise conflict("event_cancelled", "This event is already cancelled.")
    event.status, event.cancelled_at, event.cancel_reason = "cancelled", utcnow(), body.reason
    audit.record(db, "event.cancelled", f"Cancelled “{event.title}”: {body.reason}", entity_type="event",
                 entity_id=event.id, event_id=event.id, actor=user)
    notify.event_cancelled(db, event, body.reason)
    db.commit()
    return event_out(db, event, organizer_view=True)


@router.post("/organizer/events/{eventId}/duplicate", status_code=201, response_model=EventOut)
def duplicate_event(event_id: EventId, user: User = Depends(organizer), db: Session = Depends(get_db)):
    """A new draft with the same details and ticket types. Orders, tickets, payments,
    check-ins, campaigns, and support cases are not copied (§4.16)."""
    source = managed_event(db, event_id, user)
    copy = Event(
        organizer_id=user.id, title=f"{source.title} (copy)", description=source.description,
        category=source.category, image_url=source.image_url, venue_name=source.venue_name,
        address=source.address, city=source.city, starts_at=source.starts_at, ends_at=source.ends_at,
        time_zone=source.time_zone, visibility=source.visibility, capacity=source.capacity,
        refund_policy=source.refund_policy, duplicated_from_id=source.id,
        venue_id=source.venue_id, blocked_seats=list(source.blocked_seats),
        ticket_types=[
            TicketType(name=t.name, description=t.description, price=t.price, quantity=t.quantity,
                       max_per_order=t.max_per_order, hidden=t.hidden, seat_category=t.seat_category)
            for t in source.ticket_types
        ],
    )
    db.add(copy)
    db.flush()
    audit.record(db, "event.created", f"Created draft “{copy.title}” as a copy of “{source.title}”",
                 entity_type="event", entity_id=copy.id, event_id=copy.id, actor=user)
    audit.record(db, "event.duplicated", f"Duplicated into “{copy.title}”", entity_type="event",
                 entity_id=copy.id, event_id=source.id, actor=user)
    db.commit()
    return event_out(db, copy, organizer_view=True)


# ------------------------------------------------------------------ paid-sales activation (§3.2, §4.5)

@router.get("/organizer/events/{eventId}/activation", response_model=ActivationOut)
def get_activation(event_id: EventId, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return activation_out(db, managed_event(db, event_id, user, write=False))


@router.post("/organizer/events/{eventId}/activation/pay-fee", response_model=PaymentOut)
def pay_activation_fee(event_id: EventId, user: User = Depends(organizer), db: Session = Depends(get_db)):
    """One simulated payment per event; the fee amount comes from the platform settings."""
    event = lock_event(db, managed_event(db, event_id, user).id)
    state = activation(db, event)
    if event.status == "cancelled":
        raise conflict("event_cancelled", "This event is cancelled.")
    if state.fee_paid:
        raise conflict("activation_fee_already_paid", "The activation fee for this event is already paid.")
    if not state.has_paid_ticket_type:
        raise conflict("no_paid_ticket_type", "Add a paid ticket type first.")
    fee = platform_settings(db).activation_fee
    payment = Payment(purpose="activation_fee", status="succeeded", amount=fee, fee=0,
                      payer_user_id=user.id, event_id=event.id)
    db.add(payment)
    audit.record(db, "activation.fee_paid", f"Paid the activation fee, {kzt(fee)} (simulated)",
                 entity_type="event", entity_id=event.id, event_id=event.id, actor=user)
    db.commit()
    return payment_out(payment)


@router.post("/organizer/events/{eventId}/activation/accept-terms", response_model=ActivationOut)
def accept_terms(body: TermsIn, event_id: EventId, user: User = Depends(organizer),
                 db: Session = Depends(get_db)):
    event = managed_event(db, event_id, user)
    current = platform_settings(db).terms_version
    if body.terms_version != current:
        raise invalid("terms_version_mismatch", f"Accept the current terms (version {current}).")
    event.terms_version, event.terms_accepted_at = current, utcnow()
    audit.record(db, "activation.terms_accepted", f"Accepted paid-event terms {current}", entity_type="event",
                 entity_id=event.id, event_id=event.id, actor=user)
    db.commit()
    return activation_out(db, event)
