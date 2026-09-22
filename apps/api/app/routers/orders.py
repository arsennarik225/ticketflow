"""Orders and tickets (§4.7, §4.9): the buyer's own orders, the organizer's sales,
refunds and cancellations, and Event Admin assignments."""
from typing import Annotated

from fastapi import APIRouter, Depends, Header, Path, Response
from sqlalchemy import exists, or_, select
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.deps import ApiRoute, Paging, contains, current_user, organizer
from app.errors import conflict, not_found
from app.models import Order, StaffAssignment, Ticket, User
from app.schemas import (
    AttendeeOut, ListOf, OrderOut, ReasonIn, RefundOut, StaffAssignmentOut, StaffIn, TicketOut,
)
from app.services import audit, orders
from app.services.events import managed_event, parse_id
from app.services.tickets import ticket_pdf
from app.views import attendees_out, order_out, refund_out, staff_out, ticket_out

router = APIRouter(route_class=ApiRoute)

EventId = Annotated[str, Path(alias="eventId")]
OrderId = Annotated[str, Path(alias="orderId")]
TicketId = Annotated[str, Path(alias="ticketId")]
ORDER_DETAILS = (selectinload(Order.tickets), selectinload(Order.event))


# ------------------------------------------------------------------ the buyer's own

def mine(user: User):
    """Orders placed while signed in, plus guest orders made with the user's verified email."""
    condition = Order.user_id == user.id
    return or_(condition, Order.buyer_email == user.email) if user.email_verified else condition


def my_ticket(db: Session, ticket_id: str, user: User) -> Ticket:
    """The buyer sees every ticket in their orders; an attendee sees tickets issued to
    their verified email (§4.7: tickets are available in the attendee's account)."""
    ticket = db.get(Ticket, parse_id(ticket_id, "Ticket"))
    if ticket is None:
        raise not_found("Ticket")
    order = ticket.order
    is_buyer = order.user_id == user.id or (user.email_verified and order.buyer_email == user.email)
    is_attendee = user.email_verified and ticket.attendee_email == user.email
    if not (is_buyer or is_attendee):
        raise not_found("Ticket")
    return ticket


@router.get("/me/orders", response_model=ListOf[OrderOut], tags=["My Orders"])
def my_orders(paging: Paging = Depends(), user: User = Depends(current_user), db: Session = Depends(get_db)):
    query = select(Order).where(mine(user)).options(*ORDER_DETAILS).order_by(Order.created_at.desc())
    rows, total = paging.fetch(db, query)
    return ListOf(data=[order_out(o) for o in rows], total=total)


@router.get("/me/orders/{orderId}", response_model=OrderOut, tags=["My Orders"])
def my_order(order_id: OrderId, user: User = Depends(current_user), db: Session = Depends(get_db)):
    order = db.scalar(select(Order).where(Order.id == parse_id(order_id, "Order"), mine(user)))
    if order is None:
        raise not_found("Order")
    return order_out(order)


