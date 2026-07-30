#!/usr/bin/env bash
set -euo pipefail

STATUS_FILE="${STATUS_FILE:-/mnt/ih_prod_01/backups/stability-baseline/status/kidults-stability-status.json}"
INCIDENT_ROOT="${INCIDENT_ROOT:-/mnt/ih_prod_01/backups/stability-baseline/status}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
INCIDENT_FILE="${INCIDENT_ROOT}/kidults-stability-incident-${TIMESTAMP}.json"

mkdir -p "${INCIDENT_ROOT}"

if [[ ! -f "${STATUS_FILE}" ]]; then
  python3 - "${INCIDENT_FILE}" "${STATUS_FILE}" <<'PY'
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

incident_file, status_file = map(Path, sys.argv[1:])
payload = {
    "status": "incident",
    "severity": "critical",
    "detected_at": datetime.now(timezone.utc).isoformat(),
    "reason": "stability_status_missing",
    "status_file": str(status_file),
    "production_change_allowed": False,
    "final_certification_ready": False,
    "artfund_production_authorized": False,
}
incident_file.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
print(json.dumps(payload, indent=2))
PY
  exit 2
fi

python3 - "${STATUS_FILE}" "${INCIDENT_FILE}" <<'PY'
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

status_path, incident_path = map(Path, sys.argv[1:])
status = json.loads(status_path.read_text(encoding="utf-8"))
reasons = []

if status.get("latest_snapshot_status") != "pass":
    reasons.append("latest_snapshot_not_pass")
if int(status.get("failed_days", 0)) > 0:
    reasons.append("failed_snapshot_detected")
if status.get("invalid_snapshot_files"):
    reasons.append("invalid_snapshot_file_detected")
if status.get("status") not in {"observing", "ready"}:
    reasons.append("unexpected_monitor_status")

if not reasons:
    print("NO_INCIDENT")
    raise SystemExit(0)

payload = {
    "status": "incident",
    "severity": "critical",
    "detected_at": datetime.now(timezone.utc).isoformat(),
    "reasons": reasons,
    "source_status_file": str(status_path),
    "monitor": status,
    "production_change_allowed": False,
    "final_certification_ready": False,
    "artfund_production_authorized": False,
}
incident_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
print(json.dumps(payload, indent=2))
raise SystemExit(2)
PY
