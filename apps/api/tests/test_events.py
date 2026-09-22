"""Events (§4.2): drafts, publishing, visibility, editing, cancelling, duplicating, calendar."""
from tests.helpers import (
    admin, buy, campaign_token, emails_to, event, guests, in_days, on_sale, organizer, start_checkout,
    ticket_type, user,
)


def test_new_event_is_a_draft_with_history(api):
    token = organizer(api)
    created = event(api, token)
    assert created["status"] == "draft" and created["paidSalesActive"] is False and created["ticketTypes"] == []
    history = api.get(f"/v1/organizer/events/{created['id']}/history", token=token).json()["data"]
    assert [h["action"] for h in history] == ["event.created"]


def test_event_fields_are_validated(api):
    token = organizer(api)
    cases = [
        ({"timeZone": "Mars/Olympus"}, "invalid_time_zone"),
        ({"startsAt": in_days(10), "endsAt": in_days(9)}, "invalid_dates"),
        ({"startsAt": "2026-10-01T10:00:00"}, "validation_error"),  # no time zone offset
        ({"imageUrl": "ftp://example.com/a.png"}, "validation_error"),
    ]
    for fields, code in cases:
        body = {"title": "X", "venueName": "V", "city": "Almaty", "timeZone": "Asia/Almaty",
                "startsAt": in_days(5), "endsAt": in_days(6)} | fields
        response = api.post("/v1/organizer/events", token=token, json=body)
        assert response.status_code == 422 and response.json()["error"]["code"] == code, fields


def test_publishing_needs_a_ticket_type_and_a_verified_email(api):
    token = organizer(api)
    draft = event(api, token)
    assert api.post(f"/v1/organizer/events/{draft['id']}/publish", token=token).json()["error"]["code"] == "no_ticket_types"
    ticket_type(api, token, draft["id"])
    assert api.post(f"/v1/organizer/events/{draft['id']}/publish", token=token).json()["status"] == "upcoming"

    unverified = user(api, "new@example.com", verified=False)
    api.put("/v1/me/organizer-profile", token=unverified, json={"displayName": "New", "contactEmail": "new@example.com"})
    other = event(api, unverified)
    ticket_type(api, unverified, other["id"])
    response = api.post(f"/v1/organizer/events/{other['id']}/publish", token=unverified)
    assert response.status_code == 409 and response.json()["error"]["code"] == "email_not_verified"


def test_only_public_published_events_are_listed(api):
    token = organizer(api)
    on_sale(api, token, title="Public Show")
    unlisted, _ = on_sale(api, token, title="Unlisted Show", visibility="unlisted")
    private, _ = on_sale(api, token, title="Private Show", visibility="private")
    event(api, token, title="Draft Show")
    assert [e["title"] for e in api.get("/v1/events").json()["data"]] == ["Public Show"]
    assert api.get("/v1/events", params={"q": "PUBLIC"}).json()["total"] == 1
    assert api.get("/v1/events", params={"city": "almaty"}).json()["total"] == 1
    assert api.get("/v1/events", params={"city": "Astana"}).json()["total"] == 0
    assert api.get(f"/v1/events/{unlisted['id']}").status_code == 200
    assert api.get(f"/v1/events/{private['id']}").status_code == 404


def test_private_event_opens_with_its_campaign_link(api):
    token = organizer(api)
    private, kind = on_sale(api, token, visibility="private")
    invite = campaign_token(api, token, private["id"], percentOff=0)
    assert api.get(f"/v1/events/{private['id']}", params={"campaignToken": invite}).status_code == 200
    assert start_checkout(api, private["id"], [(kind["id"], 1)], attendees=guests(1)).status_code == 404
    assert start_checkout(api, private["id"], [(kind["id"], 1)], attendees=guests(1),
                          campaignToken=invite).status_code == 201


