"""Ticket verification and check-in for the Event Admin mobile app (§4.8). Online only.

A ticket QR carries a signed payload (security.read_ticket_qr). A Campaign QR carries
a promo link and is always rejected: it is never admission (§4.14)."""
from typing import Annotated
from urllib.parse import parse_qs, urlparse

from fastapi import APIRouter, Depends, Path, Query, Response
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import ApiRoute, contains, current_user
from app.errors import ApiError, forbidden, not_found
from app.models import Campaign, CheckIn, Event, Ticket, User, utcnow
from app.schemas import (
    CheckInIn, CheckInOut, CheckInSearchOut, EventOut, ListOf, OfflineListOut, OfflineSyncIn, OfflineSyncOut,
    OfflineSyncResult, OfflineTicket, VerifyIn, VerifyResult,
)
from app.security import read_ticket_qr, ticket_qr_payload
from app.services import audit
from app.services.events import can_reverse_check_in, checkin_access, checkin_events, parse_id
from app.views import attendees_out, check_in_out, events_out, ticket_out

router = APIRouter(route_class=ApiRoute, tags=["Check-In"])

EventId = Annotated[str, Path(alias="eventId")]
MESSAGES = {
    "valid": "Valid ticket. Admit one.",
    "invalid": "Not a valid BiletFlow ticket. Do not admit.",
    "cancelled": "This ticket was cancelled. Do not admit.",
    "refunded": "This ticket was refunded. Do not admit.",
    "already_used": "Already checked in. Do not admit again.",
    "wrong_event": "This ticket is for a different event.",
    "rejected_campaign_qr": "This is a promo QR code, not a ticket. Do not admit.",
}


def is_campaign_qr(db: Session, payload: str) -> bool:
    """A Campaign QR link (…?campaign=<token>), or a promo code or token typed in."""
    value = payload.strip()
    token = parse_qs(urlparse(value).query).get("campaign", [None])[0]
    return bool(db.scalar(select(Campaign.id).where(
        or_(Campaign.token == (token or value), Campaign.code == value.upper()))))


def active_check_in(db: Session, ticket: Ticket) -> CheckIn | None:
    return db.scalar(select(CheckIn).where(CheckIn.ticket_id == ticket.id, CheckIn.reversed_at.is_(None)))


def evaluate(db: Session, event: Event, qr_payload: str | None = None, ticket_id: str | None = None,
             *, lock: bool = False) -> tuple[str, Ticket | None]:
    """The scanner result for a QR payload (or a ticket id from manual search)."""
    if qr_payload is not None:
        found_id = read_ticket_qr(qr_payload)
        if found_id is None:
            return ("rejected_campaign_qr" if is_campaign_qr(db, qr_payload) else "invalid"), None
    else:
        try:
            found_id = parse_id(ticket_id, "Ticket")
        except ApiError:
            return "invalid", None
    query = select(Ticket).where(Ticket.id == found_id)
    if lock:  # serialise two scanners reading the same ticket at the same moment
        query = query.with_for_update().execution_options(populate_existing=True)
    ticket = db.scalar(query)
    if ticket is None:
        return "invalid", None
    if ticket.event_id != event.id:
        return "wrong_event", None  # no details about another event's attendee
    return {"valid": "valid", "checked_in": "already_used"}.get(ticket.status, ticket.status), ticket


def verify_result(db: Session, result: str, ticket: Ticket | None) -> VerifyResult:
    previous = active_check_in(db, ticket) if result == "already_used" else None
    return VerifyResult(result=result, message=MESSAGES[result], ticket=ticket_out(ticket) if ticket else None,
                        previous_check_in=check_in_out(previous) if previous else None)


@router.get("/checkin/events", response_model=ListOf[EventOut])
def my_checkin_events(assigned_only: Annotated[bool, Query(alias="assignedOnly")] = False,
                     user: User = Depends(current_user), db: Session = Depends(get_db)):
    """First screen of the scanner app: events the user is assigned to (by verified email)
    or organizes, until a day after they end. assignedOnly excludes ownership-only access."""
    events = checkin_events(db, user, assigned_only=assigned_only)
    return ListOf(data=events_out(db, events, organizer_view=False, with_ticket_types=False), total=len(events))


@router.post("/checkin/events/{eventId}/verify", response_model=VerifyResult)
def verify_ticket(body: VerifyIn, event_id: EventId, user: User = Depends(current_user),
                  db: Session = Depends(get_db)):
    """Shows what a scan means without checking anybody in."""
    event, _ = checkin_access(db, event_id, user)
    result, ticket = evaluate(db, event, qr_payload=body.qr_payload)
    return verify_result(db, result, ticket)


