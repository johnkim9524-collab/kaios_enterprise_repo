#!/usr/bin/env bash
set -euo pipefail

PROD_ROOT="${PROD_ROOT:-/opt/intelligence-holdings/kidults/app}"
PROD_DB="${PROD_DB:-/opt/intelligence-holdings/kidults/data/kaios.db}"
CERT_ROOT="${CERT_ROOT:-/mnt/ih_prod_01/backups/production-certification}"
TIMESTAMP="${TIMESTAMP:-$(date -u +%Y%m%dT%H%M%SZ)}"
SNAPSHOT_DIR="${CERT_ROOT}/kidults-predeployment-${TIMESTAMP}"

mkdir -p "${SNAPSHOT_DIR}"

sqlite3 "${PROD_DB}" "PRAGMA integrity_check;" > "${SNAPSHOT_DIR}/database-integrity.txt"
cp "${PROD_DB}" "${SNAPSHOT_DIR}/kaios.db"
sha256sum "${SNAPSHOT_DIR}/kaios.db" > "${SNAPSHOT_DIR}/kaios.db.sha256"

docker ps --no-trunc > "${SNAPSHOT_DIR}/docker-ps.txt"
docker inspect kidults-gateway kidults-scheduler > "${SNAPSHOT_DIR}/docker-inspect.json"

test -f "${PROD_ROOT}/.env.production" && cp "${PROD_ROOT}/.env.production" "${SNAPSHOT_DIR}/env.production.snapshot"
test -f "${PROD_ROOT}/docker-compose.production.yml" && cp "${PROD_ROOT}/docker-compose.production.yml" "${SNAPSHOT_DIR}/docker-compose.production.yml"

git -C "${PROD_ROOT}" rev-parse HEAD > "${SNAPSHOT_DIR}/production-git-head.txt" 2>/dev/null || true
git -C "${PROD_ROOT}" status --short > "${SNAPSHOT_DIR}/production-git-status.txt" 2>/dev/null || true

systemctl is-active caddy > "${SNAPSHOT_DIR}/caddy-state.txt"
systemctl is-active fail2ban > "${SNAPSHOT_DIR}/fail2ban-state.txt"
systemctl is-enabled kidults-backup.timer > "${SNAPSHOT_DIR}/backup-timer-state.txt"
systemctl is-enabled kidults-stability-snapshot.timer > "${SNAPSHOT_DIR}/stability-timer-state.txt"

cat > "${SNAPSHOT_DIR}/rollback-plan.txt" <<EOF
1. Stop the promoted Kidults containers.
2. Restore ${SNAPSHOT_DIR}/kaios.db to ${PROD_DB}.
3. Restore the captured production environment and compose files.
4. Recreate the prior gateway and scheduler containers.
5. Verify database integrity, health 200, portal 200, and unauthenticated collector 401.
6. Record rollback evidence and preserve Artfund isolation.
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

manifest = {
    "status": "captured",
    "vertical": "kidults",
    "captured_at": datetime.now(timezone.utc).isoformat(),
    "snapshot_directory": str(root),
    "production_change_executed": False,
    "artfund_change_executed": False,
    "files": files,
}
(root / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
print(json.dumps(manifest, indent=2))
PY

chmod 600 "${SNAPSHOT_DIR}/env.production.snapshot" 2>/dev/null || true

echo "Kidults predeployment snapshot captured: ${SNAPSHOT_DIR}"
