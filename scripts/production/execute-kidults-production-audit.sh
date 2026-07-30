#!/usr/bin/env bash
set -euo pipefail

PROD_ROOT="${PROD_ROOT:-/opt/intelligence-holdings/kidults/app}"
PROD_DB="${PROD_DB:-/opt/intelligence-holdings/kidults/data/kaios.db}"
EVIDENCE_DIR="${EVIDENCE_DIR:-${PROD_ROOT}/artifacts/production-audit}"
BACKUP_ROOT="${BACKUP_ROOT:-/mnt/ih_prod_01/backups/kidults}"
BASE_URL="${BASE_URL:-https://kaios.kidults.com}"

mkdir -p "${EVIDENCE_DIR}"

command -v sqlite3 >/dev/null || { echo "sqlite3 is required" >&2; exit 1; }
command -v curl >/dev/null || { echo "curl is required" >&2; exit 1; }
command -v sha256sum >/dev/null || { echo "sha256sum is required" >&2; exit 1; }
command -v docker >/dev/null || { echo "docker is required" >&2; exit 1; }

[[ -d "${PROD_ROOT}" ]] || { echo "Missing production root: ${PROD_ROOT}" >&2; exit 1; }
[[ -f "${PROD_DB}" ]] || { echo "Missing production database: ${PROD_DB}" >&2; exit 1; }

integrity=$(sqlite3 "${PROD_DB}" "PRAGMA integrity_check;")
[[ "${integrity}" == "ok" ]] || { echo "Production database integrity failed" >&2; exit 1; }

schema_sha=$(sqlite3 "${PROD_DB}" ".schema" | sha256sum | awk '{print $1}')
db_sha=$(sha256sum "${PROD_DB}" | awk '{print $1}')

docker ps --format '{{.Names}}|{{.Status}}|{{.Ports}}' > "${EVIDENCE_DIR}/docker-runtime.txt"
systemctl is-active caddy > "${EVIDENCE_DIR}/caddy-state.txt"
systemctl is-active fail2ban > "${EVIDENCE_DIR}/fail2ban-state.txt"
ss -lntp > "${EVIDENCE_DIR}/listening-ports.txt"

health_code=$(curl -sS -o "${EVIDENCE_DIR}/health.body" -w '%{http_code}' "${BASE_URL}/api/health")
unauth_code=$(curl -sS -o "${EVIDENCE_DIR}/collector-unauth.body" -w '%{http_code}' "${BASE_URL}/api/collector?mode=live")
portal_code=$(curl -sS -o "${EVIDENCE_DIR}/portal.body" -w '%{http_code}' "${BASE_URL}/portal/")

latest_manifest=$(find "${BACKUP_ROOT}" -type f -name '*.manifest.json' -printf '%T@ %p\n' 2>/dev/null | sort -nr | head -n 1 | cut -d' ' -f2- || true)
backup_age_seconds=-1
backup_integrity="missing"
if [[ -n "${latest_manifest}" && -f "${latest_manifest}" ]]; then
  backup_age_seconds=$(( $(date +%s) - $(stat -c %Y "${latest_manifest}") ))
  backup_integrity=$(python3 - "${latest_manifest}" <<'PY'
import json, sys
p=json.load(open(sys.argv[1], encoding='utf-8'))
print(p.get('integrity','unknown'))
PY
)
fi

python3 - <<PY > "${EVIDENCE_DIR}/production-audit.json"
import json
payload = {
  "status": "pass",
  "production_root": "${PROD_ROOT}",
  "production_database": "${PROD_DB}",
  "database_integrity": "${integrity}",
  "database_checksum": "${db_sha}",
  "schema_checksum": "${schema_sha}",
  "health_http": int("${health_code}"),
  "unauthenticated_collector_http": int("${unauth_code}"),
  "portal_http": int("${portal_code}"),
  "latest_backup_manifest": "${latest_manifest}",
  "backup_age_seconds": int("${backup_age_seconds}"),
  "backup_integrity": "${backup_integrity}",
  "publication_promotion_authorized": False,
  "artfund_production_promotion_authorized": False
}
print(json.dumps(payload, indent=2))
PY

[[ "${health_code}" == "200" ]] || { echo "Health probe failed: ${health_code}" >&2; exit 1; }
[[ "${unauth_code}" == "401" ]] || { echo "Unauthenticated collector did not fail closed: ${unauth_code}" >&2; exit 1; }
[[ "${portal_code}" == "200" ]] || { echo "Portal probe failed: ${portal_code}" >&2; exit 1; }
[[ "${backup_integrity}" == "ok" ]] || { echo "Backup integrity is not ok: ${backup_integrity}" >&2; exit 1; }

echo "Kidults production audit evidence captured."
