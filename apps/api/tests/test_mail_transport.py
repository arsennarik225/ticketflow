from unittest.mock import MagicMock

import pytest

from app.config import settings
from app.services import notify


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
