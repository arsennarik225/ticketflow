"""Platform administration (§4.5, §4.12)."""
from tests.helpers import (
    PASSWORD, activate, admin, buy, confirm, emails_to, event, guests, on_sale, organizer, start_checkout,
    ticket_type, user,
)


def test_admin_endpoints_need_a_platform_admin(api):
    assert api.get("/v1/admin/users").status_code == 401
    denied = api.get("/v1/admin/users", token=user(api, "a@example.com"))
    assert denied.status_code == 403 and denied.json()["error"]["code"] == "platform_admin_only"


def test_suspended_event_is_hidden_and_stops_sales(api):
    boss = admin(api)
    token = organizer(api)
    show, kind = on_sale(api, token)
    open_checkout = start_checkout(api, show["id"], [(kind["id"], 1)], attendees=guests(1)).json()
    suspended = api.post(f"/v1/admin/events/{show['id']}/suspend", token=boss, json={"reason": "Fraud"})
    assert suspended.json()["suspendedReason"] == "Fraud"
    assert api.get(f"/v1/events/{show['id']}").status_code == 404
    assert api.get("/v1/events").json()["total"] == 0
    assert confirm(api, open_checkout["id"]).json()["error"]["code"] == "event_suspended"
    assert emails_to("org@example.com")[-1].kind == "event_suspended"
    api.post(f"/v1/admin/events/{show['id']}/unsuspend", token=boss)
    assert api.get(f"/v1/events/{show['id']}").status_code == 200


def test_paid_sales_can_be_suspended_alone(api):
    boss = admin(api)
    token = organizer(api)
    show = event(api, token)
    paid = ticket_type(api, token, show["id"], price=100000)
    free = ticket_type(api, token, show["id"], name="Free")
    activate(api, token, show["id"])
    api.post(f"/v1/organizer/events/{show['id']}/publish", token=token)
    state = api.post(f"/v1/admin/events/{show['id']}/paid-sales/suspend", token=boss, json={"reason": "Check"}).json()
    assert state["active"] is False and state["suspendedReason"] == "Check"
    blocked = start_checkout(api, show["id"], [(paid["id"], 1)], attendees=guests(1))
    assert blocked.json()["error"]["code"] == "paid_sales_not_active"
    assert start_checkout(api, show["id"], [(free["id"], 1)], attendees=guests(1)).status_code == 201
    assert api.get(f"/v1/admin/events/{show['id']}/activation", token=boss).json()["active"] is False
    assert api.post(f"/v1/admin/events/{show['id']}/paid-sales/resume", token=boss).json()["active"] is True


def test_suspended_user_is_signed_out_and_blocked(api):
    boss = admin(api)
    ann = user(api, "ann@example.com")
    ann_id = api.get("/v1/me", token=ann).json()["id"]
    suspended = api.post(f"/v1/admin/users/{ann_id}/suspend", token=boss, json={"reason": "Abuse"}).json()
    assert suspended["suspendedReason"] == "Abuse"
    assert api.get("/v1/me", token=ann).status_code == 401
    login = api.post("/v1/auth/login", json={"email": "ann@example.com", "password": PASSWORD})
    assert login.status_code == 403 and login.json()["error"]["code"] == "account_suspended"
    api.post(f"/v1/admin/users/{ann_id}/unsuspend", token=boss)
    assert api.post("/v1/auth/login", json={"email": "ann@example.com", "password": PASSWORD}).status_code == 200
    me = api.get("/v1/me", token=boss).json()["id"]
    assert api.post(f"/v1/admin/users/{me}/suspend", token=boss, json={"reason": "x"}).status_code == 409


def test_settings_drive_fees_and_holds(api):
    boss = admin(api)
    changed = api.patch("/v1/admin/settings", token=boss, json={
        "activationFee": {"amount": 100000, "currency": "KZT"}, "checkoutHoldMinutes": 5,
        "processingFeePercent": 3.5}).json()
    assert changed["activationFee"]["amount"] == 100000 and changed["processingFeePercent"] == 3.5
    assert api.get("/v1/admin/settings", token=boss).json() == changed
    token = organizer(api)
    show = event(api, token)
    ticket_type(api, token, show["id"], price=100000)
    fee = api.post(f"/v1/organizer/events/{show['id']}/activation/pay-fee", token=token).json()
    assert fee["amount"]["amount"] == 100000


def test_search_payments_and_csv_report(api):
    boss = admin(api)
    token = organizer(api)
    show, kind = on_sale(api, token, price=200000)
    order = buy(api, show["id"], kind["id"])
    assert api.get("/v1/admin/users", token=boss, params={"q": "org@"}).json()["total"] == 1
    assert api.get("/v1/admin/events", token=boss, params={"q": "concert"}).json()["total"] == 1
    assert api.get("/v1/admin/orders", token=boss, params={"q": order["orderNumber"]}).json()["total"] == 1
    fees = api.get("/v1/admin/payments", token=boss, params={"purpose": "activation_fee"}).json()["data"]
    assert len(fees) == 1 and fees[0]["simulated"] is True
    report = api.get("/v1/admin/reports/orders.csv", token=boss)
    assert report.headers["content-type"].startswith("text/csv")
    header, row = report.text.strip().splitlines()
    assert header.startswith("order_number,") and row.startswith(order["orderNumber"]) and ",2000.00," in row
