"""Support cases (§4.13): contextual cases, who handles them, and who may see them."""
from tests.helpers import admin, buy, emails_to, on_sale, organizer, user


def open_case(api, token, **body):
    return api.post("/v1/support/cases", token=token,
                    json={"category": "ticket_delivery", "subject": "No tickets", "message": "Help"} | body)


def test_attendee_case_goes_to_the_organizer(api):
    org = organizer(api)
    show, kind = on_sale(api, org)
    ann = user(api, "ann@example.com", "Ann")
    order = buy(api, show["id"], kind["id"], token=ann)
    case = open_case(api, ann, ticketId=order["tickets"][0]["id"]).json()
    assert case["orderId"] == order["id"] and case["eventId"] == show["id"] and case["handledBy"] == "organizer"
    assert emails_to("org@example.com")[-1].kind == "support_new_case"
    assert api.get("/v1/support/cases", token=org).json()["total"] == 1

    assert api.post(f"/v1/support/cases/{case['id']}/messages", token=org, json={"body": "Resent!"}).status_code == 201
    assert emails_to("ann@example.com")[-1].kind == "support_reply"
    waiting = api.patch(f"/v1/support/cases/{case['id']}", token=org, json={"status": "waiting_for_customer"})
    assert waiting.json()["status"] == "waiting_for_customer"
    assert emails_to("ann@example.com")[-1].kind == "support_status"
    api.post(f"/v1/support/cases/{case['id']}/messages", token=ann, json={"body": "Got them, thanks"})
    thread = api.get(f"/v1/support/cases/{case['id']}", token=ann).json()
    assert thread["status"] == "open" and [m["body"] for m in thread["messages"]] == ["Help", "Resent!", "Got them, thanks"]
    assert api.patch(f"/v1/support/cases/{case['id']}", token=ann, json={"status": "resolved"}).status_code == 403

    stranger = user(api, "x@example.com")
    assert api.get(f"/v1/support/cases/{case['id']}", token=stranger).status_code == 403
    assert api.get("/v1/support/cases", token=stranger).json()["total"] == 0
    actions = [h["action"] for h in api.get(f"/v1/organizer/events/{show['id']}/history", token=org,
                                           params={"action": "support_case"}).json()["data"]]
    assert actions == ["support_case.status_changed", "support_case.opened"]


def test_organizer_questions_go_to_platform_admins(api):
    boss = admin(api)
    org = organizer(api)
    case = open_case(api, org, category="account", subject="Activation question").json()
    assert case["handledBy"] == "platform" and "eventId" not in case
    assert emails_to("admin@example.com")[-1].kind == "support_new_case"
    assert api.get("/v1/support/cases", token=boss).json()["total"] == 1
    me = api.get("/v1/me", token=boss).json()["id"]
    assert api.patch(f"/v1/support/cases/{case['id']}", token=boss, json={"assigneeUserId": me}).json()["assigneeUserId"] == me
    random_user = api.get("/v1/me", token=user(api, "r@example.com")).json()["id"]
    wrong = api.patch(f"/v1/support/cases/{case['id']}", token=boss, json={"assigneeUserId": random_user})
    assert wrong.status_code == 422 and wrong.json()["error"]["code"] == "invalid_assignee"


def test_context_must_belong_to_the_requester(api):
    org = organizer(api)
    show, kind = on_sale(api, org)
    ann = user(api, "ann@example.com")
    order = buy(api, show["id"], kind["id"], token=ann)
    other_order = buy(api, show["id"], kind["id"], token=ann)
    stranger = user(api, "x@example.com")
    assert open_case(api, stranger, orderId=order["id"]).status_code == 404
    mismatch = open_case(api, ann, ticketId=order["tickets"][0]["id"], orderId=other_order["id"])
    assert mismatch.status_code == 422 and mismatch.json()["error"]["code"] == "context_mismatch"


def test_event_staff_can_be_assigned_and_reply(api):
    org = organizer(api)
    show, kind = on_sale(api, org)
    api.post(f"/v1/organizer/events/{show['id']}/staff", token=org, json={"email": "staff@example.com"})
    staff = user(api, "staff@example.com")
    ann = user(api, "ann@example.com")
    case = open_case(api, ann, eventId=show["id"], category="event_information").json()
    staff_id = api.get("/v1/me", token=staff).json()["id"]
    assert api.patch(f"/v1/support/cases/{case['id']}", token=org, json={"assigneeUserId": staff_id}).status_code == 200
    assert emails_to("staff@example.com")[-1].kind == "support_assigned"
    assert api.post(f"/v1/support/cases/{case['id']}/messages", token=staff, json={"body": "On it"}).status_code == 201
