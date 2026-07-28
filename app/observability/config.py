from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Mapping


@dataclass(frozen=True, slots=True)
class ObservabilityConfig:
    enabled: bool
    json_log_enabled: bool
    metrics_enabled: bool
    error_threshold: int
    latency_threshold_ms: float
    log_path: Path

    @staticmethod
    def _boolean(
        source: Mapping[str, str],
        key: str,
        default: bool,
    ) -> bool:
        raw = source.get(
            key,
            "true" if default else "false",
        ).strip().lower()

        if raw in {"1", "true", "yes", "on"}:
            return True
        if raw in {"0", "false", "no", "off"}:
            return False

        raise ValueError(f"{key} must be true or false.")

    @classmethod
    def from_environ(
        cls,
        environ: Mapping[str, str] | None = None,
    ) -> "ObservabilityConfig":
        source = os.environ if environ is None else environ

        return cls(
            enabled=cls._boolean(
                source,
                "KAIOS_OBSERVABILITY_ENABLED",
                True,
            ),
            json_log_enabled=cls._boolean(
                source,
                "KAIOS_JSON_LOG_ENABLED",
                True,
            ),
            metrics_enabled=cls._boolean(
                source,
                "KAIOS_METRICS_ENABLED",
                True,
            ),
            error_threshold=int(
                source.get(
                    "KAIOS_ALERT_ERROR_THRESHOLD",
                    "5",
                )
            ),
            latency_threshold_ms=float(
                source.get(
                    "KAIOS_ALERT_LATENCY_MS",
                    "1000",
                )
            ),
            log_path=Path(
                source.get(
                    "KAIOS_OBSERVABILITY_LOG_PATH",
                    "data/observability.jsonl",
                )
            ),
        )