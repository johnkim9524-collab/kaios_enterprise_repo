from __future__ import annotations

import os
import time
from typing import Any

from app.collectors.contracts import (
    AdapterContext,
    CollectionReport,
    SourceExecution,
)
from app.collectors.registry import AdapterRegistry
from app.core.errors import LiveModeUnavailableError
from app.core.modes import RuntimeMode
from app.utils.time import now_iso


FIXTURE_TIMESTAMP = "2000-01-01T00:00:00+00:00"


class CollectorRuntime:
    def __init__(
        self,
        mode: RuntimeMode,
        registry: AdapterRegistry | None = None,
        max_attempts: int = 2,
    ) -> None:
        if max_attempts < 1:
            raise ValueError(
                "max_attempts must be at least 1"
            )

        self.mode = mode
        self.registry = (
            registry
            if registry is not None
            else AdapterRegistry(mode)
        )
        self.max_attempts = max_attempts

    def _is_active(
        self,
        source: dict[str, Any],
    ) -> bool:
        if not source.get("enabled"):
            return False

        if self.mode is RuntimeMode.LIVE:
            environment_url = os.getenv(
                "KAIOS_LIVE_RSS_URL",
                "",
            ).strip()

            return bool(
                source.get("live_enabled", False)
                or (
                    environment_url
                    and str(
                        source.get("adapter", "")
                    ).strip().lower()
                    in {"rss", "atom"}
                )
            )

        return True

    def collect(
        self,
        sources: list[dict[str, Any]],
        brands: list[dict[str, Any]],
    ) -> CollectionReport:
        active_sources = [
            source
            for source in sources
            if self._is_active(source)
        ]

        if (
            self.mode is RuntimeMode.LIVE
            and not active_sources
        ):
            raise LiveModeUnavailableError()

        signals: list[dict[str, Any]] = []
        executions: list[SourceExecution] = []

        successful_source_count = 0
        failed_source_count = 0

        retry_delay_seconds = float(
            os.getenv(
                "KAIOS_LIVE_RETRY_DELAY_SECONDS",
                "0",
            )
        )

        for source in active_sources:
            adapter = self.registry.resolve(source)
            source_signals: list[
                dict[str, Any]
            ] = []
            error_message: str | None = None
            attempts = 0

            for attempt in range(
                1,
                self.max_attempts + 1,
            ):
                attempts = attempt

                try:
                    source_signals = adapter.collect(
                        AdapterContext(
                            mode=self.mode,
                            source=source,
                            brands=brands,
                        )
                    )
                    error_message = None
                    break
                except LiveModeUnavailableError:
                    raise
                except Exception as exc:
                    error_message = str(exc)

                    if (
                        attempt < self.max_attempts
                        and retry_delay_seconds > 0
                    ):
                        time.sleep(
                            retry_delay_seconds
                        )

            if error_message is None:
                successful_source_count += 1
                signals.extend(source_signals)

                first_signal = (
                    source_signals[0]
                    if source_signals
                    else {}
                )

                executions.append(
                    SourceExecution(
                        source_id=source["id"],
                        source_name=source["name"],
                        source_type=source["type"],
                        status="passed",
                        attempts=attempts,
                        signal_count=len(
                            source_signals
                        ),
                        source_url=first_signal.get(
                            "source_url"
                        ),
                        payload_hash=first_signal.get(
                            "payload_hash"
                        ),
                        duplicate_count=int(
                            first_signal.get(
                                "duplicate_count",
                                0,
                            )
                        ),
                        collected_at=first_signal.get(
                            "collected_at"
                        ),
                    )
                )
            else:
                failed_source_count += 1

                executions.append(
                    SourceExecution(
                        source_id=source["id"],
                        source_name=source["name"],
                        source_type=source["type"],
                        status="failed",
                        attempts=attempts,
                        source_url=source.get("url"),
                        collected_at=now_iso(),
                        error=error_message,
                    )
                )

        if active_sources and (
            successful_source_count == 0
        ):
            status = "failed"
        elif failed_source_count > 0:
            status = "degraded"
        else:
            status = "operational"

        collected_at = (
            FIXTURE_TIMESTAMP
            if self.mode is RuntimeMode.FIXTURE
            else now_iso()
        )

        return CollectionReport(
            collected_at=collected_at,
            mode=self.mode,
            status=status,
            source_count=len(active_sources),
            successful_source_count=(
                successful_source_count
            ),
            failed_source_count=(
                failed_source_count
            ),
            brand_count=len(brands),
            signals=signals,
            sources=executions,
        )