#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${ROOT_DIR:-$PWD}"
PROD_ROOT="${PROD_ROOT:-/opt/intelligence-holdings/kidults/app}"
PROD_DB="${PROD_DB:-/opt/intelligence-holdings/kidults/data/kaios.db}"
PREDEPLOYMENT_SNAPSHOT_DIR="${PREDEPLOYMENT_SNAPSHOT_DIR:-}"
ROLLBACK_RECEIPT_ROOT="${ROLLBACK_RECEIPT_ROOT:-/mnt/ih_prod_01/backups/production-certification/rollback-receipts}"
ROLLBACK_TRIGGER="${ROLLBACK_TRIGGER:-UNSPECIFIED_FAILURE}"
EXECUTE="${KAIOS_EXECUTE_PRODUCTION_ROLLBACK:-false}"
readonly BASE_URL="https://kaios.kidults.com"

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

test -n "${PREDEPLOYMENT_SNAPSHOT_DIR}" || fail "PREDEPLOYMENT_SNAPSHOT_DIR is required"
test -d "${PREDEPLOYMENT_SNAPSHOT_DIR}" || fail "Predeployment snapshot directory not found"
test -f "${PREDEPLOYMENT_SNAPSHOT_DIR}/manifest.json" || fail "Snapshot manifest missing"

python3 - "${PREDEPLOYMENT_SNAPSHOT_DIR}" <<'PY'
import hashlib
import json
import sys
from pathlib import Path

root = Path(sys.argv[1]).resolve()
manifest_path = root / "manifest.json"
manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
assert manifest.get("status") == "captured", "snapshot status must be captured"
assert manifest.get("vertical") == "kidults", "snapshot vertical mismatch"
assert manifest.get("rollback_ready") is True, "snapshot is not rollback_ready"
assert manifest.get("production_change_executed") is False, "snapshot must predate Production mutation"
assert manifest.get("artfund_change_executed") is False, "Artfund isolation violated"
required = set(manifest.get("required_rollback_files") or [])
expected_required = {
    "kaios.db", "kaios.db.sha256", "database-metadata.tsv", "database-integrity.txt",
    "env.production.snapshot", "env.production.snapshot.sha256", "docker-compose.production.yml",
    "docker-compose.production.yml.sha256", "docker-inspect.json", "rollback-images.json",
    "rollback-images.tar", "rollback-images.tar.sha256", "rollback-plan.txt",
}
assert expected_required <= required, f"rollback manifest missing required entries: {sorted(expected_required - required)}"
files = manifest.get("files") or {}
for name in sorted(required):
    path = root / name
    assert path.is_file(), f"rollback file missing: {name}"
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    assert files.get(name) == digest, f"rollback file digest mismatch: {name}"
print("Rollback snapshot manifest and file digests verified.")
PY

(
  cd "${PREDEPLOYMENT_SNAPSHOT_DIR}"
  sha256sum -c kaios.db.sha256
  sha256sum -c env.production.snapshot.sha256
  sha256sum -c docker-compose.production.yml.sha256
  sha256sum -c rollback-images.tar.sha256
)

python3 - "${PREDEPLOYMENT_SNAPSHOT_DIR}/rollback-images.json" <<'PY'
import json
import re
import sys
from pathlib import Path
payload = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
assert set(payload) == {"kidults-gateway", "kidults-scheduler"}, "rollback image map must bind exact containers"
for container, value in payload.items():
    image_id = value.get("image_id", "")
    image_ref = value.get("image_ref", "")
    assert re.fullmatch(r"sha256:[0-9a-f]{64}", image_id), f"invalid image id for {container}"
    assert image_ref and not any(ch.isspace() for ch in image_ref), f"invalid image ref for {container}"
print("Rollback image identity map verified.")
PY

read -r DB_UID DB_GID DB_MODE < "${PREDEPLOYMENT_SNAPSHOT_DIR}/database-metadata.tsv"
[[ "${DB_UID}" =~ ^[0-9]+$ && "${DB_GID}" =~ ^[0-9]+$ && "${DB_MODE}" =~ ^[0-7]{3,4}$ ]] || fail "Invalid captured database ownership/mode metadata"

test -d "${PROD_ROOT}" || fail "Production root missing"
test -d "$(dirname "${PROD_DB}")" || fail "Production database directory missing"

