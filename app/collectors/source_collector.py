from __future__ import annotations

from app.collectors.registry import AdapterRegistry
from app.collectors.runtime import CollectorRuntime
from app.core.modes import RuntimeMode
from app.utils.io import read_json, write_json


class SourceCollector:
    def __init__(
        self,
        mode: RuntimeMode = RuntimeMode.FIXTURE,
        registry: AdapterRegistry | None = None,
        max_attempts: int = 2,
    ) -> None:
        self.mode = mode
        self.sources = read_json(
            "config/sources.json",
            {"sources": []},
        )["sources"]
        self.brands = read_json(
            "config/brands.json",
            {"brands": []},
        )["brands"]

        self.runtime = CollectorRuntime(
            mode=mode,
            registry=registry,
            max_attempts=max_attempts,
        )

    def collect(self) -> dict:
        report = self.runtime.collect(
            sources=self.sources,
            brands=self.brands,
        )

        payload = report.to_dict()

        write_json(
            "data/raw/latest_signals.json",
            payload,
        )

        cache_date = payload[
            "collected_at"
        ][:10]

        write_json(
            (
                "data/cache/"
                f"signals_{cache_date}.json"
            ),
            payload,
        )

        return payload