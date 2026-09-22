"""Every error response is {"error": {"code": ..., "message": ...}}.

`code` is stable, so clients can branch on it and show translated text;
`message` is an English fallback.
"""
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str, body: dict | None = None):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.body = body  # replaces the standard error body when set


def unauthorized(code: str = "not_authenticated", message: str = "Sign in first.") -> ApiError:
    return ApiError(401, code, message)


def forbidden(code: str = "forbidden", message: str = "You are not allowed to do this.") -> ApiError:
    return ApiError(403, code, message)


def not_found(what: str = "Resource") -> ApiError:
    return ApiError(404, "not_found", f"{what} not found.")


def conflict(code: str, message: str) -> ApiError:
    return ApiError(409, code, message)


def gone(code: str, message: str) -> ApiError:
    return ApiError(410, code, message)


def invalid(code: str, message: str) -> ApiError:
    return ApiError(422, code, message)


def error_body(code: str, message: str) -> dict:
    return {"error": {"code": code, "message": message}}


STATUS_CODES = {
    400: "bad_request",
    401: "not_authenticated",
    403: "forbidden",
    404: "not_found",
    405: "method_not_allowed",
    409: "conflict",
    422: "validation_error",
}


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def api_error(request: Request, exc: ApiError):
        return JSONResponse(exc.body or error_body(exc.code, exc.message), status_code=exc.status)

    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, exc: RequestValidationError):
        first = exc.errors()[0]
        where = [str(p) for p in first["loc"] if p not in ("body", "query", "path", "header")]
        message = first["msg"].removeprefix("Value error, ")
        if where:
            message = f"{'.'.join(where)}: {message}"
        return JSONResponse(error_body("validation_error", message), status_code=422)

    @app.exception_handler(HTTPException)
    async def http_error(request: Request, exc: HTTPException):
        code = STATUS_CODES.get(exc.status_code, "error")
        return JSONResponse(
            error_body(code, str(exc.detail)), status_code=exc.status_code, headers=exc.headers
        )
