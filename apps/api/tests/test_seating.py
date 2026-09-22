"""Assigned seating (§4.3.1, bonus): the predefined layout, seat maps, holds, and seat-aware
checkout. A seat can be sold once, even when two buyers race for it."""
import threading
from concurrent.futures import ThreadPoolExecutor

from app.database import SessionLocal
from app.errors import ApiError
from app.schemas import AttendeeIn, CheckoutIn
from app.services import checkout
from tests.helpers import (
    activate, confirm, emails_to, event, expire_holds, guests, organizer, start_checkout, ticket_type, user,
)


def hall(api) -> dict:
    return api.get(f"/v1/venues/{api.get('/v1/venues').json()['data'][0]['id']}").json()


def seat(layout: dict, section: str, row: str, number: int) -> str:
    part = next(s for s in layout["sections"] if s["name"] == section)
    return next(x["id"] for r in part["rows"] if r["label"] == row for x in r["seats"] if x["number"] == number)


def seated_event(api, token, blocked=(), paid=False):
    """A published event in BiletFlow Hall; premium and standard are priced, balcony is not."""
    layout = hall(api)
    show = event(api, token)
    configured = api.put(f"/v1/organizer/events/{show['id']}/seating", token=token,
                         json={"venueId": layout["id"], "blockedSeatIds": [seat(layout, *b) for b in blocked]})
    assert configured.status_code == 200, configured.text
    price = 800000 if paid else 0
    ticket_type(api, token, show["id"], name="Premium", price=price, quantity=42, seatCategory="premium")
    ticket_type(api, token, show["id"], name="Standard", price=price // 2, quantity=70, seatCategory="standard")
    if paid:
        activate(api, token, show["id"])
    api.post(f"/v1/organizer/events/{show['id']}/publish", token=token)
    return show, layout


def status_of(api, event_id, seat_id):
    seat_map = api.get(f"/v1/events/{event_id}/seats").json()
    return next(s for sec in seat_map["sections"] for r in sec["rows"] for s in r["seats"] if s["id"] == seat_id)


def test_predefined_layout(api):
    venues = api.get("/v1/venues").json()["data"]
    assert [(v["name"], v["seatCount"]) for v in venues] == [("BiletFlow Hall", 160)]
    categories = {c["priceCategory"]: (c["seats"], c["accessible"]) for c in venues[0]["priceCategories"]}
    assert categories == {"balcony": (48, 0), "premium": (42, 0), "standard": (70, 4)}
    layout = hall(api)
    assert [s["name"] for s in layout["sections"]] == ["Parterre", "Balcony"]
    assert [r["label"] for r in layout["sections"][0]["rows"]] == list("ABCDEFGH")


def test_configuring_seating(api):
    token = organizer(api)
    show, layout = seated_event(api, token, blocked=[("Parterre", "A", 1)])
    detail = api.get(f"/v1/organizer/events/{show['id']}", token=token).json()
    assert detail["venueId"] == layout["id"] and detail["venueName"] == "BiletFlow Hall" and detail["city"] == "Almaty"
    assert status_of(api, show["id"], seat(layout, "Parterre", "A", 1))["status"] == "unavailable"  # blocked
    assert status_of(api, show["id"], seat(layout, "Balcony", "A", 1))["status"] == "unavailable"   # no price
    available = status_of(api, show["id"], seat(layout, "Parterre", "A", 2))
    assert available["status"] == "available" and available["price"]["amount"] == 0
    history = api.get(f"/v1/organizer/events/{show['id']}/history", token=token, params={"action": "event.seating"})
    assert "1 seat(s) blocked" in history.json()["data"][0]["description"]


def test_seat_categories_are_checked(api):
    token = organizer(api)
    show, _ = seated_event(api, token)
    general = ticket_type(api, token, show["id"], name="Standing")  # no seatCategory: not sellable here
    assert general["onSale"] is False
    unknown = api.post(f"/v1/organizer/events/{show['id']}/ticket-types", token=token,
                       json={"name": "X", "price": {"amount": 0, "currency": "KZT"}, "quantity": 5, "seatCategory": "vip"})
    assert unknown.status_code == 422 and unknown.json()["error"]["code"] == "unknown_seat_category"
    twice = api.post(f"/v1/organizer/events/{show['id']}/ticket-types", token=token,
                     json={"name": "Y", "price": {"amount": 0, "currency": "KZT"}, "quantity": 5, "seatCategory": "premium"})
    assert twice.status_code == 409 and twice.json()["error"]["code"] == "duplicate_seat_category"


def test_buying_seats(api):
    token = organizer(api)
    show, layout = seated_event(api, token, paid=True)
    a2, d5 = seat(layout, "Parterre", "A", 2), seat(layout, "Parterre", "D", 5)
    session = start_checkout(api, show["id"], [], seatIds=[a2, d5],
                             attendees=[{"fullName": "Ann", "email": "ann@example.com"},
                                        {"fullName": "Bob", "email": "bob@example.com"}]).json()
    assert session["total"]["amount"] == 800000 + 400000
    assert status_of(api, show["id"], a2)["status"] == "held"
    order = confirm(api, session["id"]).json()
    seats = {t["attendee"]["fullName"]: t["seat"] for t in order["tickets"]}
    assert seats == {"Ann": {"section": "Parterre", "row": "A", "number": 2, "accessible": False},
                     "Bob": {"section": "Parterre", "row": "D", "number": 5, "accessible": False}}
    assert status_of(api, show["id"], a2)["status"] == "sold"
    people = api.get(f"/v1/organizer/events/{show['id']}/attendees", token=token).json()["data"]
    assert {p["seatLabel"] for p in people} == {"Parterre A2", "Parterre D5"}


def test_seat_rules(api):
    token = organizer(api)
    show, layout = seated_event(api, token, blocked=[("Parterre", "B", 1)])
    free_seat = seat(layout, "Parterre", "C", 3)
    first = start_checkout(api, show["id"], [], seatIds=[free_seat], attendees=guests(1))
    assert first.status_code == 201
    cases = [
        ({"seatIds": [free_seat]}, 409, "seat_taken"),
        ({"seatIds": [seat(layout, "Parterre", "B", 1)]}, 409, "seat_unavailable"),
        ({"seatIds": [seat(layout, "Balcony", "A", 1)]}, 409, "seat_unavailable"),
        ({"seatIds": ["5c8f5a52-0000-4000-8000-000000000000"]}, 422, "unknown_seat"),
        ({"seatIds": [seat(layout, "Parterre", "C", 4)] * 2}, 422, "duplicate_seat"),
    ]
    for extra, status, code in cases:
        response = start_checkout(api, show["id"], [], attendees=guests(len(extra["seatIds"])), **extra)
        assert (response.status_code, response.json()["error"]["code"]) == (status, code), code
    kind = api.get(f"/v1/organizer/events/{show['id']}/ticket-types", token=token).json()["data"][0]
    items_instead = start_checkout(api, show["id"], [(kind["id"], 1)], attendees=guests(1))
    assert items_instead.json()["error"]["code"] == "seat_selection_required"


def test_general_admission_rejects_seats(api):
    token = organizer(api)
    show = event(api, token)
    ticket_type(api, token, show["id"])
    api.post(f"/v1/organizer/events/{show['id']}/publish", token=token)
    response = start_checkout(api, show["id"], [], seatIds=[seat(hall(api), "Parterre", "A", 1)], attendees=guests(1))
    assert response.status_code == 422 and response.json()["error"]["code"] == "not_a_seated_event"
    assert api.get(f"/v1/events/{show['id']}/seats").status_code == 404


def test_holds_expire_and_refunds_free_seats(api):
    token = organizer(api)
    show, layout = seated_event(api, token, paid=True)
    target = seat(layout, "Parterre", "E", 7)
    start_checkout(api, show["id"], [], seatIds=[target], attendees=guests(1))
    expire_holds()
    assert status_of(api, show["id"], target)["status"] == "available"
    session = start_checkout(api, show["id"], [], seatIds=[target], attendees=guests(1)).json()
    order = confirm(api, session["id"]).json()
    api.post(f"/v1/organizer/orders/{order['id']}/refund", token=token, json={"reason": "x"},
             headers={"Idempotency-Key": "r"})
    assert status_of(api, show["id"], target)["status"] == "available"


def test_two_buyers_cannot_get_the_same_seat(api):
    token = organizer(api)
    show, layout = seated_event(api, token)
    target = seat(layout, "Parterre", "F", 9)
    start_line = threading.Barrier(2)

    def attempt(n: int) -> str:
        body = CheckoutIn(event_id=show["id"], seat_ids=[target],
                          attendees=[AttendeeIn(full_name=f"B{n}", email=f"b{n}@example.com")])
        with SessionLocal() as db:
            start_line.wait()
            try:
                checkout.open_session(db, body, None)
                db.commit()
                return "held"
            except ApiError as error:
                return error.code

    with ThreadPoolExecutor(2) as pool:
        assert sorted(pool.map(attempt, range(2))) == ["held", "seat_taken"]


def test_seating_is_locked_after_sales_and_copied_by_duplicate(api):
    token = organizer(api)
    show, layout = seated_event(api, token, blocked=[("Parterre", "A", 1)])
    session = start_checkout(api, show["id"], [], seatIds=[seat(layout, "Parterre", "A", 5)], attendees=guests(1))
    busy = api.put(f"/v1/organizer/events/{show['id']}/seating", token=token, json={"venueId": None})
    assert busy.status_code == 409 and busy.json()["error"]["code"] == "checkout_in_progress"
    confirm(api, session.json()["id"])
    sold = api.put(f"/v1/organizer/events/{show['id']}/seating", token=token, json={"venueId": None})
    assert sold.json()["error"]["code"] == "event_has_orders"
    copy = api.post(f"/v1/organizer/events/{show['id']}/duplicate", token=token).json()
    assert copy["venueId"] == layout["id"]
    assert {t["seatCategory"] for t in copy["ticketTypes"]} == {"premium", "standard"}
    preview = api.get(f"/v1/organizer/events/{copy['id']}/seats", token=token).json()  # draft preview
    a1 = next(s for r in preview["sections"][0]["rows"] if r["label"] == "A" for s in r["seats"] if s["number"] == 1)
    assert a1["status"] == "unavailable"


def test_turning_seating_off(api):
    token = organizer(api)
    show = event(api, token)
    layout = hall(api)
    api.put(f"/v1/organizer/events/{show['id']}/seating", token=token, json={"venueId": layout["id"]})
    off = api.put(f"/v1/organizer/events/{show['id']}/seating", token=token, json={"venueId": None}).json()
    assert "venueId" not in off
    bad = api.put(f"/v1/organizer/events/{show['id']}/seating", token=token, json={"venueId": "nope"})
    assert bad.status_code == 422 and bad.json()["error"]["code"] == "unknown_venue"


def test_seat_is_printed_and_shown_to_the_scanner(api):
    token = organizer(api)
    show, layout = seated_event(api, token)
    accessible = seat(layout, "Parterre", "H", 1)
    ann = user(api, "ann@example.com", "Ann")
    session = start_checkout(api, show["id"], [], token=ann, seatIds=[accessible]).json()
    ticket = confirm(api, session["id"], token=ann).json()["tickets"][0]
    assert ticket["seat"]["accessible"] is True
    scanned = api.post(f"/v1/checkin/events/{show['id']}/verify", token=token, json={"qrPayload": ticket["qrPayload"]})
    assert scanned.json()["ticket"]["seat"] == {"section": "Parterre", "row": "H", "number": 1, "accessible": True}
    assert "Parterre, ряд H, место 1" in emails_to("ann@example.com")[-1].body  # default language ru
    assert api.get(f"/v1/me/tickets/{ticket['id']}/pdf", token=ann).status_code == 200
