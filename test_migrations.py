"""The two ways to build a database must agree, and migrations must not lose data.

A new database is built from db/schema.sql. An existing one is brought up to date by the
files in db/migrations/. If a change reaches only one of them, databases quietly differ
depending on when they were created, which is painful to debug. These tests build a
database both ways and compare the result.
"""
import os

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

from app import initdb, migrations
from app.config import settings

ADMIN_URL = make_url(os.environ["DATABASE_URL"]).set(database="postgres")


def structure(connection) -> dict:
    """Everything about the shape of the database that a migration could get wrong."""
    def rows(sql: str) -> list[tuple]:
        return [tuple(row) for row in connection.execute(text(sql))]

    return {
        "columns": rows("""
            SELECT table_name, column_name, data_type, is_nullable, column_default
            FROM information_schema.columns WHERE table_schema = 'public'
            ORDER BY table_name, column_name"""),
        "constraints": rows("""
            SELECT conrelid::regclass::text, conname, pg_get_constraintdef(oid)
            FROM pg_constraint WHERE connamespace = 'public'::regnamespace
            ORDER BY 1, 2"""),
        "indexes": rows("""
            SELECT tablename, indexname, indexdef FROM pg_indexes
            WHERE schemaname = 'public' ORDER BY tablename, indexname"""),
        "triggers": rows("""
            SELECT c.relname, t.tgname, pg_get_triggerdef(t.oid)
            FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
            WHERE NOT t.tgisinternal ORDER BY 1, 2"""),
    }


@pytest.fixture
def build():
    """Builds a scratch database from a .sql file and hands back its engine."""
    created = []
    admin = create_engine(ADMIN_URL, isolation_level="AUTOCOMMIT")

    def make(name: str, sql_file, current: bool = False):
        """`current=True` means the file is schema.sql, which already contains every
        migration, so they count as applied — exactly what initdb.apply_schema does."""
        with admin.connect() as connection:
            connection.execute(text(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)'))
            connection.execute(text(f'CREATE DATABASE "{name}"'))
        engine = create_engine(ADMIN_URL.set(database=name))
        with engine.begin() as connection:
            connection.exec_driver_sql(sql_file.read_text())
            if current:
                migrations.mark_all_applied(connection)
        created.append((name, engine))
        return engine

    yield make

    for name, engine in created:
        engine.dispose()
        with admin.connect() as connection:
            connection.execute(text(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)'))
    admin.dispose()


def test_baseline_plus_migrations_matches_schema_sql(build):
    """The point of the whole exercise: a database that has been migrated and a database
    created today end up identical. Fails if a change went into only one of them."""
    fresh = build("biletflow_fresh", settings.schema_path, current=True)
    migrated = build("biletflow_migrated", settings.baseline_path)
    migrations.apply_pending(migrated)

    with fresh.connect() as a, migrated.connect() as b:
        expected, actual = structure(a), structure(b)

    for part in expected:
        assert actual[part] == expected[part], (
            f"{part} differ: a migration and db/schema.sql do not agree")


def test_migration_keeps_existing_rows(build):
    """Migrations must not drop and rebuild tables: that is what we are trying to avoid."""
    migrated = build("biletflow_keeps_rows", settings.baseline_path)
    with migrated.begin() as connection:
        connection.execute(text(
            "INSERT INTO users (email, password_hash, full_name) "
            "VALUES ('keep@nu.edu.kz', 'x', 'Keep Me')"))

    migrations.apply_pending(migrated)

    with migrated.connect() as connection:
        assert connection.scalar(text("SELECT full_name FROM users WHERE email = 'keep@nu.edu.kz'")) == "Keep Me"


def test_migrations_run_once(build):
    """Applying twice is a no-op. Without this, a restart would re-run every migration."""
    migrated = build("biletflow_run_once", settings.baseline_path)
    first = migrations.apply_pending(migrated)
    assert first == [path.name for path in migrations.migration_files()]
    assert migrations.apply_pending(migrated) == []


def test_fresh_database_has_every_migration_recorded():
    """A database built from schema.sql is already current, so nothing should re-run."""
    from app.database import engine  # the test database, built by conftest with apply_schema

    with engine.connect() as connection:
        assert migrations.applied(connection) == {p.name for p in migrations.migration_files()}
        assert migrations.pending(connection) == []


def test_database_built_by_hand_from_schema_sql_is_not_migrated_again(build):
    """Running schema.sql with psql, rather than letting the API build the database, is a
    normal thing to do. Such a database is already current, so migrations must be recorded
    as applied, not run on top of changes it already has."""
    by_hand = build("biletflow_by_hand", settings.schema_path)
    with by_hand.begin() as connection:
        connection.execute(text("INSERT INTO schema_info (checksum) VALUES (:c)"),
                           {"c": initdb.schema_checksum()})
        initdb.start_tracking(connection)

    assert migrations.apply_pending(by_hand) == []


def test_database_older_than_the_baseline_is_sent_to_reset(build):
    """Migrations only go back as far as baseline.sql. Anything older cannot be repaired,
    so the API stops with instructions instead of failing halfway through."""
    ancient = build("biletflow_ancient", settings.baseline_path)
    with ancient.begin() as connection:
        connection.execute(text("INSERT INTO schema_info (checksum) VALUES ('something-older')"))
        with pytest.raises(SystemExit):
            initdb.start_tracking(connection)


def test_migration_filenames_are_valid():
    """Names decide the order migrations run in, so they have to be strict."""
    assert migrations.migration_files(), "no migrations found; check settings.migrations_path"
    for path in migrations.migration_files():
        assert migrations.FILENAME.match(path.name), f"{path.name}: use 002_add_phone.sql"
