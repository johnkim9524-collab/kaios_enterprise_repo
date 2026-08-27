from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
import sqlite3
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
        self._metrics_path = self.config.log_path.with_name(
            "observability-metrics.sqlite3"
        )
        self._initialize_metrics_store()

    def _connect(self) -> sqlite3.Connection:
        self._metrics_path.parent.mkdir(
            parents=True,
            exist_ok=True,
        )
        connection = sqlite3.connect(
            self._metrics_path,
            timeout=5.0,
            isolation_level=None,
        )
        connection.execute("PRAGMA journal_mode=WAL")
        connection.execute("PRAGMA synchronous=FULL")
        connection.execute("PRAGMA busy_timeout=5000")
        return connection

    def _initialize_metrics_store(self) -> None:
        with self._connect() as connection:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS metrics_state (
                    singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
                    request_count INTEGER NOT NULL,
                    error_count INTEGER NOT NULL,
                    latency_total_ms REAL NOT NULL,
                    latency_max_ms REAL NOT NULL,
                    last_request_id TEXT,
                    last_correlation_id TEXT,
                    updated_at TEXT NOT NULL
                )
                """
            )
            connection.execute(
                """
                INSERT OR IGNORE INTO metrics_state (
                    singleton,
                    request_count,
                    error_count,
                    latency_total_ms,
                    latency_max_ms,
                    last_request_id,
                    last_correlation_id,
                    updated_at
                ) VALUES (1, 0, 0, 0.0, 0.0, NULL, NULL, ?)
                """,
                (datetime.now(UTC).isoformat(),),
            )
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS status_code_count (
                    status_code TEXT PRIMARY KEY,
                    count INTEGER NOT NULL
                )
                """
            )
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS route_count (
                    route TEXT PRIMARY KEY,
                    count INTEGER NOT NULL
                )
                """
            )

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

        connection = self._connect()
        try:
            connection.execute("BEGIN IMMEDIATE")
            connection.execute(
                """
                UPDATE metrics_state
                SET request_count = request_count + 1,
                    error_count = error_count + ?,
                    latency_total_ms = latency_total_ms + ?,
                    latency_max_ms = MAX(latency_max_ms, ?),
                    last_request_id = ?,
                    last_correlation_id = ?,
                    updated_at = ?
                WHERE singleton = 1
                """,
                (
                    1 if status_code >= 400 else 0,
                    duration_ms,
                    duration_ms,
                    request_id,
                    correlation_id,
                    datetime.now(UTC).isoformat(),
                ),
            )
            connection.execute(
                """
                INSERT INTO status_code_count (status_code, count)
                VALUES (?, 1)
                ON CONFLICT(status_code)
                DO UPDATE SET count = count + 1
                """,
                (str(status_code),),
            )
            connection.execute(
                """
                INSERT INTO route_count (route, count)
                VALUES (?, 1)
                ON CONFLICT(route)
                DO UPDATE SET count = count + 1
                """,
                (path,),
            )
            connection.execute("COMMIT")
        except Exception:
            if connection.in_transaction:
                connection.execute("ROLLBACK")
            raise
        finally:
            connection.close()

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
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT request_count, error_count, latency_total_ms,
                       latency_max_ms, last_request_id, last_correlation_id
                FROM metrics_state
                WHERE singleton = 1
                """
            ).fetchone()
            status_codes = dict(
                connection.execute(
                    "SELECT status_code, count FROM status_code_count"
                ).fetchall()
            )
            routes = dict(
                connection.execute(
                    "SELECT route, count FROM route_count"
                ).fetchall()
            )

        assert row is not None
        request_count = int(row[0])
        latency_total_ms = float(row[2])
        average = (
            latency_total_ms / request_count
            if request_count
            else 0.0
        )
        return {
            "request_count": request_count,
            "error_count": int(row[1]),
            "status_code_count": status_codes,
            "route_count": routes,
            "latency_total_ms": round(latency_total_ms, 3),
            "latency_average_ms": round(average, 3),
            "latency_max_ms": round(float(row[3]), 3),
            "uptime_seconds": round(
                monotonic() - self.started_at,
                3,
            ),
            "last_request_id": row[4],
            "last_correlation_id": row[5],
            "persistence": "sqlite",
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
            "metrics_persistence": "sqlite",
            "active_alerts": active_alerts,
        }


observability = ObservabilityRuntime()
