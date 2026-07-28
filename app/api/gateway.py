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
            "/api/config/status": self.service.config_status,
            "/api/status": self.service.status,
            "/api/edition": self.service.edition,
            "/api/scheduler/status": self.service.scheduler_status,
        }

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

            if path == "/api/runs":
                limit = self._parse_limit(request)
                data = self.service.runs(
                    limit=limit
                )

                return success_response(
                    endpoint=path,
                    data=data,
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
                            f"No runtime history exists for run ID "
                            f"{run_id}."
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
                message=(
                    f"No gateway route exists for {path}."
                ),
                status_code=404,
            )

        except ValueError as exc:
            error_type = (
                "invalid_runtime_mode"
                if "mode" in str(exc).lower()
                else "invalid_request"
            )

            return error_response(
                endpoint=path,
                error_type=error_type,
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