#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${ROOT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
OUTPUT_DIR="${OUTPUT_DIR:-${ROOT_DIR}/artifacts/production-audit}"
PRODUCTION_URL="${PRODUCTION_URL:-https://kaios.kidults.com}"
PRODUCTION_DB="${PRODUCTION_DB:-/opt/intelligence-holdings/kidults/data/kaios.db}"
BACKUP_ROOT="${BACKUP_ROOT:-/mnt/ih_prod_01/backups/kidults}"

mkdir -p "${OUTPUT_DIR}"

command -v curl >/dev/null
command -v sqlite3 >/dev/null
command -v sha256sum >/dev/null
command -v systemctl >/dev/null
command -v docker >/dev/null

[[ -f "${PRODUCTION_DB}" ]] || { echo "Missing production database: ${PRODUCTION_DB}" >&2; exit 1; }

record_http() {
  local name="$1" url="$2" expected="$3" auth="${4:-}"
  local code
  if [[ -n "${auth}" ]]; then
    code=$(curl -sS -o "${OUTPUT_DIR}/${name}.body" -w '%{http_code}' -H "Authorization: Bearer ${auth}" "${url}")
  else
    code=$(curl -sS -o "${OUTPUT_DIR}/${name}.body" -w '%{http_code}' "${url}")
  fi
  printf '{"probe":"%s","status":"%s","http":%s,"expected":%s}\n' \
    "${name}" "$([[ "${code}" == "${expected}" ]] && echo pass || echo fail)" "${code}" "${expected}" \
    > "${OUTPUT_DIR}/${name}.json"
}

health_code=$(curl -sS -o "${OUTPUT_DIR}/health.body" -w '%{http_code}' "${PRODUCTION_URL}/api/health")
printf '{"probe":"production_health","status":"%s","http":%s,"expected":200}\n' \
  "$([[ "${health_code}" == "200" ]] && echo pass || echo fail)" "${health_code}" \
  > "${OUTPUT_DIR}/production-health.json"

integrity=$(sqlite3 "${PRODUCTION_DB}" 'PRAGMA integrity_check;')
schema_sha=$(sqlite3 "${PRODUCTION_DB}" ".schema" | sha256sum | awk '{print $1}')
db_sha=$(sha256sum "${PRODUCTION_DB}" | awk '{print $1}')
printf '{"status":"%s","integrity":"%s","schema_checksum":"%s","database_checksum":"%s"}\n' \
  "$([[ "${integrity}" == "ok" ]] && echo pass || echo fail)" "${integrity}" "${schema_sha}" "${db_sha}" \
  > "${OUTPUT_DIR}/database-audit.json"

latest_manifest=$(find "${BACKUP_ROOT}" -type f -name '*.manifest.json' -printf '%T@ %p\n' 2>/dev/null | sort -nr | head -n1 | cut -d' ' -f2- || true)
if [[ -n "${latest_manifest}" ]]; then
  age_seconds=$(( $(date +%s) - $(stat -c %Y "${latest_manifest}") ))
  printf '{"status":"pass","latest_manifest":"%s","age_seconds":%s}\n' "${latest_manifest}" "${age_seconds}" \
    > "${OUTPUT_DIR}/backup-inventory.json"
else
  printf '{"status":"fail","reason":"backup_manifest_missing"}\n' > "${OUTPUT_DIR}/backup-inventory.json"
fi

docker ps --format '{{json .}}' > "${OUTPUT_DIR}/docker-runtime.jsonl"
systemctl is-active caddy > "${OUTPUT_DIR}/caddy-active.txt" || true
systemctl is-active fail2ban > "${OUTPUT_DIR}/fail2ban-active.txt" || true
ss -lntp > "${OUTPUT_DIR}/listening-ports.txt"

printf '{"status":"captured","production_promotion_authorized":false,"artfund_production_promotion_authorized":false}\n' \
  > "${OUTPUT_DIR}/audit-capture-summary.json"

echo "Kidults production audit evidence captured in ${OUTPUT_DIR}."
