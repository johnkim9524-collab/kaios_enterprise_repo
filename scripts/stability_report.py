from __future__ import annotations

import argparse
import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def load_records(path: Path) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    if not path.exists():
        return records
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            payload = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(payload, dict):
            records.append(payload)
    return records


def ratio(numerator: int, denominator: int) -> float:
    if denominator == 0:
        return 0.0
    return round((numerator / denominator) * 100, 3)


def build_report(records: list[dict[str, Any]], hours: int) -> dict[str, Any]:
    selected = records[-hours:]
    total = len(selected)

    healthy = sum(
        1
        for record in selected
        if record.get("health_http") == 200
        and record.get("health_ok") is True
        and record.get("health_status") in {"operational", "degraded"}
    )
    gateway_healthy = sum(
        1
        for record in selected
        if str(record.get("gateway", "")).startswith("running|healthy")
    )
    scheduler_running = sum(
        1
        for record in selected
        if str(record.get("scheduler_container", "")).startswith("running")
    )
    database_ok = sum(
        1
        for record in selected
        if (record.get("database") or {}).get("integrity") == "ok"
    )
    backup_ok = sum(
        1
        for record in selected
        if (record.get("backup") or {}).get("integrity") == "ok"
    )

    source_statuses = Counter(
        str(((record.get("database") or {}).get("latest_source") or {}).get("status", "missing"))
        for record in selected
    )
    runtime_statuses = Counter(
        str(((record.get("database") or {}).get("latest_runtime") or {}).get("status", "missing"))
        for record in selected
    )

    latencies = [
        int(record.get("health_latency_ms", 0))
        for record in selected
        if isinstance(record.get("health_latency_ms"), int)
    ]
    latencies.sort()
    p95 = 0
    if latencies:
        index = min(len(latencies) - 1, max(0, int(len(latencies) * 0.95) - 1))
        p95 = latencies[index]

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "requested_hours": hours,
        "observed_samples": total,
        "coverage_percent": ratio(total, hours),
        "health_success_percent": ratio(healthy, total),
        "gateway_healthy_percent": ratio(gateway_healthy, total),
        "scheduler_running_percent": ratio(scheduler_running, total),
        "database_integrity_percent": ratio(database_ok, total),
        "backup_integrity_percent": ratio(backup_ok, total),
        "health_latency_p95_ms": p95,
        "runtime_statuses": dict(runtime_statuses),
        "source_statuses": dict(source_statuses),
        "latest_recorded_at": selected[-1].get("recorded_at") if selected else None,
        "gate": {
            "gateway_uptime_target_met": ratio(gateway_healthy, total) >= 99.9 if total else False,
            "scheduler_target_met": ratio(scheduler_running, total) >= 99.0 if total else False,
            "database_integrity_target_met": database_ok == total and total > 0,
            "backup_target_met": backup_ok == total and total > 0,
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--input",
        default="/opt/intelligence-holdings/kidults/logs/stability-hourly.jsonl",
    )
    parser.add_argument("--hours", type=int, default=24)
    parser.add_argument(
        "--output",
        default="/opt/intelligence-holdings/kidults/logs/stability-report.json",
    )
    args = parser.parse_args()

    report = build_report(load_records(Path(args.input)), args.hours)
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(
        json.dumps(report, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(report, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
