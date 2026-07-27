from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any

from app.core.modes import RuntimeMode


@dataclass(frozen=True)
class AdapterContext:
    mode: RuntimeMode
    source: dict[str, Any]
    brands: list[dict[str, Any]]


@dataclass
class SourceExecution:
    source_id: str
    source_name: str
    source_type: str
    status: str
    attempts: int
    signal_count: int = 0
    error: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class CollectionReport:
    collected_at: str
    mode: RuntimeMode
    status: str
    source_count: int
    successful_source_count: int
    failed_source_count: int
    brand_count: int
    signals: list[dict[str, Any]] = field(default_factory=list)
    sources: list[SourceExecution] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "collected_at": self.collected_at,
            "mode": self.mode.value,
            "status": self.status,
            "source_count": self.source_count,
            "successful_source_count": self.successful_source_count,
            "failed_source_count": self.failed_source_count,
            "brand_count": self.brand_count,
            "signals": self.signals,
            "sources": [
                source.to_dict()
                for source in self.sources
            ],
        }