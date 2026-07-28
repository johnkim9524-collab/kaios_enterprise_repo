from __future__ import annotations

import pytest

from app.security.auth import SecurityConfig


def test_role_tokens_can_load_from_files(
    tmp_path,
) -> None:
    viewer = tmp_path / "viewer"
    operator = tmp_path / "operator"
    admin = tmp_path / "admin"

    viewer.write_text("viewer-file", encoding="utf-8")
    operator.write_text("operator-file", encoding="utf-8")
    admin.write_text("admin-file", encoding="utf-8")

    config = SecurityConfig.from_environ(
        {
            "KAIOS_AUTH_ENABLED": "true",
            "KAIOS_VIEWER_TOKEN_FILE": str(viewer),
            "KAIOS_OPERATOR_TOKEN_FILE": str(operator),
            "KAIOS_ADMIN_TOKEN_FILE": str(admin),
        }
    )

    assert config.viewer_token == "viewer-file"
    assert config.operator_token == "operator-file"
    assert config.admin_token == "admin-file"


def test_direct_and_file_token_are_exclusive(
    tmp_path,
) -> None:
    token_file = tmp_path / "viewer"
    token_file.write_text(
        "viewer-file",
        encoding="utf-8",
    )

    with pytest.raises(ValueError):
        SecurityConfig.from_environ(
            {
                "KAIOS_AUTH_ENABLED": "true",
                "KAIOS_VIEWER_TOKEN": "viewer-direct",
                "KAIOS_VIEWER_TOKEN_FILE": str(
                    token_file
                ),
            }
        )