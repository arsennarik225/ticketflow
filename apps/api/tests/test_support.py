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


def test_escalation_to_platform_admins(api):
    boss = admin(api)
    org = organizer(api)
    show, kind = on_sale(api, org)
    ann = user(api, "ann@example.com")
    order = buy(api, show["id"], kind["id"], token=ann)
    case = open_case(api, ann, orderId=order["id"], category="refund", subject="Refund please").json()
    escalated = api.post(f"/v1/support/cases/{case['id']}/escalate", token=ann, json={"reason": "No answer for days"})
    assert escalated.json()["handledBy"] == "platform" and escalated.json()["messages"][-1]["body"] == "No answer for days"
    assert emails_to("admin@example.com")[-1].kind == "support_escalated"
    assert api.post(f"/v1/support/cases/{case['id']}/escalate", token=ann, json={}).status_code == 409
    escalated_list = api.get("/v1/support/cases", token=boss, params={"handledBy": "platform"}).json()
    assert [c["id"] for c in escalated_list["data"]] == [case["id"]]
    # The organizer still reads and replies, but Platform Admins now run the case.
    assert api.post(f"/v1/support/cases/{case['id']}/messages", token=org, json={"body": "Sorry!"}).status_code == 201
    assert api.patch(f"/v1/support/cases/{case['id']}", token=org, json={"status": "resolved"}).status_code == 403
    assert api.patch(f"/v1/support/cases/{case['id']}", token=boss, json={"status": "resolved"}).status_code == 200
    stranger = user(api, "x@example.com")
    assert api.post(f"/v1/support/cases/{case['id']}/escalate", token=stranger, json={}).status_code == 403


def test_cases_filter_by_event(api):
    org = organizer(api)
    first, _ = on_sale(api, org, title="First")
    second, _ = on_sale(api, org, title="Second")
    ann = user(api, "ann@example.com")
    open_case(api, ann, eventId=first["id"], category="event_information")
    open_case(api, ann, eventId=second["id"], category="event_information")
    only_first = api.get("/v1/support/cases", token=org, params={"eventId": first["id"]}).json()
    assert only_first["total"] == 1 and only_first["data"][0]["eventId"] == first["id"]


PNG = bytes([0x89]) + b"PNG\r\n\x1a\n" + b"0" * 64


def test_attachments(api):
    org = organizer(api)
    show, _ = on_sale(api, org)
    ann = user(api, "ann@example.com")
    case = open_case(api, ann, eventId=show["id"]).json()
    url = f"/v1/support/cases/{case['id']}/attachments"
    posted = api.post(url, token=ann, files={"file": ("screen.png", PNG, "image/png")}, data={"body": "See this"})
    assert posted.status_code == 201
    attachment = posted.json()["attachments"][0]
    assert (attachment["filename"], attachment["size"], posted.json()["body"]) == ("screen.png", len(PNG), "See this")
    download = api.get(f"/v1/support/attachments/{attachment['id']}", token=org)
    assert download.status_code == 200 and download.content == PNG
    assert api.get(f"/v1/support/attachments/{attachment['id']}", token=user(api, "x@example.com")).status_code == 403
    fake = api.post(url, token=ann, files={"file": ("x.png", b"not really a png", "image/png")})
    assert fake.status_code == 422 and fake.json()["error"]["code"] == "file_type_not_allowed"
    text = api.post(url, token=ann, files={"file": ("x.txt", b"hello", "text/plain")})
    assert text.json()["error"]["code"] == "file_type_not_allowed"
    huge = api.post(url, token=ann, files={"file": ("big.pdf", b"%PDF" + b"0" * (5 * 1024 * 1024), "application/pdf")})
    assert huge.status_code == 422 and huge.json()["error"]["code"] == "file_too_large"
    thread = api.get(f"/v1/support/cases/{case['id']}", token=org).json()
    assert thread["messages"][-1]["attachments"][0]["id"] == attachment["id"]
