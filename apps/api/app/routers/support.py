"""Support cases (§4.13): asynchronous, chat-like threads with event/order/ticket context.

Who handles a case:
  * 'organizer': an attendee asking about someone else's event -> that event's organizer.
  * 'platform':  everything else (organizer questions, no event context) -> Platform Admins.
Platform Admins can see every case. Clients poll GET /support/cases/{id} for new messages.
"""
from typing import Annotated

from fastapi import APIRouter, Depends, Path
from sqlalchemy import and_, or_, select, true
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import ApiRoute, Paging, current_user
from app.errors import forbidden, invalid, not_found
from app.models import Event, Order, StaffAssignment, SupportCase, SupportMessage, Ticket, User, utcnow
from app.schemas import (
    CaseStatus, ListOf, SupportCaseIn, SupportCaseOut, SupportCasePatchIn, SupportMessageIn, SupportMessageOut,
)
from app.services import audit, notify
from app.services.events import parse_id
from app.views import case_out, message_out

router = APIRouter(route_class=ApiRoute, tags=["Support"])

CaseId = Annotated[str, Path(alias="caseId")]
STATUS_WORDS = {"open": "open", "in_progress": "in progress", "waiting_for_customer": "waiting for you",
                "resolved": "resolved"}


def visible_to(user: User):
    """SQL filter: the cases this user may read (checked by role and relationship)."""
    if user.is_platform_admin:
        return true()
    organized = select(Event.id).where(Event.organizer_id == user.id)
    return or_(SupportCase.requester_id == user.id, SupportCase.assignee_id == user.id,
               and_(SupportCase.handled_by == "organizer", SupportCase.event_id.in_(organized)))


def can_handle(user: User, case: SupportCase) -> bool:
    """May reply as staff, change status, and assign."""
    return (user.is_platform_admin or case.assignee_id == user.id
            or (case.handled_by == "organizer" and case.event.organizer_id == user.id))


def load_case(db: Session, case_id: str, user: User) -> SupportCase:
    case = db.get(SupportCase, parse_id(case_id, "Support case"))
    if case is None:
        raise not_found("Support case")
    if case.requester_id != user.id and not can_handle(user, case):
        raise forbidden("not_your_case", "You cannot view this support case.")
    return case


def related_to_order(user: User, order: Order, ticket: Ticket | None) -> bool:
    """Buyer, ticket holder (by verified email), or the event's organizer."""
    verified = user.email_verified
    return (order.user_id == user.id or order.event.organizer_id == user.id
            or (verified and order.buyer_email == user.email)
            or (verified and ticket is not None and ticket.attendee_email == user.email))


def can_be_assignee(db: Session, case: SupportCase, person: User) -> bool:
    """A Platform Admin, or for organizer cases the organizer or one of the event's staff."""
    if person.is_platform_admin:
        return True
    if case.handled_by != "organizer":
        return False
    if person.id == case.event.organizer_id:
        return True
    return person.email_verified and db.scalar(select(StaffAssignment.id).where(
        StaffAssignment.event_id == case.event_id, StaffAssignment.email == person.email)) is not None


def handler_emails(db: Session, case: SupportCase) -> set[str]:
    if case.assignee_id:
        return {db.get(User, case.assignee_id).email}
    if case.handled_by == "organizer":
        return {case.event.organizer.contact_email}
    return set(db.scalars(select(User.email).where(User.is_platform_admin)))


@router.get("/support/cases", response_model=ListOf[SupportCaseOut])
def list_cases(status: CaseStatus | None = None, paging: Paging = Depends(), user: User = Depends(current_user),
               db: Session = Depends(get_db)):
    query = select(SupportCase).where(visible_to(user))
    if status:
        query = query.where(SupportCase.status == status)
    rows, total = paging.fetch(db, query.order_by(SupportCase.updated_at.desc()))
    return ListOf(data=[case_out(c, with_messages=False) for c in rows], total=total)


