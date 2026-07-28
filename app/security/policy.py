from __future__ import annotations

from app.security.roles import Role


PUBLIC_ROUTES = {
    "/api/health",
    "/api/status",
    "/api/config/status",
    "/api/security/status",
}

OPERATOR_ROUTES = {
    "/api/collector",
    "/api/runtime",
}


def required_role(
    path: str,
) -> Role | None:
    if path in PUBLIC_ROUTES:
        return None

    if path in OPERATOR_ROUTES:
        return Role.OPERATOR

    if (
        path == "/api/edition"
        or path == "/api/scheduler/status"
        or path == "/api/runs"
        or path.startswith("/api/runs/")
    ):
        return Role.VIEWER

    return None