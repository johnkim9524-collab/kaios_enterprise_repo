from __future__ import annotations

from app.core.contracts import StageRecord
from app.core.modes import RuntimeMode
from app.persistence.repository import (
    RunHistoryRepository,
)


def test_repository_records_complete_run(
    tmp_path,
) -> None:
    repository = RunHistoryRepository(
        database_path=tmp_path / "history.db"
    )

    run_id = repository.start_run(
        mode=RuntimeMode.FIXTURE,
        trigger_type="test",
    )

    repository.record_stage(
        run_id=run_id,
        sequence_number=1,
        stage=StageRecord(
            name="collector",
            status="passed",
        ),
    )

    repository.record_sources(
        run_id=run_id,
        sources=[
            {
                "source_id": "source-one",
                "source_name": "Source One",
                "source_type": "official",
                "status": "passed",
                "attempts": 1,
                "signal_count": 6,
                "error": None,
            }
        ],
    )

    repository.record_publication(
        run_id=run_id,
        edition="2026.06",
    )

    repository.complete_run(
        run_id=run_id,
        status="published",
        published=True,
        edition="2026.06",
        duration_ms=100,
    )

    result = repository.get_run(
        run_id
    )

    assert result is not None
    assert result["status"] == "published"
    assert result["published"] is True
    assert result["edition"] == "2026.06"
    assert result["trigger_type"] == "test"
    assert result["duration_ms"] == 100
    assert len(result["stages"]) == 1
    assert len(result["sources"]) == 1
    assert result["publication"]["edition"] == "2026.06"


def test_repository_survives_reopen(
    tmp_path,
) -> None:
    database_path = (
        tmp_path / "persistent.db"
    )

    first_repository = RunHistoryRepository(
        database_path=database_path
    )

    run_id = first_repository.start_run(
        mode=RuntimeMode.FIXTURE,
        trigger_type="restart-test",
    )

    first_repository.complete_run(
        run_id=run_id,
        status="failed",
        published=False,
        edition=None,
        duration_ms=10,
        error={
            "type": "test_error",
            "stage": "collector",
            "message": "Expected failure",
        },
    )

    second_repository = RunHistoryRepository(
        database_path=database_path
    )

    result = second_repository.get_run(
        run_id
    )

    assert result is not None
    assert result["status"] == "failed"
    assert result["error"]["stage"] == "collector"
    assert second_repository.count_runs() == 1


def test_list_runs_is_newest_first(
    tmp_path,
) -> None:
    repository = RunHistoryRepository(
        database_path=tmp_path / "history.db"
    )

    older = repository.start_run(
        mode=RuntimeMode.FIXTURE,
        run_id="older",
        started_at="2026-01-01T00:00:00+00:00",
    )

    newer = repository.start_run(
        mode=RuntimeMode.FIXTURE,
        run_id="newer",
        started_at="2026-01-02T00:00:00+00:00",
    )

    repository.complete_run(
        run_id=older,
        status="published",
        published=True,
        edition="2026.01",
        duration_ms=10,
    )

    repository.complete_run(
        run_id=newer,
        status="published",
        published=True,
        edition="2026.02",
        duration_ms=10,
    )

    runs = repository.list_runs()

    assert runs[0]["run_id"] == "newer"
    assert runs[1]["run_id"] == "older"