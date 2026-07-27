from __future__ import annotations

import hashlib
import random
from typing import Any, Protocol

from app.collectors.contracts import AdapterContext
from app.core.errors import LiveModeUnavailableError
from app.core.modes import RuntimeMode
from app.utils.time import now_iso


FIXTURE_TIMESTAMP = "2000-01-01T00:00:00+00:00"


class SourceAdapter(Protocol):
    def collect(
        self,
        context: AdapterContext,
    ) -> list[dict[str, Any]]:
        ...


def deterministic_number(
    source_id: str,
    brand_id: str,
    field_name: str,
    minimum: int,
    maximum: int,
) -> int:
    raw_value = (
        f"{source_id}:{brand_id}:{field_name}"
    ).encode("utf-8")

    digest = hashlib.sha256(raw_value).hexdigest()
    numeric_value = int(digest[:8], 16)
    span = maximum - minimum + 1

    return minimum + (numeric_value % span)


class FixtureSourceAdapter:
    def collect(
        self,
        context: AdapterContext,
    ) -> list[dict[str, Any]]:
        source = context.source
        signals: list[dict[str, Any]] = []

        for brand in context.brands:
            source_id = source["id"]
            brand_id = brand["id"]

            signals.append(
                {
                    "collected_at": FIXTURE_TIMESTAMP,
                    "source_id": source_id,
                    "source_name": source["name"],
                    "source_type": source["type"],
                    "source_weight": source.get(
                        "weight",
                        0.1,
                    ),
                    "brand_id": brand_id,
                    "brand": brand["name"],
                    "category": brand["category"],
                    "region": brand["region"],
                    "signal": deterministic_number(
                        source_id,
                        brand_id,
                        "signal",
                        72,
                        96,
                    ),
                    "sentiment": deterministic_number(
                        source_id,
                        brand_id,
                        "sentiment",
                        68,
                        96,
                    ),
                    "visibility": deterministic_number(
                        source_id,
                        brand_id,
                        "visibility",
                        62,
                        96,
                    ),
                    "confidence": deterministic_number(
                        source_id,
                        brand_id,
                        "confidence",
                        75,
                        96,
                    ),
                    "mode": RuntimeMode.FIXTURE.value,
                }
            )

        return signals


class FallbackSourceAdapter:
    def collect(
        self,
        context: AdapterContext,
    ) -> list[dict[str, Any]]:
        source = context.source
        signals: list[dict[str, Any]] = []

        for brand in context.brands:
            signals.append(
                {
                    "collected_at": now_iso(),
                    "source_id": source["id"],
                    "source_name": source["name"],
                    "source_type": source["type"],
                    "source_weight": source.get(
                        "weight",
                        0.1,
                    ),
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
            )

        return signals


class LiveSourceAdapter:
    def collect(
        self,
        context: AdapterContext,
    ) -> list[dict[str, Any]]:
        raise LiveModeUnavailableError()