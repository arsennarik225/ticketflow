"""Turn database rows into response bodies (see schemas.py)."""
import uuid
from datetime import datetime

from sqlalchemy import exists, func, select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import (
    AuditEntry, Campaign, CheckIn, CheckoutSession, Event, EventReport, Order, Payment,
    PromoRedemption, Refund, StaffAssignment, SupportCase, SupportMessage, Ticket, TicketType,
    User, utcnow,
)
from app.schemas import (
    ActivationOut, ActivationSteps, AdminUserOut, AppliedPromo, AttendeeInfo, AttendeeOut,
    AuditEntryOut, CampaignOut, CheckInOut, CheckoutItemOut, CheckoutSessionOut, ErrorDetail,
    EventOut, EventReportOut, OrderOut, PaymentOut, RefundOut, StaffAssignmentOut,
    SupportCaseOut, SupportMessageOut, TicketOut, TicketTypeOut, UserOut, money,
)
from app.security import ticket_qr_payload
from app.services.events import Activation, activations, api_status, platform_settings, sales_block
from app.services.inventory import Counts, available, counts_by_ticket_type, event_remaining


def sid(value: uuid.UUID | None) -> str | None:
    return str(value) if value else None


# ------------------------------------------------------------------ users

def roles(db: Session, user: User) -> list[str]:
    result = ["attendee"]
    if user.organizer_profile:
        result.append("organizer")
    if user.email_verified and db.scalar(select(exists().where(StaffAssignment.email == user.email))):
        result.append("event_admin")
    if user.is_platform_admin:
        result.append("platform_admin")
    return result


def user_out(db: Session, user: User) -> UserOut:
    return UserOut(id=str(user.id), email=user.email, email_verified=user.email_verified,
                   full_name=user.full_name, roles=roles(db, user))


def admin_user_out(db: Session, user: User) -> AdminUserOut:
    return AdminUserOut(**user_out(db, user).model_dump(), created_at=user.created_at,
                        suspended_at=user.suspended_at, suspended_reason=user.suspended_reason)


# ------------------------------------------------------------------ events and ticket types

def ticket_type_on_sale(ticket_type: TicketType, event: Event, left: int, paid_sales_active: bool,
                        now: datetime) -> bool:
    return (
        sales_block(event, now) is None
        and not ticket_type.hidden
        and (ticket_type.sales_start_at is None or ticket_type.sales_start_at <= now)
        and (ticket_type.sales_end_at is None or now < ticket_type.sales_end_at)
        and (ticket_type.price == 0 or paid_sales_active)
        and left > 0
    )


def ticket_type_out(ticket_type: TicketType, event: Event, counts: dict, remaining: int | None,
                    paid_sales_active: bool, now: datetime) -> TicketTypeOut:
    c = counts.get(ticket_type.id, Counts())
    left = available(ticket_type, counts, remaining)
    return TicketTypeOut(
        id=str(ticket_type.id), event_id=str(event.id), name=ticket_type.name,
        description=ticket_type.description, price=money(ticket_type.price),
        quantity=ticket_type.quantity, sales_start_at=ticket_type.sales_start_at,
        sales_end_at=ticket_type.sales_end_at, max_per_order=ticket_type.max_per_order,
        hidden=ticket_type.hidden,
        on_sale=ticket_type_on_sale(ticket_type, event, left, paid_sales_active, now),
        available=left, held=c.held, sold=c.sold, refunded=c.refunded, checked_in=c.checked_in,
    )


def ticket_types_out(db: Session, event: Event, *, organizer_view: bool) -> list[TicketTypeOut]:
    now = utcnow()
    counts = counts_by_ticket_type(db, [event.id], now)
    remaining = event_remaining(event, counts)
    active = activations(db, [event])[event.id].active
    return [ticket_type_out(t, event, counts, remaining, active, now)
            for t in event.ticket_types if organizer_view or not t.hidden]


def events_out(db: Session, events: list[Event], *, organizer_view: bool,
               with_ticket_types: bool = True) -> list[EventOut]:
    """Many events with a fixed number of queries. The public view hides hidden ticket types."""
    now = utcnow()
    states = activations(db, events)
    counts = counts_by_ticket_type(db, [e.id for e in events], now) if with_ticket_types else {}
    result = []
    for event in events:
        state: Activation = states[event.id]
        ticket_types = None
        if with_ticket_types:
            remaining = event_remaining(event, counts)
            ticket_types = [ticket_type_out(t, event, counts, remaining, state.active, now)
                            for t in event.ticket_types if organizer_view or not t.hidden]
        result.append(EventOut(
            id=str(event.id), organizer_id=str(event.organizer_id),
            organizer_name=event.organizer.display_name, title=event.title,
            description=event.description, category=event.category, image_url=event.image_url,
            venue_name=event.venue_name, address=event.address, city=event.city,
            starts_at=event.starts_at, ends_at=event.ends_at, time_zone=event.time_zone,
            visibility=event.visibility, registration_opens_at=event.registration_opens_at,
            registration_closes_at=event.registration_closes_at, capacity=event.capacity,
            refund_policy=event.refund_policy, status=api_status(event, now),
            paid_sales_active=state.active,
            suspended_reason=event.suspended_reason if event.suspended_at else None,
            ticket_types=ticket_types,
        ))
    return result


