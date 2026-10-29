import pytest

from app.admin import main
from tests.helpers import user


def test_server_cli_promotes_a_verified_account_and_is_idempotent(api, monkeypatch):
    token = user(api, "first-admin@example.com")
    monkeypatch.setattr("sys.argv", ["app.admin", "first-admin@example.com"])
    main()
    main()
    assert "platform_admin" in api.get("/v1/me", token=token).json()["roles"]
    assert api.get("/v1/admin/settings", token=token).status_code == 200


def test_server_cli_does_not_promote_an_unverified_account(api, monkeypatch):
    token = user(api, "unverified@example.com", verified=False)
    monkeypatch.setattr("sys.argv", ["app.admin", "unverified@example.com"])
    with pytest.raises(SystemExit):
        main()
    assert "platform_admin" not in api.get("/v1/me", token=token).json()["roles"]
