from __future__ import annotations

import json
from collections import Counter
from datetime import UTC, datetime
from threading import Lock
from time import monotonic
from typing import Any

from app.observability.config import ObservabilityConfig


class ObservabilityRuntime:
    def __init__(
        self,
        config: ObservabilityConfig | None = None,
    ) -> None:
        self.config = config or ObservabilityConfig.from_environ()
        self.started_at = monotonic()
        self._lock = Lock()
        self._request_count = 0
        self._error_count = 0
        self._latency_total_ms = 0.0
        self._latency_max_ms = 0.0
        self._status_codes: Counter[str] = Counter()
        self._routes: Counter[str] = Counter()
        self._last_request_id: str | None = None
        self._last_correlation_id: str | None = None

    def record(
        self,
        *,
        request_id: str,
        correlation_id: str,
        method: str,
        path: str,
        status_code: int,
        duration_ms: float,
        client_ip: str,
    ) -> None:
        if not self.config.enabled:
            return

        with self._lock:
            self._request_count += 1
            if status_code >= 400:
                self._error_count += 1
            self._latency_total_ms += duration_ms
            self._latency_max_ms = max(
                self._latency_max_ms,
                duration_ms,
            )
            self._status_codes[str(status_code)] += 1
            self._routes[path] += 1
            self._last_request_id = request_id
            self._last_correlation_id = correlation_id

        if self.config.json_log_enabled:
            self._write_log(
                {
                    "timestamp": datetime.now(UTC).isoformat(),
                    "level": (
                        "ERROR"
                        if status_code >= 500
                        else "WARNING"
                        if status_code >= 400
                        else "INFO"
                    ),
                    "event": "http_request",
                    "request_id": request_id,
                    "correlation_id": correlation_id,
                    "method": method,
                    "path": path,
                    "status_code": status_code,
                    "duration_ms": round(duration_ms, 3),
                    "client_ip": client_ip,
                }
            )

    def _write_log(
        self,
        entry: dict[str, Any],
    ) -> None:
        self.config.log_path.parent.mkdir(
            parents=True,
            exist_ok=True,
        )
        line = json.dumps(
            entry,
            ensure_ascii=False,
            separators=(",", ":"),
        )
        with self._lock:
            with self.config.log_path.open(
                "a",
                encoding="utf-8",
            ) as handle:
                handle.write(line + "\n")

    def metrics(self) -> dict[str, Any]:
        with self._lock:
            request_count = self._request_count
            average = (
                self._latency_total_ms / request_count
                if request_count
                else 0.0
            )
            return {
                "request_count": request_count,
                "error_count": self._error_count,
                "status_code_count": dict(self._status_codes),
                "route_count": dict(self._routes),
                "latency_total_ms": round(
                    self._latency_total_ms,
                    3,
                ),
                "latency_average_ms": round(
                    average,
                    3,
                ),
                "latency_max_ms": round(
                    self._latency_max_ms,
                    3,
                ),
                "uptime_seconds": round(
                    monotonic() - self.started_at,
                    3,
                ),
                "last_request_id": self._last_request_id,
                "last_correlation_id": (
                    self._last_correlation_id
                ),
            }

    def alerts(self) -> list[dict[str, Any]]:
        metrics = self.metrics()
        alerts: list[dict[str, Any]] = []

        if (
            metrics["error_count"]
            >= self.config.error_threshold
        ):
            alerts.append(
                {
                    "code": "error_threshold_exceeded",
                    "severity": "warning",
                    "value": metrics["error_count"],
                    "threshold": self.config.error_threshold,
                }
            )

        if (
            metrics["latency_max_ms"]
            >= self.config.latency_threshold_ms
        ):
            alerts.append(
                {
                    "code": "latency_threshold_exceeded",
                    "severity": "warning",
                    "value": metrics["latency_max_ms"],
                    "threshold": (
                        self.config.latency_threshold_ms
                    ),
                }
            )

        return alerts

    def status(self) -> dict[str, Any]:
        active_alerts = self.alerts()
        return {
            "status": (
                "degraded"
                if active_alerts
                else "operational"
            ),
            "enabled": self.config.enabled,
            "logging": (
                "enabled"
                if self.config.json_log_enabled
                else "disabled"
            ),
            "metrics": (
                "enabled"
                if self.config.metrics_enabled
                else "disabled"
            ),
            "active_alerts": active_alerts,
        }


observability = ObservabilityRuntime()