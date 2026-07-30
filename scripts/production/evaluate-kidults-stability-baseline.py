#!/usr/bin/env python3
"""Evaluate Kidults production stability snapshots and emit a machine-readable status."""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class Snapshot:
    path: Path
    captured_at: datetime
    status: str


def parse_timestamp(value: str) -> datetime:
    value = value.strip()
    if value.endswith("Z"):
        value = value[:-1] + "+00:00"
    return datetime.fromisoformat(value).astimezone(timezone.utc)


def load_snapshot(path: Path) -> Snapshot:
    payload = json.loads(path.read_text(encoding="utf-8"))
    captured = payload.get("captured_at") or payload.get("recorded_at")
    if not isinstance(captured, str):
        raise ValueError(f"missing timestamp in {path}")
    status = str(payload.get("status", "unknown")).lower()
    return Snapshot(path=path, captured_at=parse_timestamp(captured), status=status)


def build_status(root: Path, required_days: int) -> dict[str, Any]:
    files = sorted(root.glob("**/kidults-stability-*.json"))
    snapshots: list[Snapshot] = []
    invalid_files: list[str] = []

    for path in files:
        try:
            snapshots.append(load_snapshot(path))
        except Exception:
            invalid_files.append(str(path))

    snapshots.sort(key=lambda item: item.captured_at)
    unique_days: dict[str, Snapshot] = {}
    for snapshot in snapshots:
        unique_days[snapshot.captured_at.date().isoformat()] = snapshot

    ordered = [unique_days[key] for key in sorted(unique_days)]
    successful_days = sum(item.status == "pass" for item in ordered)
    failed_days = sum(item.status != "pass" for item in ordered)

    consecutive = 0
    for item in reversed(ordered):
        if item.status == "pass":
            consecutive += 1
        else:
            break

    elapsed_days = len(ordered)
    missing_days = max(0, required_days - elapsed_days)
    latest = ordered[-1] if ordered else None
    final_ready = (
        elapsed_days >= required_days
        and failed_days == 0
        and len(invalid_files) == 0
        and consecutive >= required_days
    )

    return {
        "status": "ready" if final_ready else "observing",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "observation_days_required": required_days,
        "elapsed_days": elapsed_days,
        "successful_days": successful_days,
        "failed_days": failed_days,
        "missing_days": missing_days,
        "consecutive_pass_days": consecutive,
        "latest_snapshot_status": latest.status if latest else "missing",
        "latest_snapshot": str(latest.path) if latest else None,
        "invalid_snapshot_files": invalid_files,
        "production_change_allowed": False,
        "final_certification_ready": final_ready,
        "artfund_production_authorized": False,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--snapshot-root", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--required-days", type=int, default=30)
    args = parser.parse_args()

    result = build_status(args.snapshot_root, args.required_days)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