def test_status_follows_the_dates(api):
    token = organizer(api)
    running, _ = on_sale(api, token, startsAt=in_days(-0.1), endsAt=in_days(0.1))
    assert api.get(f"/v1/events/{running['id']}").json()["status"] == "active"
    assert api.get("/v1/organizer/events", token=token, params={"status": "active"}).json()["total"] == 1
    assert api.get("/v1/organizer/events", token=token, params={"status": "upcoming"}).json()["total"] == 0


def test_capacity_cannot_drop_below_tickets_sold(api):
    token = organizer(api)
    show, kind = on_sale(api, token, capacity=10)
    buy(api, show["id"], kind["id"], 3)
    too_low = api.patch(f"/v1/organizer/events/{show['id']}", token=token, json={"capacity": 2})
    assert too_low.status_code == 409 and too_low.json()["error"]["code"] == "capacity_below_sold"
    assert api.patch(f"/v1/organizer/events/{show['id']}", token=token, json={"capacity": 5}).json()["capacity"] == 5
    assert api.patch(f"/v1/organizer/events/{show['id']}", token=token, json={"title": None}).status_code == 422


def test_new_date_emails_ticket_holders(api):
    token = organizer(api)
    show, kind = on_sale(api, token)
    buy(api, show["id"], kind["id"], attendees=[{"fullName": "Ann", "email": "ann@example.com"}])
    api.patch(f"/v1/organizer/events/{show['id']}", token=token,
              json={"startsAt": in_days(40), "endsAt": in_days(40.1)})
    assert emails_to("ann@example.com")[-1].kind == "event_updated"
    history = api.get(f"/v1/organizer/events/{show['id']}/history", token=token).json()["data"]
    assert history[0]["action"] == "event.updated" and "starts at" in history[0]["description"]


def test_unpublish_only_before_any_order(api):
    token = organizer(api)
    show, kind = on_sale(api, token)
    assert api.post(f"/v1/organizer/events/{show['id']}/unpublish", token=token).json()["status"] == "draft"
    api.post(f"/v1/organizer/events/{show['id']}/publish", token=token)
    buy(api, show["id"], kind["id"])
    blocked = api.post(f"/v1/organizer/events/{show['id']}/unpublish", token=token)
    assert blocked.status_code == 409 and blocked.json()["error"]["code"] == "event_has_orders"


def test_cancelling_stops_sales_and_emails_attendees(api):
    token = organizer(api)
    show, kind = on_sale(api, token, refundPolicy="Full refund.")
    buy(api, show["id"], kind["id"], attendees=[{"fullName": "Ann", "email": "ann@example.com"}])
    cancelled = api.post(f"/v1/organizer/events/{show['id']}/cancel", token=token, json={"reason": "Storm"})
    assert cancelled.json()["status"] == "cancelled"
    assert emails_to("ann@example.com")[-1].kind == "event_cancelled"
    closed = start_checkout(api, show["id"], [(kind["id"], 1)], attendees=guests(1))
    assert closed.status_code == 409 and closed.json()["error"]["code"] == "event_cancelled"
    assert api.post(f"/v1/organizer/events/{show['id']}/cancel", token=token, json={"reason": "x"}).status_code == 409
    assert api.patch(f"/v1/organizer/events/{show['id']}", token=token, json={"title": "New"}).status_code == 409


def test_duplicate_copies_the_setup_not_the_sales(api):
    token = organizer(api)
    show, kind = on_sale(api, token)
    buy(api, show["id"], kind["id"])
    campaign_token(api, token, show["id"])
    copy = api.post(f"/v1/organizer/events/{show['id']}/duplicate", token=token)
    assert copy.status_code == 201
    copy = copy.json()
    assert copy["status"] == "draft" and copy["title"] == "Test Concert (copy)"
    assert [(t["name"], t["sold"]) for t in copy["ticketTypes"]] == [("General", 0)]
    assert api.get(f"/v1/organizer/events/{copy['id']}/campaigns", token=token).json()["data"] == []
    assert api.get(f"/v1/organizer/events/{copy['id']}/orders", token=token).json()["total"] == 0


