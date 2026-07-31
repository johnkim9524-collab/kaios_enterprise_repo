from __future__ import annotations

from app.agent import KAIOSAgent
from app.core.modes import RuntimeMode
from app.gates.quality_gate import QualityGate
from app.persistence.repository import (
    RunHistoryRepository,
)


def test_agent_persists_runtime_history(
    tmp_path,
) -> None:
    repository = RunHistoryRepository(
        database_path=tmp_path / "agent.db"
    )

    result = KAIOSAgent(
        mode=RuntimeMode.FIXTURE,
        history_repository=repository,
    ).run(
        trigger_type="test"
    )

    assert result["published"] is True
    assert result["run_id"]
    assert result["trigger_type"] == "test"

    persisted = repository.get_run(
        result["run_id"]
    )

    assert persisted is not None
    assert persisted["published"] is True
    assert persisted["status"] == "published"
    assert persisted["edition"] == result["edition"]
    assert len(persisted["stages"]) == 7
    assert len(persisted["sources"]) > 0
    assert persisted["publication"] is not None


def test_quality_gate_failure_is_persisted(
    tmp_path,
    monkeypatch,
) -> None:
    repository = RunHistoryRepository(
        database_path=tmp_path / "agent-failure.db"
    )

    monkeypatch.setattr(
        QualityGate,
        "check",
        lambda self, edition: {
            "edition": edition,
            "passed": False,
            "checks": [],
        },
    )

    result = KAIOSAgent(
        mode=RuntimeMode.FIXTURE,
        history_repository=repository,
    ).run(
        trigger_type="test"
    )

    assert result["published"] is False
    assert result["error"]["stage"] == "quality_gate"

    persisted = repository.get_run(
        result["run_id"]
    )

    assert persisted is not None
    assert persisted["status"] == "failed"
    assert persisted["error"]["stage"] == "quality_gate"
    assert len(persisted["stages"]) == 5
