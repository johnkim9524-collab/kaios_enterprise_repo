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
    assert metrics["persistence"] == "sqlite"


def test_metrics_and_alerts_survive_runtime_restart(tmp_path) -> None:
    first = runtime(tmp_path)
    first.record(
        request_id="request-before-restart-1",
        correlation_id="correlation-before-restart-1",
        method="GET",
        path="/missing",
        status_code=500,
        duration_ms=120,
        client_ip="127.0.0.1",
    )
    first.record(
        request_id="request-before-restart-2",
        correlation_id="correlation-before-restart-2",
        method="GET",
        path="/missing",
        status_code=500,
        duration_ms=80,
        client_ip="127.0.0.1",
    )

    restarted = runtime(tmp_path)
    metrics = restarted.metrics()
    alert_codes = {item["code"] for item in restarted.alerts()}

    assert metrics["request_count"] == 2
    assert metrics["error_count"] == 2
    assert metrics["status_code_count"]["500"] == 2
    assert metrics["route_count"]["/missing"] == 2
    assert metrics["latency_max_ms"] == 120
    assert metrics["last_request_id"] == "request-before-restart-2"
    assert "error_threshold_exceeded" in alert_codes
    assert "latency_threshold_exceeded" in alert_codes


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
