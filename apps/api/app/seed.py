"""Demo data for local development and the demo (loaded when SEED_DEMO_DATA=true and the
database has no users). Dates are relative to today, so the demo stays current.

Accounts (password for all: demo12345):
  admin@biletflow.kz      Platform Admin (emails in English)
  organizer@biletflow.kz  Organizer "Steppe Events", verified, payout connected (Russian)
  staff@biletflow.kz      Event Admin for the scanner app (Russian)
  attendee@biletflow.kz   Attendee with orders, seats, and a support case (Kazakh)
"""
import secrets
from datetime import timedelta
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import (
    Campaign, CheckIn, Event, Order, OrganizerProfile, Payment, PayoutAccount, StaffAssignment,
    SupportCase, SupportMessage, TicketType, User, Venue, utcnow,
)
from app.schemas import AttendeeIn, CheckoutIn, CheckoutItemIn, ConfirmIn
from app.security import hash_password
from app.services import audit, checkout, orders
from app.services.events import platform_settings
from app.services.seating import load_venue, seats_of

PASSWORD = "demo12345"


def seed_if_empty() -> None:
    with SessionLocal() as db:
        if db.scalar(select(func.count()).select_from(User)):
            return
        seed(db)
        db.commit()
    print("Demo data loaded. Accounts: admin@ / organizer@ / staff@ / attendee@biletflow.kz, "
          f"password {PASSWORD}")


