"""Paid-sales activation (§3.2, §4.5): paid tickets stay off sale until every step is done."""
from tests.helpers import activate, event, guests, on_sale, organizer, start_checkout, ticket_type, user


def test_paid_tickets_need_activation(api):
    token = organizer(api)
    show = event(api, token)
    kind = ticket_type(api, token, show["id"], price=500000)
    published = api.post(f"/v1/organizer/events/{show['id']}/publish", token=token).json()
    assert published["paidSalesActive"] is False and published["ticketTypes"][0]["onSale"] is False
    blocked = start_checkout(api, show["id"], [(kind["id"], 1)], attendees=guests(1))
    assert blocked.status_code == 409 and blocked.json()["error"]["code"] == "paid_sales_not_active"

    checklist = api.get(f"/v1/organizer/events/{show['id']}/activation", token=token).json()
    assert checklist["activationFee"]["amount"] == 500000
    assert checklist["steps"] == {"hasPaidTicketType": True, "identityVerified": True, "feePaid": False,
                                  "payoutAccountConnected": True, "termsAccepted": False}
    fee = api.post(f"/v1/organizer/events/{show['id']}/activation/pay-fee", token=token).json()
    assert fee["purpose"] == "activation_fee" and fee["simulated"] is True and fee["amount"]["amount"] == 500000
    assert api.post(f"/v1/organizer/events/{show['id']}/activation/pay-fee", token=token).status_code == 409
    outdated = api.post(f"/v1/organizer/events/{show['id']}/activation/accept-terms", token=token,
                        json={"termsVersion": "2020-01"})
    assert outdated.status_code == 422 and outdated.json()["error"]["code"] == "terms_version_mismatch"
    activate_terms = api.post(f"/v1/organizer/events/{show['id']}/activation/accept-terms", token=token,
                              json={"termsVersion": "2026-09"}).json()
    assert activate_terms["active"] is True
    assert start_checkout(api, show["id"], [(kind["id"], 1)], attendees=guests(1)).status_code == 201


def test_free_events_need_no_activation(api):
    token = organizer(api)
    show, kind = on_sale(api, token)
    fee = api.post(f"/v1/organizer/events/{show['id']}/activation/pay-fee", token=token)
    assert fee.status_code == 409 and fee.json()["error"]["code"] == "no_paid_ticket_type"
    assert start_checkout(api, show["id"], [(kind["id"], 1)], attendees=guests(1)).status_code == 201


def test_activation_applies_to_one_event_only(api):
    token = organizer(api)
    on_sale(api, token, price=500000)
    other = event(api, token)
    ticket_type(api, token, other["id"], price=100000)
    assert api.get(f"/v1/organizer/events/{other['id']}/activation", token=token).json()["active"] is False


def test_identity_and_payout_are_required(api):
    token = user(api, "o@example.com")
    api.put("/v1/me/organizer-profile", token=token, json={"displayName": "O", "contactEmail": "o@example.com"})
    show = event(api, token)
    ticket_type(api, token, show["id"], price=100000)
    api.post(f"/v1/organizer/events/{show['id']}/activation/pay-fee", token=token)
    checklist = api.post(f"/v1/organizer/events/{show['id']}/activation/accept-terms", token=token,
                         json={"termsVersion": "2026-09"}).json()
    assert checklist["active"] is False
    assert checklist["steps"]["identityVerified"] is False and checklist["steps"]["payoutAccountConnected"] is False
    api.post("/v1/me/identity-verification", token=token, json={"legalName": "O LLP"})
    api.put("/v1/me/payout-account", token=token, json={"accountHolderName": "O", "sandboxAccountToken": "acct_1111"})
    assert api.get(f"/v1/organizer/events/{show['id']}/activation", token=token).json()["active"] is True


def test_helper_activation_is_complete(api):
    token = organizer(api)
    show = event(api, token)
    ticket_type(api, token, show["id"], price=100)
    activate(api, token, show["id"])
