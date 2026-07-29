from __future__ import annotations

import argparse
import json
import sqlite3
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


def http_json(url: str, timeout: int = 15) -> tuple[int, dict[str, Any], int]:
    started = time.perf_counter()
    request = Request(
        url,
        headers={
            "Accept": "application/json",
            "User-Agent": "kaios-stability-snapshot",
        },
        method="GET",
    )
    try:
        with urlopen(request, timeout=timeout) as response:
            body = response.read()
            status = response.status
    except HTTPError as exc:
        body = exc.read()
        status = exc.code
    except (OSError, URLError, TimeoutError) as exc:
        elapsed_ms = int((time.perf_counter() - started) * 1000)
        return 0, {"error": str(exc)}, elapsed_ms

    elapsed_ms = int((time.perf_counter() - started) * 1000)
    try:
        payload = json.loads(body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        payload = {"raw": body.decode("utf-8", errors="replace")[:500]}
    return status, payload, elapsed_ms


def container_state(name: str) -> str:
    result = subprocess.run(
        [
            "docker",
            "inspect",
            name,
            "--format",
            "{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{end}}",
        ],
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        return "missing"
    return result.stdout.strip() or "unknown"


def backup_state(backup_root: Path) -> dict[str, Any]:
    manifests = sorted(
        backup_root.glob("daily/*.manifest.json"),
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    )
    if not manifests:
        return {
            "latest_manifest": None,
            "integrity": "missing",
            "age_seconds": None,
        }

    latest = manifests[0]
    try:
        payload = json.loads(latest.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        payload = {}

    return {
        "latest_manifest": str(latest),
        "integrity": payload.get("integrity", "unknown"),
        "age_seconds": max(0, int(time.time() - latest.stat().st_mtime)),
    }


def database_state(database: Path) -> dict[str, Any]:
    connection = sqlite3.connect(database)
    connection.row_factory = sqlite3.Row
    try:
        integrity = connection.execute(
            "PRAGMA integrity_check"
        ).fetchone()[0]

        runtime = connection.execute(
            """
            SELECT runtime_mode, status, duration_ms, completed_at, error_message
            FROM runtime_runs
            ORDER BY rowid DESC
            LIMIT 1
            """
        ).fetchone()

        scheduler = connection.execute(
            """
            SELECT runtime_mode, last_run_status, last_run_completed_at,
                   next_run_at, last_error
            FROM scheduler_state
            ORDER BY rowid DESC
            LIMIT 1
            """
        ).fetchone()

        source = connection.execute(
            """
            SELECT status, signal_count, error, recorded_at
            FROM source_executions
            ORDER BY rowid DESC
            LIMIT 1
            """
        ).fetchone()

        counts = {}
        for table in (
            "runtime_runs",
            "source_executions",
            "stage_executions",
            "publications",
        ):
            counts[table] = connection.execute(
                f'SELECT COUNT(*) FROM "{table}"'
            ).fetchone()[0]

        return {
            "size_bytes": database.stat().st_size,
            "integrity": integrity,
            "latest_runtime": dict(runtime) if runtime else None,
            "scheduler": dict(scheduler) if scheduler else None,
            "latest_source": dict(source) if source else None,
            "counts": counts,
        }
    finally:
        connection.close()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--base-url",
        default="https://kaios.kidults.com",
    )
    parser.add_argument(
        "--database",
        default="/opt/intelligence-holdings/kidults/data/kaios.db",
    )
    parser.add_argument(
        "--backup-root",
        default="/mnt/ih_prod_01/backups/kidults",
    )
    parser.add_argument(
        "--output",
        default="/opt/intelligence-holdings/kidults/logs/stability-hourly.jsonl",
    )
    args = parser.parse_args()

    health_http, health, latency_ms = http_json(
        f"{args.base_url.rstrip('/')}/api/health"
    )

    snapshot = {
        "recorded_at": datetime.now(timezone.utc).isoformat(),
        "health_http": health_http,
        "health_ok": health.get("ok") is True,
        "health_status": (health.get("data") or {}).get("status"),
        "health_latency_ms": latency_ms,
        "gateway": container_state("kidults-gateway"),
        "scheduler_container": container_state("kidults-scheduler"),
        "database": database_state(Path(args.database)),
        "backup": backup_state(Path(args.backup_root)),
    }

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(snapshot, ensure_ascii=False) + "\n")

    print(json.dumps(snapshot, indent=2, ensure_ascii=False))

    healthy = (
        snapshot["health_http"] == 200
        and snapshot["health_ok"] is True
        and snapshot["health_status"] in {"operational", "degraded"}
        and str(snapshot["gateway"]).startswith("running|healthy")
        and str(snapshot["scheduler_container"]).startswith("running")
        and snapshot["database"]["integrity"] == "ok"
        and snapshot["backup"]["integrity"] == "ok"
    )
    return 0 if healthy else 2


if __name__ == "__main__":
    raise SystemExit(main())
