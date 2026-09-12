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
SOURCE_SHA="$(git -C "${PROD_ROOT}" rev-parse HEAD 2>/dev/null)" || { echo "Production root is not an exact Git checkout" >&2; exit 1; }
[[ "${SOURCE_SHA}" =~ ^[0-9a-f]{40}$ ]] || { echo "Invalid production source SHA" >&2; exit 1; }

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
  backup_integrity=$(python3 -I - "${latest_manifest}" <<'PY'
import json, sys
p=json.load(open(sys.argv[1], encoding='utf-8'))
print(p.get('integrity','unknown'))
PY
)
fi

SOURCE_SHA="${SOURCE_SHA}" \
PROD_ROOT="${PROD_ROOT}" \
PROD_DB="${PROD_DB}" \
AUDIT_DATABASE_INTEGRITY="${integrity}" \
AUDIT_DATABASE_SHA256="${db_sha}" \
AUDIT_SCHEMA_SHA256="${schema_sha}" \
AUDIT_HEALTH_HTTP="${health_code}" \
AUDIT_UNAUTH_HTTP="${unauth_code}" \
AUDIT_PORTAL_HTTP="${portal_code}" \
AUDIT_LATEST_BACKUP_MANIFEST="${latest_manifest}" \
AUDIT_BACKUP_AGE_SECONDS="${backup_age_seconds}" \
AUDIT_BACKUP_INTEGRITY="${backup_integrity}" \
python3 -I - <<'PY' > "${EVIDENCE_DIR}/production-audit.json"
import json
import os
from datetime import datetime, timezone

payload = {
  "id": "KIDULTS_PRODUCTION_AUDIT_EVIDENCE_V1",
  "version": "1.0.0",
  "producer_id": "KIDULTS_PRODUCTION_AUDIT_COLLECTOR_V1",
  "source_sha": os.environ["SOURCE_SHA"],
  "observed_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
  "state": "VERIFIED",
  "evidence": {
    "status": "pass",
    "production_root": os.environ.get("PROD_ROOT", "/opt/intelligence-holdings/kidults/app"),
    "production_database": os.environ.get("PROD_DB", "/opt/intelligence-holdings/kidults/data/kaios.db"),
    "database_integrity": os.environ["AUDIT_DATABASE_INTEGRITY"],
    "database_checksum": os.environ["AUDIT_DATABASE_SHA256"],
    "schema_checksum": os.environ["AUDIT_SCHEMA_SHA256"],
    "health_http": int(os.environ["AUDIT_HEALTH_HTTP"]),
    "unauthenticated_collector_http": int(os.environ["AUDIT_UNAUTH_HTTP"]),
    "portal_http": int(os.environ["AUDIT_PORTAL_HTTP"]),
    "latest_backup_manifest": os.environ["AUDIT_LATEST_BACKUP_MANIFEST"],
    "backup_age_seconds": int(os.environ["AUDIT_BACKUP_AGE_SECONDS"]),
    "backup_integrity": os.environ["AUDIT_BACKUP_INTEGRITY"],
    "publication_promotion_authorized": False,
    "artfund_production_promotion_authorized": False,
  },
}
print(json.dumps(payload, indent=2))
PY

[[ "${health_code}" == "200" ]] || { echo "Health probe failed: ${health_code}" >&2; exit 1; }
[[ "${unauth_code}" == "401" ]] || { echo "Unauthenticated collector did not fail closed: ${unauth_code}" >&2; exit 1; }
[[ "${portal_code}" == "200" ]] || { echo "Portal probe failed: ${portal_code}" >&2; exit 1; }
[[ "${backup_integrity}" == "ok" ]] || { echo "Backup integrity is not ok: ${backup_integrity}" >&2; exit 1; }

echo "Kidults production audit evidence captured."
