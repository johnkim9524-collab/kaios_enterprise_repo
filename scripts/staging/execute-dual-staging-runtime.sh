#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${ROOT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
EVIDENCE_DIR="${EVIDENCE_DIR:-${ROOT_DIR}/artifacts/staging-evidence}"
DATA_DIR="${DATA_DIR:-${ROOT_DIR}/.staging-data}"
ENV_FILE="${ENV_FILE:-${ROOT_DIR}/infrastructure/staging/.env.dual-staging}"

mkdir -p "${EVIDENCE_DIR}" "${DATA_DIR}"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "ERROR: staging environment file not found: ${ENV_FILE}" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

required_vars=(
  KAIOS_ENVIRONMENT
  KAIOS_PRODUCTION_PROMOTION_AUTHORIZED
  KAIOS_REPORT_PUBLISHING_ENABLED
  KAIOS_ALERT_DELIVERY_ENABLED
  KAIOS_INDEX_PUBLISHING_ENABLED
  GOVERNANCE_STAGING_DB
  KIDULTS_STAGING_DB
  ARTFUND_STAGING_DB
)

for name in "${required_vars[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    echo "ERROR: missing required environment variable: ${name}" >&2
    exit 1
  fi
done

[[ "${KAIOS_ENVIRONMENT}" == "staging" ]] || { echo "ERROR: environment must be staging" >&2; exit 1; }
[[ "${KAIOS_PRODUCTION_PROMOTION_AUTHORIZED}" == "false" ]] || { echo "ERROR: production promotion must remain false" >&2; exit 1; }
[[ "${KAIOS_REPORT_PUBLISHING_ENABLED}" == "false" ]] || { echo "ERROR: report publishing must remain false" >&2; exit 1; }
[[ "${KAIOS_ALERT_DELIVERY_ENABLED}" == "false" ]] || { echo "ERROR: alert delivery must remain false" >&2; exit 1; }
[[ "${KAIOS_INDEX_PUBLISHING_ENABLED}" == "false" ]] || { echo "ERROR: index publishing must remain false" >&2; exit 1; }

for db in "${GOVERNANCE_STAGING_DB}" "${KIDULTS_STAGING_DB}" "${ARTFUND_STAGING_DB}"; do
  [[ "${db,,}" != *production* ]] || { echo "ERROR: production database reference detected: ${db}" >&2; exit 1; }
done

if [[ "${GOVERNANCE_STAGING_DB}" == "${KIDULTS_STAGING_DB}" || "${GOVERNANCE_STAGING_DB}" == "${ARTFUND_STAGING_DB}" || "${KIDULTS_STAGING_DB}" == "${ARTFUND_STAGING_DB}" ]]; then
  echo "ERROR: staging databases must be isolated" >&2
  exit 1
fi

run_migrations() {
  local db="$1"
  local pattern="$2"
  local label="$3"
  local log="${EVIDENCE_DIR}/${label}-migration.log"
  : > "${log}"
  while IFS= read -r sql_file; do
    echo "APPLY ${sql_file}" | tee -a "${log}"
    sqlite3 "${db}" < "${sql_file}" >> "${log}" 2>&1
  done < <(find "${ROOT_DIR}/infrastructure/staging" -maxdepth 2 -type f -name "${pattern}" | sort)
  sqlite3 "${db}" "PRAGMA integrity_check;" | tee -a "${log}"
}

run_migrations "${GOVERNANCE_STAGING_DB}" "000*_shared_*.sql" "governance"
run_migrations "${KIDULTS_STAGING_DB}" "0001_kidults_*.sql" "kidults"
run_migrations "${ARTFUND_STAGING_DB}" "0001_artfund_*.sql" "artfund"

for db in "${GOVERNANCE_STAGING_DB}" "${KIDULTS_STAGING_DB}" "${ARTFUND_STAGING_DB}"; do
  sqlite3 "${db}" "PRAGMA wal_checkpoint(FULL); PRAGMA integrity_check;"
done

printf '{"status":"pass","environment":"staging","databases":{"governance":"%s","kidults":"%s","artfund":"%s"}}\n' \
  "${GOVERNANCE_STAGING_DB}" "${KIDULTS_STAGING_DB}" "${ARTFUND_STAGING_DB}" \
  > "${EVIDENCE_DIR}/migration-execution.json"

echo "Dual staging migration execution completed."
