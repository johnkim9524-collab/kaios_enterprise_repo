from __future__ import annotations

from collections.abc import Callable
from typing import Any

from app.api.contracts import (
    GatewayRequest,
    GatewayResponse,
    error_response,
    success_response,
)
from app.api.service import GatewayService
from app.core.errors import LiveModeUnavailableError
from app.core.modes import RuntimeMode
from app.security.audit import SecurityAuditLogger
from app.security.auth import (
    SecurityConfig,
    authenticate_request,
)
from app.security.policy import required_role
from app.security.rate_limit import InMemoryRateLimiter


class KAIOSGateway:
    def __init__(
        self,
        service: GatewayService | None = None,
        security_config: SecurityConfig | None = None,
    ) -> None:
        self.service = (
            service
            if service is not None
            else GatewayService()
        )
        self.security_config = (
            security_config
            if security_config is not None
            else SecurityConfig.from_environ()
        )
        self.rate_limiter = InMemoryRateLimiter(
            limit=self.security_config.rate_limit_requests,
            window_seconds=(
                self.security_config.rate_limit_window_seconds
            ),
        )
        self.audit = SecurityAuditLogger(
            self.security_config.audit_path
        )

        self._static_routes: dict[
            str,
            Callable[[], dict[str, Any]],
        ] = {
            "/api/health": self.service.health,
            "/api/status": self.service.status,
            "/api/config/status": self.service.config_status,
            "/api/edition": self.service.edition,
            "/api/scheduler/status": self.service.scheduler_status,
            "/api/security/status": self.security_status,
        }

    def security_status(self) -> dict[str, Any]:
        return {
            "status": (
                "enabled"
                if self.security_config.enabled
                else "disabled"
            ),
            "authentication": "bearer",
            "roles": [
                "viewer",
                "operator",
                "admin",
            ],
            "rate_limit": {
                "requests": (
                    self.security_config.rate_limit_requests
                ),
                "window_seconds": (
                    self.security_config.rate_limit_window_seconds
                ),
            },
            "audit_enabled": True,
        }

    def _authorize(
        self,
        request: GatewayRequest,
    ) -> GatewayResponse | None:
        role_required = required_role(request.path)

        if role_required is None:
            return None

        authentication = authenticate_request(
            request.headers,
            self.security_config,
        )

        if not authentication.authenticated:
            self.audit.record(
                event="authentication",
                identity=authentication.identity,
                path=request.path,
                client_ip=request.client_ip,
                outcome="denied",
                details={
                    "reason": authentication.reason,
                },
            )

            return error_response(
                endpoint=request.path,
                error_type="unauthorized",
                message="A valid Bearer token is required.",
                status_code=401,
                headers={
                    "WWW-Authenticate": "Bearer",
                },
            )

        assert authentication.role is not None

        if authentication.role < role_required:
            self.audit.record(
                event="authorization",
                identity=authentication.identity,
                path=request.path,
                client_ip=request.client_ip,
                outcome="denied",
                details={
                    "required_role": role_required.label,
                },
            )

            return error_response(
                endpoint=request.path,
                error_type="forbidden",
                message=(
                    f"The {role_required.label} role or higher "
                    "is required."
                ),
                status_code=403,
            )

        rate_limit = self.rate_limiter.check(
            (
                f"{authentication.identity}:"
                f"{request.client_ip}"
            )
        )

        if not rate_limit.allowed:
            self.audit.record(
                event="rate_limit",
                identity=authentication.identity,
                path=request.path,
                client_ip=request.client_ip,
                outcome="denied",
            )

            return error_response(
                endpoint=request.path,
                error_type="rate_limit_exceeded",
                message="Request rate limit exceeded.",
                status_code=429,
                headers={
                    "X-RateLimit-Limit": str(rate_limit.limit),
                    "X-RateLimit-Remaining": "0",
                    "Retry-After": str(
                        rate_limit.retry_after_seconds
                    ),
                },
            )

        self.audit.record(
            event="authorization",
            identity=authentication.identity,
            path=request.path,
            client_ip=request.client_ip,
            outcome="allowed",
            details={
                "required_role": role_required.label,
            },
        )

        return None

    def _parse_mode(
        self,
        request: GatewayRequest,
    ) -> RuntimeMode:
        return RuntimeMode.parse(
            request.query.get("mode")
        )

    def _parse_limit(
        self,
        request: GatewayRequest,
    ) -> int:
        raw_limit = request.query.get(
            "limit",
            "20",
        ).strip()

        try:
            limit = int(raw_limit)
        except ValueError as exc:
            raise ValueError(
                "Run history limit must be an integer."
            ) from exc

        if not 1 <= limit <= 100:
            raise ValueError(
                "Run history limit must be between 1 and 100."
            )

        return limit

    @staticmethod
    def _run_id_from_path(
        path: str,
    ) -> str | None:
        prefix = "/api/runs/"

        if not path.startswith(prefix):
            return None

        run_id = path.removeprefix(prefix).strip()

        if not run_id or "/" in run_id:
            return None

        return run_id

    def handle(
        self,
        request: GatewayRequest,
    ) -> GatewayResponse:
        method = request.method.strip().upper()
        path = request.path.rstrip("/") or "/"

        if method != "GET":
            return error_response(
                endpoint=path,
                error_type="method_not_allowed",
                message=(
                    f"HTTP method {method} is not supported."
                ),
                status_code=405,
            )

        authorization_response = self._authorize(
            GatewayRequest(
                method=method,
                path=path,
                query=request.query,
                headers=request.headers,
                client_ip=request.client_ip,
            )
        )

        if authorization_response is not None:
            return authorization_response

        try:
            if path in self._static_routes:
                return success_response(
                    endpoint=path,
                    data=self._static_routes[path](),
                )

            if path == "/api/collector":
                mode = self._parse_mode(request)
                data = self.service.collector(mode)

                return success_response(
                    endpoint=path,
                    data=data,
                    status_code=(
                        200
                        if data.get("status")
                        in {"operational", "degraded"}
                        else 503
                    ),
                )

            if path == "/api/runtime":
                mode = self._parse_mode(request)
                data = self.service.runtime(mode)

                if data.get("published"):
                    return success_response(
                        endpoint=path,
                        data=data,
                    )

                return GatewayResponse(
                    status_code=503,
                    body={
                        "ok": False,
                        "endpoint": path,
                        "data": data,
                        "error": data.get("error"),
                    },
                )

            if path == "/api/runs":
                return success_response(
                    endpoint=path,
                    data=self.service.runs(
                        limit=self._parse_limit(request)
                    ),
                )

            run_id = self._run_id_from_path(path)

            if run_id is not None:
                data = self.service.run_detail(
                    run_id=run_id
                )

                if data is None:
                    return error_response(
                        endpoint=path,
                        error_type="run_not_found",
                        message=(
                            "No runtime history exists for "
                            f"run ID {run_id}."
                        ),
                        status_code=404,
                    )

                return success_response(
                    endpoint=path,
                    data=data,
                )

            return error_response(
                endpoint=path,
                error_type="not_found",
                message=f"No gateway route exists for {path}.",
                status_code=404,
            )

        except ValueError as exc:
            return error_response(
                endpoint=path,
                error_type=(
                    "invalid_runtime_mode"
                    if "mode" in str(exc).lower()
                    else "invalid_request"
                ),
                message=str(exc),
                status_code=400,
            )

        except LiveModeUnavailableError as exc:
            return error_response(
                endpoint=path,
                error_type=exc.__class__.__name__,
                message=str(exc),
                status_code=503,
            )

        except FileNotFoundError as exc:
            return error_response(
                endpoint=path,
                error_type="resource_not_found",
                message=str(exc),
                status_code=503,
            )

        except Exception as exc:
            return error_response(
                endpoint=path,
                error_type=exc.__class__.__name__,
                message=str(exc),
                status_code=500,
            )