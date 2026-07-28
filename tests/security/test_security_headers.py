from __future__ import annotations

from app.api.contracts import GatewayRequest
from app.api.gateway import KAIOSGateway


def test_gateway_response_contains_security_headers() -> None:
    response = KAIOSGateway().handle(
        GatewayRequest(
            method="GET",
            path="/api/security/status",
            query={},
        )
    )

    assert response.status_code == 200
    assert response.headers["X-Frame-Options"] == "DENY"
    assert (
        response.headers["X-Content-Type-Options"]
        == "nosniff"
    )
    assert "Content-Security-Policy" in response.headers