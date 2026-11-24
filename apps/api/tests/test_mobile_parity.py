"""API support for the native attendee, administration and calendar screens."""
from tests.helpers import (admin, buy, campaign_token, confirm, event, guests, on_sale,
                           organizer, start_checkout, ticket_type, user)
from app.services.analytics import allocate


def test_ticket_list_includes_recipient_but_never_the_other_attendees(api):
    owner = organizer(api)
    show, kind = on_sale(api, owner)
    buyer = user(api, "buyer@example.com")
    recipient = user(api, "recipient@example.com")
    stranger = user(api, "stranger@example.com")
    buy(api, show["id"], kind["id"], 2, token=buyer, attendees=[
        {"fullName": "Recipient", "email": "recipient@example.com"},
        {"fullName": "Other", "email": "other@example.com"}])
    assert api.get("/v1/me/tickets").status_code == 401
    assert api.get("/v1/me/tickets", token=buyer).json()["total"] == 2
    own = api.get("/v1/me/tickets", token=recipient).json()
    assert own["total"] == 1 and own["data"][0]["attendee"]["email"] == "recipient@example.com"
    assert api.get("/v1/me/orders", token=recipient).json()["total"] == 0
    assert api.get("/v1/me/tickets", token=stranger).json()["total"] == 0
    page = api.get("/v1/me/tickets", token=buyer, params={"pageSize": 1, "page": 2}).json()
    assert page["total"] == 2 and len(page["data"]) == 1
    assert api.get(f"/v1/me/tickets/{own['data'][0]['id']}/pdf", token=recipient).status_code == 200


def test_unverified_email_does_not_claim_recipient_tickets(api):
    owner = organizer(api)
    show, kind = on_sale(api, owner)
    buy(api, show["id"], kind["id"], attendees=[{"fullName": "Recipient", "email": "new@example.com"}])
    from tests.helpers import PASSWORD
    api.post("/v1/auth/register", json={"fullName": "New", "email": "new@example.com", "password": PASSWORD})
    token = api.post("/v1/auth/login", json={"email": "new@example.com", "password": PASSWORD}).json()["accessToken"]
    assert api.get("/v1/me/tickets", token=token).json()["total"] == 0


def test_payment_search_matches_order_payment_event_and_failure_without_wildcards(api):
    boss = admin(api)
    owner = organizer(api)
    show, kind = on_sale(api, owner, price=200000)
    order = buy(api, show["id"], kind["id"])
    for q in (order["orderNumber"], order["payment"]["id"], order["buyerEmail"]):
        data = api.get("/v1/admin/payments", token=boss, params={"q": q}).json()
        assert data["total"] == 1 and data["data"][0]["id"] == order["payment"]["id"]
    assert api.get("/v1/admin/payments", token=boss, params={"q": show["title"]}).json()["total"] == 2
    assert api.get("/v1/admin/payments", token=boss, params={"q": "%"}).json()["total"] == 0
    assert api.get("/v1/admin/payments", token=owner, params={"q": show["title"]}).status_code == 403
    assert api.get("/v1/admin/payments", token=boss, params={"q": order["orderNumber"], "status": "failed"}).json()["total"] == 0


def test_private_calendar_works_for_invited_guest_buyer_and_verified_attendee(api):
    owner = organizer(api)
    show, kind = on_sale(api, owner, visibility="private")
    invite = campaign_token(api, owner, show["id"])
    buyer = user(api, "buyer@example.com")
    recipient = user(api, "recipient@example.com")
    outsider = user(api, "outside@example.com")
    buy(api, show["id"], kind["id"], token=buyer, campaignToken=invite,
        attendees=[{"fullName": "Recipient", "email": "recipient@example.com"}])
    page = f"/v1/events/{show['id']}"
    calendar = page + "/calendar.ics"
    assert api.get(calendar, params={"campaignToken": invite}).status_code == 200
    for token in (buyer, recipient):
        assert api.get(page, token=token).status_code == 200
        assert "BEGIN:VCALENDAR" in api.get(calendar, token=token).text
    for token in (None, outsider):
        assert api.get(page, token=token).status_code == 404
        assert api.get(calendar, token=token).status_code == 404
    boss = admin(api)
    api.post(f"/v1/admin/events/{show['id']}/suspend", token=boss, json={"reason": "test"})
    assert api.get(calendar, token=buyer).status_code == 404


def test_ticket_type_finances_sum_exactly_and_campaigns_follow_the_filter(api):
    owner = organizer(api)
    show, first = on_sale(api, owner, price=101)
    second = ticket_type(api, owner, show["id"], name="VIP", price=203)
    invite = campaign_token(api, owner, show["id"])
    checkout = start_checkout(api, show["id"], [(first["id"], 1), (second["id"], 1)],
                              attendees=guests(2), campaignToken=invite).json()
    order = confirm(api, checkout["id"]).json()
    endpoint = f"/v1/organizer/events/{show['id']}/analytics"
    all_types = api.get(endpoint, token=owner).json()
    parts = [api.get(endpoint, token=owner, params={"ticketTypeId": kind["id"]}).json()
             for kind in (first, second)]
    for key in ("grossSales", "discounts", "refunds", "fees", "netRevenue", "estimatedPayout"):
        assert sum(p[key]["amount"] for p in parts) == all_types[key]["amount"], key
    assert parts[0]["campaigns"][0]["ticketsSold"] == parts[1]["campaigns"][0]["ticketsSold"] == 1
    assert parts[0]["campaigns"][0]["grossSales"]["amount"] == 101
    assert parts[1]["campaigns"][0]["grossSales"]["amount"] == 203
    api.post(f"/v1/organizer/orders/{order['id']}/refund", token=owner,
             json={"reason": "test"}, headers={"Idempotency-Key": "mobile-refund"})
    totals = api.get(endpoint, token=owner).json()
    parts = [api.get(endpoint, token=owner, params={"ticketTypeId": kind["id"]}).json()
             for kind in (first, second)]
    assert sum(p["refunds"]["amount"] for p in parts) == totals["refunds"]["amount"]
    assert all(p["netRevenue"]["amount"] == 0 for p in parts)
    assert all(p["campaigns"][0]["ticketsSold"] == 0 for p in parts)


def test_money_allocation_preserves_single_tiyin_and_zero_values(api):
    assert allocate(1, {"b": 1, "a": 1}) == {"b": 0, "a": 1}
    assert allocate(0, {"a": 0}) == {"a": 0}
    assert allocate(7, {"a": 1, "b": 2}) == {"a": 2, "b": 5}
