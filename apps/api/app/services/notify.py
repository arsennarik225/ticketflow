"""Email notifications (§4.10).

Every email is saved in `notifications` (that is also the in-app list) and sent only
after the transaction commits, so an action that fails never emails anyone. Locally the
emails land in Mailpit (http://localhost:8025); with SMTP_HOST empty they are logged.
"""
import logging
import smtplib
from dataclasses import dataclass
from email.message import EmailMessage

from sqlalchemy import event as orm_event
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.formatting import kzt, local_time
from app.models import Event, Notification, Order, Refund, SupportCase, Ticket, User

log = logging.getLogger("biletflow.email")


@dataclass
class Attachment:
    filename: str
    content: bytes
    mime_type: str = "application/pdf"


def send(db: Session, to: str, kind: str, subject: str, body: str,
         attachments: list[Attachment] | None = None) -> None:
    to = to.lower()
    user_id = db.scalar(select(User.id).where(User.email == to))
    db.add(Notification(user_id=user_id, email=to, kind=kind, subject=subject, body=body))
    db.info.setdefault("outbox", []).append((to, subject, body, attachments or []))


@orm_event.listens_for(Session, "after_commit")
def _deliver_outbox(session: Session) -> None:
    for message in session.info.pop("outbox", []):
        _deliver(*message)


@orm_event.listens_for(Session, "after_rollback")
def _drop_outbox(session: Session) -> None:
    session.info.pop("outbox", None)


def _deliver(to: str, subject: str, body: str, attachments: list[Attachment]) -> None:
    if not settings.smtp_host:
        log.info("Email to %s: %s\n%s", to, subject, body)
        return
    message = EmailMessage()
    message["From"] = settings.mail_from
    message["To"] = to
    message["Subject"] = subject
    message.set_content(body)
    for a in attachments:
        main, sub = a.mime_type.split("/")
        message.add_attachment(a.content, maintype=main, subtype=sub, filename=a.filename)
    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=5) as smtp:
            smtp.send_message(message)
    except OSError as error:  # a mail outage must not break ticketing
        log.warning("Could not send email to %s: %s", to, error)


def _link(path: str) -> str:
    return f"{settings.web_url}{path}"


def ticket_holders(db: Session, event: Event) -> set[str]:
    """Buyers and attendees who still hold a valid ticket for the event."""
    rows = db.execute(
        select(Ticket.attendee_email, Order.buyer_email)
        .join(Order, Order.id == Ticket.order_id)
        .where(Ticket.event_id == event.id, Ticket.status.in_(("valid", "checked_in")))
    )
    return {email for row in rows for email in row}


# ------------------------------------------------------------------ account

def verify_email(db: Session, user: User, token: str) -> None:
    send(db, user.email, "verify_email", "Confirm your BiletFlow email",
         f"Hi {user.full_name},\n\nConfirm your email address:\n"
         f"{_link(f'/verify-email?token={token}')}\n\nThe link is valid for 48 hours.")


def password_reset(db: Session, user: User, token: str) -> None:
    send(db, user.email, "password_reset", "Reset your BiletFlow password",
         f"Hi {user.full_name},\n\nSet a new password here:\n"
         f"{_link(f'/reset-password?token={token}')}\n\n"
         "The link is valid for 1 hour. If you did not ask for this, ignore this email.")


# ------------------------------------------------------------------ orders

def order_confirmed(db: Session, order: Order, pdfs: list[Attachment]) -> None:
    event = order.event
    lines = "\n".join(f"  {t.ticket_number}  {t.ticket_type.name}  {t.attendee_name}" for t in order.tickets)
    paid = (f"Total paid: {kzt(order.total)} (demonstration payment, no real money was charged)"
            if order.total else "Free registration")
    send(db, order.buyer_email, "order_confirmed", f"Your tickets: {event.title}",
         f"Order {order.order_number} is confirmed.\n\n{event.title}\n"
         f"{local_time(event.starts_at, event.time_zone)}\n{event.venue_name}, {event.city}\n\n"
         f"Tickets (PDFs attached, print or show on your phone):\n{lines}\n\n{paid}\n\n"
         f"Order: {_link(f'/orders/{order.id}')}", pdfs)


def payment_failed(db: Session, email: str, event: Event, reason: str) -> None:
    send(db, email, "payment_failed", f"Payment failed: {event.title}",
         f"Your payment for {event.title} did not go through: {reason}\n"
         "No tickets were issued. You can try again while your tickets are still held.")


def order_refunded(db: Session, order: Order, refund: Refund) -> None:
    send(db, order.buyer_email, "order_refunded", f"Refund completed: {order.event.title}",
         f"Order {order.order_number} was refunded in full: {kzt(refund.amount)} "
         f"(demonstration refund, no real money moved).\nReason: {refund.reason}\n"
         "The tickets in this order are no longer valid.")


def order_cancelled(db: Session, order: Order, reason: str) -> None:
    send(db, order.buyer_email, "order_cancelled", f"Registration cancelled: {order.event.title}",
         f"Your registration {order.order_number} was cancelled by the organizer.\nReason: {reason}\n"
         "The tickets in this order are no longer valid.")


# ------------------------------------------------------------------ events

def event_updated(db: Session, event: Event, what: str) -> None:
    for email in ticket_holders(db, event):
        send(db, email, "event_updated", f"Event update: {event.title}",
             f"{event.title} has changed: {what}.\n\nNow: {local_time(event.starts_at, event.time_zone)}\n"
             f"{event.venue_name}, {event.city}\n\nYour tickets stay valid.\n{_link(f'/events/{event.id}')}")


def event_cancelled(db: Session, event: Event, reason: str) -> None:
    policy = f"\nRefund policy: {event.refund_policy}" if event.refund_policy else ""
    for email in ticket_holders(db, event):
        send(db, email, "event_cancelled", f"Cancelled: {event.title}",
             f"{event.title} on {local_time(event.starts_at, event.time_zone)} was cancelled.\n"
             f"Reason: {reason}{policy}\nThe organizer will handle refunds.")


def payout_status(db: Session, profile, masked_account: str) -> None:
    send(db, profile.contact_email, "payout_status", "Payout account connected",
         f"Your payout account {masked_account} is connected (demonstration only: BiletFlow does not "
         "move real money). Paid ticket sales can be activated per event.")


def organizer_notice(db: Session, event: Event, subject: str, body: str) -> None:
    send(db, event.organizer.contact_email, "moderation", subject, body)


# ------------------------------------------------------------------ support (§4.13)

def support(db: Session, emails: set[str], case: SupportCase, kind: str, text: str) -> None:
    for email in emails:
        send(db, email, kind, f"Support: {case.subject}",
             f"{text}\n\nOpen the case: {_link(f'/support/{case.id}')}")