if [[ "${EXECUTE}" != "true" ]]; then
  echo "ROLLBACK DRY RUN COMPLETE. Snapshot is machine-restorable; no Production change executed."
  exit 0
fi

TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
RECEIPT_DIR="${ROLLBACK_RECEIPT_ROOT}/kidults-rollback-${TIMESTAMP}"
mkdir -p "${RECEIPT_DIR}"
chmod 700 "${RECEIPT_DIR}" 2>/dev/null || true

SNAPSHOT_MANIFEST_SHA256="$(sha256sum "${PREDEPLOYMENT_SNAPSHOT_DIR}/manifest.json" | awk '{print $1}')"
BEFORE_GATEWAY_IMAGE="$(docker inspect -f '{{.Image}}' kidults-gateway 2>/dev/null || printf 'ABSENT')"
BEFORE_SCHEDULER_IMAGE="$(docker inspect -f '{{.Image}}' kidults-scheduler 2>/dev/null || printf 'ABSENT')"

# Preserve the failed state as forensic evidence before restoring the known-good state.
if [[ -f "${PROD_DB}" ]]; then
  cp -p "${PROD_DB}" "${RECEIPT_DIR}/failed-kaios.db"
  sha256sum "${RECEIPT_DIR}/failed-kaios.db" > "${RECEIPT_DIR}/failed-kaios.db.sha256"
fi
[[ -f "${PROD_ROOT}/.env.production" ]] && cp -p "${PROD_ROOT}/.env.production" "${RECEIPT_DIR}/failed-env.production.snapshot"
[[ -f "${PROD_ROOT}/docker-compose.production.yml" ]] && cp -p "${PROD_ROOT}/docker-compose.production.yml" "${RECEIPT_DIR}/failed-docker-compose.production.yml"

# Stop only the KIDULTS runtime containers. Do not delete volumes, networks, host services or Artfund state.
docker stop kidults-gateway kidults-scheduler >/dev/null 2>&1 || true

DB_TMP="${PROD_DB}.rollback.${TIMESTAMP}.tmp"
cp "${PREDEPLOYMENT_SNAPSHOT_DIR}/kaios.db" "${DB_TMP}"
chown "${DB_UID}:${DB_GID}" "${DB_TMP}"
chmod "${DB_MODE}" "${DB_TMP}"
mv -f "${DB_TMP}" "${PROD_DB}"

cp -p "${PREDEPLOYMENT_SNAPSHOT_DIR}/env.production.snapshot" "${PROD_ROOT}/.env.production"
cp -p "${PREDEPLOYMENT_SNAPSHOT_DIR}/docker-compose.production.yml" "${PROD_ROOT}/docker-compose.production.yml"

# Recover the exact captured image bytes; never pull a mutable upstream tag during rollback.
docker load --input "${PREDEPLOYMENT_SNAPSHOT_DIR}/rollback-images.tar" > "${RECEIPT_DIR}/docker-load.txt"
while IFS=$'\t' read -r IMAGE_ID IMAGE_REF; do
  docker image inspect "${IMAGE_ID}" >/dev/null
  if [[ "${IMAGE_REF}" != sha256:* && "${IMAGE_REF}" != *@sha256:* ]]; then
    docker tag "${IMAGE_ID}" "${IMAGE_REF}"
  fi
done < <(python3 - "${PREDEPLOYMENT_SNAPSHOT_DIR}/rollback-images.json" <<'PY'
import json
import sys
from pathlib import Path
payload = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
for container in ("kidults-gateway", "kidults-scheduler"):
    value = payload[container]
    print(f"{value['image_id']}\t{value['image_ref']}")
PY
)

cd "${PROD_ROOT}"
docker compose --env-file .env.production -f docker-compose.production.yml config >/dev/null
docker compose --env-file .env.production -f docker-compose.production.yml up -d --force-recreate --pull never
sleep 30