@router.post("/checkin/events/{eventId}/check-ins", status_code=201, response_model=CheckInOut)
def check_in(body: CheckInIn, event_id: EventId, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Admits a ticket once. Anything but a valid ticket answers 409 with a VerifyResult."""
    event, _ = checkin_access(db, event_id, user)
    result, ticket = evaluate(db, event, qr_payload=body.qr_payload, ticket_id=body.ticket_id, lock=True)
    if result != "valid":
        body_409 = verify_result(db, result, ticket).model_dump(mode="json", by_alias=True, exclude_none=True)
        raise ApiError(409, result, MESSAGES[result], body=body_409)
    ticket.status = "checked_in"
    record = CheckIn(ticket_id=ticket.id, event_id=event.id, checked_in_by_user_id=user.id,
                     method="qr" if body.qr_payload else "manual", ticket=ticket)
    db.add(record)
    audit.record(db, "check_in.created", f"Checked in {ticket.ticket_number} ({ticket.attendee_name})",
                 entity_type="ticket", entity_id=ticket.id, event_id=event.id, actor=user)
    db.commit()
    return check_in_out(record)


@router.delete("/checkin/check-ins/{checkInId}", status_code=204)
def undo_check_in(check_in_id: Annotated[str, Path(alias="checkInId")], user: User = Depends(current_user),
                  db: Session = Depends(get_db)):
    """Only the organizer or staff allowed to reverse. The row is kept, marked reversed."""
    record = db.get(CheckIn, parse_id(check_in_id, "Check-in"))
    if record is None:
        raise not_found("Check-in")
    event, assignment = checkin_access(db, str(record.event_id), user)
    if not can_reverse_check_in(assignment):
        raise forbidden("cannot_reverse_check_in", "You are not allowed to undo check-ins for this event.")
    if record.reversed_at is None:
        ticket = db.scalar(select(Ticket).where(Ticket.id == record.ticket_id).with_for_update())
        record.reversed_at, record.reversed_by_user_id = utcnow(), user.id
        if ticket.status == "checked_in":
            ticket.status = "valid"
        audit.record(db, "check_in.reversed", f"Undid check-in of {ticket.ticket_number} ({ticket.attendee_name})",
                     entity_type="ticket", entity_id=ticket.id, event_id=event.id, actor=user)
        db.commit()
    return Response(status_code=204)


@router.get("/checkin/events/{eventId}/attendees", response_model=CheckInSearchOut)
def search_attendees(event_id: EventId, q: Annotated[str | None, Query(min_length=2, max_length=100)] = None,
                     user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Manual fallback when a QR will not scan, plus the registered / checked-in totals.
    Without `q` it returns totals and the current user's reversal capability."""
    event, assignment = checkin_access(db, event_id, user)
    matches = db.scalars(
        select(Ticket).where(Ticket.event_id == event.id,
                             or_(Ticket.attendee_name.ilike(contains(q)), Ticket.attendee_email.ilike(contains(q)),
                                 Ticket.ticket_number.ilike(contains(q))))
        .order_by(Ticket.attendee_name).limit(50)
    ).all() if q else []
    registered, checked_in = db.execute(
        select(func.count().filter(Ticket.status.in_(("valid", "checked_in"))),
               func.count().filter(Ticket.status == "checked_in")).where(Ticket.event_id == event.id)
    ).one()
    return CheckInSearchOut(data=attendees_out(db, list(matches)), registered=registered, checked_in=checked_in,
                            can_reverse_check_in=can_reverse_check_in(assignment))


# ------------------------------------------------------------------ offline mode (bonus)

@router.get("/checkin/events/{eventId}/offline-list", response_model=OfflineListOut)
def offline_list(event_id: EventId, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Download before the doors open to keep scanning without internet: a scanned code is
    valid offline if it equals a `qrPayload` here with status `valid`. Upload what was
    scanned with /offline-sync as soon as the connection is back."""
    event, _ = checkin_access(db, event_id, user)
    tickets = db.scalars(select(Ticket).where(Ticket.event_id == event.id).order_by(Ticket.ticket_number)).all()
    return OfflineListOut(event_id=str(event.id), generated_at=utcnow(), tickets=[
        OfflineTicket(ticket_id=str(t.id), ticket_number=t.ticket_number, qr_payload=ticket_qr_payload(t.id),
                      attendee_name=t.attendee_name, ticket_type_name=t.ticket_type.name,
                      seat_label=t.seat.label if t.seat else None, status=t.status)
        for t in tickets])


@router.post("/checkin/events/{eventId}/offline-sync", response_model=OfflineSyncOut)
def offline_sync(body: OfflineSyncIn, event_id: EventId, user: User = Depends(current_user),
                 db: Session = Depends(get_db)):
    """Upload check-ins recorded offline, in any order. A ticket is still admitted once: the
    first check-in that reaches the server wins, later ones come back as `already_used` so
    staff can follow up. Results are in the same order as the request."""
    event, _ = checkin_access(db, event_id, user)
    now = utcnow()
    results: dict[int, OfflineSyncResult] = {}
    for index, item in sorted(enumerate(body.check_ins), key=lambda pair: pair[1].checked_in_at):
        result, ticket = evaluate(db, event, ticket_id=item.ticket_id, lock=True)
        if result != "valid":
            results[index] = OfflineSyncResult(ticket_id=item.ticket_id, result=result)
            continue
        ticket.status = "checked_in"
        record = CheckIn(ticket_id=ticket.id, event_id=event.id, checked_in_by_user_id=user.id, method="offline",
                         checked_in_at=min(item.checked_in_at, now), ticket=ticket)
        db.add(record)
        db.flush()
        audit.record(db, "check_in.created", f"Checked in {ticket.ticket_number} ({ticket.attendee_name}), offline",
                     entity_type="ticket", entity_id=ticket.id, event_id=event.id, actor=user)
        results[index] = OfflineSyncResult(ticket_id=item.ticket_id, result="accepted", check_in=check_in_out(record))
    db.commit()
    return OfflineSyncOut(results=[results[i] for i in range(len(body.check_ins))])
