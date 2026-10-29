#!/usr/bin/env python3
"""Exercise the running demo stack: python3 scripts/smoke.py [--url http://localhost:3000].

Uses demo accounts and creates retained test events/orders. Never run against real data.
"""
import argparse
import json
import uuid
from datetime import datetime, timedelta, timezone
from urllib.error import HTTPError
from urllib.request import Request, urlopen


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default="http://localhost:3000")
    args = parser.parse_args()
    base = args.url.rstrip("/")

    def call(method, path, body=None, token=None, expected=200, key=None):
        headers = {"Content-Type": "application/json"}
        if token:
            headers["Authorization"] = f"Bearer {token}"
        if key:
            headers["Idempotency-Key"] = key
        request = Request(f"{base}/v1{path}", method=method, headers=headers,
                          data=json.dumps(body).encode() if body is not None else None)
        try:
            response = urlopen(request, timeout=20)
        except HTTPError as error:
            response = error
        raw = response.read()
        if response.status != expected:
            raise AssertionError(f"{method} {path}: expected {expected}, got {response.status}: {raw[:300]!r}")
        if "json" in response.headers.get("Content-Type", ""):
            return json.loads(raw)
        return raw

    def login(role):
        return call("POST", "/auth/login", {"email": f"{role}@biletflow.kz", "password": "demo12345"})["accessToken"]

    organizer, attendee, staff, admin = (login(role) for role in ("organizer", "attendee", "staff", "admin"))
    start = datetime.now(timezone.utc) + timedelta(days=7)
    event = call("POST", "/organizer/events", {
        "title": f"[Smoke] BiletFlow {start:%Y%m%d-%H%M%S}", "venueName": "Test Hall",
        "city": "Almaty", "startsAt": start.isoformat(), "endsAt": (start + timedelta(hours=2)).isoformat(),
        "timeZone": "Asia/Almaty", "visibility": "public",
    }, organizer, 201)
    root = f"/organizer/events/{event['id']}"
    ticket_type = call("POST", f"{root}/ticket-types", {
        "name": "General", "price": {"amount": 100000, "currency": "KZT"}, "quantity": 10,
    }, organizer, 201)
    free = call("POST", f"{root}/ticket-types", {
        "name": "Free registration", "price": {"amount": 0, "currency": "KZT"}, "quantity": 5,
    }, organizer, 201)
    call("POST", f"{root}/staff", {"email": "staff@biletflow.kz", "canReverseCheckIn": True}, organizer, 201)
    call("POST", f"{root}/activation/pay-fee", token=organizer)
    settings = call("GET", "/admin/settings", token=admin)
    call("POST", f"{root}/activation/accept-terms", {"termsVersion": settings["termsVersion"]}, organizer)
    assert call("GET", f"{root}/activation", token=organizer)["active"]
    campaign = call("POST", f"{root}/campaigns", {"name": "Smoke discount", "discountType": "percentage", "percentOff": 10, "maxRedemptions": 2}, organizer, 201)
    assert call("GET", f"/organizer/campaigns/{campaign['id']}/qr", token=organizer).startswith(b"\x89PNG")
    call("POST", f"{root}/publish", token=organizer)
    assert call("GET", f"/events/{event['id']}")["status"] == "upcoming"

    def checkout(type_id, promo=None):
        session = call("POST", "/checkout/sessions", {
            "eventId": event["id"], "items": [{"ticketTypeId": type_id, "quantity": 1}],
            "attendees": [{"fullName": "Demo Check", "email": "attendee@biletflow.kz"}],
        }, attendee, 201)
        if promo:
            session = call("PUT", f"/checkout/sessions/{session['id']}/promo-code", {"code": promo}, attendee)
        return session

    held = checkout(ticket_type["id"], campaign["code"])
    assert held["discount"]["amount"] == 10000
    confirm = f"/checkout/sessions/{held['id']}/confirm"
    call("POST", confirm, {"paymentMethodToken": "tok_declined"}, attendee, 402, str(uuid.uuid4()))
    key = str(uuid.uuid4())
    order = call("POST", confirm, {"paymentMethodToken": "tok_success"}, attendee, 201, key)
    assert call("POST", confirm, {"paymentMethodToken": "tok_success"}, attendee, 201, key)["id"] == order["id"]
    ticket = order["tickets"][0]
    assert call("GET", f"/me/tickets/{ticket['id']}/pdf", token=attendee).startswith(b"%PDF")
    checkin = f"/checkin/events/{event['id']}"
    assert any(item["id"] == event["id"] for item in call("GET", "/checkin/events?assignedOnly=true", token=staff)["data"])
    assert call("POST", f"{checkin}/verify", {"qrPayload": campaign["campaignUrl"]}, staff)["result"] == "rejected_campaign_qr"
    assert call("POST", f"{checkin}/verify", {"qrPayload": ticket["qrPayload"]}, staff)["result"] == "valid"
    admitted = call("POST", f"{checkin}/check-ins", {"qrPayload": ticket["qrPayload"]}, staff, 201)
    assert call("POST", f"{checkin}/check-ins", {"qrPayload": ticket["qrPayload"]}, staff, 409)["result"] == "already_used"
    call("DELETE", f"/checkin/check-ins/{admitted['id']}", token=staff, expected=204)
    assert call("GET", f"{checkin}/attendees?q=Demo", token=staff)["data"]
    offline = call("GET", f"{checkin}/offline-list", token=staff)
    assert any(item["ticketId"] == ticket["id"] for item in offline["tickets"])
    sync = call("POST", f"{checkin}/offline-sync", {"checkIns": [{"ticketId": ticket["id"], "checkedInAt": datetime.now(timezone.utc).isoformat()}]}, staff)
    assert sync["results"][0]["result"] == "accepted"
    call("DELETE", f"/checkin/check-ins/{sync['results'][0]['checkIn']['id']}", token=staff, expected=204)
    case = call("POST", "/support/cases", {"ticketId": ticket["id"], "category": "ticket_delivery", "subject": "Smoke support", "message": "Please confirm my ticket."}, attendee, 201)
    call("POST", f"/support/cases/{case['id']}/messages", {"body": "Your ticket is available."}, organizer, 201)
    call("PATCH", f"/support/cases/{case['id']}", {"status": "resolved"}, organizer)
    assert len(call("GET", f"/support/cases/{case['id']}", token=attendee)["messages"]) == 2
    analytics = call("GET", f"{root}/analytics", token=organizer)
    assert analytics["ticketsSold"] == 1 and analytics["campaigns"][0]["redemptions"] == 1
    assert call("GET", f"{root}/history", token=organizer)["total"] > 0
    call("GET", f"{root}/analytics", token=staff, expected=403)
    call("POST", f"/organizer/orders/{order['id']}/refund", {"reason": "Smoke test complete"}, organizer, key=str(uuid.uuid4()))
    assert call("POST", f"{checkin}/verify", {"qrPayload": ticket["qrPayload"]}, staff)["result"] == "refunded"
    held_free = checkout(free["id"])
    assert not held_free["requiresPayment"]
    free_order = call("POST", f"/checkout/sessions/{held_free['id']}/confirm", {}, attendee, 201, str(uuid.uuid4()))
    call("POST", f"/organizer/orders/{free_order['id']}/cancel", {"reason": "Smoke test complete"}, organizer)
    call("POST", f"/admin/events/{event['id']}/suspend", {"reason": "Smoke moderation"}, admin)
    call("GET", f"/events/{event['id']}", expected=404)
    call("POST", f"/admin/events/{event['id']}/unsuspend", token=admin)
    assert b"order_number" in call("GET", "/admin/reports/orders.csv", token=admin)
    duplicate = call("POST", f"{root}/duplicate", token=organizer, expected=201)
    assert duplicate["status"] == "draft"
    assert call("GET", f"/organizer/events/{duplicate['id']}/orders", token=organizer)["total"] == 0
    print(f"PASS: checkout, payment retry, PDF, campaign rejection, check-in/undo/offline sync, support, analytics, refunds, free cancellation, moderation, reports, duplication.")
    print(f"Retained demo event: {base}/events/{event['id']}")


if __name__ == "__main__":
    main()
