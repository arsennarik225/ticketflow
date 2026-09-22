"""Checkout (§4.4, §4.6): holds, free and paid orders, simulated payments, idempotency."""
import threading
from concurrent.futures import ThreadPoolExecutor

from app.database import SessionLocal
from app.errors import ApiError
from app.schemas import AttendeeIn, CheckoutIn, CheckoutItemIn
from app.services import checkout
from tests.helpers import (
    admin, buy, confirm, emails_to, event, expire_holds, guests, in_days, on_sale, organizer, start_checkout,
    ticket_type, user,
)


def test_free_registration_needs_no_payment(api):
    token = organizer(api)
    show, kind = on_sale(api, token)
    ann = user(api, "ann@example.com", "Ann")
    session = start_checkout(api, show["id"], [(kind["id"], 2)], token=ann).json()
    assert session["requiresPayment"] is False and session["total"]["amount"] == 0 and session["status"] == "open"
    order = confirm(api, session["id"], token=ann, pay=None).json()
    assert order["total"]["amount"] == 0 and "payment" not in order
    assert [t["status"] for t in order["tickets"]] == ["valid", "valid"]
    assert order["tickets"][0]["attendee"]["fullName"] == "Ann"
    assert emails_to("ann@example.com")[-1].kind == "order_confirmed"
    assert api.get(f"/v1/organizer/events/{show['id']}/attendees", token=token).json()["total"] == 2


def test_paid_checkout_is_simulated(api):
    token = organizer(api)
    show, kind = on_sale(api, token, price=500000)
    order = buy(api, show["id"], kind["id"], 2)
    assert order["subtotal"]["amount"] == 1000000 and order["total"]["amount"] == 1000000
    assert order["processingFee"]["amount"] == 0  # the organizer pays the fee by default
    payment = order["payment"]
    assert payment["simulated"] is True and payment["status"] == "succeeded" and payment["fee"]["amount"] == 25000


def test_attendee_pays_the_fee_when_configured(api):
    api.patch("/v1/admin/settings", token=admin(api), json={"processingFeePaidBy": "attendee"})
    token = organizer(api)
    show, kind = on_sale(api, token, price=500000)
    session = start_checkout(api, show["id"], [(kind["id"], 1)], attendees=guests(1)).json()
    assert session["processingFee"]["amount"] == 12500 and session["total"]["amount"] == 512500


def test_declined_payment_issues_nothing_and_can_be_retried(api):
    token = organizer(api)
    show, kind = on_sale(api, token, price=500000)
    session = start_checkout(api, show["id"], [(kind["id"], 1)],
                             attendees=[{"fullName": "Ann", "email": "ann@example.com"}]).json()
    declined = confirm(api, session["id"], pay="tok_declined")
    assert declined.status_code == 402 and declined.json()["error"]["code"] == "payment_declined"
    assert api.get(f"/v1/organizer/events/{show['id']}/attendees", token=token).json()["total"] == 0
    assert emails_to("ann@example.com")[-1].kind == "payment_failed"
    failed = api.get("/v1/admin/payments", token=admin(api), params={"status": "failed"}).json()["data"]
    assert len(failed) == 1 and failed[0]["failureCode"] == "payment_declined" and "orderId" not in failed[0]
    missing = confirm(api, session["id"], pay=None)
    assert missing.status_code == 422 and missing.json()["error"]["code"] == "payment_method_required"
    assert confirm(api, session["id"], pay="tok_success").status_code == 201


def test_confirm_is_idempotent(api):
    token = organizer(api)
    show, kind = on_sale(api, token, price=100000)
    session = start_checkout(api, show["id"], [(kind["id"], 1)], attendees=guests(1)).json()
    first = confirm(api, session["id"], key="key-1")
    repeat = confirm(api, session["id"], key="key-1")
    assert repeat.status_code == 201 and repeat.json()["id"] == first.json()["id"]
    other = confirm(api, session["id"], key="key-2")
    assert other.status_code == 409 and other.json()["error"]["code"] == "checkout_already_confirmed"
    assert api.get(f"/v1/organizer/events/{show['id']}/orders", token=token).json()["total"] == 1
    no_key = api.post(f"/v1/checkout/sessions/{session['id']}/confirm", json={})
    assert no_key.status_code == 422


def test_hold_blocks_others_until_it_expires(api):
    token = organizer(api)
    show, kind = on_sale(api, token, quantity=2)
    first = start_checkout(api, show["id"], [(kind["id"], 2)], attendees=guests(2)).json()
    assert api.get(f"/v1/organizer/events/{show['id']}/ticket-types", token=token).json()["data"][0]["held"] == 2
    blocked = start_checkout(api, show["id"], [(kind["id"], 1)], attendees=guests(1))
    assert blocked.status_code == 409 and blocked.json()["error"]["code"] == "sold_out"
    expire_holds()
    assert api.get(f"/v1/checkout/sessions/{first['id']}").status_code == 410
    assert confirm(api, first["id"]).json()["error"]["code"] == "checkout_expired"
    assert start_checkout(api, show["id"], [(kind["id"], 1)], attendees=guests(1)).status_code == 201


