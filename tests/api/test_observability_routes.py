from __future__ import annotations

from app.api.contracts import GatewayRequest
from app.api.gateway import KAIOSGateway


def test_observability_status_route_exists() -> None:
    response = KAIOSGateway().handle(
        GatewayRequest(
            method="GET",
            path="/api/observability/status",
            query={},
        )
    )

    assert response.status_code == 200
    assert response.body["data"]["status"] in {
        "operational",
        "degraded",
    }


def test_metrics_route_exists() -> None:
    response = KAIOSGateway().handle(
        GatewayRequest(
            method="GET",
            path="/api/metrics",
            query={},
        )
    )

    assert response.status_code == 200
    assert "request_count" in response.body["data"]