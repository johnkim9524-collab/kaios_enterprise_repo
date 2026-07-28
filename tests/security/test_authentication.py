from __future__ import annotations

import pytest

from app.security.auth import (
    SecurityConfig,
    authenticate_request,
)
from app.security.roles import Role


def security_config(tmp_path) -> SecurityConfig:
    return SecurityConfig.from_environ(
        {
            "KAIOS_AUTH_ENABLED": "true",
            "KAIOS_VIEWER_TOKEN": "viewer-secret",
            "KAIOS_OPERATOR_TOKEN": "operator-secret",
            "KAIOS_ADMIN_TOKEN": "admin-secret",
            "KAIOS_SECURITY_AUDIT_PATH": str(
                tmp_path / "audit.jsonl"
            ),
        }
    )


def test_missing_token_is_rejected(tmp_path) -> None:
    result = authenticate_request(
        {},
        security_config(tmp_path),
    )

    assert result.authenticated is False
    assert result.reason == "missing_bearer_token"


def test_operator_token_maps_to_operator_role(
    tmp_path,
) -> None:
    result = authenticate_request(
        {
            "authorization": (
                "Bearer operator-secret"
            ),
        },
        security_config(tmp_path),
    )

    assert result.authenticated is True
    assert result.role is Role.OPERATOR


def test_role_tokens_must_be_unique() -> None:
    with pytest.raises(ValueError):
        SecurityConfig.from_environ(
            {
                "KAIOS_AUTH_ENABLED": "true",
                "KAIOS_VIEWER_TOKEN": "same",
                "KAIOS_OPERATOR_TOKEN": "same",
            }
        )