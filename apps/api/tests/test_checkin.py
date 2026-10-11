"""Scanner app (§4.8): assigned events, verification, one entry per ticket, undo, manual search.
Campaign QR Codes are never admission (§4.14)."""
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from queue import Queue
from time import monotonic
from uuid import UUID

import pytest
from sqlalchemy import select, text, update

from app.database import SessionLocal
from app.models import CheckIn, Event, Ticket, User, utcnow
from app.routers.checkin import undo_check_in
from tests.conftest import Api
from tests.helpers import admin, buy, campaign, link_token, on_sale, organizer, user


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


def test_assigned_only_excludes_ownership_and_unrelated_events(api):
    owner = organizer(api)
    assigned, _ = on_sale(api, owner)
    on_sale(api, owner, title="Unrelated")
    staff = organizer(api, "staff@example.com")
    owned, _ = on_sale(api, staff, title="Owned but unassigned")
    api.post(f"/v1/organizer/events/{assigned['id']}/staff", token=owner,
             json={"email": "STAFF@example.com"})
    assert set(api.get("/v1/me", token=staff).json()["roles"]) == {"attendee", "organizer", "event_admin"}
    strict = api.get("/v1/checkin/events", token=staff, params={"assignedOnly": "true"}).json()
    assert [e["id"] for e in strict["data"]] == [assigned["id"]]
    assert strict["total"] == 1
    for params in ({}, {"assignedOnly": "false"}):
        legacy = api.get("/v1/checkin/events", token=staff, params=params).json()
        assert {e["id"] for e in legacy["data"]} == {assigned["id"], owned["id"]}
        assert legacy["total"] == 2
    api.post(f"/v1/organizer/events/{owned['id']}/staff", token=staff,
             json={"email": "staff@example.com"})
    assert api.get("/v1/checkin/events", token=staff, params={"assignedOnly": True}).json()["total"] == 2


def test_assigned_only_requires_verified_email_and_current_assignment(api):
    owner = organizer(api)
    show, _ = on_sale(api, owner)
    staff = user(api, "staff@example.com", verified=False)
    assignment = api.post(f"/v1/organizer/events/{show['id']}/staff", token=owner,
                          json={"email": "staff@example.com"}).json()
    path, params = "/v1/checkin/events", {"assignedOnly": True}
    assert api.get(path, token=staff, params=params).json() == {"data": [], "total": 0}
    api.post("/v1/auth/verify-email", json={"token": link_token("staff@example.com", "/verify-email")})
    assert api.get(path, token=staff, params=params).json()["total"] == 1
    assert api.delete(f"/v1/organizer/events/{show['id']}/staff/{assignment['id']}", token=owner).status_code == 204
    assert api.get(path, token=staff, params=params).json() == {"data": [], "total": 0}


@pytest.mark.parametrize("assigned_only", [True, False])
@pytest.mark.parametrize("state", ["draft", "cancelled", "expired"])
def test_checkin_event_filters_are_preserved(api, assigned_only, state):
    _, staff, show, _ = setup(api)
    changes = {"status": state} if state != "expired" else {
        "starts_at": utcnow() - timedelta(days=3), "ends_at": utcnow() - timedelta(days=2)}
    with SessionLocal() as db:
        db.execute(update(Event).where(Event.id == show["id"]).values(**changes))
        db.commit()
    assert api.get("/v1/checkin/events", token=staff,
                   params={"assignedOnly": assigned_only}).json() == {"data": [], "total": 0}


def test_assigned_only_preserves_auth_and_validates_boolean(api):
    for token in (None, "invalid"):
        assert api.get("/v1/checkin/events", token=token, params={"assignedOnly": True}).status_code == 401
    staff = user(api, "staff@example.com")
    assert api.get("/v1/checkin/events", token=staff, params={"assignedOnly": True}).json()["data"] == []
    assert api.get("/v1/checkin/events", token=staff, params={"assignedOnly": "wrong"}).status_code == 422
    api.post("/v1/auth/logout", token=staff)
    assert api.get("/v1/checkin/events", token=staff, params={"assignedOnly": True}).status_code == 401


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


