from __future__ import annotations

from app.api.contracts import GatewayRequest
from app.api.gateway import KAIOSGateway
from app.security.auth import SecurityConfig


def gateway(tmp_path) -> KAIOSGateway:
    return KAIOSGateway(
        security_config=SecurityConfig.from_environ(
            {
                "KAIOS_AUTH_ENABLED": "true",
                "KAIOS_VIEWER_TOKEN": "viewer-secret",
                "KAIOS_OPERATOR_TOKEN": "operator-secret",
                "KAIOS_ADMIN_TOKEN": "admin-secret",
                "KAIOS_RATE_LIMIT_REQUESTS": "2",
                "KAIOS_RATE_LIMIT_WINDOW_SECONDS": "60",
                "KAIOS_SECURITY_AUDIT_PATH": str(
                    tmp_path / "audit.jsonl"
                ),
            }
        )
    )


def request(
    path: str,
    token: str | None = None,
) -> GatewayRequest:
    headers = {}

    if token is not None:
        headers["authorization"] = f"Bearer {token}"

    return GatewayRequest(
        method="GET",
        path=path,
        query={},
        headers=headers,
        client_ip="127.0.0.1",
    )


def test_public_health_requires_no_token(
    tmp_path,
) -> None:
    response = gateway(tmp_path).handle(
        request("/api/health")
    )

    assert response.status_code == 200


def test_protected_route_without_token_returns_401(
    tmp_path,
) -> None:
    response = gateway(tmp_path).handle(
        request("/api/edition")
    )

    assert response.status_code == 401
    assert response.body["error"]["type"] == "unauthorized"


def test_viewer_cannot_execute_runtime(
    tmp_path,
) -> None:
    response = gateway(tmp_path).handle(
        request(
            "/api/runtime",
            "viewer-secret",
        )
    )

    assert response.status_code == 403
    assert response.body["error"]["type"] == "forbidden"


def test_operator_can_access_collector(
    tmp_path,
) -> None:
    response = gateway(tmp_path).handle(
        GatewayRequest(
            method="GET",
            path="/api/collector",
            query={"mode": "fixture"},
            headers={
                "authorization": (
                    "Bearer operator-secret"
                ),
            },
            client_ip="127.0.0.1",
        )
    )

    assert response.status_code == 200


def test_rate_limit_returns_429(
    tmp_path,
) -> None:
    secured_gateway = gateway(tmp_path)

    for _ in range(2):
        response = secured_gateway.handle(
            request(
                "/api/edition",
                "viewer-secret",
            )
        )
        assert response.status_code == 200

    response = secured_gateway.handle(
        request(
            "/api/edition",
            "viewer-secret",
        )
    )

    assert response.status_code == 429


def test_audit_log_never_contains_token(
    tmp_path,
) -> None:
    secured_gateway = gateway(tmp_path)
    secured_gateway.handle(
        request(
            "/api/edition",
            "viewer-secret",
        )
    )

    audit = (
        tmp_path / "audit.jsonl"
    ).read_text(encoding="utf-8")

    assert "viewer-secret" not in audit
    assert '"identity":"viewer"' in audit