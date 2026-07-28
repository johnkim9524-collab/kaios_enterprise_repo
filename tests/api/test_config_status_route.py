from app.api.contracts import GatewayRequest
from app.api.gateway import KAIOSGateway


def test_configuration_status_route_never_returns_secret(monkeypatch) -> None:
    secret = "secret-value-that-must-never-leak"
    monkeypatch.setenv("KAIOS_ENVIRONMENT", "production")
    monkeypatch.setenv("KAIOS_API_SECRET", secret)
    response = KAIOSGateway().handle(GatewayRequest(method="GET", path="/api/config/status", query={}))
    assert response.status_code == 200
    assert response.body["data"]["status"] == "configured"
    assert response.body["data"]["security"]["api_secret_configured"] is True
    assert secret not in str(response.body)