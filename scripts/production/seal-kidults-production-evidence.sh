#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${ROOT_DIR:-$PWD}"
EVIDENCE_DIR="${EVIDENCE_DIR:-${ROOT_DIR}/artifacts/production-audit}"
ARCHIVE_ROOT="${ARCHIVE_ROOT:-/mnt/ih_prod_01/backups/production-certification}"
TIMESTAMP="${TIMESTAMP:-$(date -u +%Y%m%dT%H%M%SZ)}"
READINESS_FILE="${EVIDENCE_DIR}/kidults-production-readiness.json"

required_files=(
  production-audit.json
  production-rollback-rehearsal.json
  production-mobile-320.json
  production-governance-trust.json
  production-observability.json
  production-incident-response.json
  staging-production-delta.json
  kidults-production-readiness.json
)

for file in "${required_files[@]}"; do
  test -f "${EVIDENCE_DIR}/${file}" || {
    echo "Missing required evidence: ${file}" >&2
    exit 1
  }
done

python3 - "${READINESS_FILE}" <<'PY'
import json
import sys
from pathlib import Path

payload = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
assert payload.get("decision") == "go", "decision must be go"
assert payload.get("score") == 100, "score must be 100"
assert payload.get("mandatory_gates_passed") is True, "mandatory gates must pass"
assert payload.get("hard_blockers") == [], "hard blockers must be empty"
assert payload.get("production_promotion_authorized") is True, "Kidults authorization required"
assert payload.get("artfund_production_promotion_authorized") is False, "Artfund must remain blocked"
print("Kidults production readiness authorization verified.")
PY

mkdir -p "${ARCHIVE_ROOT}"
ARCHIVE_FILE="${ARCHIVE_ROOT}/kidults-production-evidence-${TIMESTAMP}.tar.gz"
MANIFEST_FILE="${ARCHIVE_FILE}.manifest.json"
CHECKSUM_FILE="${ARCHIVE_FILE}.sha256"

tar -czf "${ARCHIVE_FILE}" -C "${EVIDENCE_DIR}" "${required_files[@]}"
sha256sum "${ARCHIVE_FILE}" | tee "${CHECKSUM_FILE}"

ARCHIVE_FILE="${ARCHIVE_FILE}" \
CHECKSUM_FILE="${CHECKSUM_FILE}" \
MANIFEST_FILE="${MANIFEST_FILE}" \
READINESS_FILE="${READINESS_FILE}" \
python3 - <<'PY'
import hashlib
import json
import os
from datetime import datetime, timezone
from pathlib import Path

archive = Path(os.environ["ARCHIVE_FILE"])
readiness = json.loads(Path(os.environ["READINESS_FILE"]).read_text(encoding="utf-8"))
checksum = hashlib.sha256(archive.read_bytes()).hexdigest()
manifest = {
    "status": "sealed",
    "vertical": "kidults",
    "sealed_at": datetime.now(timezone.utc).isoformat(),
    "archive": str(archive),
    "archive_sha256": checksum,
    "readiness_checksum": readiness.get("checksum"),
    "decision": readiness.get("decision"),
    "score": readiness.get("score"),
    "production_promotion_authorized": readiness.get("production_promotion_authorized"),
    "artfund_production_promotion_authorized": readiness.get("artfund_production_promotion_authorized"),
    "production_change_executed": False,
}
Path(os.environ["MANIFEST_FILE"]).write_text(
    json.dumps(manifest, indent=2), encoding="utf-8"
)
print(json.dumps(manifest, indent=2))
PY

echo "Kidults production evidence sealed."
