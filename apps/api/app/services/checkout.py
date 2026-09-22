"""Checkout (§4.4, §4.6, §4.14): hold tickets, apply a promo, confirm, issue tickets.

Holding is atomic: open_session locks the event row, counts what is left, and writes
the hold in the same transaction, so two buyers can never take the same last ticket.
Nothing is issued until confirm succeeds; a failed payment leaves the hold in place
so the buyer can retry until it expires.
"""
import uuid
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.errors import conflict, gone, invalid, not_found, unauthorized
from app.formatting import kzt
from app.models import (
    Campaign, CheckoutSession, CheckoutSessionItem, Order, OrderItem, Payment,
    PromoRedemption, Ticket, User, utcnow,
)
from app.schemas import CheckoutIn, ConfirmIn
from app.services import audit, notify, payments
from app.services.events import (
    activation, campaign_by_token, ensure_sales_open, lock_event, parse_id, platform_settings,
)
from app.services.inventory import available, counts_by_ticket_type, event_remaining
from app.services.pricing import campaign_problem, check_campaign, compute_totals
from app.services.tickets import new_order_number, new_ticket_number, ticket_pdf


class PaymentFailed(Exception):
    """The simulated payment was declined. The caller commits (to keep the failed
    payment record and the email) and answers 402."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code, self.message = code, message


def load_session(db: Session, session_id: str, user: User | None, *, lock: bool = False) -> CheckoutSession:
    """A signed-in buyer's session is private to them; a guest session is reachable by
    its unguessable id alone."""
    query = select(CheckoutSession).where(CheckoutSession.id == parse_id(session_id, "Checkout session"))
    if lock:
        query = query.with_for_update().execution_options(populate_existing=True)
    session = db.scalar(query)
    if session is None or (session.user_id and (user is None or user.id != session.user_id)):
        raise not_found("Checkout session")
    return session


def ensure_open(session: CheckoutSession, now: datetime) -> None:
    if session.status == "confirmed":
        raise conflict("checkout_already_confirmed", "This checkout is already complete.")
    if session.status == "abandoned":
        raise gone("checkout_abandoned", "This checkout was cancelled. Start again.")
    if session.status == "expired" or session.expires_at <= now:
        raise gone("checkout_expired", "Your tickets were only held for a limited time. Start again.")


def reprice(db: Session, session: CheckoutSession) -> None:
    lines = [(i.ticket_type_id, i.quantity, i.unit_price) for i in session.items]
    totals = compute_totals(lines, session.campaign, platform_settings(db).processing_fee_bps,
                            session.processing_fee_paid_by)
    session.subtotal, session.discount = totals.subtotal, totals.discount
    session.processing_fee, session.total = totals.processing_fee, totals.total


def open_session(db: Session, body: CheckoutIn, user: User | None) -> CheckoutSession:
    now = utcnow()
    config = platform_settings(db)
    if user is None and not config.guest_checkout_enabled:
        raise unauthorized("sign_in_required", "Sign in to get tickets.")
    event = lock_event(db, parse_id(body.event_id, "Event"))
    campaign = campaign_by_token(db, event, body.campaign_token)
    if body.campaign_token and campaign is None:
        raise invalid("promo_code_invalid", "This promo link is not valid for this event.")
    if event.visibility == "private" and campaign is None:
        raise not_found("Event")
    ensure_sales_open(event, now)

    wanted: dict[uuid.UUID, int] = {}
    for item in body.items:
        type_id = parse_id(item.ticket_type_id, "Ticket type")
        wanted[type_id] = wanted.get(type_id, 0) + item.quantity
    types = {t.id: t for t in event.ticket_types}
    paid_sales_active = activation(db, event).active
    counts = counts_by_ticket_type(db, [event.id], now)
    remaining = event_remaining(event, counts)
    for type_id, quantity in wanted.items():
        ticket_type = types.get(type_id)
        if ticket_type is None:
            raise invalid("unknown_ticket_type", "This ticket type does not belong to the event.")
        name = ticket_type.name
        if ticket_type.hidden:
            raise conflict("ticket_type_unavailable", f"“{name}” is not on sale.")
        if ticket_type.sales_start_at and now < ticket_type.sales_start_at:
            raise conflict("sales_not_started", f"Sales for “{name}” have not started yet.")
        if ticket_type.sales_end_at and now >= ticket_type.sales_end_at:
            raise conflict("sales_ended", f"Sales for “{name}” have ended.")
        if ticket_type.max_per_order and quantity > ticket_type.max_per_order:
            raise invalid("max_per_order_exceeded",
                          f"At most {ticket_type.max_per_order} “{name}” tickets per order.")
        if ticket_type.price > 0 and not paid_sales_active:
            raise conflict("paid_sales_not_active", "Paid tickets for this event are not on sale yet.")
        left = available(ticket_type, counts, remaining)
        if quantity > left:
            raise conflict("sold_out", f"Only {left} “{name}” tickets left." if left else f"“{name}” is sold out.")
    total_quantity = sum(wanted.values())
    if remaining is not None and total_quantity > remaining:
        raise conflict("sold_out", f"Only {remaining} tickets left for this event.")

    if body.attendees is not None and len(body.attendees) != total_quantity:
        raise invalid("attendee_count_mismatch", f"Send one attendee per ticket ({total_quantity}).")
    if user is None and not body.attendees:
        raise invalid("attendees_required", "Enter the attendee details for each ticket.")

    session = CheckoutSession(
        id=uuid.uuid4(),
        event_id=event.id,
        user_id=user.id if user else None,
        attendees=[
            {"full_name": a.full_name, "email": a.email.lower(), "phone": a.phone}
            for a in body.attendees or []
        ],
        processing_fee_paid_by=config.processing_fee_paid_by,
        expires_at=now + timedelta(minutes=config.checkout_hold_minutes),
        items=[
            CheckoutSessionItem(ticket_type_id=type_id, quantity=quantity, unit_price=types[type_id].price)
            for type_id, quantity in wanted.items()
        ],
    )
    if campaign:
        check_campaign(db, campaign, set(wanted), now, session.id)
        session.campaign = campaign
    reprice(db, session)
    db.add(session)
    db.flush()
    return session


def apply_promo(db: Session, session_id: str, user: User | None, code: str | None,
                token: str | None) -> CheckoutSession:
    now = utcnow()
    session = load_session(db, session_id, user, lock=True)
    ensure_open(session, now)
    if code:
        campaign = db.scalar(select(Campaign).where(Campaign.code == code.strip().upper()))
    else:
        campaign = db.scalar(select(Campaign).where(Campaign.token == token))
    if campaign is None or campaign.event_id != session.event_id:
        raise invalid("promo_code_invalid", "This promo code is not valid for this event.")
    check_campaign(db, campaign, {i.ticket_type_id for i in session.items}, now, session.id)
    session.campaign = campaign
    reprice(db, session)
    return session


def confirm(db: Session, session_id: str, user: User | None, idempotency_key: str,
            body: ConfirmIn) -> Order:
    now = utcnow()
    session = load_session(db, session_id, user, lock=True)
    if session.status == "confirmed":
        if session.idempotency_key == idempotency_key:
            return session.order  # a retry of the same request: same order, nothing new
        raise conflict("checkout_already_confirmed", "This checkout is already complete.")
    ensure_open(session, now)
    event = session.event
    ensure_sales_open(event, now)
    if any(i.unit_price > 0 for i in session.items) and not activation(db, event).active:
        raise conflict("paid_sales_not_active", "Paid tickets for this event are not on sale right now.")
    if session.campaign and (problem := campaign_problem(session.campaign, now)):
        raise invalid(*problem)

    attendees = session.attendees
    if user:
        buyer_name, buyer_email = user.full_name, user.email
    else:
        buyer_name = attendees[0]["full_name"]
        buyer_email = (body.contact_email or attendees[0]["email"]).lower()

    if session.total > 0:
        if not body.payment_method_token:
            raise invalid("payment_method_required", "Choose a payment method.")
        if failure := payments.charge(body.payment_method_token):
            db.add(Payment(
                purpose="ticket_order", status="failed", amount=session.total, fee=0,
                payer_user_id=session.user_id, event_id=event.id,
                checkout_session_id=session.id, failure_code=failure[0],
            ))
            audit.record(db, "payment.failed", f"Payment of {kzt(session.total)} failed ({failure[0]})",
                         entity_type="checkout_session", entity_id=session.id, event_id=event.id, actor=user)
            notify.payment_failed(db, buyer_email, event, failure[1])
            raise PaymentFailed(*failure)

    order = Order(
        id=uuid.uuid4(), order_number=new_order_number(), event_id=event.id,
        user_id=session.user_id, checkout_session_id=session.id,
        buyer_name=buyer_name, buyer_email=buyer_email,
        subtotal=session.subtotal, discount=session.discount,
        processing_fee=session.processing_fee, processing_fee_paid_by=session.processing_fee_paid_by,
        total=session.total,
    )
    position = 0
    for item in session.items:
        order.items.append(OrderItem(ticket_type_id=item.ticket_type_id, quantity=item.quantity,
                                     unit_price=item.unit_price))
        for _ in range(item.quantity):
            person = (attendees[position] if position < len(attendees)
                      else {"full_name": buyer_name, "email": buyer_email, "phone": None})
            order.tickets.append(Ticket(
                id=uuid.uuid4(), ticket_number=new_ticket_number(), event_id=event.id,
                ticket_type_id=item.ticket_type_id, attendee_name=person["full_name"],
                attendee_email=person["email"], attendee_phone=person.get("phone"),
            ))
            position += 1
    db.add(order)
    db.flush()  # the order row must exist before the payment and redemption point to it
    if session.total > 0:
        db.add(Payment(
            purpose="ticket_order", status="succeeded", amount=session.total,
            fee=session.processing_fee, payer_user_id=session.user_id, event_id=event.id,
            order_id=order.id, checkout_session_id=session.id,
        ))
    if session.campaign_id:
        db.add(PromoRedemption(campaign_id=session.campaign_id, order_id=order.id, discount=session.discount))
    session.status = "confirmed"
    session.idempotency_key = idempotency_key
    db.flush()

    audit.record(db, "order.created",
                 f"Order {order.order_number}: {len(order.tickets)} ticket(s), {kzt(order.total)}",
                 entity_type="order", entity_id=order.id, event_id=event.id, actor=user)
    pdfs = [notify.Attachment(f"{t.ticket_number}.pdf", ticket_pdf(t)) for t in order.tickets]
    notify.order_confirmed(db, order, pdfs)
    return order
