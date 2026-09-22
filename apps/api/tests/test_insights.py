"""Organizer analytics (§4.15) and the activity timeline (§4.16), checked against numbers
worked out by hand."""
from tests.helpers import (
    activate, admin, buy, campaign_token, event, in_days, organizer, ticket_type,
)


def test_analytics_match_the_records(api):
    token = organizer(api)
    show = event(api, token)
    standard = ticket_type(api, token, show["id"], price=500000, quantity=10)
    vip = ticket_type(api, token, show["id"], name="VIP", price=1500000, quantity=5)
    activate(api, token, show["id"])
    api.post(f"/v1/organizer/events/{show['id']}/publish", token=token)
    promo = campaign_token(api, token, show["id"])  # 20 % off
    buy(api, show["id"], standard["id"], 2, campaignToken=promo)  # 10 000 KZT - 2 000 = 8 000
    vip_order = buy(api, show["id"], vip["id"], 1)  # 15 000
    refunded = buy(api, show["id"], standard["id"], 1)  # 5 000, refunded below
    api.post(f"/v1/organizer/orders/{refunded['id']}/refund", token=token, json={"reason": "x"},
             headers={"Idempotency-Key": "r"})
    api.post(f"/v1/checkin/events/{show['id']}/check-ins", token=token,
             json={"qrPayload": vip_order["tickets"][0]["qrPayload"]})

    stats = api.get(f"/v1/organizer/events/{show['id']}/analytics", token=token).json()
    assert (stats["capacity"], stats["ticketsSold"], stats["ticketsRemaining"]) == (15, 3, 12)
    assert stats["percentSold"] == 20.0
    money = {k: stats[k]["amount"] for k in ("grossSales", "discounts", "refunds", "fees", "netRevenue",
                                              "estimatedPayout")}
    assert money == {"grossSales": 3000000, "discounts": 200000, "refunds": 500000,
                     "fees": 20000 + 37500,  # 2.5 % of the two orders that stand
                     "netRevenue": 2300000, "estimatedPayout": 2242500}
    assert [(d["ticketsSold"], d["grossSales"]["amount"]) for d in stats["salesOverTime"]] == [(4, 3000000)]
    by_type = {t["name"]: (t["sold"], t["remaining"], t["grossSales"]["amount"]) for t in stats["byTicketType"]}
    assert by_type == {"General": (2, 8, 1500000), "VIP": (1, 4, 1500000)}
    promo_row = stats["campaigns"][0]
    assert (promo_row["redemptions"], promo_row["ticketsSold"], promo_row["netRevenue"]["amount"]) == (1, 2, 800000)
    assert stats["attendance"] == {"registered": 3, "checkedIn": 1, "absent": 2, "checkInPercent": 33.3}

    vip_only = api.get(f"/v1/organizer/events/{show['id']}/analytics", token=token,
                       params={"ticketTypeId": vip["id"]}).json()
    assert (vip_only["capacity"], vip_only["ticketsSold"]) == (5, 1) and "discounts" not in vip_only
    future = api.get(f"/v1/organizer/events/{show['id']}/analytics", token=token,
                     params={"from": in_days(1)}).json()
    assert future["grossSales"]["amount"] == 0 and future["salesOverTime"] == []
    assert api.get(f"/v1/organizer/events/{show['id']}/analytics", token=organizer(api, "b@example.com")).status_code == 403
    assert api.get(f"/v1/organizer/events/{show['id']}/analytics", token=admin(api)).status_code == 200


def test_history_filters(api):
    token = organizer(api)
    show = event(api, token)
    ticket_type(api, token, show["id"])
    api.post(f"/v1/organizer/events/{show['id']}/publish", token=token)
    url = f"/v1/organizer/events/{show['id']}/history"
    everything = api.get(url, token=token).json()
    assert [e["action"] for e in everything["data"]] == ["event.published", "ticket_type.created", "event.created"]
    assert everything["data"][0]["actorName"] == "Olga Organizer"
    assert api.get(url, token=token, params={"action": "event."}).json()["total"] == 2
    assert api.get(url, token=token, params={"from": in_days(1)}).json()["total"] == 0
