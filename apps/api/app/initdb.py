"""Prepare the database before the API starts (`python -m app.initdb`).

* Empty database: apply db/schema.sql.
* Database built from an older schema.sql: stop with instructions to reset it, rather
  than fail later in confusing ways.
* SEED_DEMO_DATA=true and no users yet: load the demo data (app/seed.py).
"""
import hashlib
import sys

from sqlalchemy import inspect, text

from app.config import settings
from app.database import engine

RESET_HINT = """
The database was created from an older version of apps/api/db/schema.sql.
Reset your local database (this deletes local data, demo data is loaded again):

    docker compose down -v && docker compose up --build
"""


def schema_checksum() -> str:
    return hashlib.sha256(settings.schema_path.read_bytes()).hexdigest()


def apply_schema(connection) -> None:
    connection.exec_driver_sql(settings.schema_path.read_text())
    connection.execute(text("INSERT INTO schema_info (checksum) VALUES (:c)"), {"c": schema_checksum()})


def main() -> None:
    with engine.begin() as connection:
        tables = inspect(connection)
        if not tables.has_table("schema_info"):
            if tables.has_table("users"):
                sys.exit(RESET_HINT)
            apply_schema(connection)
            print("Database schema created.")
        elif connection.scalar(text("SELECT checksum FROM schema_info")) != schema_checksum():
            sys.exit(RESET_HINT)
    if settings.seed_demo_data:
        from app.seed import seed_if_empty

        seed_if_empty()


if __name__ == "__main__":
    main()
