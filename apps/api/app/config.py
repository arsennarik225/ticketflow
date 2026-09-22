"""Settings, read from environment variables. Defaults work for local development."""
from pathlib import Path

from pydantic_settings import BaseSettings

API_DIR = Path(__file__).resolve().parent.parent  # apps/api


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg://biletflow:biletflow@localhost:5433/biletflow"
    jwt_secret: str = "dev-only-jwt-secret-change-me-32bytes"
    qr_secret: str = "dev-only-qr-secret-change-me-32bytes"  # signs ticket QR codes
    access_token_minutes: int = 15
    refresh_token_days: int = 30
    web_url: str = "http://localhost:3000"  # web app: links in emails and Campaign QR codes
    api_url: str = "http://localhost:8000"  # this API: pdfUrl and qrImageUrl
    cors_origins: str = "*"  # comma-separated list
    smtp_host: str = ""  # empty = print emails to the log instead of sending them
    smtp_port: int = 1025
    mail_from: str = "BiletFlow <no-reply@biletflow.kz>"
    seed_demo_data: bool = False
    pdf_font: str = ""  # a TTF with Cyrillic; common system fonts are tried when empty
    schema_path: Path = API_DIR / "db" / "schema.sql"
    contract_path: Path = API_DIR.parent.parent / "docs" / "api" / "openapi.yaml"


settings = Settings()
