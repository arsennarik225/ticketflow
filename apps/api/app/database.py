"""Engine, sessions, and the request-scoped session dependency."""
from datetime import datetime
from uuid import UUID

from sqlalchemy import DateTime, Text, Uuid, create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import settings

engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
    connect_args={"options": "-c timezone=utc"},
)
SessionLocal = sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    type_annotation_map = {datetime: DateTime(timezone=True), str: Text, UUID: Uuid}


def get_db():
    """One session per request. Endpoints call db.commit() themselves; anything
    left uncommitted is rolled back when the request ends."""
    with SessionLocal() as db:
        yield db