@pytest.mark.parametrize("readmit", [False, True])
def test_reversal_is_idempotent_and_preserves_a_newer_admission(api, readmit):
    owner, staff, show, kind = setup(api, can_reverse=True)
    ticket = buy(api, show["id"], kind["id"])["tickets"][0]
    first = check_in(api, staff, show["id"], ticketId=ticket["id"]).json()
    path = f"/v1/checkin/check-ins/{first['id']}"
    assert api.delete(path, token=staff).status_code == 204
    with SessionLocal() as db:
        assert db.get(Ticket, UUID(ticket["id"])).status == "valid"
        assert db.scalars(select(CheckIn).where(
            CheckIn.ticket_id == UUID(ticket["id"]), CheckIn.reversed_at.is_(None))).all() == []
        record = db.get(CheckIn, UUID(first["id"]))
        original_reversal = (record.reversed_at, record.reversed_by_user_id)
        assert all(original_reversal)
    assert scan(api, staff, show["id"], ticket["qrPayload"])["result"] == "valid"
    if readmit:
        response = check_in(api, staff, show["id"], ticketId=ticket["id"])
        assert response.status_code == 201
        newer = response.json()
        assert newer["id"] != first["id"]
    # A different authorized actor's retry must not rewrite history or undo a newer entry.
    assert api.delete(path, token=owner).status_code == 204
    with SessionLocal() as db:
        assert db.get(Ticket, UUID(ticket["id"])).status == ("checked_in" if readmit else "valid")
        active = db.scalars(select(CheckIn).where(
            CheckIn.ticket_id == UUID(ticket["id"]), CheckIn.reversed_at.is_(None))).all()
        assert [str(record.id) for record in active] == ([newer["id"]] if readmit else [])
        record = db.get(CheckIn, UUID(first["id"]))
        assert (record.reversed_at, record.reversed_by_user_id) == original_reversal
    actions = [row["action"] for row in api.get(
        f"/v1/organizer/events/{show['id']}/history", token=owner, params={"action": "check_in"}).json()["data"]]
    assert actions.count("check_in.reversed") == 1
    assert actions.count("check_in.created") == (2 if readmit else 1)


