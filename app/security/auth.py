from __future__ import annotations

import hmac
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Mapping

from app.security.roles import Role


def _secret_value(
    environ: Mapping[str, str],
    key: str,
) -> str | None:
    direct = environ.get(key, "").strip()
    file_path = environ.get(f"{key}_FILE", "").strip()

    if direct and file_path:
        raise ValueError(
            f"Configure either {key} or {key}_FILE, not both."
        )

    if direct:
        return direct

    if not file_path:
        return None

    path = Path(file_path)

    try:
        value = path.read_text(
            encoding="utf-8"
        ).strip()
    except OSError as exc:
        raise ValueError(
            f"Unable to read {key}_FILE."
        ) from exc

    if not value:
        raise ValueError(
            f"{key}_FILE must not be empty."
        )

    return value


@dataclass(frozen=True, slots=True)
class SecurityConfig:
    enabled: bool
    viewer_token: str | None
    operator_token: str | None
    admin_token: str | None
    rate_limit_requests: int
    rate_limit_window_seconds: int
    audit_path: Path

    @staticmethod
    def _boolean(
        environ: Mapping[str, str],
        key: str,
        default: bool,
    ) -> bool:
        value = environ.get(
            key,
            "true" if default else "false",
        ).strip().lower()

        if value in {"1", "true", "yes", "on"}:
            return True

        if value in {"0", "false", "no", "off"}:
            return False

        raise ValueError(
            f"{key} must be true or false."
        )

    @staticmethod
    def _integer(
        environ: Mapping[str, str],
        key: str,
        default: int,
        minimum: int,
        maximum: int,
    ) -> int:
        raw_value = environ.get(
            key,
            str(default),
        ).strip()

        try:
            value = int(raw_value)
        except ValueError as exc:
            raise ValueError(
                f"{key} must be an integer."
            ) from exc

        if not minimum <= value <= maximum:
            raise ValueError(
                f"{key} must be between {minimum} and {maximum}."
            )

        return value

    @classmethod
    def from_environ(
        cls,
        environ: Mapping[str, str] | None = None,
    ) -> "SecurityConfig":
        source = os.environ if environ is None else environ
        enabled = cls._boolean(
            source,
            "KAIOS_AUTH_ENABLED",
            False,
        )

        viewer_token = _secret_value(
            source,
            "KAIOS_VIEWER_TOKEN",
        )
        operator_token = _secret_value(
            source,
            "KAIOS_OPERATOR_TOKEN",
        )
        admin_token = _secret_value(
            source,
            "KAIOS_ADMIN_TOKEN",
        )

        if enabled and not any(
            (
                viewer_token,
                operator_token,
                admin_token,
            )
        ):
            raise ValueError(
                "At least one KAIOS role token is required "
                "when authentication is enabled."
            )

        configured = [
            value
            for value in (
                viewer_token,
                operator_token,
                admin_token,
            )
            if value is not None
        ]

        if len(configured) != len(set(configured)):
            raise ValueError(
                "KAIOS role tokens must be unique."
            )

        return cls(
            enabled=enabled,
            viewer_token=viewer_token,
            operator_token=operator_token,
            admin_token=admin_token,
            rate_limit_requests=cls._integer(
                source,
                "KAIOS_RATE_LIMIT_REQUESTS",
                120,
                1,
                100000,
            ),
            rate_limit_window_seconds=cls._integer(
                source,
                "KAIOS_RATE_LIMIT_WINDOW_SECONDS",
                60,
                1,
                86400,
            ),
            audit_path=Path(
                source.get(
                    "KAIOS_SECURITY_AUDIT_PATH",
                    "data/security-audit.jsonl",
                ).strip()
            ),
        )


@dataclass(frozen=True, slots=True)
class AuthenticationResult:
    authenticated: bool
    role: Role | None
    reason: str

    @property
    def identity(self) -> str:
        return (
            self.role.label
            if self.role is not None
            else "anonymous"
        )


def _bearer_token(
    headers: Mapping[str, str],
) -> str | None:
    authorization = headers.get(
        "authorization",
        "",
    ).strip()

    scheme, separator, value = authorization.partition(" ")

    if (
        not separator
        or scheme.lower() != "bearer"
        or not value.strip()
    ):
        return None

    return value.strip()


def authenticate_request(
    headers: Mapping[str, str],
    config: SecurityConfig,
) -> AuthenticationResult:
    if not config.enabled:
        return AuthenticationResult(
            authenticated=True,
            role=Role.ADMIN,
            reason="authentication_disabled",
        )

    supplied = _bearer_token(headers)

    if supplied is None:
        return AuthenticationResult(
            authenticated=False,
            role=None,
            reason="missing_bearer_token",
        )

    candidates = (
        (Role.ADMIN, config.admin_token),
        (Role.OPERATOR, config.operator_token),
        (Role.VIEWER, config.viewer_token),
    )

    for role, expected in candidates:
        if (
            expected is not None
            and hmac.compare_digest(supplied, expected)
        ):
            return AuthenticationResult(
                authenticated=True,
                role=role,
                reason="authenticated",
            )

    return AuthenticationResult(
        authenticated=False,
        role=None,
        reason="invalid_bearer_token",
    )