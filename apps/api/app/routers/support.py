"""Support cases (§4.13): asynchronous, chat-like threads with event/order/ticket context.

Who handles a case:
  * 'organizer': an attendee asking about someone else's event -> that event's organizer.
  * 'platform':  organizer questions, cases without an event, and escalated cases
                 -> Platform Admins (§4.12 "review escalated support cases").
Who may read it: the requester, the assignee, the event's organizer, and Platform Admins.
Clients poll GET /support/cases/{id} for new messages (no WebSockets in the MVP).
"""
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, Path, Query, Response, UploadFile
from sqlalchemy import or_, select, true
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import ApiRoute, Paging, current_user
from app.errors import conflict, forbidden, invalid, not_found
from app.models import (
    Event, Order, StaffAssignment, SupportAttachment, SupportCase, SupportMessage, Ticket, User, utcnow,
)
from app.schemas import (
    CaseStatus, EscalateIn, ListOf, SupportCaseIn, SupportCaseOut, SupportCasePatchIn, SupportMessageIn,
    SupportMessageOut,
)
from app.services import audit, notify
from app.services.events import parse_id
from app.views import case_out, message_out

router = APIRouter(route_class=ApiRoute, tags=["Support"])

CaseId = Annotated[str, Path(alias="caseId")]
MAX_FILE_BYTES = 5 * 1024 * 1024
# The first bytes of each allowed file type: the declared type must match the content.
FILE_SIGNATURES = {"image/png": b"\x89PNG", "image/jpeg": b"\xff\xd8\xff", "application/pdf": b"%PDF"}


def visible_to(user: User):
    """SQL filter: the cases this user may read (checked by role and relationship)."""
    if user.is_platform_admin:
        return true()
    organized = select(Event.id).where(Event.organizer_id == user.id)
    return or_(SupportCase.requester_id == user.id, SupportCase.assignee_id == user.id,
               SupportCase.event_id.in_(organized))


def is_organizer_of(user: User, case: SupportCase) -> bool:
    return case.event is not None and case.event.organizer_id == user.id


def can_view(user: User, case: SupportCase) -> bool:
    return (user.is_platform_admin or case.requester_id == user.id or case.assignee_id == user.id
            or is_organizer_of(user, case))


def can_handle(user: User, case: SupportCase) -> bool:
    """May change status and assign. After escalation only Platform Admins (and the assignee)."""
    return (user.is_platform_admin or case.assignee_id == user.id
            or (case.handled_by == "organizer" and is_organizer_of(user, case)))


def load_case(db: Session, case_id: str, user: User) -> SupportCase:
    case = db.get(SupportCase, parse_id(case_id, "Support case"))
    if case is None:
        raise not_found("Support case")
    if not can_view(user, case):
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


def admin_emails(db: Session) -> set[str]:
    return set(db.scalars(select(User.email).where(User.is_platform_admin)))


def handler_emails(db: Session, case: SupportCase) -> set[str]:
    if case.assignee_id:
        return {db.get(User, case.assignee_id).email}
    if case.handled_by == "organizer":
        return {case.event.organizer.contact_email}
    return admin_emails(db)


def other_side(db: Session, case: SupportCase, author: User) -> set[str]:
    """Who hears about a new message: staff when the requester writes, else the requester."""
    return handler_emails(db, case) if author.id == case.requester_id else {case.requester.email}


def add_message(db: Session, case: SupportCase, author: User, body: str) -> SupportMessage:
    message = SupportMessage(case_id=case.id, author_id=author.id, body=body, author=author, attachments=[])
    db.add(message)
    if author.id == case.requester_id and case.status in ("waiting_for_customer", "resolved"):
        case.status = "open"  # the customer answered, so it needs staff again
    case.updated_at = utcnow()
    return message