@pytest.mark.parametrize("method", ["manual", "qr", "offline"])
def test_concurrent_stale_reversal_cannot_invalidate_readmission(api, method):
    owner, staff, show, kind = setup(api, can_reverse=True)
    ticket = buy(api, show["id"], kind["id"])["tickets"][0]
    first = check_in(api, staff, show["id"], ticketId=ticket["id"]).json()
    staff_id = UUID(api.get("/v1/me", token=staff).json()["id"])
    loaded, resume = threading.Event(), threading.Event()

    def delayed_reversal():
        # A real transaction retains the original identity-map object, just as the
        # handler does between its initial db.get and acquiring the ticket lock.
        # Keeping the reference makes the handler's db.get reuse that stale object.
        with SessionLocal() as db:
            assert db.get_bind().dialect.name == "postgresql"
            assert db.connection().get_isolation_level() == "READ COMMITTED"
            record = db.get(CheckIn, UUID(first["id"]))
            actor = db.get(User, staff_id)
            assert record.reversed_at is None
            loaded.set()
            assert resume.wait(timeout=15), "Competing reversal/admission did not finish"
            assert record.reversed_at is None
            return undo_check_in(first["id"], user=actor, db=db).status_code

    with ThreadPoolExecutor(1) as pool:
        delayed = pool.submit(delayed_reversal)
        try:
            assert loaded.wait(timeout=15), "Transaction A did not load the original check-in"
            # Each HTTP request uses and commits its own PostgreSQL session while
            # A remains open. No mocks, sleeps, or production synchronization hooks.
            assert api.delete(f"/v1/checkin/check-ins/{first['id']}", token=owner).status_code == 204
            if method == "offline":
                response = api.post(f"/v1/checkin/events/{show['id']}/offline-sync", token=staff,
                                    json={"checkIns": [{"ticketId": ticket["id"],
                                                        "checkedInAt": utcnow().isoformat()}]})
                assert response.status_code == 200
                result = response.json()["results"][0]
                assert result["result"] == "accepted"
                newer = result["checkIn"]
            else:
                body = {"ticketId": ticket["id"]} if method == "manual" else {"qrPayload": ticket["qrPayload"]}
                response = check_in(api, staff, show["id"], **body)
                assert response.status_code == 201
                newer = response.json()
            with SessionLocal() as db:
                record = db.get(CheckIn, UUID(first["id"]))
                original_reversal = (record.reversed_at, record.reversed_by_user_id)
        finally:
            resume.set()
        assert delayed.result(timeout=15) == 204

    with SessionLocal() as db:
        assert db.get(Ticket, UUID(ticket["id"])).status == "checked_in"
        records = db.scalars(select(CheckIn).where(CheckIn.ticket_id == UUID(ticket["id"]))).all()
        assert len(records) == 2
        assert [str(record.id) for record in records if record.reversed_at is None] == [newer["id"]]
        record = db.get(CheckIn, UUID(first["id"]))
        assert (record.reversed_at, record.reversed_by_user_id) == original_reversal
    verified = scan(api, staff, show["id"], ticket["qrPayload"])
    assert verified["result"] == "already_used"
    assert verified["previousCheckIn"]["id"] == newer["id"]
    duplicate = check_in(api, staff, show["id"], ticketId=ticket["id"])
    assert duplicate.status_code == 409 and duplicate.json()["result"] == "already_used"
    assert duplicate.json()["previousCheckIn"]["id"] == newer["id"]
    found = api.get(f"/v1/checkin/events/{show['id']}/attendees", token=staff,
                    params={"q": ticket["ticketNumber"]}).json()
    assert (found["registered"], found["checkedIn"]) == (1, 1)
    assert found["data"][0]["checkInId"] == newer["id"]
    assert found["data"][0]["status"] == "checked_in"
    actions = [row["action"] for row in api.get(
        f"/v1/organizer/events/{show['id']}/history", token=owner, params={"action": "check_in"}).json()["data"]]
    assert actions.count("check_in.reversed") == 1
    assert actions.count("check_in.created") == 2


def test_reversal_refreshes_check_in_after_waiting_for_ticket_lock(api):
    _, staff, show, kind = setup(api, can_reverse=True)
    ticket = buy(api, show["id"], kind["id"])["tickets"][0]
    first = check_in(api, staff, show["id"], ticketId=ticket["id"]).json()
    staff_id = UUID(api.get("/v1/me", token=staff).json()["id"])
    waiter_pid = Queue()

    def reverse_while_locked():
        with SessionLocal() as db:
            db.execute(text("SET LOCAL statement_timeout = '15s'"))
            record = db.get(CheckIn, UUID(first["id"]))
            actor = db.get(User, staff_id)
            assert record.reversed_at is None  # B's reversal is still uncommitted.
            waiter_pid.put(db.scalar(text("SELECT pg_backend_pid()")))
            return undo_check_in(first["id"], user=actor, db=db).status_code

    with ThreadPoolExecutor(1) as pool:
        with SessionLocal() as competing:
            # Stage the competing reversal and re-admission under the same ticket
            # lock as the endpoints, but defer commit until A is really waiting.
            locked = competing.scalar(select(Ticket).where(Ticket.id == UUID(ticket["id"])).with_for_update())
            original = competing.get(CheckIn, UUID(first["id"]))
            original.reversed_at, original.reversed_by_user_id = utcnow(), staff_id
            competing.flush()
            newer = CheckIn(ticket_id=locked.id, event_id=locked.event_id,
                            checked_in_by_user_id=staff_id, method="manual")
            competing.add(newer)
            competing.flush()
            delayed = pool.submit(reverse_while_locked)
            pid = waiter_pid.get(timeout=15)
            deadline = monotonic() + 15
            # Observe PostgreSQL's actual wait graph, not elapsed-time guesses.
            while not competing.scalar(text("SELECT pg_backend_pid() = ANY(pg_blocking_pids(:pid))"), {"pid": pid}):
                assert monotonic() < deadline, "Reversal did not wait for the ticket lock"
            competing.commit()
        assert delayed.result(timeout=15) == 204

    with SessionLocal() as db:
        assert db.get(Ticket, UUID(ticket["id"])).status == "checked_in"
        active = db.scalars(select(CheckIn).where(
            CheckIn.ticket_id == UUID(ticket["id"]), CheckIn.reversed_at.is_(None))).all()
        assert [record.id for record in active] == [newer.id]
        assert db.get(CheckIn, UUID(first["id"])).reversed_at == original.reversed_at
    duplicate = check_in(api, staff, show["id"], ticketId=ticket["id"])
    assert duplicate.status_code == 409 and duplicate.json()["previousCheckIn"]["id"] == str(newer.id)