DB_INTEGRITY="$(sqlite3 "${PROD_DB}" 'PRAGMA integrity_check;')"
HEALTH_HTTP="$(curl --proto '=https' --max-redirs 0 --max-time 15 -sS -o "${RECEIPT_DIR}/health.json" -w '%{http_code}' "${BASE_URL}/api/health" || true)"
PORTAL_HTTP="$(curl --proto '=https' --max-redirs 0 --max-time 15 -sS -o "${RECEIPT_DIR}/portal.html" -w '%{http_code}' "${BASE_URL}/portal/" || true)"
UNAUTH_HTTP="$(curl --proto '=https' --max-redirs 0 --max-time 15 -sS -o "${RECEIPT_DIR}/collector-unauth.json" -w '%{http_code}' "${BASE_URL}/api/collector?mode=live" || true)"
AFTER_GATEWAY_IMAGE="$(docker inspect -f '{{.Image}}' kidults-gateway 2>/dev/null || printf 'ABSENT')"
AFTER_SCHEDULER_IMAGE="$(docker inspect -f '{{.Image}}' kidults-scheduler 2>/dev/null || printf 'ABSENT')"

EXPECTED_GATEWAY_IMAGE="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["kidults-gateway"]["image_id"])' "${PREDEPLOYMENT_SNAPSHOT_DIR}/rollback-images.json")"
EXPECTED_SCHEDULER_IMAGE="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["kidults-scheduler"]["image_id"])' "${PREDEPLOYMENT_SNAPSHOT_DIR}/rollback-images.json")"

RESULT="PASS"
FAILURES=()
[[ "${DB_INTEGRITY}" == "ok" ]] || { RESULT="FAIL"; FAILURES+=(database_integrity); }
[[ "${HEALTH_HTTP}" == "200" ]] || { RESULT="FAIL"; FAILURES+=(health_http); }
[[ "${PORTAL_HTTP}" == "200" ]] || { RESULT="FAIL"; FAILURES+=(portal_http); }
[[ "${UNAUTH_HTTP}" == "401" ]] || { RESULT="FAIL"; FAILURES+=(unauthenticated_collector_http); }
[[ "${AFTER_GATEWAY_IMAGE}" == "${EXPECTED_GATEWAY_IMAGE}" ]] || { RESULT="FAIL"; FAILURES+=(gateway_image_identity); }
[[ "${AFTER_SCHEDULER_IMAGE}" == "${EXPECTED_SCHEDULER_IMAGE}" ]] || { RESULT="FAIL"; FAILURES+=(scheduler_image_identity); }

FAILURE_CSV="$(IFS=,; echo "${FAILURES[*]-}")"
python3 - "${RECEIPT_DIR}/rollback-receipt.json" "${TIMESTAMP}" "${ROLLBACK_TRIGGER}" "${PREDEPLOYMENT_SNAPSHOT_DIR}" "${SNAPSHOT_MANIFEST_SHA256}" "${RESULT}" "${FAILURE_CSV}" "${BEFORE_GATEWAY_IMAGE}" "${BEFORE_SCHEDULER_IMAGE}" "${AFTER_GATEWAY_IMAGE}" "${AFTER_SCHEDULER_IMAGE}" "${DB_INTEGRITY}" "${HEALTH_HTTP}" "${PORTAL_HTTP}" "${UNAUTH_HTTP}" <<'PY'
import json
import sys
from pathlib import Path
payload = {
    "rolled_back_at": sys.argv[2],
    "vertical": "kidults",
    "environment": "production",
    "trigger": sys.argv[3],
    "snapshot_directory": sys.argv[4],
    "snapshot_manifest_sha256": sys.argv[5],
    "result": sys.argv[6],
    "failures": [x for x in sys.argv[7].split(',') if x],
    "before": {"gateway_image_id": sys.argv[8], "scheduler_image_id": sys.argv[9]},
    "after": {"gateway_image_id": sys.argv[10], "scheduler_image_id": sys.argv[11]},
    "database_integrity": sys.argv[12],
    "health_http": sys.argv[13],
    "portal_http": sys.argv[14],
    "unauthenticated_collector_http": sys.argv[15],
    "artfund_change_executed": False,
}
Path(sys.argv[1]).write_text(json.dumps(payload, indent=2), encoding="utf-8")
print(json.dumps(payload, indent=2))
PY
sha256sum "${RECEIPT_DIR}/rollback-receipt.json" > "${RECEIPT_DIR}/rollback-receipt.json.sha256"

if [[ "${RESULT}" != "PASS" ]]; then
  echo "CRITICAL: Production rollback completed with failed recovery checks: ${FAILURE_CSV}" >&2
  exit 3
fi

echo "KIDULTS Production rollback PASS. Receipt: ${RECEIPT_DIR}/rollback-receipt.json"
