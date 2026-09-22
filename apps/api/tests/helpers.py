"""Small building blocks for tests: users, events, purchases. Each goes through the API."""
import re
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select, update

from app.database import SessionLocal
from app.models import CheckoutSession, Notification

PASSWORD = "password123"


def iso(moment: datetime) -> str:
    return moment.astimezone(UTC).isoformat().replace("+00:00", "Z")


def in_days(days: float) -> str:
    return iso(datetime.now(UTC) + timedelta(days=days))


def emails_to(address: str) -> list[Notification]:
    with SessionLocal() as db:
        return list(db.scalars(select(Notification).where(Notification.email == address.lower())
                               .order_by(Notification.created_at)))


def link_token(address: str, path: str) -> str:
    """The token from the newest email to `address` that links to `path`."""
    for note in reversed(emails_to(address)):
        if match := re.search(rf"{path}\?token=([\w-]+)", note.body):
            return match.group(1)
    raise AssertionError(f"no {path} email to {address}")


def user(api, email: str, name: str = "Test User", verified: bool = True) -> str:
    """Registers (and by default verifies) a user; returns an access token."""
    assert api.post("/v1/auth/register", json={"email": email, "password": PASSWORD, "fullName": name}).status_code == 201
    if verified:
        response = api.post("/v1/auth/verify-email", json={"token": link_token(email, "/verify-email")})
        assert response.status_code == 200
        return response.json()["accessToken"]
    return login(api, email)


def login(api, email: str) -> str:
    response = api.post("/v1/auth/login", json={"email": email, "password": PASSWORD})
    assert response.status_code == 200, response.text
    return response.json()["accessToken"]


def organizer(api, email: str = "org@example.com") -> str:
    """A verified organizer with identity verified and a payout account connected."""
    token = user(api, email, "Olga Organizer")
    assert api.put("/v1/me/organizer-profile", token=token,
                   json={"displayName": "Olga Events", "contactEmail": email}).status_code == 200
    assert api.post("/v1/me/identity-verification", token=token, json={"legalName": "Olga Events LLP"}).status_code == 202
    assert api.put("/v1/me/payout-account", token=token,
                   json={"accountHolderName": "Olga Events LLP", "sandboxAccountToken": "acct_sandbox_1234"}).status_code == 200
    return token


def admin(api, email: str = "admin@example.com") -> str:
    token = user(api, email, "Adam Admin")
    with SessionLocal() as db:
        from app.models import User
        db.execute(update(User).where(User.email == email).values(is_platform_admin=True))
        db.commit()
    return token


def event(api, token: str, **fields) -> dict:
    body = {"title": "Test Concert", "venueName": "Main Hall", "city": "Almaty", "timeZone": "Asia/Almaty",
            "startsAt": in_days(30), "endsAt": in_days(30.125)} | fields
    response = api.post("/v1/organizer/events", token=token, json=body)
    assert response.status_code == 201, response.text
    return response.json()


def ticket_type(api, token: str, event_id: str, price: int = 0, quantity: int = 100, **fields) -> dict:
    body = {"name": "General", "price": {"amount": price, "currency": "KZT"}, "quantity": quantity} | fields
    response = api.post(f"/v1/organizer/events/{event_id}/ticket-types", token=token, json=body)
    assert response.status_code == 201, response.text
    return response.json()


def activate(api, token: str, event_id: str) -> None:
    assert api.post(f"/v1/organizer/events/{event_id}/activation/pay-fee", token=token).status_code == 200
    response = api.post(f"/v1/organizer/events/{event_id}/activation/accept-terms", token=token,
                        json={"termsVersion": "2026-09"})
    assert response.json()["active"] is True, response.json()


def on_sale(api, token: str, price: int = 0, quantity: int = 100, **event_fields) -> tuple[dict, dict]:
    """A published event with one ticket type; paid events are activated first."""
    created = event(api, token, **event_fields)
    kind = ticket_type(api, token, created["id"], price=price, quantity=quantity)
    if price:
        activate(api, token, created["id"])
    assert api.post(f"/v1/organizer/events/{created['id']}/publish", token=token).status_code == 200
    return created, kind


def start_checkout(api, event_id: str, lines: list[tuple[str, int]], token: str | None = None, **extra):
    body = {"eventId": event_id, "items": [{"ticketTypeId": t, "quantity": q} for t, q in lines]} | extra
    return api.post("/v1/checkout/sessions", token=token, json=body)


def confirm(api, session_id: str, token: str | None = None, pay: str | None = "tok_success",
            key: str | None = None, **extra):
    body = ({"paymentMethodToken": pay} if pay else {}) | extra
    return api.post(f"/v1/checkout/sessions/{session_id}/confirm", token=token, json=body,
                    headers={"Idempotency-Key": key or str(uuid.uuid4())})


def guests(count: int) -> list[dict]:
    return [{"fullName": f"Guest {i}", "email": f"guest{i}@example.com"} for i in range(count)]


def buy(api, event_id: str, ticket_type_id: str, quantity: int = 1, token: str | None = None, **extra) -> dict:
    """Checkout + confirm in one go; returns the order."""
    if token is None:
        extra.setdefault("attendees", guests(quantity))
    session = start_checkout(api, event_id, [(ticket_type_id, quantity)], token=token, **extra)
    assert session.status_code == 201, session.text
    response = confirm(api, session.json()["id"], token=token)
    assert response.status_code == 201, response.text
    return response.json()


def expire_holds() -> None:
    """Pretend the hold time has passed for every open checkout."""
    with SessionLocal() as db:
        db.execute(update(CheckoutSession).where(CheckoutSession.status == "open")
                   .values(expires_at=datetime.now(UTC) - timedelta(seconds=1)))
        db.commit()


def campaign(api, token: str, event_id: str, **fields) -> dict:
    body = {"name": "Spring", "discountType": "percentage", "percentOff": 20} | fields
    response = api.post(f"/v1/organizer/events/{event_id}/campaigns", token=token, json=body)
    assert response.status_code == 201, response.text
    return response.json()


def campaign_token(api, token: str, event_id: str, **fields) -> str:
    """The opaque token from a new campaign's QR link."""
    return campaign(api, token, event_id, **fields)["campaignUrl"].split("campaign=")[1]