@router.post("/support/cases", status_code=201, response_model=SupportCaseOut)
def open_case(body: SupportCaseIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Send whichever of ticketId / orderId / eventId you have; the rest is filled in."""
    ticket = order = event = None
    if body.ticket_id:
        ticket = db.get(Ticket, parse_id(body.ticket_id, "Ticket"))
        if ticket is None:
            raise not_found("Ticket")
        order, event = ticket.order, ticket.event
    if body.order_id:
        found = db.get(Order, parse_id(body.order_id, "Order"))
        if found is None or (order and found.id != order.id):
            raise invalid("context_mismatch", "The ticket, order, and event do not belong together.")
        order, event = found, found.event
    if body.event_id:
        found = db.get(Event, parse_id(body.event_id, "Event"))
        if found is None or found.status == "draft" and found.organizer_id != user.id:
            raise not_found("Event")
        if event and found.id != event.id:
            raise invalid("context_mismatch", "The ticket, order, and event do not belong together.")
        event = found
    if order and not related_to_order(user, order, ticket):
        raise not_found("Order")

    handled_by = "organizer" if event and event.organizer_id != user.id else "platform"
    case = SupportCase(requester_id=user.id, handled_by=handled_by, category=body.category, subject=body.subject,
                       event_id=event.id if event else None, order_id=order.id if order else None,
                       ticket_id=ticket.id if ticket else None, event=event,
                       messages=[SupportMessage(author_id=user.id, body=body.message, author=user)])
    db.add(case)
    db.flush()
    audit.record(db, "support_case.opened", f"Support case opened: “{case.subject}” ({case.category})",
                 entity_type="support_case", entity_id=case.id, event_id=case.event_id, actor=user)
    notify.support(db, handler_emails(db, case), case, "support_new_case",
                   f"New support case from {user.full_name}:\n\n{body.message}")
    db.commit()
    return case_out(case, with_messages=True)


@router.get("/support/cases/{caseId}", response_model=SupportCaseOut)
def get_case(case_id: CaseId, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return case_out(load_case(db, case_id, user), with_messages=True)


@router.patch("/support/cases/{caseId}", response_model=SupportCaseOut)
def update_case(body: SupportCasePatchIn, case_id: CaseId, user: User = Depends(current_user),
                db: Session = Depends(get_db)):
    """Staff only: change status (open / in progress / waiting for customer / resolved)
    or assign the case to a colleague."""
    case = load_case(db, case_id, user)
    if not can_handle(user, case):
        raise forbidden("support_staff_only", "Only support staff can change a case.")
    changes = body.model_dump(exclude_unset=True)
    if "assignee_user_id" in changes and changes["assignee_user_id"] != (str(case.assignee_id) if case.assignee_id else None):
        assignee = None
        if changes["assignee_user_id"]:
            assignee = db.get(User, parse_id(changes["assignee_user_id"], "User"))
            if assignee is None or not can_be_assignee(db, case, assignee):
                raise invalid("invalid_assignee", "Assign the case to the organizer, event staff, or a Platform Admin.")
        case.assignee_id = assignee.id if assignee else None
        audit.record(db, "support_case.assigned",
                     f"Case “{case.subject}” assigned to {assignee.full_name if assignee else 'nobody'}",
                     entity_type="support_case", entity_id=case.id, event_id=case.event_id, actor=user)
        if assignee:
            notify.support(db, {assignee.email}, case, "support_assigned", "A support case was assigned to you.")
    if changes.get("status") and changes["status"] != case.status:
        old, case.status = case.status, changes["status"]
        audit.record(db, "support_case.status_changed",
                     f"Case “{case.subject}”: {STATUS_WORDS[old]} → {STATUS_WORDS[case.status]}",
                     entity_type="support_case", entity_id=case.id, event_id=case.event_id, actor=user)
        notify.support(db, {case.requester.email}, case, "support_status",
                       f"Your support case is now {STATUS_WORDS[case.status]}.")
    case.updated_at = utcnow()
    db.commit()
    return case_out(case, with_messages=True)


@router.post("/support/cases/{caseId}/messages", status_code=201, response_model=SupportMessageOut)
def post_message(body: SupportMessageIn, case_id: CaseId, user: User = Depends(current_user),
                 db: Session = Depends(get_db)):
    case = load_case(db, case_id, user)
    message = SupportMessage(case_id=case.id, author_id=user.id, body=body.body, author=user)
    db.add(message)
    if user.id == case.requester_id:
        if case.status in ("waiting_for_customer", "resolved"):
            case.status = "open"  # the customer answered, so it needs staff again
        notify.support(db, handler_emails(db, case), case, "support_reply", f"{user.full_name} wrote:\n\n{body.body}")
    else:
        notify.support(db, {case.requester.email}, case, "support_reply", f"{user.full_name} replied:\n\n{body.body}")
    case.updated_at = utcnow()
    db.commit()
    return message_out(message)
