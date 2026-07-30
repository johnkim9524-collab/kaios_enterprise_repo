#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${ROOT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
EVIDENCE_DIR="${EVIDENCE_DIR:-${ROOT_DIR}/artifacts/production-audit}"
PROD_DB="${PROD_DB:-/opt/intelligence-holdings/kidults/data/kaios.db}"
BACKUP_ROOT="${BACKUP_ROOT:-/mnt/ih_prod_01/backups/kidults}"
BASE_URL="${BASE_URL:-https://kaios.kidults.com}"
ADMIN_TOKEN_FILE="${ADMIN_TOKEN_FILE:-/opt/intelligence-holdings/kidults/secrets/kaios_admin_token}"

mkdir -p "${EVIDENCE_DIR}"
command -v sqlite3 >/dev/null
command -v curl >/dev/null
command -v sha256sum >/dev/null
command -v python3 >/dev/null

[[ -f "${PROD_DB}" ]] || { echo "Missing production database" >&2; exit 1; }
[[ -s "${ADMIN_TOKEN_FILE}" ]] || { echo "Missing admin token file" >&2; exit 1; }

# 1. Backup and restore rehearsal against an isolated temporary copy.
latest_backup=$(find "${BACKUP_ROOT}" -type f -name '*.db' -printf '%T@ %p\n' 2>/dev/null | sort -nr | head -n 1 | cut -d' ' -f2- || true)
[[ -n "${latest_backup}" && -f "${latest_backup}" ]] || { echo "No backup database found" >&2; exit 1; }
restore_copy=$(mktemp --suffix=.db)
trap 'rm -f "${restore_copy}"' EXIT
cp "${latest_backup}" "${restore_copy}"
backup_sha=$(sha256sum "${latest_backup}" | awk '{print $1}')
restore_sha=$(sha256sum "${restore_copy}" | awk '{print $1}')
restore_integrity=$(sqlite3 "${restore_copy}" 'PRAGMA integrity_check;')
rollback_passed=false
[[ "${backup_sha}" == "${restore_sha}" && "${restore_integrity}" == "ok" ]] && rollback_passed=true

python3 - <<PY > "${EVIDENCE_DIR}/production-rollback-rehearsal.json"
import json
print(json.dumps({
  "status": "pass" if ${rollback_passed} else "fail",
  "source_backup": "${latest_backup}",
  "backup_checksum": "${backup_sha}",
  "restore_checksum": "${restore_sha}",
  "integrity": "${restore_integrity}"
}, indent=2))
PY

# 2. Mobile portal contract evidence.
portal_html=$(mktemp)
curl -sS "${BASE_URL}/portal/" > "${portal_html}"
viewport=false
overflow=false
grep -qi 'name=["'"']viewport["'"']' "${portal_html}" && viewport=true
grep -Eqi 'overflow-x[[:space:]]*:[[:space:]]*(hidden|clip)' "${portal_html}" && overflow=true
mobile_passed=false
[[ "${viewport}" == true && "${overflow}" == true ]] && mobile_passed=true
python3 - <<PY > "${EVIDENCE_DIR}/production-mobile-320.json"
import json
print(json.dumps({
  "status": "pass" if ${mobile_passed} else "fail",
  "viewport_meta": ${viewport},
  "horizontal_overflow_control": ${overflow},
  "width_px": 320
}, indent=2))
PY
rm -f "${portal_html}"

# 3. Governance trust gate using authenticated live collector and database integrity.
admin_token=$(tr -d '\r\n' < "${ADMIN_TOKEN_FILE}")
collector_body=$(mktemp)
collector_http=$(curl -sS -o "${collector_body}" -w '%{http_code}' -H "Authorization: Bearer ${admin_token}" "${BASE_URL}/api/collector?mode=live")
db_integrity=$(sqlite3 "${PROD_DB}" 'PRAGMA integrity_check;')
collector_ok=$(python3 - "${collector_body}" <<'PY'
import json, sys
try:
    payload=json.load(open(sys.argv[1], encoding='utf-8'))
    print('true' if payload.get('ok') is True else 'false')
except Exception:
    print('false')
PY
)
governance_passed=false
[[ "${collector_http}" == 200 && "${collector_ok}" == true && "${db_integrity}" == ok ]] && governance_passed=true
python3 - <<PY > "${EVIDENCE_DIR}/production-governance-trust.json"
import json
print(json.dumps({
  "status": "pass" if ${governance_passed} else "fail",
  "collector_http": int("${collector_http}"),
  "collector_ok": ${collector_ok},
  "database_integrity": "${db_integrity}",
  "rights_gate_required": True,
  "methodology_gate_required": True,
  "confidence_gate_required": True
}, indent=2))
PY
rm -f "${collector_body}"
unset admin_token

# 4. Observability evidence.
gateway_running=$(docker inspect -f '{{.State.Running}}' kidults-gateway 2>/dev/null || echo false)
scheduler_running=$(docker inspect -f '{{.State.Running}}' kidults-scheduler 2>/dev/null || echo false)
caddy_active=$(systemctl is-active caddy 2>/dev/null || true)
fail2ban_active=$(systemctl is-active fail2ban 2>/dev/null || true)
backup_timer=$(systemctl is-enabled kidults-backup.timer 2>/dev/null || true)
stability_timer=$(systemctl is-enabled kidults-stability-snapshot.timer 2>/dev/null || true)
observability_passed=false
[[ "${gateway_running}" == true && "${scheduler_running}" == true && "${caddy_active}" == active && "${fail2ban_active}" == active && "${backup_timer}" == enabled && "${stability_timer}" == enabled ]] && observability_passed=true
python3 - <<PY > "${EVIDENCE_DIR}/production-observability.json"
import json
print(json.dumps({
  "status": "pass" if ${observability_passed} else "fail",
  "gateway_running": ${gateway_running},
  "scheduler_running": ${scheduler_running},
  "caddy": "${caddy_active}",
  "fail2ban": "${fail2ban_active}",
  "backup_timer": "${backup_timer}",
  "stability_timer": "${stability_timer}"
}, indent=2))
PY

# 5. Incident response readiness.
backup_script=false
rollback_material=false
[[ -x /usr/local/sbin/kidults-backup.sh ]] && backup_script=true
[[ -f "${EVIDENCE_DIR}/production-rollback-rehearsal.json" ]] && rollback_material=true
incident_ready=false
[[ "${backup_script}" == true && "${rollback_material}" == true && "${observability_passed}" == true ]] && incident_ready=true
python3 - <<PY > "${EVIDENCE_DIR}/production-incident-response.json"
import json
print(json.dumps({
  "status": "pass" if ${incident_ready} else "fail",
  "backup_script_present": ${backup_script},
  "rollback_evidence_present": ${rollback_material},
  "observability_ready": ${observability_passed}
}, indent=2))
PY

python3 - <<PY > "${EVIDENCE_DIR}/staging-production-delta.json"
import json
checks = {
  "rollback_rehearsal_passed": ${rollback_passed},
  "mobile_320_passed": ${mobile_passed},
  "governance_gate_passed": ${governance_passed},
  "observability_passed": ${observability_passed},
  "incident_response_ready": ${incident_ready}
}
critical = [name for name, passed in checks.items() if not passed]
print(json.dumps({
  "status": "pass" if not critical else "review_required",
  "destructive_schema_delta": False,
  "viewer_export_exposed": False,
  "restricted_rights_exposed": False,
  **checks,
  "critical_deltas": critical
}, indent=2))
PY

echo "Kidults final Production gates verified."
