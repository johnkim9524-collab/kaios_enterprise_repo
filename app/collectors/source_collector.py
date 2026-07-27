from __future__ import annotations

import random
from typing import Any

from app.core.errors import LiveModeUnavailableError
from app.core.modes import RuntimeMode
from app.utils.io import read_json, write_json
from app.utils.time import now_iso


FIXTURE_TIMESTAMP = "2000-01-01T00:00:00+00:00"


class SourceCollector:
    def __init__(
        self,
        mode: RuntimeMode = RuntimeMode.FIXTURE,
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

    def _fixture_signal(
        self,
        source: dict[str, Any],
        brand: dict[str, Any],
        source_index: int,
        brand_index: int,
    ) -> dict[str, Any]:
        offset = (source_index * 11) + (brand_index * 7)

        return {
            "collected_at": FIXTURE_TIMESTAMP,
            "source_id": source["id"],
            "source_name": source["name"],
            "source_type": source["type"],
            "source_weight": source.get("weight", 0.1),
            "brand_id": brand["id"],
            "brand": brand["name"],
            "category": brand["category"],
            "region": brand["region"],
            "signal": 72 + (offset % 25),
            "sentiment": 68 + ((offset + 5) % 29),
            "visibility": 62 + ((offset + 9) % 35),
            "confidence": 75 + ((offset + 3) % 22),
            "mode": RuntimeMode.FIXTURE.value,
        }

    def _fallback_signal(
        self,
        source: dict[str, Any],
        brand: dict[str, Any],
    ) -> dict[str, Any]:
        return {
            "collected_at": now_iso(),
            "source_id": source["id"],
            "source_name": source["name"],
            "source_type": source["type"],
            "source_weight": source.get("weight", 0.1),
            "brand_id": brand["id"],
            "brand": brand["name"],
            "category": brand["category"],
            "region": brand["region"],
            "signal": random.randint(72, 96),
            "sentiment": random.randint(68, 96),
            "visibility": random.randint(62, 96),
            "confidence": random.randint(75, 96),
            "mode": RuntimeMode.FALLBACK.value,
        }

    def collect(self) -> dict[str, Any]:
        if self.mode is RuntimeMode.LIVE:
            raise LiveModeUnavailableError()

        collected_at = (
            FIXTURE_TIMESTAMP
            if self.mode is RuntimeMode.FIXTURE
            else now_iso()
        )

        active_sources = [
            source
            for source in self.sources
            if source.get("enabled")
        ]

        signals: list[dict[str, Any]] = []

        for source_index, source in enumerate(active_sources):
            for brand_index, brand in enumerate(self.brands):
                if self.mode is RuntimeMode.FIXTURE:
                    signal = self._fixture_signal(
                        source,
                        brand,
                        source_index,
                        brand_index,
                    )
                else:
                    signal = self._fallback_signal(
                        source,
                        brand,
                    )

                signals.append(signal)

        payload = {
            "collected_at": collected_at,
            "mode": self.mode.value,
            "source_count": len(active_sources),
            "brand_count": len(self.brands),
            "signals": signals,
        }

        write_json(
            "data/raw/latest_signals.json",
            payload,
        )

        cache_date = collected_at[:10]

        write_json(
            f"data/cache/signals_{cache_date}.json",
            payload,
        )

        return payload