def event_out(db: Session, event: Event, *, organizer_view: bool, applied_promo: AppliedPromo | None = None,
              promo_error: ErrorDetail | None = None) -> EventOut:
    out = events_out(db, [event], organizer_view=organizer_view)[0]
    out.applied_promo, out.promo_error = applied_promo, promo_error
    return out


def activation_out(db: Session, event: Event) -> ActivationOut:
    state = activations(db, [event])[event.id]
    return ActivationOut(
        event_id=str(event.id), active=state.active,
        activation_fee=money(platform_settings(db).activation_fee),
        steps=ActivationSteps(
            has_paid_ticket_type=state.has_paid_ticket_type, identity_verified=state.identity_verified,
            fee_paid=state.fee_paid, payout_account_connected=state.payout_account_connected,
            terms_accepted=state.terms_accepted,
        ),
        suspended_reason=state.suspended_reason,
    )


def staff_out(db: Session, assignment: StaffAssignment) -> StaffAssignmentOut:
    user_id = db.scalar(select(User.id).where(User.email == assignment.email))
    return StaffAssignmentOut(id=str(assignment.id), event_id=str(assignment.event_id), user_id=sid(user_id),
                              email=assignment.email, can_reverse_check_in=assignment.can_reverse_check_in)


def report_out(report: EventReport) -> EventReportOut:
    return EventReportOut(id=str(report.id), event_id=str(report.event_id), event_title=report.event.title,
                          reporter_user_id=str(report.reporter_id), reason=report.reason,
                          created_at=report.created_at)


# ------------------------------------------------------------------ campaigns

def campaign_url(campaign: Campaign) -> str:
    """The link inside the Campaign QR: an event page plus an opaque token, never a price."""
    return f"{settings.web_url}/events/{campaign.event_id}?campaign={campaign.token}"


def applied_promo(campaign: Campaign, discount: int) -> AppliedPromo:
    return AppliedPromo(
        campaign_id=str(campaign.id), code=campaign.code, discount=money(discount),
        discount_type=campaign.discount_type,
        percent_off=float(campaign.percent_off) if campaign.percent_off is not None else None,
        amount_off=money(campaign.amount_off) if campaign.amount_off else None,
    )


def campaigns_out(db: Session, campaigns: list[Campaign]) -> list[CampaignOut]:
    """Campaign reporting (§4.14): exact redemptions, and the revenue of orders that
    still stand (refunded or cancelled orders drop out of revenue)."""
    ids = [c.id for c in campaigns]
    redemptions = dict(db.execute(
        select(PromoRedemption.campaign_id, func.count())
        .where(PromoRedemption.campaign_id.in_(ids)).group_by(PromoRedemption.campaign_id)
    ).all()) if ids else {}
    standing = {row[0]: row[1:] for row in db.execute(
        select(PromoRedemption.campaign_id, func.count(), func.sum(Order.subtotal), func.sum(Order.discount))
        .join(Order, Order.id == PromoRedemption.order_id)
        .where(PromoRedemption.campaign_id.in_(ids), Order.status == "confirmed")
        .group_by(PromoRedemption.campaign_id)
    )} if ids else {}
    tickets = dict(db.execute(
        select(PromoRedemption.campaign_id, func.count(Ticket.id))
        .join(Ticket, Ticket.order_id == PromoRedemption.order_id)
        .where(PromoRedemption.campaign_id.in_(ids), Ticket.status.in_(("valid", "checked_in")))
        .group_by(PromoRedemption.campaign_id)
    ).all()) if ids else {}
    result = []
    for c in campaigns:
        orders, gross, discount = standing.get(c.id, (0, 0, 0))
        gross, discount = int(gross or 0), int(discount or 0)
        result.append(CampaignOut(
            id=str(c.id), event_id=str(c.event_id), name=c.name, code=c.code,
            campaign_url=campaign_url(c),
            qr_image_url=f"{settings.api_url}/v1/organizer/campaigns/{c.id}/qr",
            discount_type=c.discount_type,
            percent_off=float(c.percent_off) if c.percent_off is not None else None,
            amount_off=money(c.amount_off) if c.amount_off else None,
            valid_from=c.valid_from, valid_until=c.valid_until, max_redemptions=c.max_redemptions,
            disabled=c.disabled, ticket_type_ids=[str(t.id) for t in c.ticket_types],
            redemptions=redemptions.get(c.id, 0), orders=orders, tickets_sold=tickets.get(c.id, 0),
            gross_revenue=money(gross), discount_total=money(discount), revenue=money(gross - discount),
        ))
    return result


# ------------------------------------------------------------------ checkout, orders, tickets

