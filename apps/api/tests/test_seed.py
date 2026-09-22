"""The demo data loads once and gives every team a working starting point."""
from sqlalchemy import func, select

from app.database import SessionLocal
from app.models import User
from app.seed import PASSWORD, seed_if_empty


def test_demo_data(api):
    seed_if_empty()
    seed_if_empty()  # a second run changes nothing
    with SessionLocal() as db:
        assert db.scalar(select(func.count()).select_from(User)) == 4

    def sign_in(email):
        return api.post("/v1/auth/login", json={"email": email, "password": PASSWORD}).json()["accessToken"]

    organizer = sign_in("organizer@biletflow.kz")
    assert api.get("/v1/organizer/events", token=organizer).json()["total"] == 5
    public = {e["title"]: e for e in api.get("/v1/events").json()["data"]}
    assert public.keys() == {"Almaty Tech Meetup", "Astana Jazz Night", "Almaty Philharmonic Gala"}
    statuses = {e["title"]: e["status"] for e in api.get("/v1/organizer/events", token=organizer).json()["data"]}
    assert statuses["Shymkent Startup Pitch"] == "completed" and statuses["Ural Film Festival"] == "draft"
    gala = public["Almaty Philharmonic Gala"]
    assert gala["paidSalesActive"] is True
    seats = [s for sec in api.get(f"/v1/events/{gala['id']}/seats").json()["sections"]
             for r in sec["rows"] for s in r["seats"]]
    assert sum(s["status"] == "sold" for s in seats) == 3 and sum(s["status"] == "unavailable" for s in seats) == 2
    staff = sign_in("staff@biletflow.kz")
    assert len(api.get("/v1/checkin/events", token=staff).json()["data"]) == 3
    attendee = sign_in("attendee@biletflow.kz")
    assert api.get("/v1/me/orders", token=attendee).json()["total"] == 3
    assert api.get("/v1/me", token=attendee).json()["language"] == "kk"
    assert api.get("/v1/support/cases", token=attendee).json()["total"] == 1
    admin = sign_in("admin@biletflow.kz")
    assert "platform_admin" in api.get("/v1/me", token=admin).json()["roles"]
