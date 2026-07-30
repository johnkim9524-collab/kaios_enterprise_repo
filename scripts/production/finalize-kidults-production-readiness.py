#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
EVIDENCE = ROOT / "artifacts" / "production-audit"
OUTPUT = EVIDENCE / "kidults-production-readiness.json"

WEIGHTS = {
    "runtime_availability": 20,
    "database_migration_safety": 15,
    "backup_rollback": 15,
    "authentication_rbac": 15,
    "portal_mobile_quality": 10,
    "governance_trust": 15,
    "observability_incident": 10,
}


def checksum(payload: dict) -> str:
    raw = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(raw).hexdigest()


def main() -> int:
    audit_path = EVIDENCE / "production-audit.json"
    delta_path = EVIDENCE / "staging-production-delta.json"
    if not audit_path.exists() or not delta_path.exists():
        result = {
            "decision": "hold",
            "reason": "missing_evidence",
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "production_promotion_authorized": False,
        }
        result["checksum"] = checksum(result)
        OUTPUT.parent.mkdir(parents=True, exist_ok=True)
        OUTPUT.write_text(json.dumps(result, indent=2), encoding="utf-8")
        print(json.dumps(result, indent=2))
        return 1

    audit = json.loads(audit_path.read_text(encoding="utf-8"))
    delta = json.loads(delta_path.read_text(encoding="utf-8"))

    hard_blockers = []
    if audit.get("database_integrity") != "ok": hard_blockers.append("database_integrity_failure")
    if audit.get("health_http") != 200: hard_blockers.append("production_health_failure")
    if audit.get("unauthenticated_collector_http") != 401: hard_blockers.append("authentication_bypass")
    if audit.get("backup_integrity") != "ok": hard_blockers.append("backup_integrity_failure")
    if delta.get("destructive_schema_delta") is True: hard_blockers.append("destructive_schema_delta")
    if delta.get("viewer_export_exposed") is True: hard_blockers.append("viewer_export_exposure")
    if delta.get("restricted_rights_exposed") is True: hard_blockers.append("restricted_rights_exposure")

    sections = {
        "runtime_availability": 20 if audit.get("health_http") == 200 else 0,
        "database_migration_safety": 15 if audit.get("database_integrity") == "ok" and not delta.get("destructive_schema_delta") else 0,
        "backup_rollback": 15 if audit.get("backup_integrity") == "ok" and delta.get("rollback_rehearsal_passed") else 5,
        "authentication_rbac": 15 if audit.get("unauthenticated_collector_http") == 401 and not delta.get("viewer_export_exposed") else 0,
        "portal_mobile_quality": 10 if audit.get("portal_http") == 200 and delta.get("mobile_320_passed") else 5,
        "governance_trust": 15 if delta.get("governance_gate_passed") and not delta.get("restricted_rights_exposed") else 5,
        "observability_incident": 10 if delta.get("observability_passed") and delta.get("incident_response_ready") else 5,
    }
    score = sum(sections.values())

    mandatory = all([
        audit.get("database_integrity") == "ok",
        audit.get("health_http") == 200,
        audit.get("unauthenticated_collector_http") == 401,
        audit.get("backup_integrity") == "ok",
        delta.get("rollback_rehearsal_passed") is True,
        delta.get("mobile_320_passed") is True,
        delta.get("governance_gate_passed") is True,
        delta.get("observability_passed") is True,
        delta.get("incident_response_ready") is True,
    ])

    if hard_blockers:
        decision = "rollback"
    elif score >= 90 and mandatory:
        decision = "go"
    else:
        decision = "hold"

    result = {
        "decision": decision,
        "score": score,
        "maximum_score": 100,
        "sections": sections,
        "mandatory_gates_passed": mandatory,
        "hard_blockers": hard_blockers,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "production_promotion_authorized": decision == "go",
        "artfund_production_promotion_authorized": False,
    }
    result["checksum"] = checksum(result)
    OUTPUT.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps(result, indent=2))
    return 0 if decision == "go" else 1


if __name__ == "__main__":
    sys.exit(main())
