"""Scanner app (§4.8): assigned events, verification, one entry per ticket, undo, manual search.
Campaign QR Codes are never admission (§4.14)."""
import threading
from concurrent.futures import ThreadPoolExecutor

from tests.conftest import Api
from tests.helpers import buy, campaign, link_token, on_sale, organizer, user


def setup(api, can_reverse: bool = False):
    token = organizer(api)
    show, kind = on_sale(api, token)
    staff = user(api, "staff@example.com", "Sam Staff")
    api.post(f"/v1/organizer/events/{show['id']}/staff", token=token,
             json={"email": "staff@example.com", "canReverseCheckIn": can_reverse})
    return token, staff, show, kind


def scan(api, token, event_id, payload):
    return api.post(f"/v1/checkin/events/{event_id}/verify", token=token, json={"qrPayload": payload}).json()


def check_in(api, token, event_id, **body):
    return api.post(f"/v1/checkin/events/{event_id}/check-ins", token=token, json=body)


def test_staff_see_only_assigned_events(api):
    token = organizer(api)
    show, _ = on_sale(api, token)
    on_sale(api, token, title="Other")
    staff = user(api, "staff@example.com")
    assert api.get("/v1/checkin/events", token=staff).json()["data"] == []
    assigned = api.post(f"/v1/organizer/events/{show['id']}/staff", token=token, json={"email": "STAFF@example.com"})
    assert assigned.status_code == 201 and assigned.json()["userId"]
    assert [e["id"] for e in api.get("/v1/checkin/events", token=staff).json()["data"]] == [show["id"]]
    assert "event_admin" in api.get("/v1/me", token=staff).json()["roles"]
    again = api.post(f"/v1/organizer/events/{show['id']}/staff", token=token, json={"email": "staff@example.com"})
    assert again.status_code == 409
    stranger = user(api, "x@example.com")
    assert api.post(f"/v1/checkin/events/{show['id']}/verify", token=stranger, json={"qrPayload": "x"}).status_code == 403


def test_staff_can_be_assigned_before_signing_up(api):
    token = organizer(api)
    show, _ = on_sale(api, token)
    assignment = api.post(f"/v1/organizer/events/{show['id']}/staff", token=token, json={"email": "new@example.com"})
    assert "userId" not in assignment.json()
    unverified = user(api, "new@example.com", verified=False)
    assert api.get("/v1/checkin/events", token=unverified).json()["data"] == []
    verified = api.post("/v1/auth/verify-email", json={"token": link_token("new@example.com", "/verify-email")})
    assert len(api.get("/v1/checkin/events", token=verified.json()["accessToken"]).json()["data"]) == 1


def test_a_ticket_gets_in_once(api):
    _, staff, show, kind = setup(api)
    ticket = buy(api, show["id"], kind["id"])["tickets"][0]
    verified = scan(api, staff, show["id"], ticket["qrPayload"])
    assert verified["result"] == "valid" and verified["ticket"]["ticketNumber"] == ticket["ticketNumber"]
    first = check_in(api, staff, show["id"], qrPayload=ticket["qrPayload"])
    assert first.status_code == 201
    second = check_in(api, staff, show["id"], qrPayload=ticket["qrPayload"])
    assert second.status_code == 409 and second.json()["result"] == "already_used"
    assert second.json()["previousCheckIn"]["id"] == first.json()["id"]
    assert scan(api, staff, show["id"], ticket["qrPayload"])["result"] == "already_used"
    counts = api.get(f"/v1/checkin/events/{show['id']}/attendees", token=staff, params={"q": "guest"}).json()
    assert (counts["registered"], counts["checkedIn"]) == (1, 1)


def test_campaign_qr_is_never_admission(api):
    token, staff, show, _ = setup(api)
    promo = campaign(api, token, show["id"])
    for payload in (promo["campaignUrl"], promo["code"]):
        assert scan(api, staff, show["id"], payload)["result"] == "rejected_campaign_qr"
        refused = check_in(api, staff, show["id"], qrPayload=payload)
        assert refused.status_code == 409 and refused.json()["result"] == "rejected_campaign_qr"


def test_forged_foreign_and_invalidated_tickets(api):
    token, staff, show, kind = setup(api)
    payload = buy(api, show["id"], kind["id"])["tickets"][0]["qrPayload"]
    forged = payload[:-1] + ("A" if payload[-1] != "A" else "B")
    assert scan(api, staff, show["id"], forged)["result"] == "invalid"
    assert scan(api, staff, show["id"], "hello")["result"] == "invalid"
    other, other_kind = on_sale(api, token, title="Other")
    foreign = buy(api, other["id"], other_kind["id"])["tickets"][0]["qrPayload"]
    wrong = scan(api, staff, show["id"], foreign)
    assert wrong["result"] == "wrong_event" and "ticket" not in wrong
    free_order = buy(api, show["id"], kind["id"])
    api.post(f"/v1/organizer/orders/{free_order['id']}/cancel", token=token, json={"reason": "Duplicate"})
    assert scan(api, staff, show["id"], free_order["tickets"][0]["qrPayload"])["result"] == "cancelled"