def session_out(session: CheckoutSession, now: datetime | None = None) -> CheckoutSessionOut:
    now = now or utcnow()
    status = "expired" if session.status == "open" and session.expires_at <= now else session.status
    attendee_fee = session.processing_fee if session.processing_fee_paid_by == "attendee" else 0
    return CheckoutSessionOut(
        id=str(session.id), event_id=str(session.event_id), status=status,
        items=[CheckoutItemOut(ticket_type_id=str(i.ticket_type_id), ticket_type_name=i.ticket_type.name,
                               quantity=i.quantity, unit_price=money(i.unit_price)) for i in session.items],
        subtotal=money(session.subtotal), discount=money(session.discount),
        processing_fee=money(attendee_fee), total=money(session.total),
        applied_promo=applied_promo(session.campaign, session.discount) if session.campaign else None,
        requires_payment=session.total > 0, expires_at=session.expires_at,
    )


def ticket_out(ticket: Ticket) -> TicketOut:
    event = ticket.event
    return TicketOut(
        id=str(ticket.id), ticket_number=ticket.ticket_number, order_id=str(ticket.order_id),
        event_id=str(event.id), event_title=event.title, event_starts_at=event.starts_at,
        venue_name=event.venue_name, ticket_type_name=ticket.ticket_type.name,
        attendee=AttendeeInfo(full_name=ticket.attendee_name, email=ticket.attendee_email,
                              phone=ticket.attendee_phone),
        status=ticket.status, qr_payload=ticket_qr_payload(ticket.id),
        pdf_url=f"{settings.api_url}/v1/me/tickets/{ticket.id}/pdf",
    )


def payment_out(payment: Payment) -> PaymentOut:
    return PaymentOut(
        id=str(payment.id), purpose=payment.purpose, amount=money(payment.amount), fee=money(payment.fee),
        status=payment.status, order_id=sid(payment.order_id), event_id=str(payment.event_id),
        failure_code=payment.failure_code, created_at=payment.created_at,
    )


def order_out(order: Order) -> OrderOut:
    attendee_fee = order.processing_fee if order.processing_fee_paid_by == "attendee" else 0
    redemption = order.redemption
    return OrderOut(
        id=str(order.id), order_number=order.order_number, event_id=str(order.event_id),
        event_title=order.event.title, status=order.status, buyer_name=order.buyer_name,
        buyer_email=order.buyer_email, subtotal=money(order.subtotal), discount=money(order.discount),
        processing_fee=money(attendee_fee), total=money(order.total),
        applied_promo=applied_promo(redemption.campaign, redemption.discount) if redemption else None,
        tickets=[ticket_out(t) for t in order.tickets],
        payment=payment_out(order.payment) if order.payment else None, created_at=order.created_at,
    )


def refund_out(refund: Refund) -> RefundOut:
    return RefundOut(id=str(refund.id), order_id=str(refund.order_id), amount=money(refund.amount),
                     reason=refund.reason, created_at=refund.created_at)


def attendees_out(db: Session, tickets: list[Ticket]) -> list[AttendeeOut]:
    ids = [t.id for t in tickets]
    checked_in_at = dict(db.execute(
        select(CheckIn.ticket_id, CheckIn.checked_in_at)
        .where(CheckIn.ticket_id.in_(ids), CheckIn.reversed_at.is_(None))
    ).all()) if ids else {}
    return [
        AttendeeOut(ticket_id=str(t.id), ticket_number=t.ticket_number, order_id=str(t.order_id),
                    full_name=t.attendee_name, email=t.attendee_email, ticket_type_name=t.ticket_type.name,
                    status=t.status, checked_in_at=checked_in_at.get(t.id))
        for t in tickets
    ]


def check_in_out(check_in: CheckIn) -> CheckInOut:
    return CheckInOut(
        id=str(check_in.id), ticket_id=str(check_in.ticket_id), ticket_number=check_in.ticket.ticket_number,
        attendee_name=check_in.ticket.attendee_name, checked_in_at=check_in.checked_in_at,
        checked_in_by_user_id=str(check_in.checked_in_by_user_id),
    )


# ------------------------------------------------------------------ support and history

def message_out(message: SupportMessage) -> SupportMessageOut:
    return SupportMessageOut(id=str(message.id), author_user_id=str(message.author_id),
                             author_name=message.author.full_name, body=message.body,
                             created_at=message.created_at)


def case_out(case: SupportCase, *, with_messages: bool) -> SupportCaseOut:
    return SupportCaseOut(
        id=str(case.id), category=case.category, subject=case.subject, status=case.status,
        handled_by=case.handled_by, requester_user_id=str(case.requester_id),
        event_id=sid(case.event_id), order_id=sid(case.order_id), ticket_id=sid(case.ticket_id),
        assignee_user_id=sid(case.assignee_id),
        messages=[message_out(m) for m in case.messages] if with_messages else None,
        created_at=case.created_at, updated_at=case.updated_at,
    )


def audit_out(entry: AuditEntry) -> AuditEntryOut:
    return AuditEntryOut(
        id=str(entry.id), created_at=entry.created_at, action=entry.action, entity_type=entry.entity_type,
        entity_id=entry.entity_id, description=entry.description, actor_user_id=sid(entry.actor_user_id),
        actor_name=entry.actor.full_name if entry.actor else None,
    )
