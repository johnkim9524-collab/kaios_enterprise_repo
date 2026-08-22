#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${ROOT_DIR:-$PWD}"
PROD_ROOT="${PROD_ROOT:-/opt/intelligence-holdings/kidults/app}"
PROD_DB="${PROD_DB:-/opt/intelligence-holdings/kidults/data/kaios.db}"
readonly BASE_URL="https://kaios.kidults.com"
ADMIN_TOKEN_FILE="${ADMIN_TOKEN_FILE:-/opt/intelligence-holdings/kidults/secrets/kaios_admin_token}"
ARCHIVE_ROOT="${ARCHIVE_ROOT:-/mnt/ih_prod_01/backups/production-certification}"
STABILITY_ROOT="${STABILITY_ROOT:-/mnt/ih_prod_01/backups/stability-baseline}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
EVIDENCE_DIR="${ROOT_DIR}/artifacts/postdeployment-certification-${TIMESTAMP}"
ARCHIVE="${ARCHIVE_ROOT}/kidults-postdeployment-certification-${TIMESTAMP}.tar.gz"

fail() { echo "ERROR: $*" >&2; exit 1; }

mkdir -p "${EVIDENCE_DIR}"
mkdir -p "${ARCHIVE_ROOT}" "${STABILITY_ROOT}"
test -f "${PROD_DB}" || fail "Production database missing"
test -f "${PROD_ROOT}/.env.production" || fail "Production environment missing"
test -f "${PROD_ROOT}/docker-compose.production.yml" || fail "Production compose missing"
test -f "${ADMIN_TOKEN_FILE}" || fail "Admin token file missing"

cd "${PROD_ROOT}"
docker compose --env-file .env.production -f docker-compose.production.yml ps -a > "${EVIDENCE_DIR}/docker-ps.txt"
docker compose --env-file .env.production -f docker-compose.production.yml images > "${EVIDENCE_DIR}/docker-images.txt"
docker inspect kidults-gateway kidults-scheduler > "${EVIDENCE_DIR}/docker-inspect.json"
docker logs kidults-gateway --tail 200 > "${EVIDENCE_DIR}/gateway.log" 2>&1 || true
docker logs kidults-scheduler --tail 200 > "${EVIDENCE_DIR}/scheduler.log" 2>&1 || true

HEALTH_HTTP="$(curl -sS -o "${EVIDENCE_DIR}/health.json" -w '%{http_code}' "${BASE_URL}/api/health")"
PORTAL_HTTP="$(curl -sS -o "${EVIDENCE_DIR}/portal.html" -w '%{http_code}' "${BASE_URL}/portal/")"
UNAUTH_HTTP="$(curl -sS -o "${EVIDENCE_DIR}/collector-unauth.json" -w '%{http_code}' "${BASE_URL}/api/collector?mode=live")"
ADMIN_TOKEN="$(tr -d '\r\n' < "${ADMIN_TOKEN_FILE}")"
AUTH_HTTP="$(curl -sS -o "${EVIDENCE_DIR}/collector-auth.json" -w '%{http_code}' -H "Authorization: Bearer ${ADMIN_TOKEN}" "${BASE_URL}/api/collector?mode=live")"
unset ADMIN_TOKEN
DB_INTEGRITY="$(sqlite3 "${PROD_DB}" 'PRAGMA integrity_check;')"
DB_SHA256="$(sha256sum "${PROD_DB}" | awk '{print $1}')"
GATEWAY_IMAGE="$(docker inspect -f '{{.Image}}' kidults-gateway)"
SCHEDULER_IMAGE="$(docker inspect -f '{{.Image}}' kidults-scheduler)"

python3 - "${EVIDENCE_DIR}" "${TIMESTAMP}" "${HEALTH_HTTP}" "${PORTAL_HTTP}" "${UNAUTH_HTTP}" "${AUTH_HTTP}" "${DB_INTEGRITY}" "${DB_SHA256}" "${GATEWAY_IMAGE}" "${SCHEDULER_IMAGE}" <<'PY'
import json, sys
from pathlib import Path
root = Path(sys.argv[1])
values = {"certified_at": sys.argv[2], "production_origin": "https://kaios.kidults.com", "health_http": int(sys.argv[3]), "portal_http": int(sys.argv[4]), "unauthenticated_collector_http": int(sys.argv[5]), "authenticated_collector_http": int(sys.argv[6]), "database_integrity": sys.argv[7], "database_sha256": sys.argv[8], "gateway_image_id": sys.argv[9], "scheduler_image_id": sys.argv[10]}
checks = {"health": values["health_http"] == 200, "portal": values["portal_http"] == 200, "unauthenticated_collector": values["unauthenticated_collector_http"] == 401, "authenticated_collector": values["authenticated_collector_http"] == 200, "database_integrity": values["database_integrity"] == "ok"}
failed = [name for name, passed in checks.items() if not passed]
payload = {"status": "certified" if not failed else "failed", "vertical": "kidults", "environment": "production", "production_change_executed": True, "artfund_change_executed": False, "checks": checks, "failed_checks": failed, **values}
(root / "manifest.json").write_text(json.dumps(payload, indent=2), encoding="utf-8")
print(json.dumps(payload, indent=2))
if failed: raise SystemExit(2)
PY

cd "${ROOT_DIR}"
tar -czf "${ARCHIVE}" -C "${EVIDENCE_DIR}" .
sha256sum "${ARCHIVE}" > "${ARCHIVE}.sha256"
cp "${EVIDENCE_DIR}/manifest.json" "${ARCHIVE}.manifest.json"
STABILITY_START="${STABILITY_ROOT}/kidults-stability-baseline-start-${TIMESTAMP}.json"
python3 - "${STABILITY_START}" "${TIMESTAMP}" "${ARCHIVE}" <<'PY'
import json, sys
from pathlib import Path
payload = {"status": "started", "vertical": "kidults", "environment": "production", "started_at": sys.argv[2], "observation_days": 30, "certification_archive": sys.argv[3], "production_promotion_completed": True, "artfund_production_promotion_authorized": False}
Path(sys.argv[1]).write_text(json.dumps(payload, indent=2), encoding="utf-8")
print(json.dumps(payload, indent=2))
PY

echo "Kidults postdeployment certification completed."
echo "ARCHIVE=${ARCHIVE}"
echo "STABILITY_BASELINE=${STABILITY_START}"
