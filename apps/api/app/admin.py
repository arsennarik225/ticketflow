"""Promote an existing, verified account: python -m app.admin email@example.kz."""
import argparse

from sqlalchemy import select

from app.database import SessionLocal
from app.models import User
from app.services import audit


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("email")
    args = parser.parse_args()
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.email == args.email.lower()))
        if user is None or not user.email_verified or user.suspended_at:
            parser.error("Register and verify an active account before promoting it.")
        if not user.is_platform_admin:
            user.is_platform_admin = True
            audit.record(db, "user.promoted", "Granted Platform Admin through server CLI",
                         entity_type="user", entity_id=user.id, actor=user)
            db.commit()
        print(f"Platform Admin enabled for {user.email}")


if __name__ == "__main__":
    main()
