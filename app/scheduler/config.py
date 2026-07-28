from __future__ import annotations

import os
from dataclasses import dataclass

from app.core.modes import RuntimeMode


def env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name, "true" if default else "false").strip().lower()
    if raw in {"1", "true", "yes", "on"}:
        return True
    if raw in {"0", "false", "no", "off"}:
        return False
    raise ValueError(f"{name} must be a boolean value.")


def env_positive_int(name: str, default: int) -> int:
    raw = os.getenv(name, str(default)).strip()
    try:
        value = int(raw)
    except ValueError as exc:
        raise ValueError(f"{name} must be an integer.") from exc
    if value < 1:
        raise ValueError(f"{name} must be at least 1.")
    return value


@dataclass(frozen=True)
class SchedulerConfig:
    enabled: bool
    interval_seconds: int
    lock_ttl_seconds: int
    heartbeat_seconds: int
    runtime_mode: RuntimeMode
    scheduler_id: str

    @classmethod
    def from_environment(cls) -> "SchedulerConfig":
        interval = env_positive_int("KAIOS_SCHEDULER_INTERVAL_SECONDS", 3600)
        ttl = env_positive_int("KAIOS_SCHEDULER_LOCK_TTL_SECONDS", max(interval, 900))
        heartbeat = env_positive_int("KAIOS_SCHEDULER_HEARTBEAT_SECONDS", 30)
        if heartbeat >= ttl:
            raise ValueError("Scheduler heartbeat must be shorter than lock TTL.")
        scheduler_id = os.getenv("KAIOS_SCHEDULER_ID", "kaios-primary").strip()
        if not scheduler_id:
            raise ValueError("KAIOS_SCHEDULER_ID must not be empty.")
        return cls(
            enabled=env_bool("KAIOS_SCHEDULER_ENABLED", False),
            interval_seconds=interval,
            lock_ttl_seconds=ttl,
            heartbeat_seconds=heartbeat,
            runtime_mode=RuntimeMode.parse(os.getenv("KAIOS_SCHEDULER_RUNTIME_MODE", "fixture")),
            scheduler_id=scheduler_id,
        )