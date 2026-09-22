"""Orders, tickets, refunds, and cancellations (§4.7, §4.9)."""
from tests.helpers import admin, buy, emails_to, on_sale, organizer, user


def refund(api, token, order_id, key="refund-1"):
    return api.post(f"/v1/organizer/orders/{order_id}/refund", token=token, json={"reason": "Sick"},
                    headers={"Idempotency-Key": key})


def test_refund_invalidates_the_tickets(api):
    token = organizer(api)
    show, kind = on_sale(api, token, price=500000)
    ann = user(api, "ann@example.com")
    order = buy(api, show["id"], kind["id"], 2, token=ann)
    first = refund(api, token, order["id"])
    assert first.status_code == 200 and first.json()["amount"]["amount"] == 1000000 and first.json()["simulated"]
    assert refund(api, token, order["id"]).json()["id"] == first.json()["id"]
    assert refund(api, token, order["id"], key="refund-2").json()["error"]["code"] == "order_already_refunded"
    statuses = {a["status"] for a in api.get(f"/v1/organizer/events/{show['id']}/attendees", token=token).json()["data"]}
    assert statuses == {"refunded"}
    kind_now = api.get(f"/v1/organizer/events/{show['id']}/ticket-types", token=token).json()["data"][0]
    assert (kind_now["sold"], kind_now["refunded"], kind_now["available"]) == (0, 2, 100)
    assert emails_to("ann@example.com")[-1].kind == "order_refunded"
    assert api.get(f"/v1/me/orders/{order['id']}", token=ann).json()["payment"]["status"] == "refunded"
    pdf = api.get(f"/v1/me/tickets/{order['tickets'][0]['id']}/pdf", token=ann)
    assert pdf.status_code == 409 and pdf.json()["error"]["code"] == "ticket_not_valid"
    assert len(api.get("/v1/admin/payments", token=admin(api), params={"status": "refunded"}).json()["data"]) == 1


def test_free_orders_are_cancelled_not_refunded(api):
    token = organizer(api)
    free_show, free_kind = on_sale(api, token)
    free_order = buy(api, free_show["id"], free_kind["id"])
    assert refund(api, token, free_order["id"]).json()["error"]["code"] == "order_is_free"
    cancelled = api.post(f"/v1/organizer/orders/{free_order['id']}/cancel", token=token, json={"reason": "Spam"})
    assert cancelled.json()["status"] == "cancelled" and cancelled.json()["tickets"][0]["status"] == "cancelled"
    paid_show, paid_kind = on_sale(api, token, price=100000)
    paid_order = buy(api, paid_show["id"], paid_kind["id"])
    paid = api.post(f"/v1/organizer/orders/{paid_order['id']}/cancel", token=token, json={"reason": "x"})
    assert paid.status_code == 409 and paid.json()["error"]["code"] == "order_is_paid"


def test_only_the_organizer_refunds(api):
    token = organizer(api)
    show, kind = on_sale(api, token, price=100000)
    order = buy(api, show["id"], kind["id"])
    assert refund(api, organizer(api, "other@example.com"), order["id"]).status_code == 403


def test_my_orders_tickets_and_printable_pdf(api):
    token = organizer(api)
    show, kind = on_sale(api, token)
    ann = user(api, "ann@example.com")
    order = buy(api, show["id"], kind["id"], token=ann)
    ticket = order["tickets"][0]
    assert api.get("/v1/me/orders", token=ann).json()["total"] == 1
    phone = api.get(f"/v1/me/tickets/{ticket['id']}", token=ann).json()
    assert phone["qrPayload"] == ticket["qrPayload"] and phone["pdfUrl"].endswith(f"/v1/me/tickets/{ticket['id']}/pdf")
    pdf = api.get(f"/v1/me/tickets/{ticket['id']}/pdf", token=ann)
    assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF")
    stranger = user(api, "x@example.com")
    assert api.get(f"/v1/me/orders/{order['id']}", token=stranger).status_code == 404
    assert api.get(f"/v1/me/tickets/{ticket['id']}/pdf", token=stranger).status_code == 404


def test_pdf_prints_kazakh_and_russian_names(api):
    token = organizer(api)
    show, kind = on_sale(api, token, title="Қазақ түні", venueName="Дворец")
    ann = user(api, "ann@example.com", "Әйгерім Сәрсенова")
    ticket = buy(api, show["id"], kind["id"], token=ann)["tickets"][0]
    assert api.get(f"/v1/me/tickets/{ticket['id']}/pdf", token=ann).status_code == 200


def test_ticket_holder_sees_a_ticket_bought_for_them(api):
    token = organizer(api)
    show, kind = on_sale(api, token)
    buyer = user(api, "buyer@example.com")
    order = buy(api, show["id"], kind["id"], token=buyer, attendees=[{"fullName": "Bob", "email": "bob@example.com"}])
    bob = user(api, "bob@example.com")
    assert api.get(f"/v1/me/tickets/{order['tickets'][0]['id']}", token=bob).status_code == 200
    assert api.get("/v1/me/orders", token=bob).json()["total"] == 0


def test_organizer_lists_orders_and_attendees(api):
    token = organizer(api)
    show, kind = on_sale(api, token)
    buy(api, show["id"], kind["id"], attendees=[{"fullName": "Zara", "email": "zara@example.com"}])
    buy(api, show["id"], kind["id"], attendees=[{"fullName": "Adil", "email": "adil@example.com"}])
    orders = api.get(f"/v1/organizer/events/{show['id']}/orders", token=token, params={"pageSize": 1}).json()
    assert orders["total"] == 2 and len(orders["data"]) == 1
    people = api.get(f"/v1/organizer/events/{show['id']}/attendees", token=token).json()["data"]
    assert [p["fullName"] for p in people] == ["Adil", "Zara"]
    found = api.get(f"/v1/organizer/events/{show['id']}/attendees", token=token, params={"q": "zara@"}).json()
    assert found["total"] == 1


def test_staff_list_and_removal(api):
    token = organizer(api)
    show, _ = on_sale(api, token)
    assignment = api.post(f"/v1/organizer/events/{show['id']}/staff", token=token,
                          json={"email": "s@example.com"}).json()
    assert len(api.get(f"/v1/organizer/events/{show['id']}/staff", token=token).json()["data"]) == 1
    url = f"/v1/organizer/events/{show['id']}/staff/{assignment['id']}"
    assert api.delete(url, token=organizer(api, "other@example.com")).status_code == 403
    assert api.delete(url, token=token).status_code == 204
    assert api.get(f"/v1/organizer/events/{show['id']}/staff", token=token).json()["data"] == []
