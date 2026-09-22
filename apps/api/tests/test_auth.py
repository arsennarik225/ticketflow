"""Accounts (§4.1): registration, email verification, sessions, password reset, organizer profile."""
from tests.helpers import PASSWORD, emails_to, event, link_token, user


def test_register_verify_and_sign_in(api):
    created = api.post("/v1/auth/register", json={"email": "Dana@Example.com", "password": PASSWORD,
                                                  "fullName": "Dana"})
    assert created.status_code == 201
    assert created.json() | {"id": None} == {"id": None, "email": "dana@example.com", "emailVerified": False,
                                             "fullName": "Dana", "roles": ["attendee"]}
    assert emails_to("dana@example.com")[0].kind == "verify_email"
    tokens = api.post("/v1/auth/verify-email", json={"token": link_token("dana@example.com", "/verify-email")}).json()
    assert tokens["user"]["emailVerified"] is True and tokens["expiresIn"] == 900
    assert api.get("/v1/me", token=tokens["accessToken"]).json()["email"] == "dana@example.com"


def test_verification_link_works_once(api):
    api.post("/v1/auth/register", json={"email": "a@example.com", "password": PASSWORD, "fullName": "A"})
    token = link_token("a@example.com", "/verify-email")
    assert api.post("/v1/auth/verify-email", json={"token": token}).status_code == 200
    reused = api.post("/v1/auth/verify-email", json={"token": token})
    assert reused.status_code == 410 and reused.json()["error"]["code"] == "token_invalid"


def test_email_can_register_only_once(api):
    user(api, "a@example.com")
    again = api.post("/v1/auth/register", json={"email": "A@EXAMPLE.com", "password": PASSWORD, "fullName": "A"})
    assert again.status_code == 409 and again.json()["error"]["code"] == "email_taken"


def test_wrong_password_and_unknown_email_look_the_same(api):
    user(api, "a@example.com")
    for email, password in (("a@example.com", "wrong-password"), ("nobody@example.com", PASSWORD)):
        response = api.post("/v1/auth/login", json={"email": email, "password": password})
        assert response.status_code == 401 and response.json()["error"]["code"] == "invalid_credentials"


def test_refresh_rotates_the_refresh_token(api):
    user(api, "a@example.com")
    first = api.post("/v1/auth/login", json={"email": "a@example.com", "password": PASSWORD}).json()
    second = api.post("/v1/auth/refresh", json={"refreshToken": first["refreshToken"]})
    assert second.status_code == 200
    assert api.post("/v1/auth/refresh", json={"refreshToken": first["refreshToken"]}).status_code == 401
    assert api.get("/v1/me", token=second.json()["accessToken"]).status_code == 200


def test_logout_ends_the_session(api):
    token = user(api, "a@example.com")
    assert api.post("/v1/auth/logout", token=token).status_code == 204
    after = api.get("/v1/me", token=token)
    assert after.status_code == 401 and after.json()["error"]["code"] == "session_ended"


def test_bad_tokens_are_rejected(api):
    assert api.get("/v1/me").json()["error"]["code"] == "not_authenticated"
    assert api.get("/v1/me", token="garbage").json()["error"]["code"] == "invalid_token"


def test_password_reset_signs_out_everywhere(api):
    old_session = user(api, "a@example.com")
    assert api.post("/v1/auth/password/forgot", json={"email": "a@example.com"}).status_code == 202
    assert api.post("/v1/auth/password/forgot", json={"email": "nobody@example.com"}).status_code == 202
    assert emails_to("nobody@example.com") == []
    token = link_token("a@example.com", "/reset-password")
    assert api.post("/v1/auth/password/reset", json={"token": token, "password": "new-password-1"}).status_code == 204
    assert api.get("/v1/me", token=old_session).status_code == 401
    assert api.post("/v1/auth/login", json={"email": "a@example.com", "password": "new-password-1"}).status_code == 200
    assert api.post("/v1/auth/password/reset", json={"token": token, "password": "another-one"}).status_code == 410


def test_organizer_profile_and_simulated_verification(api):
    token = user(api, "olga@example.com")
    assert api.get("/v1/me/organizer-profile", token=token).status_code == 404
    saved = api.put("/v1/me/organizer-profile", token=token,
                    json={"displayName": "Olga Events", "contactEmail": "OLGA@example.com"})
    assert "organizer" in saved.json()["roles"]
    verified = api.post("/v1/me/identity-verification", token=token, json={"legalName": "Olga Events LLP"})
    assert verified.status_code == 202 and verified.json() == {"status": "verified", "simulated": True}
    payout = api.put("/v1/me/payout-account", token=token,
                     json={"accountHolderName": "Olga", "sandboxAccountToken": "acct_test_9876"}).json()
    assert payout == {"status": "connected", "maskedAccount": "****9876", "simulated": True}
    assert emails_to("olga@example.com")[-1].kind == "payout_status"
    profile = api.get("/v1/me/organizer-profile", token=token).json()
    assert profile["identityStatus"] == "verified" and profile["contactEmail"] == "olga@example.com"
    assert profile["payoutAccount"]["status"] == "connected"
    assert event(api, token)["status"] == "draft"


def test_organizer_endpoints_need_a_profile(api):
    token = user(api, "a@example.com")
    response = api.get("/v1/organizer/events", token=token)
    assert response.status_code == 403 and response.json()["error"]["code"] == "organizer_profile_required"


def test_notifications_list_my_emails(api):
    token = user(api, "a@example.com")
    notes = api.get("/v1/me/notifications", token=token).json()
    assert notes["total"] == 1 and notes["data"][0]["kind"] == "verify_email"
