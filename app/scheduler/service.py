from __future__ import annotations

import threading
import time
import uuid
from datetime import timedelta
from typing import Any, Callable

from app.agent import KAIOSAgent
from app.persistence.repository import RunHistoryRepository
from app.scheduler.config import SchedulerConfig
from app.scheduler.repository import SchedulerRepository, utc_now


class LockHeartbeat:
    def __init__(self, repository: SchedulerRepository, owner_id: str, ttl_seconds: int, interval_seconds: int) -> None:
        self.repository = repository
        self.owner_id = owner_id
        self.ttl_seconds = ttl_seconds
        self.interval_seconds = interval_seconds
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread is not None:
            self._thread.join(timeout=self.interval_seconds + 1)

    def _run(self) -> None:
        while not self._stop.wait(self.interval_seconds):
            if not self.repository.heartbeat(self.owner_id, self.ttl_seconds):
                return


class SchedulerService:
    def __init__(
        self,
        config: SchedulerConfig | None = None,
        scheduler_repository: SchedulerRepository | None = None,
        history_repository: RunHistoryRepository | None = None,
        agent_factory: Callable[..., KAIOSAgent] = KAIOSAgent,
    ) -> None:
        self.config = config if config is not None else SchedulerConfig.from_environment()
        self.scheduler_repository = scheduler_repository if scheduler_repository is not None else SchedulerRepository()
        self.history_repository = history_repository if history_repository is not None else RunHistoryRepository()
        self.agent_factory = agent_factory

    def status(self) -> dict[str, Any]:
        state = self.scheduler_repository.get_state(self.config.scheduler_id)
        return {
            "scheduler_id": self.config.scheduler_id,
            "enabled": self.config.enabled,
            "interval_seconds": self.config.interval_seconds,
            "runtime_mode": self.config.runtime_mode.value,
            "last_tick_at": state.get("last_tick_at") if state else None,
            "last_run_id": state.get("last_run_id") if state else None,
            "last_run_status": state.get("last_run_status") if state else None,
            "last_run_started_at": state.get("last_run_started_at") if state else None,
            "last_run_completed_at": state.get("last_run_completed_at") if state else None,
            "next_run_at": state.get("next_run_at") if state else None,
            "last_error": state.get("last_error") if state else None,
            "lock": self.scheduler_repository.get_lock(),
        }

    def run_once(self) -> dict[str, Any]:
        tick_at = utc_now()
        next_run_at = (tick_at + timedelta(seconds=self.config.interval_seconds)).isoformat()
        self.scheduler_repository.update_state(
            scheduler_id=self.config.scheduler_id,
            enabled=self.config.enabled,
            interval_seconds=self.config.interval_seconds,
            runtime_mode=self.config.runtime_mode.value,
            last_tick_at=tick_at.isoformat(),
            next_run_at=next_run_at,
        )
        if not self.config.enabled:
            return {"executed": False, "reason": "scheduler_disabled", "status": self.status()}

        owner_id = f"{self.config.scheduler_id}:{uuid.uuid4()}"
        if not self.scheduler_repository.acquire_lock(owner_id, self.config.lock_ttl_seconds, tick_at):
            return {"executed": False, "reason": "runtime_locked", "status": self.status()}

        heartbeat = LockHeartbeat(
            self.scheduler_repository,
            owner_id,
            self.config.lock_ttl_seconds,
            self.config.heartbeat_seconds,
        )
        started_at = utc_now().isoformat()
        heartbeat.start()
        try:
            result = self.agent_factory(
                mode=self.config.runtime_mode,
                history_repository=self.history_repository,
            ).run(trigger_type="scheduled")
            completed_at = utc_now().isoformat()
            run_status = "published" if result.get("published") else "failed"
            self.scheduler_repository.update_state(
                scheduler_id=self.config.scheduler_id,
                enabled=self.config.enabled,
                interval_seconds=self.config.interval_seconds,
                runtime_mode=self.config.runtime_mode.value,
                last_run_id=result.get("run_id"),
                last_run_status=run_status,
                last_run_started_at=started_at,
                last_run_completed_at=completed_at,
                next_run_at=next_run_at,
                last_error=(result.get("error") or {}).get("message"),
            )
            return {"executed": True, "reason": None, "result": result, "status": self.status()}
        finally:
            heartbeat.stop()
            self.scheduler_repository.release_lock(owner_id)

    def run_forever(self) -> None:
        while True:
            self.run_once()
            time.sleep(self.config.interval_seconds)