def test_manual_search_and_check_in_by_ticket_id(api):
    _, staff, show, kind = setup(api)
    buy(api, show["id"], kind["id"], attendees=[{"fullName": "Aigerim Test", "email": "aigerim@example.com"}])
    found = api.get(f"/v1/checkin/events/{show['id']}/attendees", token=staff, params={"q": "aig"}).json()["data"]
    assert [a["fullName"] for a in found] == ["Aigerim Test"]
    assert check_in(api, staff, show["id"], ticketId=found[0]["ticketId"]).status_code == 201
    assert api.get(f"/v1/checkin/events/{show['id']}/attendees", token=staff, params={"q": "a"}).status_code == 422
    totals = api.get(f"/v1/checkin/events/{show['id']}/attendees", token=staff).json()
    assert (totals["data"], totals["registered"], totals["checkedIn"]) == ([], 1, 1)


def test_search_exposes_only_active_check_in_id(api):
    owner, staff, show, kind = setup(api, can_reverse=True)
    tickets = buy(api, show["id"], kind["id"], quantity=2)["tickets"]
    path = f"/v1/checkin/events/{show['id']}/attendees"
    before = api.get(path, token=staff, params={"q": "guest"}).json()
    assert before["canReverseCheckIn"] is True
    assert all("checkInId" not in row and "checkedInAt" not in row for row in before["data"])
    ticket = tickets[0]
    first = check_in(api, staff, show["id"], ticketId=ticket["id"]).json()
    for token, endpoint in ((staff, path), (owner, f"/v1/organizer/events/{show['id']}/attendees")):
        rows = api.get(endpoint, token=token, params={"q": ticket["ticketNumber"]}).json()["data"]
        assert len(rows) == 1
        assert rows[0]["checkInId"] == first["id"]
        assert rows[0]["checkedInAt"] == first["checkedInAt"]
        assert rows[0]["status"] == "checked_in"
        original = next(row for row in before["data"] if row["ticketId"] == ticket["id"])
        assert {key: rows[0][key] for key in original if key != "status"} == {
            key: value for key, value in original.items() if key != "status"}
    assert api.delete(f"/v1/checkin/check-ins/{first['id']}", token=staff).status_code == 204
    reversed_rows = api.get(path, token=staff, params={"q": "guest"}).json()
    assert reversed_rows == before
    second = check_in(api, staff, show["id"], ticketId=ticket["id"]).json()
    assert second["id"] != first["id"]
    found = api.get(path, token=staff, params={"q": ticket["attendee"]["email"]}).json()["data"]
    assert found[0]["checkInId"] == second["id"]
    assert api.get(path, token=user(api, "stranger@example.com"), params={"q": "guest"}).status_code == 403
    assert api.get(path, params={"q": "guest"}).status_code == 401


@pytest.mark.parametrize("allowed", [True, False])
def test_reversal_capability_matches_delete_authorization(api, allowed):
    owner, staff, show, kind = setup(api, can_reverse=allowed)
    path = f"/v1/checkin/events/{show['id']}/attendees"
    for params in ({}, {"q": "guest"}):
        assert api.get(path, token=staff, params=params).json()["canReverseCheckIn"] is allowed
    assert api.get(path, token=owner).json()["canReverseCheckIn"] is True
    ticket = buy(api, show["id"], kind["id"])["tickets"][0]
    record = check_in(api, staff, show["id"], ticketId=ticket["id"]).json()
    # A client-supplied capability must never authorize a reversal.
    response = api.delete(f"/v1/checkin/check-ins/{record['id']}", token=staff,
                          params={"canReverseCheckIn": True})
    assert response.status_code == (204 if allowed else 403)
    assert scan(api, staff, show["id"], ticket["qrPayload"])["result"] == (
        "valid" if allowed else "already_used")