def seed(db: Session) -> None:
    today = utcnow().replace(hour=14, minute=0, second=0, microsecond=0)  # 19:00 in Almaty
    config = platform_settings(db)

    def person(email: str, name: str, language: str, admin: bool = False) -> User:
        user = User(email=email, password_hash=hash_password(PASSWORD), full_name=name, language=language,
                    email_verified=True, is_platform_admin=admin)
        db.add(user)
        return user

    person("admin@biletflow.kz", "Platform Admin", "en", admin=True)
    organizer = person("organizer@biletflow.kz", "Aigerim Sadykova", "ru")
    staff = person("staff@biletflow.kz", "Nurlan Abenov", "ru")
    attendee = person("attendee@biletflow.kz", "Dana Karimova", "kk")
    db.flush()
    db.add(OrganizerProfile(
        user_id=organizer.id, display_name="Steppe Events", description="Concerts and meetups across Kazakhstan.",
        contact_email=organizer.email, contact_phone="+7 700 000 0000", identity_status="verified",
        identity_legal_name="Steppe Events LLP", identity_document_type="business_registration",
        identity_verified_at=today,
    ))
    db.flush()
    db.add(PayoutAccount(user_id=organizer.id, account_holder_name="Steppe Events LLP",
                         masked_account="****4242", status="connected"))

    def event(title: str, days: int, **fields) -> Event:
        fields = {"status": "published", "published_at": today, **fields}
        item = Event(organizer_id=organizer.id, title=title, time_zone="Asia/Almaty",
                     starts_at=today + timedelta(days=days), ends_at=today + timedelta(days=days, hours=3), **fields)
        db.add(item)
        db.flush()
        audit.record(db, "event.created", f"Created draft “{title}”", entity_type="event", entity_id=item.id,
                     event_id=item.id, actor=organizer)
        if item.status == "published":
            audit.record(db, "event.published", f"Published “{title}”", entity_type="event", entity_id=item.id,
                         event_id=item.id, actor=organizer)
        return item

    free = TicketType(name="Free admission", price=0, quantity=120, max_per_order=4)
    meetup = event("Almaty Tech Meetup", 7, category="Technology", venue_name="Hub Almaty",
                   address="Abay Ave 10", city="Almaty", capacity=120, ticket_types=[free],
                   description="Lightning talks from local developers, then pizza.")
    standard = TicketType(name="Standard", price=500000, quantity=150, max_per_order=6)
    vip = TicketType(name="VIP", price=1500000, quantity=30, max_per_order=2, description="Front rows and a drink.")
    jazz = event("Astana Jazz Night", 14, category="Music", venue_name="Astana Concert Hall",
                 address="Mangilik El Ave 1", city="Astana", ticket_types=[standard, vip],
                 refund_policy="Full refund up to 48 hours before the concert.",
                 terms_version=config.terms_version, terms_accepted_at=today,
                 description="An evening of Kazakh and international jazz.")
    event("Ural Film Festival", 30, status="draft", published_at=None, category="Film",
          venue_name="Cinema Park", city="Oral", description="Draft: paid-sales activation not finished yet.",
          ticket_types=[TicketType(name="Festival pass", price=800000, quantity=200)])
    pitch_free = TicketType(name="Guest", price=0, quantity=80)
    pitch = event("Shymkent Startup Pitch", 3, category="Business", venue_name="Tech Garden",
                  city="Shymkent", ticket_types=[pitch_free], description="Ten startups, five minutes each.")

    # Assigned seating in the predefined layout; two seats are kept for cameras.
    hall = load_venue(db, db.scalar(select(Venue.id).where(Venue.name == "BiletFlow Hall")))
    seat = {f"{s.row.section.name} {s.row.label}{s.number}": s for s in seats_of(hall)}
    gala = event("Almaty Philharmonic Gala", 21, category="Music", venue_name=hall.name, address=hall.address,
                 city=hall.city, venue_id=hall.id, blocked_seats=[seat["Parterre A1"], seat["Parterre A14"]],
                 terms_version=config.terms_version, terms_accepted_at=today,
                 description="Seated concert: pick your seat on the map.",
                 ticket_types=[TicketType(name="Premium", price=1200000, quantity=42, seat_category="premium"),
                               TicketType(name="Standard", price=600000, quantity=70, seat_category="standard"),
                               TicketType(name="Balcony", price=300000, quantity=48, seat_category="balcony")])

    for paid_event in (jazz, gala):
        db.add(Payment(purpose="activation_fee", status="succeeded", amount=config.activation_fee,
                       payer_user_id=organizer.id, event_id=paid_event.id))
    campaign = Campaign(event_id=jazz.id, name="Early birds", code="JAZZ-EARLY", token=secrets.token_urlsafe(16),
                        discount_type="percentage", percent_off=Decimal("20"), max_redemptions=50,
                        valid_until=jazz.starts_at)
    db.add(campaign)
    for item, can_reverse in ((meetup, True), (jazz, True), (pitch, False), (gala, True)):
        db.add(StaffAssignment(event_id=item.id, email=staff.email, can_reverse_check_in=can_reverse))
    db.flush()

    # Sales go through the real checkout code, so totals, payments, and emails are consistent.
    def buy(item: Event, lines=(), buyer: User | None = None, guests=(), campaign_token=None, seats=()) -> Order:
        body = CheckoutIn(
            event_id=str(item.id),
            items=[CheckoutItemIn(ticket_type_id=str(t.id), quantity=n) for t, n in lines],
            seat_ids=[str(seat[label].id) for label in seats],
            attendees=[AttendeeIn(full_name=name, email=email) for name, email in guests] or None,
            campaign_token=campaign_token,
        )
        session = checkout.open_session(db, body, buyer)
        return checkout.confirm(db, str(session.id), buyer, f"seed-{session.id}",
                                ConfirmIn(payment_method_token="tok_success"))

    buy(meetup, [(free, 1)], attendee)
    buy(meetup, [(free, 2)], guests=[("Timur Akhmetov", "timur@example.com"), ("Aliya Bekova", "aliya@example.com")])
    jazz_order = buy(jazz, [(standard, 2)], attendee, campaign_token=campaign.token)
    buy(jazz, [(vip, 1)], guests=[("Yerlan Dzhaksybekov", "yerlan@example.com")])
    refunded = buy(jazz, [(standard, 1)], guests=[("Madina Ospanova", "madina@example.com")])
    orders.refund(db, refunded, "Cannot attend", "seed-refund", organizer)
    buy(gala, buyer=attendee, seats=["Parterre C7", "Parterre C8"],
        guests=[("Dana Karimova", attendee.email), ("Arman Karimov", "arman@example.com")])
    buy(gala, seats=["Balcony A5"], guests=[("Olga Petrova", "olga@example.com")])

    # A finished event with attendance, for the history and analytics screens.
    pitch_order = buy(pitch, [(pitch_free, 3)], guests=[("Asel Nurova", "asel@example.com"),
                                                        ("Bolat Serikov", "bolat@example.com"),
                                                        ("Gulnaz Omarova", "gulnaz@example.com")])
    for ticket in pitch_order.tickets[:2]:
        ticket.status = "checked_in"
        db.add(CheckIn(ticket_id=ticket.id, event_id=pitch.id, checked_in_by_user_id=staff.id, method="qr",
                       checked_in_at=today - timedelta(days=10, hours=-1)))
    pitch.starts_at, pitch.ends_at = today - timedelta(days=10), today - timedelta(days=10, hours=-3)
    pitch_order.created_at = today - timedelta(days=15)

    db.add(SupportCase(
        requester_id=attendee.id, handled_by="organizer", category="event_information",
        subject="Is there parking at the venue?", status="waiting_for_customer", event_id=jazz.id,
        order_id=jazz_order.id,
        messages=[SupportMessage(author_id=attendee.id, body="Hi! Is there parking near Astana Concert Hall?"),
                  SupportMessage(author_id=organizer.id, body="Yes, free parking behind the hall. Anything else?")],
    ))


if __name__ == "__main__":
    seed_if_empty()
