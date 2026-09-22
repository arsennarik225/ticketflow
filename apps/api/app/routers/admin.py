"""Platform administration (§4.5, §4.12): search, moderation, settings, and reports.
Every endpoint here requires a Platform Admin."""
import csv
import io
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query, Response
from pydantic import AwareDatetime
from sqlalchemy import or_, select, update
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.deps import ApiRoute, Paging, contains, platform_admin
from app.errors import conflict, not_found
from app.models import AuthSession, Event, EventReport, Order, Payment, User, utcnow
from app.schemas import (
    ActivationOut, AdminUserOut, EventOut, EventReportOut, EventStatus, ListOf, OrderOut, PaymentOut,
    PlatformSettingsIn, PlatformSettingsOut, ReasonIn, money,
)
from app.services import audit, notify
from app.services.events import get_event, parse_id, platform_settings, status_condition
from app.views import activation_out, admin_user_out, event_out, events_out, order_out, payment_out, report_out

router = APIRouter(route_class=ApiRoute, tags=["Admin"], prefix="/admin")

EventId = Annotated[str, Path(alias="eventId")]
UserId = Annotated[str, Path(alias="userId")]
Admin = Annotated[User, Depends(platform_admin)]


# ------------------------------------------------------------------ users

def get_user(db: Session, user_id: str) -> User:
    user = db.get(User, parse_id(user_id, "User"))
    if user is None:
        raise not_found("User")
    return user


@router.get("/users", response_model=ListOf[AdminUserOut])
def search_users(admin: Admin, q: str | None = None, paging: Paging = Depends(), db: Session = Depends(get_db)):
    query = select(User)
    if q:
        query = query.where(or_(User.email.ilike(contains(q)), User.full_name.ilike(contains(q))))
    rows, total = paging.fetch(db, query.order_by(User.created_at.desc()))
    return ListOf(data=[admin_user_out(db, u) for u in rows], total=total)


@router.post("/users/{userId}/suspend", response_model=AdminUserOut)
def suspend_user(body: ReasonIn, user_id: UserId, admin: Admin, db: Session = Depends(get_db)):
    """Signs the user out everywhere and blocks sign-in."""
    user = get_user(db, user_id)
    if user.id == admin.id:
        raise conflict("cannot_suspend_self", "You cannot suspend your own account.")
    user.suspended_at, user.suspended_reason = utcnow(), body.reason
    db.execute(update(AuthSession).where(AuthSession.user_id == user.id, AuthSession.revoked_at.is_(None))
               .values(revoked_at=utcnow()))
    audit.record(db, "user.suspended", f"Suspended {user.email}: {body.reason}", entity_type="user",
                 entity_id=user.id, actor=admin)
    db.commit()
    return admin_user_out(db, user)


@router.post("/users/{userId}/unsuspend", response_model=AdminUserOut)
def unsuspend_user(user_id: UserId, admin: Admin, db: Session = Depends(get_db)):
    user = get_user(db, user_id)
    user.suspended_at, user.suspended_reason = None, None
    audit.record(db, "user.unsuspended", f"Lifted the suspension of {user.email}", entity_type="user",
                 entity_id=user.id, actor=admin)
    db.commit()
    return admin_user_out(db, user)


# ------------------------------------------------------------------ events

@router.get("/events", response_model=ListOf[EventOut])
def search_events(admin: Admin, q: str | None = None, status: EventStatus | None = None,
                  paging: Paging = Depends(), db: Session = Depends(get_db)):
    query = select(Event).options(selectinload(Event.ticket_types), selectinload(Event.organizer))
    if q:
        query = query.where(or_(Event.title.ilike(contains(q)), Event.city.ilike(contains(q))))
    if status:
        query = query.where(status_condition(status, utcnow()))
    rows, total = paging.fetch(db, query.order_by(Event.created_at.desc()))
    return ListOf(data=events_out(db, rows, organizer_view=True), total=total)


@router.post("/events/{eventId}/suspend", response_model=EventOut)
def suspend_event(body: ReasonIn, event_id: EventId, admin: Admin, db: Session = Depends(get_db)):
    """Hides the event and stops all sales, including checkouts already in progress."""
    event = get_event(db, event_id)
    event.suspended_at, event.suspended_reason = utcnow(), body.reason
    audit.record(db, "event.suspended", f"Suspended by BiletFlow: {body.reason}", entity_type="event",
                 entity_id=event.id, event_id=event.id, actor=admin)
    notify.organizer_notice(db, event, "event_suspended", body.reason)
    db.commit()
    return event_out(db, event, organizer_view=True)


@router.post("/events/{eventId}/unsuspend", response_model=EventOut)
def unsuspend_event(event_id: EventId, admin: Admin, db: Session = Depends(get_db)):
    event = get_event(db, event_id)
    event.suspended_at, event.suspended_reason = None, None
    audit.record(db, "event.unsuspended", "Suspension lifted by BiletFlow", entity_type="event",
                 entity_id=event.id, event_id=event.id, actor=admin)
    db.commit()
    return event_out(db, event, organizer_view=True)


@router.get("/events/{eventId}/activation", response_model=ActivationOut)
def inspect_activation(event_id: EventId, admin: Admin, db: Session = Depends(get_db)):
    return activation_out(db, get_event(db, event_id))


