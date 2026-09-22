"""The ORM models must match db/schema.sql, and the database guards its own rules."""
import uuid

import pytest
from sqlalchemy import inspect, text
from sqlalchemy.exc import DBAPIError

import app.models  # noqa: F401  (registers every table)
from app.database import Base, engine


def test_models_match_schema_sql():
    inspector = inspect(engine)
    assert set(inspector.get_table_names()) == set(Base.metadata.tables)
    for name, table in Base.metadata.tables.items():
        in_database = {c["name"]: c["nullable"] for c in inspector.get_columns(name)}
        in_models = {c.name: c.nullable for c in table.columns}
        assert in_database == in_models, f"{name}: schema.sql and models.py differ"


def test_audit_log_is_append_only():
    with engine.begin() as connection:
        connection.execute(text("INSERT INTO audit_log (action, entity_type, description) VALUES ('a', 'b', 'c')"))
    for statement in ("UPDATE audit_log SET action = 'changed'", "DELETE FROM audit_log"):
        with pytest.raises(DBAPIError, match="append-only"), engine.begin() as connection:
            connection.execute(text(statement))


def test_payments_can_only_be_simulated():
    with pytest.raises(DBAPIError, match="payments_simulated_check"), engine.begin() as connection:
        connection.execute(text(
            "INSERT INTO payments (purpose, status, amount, simulated, event_id) "
            "VALUES ('ticket_order', 'succeeded', 100, false, :event)"), {"event": uuid.uuid4()})
