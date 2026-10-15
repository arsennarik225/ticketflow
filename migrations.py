"""Apply the SQL files in db/migrations/ to an existing database.

A migration is one small change (`002_add_phone.sql`). The `schema_migrations` table
records which files a database has already run, so a teammate who pulls a schema change
restarts the app and keeps their data instead of resetting the database.

Rules:

* A migration that has been merged is never edited. Other databases have already run it,
  so editing it changes nothing for them. Fix a mistake with a new migration.
* Every change also goes into db/schema.sql, which stays the current picture of the schema
  and is what new databases are built from. tests/test_migrations.py builds a database both
  ways and fails if they differ.
"""
import re
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.engine import Connection, Engine

from app.config import settings

FILENAME = re.compile(r"^(\d{3})_[a-z0-9_]+\.sql$")

CREATE_TABLE = """
CREATE TABLE IF NOT EXISTS schema_migrations (
    filename TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
)
"""


def migration_files() -> list[Path]:
    """Every migration, in the order it must be applied."""
    files = sorted(p for p in settings.migrations_path.glob("*.sql"))
    bad = [p.name for p in files if not FILENAME.match(p.name)]
    if bad:
        raise ValueError(f"migration names must look like 002_add_phone.sql: {', '.join(bad)}")
    numbers = [p.name[:3] for p in files]
    if len(set(numbers)) != len(numbers):
        raise ValueError(f"two migrations share a number: {', '.join(numbers)}")
    return files


def create_table(connection: Connection) -> None:
    connection.exec_driver_sql(CREATE_TABLE)


def applied(connection: Connection) -> set[str]:
    return set(connection.scalars(text("SELECT filename FROM schema_migrations")))


def mark_applied(connection: Connection, files: list[Path]) -> None:
    for path in files:
        connection.execute(text("INSERT INTO schema_migrations (filename) VALUES (:f)"), {"f": path.name})


def mark_all_applied(connection: Connection) -> None:
    """For a database just built from schema.sql: it already contains every migration."""
    create_table(connection)
    mark_applied(connection, migration_files())


def pending(connection: Connection) -> list[Path]:
    done = applied(connection)
    return [path for path in migration_files() if path.name not in done]


def apply_pending(engine: Engine) -> list[str]:
    """Run the migrations this database has not run yet. Returns their names.

    Each migration gets its own transaction, so one that fails leaves the database exactly
    as it was rather than half changed, and the ones before it stay applied.
    """
    with engine.begin() as connection:
        create_table(connection)
        todo = pending(connection)

    for path in todo:
        with engine.begin() as connection:
            connection.exec_driver_sql(path.read_text())
            mark_applied(connection, [path])
        print(f"Applied migration {path.name}.")
    return [path.name for path in todo]