@router.get("/support/cases", response_model=ListOf[SupportCaseOut])
def list_cases(status: CaseStatus | None = None,
               event_id: Annotated[str | None, Query(alias="eventId")] = None,
               handled_by: Annotated[str | None, Query(alias="handledBy", pattern="^(organizer|platform)$")] = None,
               paging: Paging = Depends(), user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Filters: status, eventId (one event's cases, e.g. for its history), handledBy
    (Platform Admins use handledBy=platform for escalated and organizer cases)."""
    query = select(SupportCase).where(visible_to(user))
    if status:
        query = query.where(SupportCase.status == status)
    if event_id:
        query = query.where(SupportCase.event_id == parse_id(event_id, "Event"))
    if handled_by:
        query = query.where(SupportCase.handled_by == handled_by)
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
                       ticket_id=ticket.id if ticket else None, event=event, requester=user,
                       messages=[SupportMessage(author_id=user.id, body=body.message, author=user, attachments=[])])
    db.add(case)
    db.flush()
    audit.record(db, "support_case.opened", f"Support case opened: “{case.subject}” ({case.category})",
                 entity_type="support_case", entity_id=case.id, event_id=case.event_id, actor=user)
    notify.support(db, handler_emails(db, case), case, "support_new_case", name=user.full_name, message=body.message)
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
            notify.support(db, {assignee.email}, case, "support_assigned")
    if changes.get("status") and changes["status"] != case.status:
        old, case.status = case.status, changes["status"]
        audit.record(db, "support_case.status_changed",
                     f"Case “{case.subject}”: {old.replace('_', ' ')} → {case.status.replace('_', ' ')}",
                     entity_type="support_case", entity_id=case.id, event_id=case.event_id, actor=user)
        notify.support(db, {case.requester.email}, case, "support_status", status=case.status)
    case.updated_at = utcnow()
    db.commit()
    return case_out(case, with_messages=True)


@router.post("/support/cases/{caseId}/escalate", response_model=SupportCaseOut)
def escalate_case(body: EscalateIn, case_id: CaseId, user: User = Depends(current_user),
                  db: Session = Depends(get_db)):
    """Hand an attendee case over to Platform Admins. The requester or the event's organizer
    can do it; the organizer keeps read access and can still reply."""
    case = load_case(db, case_id, user)
    if case.handled_by == "platform":
        raise conflict("already_escalated", "Platform Admins already handle this case.")
    if not (case.requester_id == user.id or is_organizer_of(user, case)):
        raise forbidden("cannot_escalate", "Only the requester or the event's organizer can escalate.")
    case.handled_by, case.assignee_id, case.status = "platform", None, "open"
    if body.reason:
        add_message(db, case, user, body.reason)
    audit.record(db, "support_case.escalated", f"Case “{case.subject}” escalated to BiletFlow support",
                 entity_type="support_case", entity_id=case.id, event_id=case.event_id, actor=user)
    notify.support(db, admin_emails(db), case, "support_escalated", name=user.full_name)
    case.updated_at = utcnow()
    db.commit()
    return case_out(case, with_messages=True)


@router.post("/support/cases/{caseId}/messages", status_code=201, response_model=SupportMessageOut)
def post_message(body: SupportMessageIn, case_id: CaseId, user: User = Depends(current_user),
                 db: Session = Depends(get_db)):
    case = load_case(db, case_id, user)
    message = add_message(db, case, user, body.body)
    notify.support(db, other_side(db, case, user), case, "support_reply", name=user.full_name, message=body.body)
    db.commit()
    return message_out(message)


@router.post("/support/cases/{caseId}/attachments", status_code=201, response_model=SupportMessageOut)
async def post_attachment(case_id: CaseId, file: Annotated[UploadFile, File()],
                          body: Annotated[str, Form(max_length=5000)] = "",
                          user: User = Depends(current_user), db: Session = Depends(get_db)):
    """A message with one file (bonus): PNG, JPEG, or PDF, at most 5 MB. Send it as
    multipart/form-data with `file` and an optional `body` text."""
    case = load_case(db, case_id, user)
    content = await file.read(MAX_FILE_BYTES + 1)
    if not content or len(content) > MAX_FILE_BYTES:
        raise invalid("file_too_large", "Attach a file of at most 5 MB.")
    signature = FILE_SIGNATURES.get(file.content_type or "")
    if signature is None or not content.startswith(signature):
        raise invalid("file_type_not_allowed", "Attach a PNG, JPEG, or PDF file.")
    filename = (file.filename or "attachment").rsplit("/", 1)[-1][:200]
    message = add_message(db, case, user, body.strip() or filename)
    message.attachments.append(SupportAttachment(filename=filename, content_type=file.content_type,
                                                 size_bytes=len(content), data=content))
    notify.support(db, other_side(db, case, user), case, "support_reply", name=user.full_name,
                   message=f"{message.body} [{filename}]")
    db.commit()
    return message_out(message)


@router.get("/support/attachments/{attachmentId}")
def download_attachment(attachment_id: Annotated[str, Path(alias="attachmentId")],
                        user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Only people who can read the case can download its files."""
    attachment = db.get(SupportAttachment, parse_id(attachment_id, "Attachment"))
    if attachment is None:
        raise not_found("Attachment")
    message = db.get(SupportMessage, attachment.message_id)
    load_case(db, str(message.case_id), user)
    return Response(attachment.data, media_type=attachment.content_type,
                    headers={"Content-Disposition": f'attachment; filename="{attachment.filename}"'})
