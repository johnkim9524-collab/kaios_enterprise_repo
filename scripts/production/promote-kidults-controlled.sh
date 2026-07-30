#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${ROOT_DIR:-$PWD}"
PROD_ROOT="${PROD_ROOT:-/opt/intelligence-holdings/kidults/app}"
EVIDENCE_ARCHIVE="${EVIDENCE_ARCHIVE:-}"
PREDEPLOYMENT_SNAPSHOT_DIR="${PREDEPLOYMENT_SNAPSHOT_DIR:-}"
BASE_URL="${BASE_URL:-https://kaios.kidults.com}"
ADMIN_TOKEN_FILE="${ADMIN_TOKEN_FILE:-/opt/intelligence-holdings/kidults/secrets/kaios_admin_token}"
EXECUTE="${KAIOS_EXECUTE_PRODUCTION_PROMOTION:-false}"

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

test -n "${EVIDENCE_ARCHIVE}" || fail "EVIDENCE_ARCHIVE is required"
test -f "${EVIDENCE_ARCHIVE}" || fail "Evidence archive not found"
test -f "${EVIDENCE_ARCHIVE}.sha256" || fail "Evidence checksum not found"
test -f "${EVIDENCE_ARCHIVE}.manifest.json" || fail "Evidence manifest not found"
test -n "${PREDEPLOYMENT_SNAPSHOT_DIR}" || fail "PREDEPLOYMENT_SNAPSHOT_DIR is required"
test -f "${PREDEPLOYMENT_SNAPSHOT_DIR}/manifest.json" || fail "Predeployment snapshot manifest not found"

sha256sum -c "${EVIDENCE_ARCHIVE}.sha256"

python3 - "${EVIDENCE_ARCHIVE}.manifest.json" "${PREDEPLOYMENT_SNAPSHOT_DIR}/manifest.json" <<'PY'
import json
import sys
from pathlib import Path

seal = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
snapshot = json.loads(Path(sys.argv[2]).read_text(encoding="utf-8"))

assert seal.get("status") == "sealed"
assert seal.get("decision") == "go"
assert seal.get("score") == 100
assert seal.get("production_promotion_authorized") is True
assert seal.get("artfund_production_promotion_authorized") is False
assert seal.get("production_change_executed") is False
assert snapshot.get("status") == "captured"
assert snapshot.get("vertical") == "kidults"
assert snapshot.get("production_change_executed") is False
assert snapshot.get("artfund_change_executed") is False
print("Promotion authorization and snapshot verified.")
PY

test -f "${PROD_ROOT}/.env.production" || fail "Production environment file missing"
test -f "${PROD_ROOT}/docker-compose.production.yml" || fail "Production compose file missing"

cat <<EOF
===== KIDULTS CONTROLLED PRODUCTION PROMOTION =====
Mode: ${EXECUTE}
Production root: ${PROD_ROOT}
Evidence archive: ${EVIDENCE_ARCHIVE}
Predeployment snapshot: ${PREDEPLOYMENT_SNAPSHOT_DIR}
Artfund changes: forbidden
EOF

if [[ "${EXECUTE}" != "true" ]]; then
  echo "DRY RUN COMPLETE. No production change executed."
  exit 0
fi

cd "${PROD_ROOT}"

docker compose --env-file .env.production -f docker-compose.production.yml config >/dev/null

docker compose --env-file .env.production -f docker-compose.production.yml up -d --force-recreate
sleep 30

HEALTH_HTTP="$(curl -sS -o /tmp/kidults-health.json -w '%{http_code}' "${BASE_URL}/api/health")"
PORTAL_HTTP="$(curl -sS -o /tmp/kidults-portal.html -w '%{http_code}' "${BASE_URL}/portal/")"
UNAUTH_HTTP="$(curl -sS -o /tmp/kidults-unauth.json -w '%{http_code}' "${BASE_URL}/api/collector?mode=live")"
ADMIN_TOKEN="$(tr -d '\r\n' < "${ADMIN_TOKEN_FILE}")"
AUTH_HTTP="$(curl -sS -o /tmp/kidults-auth.json -w '%{http_code}' -H "Authorization: Bearer ${ADMIN_TOKEN}" "${BASE_URL}/api/collector?mode=live")"
unset ADMIN_TOKEN
DB_INTEGRITY="$(sqlite3 /opt/intelligence-holdings/kidults/data/kaios.db 'PRAGMA integrity_check;')"

if [[ "${HEALTH_HTTP}" != "200" || "${PORTAL_HTTP}" != "200" || "${UNAUTH_HTTP}" != "401" || "${AUTH_HTTP}" != "200" || "${DB_INTEGRITY}" != "ok" ]]; then
  echo "Post-deployment smoke failed. Automatic rollback is required." >&2
  echo "HEALTH_HTTP=${HEALTH_HTTP} PORTAL_HTTP=${PORTAL_HTTP} UNAUTH_HTTP=${UNAUTH_HTTP} AUTH_HTTP=${AUTH_HTTP} DB_INTEGRITY=${DB_INTEGRITY}" >&2
  exit 2
fi

echo "Kidults controlled production promotion completed and smoke checks passed."
