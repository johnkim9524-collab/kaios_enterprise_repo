from __future__ import annotations

from enum import Enum


class RuntimeMode(str, Enum):
    FIXTURE = "fixture"
    FALLBACK = "fallback"
    LIVE = "live"

    @classmethod
    def parse(cls, value: str | None) -> "RuntimeMode":
        normalized = (value or cls.FIXTURE.value).strip().lower()

        try:
            return cls(normalized)
        except ValueError as exc:
            allowed = ", ".join(mode.value for mode in cls)
            raise ValueError(
                f"Unsupported runtime mode: {value!r}. Allowed modes: {allowed}"
            ) from exc