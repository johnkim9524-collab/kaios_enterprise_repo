from app.api.contracts import GatewayRequest
from app.api.gateway import KAIOSGateway


def test_scheduler_status_route():
    response=KAIOSGateway().handle(GatewayRequest(method="GET",path="/api/scheduler/status",query={}))
    assert response.status_code==200
    assert response.body["ok"] is True
    assert "enabled" in response.body["data"]