from __future__ import annotations

from app.api.contracts import GatewayRequest
from app.api.gateway import KAIOSGateway
from app.api.service import GatewayService
from app.core.contracts import StageRecord
from app.core.modes import RuntimeMode
from app.persistence.repository import RunHistoryRepository


def gateway_for(
    tmp_path,
) -> tuple[KAIOSGateway, RunHistoryRepository]:
    repository = RunHistoryRepository(
        database_path=tmp_path / "gateway-history.db"
    )

    gateway = KAIOSGateway(
        service=GatewayService(
            history_repository=repository
        )
    )

    return gateway, repository


def request(
    gateway: KAIOSGateway,
    path: str,
    query: dict[str, str] | None = None,
):
    return gateway.handle(
        GatewayRequest(
            method="GET",
            path=path,
            query=query or {},
        )
    )


def create_completed_run(
    repository: RunHistoryRepository,
) -> str:
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
                "source_type": "fixture",
                "status": "passed",
                "attempts": 1,
                "signal_count": 3,
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
        duration_ms=25,
    )

    return run_id


def test_runs_route_returns_recent_runs(
    tmp_path,
) -> None:
    gateway, repository = gateway_for(
        tmp_path
    )

    run_id = create_completed_run(
        repository
    )

    response = request(
        gateway,
        "/api/runs",
    )

    assert response.status_code == 200
    assert response.body["ok"] is True
    assert response.body["data"]["count"] == 1
    assert (
        response.body["data"]["runs"][0]["run_id"]
        == run_id
    )


def test_runs_route_accepts_limit(
    tmp_path,
) -> None:
    gateway, repository = gateway_for(
        tmp_path
    )

    create_completed_run(repository)
    create_completed_run(repository)

    response = request(
        gateway,
        "/api/runs",
        query={"limit": "1"},
    )

    assert response.status_code == 200
    assert response.body["data"]["count"] == 1
    assert response.body["data"]["limit"] == 1


def test_runs_route_rejects_non_integer_limit(
    tmp_path,
) -> None:
    gateway, _ = gateway_for(
        tmp_path
    )

    response = request(
        gateway,
        "/api/runs",
        query={"limit": "invalid"},
    )

    assert response.status_code == 400
    assert response.body["ok"] is False
    assert (
        response.body["error"]["type"]
        == "invalid_request"
    )


def test_runs_route_rejects_limit_below_one(
    tmp_path,
) -> None:
    gateway, _ = gateway_for(
        tmp_path
    )

    response = request(
        gateway,
        "/api/runs",
        query={"limit": "0"},
    )

    assert response.status_code == 400
    assert response.body["ok"] is False
    assert (
        response.body["error"]["type"]
        == "invalid_request"
    )


def test_runs_route_rejects_limit_above_one_hundred(
    tmp_path,
) -> None:
    gateway, _ = gateway_for(
        tmp_path
    )

    response = request(
        gateway,
        "/api/runs",
        query={"limit": "101"},
    )

    assert response.status_code == 400
    assert response.body["ok"] is False
    assert (
        response.body["error"]["type"]
        == "invalid_request"
    )


def test_run_detail_returns_complete_history(
    tmp_path,
) -> None:
    gateway, repository = gateway_for(
        tmp_path
    )

    run_id = create_completed_run(
        repository
    )

    response = request(
        gateway,
        f"/api/runs/{run_id}",
    )

    data = response.body["data"]

    assert response.status_code == 200
    assert response.body["ok"] is True
    assert data["run_id"] == run_id
    assert data["status"] == "published"
    assert data["published"] is True
    assert len(data["stages"]) == 1
    assert len(data["sources"]) == 1
    assert (
        data["publication"]["edition"]
        == "2026.06"
    )


def test_missing_run_returns_404(
    tmp_path,
) -> None:
    gateway, _ = gateway_for(
        tmp_path
    )

    response = request(
        gateway,
        "/api/runs/missing-run",
    )

    assert response.status_code == 404
    assert response.body["ok"] is False
    assert (
        response.body["error"]["type"]
        == "run_not_found"
    )


def test_nested_run_path_returns_gateway_404(
    tmp_path,
) -> None:
    gateway, _ = gateway_for(
        tmp_path
    )

    response = request(
        gateway,
        "/api/runs/run-id/extra",
    )

    assert response.status_code == 404
    assert response.body["ok"] is False
    assert (
        response.body["error"]["type"]
        == "not_found"
    )


def test_api_runtime_persists_trigger_type(
    tmp_path,
) -> None:
    gateway, repository = gateway_for(
        tmp_path
    )

    response = request(
        gateway,
        "/api/runtime",
        query={"mode": "fixture"},
    )

    assert response.status_code == 200
    assert response.body["ok"] is True
    assert (
        response.body["data"]["trigger_type"]
        == "api"
    )

    run_id = response.body["data"]["run_id"]

    assert run_id

    persisted = repository.get_run(
        run_id
    )

    assert persisted is not None
    assert persisted["trigger_type"] == "api"
    assert persisted["status"] == "published"


def test_run_history_route_rejects_post(
    tmp_path,
) -> None:
    gateway, _ = gateway_for(
        tmp_path
    )

    response = gateway.handle(
        GatewayRequest(
            method="POST",
            path="/api/runs",
            query={},
        )
    )

    assert response.status_code == 405
    assert response.body["ok"] is False
    assert (
        response.body["error"]["type"]
        == "method_not_allowed"
    )