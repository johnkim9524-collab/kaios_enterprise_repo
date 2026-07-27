from __future__ import annotations

from app.api.contracts import GatewayRequest
from app.api.gateway import KAIOSGateway


def test_fixture_collector_endpoint() -> None:
    response = KAIOSGateway().handle(
        GatewayRequest(
            method="GET",
            path="/api/collector",
            query={"mode": "fixture"},
        )
    )

    assert response.status_code == 200
    assert response.body["ok"] is True
    assert (
        response.body["data"]["mode"]
        == "fixture"
    )
    assert (
        response.body["data"]["status"]
        == "operational"
    )


def test_fixture_runtime_endpoint() -> None:
    response = KAIOSGateway().handle(
        GatewayRequest(
            method="GET",
            path="/api/runtime",
            query={"mode": "fixture"},
        )
    )

    assert response.status_code == 200
    assert response.body["ok"] is True
    assert (
        response.body["data"]["published"]
        is True
    )
    assert (
        response.body["data"]["mode"]
        == "fixture"
    )


def test_live_collector_returns_503() -> None:
    response = KAIOSGateway().handle(
        GatewayRequest(
            method="GET",
            path="/api/collector",
            query={"mode": "live"},
        )
    )

    assert response.status_code == 503
    assert response.body["ok"] is False


def test_live_runtime_returns_503() -> None:
    response = KAIOSGateway().handle(
        GatewayRequest(
            method="GET",
            path="/api/runtime",
            query={"mode": "live"},
        )
    )

    assert response.status_code == 503
    assert response.body["ok"] is False
    assert (
        response.body["data"]["error"]["stage"]
        == "collector"
    )


def test_invalid_mode_returns_400() -> None:
    response = KAIOSGateway().handle(
        GatewayRequest(
            method="GET",
            path="/api/runtime",
            query={"mode": "invalid"},
        )
    )

    assert response.status_code == 400
    assert response.body["ok"] is False
    assert (
        response.body["error"]["type"]
        == "invalid_runtime_mode"
    )