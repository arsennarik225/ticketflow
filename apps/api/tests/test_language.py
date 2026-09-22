"""Emails and PDF tickets in Kazakh, Russian, or English (SRS §7)."""
from tests.helpers import PASSWORD, buy, confirm, emails_to, in_days, link_token, on_sale, organizer, start_checkout


def register(api, email: str, **extra):
    return api.post("/v1/auth/register", json={"email": email, "password": PASSWORD, "fullName": "Aru"} | extra)


def test_account_language_drives_emails(api):
    assert register(api, "aru@example.com", language="kk").json()["language"] == "kk"
    assert emails_to("aru@example.com")[-1].subject == "BiletFlow email мекенжайын растаңыз"
    token = api.post("/v1/auth/verify-email", json={"token": link_token("aru@example.com", "/verify-email")}).json()["accessToken"]
    changed = api.patch("/v1/me", token=token, json={"language": "en", "fullName": "Aru B."}).json()
    assert (changed["language"], changed["fullName"]) == ("en", "Aru B.")
    api.post("/v1/auth/password/forgot", json={"email": "aru@example.com"})
    assert emails_to("aru@example.com")[-1].subject == "Reset your BiletFlow password"
    assert api.patch("/v1/me", token=token, json={"language": "de"}).status_code == 422


def test_default_language_is_russian(api):
    register(api, "a@example.com")
    assert emails_to("a@example.com")[-1].subject == "Подтвердите email в BiletFlow"


def test_guest_order_language(api):
    token = organizer(api)
    show, kind = on_sale(api, token)
    buy(api, show["id"], kind["id"], attendees=[{"fullName": "Aru", "email": "kk@example.com"}], language="kk")
    buy(api, show["id"], kind["id"], attendees=[{"fullName": "Ann", "email": "en@example.com"}], language="en")
    buy(api, show["id"], kind["id"], attendees=[{"fullName": "Ivan", "email": "ru@example.com"}])
    assert emails_to("kk@example.com")[-1].subject.startswith("Сіздің билеттеріңіз")
    assert emails_to("en@example.com")[-1].subject.startswith("Your tickets")
    assert emails_to("ru@example.com")[-1].subject.startswith("Ваши билеты")
    api.patch(f"/v1/organizer/events/{show['id']}", token=token, json={"startsAt": in_days(40), "endsAt": in_days(40.1)})
    assert emails_to("kk@example.com")[-1].subject.startswith("Іс-шарадағы өзгерістер")
    assert emails_to("en@example.com")[-1].subject.startswith("Event update")


def test_pdf_ticket_in_every_language(api):
    token = organizer(api)
    show, kind = on_sale(api, token)
    for language in ("kk", "ru", "en"):
        email = f"{language}@example.com"
        register(api, email, language=language)
        buyer = api.post("/v1/auth/verify-email", json={"token": link_token(email, "/verify-email")}).json()["accessToken"]
        session = start_checkout(api, show["id"], [(kind["id"], 1)], token=buyer).json()
        ticket = confirm(api, session["id"], token=buyer).json()["tickets"][0]
        pdf = api.get(f"/v1/me/tickets/{ticket['id']}/pdf", token=buyer)
        assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF"), language
