"""Єдиний формат помилок API (контракт з П5).

Тіло помилки: {"detail": "...", "reason_code": "...", "request_id": число|null}.
Для 422 додатково {"errors": [{"row", "path", "message"}]} без сирих значень.
"""
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

# Для 401 і 403 без явного коду причина визначається за статусом.
DEFAULT_REASONS = {401: "UNAUTHENTICATED", 403: "NO_ROLE_PERMISSION"}


class ApiError(HTTPException):
    def __init__(
        self,
        status_code: int,
        detail: str,
        reason_code: str | None = None,
        request_id: int | None = None,
        errors: list[dict] | None = None,
    ):
        super().__init__(status_code=status_code, detail=detail)
        self.reason_code = reason_code
        self.request_id = request_id
        self.errors = errors


async def http_error_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    body: dict = {"detail": exc.detail}
    reason = getattr(exc, "reason_code", None) or DEFAULT_REASONS.get(exc.status_code)
    if reason is not None:
        body["reason_code"] = reason
        body["request_id"] = getattr(exc, "request_id", None)
    errors = getattr(exc, "errors", None)
    if errors is not None:
        body["errors"] = errors
    return JSONResponse(body, status_code=exc.status_code, headers=getattr(exc, "headers", None))


def register_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(StarletteHTTPException, http_error_handler)