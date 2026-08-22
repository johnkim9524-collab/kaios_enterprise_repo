#!/usr/bin/env bash
set -euo pipefail

PROD_ROOT="${PROD_ROOT:-/opt/intelligence-holdings/kidults/app}"
PROD_DB="${PROD_DB:-/opt/intelligence-holdings/kidults/data/kaios.db}"
CERT_ROOT="${CERT_ROOT:-/mnt/ih_prod_01/backups/production-certification}"
TIMESTAMP="${TIMESTAMP:-$(date -u +%Y%m%dT%H%M%SZ)}"
SNAPSHOT_DIR="${CERT_ROOT}/kidults-predeployment-${TIMESTAMP}"

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

# A rollback cannot be claimed unless every machine-restorable input exists before
# the first Production mutation.
test -f "${PROD_DB}" || fail "Production database missing"
test -f "${PROD_ROOT}/.env.production" || fail "Production environment missing"
test -f "${PROD_ROOT}/docker-compose.production.yml" || fail "Production compose missing"
docker inspect kidults-gateway kidults-scheduler >/dev/null 2>&1 || fail "Production containers are not inspectable"

mkdir -p "${SNAPSHOT_DIR}"

sqlite3 "${PROD_DB}" "PRAGMA integrity_check;" > "${SNAPSHOT_DIR}/database-integrity.txt"
grep -qx 'ok' "${SNAPSHOT_DIR}/database-integrity.txt" || fail "Production database integrity is not ok"
cp -p "${PROD_DB}" "${SNAPSHOT_DIR}/kaios.db"
sha256sum "${SNAPSHOT_DIR}/kaios.db" > "${SNAPSHOT_DIR}/kaios.db.sha256"
stat -c '%u\t%g\t%a' "${PROD_DB}" > "${SNAPSHOT_DIR}/database-metadata.tsv"

docker ps --no-trunc > "${SNAPSHOT_DIR}/docker-ps.txt"
docker inspect kidults-gateway kidults-scheduler > "${SNAPSHOT_DIR}/docker-inspect.json"

GATEWAY_IMAGE_ID="$(docker inspect -f '{{.Image}}' kidults-gateway)"
GATEWAY_IMAGE_REF="$(docker inspect -f '{{.Config.Image}}' kidults-gateway)"
SCHEDULER_IMAGE_ID="$(docker inspect -f '{{.Image}}' kidults-scheduler)"
SCHEDULER_IMAGE_REF="$(docker inspect -f '{{.Config.Image}}' kidults-scheduler)"
for image_id in "${GATEWAY_IMAGE_ID}" "${SCHEDULER_IMAGE_ID}"; do
  [[ "${image_id}" =~ ^sha256:[0-9a-f]{64}$ ]] || fail "Invalid immutable image id: ${image_id}"
  docker image inspect "${image_id}" >/dev/null || fail "Rollback image unavailable locally: ${image_id}"
done

python3 - "${SNAPSHOT_DIR}/rollback-images.json" "${GATEWAY_IMAGE_ID}" "${GATEWAY_IMAGE_REF}" "${SCHEDULER_IMAGE_ID}" "${SCHEDULER_IMAGE_REF}" <<'PY'
import json
import sys
from pathlib import Path

payload = {
    "kidults-gateway": {"image_id": sys.argv[2], "image_ref": sys.argv[3]},
    "kidults-scheduler": {"image_id": sys.argv[4], "image_ref": sys.argv[5]},
}
Path(sys.argv[1]).write_text(json.dumps(payload, indent=2), encoding="utf-8")
PY

docker image save --output "${SNAPSHOT_DIR}/rollback-images.tar" "${GATEWAY_IMAGE_ID}" "${SCHEDULER_IMAGE_ID}"
sha256sum "${SNAPSHOT_DIR}/rollback-images.tar" > "${SNAPSHOT_DIR}/rollback-images.tar.sha256"

cp -p "${PROD_ROOT}/.env.production" "${SNAPSHOT_DIR}/env.production.snapshot"
cp -p "${PROD_ROOT}/docker-compose.production.yml" "${SNAPSHOT_DIR}/docker-compose.production.yml"
sha256sum "${SNAPSHOT_DIR}/env.production.snapshot" > "${SNAPSHOT_DIR}/env.production.snapshot.sha256"
sha256sum "${SNAPSHOT_DIR}/docker-compose.production.yml" > "${SNAPSHOT_DIR}/docker-compose.production.yml.sha256"

git -C "${PROD_ROOT}" rev-parse HEAD > "${SNAPSHOT_DIR}/production-git-head.txt" 2>/dev/null || true
git -C "${PROD_ROOT}" status --short > "${SNAPSHOT_DIR}/production-git-status.txt" 2>/dev/null || true

systemctl is-active caddy > "${SNAPSHOT_DIR}/caddy-state.txt"
systemctl is-active fail2ban > "${SNAPSHOT_DIR}/fail2ban-state.txt"
systemctl is-enabled kidults-backup.timer > "${SNAPSHOT_DIR}/backup-timer-state.txt"
systemctl is-enabled kidults-stability-snapshot.timer > "${SNAPSHOT_DIR}/stability-timer-state.txt"

cat > "${SNAPSHOT_DIR}/rollback-plan.txt" <<EOF
1. Verify the immutable predeployment snapshot manifest and every captured checksum.
2. Stop the promoted Kidults containers without deleting persistent volumes.
3. Preserve the failed-state DB/config evidence before overwrite.
4. Restore ${SNAPSHOT_DIR}/kaios.db to ${PROD_DB} with captured mode/owner.
5. Restore the captured production environment and compose files.
6. Load and re-bind the exact captured gateway/scheduler image IDs.
7. Recreate the prior gateway and scheduler containers.
8. Verify database integrity, health 200, portal 200, and unauthenticated collector 401.
9. Emit a rollback receipt with trigger, snapshot digest, before/after image identities and result.
10. Preserve Artfund isolation throughout.
EOF

python3 - "${SNAPSHOT_DIR}" <<'PY'
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

root = Path(sys.argv[1])
files = {}
for path in sorted(root.iterdir()):
    if path.is_file():
        files[path.name] = hashlib.sha256(path.read_bytes()).hexdigest()

required = {
    "kaios.db",
    "kaios.db.sha256",
    "database-metadata.tsv",
    "database-integrity.txt",
    "env.production.snapshot",
    "env.production.snapshot.sha256",
    "docker-compose.production.yml",
    "docker-compose.production.yml.sha256",
    "docker-inspect.json",
    "rollback-images.json",
    "rollback-images.tar",
    "rollback-images.tar.sha256",
    "rollback-plan.txt",
}
missing = sorted(required - files.keys())
if missing:
    raise SystemExit(f"incomplete rollback snapshot: {missing}")

manifest = {
    "status": "captured",
    "vertical": "kidults",
    "captured_at": datetime.now(timezone.utc).isoformat(),
    "snapshot_directory": str(root),
    "rollback_ready": True,
    "required_rollback_files": sorted(required),
    "production_change_executed": False,
    "artfund_change_executed": False,
    "files": files,
}
(root / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
print(json.dumps(manifest, indent=2))
PY

chmod 600 "${SNAPSHOT_DIR}/env.production.snapshot" "${SNAPSHOT_DIR}/kaios.db" 2>/dev/null || true

echo "Kidults predeployment snapshot captured and rollback-ready: ${SNAPSHOT_DIR}"
