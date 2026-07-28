from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


SECURITY_HEADERS = {
    "Content-Security-Policy": (
        "default-src 'self'; "
        "script-src 'self'; "
        "style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data:; "
        "connect-src 'self'; "
        "frame-ancestors 'none'; "
        "base-uri 'self'; "
        "form-action 'self'"
    ),
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": (
        "camera=(), microphone=(), geolocation=()"
    ),
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
}


@dataclass(frozen=True)
class GatewayRequest:
    method: str
    path: str
    query: dict[str, str] = field(default_factory=dict)
    headers: dict[str, str] = field(default_factory=dict)
    client_ip: str = "unknown"


@dataclass(frozen=True)
class GatewayResponse:
    status_code: int
    body: dict[str, Any]
    headers: dict[str, str] = field(
        default_factory=lambda: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
            **SECURITY_HEADERS,
        }
    )


def success_response(
    endpoint: str,
    data: Any,
    status_code: int = 200,
    headers: dict[str, str] | None = None,
) -> GatewayResponse:
    response_headers = {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        **SECURITY_HEADERS,
    }
    response_headers.update(headers or {})

    return GatewayResponse(
        status_code=status_code,
        body={
            "ok": True,
            "endpoint": endpoint,
            "data": data,
            "error": None,
        },
        headers=response_headers,
    )


def error_response(
    endpoint: str,
    error_type: str,
    message: str,
    status_code: int,
    details: Any = None,
    headers: dict[str, str] | None = None,
) -> GatewayResponse:
    response_headers = {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        **SECURITY_HEADERS,
    }
    response_headers.update(headers or {})

    return GatewayResponse(
        status_code=status_code,
        body={
            "ok": False,
            "endpoint": endpoint,
            "data": details,
            "error": {
                "type": error_type,
                "message": message,
            },
        },
        headers=response_headers,
    )