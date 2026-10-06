"""The API and docs/api/openapi.yaml describe the same operations. (Response bodies are
checked against the contract in every other test, by the `api` fixture.)"""
import pytest
from fastapi.openapi.utils import get_openapi
from jsonschema import Draft202012Validator
from openapi_spec_validator import validate
from openapi_spec_validator.readers import read_from_filename
from pydantic import ValidationError

from app.config import settings
from app.main import app
from app.schemas import CheckInIn, VerifyIn
from tests.conftest import CONTRACT


def test_contract_is_valid_openapi():
    validate(read_from_filename(str(settings.contract_path))[0])


def test_code_and_contract_have_the_same_operations():
    implemented = {(method.upper(), path) for path, item in
                   get_openapi(title="check", version="0", routes=app.routes)["paths"].items() for method in item}
    documented = {(method.upper(), "/v1" + path) for path, item in CONTRACT.spec["paths"].items()
                  for method in item if method in ("get", "post", "put", "patch", "delete")}
    assert implemented - documented == set(), "implemented but not in the contract"
    assert documented - implemented == set(), "in the contract but not implemented"


def test_docs_show_the_contract(api):
    served = api.client.get("/openapi.json").json()
    assert served["info"]["title"] == "BiletFlow API"
    assert served["paths"].keys() == CONTRACT.spec["paths"].keys()


def test_errors_share_one_shape(api):
    missing = api.client.get("/v1/no-such-thing")
    assert missing.status_code == 404 and missing.json()["error"]["code"] == "not_found"
    invalid = api.post("/v1/auth/register", json={"email": "not-an-email"})
    assert invalid.status_code == 422 and invalid.json()["error"]["code"] == "validation_error"


def test_health(api):
    assert api.client.get("/health").json() == {"status": "ok"}


@pytest.mark.parametrize("qr", [None, "", "x", "x" * 2000, "x" * 2001, 123])
@pytest.mark.parametrize("ticket", [None, "", "ticket-id", 123])
def test_admission_contract_matches_runtime_validation(qr, ticket):
    schema = CONTRACT.spec["paths"]["/checkin/events/{eventId}/check-ins"]["post"][
        "requestBody"]["content"]["application/json"]["schema"]
    for body in ({"qrPayload": qr, "ticketId": ticket}, {"qrPayload": qr}, {"ticketId": ticket}, {}):
        try:
            CheckInIn.model_validate(body)
            accepted = True
        except ValidationError:
            accepted = False
        assert Draft202012Validator(schema).is_valid(body) == accepted
        assert Draft202012Validator(CheckInIn.model_json_schema()).is_valid(body) == accepted


def test_checkin_query_and_qr_constraints_match_generated_schema():
    generated = get_openapi(title="check", version="0", routes=app.routes)
    for path, name in (("/checkin/events", "assignedOnly"), ("/checkin/events/{eventId}/attendees", "q")):
        documented = next(p["schema"] for p in CONTRACT.spec["paths"][path]["get"]["parameters"]
                          if p.get("name") == name)
        actual = next(p["schema"] for p in generated["paths"]["/v1" + path]["get"]["parameters"]
                      if p.get("name") == name)
        if "anyOf" in actual:
            actual = next(option for option in actual["anyOf"] if option["type"] == "string")
        assert all(actual[key] == value for key, value in documented.items())
    documented = CONTRACT.spec["paths"]["/checkin/events/{eventId}/verify"]["post"][
        "requestBody"]["content"]["application/json"]["schema"]["properties"]["qrPayload"]
    actual = VerifyIn.model_json_schema()["properties"]["qrPayload"]
    assert all(actual[key] == value for key, value in documented.items())