@router.get("/me/tickets/{ticketId}", response_model=TicketOut, tags=["My Orders"])
def my_ticket_detail(ticket_id: TicketId, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return ticket_out(my_ticket(db, ticket_id, user))


@router.get("/me/tickets/{ticketId}/pdf", tags=["My Orders"])
def my_ticket_pdf(ticket_id: TicketId, user: User = Depends(current_user), db: Session = Depends(get_db)):
    ticket = my_ticket(db, ticket_id, user)
    if ticket.status in ("cancelled", "refunded"):
        raise conflict("ticket_not_valid", f"This ticket was {ticket.status}.")
    return Response(ticket_pdf(ticket), media_type="application/pdf",
                    headers={"Content-Disposition": f'inline; filename="{ticket.ticket_number}.pdf"'})


# ------------------------------------------------------------------ organizer sales

@router.get("/organizer/events/{eventId}/orders", response_model=ListOf[OrderOut], tags=["Organizer Sales"])
def event_orders(event_id: EventId, paging: Paging = Depends(), user: User = Depends(current_user),
                 db: Session = Depends(get_db)):
    event = managed_event(db, event_id, user, write=False)
    query = select(Order).where(Order.event_id == event.id).options(*ORDER_DETAILS).order_by(Order.created_at.desc())
    rows, total = paging.fetch(db, query)
    return ListOf(data=[order_out(o) for o in rows], total=total)


@router.get("/organizer/events/{eventId}/attendees", response_model=ListOf[AttendeeOut], tags=["Organizer Sales"])
def event_attendees(event_id: EventId, q: str | None = None, paging: Paging = Depends(),
                    user: User = Depends(current_user), db: Session = Depends(get_db)):
    """One row per ticket, in every status, so cancelled and refunded ones stay visible."""
    event = managed_event(db, event_id, user, write=False)
    query = select(Ticket).where(Ticket.event_id == event.id)
    if q:
        query = query.where(or_(Ticket.attendee_name.ilike(contains(q)), Ticket.attendee_email.ilike(contains(q)),
                                Ticket.ticket_number.ilike(contains(q))))
    rows, total = paging.fetch(db, query.order_by(Ticket.attendee_name, Ticket.ticket_number))
    return ListOf(data=attendees_out(db, rows), total=total)


def locked_order(db: Session, order_id: str, user: User) -> Order:
    order = db.scalar(select(Order).where(Order.id == parse_id(order_id, "Order")).with_for_update())
    if order is None:
        raise not_found("Order")
    managed_event(db, str(order.event_id), user)
    return order


@router.post("/organizer/orders/{orderId}/refund", response_model=RefundOut, tags=["Organizer Sales"])
def refund_order(body: ReasonIn, order_id: OrderId,
                 idempotency_key: Annotated[str, Header(alias="Idempotency-Key", min_length=1, max_length=200)],
                 user: User = Depends(organizer), db: Session = Depends(get_db)):
    """Full refund (simulated). The tickets become invalid, the buyer is emailed, and
    the action is written to the audit log."""
    refund = orders.refund(db, locked_order(db, order_id, user), body.reason, idempotency_key, user)
    db.commit()
    return refund_out(refund)


@router.post("/organizer/orders/{orderId}/cancel", response_model=OrderOut, tags=["Organizer Sales"])
def cancel_free_order(body: ReasonIn, order_id: OrderId, user: User = Depends(organizer),
                      db: Session = Depends(get_db)):
    """Cancel a free registration (§4.9). Paid orders are refunded instead."""
    order = locked_order(db, order_id, user)
    orders.cancel_free(db, order, body.reason, user)
    db.commit()
    return order_out(order)


# ------------------------------------------------------------------ Event Admins (§1.3)

@router.get("/organizer/events/{eventId}/staff", response_model=ListOf[StaffAssignmentOut], tags=["Organizer Sales"])
def list_staff(event_id: EventId, user: User = Depends(current_user), db: Session = Depends(get_db)):
    event = managed_event(db, event_id, user, write=False)
    rows = db.scalars(select(StaffAssignment).where(StaffAssignment.event_id == event.id)
                      .order_by(StaffAssignment.created_at)).all()
    return ListOf(data=[staff_out(db, a) for a in rows])


@router.post("/organizer/events/{eventId}/staff", status_code=201, response_model=StaffAssignmentOut,
             tags=["Organizer Sales"])
def assign_staff(body: StaffIn, event_id: EventId, user: User = Depends(organizer), db: Session = Depends(get_db)):
    """The person signs in to the scanner app with this email (verified) and sees the event.
    They can be assigned before they have an account."""
    event = managed_event(db, event_id, user)
    email = body.email.lower()
    if db.scalar(select(exists().where(StaffAssignment.event_id == event.id, StaffAssignment.email == email))):
        raise conflict("staff_already_assigned", "This person is already assigned to the event.")
    assignment = StaffAssignment(event_id=event.id, email=email, can_reverse_check_in=body.can_reverse_check_in)
    db.add(assignment)
    db.flush()
    audit.record(db, "staff.assigned", f"Assigned {email} as Event Admin", entity_type="staff_assignment",
                 entity_id=assignment.id, event_id=event.id, actor=user)
    db.commit()
    return staff_out(db, assignment)


@router.delete("/organizer/events/{eventId}/staff/{assignmentId}", status_code=204, tags=["Organizer Sales"])
def remove_staff(event_id: EventId, assignment_id: Annotated[str, Path(alias="assignmentId")],
                 user: User = Depends(organizer), db: Session = Depends(get_db)):
    event = managed_event(db, event_id, user)
    assignment = db.get(StaffAssignment, parse_id(assignment_id, "Staff assignment"))
    if assignment is None or assignment.event_id != event.id:
        raise not_found("Staff assignment")
    db.delete(assignment)
    audit.record(db, "staff.removed", f"Removed {assignment.email} as Event Admin", entity_type="staff_assignment",
                 entity_id=assignment.id, event_id=event.id, actor=user)
    db.commit()
    return Response(status_code=204)
