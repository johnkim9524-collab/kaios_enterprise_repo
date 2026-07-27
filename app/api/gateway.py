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
from app.core.errors import (
    LiveModeUnavailableError,
)
from app.core.modes import RuntimeMode


class KAIOSGateway:
    def __init__(
        self,
        service: GatewayService | None = None,
    ) -> None:
        self.service = (
            service
            if service is not None
            else GatewayService()
        )

        self._static_routes: dict[
            str,
            Callable[[], dict[str, Any]],
        ] = {
            "/api/health": self.service.health,
            "/api/status": self.service.status,
            "/api/edition": self.service.edition,
        }

    def _parse_mode(
        self,
        request: GatewayRequest,
    ) -> RuntimeMode:
        return RuntimeMode.parse(
            request.query.get("mode")
        )

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

        try:
            if path in self._static_routes:
                data = self._static_routes[path]()

                return success_response(
                    endpoint=path,
                    data=data,
                )

            if path == "/api/collector":
                mode = self._parse_mode(request)
                data = self.service.collector(mode)

                status_code = (
                    200
                    if data.get("status")
                    in {"operational", "degraded"}
                    else 503
                )

                return success_response(
                    endpoint=path,
                    data=data,
                    status_code=status_code,
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

            return error_response(
                endpoint=path,
                error_type="not_found",
                message=(
                    f"No gateway route exists for {path}."
                ),
                status_code=404,
            )

        except ValueError as exc:
            return error_response(
                endpoint=path,
                error_type="invalid_runtime_mode",
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