def test_abandoning_releases_the_hold(api):
    token = organizer(api)
    show, kind = on_sale(api, token, quantity=1)
    session = start_checkout(api, show["id"], [(kind["id"], 1)], attendees=guests(1)).json()
    assert api.delete(f"/v1/checkout/sessions/{session['id']}").status_code == 204
    assert api.get(f"/v1/checkout/sessions/{session['id']}").json()["error"]["code"] == "checkout_abandoned"
    again = start_checkout(api, show["id"], [(kind["id"], 1)], attendees=guests(1)).json()
    confirm(api, again["id"])
    assert api.delete(f"/v1/checkout/sessions/{again['id']}").status_code == 409


def test_two_buyers_cannot_take_the_last_ticket(api):
    token = organizer(api)
    show, kind = on_sale(api, token, quantity=1)
    start_line = threading.Barrier(2)

    def attempt(n: int) -> str:
        body = CheckoutIn(event_id=show["id"], items=[CheckoutItemIn(ticket_type_id=kind["id"], quantity=1)],
                          attendees=[AttendeeIn(full_name=f"Buyer {n}", email=f"buyer{n}@example.com")])
        with SessionLocal() as db:
            start_line.wait()
            try:
                checkout.open_session(db, body, None)
                db.commit()
                return "held"
            except ApiError as error:
                return error.code

    with ThreadPoolExecutor(2) as pool:
        assert sorted(pool.map(attempt, range(2))) == ["held", "sold_out"]


def test_capacity_covers_all_ticket_types(api):
    token = organizer(api)
    show = event(api, token, capacity=3)
    first = ticket_type(api, token, show["id"], quantity=5)
    second = ticket_type(api, token, show["id"], name="Second", quantity=5)
    api.post(f"/v1/organizer/events/{show['id']}/publish", token=token)
    buy(api, show["id"], first["id"], 2)
    full = start_checkout(api, show["id"], [(second["id"], 2)], attendees=guests(2))
    assert full.status_code == 409 and full.json()["error"]["code"] == "sold_out"
    assert start_checkout(api, show["id"], [(second["id"], 1)], attendees=guests(1)).status_code == 201


def test_order_rules(api):
    token = organizer(api)
    show = event(api, token)
    limited = ticket_type(api, token, show["id"], maxPerOrder=2)
    later = ticket_type(api, token, show["id"], name="Later", salesStartAt=in_days(3))
    api.post(f"/v1/organizer/events/{show['id']}/publish", token=token)
    cases = [
        ([(limited["id"], 3)], {"attendees": guests(3)}, "max_per_order_exceeded"),
        ([(later["id"], 1)], {"attendees": guests(1)}, "sales_not_started"),
        ([(limited["id"], 1)], {}, "attendees_required"),
        ([(limited["id"], 2)], {"attendees": guests(1)}, "attendee_count_mismatch"),
        ([("5c8f5a52-0000-4000-8000-000000000000", 1)], {"attendees": guests(1)}, "unknown_ticket_type"),
    ]
    for lines, extra, code in cases:
        assert start_checkout(api, show["id"], lines, **extra).json()["error"]["code"] == code, code


def test_registration_window(api):
    token = organizer(api)
    show, kind = on_sale(api, token, registrationClosesAt=in_days(-1))
    closed = start_checkout(api, show["id"], [(kind["id"], 1)], attendees=guests(1))
    assert closed.status_code == 409 and closed.json()["error"]["code"] == "registration_closed"


def test_guest_checkout_can_be_turned_off(api):
    api.patch("/v1/admin/settings", token=admin(api), json={"guestCheckoutEnabled": False})
    token = organizer(api)
    show, kind = on_sale(api, token)
    guest = start_checkout(api, show["id"], [(kind["id"], 1)], attendees=guests(1))
    assert guest.status_code == 401 and guest.json()["error"]["code"] == "sign_in_required"
    assert start_checkout(api, show["id"], [(kind["id"], 1)], token=user(api, "a@example.com")).status_code == 201


def test_guest_order_appears_after_signing_up(api):
    token = organizer(api)
    show, kind = on_sale(api, token)
    order = buy(api, show["id"], kind["id"], attendees=[{"fullName": "Ann", "email": "ann@example.com"}])
    ann = user(api, "ann@example.com")
    assert api.get("/v1/me/orders", token=ann).json()["total"] == 1
    assert api.get(f"/v1/me/tickets/{order['tickets'][0]['id']}", token=ann).status_code == 200
    stranger = user(api, "x@example.com")
    assert api.get(f"/v1/me/tickets/{order['tickets'][0]['id']}", token=stranger).status_code == 404


def test_checkout_session_belongs_to_its_buyer(api):
    token = organizer(api)
    show, kind = on_sale(api, token)
    ann = user(api, "ann@example.com")
    session = start_checkout(api, show["id"], [(kind["id"], 1)], token=ann).json()
    assert api.get(f"/v1/checkout/sessions/{session['id']}", token=ann).status_code == 200
    assert api.get(f"/v1/checkout/sessions/{session['id']}").status_code == 404
    assert api.get(f"/v1/checkout/sessions/{session['id']}", token=user(api, "b@example.com")).status_code == 404
