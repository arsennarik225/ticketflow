"""Checks real responses against docs/api/openapi.yaml, so the code cannot drift away
from the contract that the web and mobile apps are built on."""
import re
from urllib.parse import urlsplit

import yaml
from jsonschema import Draft202012Validator, FormatChecker
from referencing import Registry, Resource
from referencing.jsonschema import DRAFT202012

METHODS = ("get", "post", "put", "patch", "delete")


def pointer(*parts: str) -> str:
    return "".join("/" + p.replace("~", "~0").replace("/", "~1") for p in parts)


class Contract:
    def __init__(self, path):
        self.spec = yaml.safe_load(open(path))
        resource = Resource.from_contents(self.spec, default_specification=DRAFT202012)
        self.registry = Registry().with_resource("urn:contract", resource)
        self.operations = [
            (method.upper(), re.compile("^/v1" + re.sub(r"\{[^/]+\}", "[^/]+", template) + "$"), template)
            for template, item in self.spec["paths"].items() for method in item if method in METHODS
        ]

    def operation(self, method: str, url: str) -> str:
        path = urlsplit(url).path
        matches = [t for m, regex, t in self.operations if m == method.upper() and regex.match(path)]
        assert matches, f"{method} {path} is not in the contract"
        return min(matches, key=lambda t: t.count("{"))  # prefer the most specific path

    def check(self, method: str, url: str, response) -> None:
        template = self.operation(method, url)
        operation = self.spec["paths"][template][method.lower()]
        status = str(response.status_code)
        where = [template, method.lower(), "responses", status]
        spec_response = operation["responses"].get(status)
        if spec_response is None:
            assert response.status_code >= 400 and "default" in operation["responses"], (
                f"{method} {template} answered {status}, which the contract does not list")
            spec_response, where = operation["responses"]["default"], [template, method.lower(), "responses", "default"]
        location = ["paths", *where]
        if "$ref" in spec_response:  # e.g. '#/components/responses/Error'
            location = spec_response["$ref"].lstrip("#/").split("/")
            spec_response = self.resolve(spec_response["$ref"])
        content = spec_response.get("content")
        if not content:
            assert not response.content, f"{method} {template} {status} should have no body"
            return
        media = response.headers["content-type"].split(";")[0]
        assert media in content, f"{method} {template} {status} returned {media}, contract says {list(content)}"
        if media == "application/json":
            schema = {"$ref": "urn:contract#" + pointer(*location, "content", "application/json", "schema")}
            validator = Draft202012Validator(schema, registry=self.registry, format_checker=FormatChecker())
            errors = sorted(validator.iter_errors(response.json()), key=lambda e: e.path)
            assert not errors, f"{method} {template} {status} does not match the contract: " + "; ".join(
                f"{'/'.join(map(str, e.path))}: {e.message}" for e in errors[:5])

    def resolve(self, ref: str) -> dict:
        node = self.spec
        for part in ref.lstrip("#/").split("/"):
            node = node[part]
        return node
