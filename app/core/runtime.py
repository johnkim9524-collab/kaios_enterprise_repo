from __future__ import annotations

from collections.abc import Callable
from typing import TypeVar

from app.core.contracts import StageRecord
from app.core.errors import StageExecutionError
from app.core.modes import RuntimeMode


T = TypeVar("T")


class KAIOSRuntime:
    def __init__(self, mode: RuntimeMode) -> None:
        self.mode = mode
        self.stages: list[StageRecord] = []

    def execute(self, stage: str, action: Callable[[], T]) -> T:
        try:
            result = action()
        except Exception as exc:
            self.stages.append(
                StageRecord(
                    name=stage,
                    status="failed",
                    detail=str(exc),
                )
            )
            raise StageExecutionError(stage, exc) from exc

        self.stages.append(
            StageRecord(
                name=stage,
                status="passed",
            )
        )
        return result