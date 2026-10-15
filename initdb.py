"""Prepare the database before the API starts (`python -m app.initdb`).

* Empty database: apply db/schema.sql, which already contains every migration.
* Database from before migrations existed: start tracking migrations and apply the ones it
  needs, so local data survives.
* Database that already tracks migrations: apply the ones it has not run yet.
* Anything older than db/baseline.sql: stop with instructions to reset it, rather than fail
  later in confusing ways.
* SEED_DEMO_DATA=true and no users yet: load the demo data (app/seed.py).
"""
import hashlib
import sys
from pathlib import Path

from sqlalchemy import inspect, text

from app import migrations
from app.config import settings
from app.database import engine

RESET_HINT = """
The database was created from a version of apps/api/db/schema.sql older than
apps/api/db/baseline.sql, so migrations cannot bring it up to date.
Reset your local database (this deletes local data, demo data is loaded again):

    docker compose down -v && docker compose up --build
"""


def checksum(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def schema_checksum() -> str:
    return checksum(settings.schema_path)


def record_checksum(connection) -> None:
    connection.execute(text("DELETE FROM schema_info"))
    connection.execute(text("INSERT INTO schema_info (checksum) VALUES (:c)"), {"c": schema_checksum()})


def apply_schema(connection) -> None:
    """Build an empty database from schema.sql. It is current, so every migration already
    counts as applied."""
    connection.exec_driver_sql(settings.schema_path.read_text())
    record_checksum(connection)
    migrations.mark_all_applied(connection)


def start_tracking(connection) -> None:
    """A database from before migrations existed. How much it needs depends on its age:

    * built from the current schema.sql: already up to date, mark every migration applied
    * built from baseline.sql: mark none, so apply_pending() brings it up to date
    """
    stored = connection.scalar(text("SELECT checksum FROM schema_info"))
    if stored == schema_checksum():
        migrations.mark_all_applied(connection)
    elif stored == checksum(settings.baseline_path):
        migrations.create_table(connection)
    else:
        sys.exit(RESET_HINT)


def main() -> None:
    with engine.begin() as connection:
        tables = inspect(connection)
        if not tables.has_table("schema_info"):
            if tables.has_table("users"):
                sys.exit(RESET_HINT)
            apply_schema(connection)
            print("Database schema created.")
        elif not tables.has_table("schema_migrations"):
            start_tracking(connection)

    if migrations.apply_pending(engine):
        with engine.begin() as connection:
            record_checksum(connection)

    if settings.seed_demo_data:
        from app.seed import seed_if_empty

        seed_if_empty()


if __name__ == "__main__":
    main()