def test_stale_reversal_capability_does_not_authorize_delete(api):
    owner, staff, show, kind = setup(api, can_reverse=True)
    path = f"/v1/checkin/events/{show['id']}/attendees"
    assert api.get(path, token=staff).json()["canReverseCheckIn"] is True
    ticket = buy(api, show["id"], kind["id"])["tickets"][0]
    record = check_in(api, staff, show["id"], ticketId=ticket["id"]).json()
    assignment = api.get(f"/v1/organizer/events/{show['id']}/staff", token=owner).json()["data"][0]
    api.delete(f"/v1/organizer/events/{show['id']}/staff/{assignment['id']}", token=owner)
    assert api.get(path, token=staff).status_code == 403
    assert api.delete(f"/v1/checkin/check-ins/{record['id']}", token=staff).status_code == 403
    api.post(f"/v1/organizer/events/{show['id']}/staff", token=owner,
             json={"email": "staff@example.com", "canReverseCheckIn": False})
    assert api.get(path, token=staff).json()["canReverseCheckIn"] is False
    assert api.delete(f"/v1/checkin/check-ins/{record['id']}", token=staff).status_code == 403


def test_platform_admin_role_does_not_grant_checkin_or_reversal_access(api):
    owner, _, show, kind = setup(api)
    boss = admin(api)
    path = f"/v1/checkin/events/{show['id']}/attendees"
    assert api.get(path, token=boss).status_code == 403
    assert api.get("/v1/checkin/events", token=boss, params={"assignedOnly": True}).json()["data"] == []
    api.post(f"/v1/organizer/events/{show['id']}/staff", token=owner,
             json={"email": "admin@example.com", "canReverseCheckIn": False})
    assert api.get(path, token=boss).json()["canReverseCheckIn"] is False
    ticket = buy(api, show["id"], kind["id"])["tickets"][0]
    record = check_in(api, boss, show["id"], ticketId=ticket["id"]).json()
    assert api.delete(f"/v1/checkin/check-ins/{record['id']}", token=boss).status_code == 403


@pytest.mark.parametrize("query, expected", [(None, 200), ("", 422), ("a", 422), ("ab", 200),
                                             ("a" * 100, 200), ("a" * 101, 422)])
def test_search_length_boundaries(api, query, expected):
    _, staff, show, _ = setup(api)
    params = {} if query is None else {"q": query}
    assert api.get(f"/v1/checkin/events/{show['id']}/attendees", token=staff, params=params).status_code == expected


@pytest.mark.parametrize("length, expected", [(0, 422), (1, 200), (2000, 200), (2001, 422)])
def test_verify_qr_length_boundaries(api, length, expected):
    _, staff, show, _ = setup(api)
    response = api.post(f"/v1/checkin/events/{show['id']}/verify", token=staff, json={"qrPayload": "x" * length})
    assert response.status_code == expected


@pytest.mark.parametrize("body, expected", [
    ({}, 422), ({"qrPayload": ""}, 422), ({"ticketId": ""}, 422),
    ({"qrPayload": None, "ticketId": None}, 422),
    ({"qrPayload": "x", "ticketId": "x"}, 422),
    ({"qrPayload": "x"}, 409), ({"ticketId": "x"}, 409),
    ({"qrPayload": "x" * 2000}, 409), ({"qrPayload": "x" * 2001}, 422),
    ({"qrPayload": "x", "ticketId": None}, 409), ({"qrPayload": "x", "ticketId": ""}, 409),
    ({"ticketId": "x", "qrPayload": None}, 409), ({"ticketId": "x", "qrPayload": ""}, 409),
])
def test_admission_input_validation(api, body, expected):
    _, staff, show, _ = setup(api)
    assert check_in(api, staff, show["id"], **body).status_code == expected


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
