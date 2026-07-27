from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class GatewayRequest:
    method: str
    path: str
    query: dict[str, str] = field(default_factory=dict)


@dataclass(frozen=True)
class GatewayResponse:
    status_code: int
    body: dict[str, Any]
    headers: dict[str, str] = field(
        default_factory=lambda: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
        }
    )


def success_response(
    endpoint: str,
    data: Any,
    status_code: int = 200,
) -> GatewayResponse:
    return GatewayResponse(
        status_code=status_code,
        body={
            "ok": True,
            "endpoint": endpoint,
            "data": data,
            "error": None,
        },
    )


def error_response(
    endpoint: str,
    error_type: str,
    message: str,
    status_code: int,
    details: Any = None,
) -> GatewayResponse:
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
    )