from __future__ import annotations

from app.observability.config import ObservabilityConfig
from app.observability.runtime import ObservabilityRuntime


def runtime(tmp_path) -> ObservabilityRuntime:
    return ObservabilityRuntime(
        ObservabilityConfig(
            enabled=True,
            json_log_enabled=True,
            metrics_enabled=True,
            error_threshold=2,
            latency_threshold_ms=100,
            log_path=tmp_path / "observability.jsonl",
        )
    )


def test_metrics_record_requests(tmp_path) -> None:
    service = runtime(tmp_path)

    service.record(
        request_id="request-1",
        correlation_id="correlation-1",
        method="GET",
        path="/api/health",
        status_code=200,
        duration_ms=12.5,
        client_ip="127.0.0.1",
    )

    metrics = service.metrics()

    assert metrics["request_count"] == 1
    assert metrics["error_count"] == 0
    assert metrics["status_code_count"]["200"] == 1


def test_error_threshold_creates_alert(tmp_path) -> None:
    service = runtime(tmp_path)

    for index in range(2):
        service.record(
            request_id=f"request-{index}",
            correlation_id=f"correlation-{index}",
            method="GET",
            path="/missing",
            status_code=404,
            duration_ms=1,
            client_ip="127.0.0.1",
        )

    assert (
        service.alerts()[0]["code"]
        == "error_threshold_exceeded"
    )


def test_json_log_excludes_authorization_data(
    tmp_path,
) -> None:
    service = runtime(tmp_path)

    service.record(
        request_id="request-safe",
        correlation_id="correlation-safe",
        method="GET",
        path="/api/edition",
        status_code=200,
        duration_ms=2,
        client_ip="127.0.0.1",
    )

    content = (
        tmp_path / "observability.jsonl"
    ).read_text(encoding="utf-8")

    assert "Bearer" not in content
    assert "token" not in content.lower()