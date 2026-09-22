"""The FastAPI application. All routes live under /v1 and every error has the same
shape (errors.py). /docs shows docs/api/openapi.yaml, the agreed contract, rather than
a schema generated from the code, so there is only one API description to trust."""
import logging

import yaml
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.config import settings
from app.database import engine
from app.errors import install_error_handlers
from app.routers import admin, auth, checkin, checkout, events, insights, orders, support, tickets

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")

app = FastAPI(title="BiletFlow API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",")],
    allow_methods=["*"],
    allow_headers=["*"],
)
install_error_handlers(app)
for module in (auth, events, tickets, checkout, orders, checkin, support, insights, admin):
    app.include_router(module.router, prefix="/v1")


@app.get("/health", include_in_schema=False)
def health():
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))
    return {"status": "ok"}


def contract() -> dict:
    if app.openapi_schema is None:
        app.openapi_schema = yaml.safe_load(settings.contract_path.read_text())
    return app.openapi_schema


app.openapi = contract