def test_organizers_only_manage_their_own_events(api):
    mine = organizer(api, "a@example.com")
    other = organizer(api, "b@example.com")
    show = event(api, mine)
    assert api.get(f"/v1/organizer/events/{show['id']}", token=other).status_code == 403
    assert api.patch(f"/v1/organizer/events/{show['id']}", token=other, json={"title": "x"}).status_code == 403
    assert api.get("/v1/organizer/events/not-a-uuid", token=mine).status_code == 404
    assert api.get(f"/v1/organizer/events/{show['id']}", token=admin(api)).status_code == 200  # read-only access


def test_ticket_types_can_be_hidden_and_changed(api):
    token = organizer(api)
    show, kind = on_sale(api, token, capacity=None)
    buy(api, show["id"], kind["id"], 2)
    url = f"/v1/organizer/events/{show['id']}/ticket-types/{kind['id']}"
    low = api.patch(url, token=token, json={"quantity": 1})
    assert low.status_code == 409 and low.json()["error"]["code"] == "quantity_below_sold"
    changed = api.patch(url, token=token, json={"price": {"amount": 0, "currency": "KZT"}, "quantity": 50}).json()
    assert changed["quantity"] == 50 and changed["sold"] == 2 and changed["available"] == 48
    api.patch(url, token=token, json={"hidden": True})
    assert api.get(f"/v1/events/{show['id']}").json()["ticketTypes"] == []
    assert len(api.get(f"/v1/organizer/events/{show['id']}/ticket-types", token=token).json()["data"]) == 1
    history = api.get(f"/v1/organizer/events/{show['id']}/history", token=token, params={"action": "ticket_type"})
    assert "quantity 100 → 50" in history.json()["data"][1]["description"]


def test_calendar_export(api):
    token = organizer(api)
    show, _ = on_sale(api, token, title="Jazz, Live; Almaty")
    ics = api.get(f"/v1/events/{show['id']}/calendar.ics")
    assert ics.status_code == 200 and ics.headers["content-type"].startswith("text/calendar")
    assert f"UID:{show['id']}@biletflow" in ics.text and "DTSTART;TZID=Asia/Almaty:" in ics.text
    assert r"SUMMARY:Jazz\, Live\; Almaty" in ics.text
    api.post(f"/v1/organizer/events/{show['id']}/cancel", token=token, json={"reason": "x"})
    assert "STATUS:CANCELLED" in api.get(f"/v1/events/{show['id']}/calendar.ics").text


def test_anyone_signed_in_can_report_an_event(api):
    token = organizer(api)
    show, _ = on_sale(api, token)
    reporter = user(api, "r@example.com")
    assert api.post(f"/v1/events/{show['id']}/reports", token=reporter, json={"reason": "Fake"}).status_code == 201
    reports = api.get("/v1/admin/event-reports", token=admin(api)).json()["data"]
    assert reports[0]["reason"] == "Fake" and reports[0]["eventTitle"] == "Test Concert"


def test_one_click_calendar_links(api):
    token = organizer(api)
    show, kind = on_sale(api, token, title="Jazz Night")
    links = api.get(f"/v1/events/{show['id']}").json()["calendarLinks"]
    assert links["ics"].endswith(f"/v1/events/{show['id']}/calendar.ics")
    assert links["google"].startswith("https://calendar.google.com/calendar/render?action=TEMPLATE")
    assert "text=Jazz+Night" in links["google"] and "ctz=Asia%2FAlmaty" in links["google"]
    assert links["outlook"].startswith("https://outlook.live.com/calendar/")
    buy(api, show["id"], kind["id"], attendees=[{"fullName": "Ann", "email": "ann@example.com"}])
    assert links["google"] in emails_to("ann@example.com")[-1].body
