from unittest.mock import MagicMock

import pytest

from app.config import settings
from app.services import notify
from tests.helpers import confirm, emails_to, on_sale, organizer, start_checkout, user


@pytest.mark.parametrize("ssl,starttls", [(False, False), (False, True), (True, False)])
def test_mail_transport_supports_authenticated_smtp(monkeypatch, ssl, starttls):
    monkeypatch.setattr(settings, "smtp_host", "smtp.example.kz")
    monkeypatch.setattr(settings, "smtp_port", 465 if ssl else 587)
    monkeypatch.setattr(settings, "smtp_username", "sender")
    monkeypatch.setattr(settings, "smtp_password", "test-secret")
    monkeypatch.setattr(settings, "smtp_ssl", ssl)
    monkeypatch.setattr(settings, "smtp_starttls", starttls)
    transport = MagicMock()
    monkeypatch.setattr(notify.smtplib, "SMTP_SSL" if ssl else "SMTP", transport)
    notify._deliver("test@example.kz", "Subject", "Body", [])
    smtp = transport.return_value.__enter__.return_value
    assert smtp.starttls.called == starttls
    smtp.login.assert_called_once_with("sender", "test-secret")
    smtp.send_message.assert_called_once()


@pytest.mark.parametrize("failure_stage", ["connect", "send"])
def test_smtp_failure_keeps_confirmed_order_and_downloadable_ticket(api, monkeypatch, caplog, failure_stage):
    owner = organizer(api)
    event, ticket_type = on_sale(api, owner, price=500000)
    buyer = user(api, "buyer@example.kz")
    checkout = start_checkout(api, event["id"], [(ticket_type["id"], 1)], token=buyer).json()

    monkeypatch.setattr(settings, "smtp_host", "smtp.example.kz")
    monkeypatch.setattr(settings, "smtp_port", 1025)
    monkeypatch.setattr(settings, "smtp_ssl", False)
    monkeypatch.setattr(settings, "smtp_starttls", False)
    transport = MagicMock()
    if failure_stage == "connect":
        transport.side_effect = OSError("SMTP unavailable")
    else:
        transport.return_value.__enter__.return_value.send_message.side_effect = OSError("SMTP unavailable")
    monkeypatch.setattr(notify.smtplib, "SMTP", transport)

    response = confirm(api, checkout["id"], token=buyer, key="smtp-failure-order")
    assert response.status_code == 201
    order = response.json()
    assert order["payment"]["status"] == "succeeded" and order["payment"]["simulated"]
    assert api.get(f"/v1/me/orders/{order['id']}", token=buyer).json()["id"] == order["id"]
    assert api.get("/v1/me/orders", token=buyer).json()["total"] == 1
    ticket = order["tickets"][0]
    pdf = api.get(f"/v1/me/tickets/{ticket['id']}/pdf", token=buyer)
    assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF")
    assert api.post(f"/v1/checkin/events/{event['id']}/verify", token=owner,
                    json={"qrPayload": ticket["qrPayload"]}).json()["result"] == "valid"
    assert emails_to("buyer@example.kz")[-1].kind == "order_confirmed"
    assert "Could not send email" in caplog.text

    repeat = confirm(api, checkout["id"], token=buyer, key="smtp-failure-order")
    assert repeat.status_code == 201 and repeat.json()["id"] == order["id"]
    assert api.get("/v1/me/orders", token=buyer).json()["total"] == 1
    transport.assert_called_once()
