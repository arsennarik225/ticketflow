"""Upgrade databases built from the released SQL without resetting user data."""
import pytest
from sqlalchemy import text

from app import initdb, migrations
from app.config import settings
from tests.test_migrations import build  # shared scratch-database fixture


@pytest.mark.parametrize("line_ending", ["\n", "\r\n"])
def test_published_pre_migration_database_upgrades_without_losing_rows(build, tmp_path, line_ending):
    # The frozen baseline added a comment header, so its hash differs from the released SQL.
    content = settings.baseline_path.read_text()
    original = content[content.index("-- BiletFlow database schema"):]
    source = tmp_path / "released.sql"
    source.write_bytes(original.replace("\n", line_ending).encode())
    migrated = build("biletflow_released", source)
    with migrated.begin() as connection:
        connection.execute(text("INSERT INTO schema_info (checksum) VALUES (:c)"),
                           {"c": initdb.checksum(source)})
        connection.execute(text("INSERT INTO users (email, password_hash, full_name) VALUES ('keep@example.com', 'x', 'Keep Me')"))
        initdb.start_tracking(connection)
    assert migrations.apply_pending(migrated) == [p.name for p in migrations.migration_files()]
    with migrated.connect() as connection:
        assert connection.scalar(text("SELECT email FROM users WHERE email='keep@example.com'")) == "keep@example.com"


def test_current_database_recognized_after_line_ending_change(build, tmp_path, monkeypatch):
    by_hand = build("biletflow_line_endings", settings.schema_path)
    stored = initdb.schema_checksum()
    copy = tmp_path / "schema.sql"
    copy.write_bytes(settings.schema_path.read_bytes().replace(b"\r\n", b"\n").replace(b"\n", b"\r\n"))
    monkeypatch.setattr(settings, "schema_path", copy)
    with by_hand.begin() as connection:
        connection.execute(text("INSERT INTO schema_info (checksum) VALUES (:c)"), {"c": stored})
        initdb.start_tracking(connection)
    assert migrations.apply_pending(by_hand) == []
