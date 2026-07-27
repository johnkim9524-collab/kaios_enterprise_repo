from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any

from app.core.modes import RuntimeMode


@dataclass(frozen=True)
class StageRecord:
    name: str
    status: str
    detail: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class RuntimeResult:
    published: bool
    mode: RuntimeMode
    run_id: str | None = None
    trigger_type: str = "manual"
    edition: str | None = None
    audit: dict[str, Any] | None = None
    health: dict[str, Any] | None = None
    stages: list[StageRecord] = field(default_factory=list)
    error: dict[str, Any] | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "run_id": self.run_id,
            "trigger_type": self.trigger_type,
            "published": self.published,
            "mode": self.mode.value,
            "edition": self.edition,
            "audit": self.audit,
            "health": self.health,
            "stages": [
                stage.to_dict()
                for stage in self.stages
            ],
            "error": self.error,
        }