@router.post("/events/{eventId}/paid-sales/suspend", response_model=ActivationOut)
def suspend_paid_sales(body: ReasonIn, event_id: EventId, admin: Admin, db: Session = Depends(get_db)):
    """Stops paid sales only (§4.5); free tickets keep working."""
    event = get_event(db, event_id)
    event.paid_sales_suspended_at, event.paid_sales_suspended_reason = utcnow(), body.reason
    audit.record(db, "paid_sales.suspended", f"Paid sales suspended by BiletFlow: {body.reason}",
                 entity_type="event", entity_id=event.id, event_id=event.id, actor=admin)
    notify.organizer_notice(db, event, "paid_sales_suspended", body.reason)
    db.commit()
    return activation_out(db, event)


@router.post("/events/{eventId}/paid-sales/resume", response_model=ActivationOut)
def resume_paid_sales(event_id: EventId, admin: Admin, db: Session = Depends(get_db)):
    event = get_event(db, event_id)
    event.paid_sales_suspended_at, event.paid_sales_suspended_reason = None, None
    audit.record(db, "paid_sales.resumed", "Paid sales resumed by BiletFlow", entity_type="event",
                 entity_id=event.id, event_id=event.id, actor=admin)
    db.commit()
    return activation_out(db, event)


@router.get("/event-reports", response_model=ListOf[EventReportOut])
def event_reports(admin: Admin, paging: Paging = Depends(), db: Session = Depends(get_db)):
    rows, total = paging.fetch(db, select(EventReport).order_by(EventReport.created_at.desc()))
    return ListOf(data=[report_out(r) for r in rows], total=total)


# ------------------------------------------------------------------ orders and payments

@router.get("/orders", response_model=ListOf[OrderOut])
def search_orders(admin: Admin, q: str | None = None, paging: Paging = Depends(), db: Session = Depends(get_db)):
    query = select(Order).options(selectinload(Order.tickets), selectinload(Order.event))
    if q:
        query = query.where(or_(Order.order_number.ilike(contains(q)), Order.buyer_email.ilike(contains(q))))
    rows, total = paging.fetch(db, query.order_by(Order.created_at.desc()))
    return ListOf(data=[order_out(o) for o in rows], total=total)


@router.get("/payments", response_model=ListOf[PaymentOut])
def list_payments(admin: Admin, status: Annotated[str | None, Query(pattern="^(succeeded|failed|refunded)$")] = None,
                  purpose: Annotated[str | None, Query(pattern="^(ticket_order|activation_fee)$")] = None,
                  paging: Paging = Depends(), db: Session = Depends(get_db)):
    """Monitor payment failures and refunds (§4.12). All payments are simulated."""
    query = select(Payment)
    if status:
        query = query.where(Payment.status == status)
    if purpose:
        query = query.where(Payment.purpose == purpose)
    rows, total = paging.fetch(db, query.order_by(Payment.created_at.desc()))
    return ListOf(data=[payment_out(p) for p in rows], total=total)


@router.get("/reports/orders.csv")
def orders_report(admin: Admin, start: Annotated[AwareDatetime | None, Query(alias="from")] = None,
                  end: Annotated[AwareDatetime | None, Query(alias="to")] = None, db: Session = Depends(get_db)):
    """Basic operational report (§4.12): one row per order, amounts in KZT."""
    query = select(Order).options(selectinload(Order.event), selectinload(Order.tickets))
    if start:
        query = query.where(Order.created_at >= start)
    if end:
        query = query.where(Order.created_at < end)
    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow(["order_number", "created_at", "event", "buyer_email", "status", "tickets",
                     "subtotal_kzt", "discount_kzt", "processing_fee_kzt", "total_kzt", "simulated"])
    for o in db.scalars(query.order_by(Order.created_at)):
        writer.writerow([o.order_number, o.created_at.isoformat(), o.event.title, o.buyer_email, o.status,
                         len(o.tickets), *(f"{Decimal(v) / 100:.2f}" for v in
                                           (o.subtotal, o.discount, o.processing_fee, o.total)), "yes"])
    return Response(out.getvalue(), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": 'attachment; filename="orders.csv"'})


# ------------------------------------------------------------------ settings

def settings_out(db: Session) -> PlatformSettingsOut:
    s = platform_settings(db)
    return PlatformSettingsOut(
        activation_fee=money(s.activation_fee), processing_fee_percent=s.processing_fee_bps / 100,
        processing_fee_paid_by=s.processing_fee_paid_by, checkout_hold_minutes=s.checkout_hold_minutes,
        guest_checkout_enabled=s.guest_checkout_enabled, terms_version=s.terms_version,
    )


@router.get("/settings", response_model=PlatformSettingsOut)
def get_settings(admin: Admin, db: Session = Depends(get_db)):
    return settings_out(db)


@router.patch("/settings", response_model=PlatformSettingsOut)
def update_settings(body: PlatformSettingsIn, admin: Admin, db: Session = Depends(get_db)):
    """Activation fee, processing fee and who pays it, hold time, guest checkout, terms version."""
    s = platform_settings(db)
    changes = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    if "activation_fee" in changes:
        s.activation_fee = changes.pop("activation_fee")["amount"]
    if "processing_fee_percent" in changes:
        s.processing_fee_bps = round(changes.pop("processing_fee_percent") * 100)
    for key, value in changes.items():
        setattr(s, key, value)
    audit.record(db, "settings.updated", "Updated platform settings: " + ", ".join(
        body.model_dump(exclude_unset=True, by_alias=True)), entity_type="platform_settings", actor=admin)
    db.commit()
    return settings_out(db)
