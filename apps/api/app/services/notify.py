"""Email notifications (§4.10), in the recipient's language (texts in messages.py).

Every email is saved in `notifications` (that is also the in-app list) and sent only
after the transaction commits, so an action that fails never emails anyone. Locally the
emails land in Mailpit (http://localhost:8025); with SMTP_HOST empty they are logged.
"""
import logging
import smtplib
import ssl
from dataclasses import dataclass
from email.message import EmailMessage

from sqlalchemy import event as orm_event
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.formatting import kzt, local_time
from app.models import Event, Notification, Order, OrganizerProfile, Refund, SupportCase, Ticket, User
from app.services import messages
from app.services.calendar import calendar_links

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


def compose(db: Session, to: str, kind: str, language: str, attachments=None, **values) -> None:
    subject, body = messages.email(kind, language, **values)
    send(db, to, kind, subject, body, attachments)


def language_of(db: Session, email: str, fallback: str = messages.DEFAULT_LANGUAGE) -> str:
    """The recipient's own language if they have an account, otherwise `fallback`."""
    return db.scalar(select(User.language).where(User.email == email.lower())) or fallback


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
        transport = smtplib.SMTP_SSL if settings.smtp_ssl else smtplib.SMTP
        options = {"context": ssl.create_default_context()} if settings.smtp_ssl else {}
        with transport(settings.smtp_host, settings.smtp_port, timeout=5, **options) as smtp:
            if settings.smtp_starttls and not settings.smtp_ssl:
                smtp.starttls(context=ssl.create_default_context())
            if settings.smtp_username:
                smtp.login(settings.smtp_username, settings.smtp_password)
            smtp.send_message(message)
    except OSError as error:  # a mail outage must not break ticketing
        log.warning("Could not send email to %s: %s", to, error)


def _link(path: str) -> str:
    return f"{settings.web_url}{path}"


def _event_values(event: Event) -> dict:
    venue = ", ".join(p for p in (event.venue_name, event.address, event.city) if p)
    return {"event": event.title, "when": local_time(event.starts_at, event.time_zone), "venue": venue}


def seat_text(ticket: Ticket, language: str) -> str:
    seat = ticket.seat
    return messages.phrase("seat", language, section=seat.row.section.name, row=seat.row.label,
                           number=seat.number)


def ticket_holders(db: Session, event: Event) -> dict[str, str]:
    """Email -> language for buyers and attendees who still hold a valid ticket."""
    rows = db.execute(
        select(Ticket.attendee_email, Order.buyer_email, Order.language)
        .join(Order, Order.id == Ticket.order_id)
        .where(Ticket.event_id == event.id, Ticket.status.in_(("valid", "checked_in")))
    )
    holders = {}
    for attendee, buyer, language in rows:
        for email in (attendee, buyer):
            holders.setdefault(email, language)
    return {email: language_of(db, email, language) for email, language in holders.items()}


# ------------------------------------------------------------------ account

def verify_email(db: Session, user: User, token: str) -> None:
    compose(db, user.email, "verify_email", user.language, name=user.full_name,
            link=_link(f"/verify-email?token={token}"))


def password_reset(db: Session, user: User, token: str) -> None:
    compose(db, user.email, "password_reset", user.language, name=user.full_name,
            link=_link(f"/reset-password?token={token}"))


def payout_status(db: Session, profile: OrganizerProfile, masked_account: str) -> None:
    compose(db, profile.contact_email, "payout_status", profile.user.language, account=masked_account)


# ------------------------------------------------------------------ orders

def order_confirmed(db: Session, order: Order, pdfs: list[Attachment]) -> None:
    language = order.language
    lines = []
    for t in order.tickets:
        seat = f"  {seat_text(t, language)}" if t.seat else ""
        lines.append(f"  {t.ticket_number}  {t.ticket_type.name}  {t.attendee_name}{seat}")
    payment = (messages.phrase("paid", language, total=kzt(order.total)) if order.total
               else messages.phrase("free", language))
    compose(db, order.buyer_email, "order_confirmed", language, pdfs, order=order.order_number,
            tickets="\n".join(lines), payment=payment, calendar=calendar_links(order.event).google,
            link=_link(f"/orders/{order.id}"), **_event_values(order.event))


def payment_failed(db: Session, email: str, event: Event, code: str, language: str) -> None:
    compose(db, email, "payment_failed", language, reason=messages.phrase(code, language), **_event_values(event))


def order_refunded(db: Session, order: Order, refund: Refund) -> None:
    compose(db, order.buyer_email, "order_refunded", order.language, order=order.order_number,
            amount=kzt(refund.amount), reason=refund.reason, **_event_values(order.event))


def order_cancelled(db: Session, order: Order, reason: str) -> None:
    compose(db, order.buyer_email, "order_cancelled", order.language, order=order.order_number,
            reason=reason, **_event_values(order.event))


# ------------------------------------------------------------------ events

def event_updated(db: Session, event: Event) -> None:
    for email, language in ticket_holders(db, event).items():
        compose(db, email, "event_updated", language, link=_link(f"/events/{event.id}"), **_event_values(event))


def event_cancelled(db: Session, event: Event, reason: str) -> None:
    for email, language in ticket_holders(db, event).items():
        policy = messages.phrase("refund_policy", language, policy=event.refund_policy) if event.refund_policy else ""
        compose(db, email, "event_cancelled", language, reason=reason, policy=policy, **_event_values(event))


def organizer_notice(db: Session, event: Event, kind: str, reason: str) -> None:
    """kind: event_suspended | paid_sales_suspended."""
    compose(db, event.organizer.contact_email, kind, event.organizer.user.language, reason=reason,
            **_event_values(event))


# ------------------------------------------------------------------ support (§4.13)

def support(db: Session, emails: set[str], case: SupportCase, kind: str, **values) -> None:
    for email in emails:
        language = language_of(db, email)
        if "status" in values:
            values = values | {"status": messages.phrase(case.status, language)}
        compose(db, email, kind, language, subject=case.subject, link=_link(f"/support/{case.id}"), **values)
