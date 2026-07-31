from __future__ import annotations

from app.api.contracts import GatewayRequest
from app.api.gateway import KAIOSGateway
from app.api.service import GatewayService
from app.core.modes import RuntimeMode


class LiveContractService(GatewayService):
    def collector(
        self,
        mode: RuntimeMode,
    ) -> dict:
        assert mode is RuntimeMode.LIVE

        return {
            "mode": "live",
            "status": "operational",
            "source_count": 1,
            "successful_source_count": 1,
            "failed_source_count": 0,
        }

    def runtime(
        self,
        mode: RuntimeMode,
    ) -> dict:
        assert mode is RuntimeMode.LIVE

        return {
            "mode": "live",
            "published": False,
            "error": {
                "type": "quality_gate_failed",
                "stage": "quality_gate",
                "message": (
                    "The intelligence edition did not pass."
                ),
            },
        }


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


def test_live_collector_returns_operational_contract() -> None:
    response = KAIOSGateway(
        service=LiveContractService()
    ).handle(
        GatewayRequest(
            method="GET",
            path="/api/collector",
            query={"mode": "live"},
        )
    )

    assert response.status_code == 200
    assert response.body["ok"] is True
    assert (
        response.body["data"]["status"]
        == "operational"
    )
    assert (
        response.body["data"]["successful_source_count"]
        == 1
    )


def test_live_runtime_preserves_quality_gate() -> None:
    response = KAIOSGateway(
        service=LiveContractService()
    ).handle(
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
        == "quality_gate"
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
