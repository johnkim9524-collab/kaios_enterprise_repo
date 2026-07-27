from __future__ import annotations

from app.api.contracts import GatewayRequest
from app.api.gateway import KAIOSGateway


def request(
    path: str,
    method: str = "GET",
    query: dict[str, str] | None = None,
):
    return KAIOSGateway().handle(
        GatewayRequest(
            method=method,
            path=path,
            query=query or {},
        )
    )


def test_health_route() -> None:
    response = request("/api/health")

    assert response.status_code == 200
    assert response.body["ok"] is True
    assert response.body["data"]["status"] in {
        "operational",
        "degraded",
        "failed",
    }


def test_status_route() -> None:
    response = request("/api/status")

    assert response.status_code == 200
    assert response.body["ok"] is True


def test_edition_route() -> None:
    response = request("/api/edition")

    assert response.status_code == 200
    assert response.body["ok"] is True
    assert "edition" in response.body["data"]


def test_unknown_route_returns_404() -> None:
    response = request("/api/unknown")

    assert response.status_code == 404
    assert response.body["ok"] is False
    assert response.body["error"]["type"] == "not_found"


def test_post_returns_405() -> None:
    response = request(
        "/api/health",
        method="POST",
    )

    assert response.status_code == 405
    assert response.body["error"]["type"] == "method_not_allowed"