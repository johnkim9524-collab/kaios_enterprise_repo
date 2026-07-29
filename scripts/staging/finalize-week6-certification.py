#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
EVIDENCE = ROOT / "artifacts" / "staging-evidence"
OUTPUT = EVIDENCE / "week-6-final-certification.json"

REQUIRED = [
    "migration-execution.json",
    "kidults-unauth.json",
    "artfund-unauth.json",
    "kidults-viewer.json",
    "artfund-viewer.json",
    "kidults-viewer-export.json",
    "artfund-viewer-export.json",
    "kidults-mobile.json",
    "artfund-mobile.json",
    "governance-backup-restore.json",
    "kidults-backup-restore.json",
    "artfund-backup-restore.json",
    "failure-isolation.json",
]


def load_json(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def stable_checksum(payload: dict) -> str:
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def main() -> int:
    missing = [name for name in REQUIRED if not (EVIDENCE / name).exists()]
    checks: list[dict] = []

    if missing:
        result = {
            "certification": "blocked",
            "reason": "missing_evidence",
            "missing": missing,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "production_promotion_authorized": False,
        }
        result["checksum"] = stable_checksum(result)
        OUTPUT.parent.mkdir(parents=True, exist_ok=True)
        OUTPUT.write_text(json.dumps(result, indent=2), encoding="utf-8")
        print(json.dumps(result, indent=2))
        return 1

    for name in REQUIRED:
        payload = load_json(EVIDENCE / name)
        status = payload.get("status")
        checks.append({"evidence": name, "status": status})

    failed = [item for item in checks if item["status"] != "pass"]
    isolation = load_json(EVIDENCE / "failure-isolation.json")
    safe_defaults = (
        isolation.get("publication_enabled") is False
        and isolation.get("production_promotion_authorized") is False
        and isolation.get("kidults_failure_isolated") is True
        and isolation.get("artfund_failure_isolated") is True
    )

    certification = "pass" if not failed and safe_defaults else "blocked"
    result = {
        "certification": certification,
        "release_candidate": "ih-dual-rc-2026.09.09-rc1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "checks": checks,
        "safe_defaults_verified": safe_defaults,
        "production_promotion_authorized": False,
        "kidults_promotion_decision": "separate_gate_required",
        "artfund_promotion_decision": "not_authorized",
    }
    result["checksum"] = stable_checksum(result)
    OUTPUT.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps(result, indent=2))
    return 0 if certification == "pass" else 1


if __name__ == "__main__":
    sys.exit(main())
