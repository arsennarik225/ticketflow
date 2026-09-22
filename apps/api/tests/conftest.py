"""Test setup: a fresh `biletflow_test` database (emptied before every test) and an API
client that checks every response against docs/api/openapi.yaml."""
import os

os.environ["DATABASE_URL"] = os.environ.get(
    "TEST_DATABASE_URL", "postgresql+psycopg://biletflow:biletflow@localhost:5433/biletflow_test")
os.environ["SMTP_HOST"] = ""  # emails are only stored in the notifications table
os.environ["SEED_DEMO_DATA"] = "false"

import pytest  # noqa: E402
from argon2 import PasswordHasher  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine, text  # noqa: E402
from sqlalchemy.engine import make_url  # noqa: E402

from app import security  # noqa: E402
from app.config import settings  # noqa: E402
from app.database import engine  # noqa: E402
from app.initdb import apply_schema  # noqa: E402
from app.main import app  # noqa: E402
from tests.contract import Contract  # noqa: E402

security.password_hasher = PasswordHasher(time_cost=1, memory_cost=8, parallelism=1)  # fast, tests only
CONTRACT = Contract(settings.contract_path)


@pytest.fixture(scope="session", autouse=True)
def database():
    url = make_url(os.environ["DATABASE_URL"])
    server = create_engine(url.set(database="postgres"), isolation_level="AUTOCOMMIT")
    with server.connect() as connection:
        connection.execute(text(f'DROP DATABASE IF EXISTS "{url.database}" WITH (FORCE)'))
        connection.execute(text(f'CREATE DATABASE "{url.database}"'))
    server.dispose()
    with engine.begin() as connection:
        apply_schema(connection)
        defaults = dict(connection.execute(text("SELECT * FROM platform_settings")).mappings().one())
    yield defaults
    engine.dispose()


@pytest.fixture(autouse=True)
def clean_database(database):
    with engine.begin() as connection:
        tables = connection.scalars(text(
            "SELECT tablename FROM pg_tables WHERE schemaname = 'public' "
            "AND tablename NOT IN ('platform_settings', 'schema_info')")).all()
        connection.execute(text(f"TRUNCATE {', '.join(tables)} RESTART IDENTITY CASCADE"))
        assignments = ", ".join(f"{k} = :{k}" for k in database if k != "id")
        connection.execute(text(f"UPDATE platform_settings SET {assignments}"), database)


class Api:
    """Thin TestClient wrapper: `token=` adds the bearer header, and every response is
    validated against the contract."""

    def __init__(self):
        self.client = TestClient(app)

    def request(self, method: str, url: str, token: str | None = None, headers: dict | None = None, **kwargs):
        headers = dict(headers or {})
        if token:
            headers["Authorization"] = f"Bearer {token}"
        response = self.client.request(method, url, headers=headers, **kwargs)
        CONTRACT.check(method, url, response)
        return response

    def get(self, url, **kwargs):
        return self.request("GET", url, **kwargs)

    def post(self, url, **kwargs):
        return self.request("POST", url, **kwargs)

    def put(self, url, **kwargs):
        return self.request("PUT", url, **kwargs)

    def patch(self, url, **kwargs):
        return self.request("PATCH", url, **kwargs)

    def delete(self, url, **kwargs):
        return self.request("DELETE", url, **kwargs)


@pytest.fixture
def api() -> Api:
    return Api()
