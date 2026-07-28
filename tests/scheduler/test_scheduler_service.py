from __future__ import annotations

from app.core.modes import RuntimeMode
from app.persistence.repository import RunHistoryRepository
from app.scheduler.config import SchedulerConfig
from app.scheduler.repository import SchedulerRepository
from app.scheduler.service import SchedulerService


class FakeAgent:
    def __init__(
        self,
        mode,
        history_repository,
    ) -> None:
        self.mode = mode
        self.history_repository = history_repository

    def run(
        self,
        trigger_type: str,
    ) -> dict:
        assert trigger_type == "scheduled"

        run_id = self.history_repository.start_run(
            mode=self.mode,
            trigger_type=trigger_type,
        )

        self.history_repository.complete_run(
            run_id=run_id,
            status="published",
            published=True,
            edition="2026.06",
            duration_ms=10,
        )

        return {
            "run_id": run_id,
            "trigger_type": trigger_type,
            "published": True,
            "error": None,
        }


def scheduler_config(
    enabled: bool = True,
) -> SchedulerConfig:
    return SchedulerConfig(
        enabled=enabled,
        interval_seconds=60,
        lock_ttl_seconds=120,
        heartbeat_seconds=30,
        runtime_mode=RuntimeMode.FIXTURE,
        scheduler_id="scheduler-test",
    )


def test_disabled_scheduler_does_not_run(
    tmp_path,
) -> None:
    database_path = tmp_path / "scheduler.db"

    service = SchedulerService(
        config=scheduler_config(
            enabled=False
        ),
        scheduler_repository=SchedulerRepository(
            database_path=database_path
        ),
        history_repository=RunHistoryRepository(
            database_path=database_path
        ),
        agent_factory=FakeAgent,
    )

    result = service.run_once()

    assert result["executed"] is False
    assert (
        result["reason"]
        == "scheduler_disabled"
    )


def test_scheduled_run_is_persisted(
    tmp_path,
) -> None:
    database_path = tmp_path / "scheduler.db"

    history_repository = RunHistoryRepository(
        database_path=database_path
    )

    service = SchedulerService(
        config=scheduler_config(),
        scheduler_repository=SchedulerRepository(
            database_path=database_path
        ),
        history_repository=history_repository,
        agent_factory=FakeAgent,
    )

    result = service.run_once()

    assert result["executed"] is True
    assert result["result"]["published"] is True

    run = history_repository.get_run(
        result["result"]["run_id"]
    )

    assert run is not None
    assert run["trigger_type"] == "scheduled"
    assert run["status"] == "published"

    status = service.status()

    assert (
        status["last_run_status"]
        == "published"
    )
    assert status["next_run_at"] is not None
    assert status["lock"] is None