def test_undo_needs_permission(api):
    token, staff, show, kind = setup(api, can_reverse=False)
    ticket = buy(api, show["id"], kind["id"])["tickets"][0]
    record = check_in(api, staff, show["id"], qrPayload=ticket["qrPayload"]).json()
    denied = api.delete(f"/v1/checkin/check-ins/{record['id']}", token=staff)
    assert denied.status_code == 403 and denied.json()["error"]["code"] == "cannot_reverse_check_in"
    assert api.delete(f"/v1/checkin/check-ins/{record['id']}", token=token).status_code == 204
    assert scan(api, staff, show["id"], ticket["qrPayload"])["result"] == "valid"
    assert check_in(api, staff, show["id"], qrPayload=ticket["qrPayload"]).status_code == 201
    actions = [h["action"] for h in api.get(f"/v1/organizer/events/{show['id']}/history", token=token,
                                           params={"action": "check_in"}).json()["data"]]
    assert actions == ["check_in.created", "check_in.reversed", "check_in.created"]


def test_manual_search_and_check_in_by_ticket_id(api):
    _, staff, show, kind = setup(api)
    buy(api, show["id"], kind["id"], attendees=[{"fullName": "Aigerim Test", "email": "aigerim@example.com"}])
    found = api.get(f"/v1/checkin/events/{show['id']}/attendees", token=staff, params={"q": "aig"}).json()["data"]
    assert [a["fullName"] for a in found] == ["Aigerim Test"]
    assert check_in(api, staff, show["id"], ticketId=found[0]["ticketId"]).status_code == 201
    assert api.get(f"/v1/checkin/events/{show['id']}/attendees", token=staff, params={"q": "a"}).status_code == 422
    totals = api.get(f"/v1/checkin/events/{show['id']}/attendees", token=staff).json()
    assert (totals["data"], totals["registered"], totals["checkedIn"]) == ([], 1, 1)


def test_two_scanners_admit_a_ticket_once(api):
    _, staff, show, kind = setup(api)
    payload = buy(api, show["id"], kind["id"])["tickets"][0]["qrPayload"]
    start_line = threading.Barrier(2)

    def attempt(_):
        client = Api()
        start_line.wait()
        return client.post(f"/v1/checkin/events/{show['id']}/check-ins", token=staff,
                           json={"qrPayload": payload}).status_code

    with ThreadPoolExecutor(2) as pool:
        assert sorted(pool.map(attempt, range(2))) == [201, 409]


def test_offline_scanning_and_sync(api):
    token, staff, show, kind = setup(api, can_reverse=True)
    first, second, refunded = (buy(api, show["id"], kind["id"])["tickets"][0] for _ in range(3))
    api.post(f"/v1/organizer/orders/{refunded['orderId']}/cancel", token=token, json={"reason": "x"})
    other, other_kind = on_sale(api, token, title="Other")
    foreign = buy(api, other["id"], other_kind["id"])["tickets"][0]

    listing = api.get(f"/v1/checkin/events/{show['id']}/offline-list", token=staff).json()
    by_number = {t["ticketNumber"]: t for t in listing["tickets"]}
    assert by_number[first["ticketNumber"]]["qrPayload"] == first["qrPayload"]
    assert by_number[refunded["ticketNumber"]]["status"] == "cancelled"
    assert api.get(f"/v1/checkin/events/{show['id']}/offline-list", token=user(api, "x@example.com")).status_code == 403

    scans = [
        {"ticketId": second["id"], "checkedInAt": "2026-01-01T18:05:00Z"},
        {"ticketId": first["id"], "checkedInAt": "2026-01-01T18:00:00Z"},
        {"ticketId": first["id"], "checkedInAt": "2026-01-01T18:10:00Z"},  # second device, same ticket
        {"ticketId": refunded["id"], "checkedInAt": "2026-01-01T18:11:00Z"},
        {"ticketId": foreign["id"], "checkedInAt": "2026-01-01T18:12:00Z"},
        {"ticketId": "not-a-ticket", "checkedInAt": "2026-01-01T18:13:00Z"},
        {"ticketId": first["id"], "checkedInAt": "2999-01-01T00:00:00Z"},
    ]
    results = api.post(f"/v1/checkin/events/{show['id']}/offline-sync", token=staff, json={"checkIns": scans})
    assert [r["result"] for r in results.json()["results"]] == [
        "accepted", "accepted", "already_used", "cancelled", "wrong_event", "invalid", "already_used"]
    accepted = results.json()["results"][1]["checkIn"]
    assert accepted["method"] == "offline" and accepted["checkedInAt"].startswith("2026-01-01T18:00:00")
    again = check_in(api, staff, show["id"], qrPayload=first["qrPayload"])
    assert again.status_code == 409 and again.json()["result"] == "already_used"
    history = api.get(f"/v1/organizer/events/{show['id']}/history", token=token, params={"action": "check_in"})
    assert sum("offline" in h["description"] for h in history.json()["data"]) == 2
