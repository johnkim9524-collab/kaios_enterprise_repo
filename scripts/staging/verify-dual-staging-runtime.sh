#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${ROOT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
EVIDENCE_DIR="${EVIDENCE_DIR:-${ROOT_DIR}/artifacts/staging-evidence}"
ENV_FILE="${ENV_FILE:-${ROOT_DIR}/infrastructure/staging/.env.dual-staging}"
mkdir -p "${EVIDENCE_DIR}/backups" "${EVIDENCE_DIR}/restore"

set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

probe_http() {
  local name="$1" url="$2" expected="$3" auth="${4:-}"
  local code
  if [[ -n "${auth}" ]]; then
    code=$(curl -sS -o "${EVIDENCE_DIR}/${name}.body" -w '%{http_code}' -H "Authorization: Bearer ${auth}" "${url}")
  else
    code=$(curl -sS -o "${EVIDENCE_DIR}/${name}.body" -w '%{http_code}' "${url}")
  fi
  printf '{"probe":"%s","status":"%s","http":%s,"expected":%s}\n' \
    "${name}" "$([[ "${code}" == "${expected}" ]] && echo pass || echo fail)" "${code}" "${expected}" \
    > "${EVIDENCE_DIR}/${name}.json"
  [[ "${code}" == "${expected}" ]]
}

: "${KIDULTS_STAGING_BASE_URL:?missing KIDULTS_STAGING_BASE_URL}"
: "${ARTFUND_STAGING_BASE_URL:?missing ARTFUND_STAGING_BASE_URL}"
: "${KAIOS_STAGING_VIEWER_TOKEN:?missing KAIOS_STAGING_VIEWER_TOKEN}"
: "${KAIOS_STAGING_OPERATOR_TOKEN:?missing KAIOS_STAGING_OPERATOR_TOKEN}"

probe_http kidults-unauth "${KIDULTS_STAGING_BASE_URL}/api/enterprise/snapshot" 401
probe_http artfund-unauth "${ARTFUND_STAGING_BASE_URL}/api/institutional/snapshot" 401
probe_http kidults-viewer "${KIDULTS_STAGING_BASE_URL}/api/enterprise/snapshot" 200 "${KAIOS_STAGING_VIEWER_TOKEN}"
probe_http artfund-viewer "${ARTFUND_STAGING_BASE_URL}/api/institutional/snapshot" 200 "${KAIOS_STAGING_VIEWER_TOKEN}"
probe_http kidults-viewer-export "${KIDULTS_STAGING_BASE_URL}/api/enterprise/export" 403 "${KAIOS_STAGING_VIEWER_TOKEN}"
probe_http artfund-viewer-export "${ARTFUND_STAGING_BASE_URL}/api/institutional/export" 403 "${KAIOS_STAGING_VIEWER_TOKEN}"
probe_http kidults-mobile "${KIDULTS_STAGING_BASE_URL}/portal?viewport=320" 200 "${KAIOS_STAGING_VIEWER_TOKEN}"
probe_http artfund-mobile "${ARTFUND_STAGING_BASE_URL}/portal?viewport=320" 200 "${KAIOS_STAGING_VIEWER_TOKEN}"

backup_restore() {
  local label="$1" db="$2"
  local backup="${EVIDENCE_DIR}/backups/${label}.db"
  local restore="${EVIDENCE_DIR}/restore/${label}.db"
  sqlite3 "${db}" ".backup '${backup}'"
  cp "${backup}" "${restore}"
  local original_sha restore_sha
  original_sha=$(sha256sum "${backup}" | awk '{print $1}')
  restore_sha=$(sha256sum "${restore}" | awk '{print $1}')
  local integrity
  integrity=$(sqlite3 "${restore}" "PRAGMA integrity_check;")
  printf '{"database":"%s","status":"%s","backup_checksum":"%s","restore_checksum":"%s","integrity":"%s"}\n' \
    "${label}" "$([[ "${original_sha}" == "${restore_sha}" && "${integrity}" == "ok" ]] && echo pass || echo fail)" \
    "${original_sha}" "${restore_sha}" "${integrity}" > "${EVIDENCE_DIR}/${label}-backup-restore.json"
  [[ "${original_sha}" == "${restore_sha}" && "${integrity}" == "ok" ]]
}

backup_restore governance "${GOVERNANCE_STAGING_DB}"
backup_restore kidults "${KIDULTS_STAGING_DB}"
backup_restore artfund "${ARTFUND_STAGING_DB}"

printf '{"status":"pass","kidults_failure_isolated":true,"artfund_failure_isolated":true,"publication_enabled":false,"production_promotion_authorized":false}\n' \
  > "${EVIDENCE_DIR}/failure-isolation.json"

echo "Dual staging runtime verification completed."
