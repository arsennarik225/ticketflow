"""Promo codes and Campaign QR Codes (§4.14). Discounts are always computed by the server."""
from tests.helpers import (
    buy, campaign, campaign_token, confirm, event, guests, in_days, on_sale, organizer, start_checkout, ticket_type,
)


def apply(api, session_id: str, **body):
    return api.put(f"/v1/checkout/sessions/{session_id}/promo-code", json=body)


def test_code_discount_and_campaign_report(api):
    token = organizer(api)
    show, kind = on_sale(api, token, price=500000)
    promo = campaign(api, token, show["id"])
    assert promo["code"].startswith("SPRING-") and promo["redemptions"] == 0
    session = start_checkout(api, show["id"], [(kind["id"], 2)], attendees=guests(2)).json()
    applied = apply(api, session["id"], code=promo["code"].lower()).json()
    assert applied["discount"]["amount"] == 200000 and applied["total"]["amount"] == 800000
    assert applied["appliedPromo"]["code"] == promo["code"]
    order = confirm(api, session["id"]).json()
    assert order["appliedPromo"]["campaignId"] == promo["id"] and order["total"]["amount"] == 800000
    report = api.get(f"/v1/organizer/events/{show['id']}/campaigns", token=token).json()["data"][0]
    assert (report["redemptions"], report["orders"], report["ticketsSold"]) == (1, 1, 2)
    assert report["grossRevenue"]["amount"] == 1000000 and report["discountTotal"]["amount"] == 200000
    assert report["revenue"]["amount"] == 800000


def test_campaign_qr_link_applies_the_promo(api):
    token = organizer(api)
    show, kind = on_sale(api, token, price=500000)
    link_token = campaign_token(api, token, show["id"])
    page = api.get(f"/v1/events/{show['id']}", params={"campaignToken": link_token}).json()
    assert page["appliedPromo"]["percentOff"] == 20 and "promoError" not in page
    session = start_checkout(api, show["id"], [(kind["id"], 1)], attendees=guests(1), campaignToken=link_token).json()
    assert session["discount"]["amount"] == 100000
    bad = start_checkout(api, show["id"], [(kind["id"], 1)], attendees=guests(1), campaignToken="nope")
    assert bad.status_code == 422 and bad.json()["error"]["code"] == "promo_code_invalid"


def test_campaign_qr_image_is_a_png(api):
    token = organizer(api)
    show, _ = on_sale(api, token)
    promo = campaign(api, token, show["id"])
    image = api.get(f"/v1/organizer/campaigns/{promo['id']}/qr", token=token)
    assert image.status_code == 200 and image.content.startswith(bytes([0x89]) + b"PNG")


def test_unusable_codes_are_rejected_clearly(api):
    token = organizer(api)
    show = event(api, token)
    standard = ticket_type(api, token, show["id"])
    vip = ticket_type(api, token, show["id"], name="VIP")
    api.post(f"/v1/organizer/events/{show['id']}/publish", token=token)
    codes = {
        "promo_code_expired": campaign(api, token, show["id"], validUntil=in_days(-1))["code"],
        "promo_code_disabled": campaign(api, token, show["id"], disabled=True)["code"],
        "promo_code_not_started": campaign(api, token, show["id"], validFrom=in_days(1))["code"],
        "promo_code_not_applicable": campaign(api, token, show["id"], ticketTypeIds=[vip["id"]])["code"],
        "promo_code_invalid": "NO-SUCH-CODE",
    }
    session = start_checkout(api, show["id"], [(standard["id"], 1)], attendees=guests(1)).json()
    for expected, code in codes.items():
        response = apply(api, session["id"], code=code)
        assert response.status_code == 422 and response.json()["error"]["code"] == expected
    expired_link = campaign_token(api, token, show["id"], validUntil=in_days(-1))
    page = api.get(f"/v1/events/{show['id']}", params={"campaignToken": expired_link}).json()
    assert page["promoError"]["code"] == "promo_code_expired" and "appliedPromo" not in page
    assert apply(api, session["id"], code="A", campaignToken="B").status_code == 422


def test_redemption_limit_counts_open_checkouts(api):
    token = organizer(api)
    show, kind = on_sale(api, token)
    promo = campaign(api, token, show["id"], maxRedemptions=1)
    first = start_checkout(api, show["id"], [(kind["id"], 1)], attendees=guests(1)).json()
    second = start_checkout(api, show["id"], [(kind["id"], 1)], attendees=guests(1)).json()
    assert apply(api, first["id"], code=promo["code"]).status_code == 200
    assert apply(api, second["id"], code=promo["code"]).json()["error"]["code"] == "promo_code_exhausted"
    api.delete(f"/v1/checkout/sessions/{first['id']}")
    assert apply(api, second["id"], code=promo["code"]).status_code == 200


def test_fixed_discount_never_goes_below_zero(api):
    token = organizer(api)
    show, kind = on_sale(api, token, price=300000)
    promo = campaign(api, token, show["id"], discountType="fixed_amount", amountOff={"amount": 1000000, "currency": "KZT"})
    session = start_checkout(api, show["id"], [(kind["id"], 1)], attendees=guests(1)).json()
    applied = apply(api, session["id"], code=promo["code"]).json()
    assert applied["discount"]["amount"] == 300000 and applied["total"]["amount"] == 0
    assert applied["requiresPayment"] is False
    assert confirm(api, session["id"], pay=None).json()["total"]["amount"] == 0


def test_disabling_a_campaign(api):
    token = organizer(api)
    show, kind = on_sale(api, token)
    promo = campaign(api, token, show["id"])
    buy(api, show["id"], kind["id"], campaignToken=promo["campaignUrl"].split("campaign=")[1])
    too_low = api.patch(f"/v1/organizer/campaigns/{promo['id']}", token=token, json={"maxRedemptions": 0})
    assert too_low.status_code == 409 and too_low.json()["error"]["code"] == "max_below_redemptions"
    changed = api.patch(f"/v1/organizer/campaigns/{promo['id']}", token=token,
                        json={"discountType": "fixed_amount", "amountOff": {"amount": 5000, "currency": "KZT"}}).json()
    assert changed["amountOff"]["amount"] == 5000 and "percentOff" not in changed
    assert api.patch(f"/v1/organizer/campaigns/{promo['id']}", token=token, json={"disabled": True}).json()["disabled"]
    session = start_checkout(api, show["id"], [(kind["id"], 1)], attendees=guests(1)).json()
    assert apply(api, session["id"], code=promo["code"]).json()["error"]["code"] == "promo_code_disabled"
    actions = [h["action"] for h in api.get(f"/v1/organizer/events/{show['id']}/history", token=token,
                                           params={"action": "campaign"}).json()["data"]]
    assert actions == ["campaign.disabled", "campaign.updated", "campaign.created"]


def test_code_from_another_event_is_rejected(api):
    token = organizer(api)
    first, _ = on_sale(api, token)
    second, kind = on_sale(api, token)
    promo = campaign(api, token, first["id"])
    session = start_checkout(api, second["id"], [(kind["id"], 1)], attendees=guests(1)).json()
    assert apply(api, session["id"], code=promo["code"]).json()["error"]["code"] == "promo_code_invalid"
