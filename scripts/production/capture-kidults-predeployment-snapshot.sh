#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$' \t\n'
PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
export PATH LC_ALL=C TZ=UTC
readonly PATH
unset BASH_ENV ENV PYTHONHOME PYTHONPATH LD_PRELOAD LD_LIBRARY_PATH \
  GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_OBJECT_DIRECTORY GIT_ALTERNATE_OBJECT_DIRECTORIES \
  GIT_CONFIG_COUNT GIT_CONFIG_GLOBAL GIT_CONFIG_SYSTEM GIT_CONFIG_NOSYSTEM \
  DOCKER_HOST DOCKER_CONTEXT DOCKER_CONFIG DOCKER_CERT_PATH DOCKER_TLS_VERIFY \
  COMPOSE_FILE COMPOSE_PROJECT_NAME COMPOSE_PROFILES COMPOSE_ENV_FILES COMPOSE_PATH_SEPARATOR
umask 077
readonly DOCKER_HOST="unix:///var/run/docker.sock"
export DOCKER_HOST

PROD_ROOT="${PROD_ROOT:-/opt/intelligence-holdings/kidults/app}"
PROD_DB="${PROD_DB:-/opt/intelligence-holdings/kidults/data/kaios.db}"
CERT_ROOT="${CERT_ROOT:-/mnt/ih_prod_01/backups/production-certification}"
TIMESTAMP="${TIMESTAMP:-$(date -u +%Y%m%dT%H%M%SZ)}"
SNAPSHOT_DIR="${CERT_ROOT}/kidults-predeployment-${TIMESTAMP}"
readonly CANONICAL_PROD_ROOT="/opt/intelligence-holdings/kidults/app"
readonly CANONICAL_PROD_DB="/opt/intelligence-holdings/kidults/data/kaios.db"

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

# A rollback cannot be claimed unless every machine-restorable input exists before
# the first Production mutation.
[[ "${EUID}" -eq 0 ]] || fail "Predeployment snapshot capture requires the protected root executor"
[[ "${TIMESTAMP}" =~ ^[0-9]{8}T[0-9]{6}Z$ ]] || fail "Snapshot timestamp is invalid"
test -d "${CERT_ROOT}" && test ! -L "${CERT_ROOT}" || fail "Certification root is missing or unsafe"
test -f "${PROD_DB}" || fail "Production database missing"
test ! -L "${PROD_DB}" || fail "Production database path substitution is forbidden"
test -f "${PROD_ROOT}/.env.production" || fail "Production environment missing"
test ! -L "${PROD_ROOT}/.env.production" || fail "Production environment path substitution is forbidden"
test -f "${PROD_ROOT}/docker-compose.production.yml" || fail "Production compose missing"
test ! -L "${PROD_ROOT}/docker-compose.production.yml" || fail "Production compose path substitution is forbidden"
command -v docker >/dev/null || fail "docker is required"
command -v sqlite3 >/dev/null || fail "sqlite3 is required"
command -v cmp >/dev/null || fail "cmp is required"
docker inspect kidults-gateway kidults-scheduler >/dev/null 2>&1 || fail "Production containers are not inspectable"
SOURCE_SHA="$(git -C "${PROD_ROOT}" rev-parse HEAD 2>/dev/null)" || fail "Production root is not an exact Git checkout"
[[ "${SOURCE_SHA}" =~ ^[0-9a-f]{40}$ ]] || fail "Production source SHA is invalid"
git -C "${PROD_ROOT}" diff --quiet || fail "Tracked Production runtime changes are forbidden before snapshot"
git -C "${PROD_ROOT}" diff --cached --quiet || fail "Staged Production runtime changes are forbidden before snapshot"
SQLITE_SNAPSHOT_HELPER="${PROD_ROOT}/scripts/production/capture-kidults-sqlite-snapshot-v1.py"
test -f "${SQLITE_SNAPSHOT_HELPER}" && test ! -L "${SQLITE_SNAPSHOT_HELPER}" || fail "Tracked SQLite snapshot helper is missing or unsafe"
EXPECTED_SQLITE_HELPER_BLOB="$(git -C "${PROD_ROOT}" rev-parse "${SOURCE_SHA}:scripts/production/capture-kidults-sqlite-snapshot-v1.py")" \
  || fail "SQLite snapshot helper is not tracked at the signed source SHA"
ACTUAL_SQLITE_HELPER_BLOB="$(git -C "${PROD_ROOT}" hash-object --no-filters "${SQLITE_SNAPSHOT_HELPER}")" \
  || fail "SQLite snapshot helper blob cannot be hashed"
[[ "${ACTUAL_SQLITE_HELPER_BLOB}" == "${EXPECTED_SQLITE_HELPER_BLOB}" ]] \
  || fail "SQLite snapshot helper bytes do not match the signed source SHA"
PROD_ROOT_REAL="$(realpath -e "${PROD_ROOT}")"
PROD_DB_REAL="$(realpath -e "${PROD_DB}")"
CERT_ROOT_REAL="$(realpath -e "${CERT_ROOT}")"
[[ "${PROD_ROOT_REAL}" == "${CANONICAL_PROD_ROOT}" ]] || fail "Snapshot capture requires the canonical Production root"
[[ "${PROD_DB_REAL}" == "${CANONICAL_PROD_DB}" ]] || fail "Snapshot capture requires the canonical Production database"
python3 -I - "${CERT_ROOT_REAL}" "${PROD_ROOT_REAL}" "${PROD_ROOT}/.env.production" \
  "${PROD_ROOT}/docker-compose.production.yml" "${SQLITE_SNAPSHOT_HELPER}" "${PROD_DB_REAL}" <<'PY'
import stat
import sys
from pathlib import Path

certification_root = Path(sys.argv[1])
for component in (certification_root, *certification_root.parents):
    metadata = component.stat()
    if component.is_symlink() or metadata.st_uid != 0 or stat.S_IMODE(metadata.st_mode) & 0o022:
        raise SystemExit(f"certification ancestor is not root-owned and non-writable: {component}")
for raw in sys.argv[1:6]:
    path = Path(raw)
    metadata = path.stat()
    if metadata.st_uid != 0 or stat.S_IMODE(metadata.st_mode) & 0o022:
        raise SystemExit(f"protected snapshot input is not root-owned and non-writable: {path}")
database = Path(sys.argv[6])
database_metadata = database.stat()
if not stat.S_ISREG(database_metadata.st_mode) or stat.S_IMODE(database_metadata.st_mode) & 0o7022:
    raise SystemExit("Production database is not a protected regular file")
for index, component in enumerate((database.parent, *database.parent.parents)):
    metadata = component.stat()
    if component.is_symlink() or stat.S_IMODE(metadata.st_mode) & 0o022 or (index > 0 and metadata.st_uid != 0):
        raise SystemExit(f"Production database ancestor is not protected: {component}")
PY

python3 -I - "${CERT_ROOT_REAL}" "kidults-predeployment-${TIMESTAMP}" <<'PY'
import os
import re
import sys

root = sys.argv[1]
name = sys.argv[2]
if not re.fullmatch(r"kidults-predeployment-[0-9]{8}T[0-9]{6}Z", name):
    raise SystemExit("snapshot directory name is invalid")
root_fd = os.open(root, os.O_RDONLY | os.O_DIRECTORY | getattr(os, "O_NOFOLLOW", 0))
try:
    try:
        os.stat(name, dir_fd=root_fd, follow_symlinks=False)
    except FileNotFoundError:
        pass
    else:
        raise SystemExit("snapshot directory already exists")
    os.mkdir(name, 0o700, dir_fd=root_fd)
    snapshot_fd = os.open(name, os.O_RDONLY | os.O_DIRECTORY | getattr(os, "O_NOFOLLOW", 0), dir_fd=root_fd)
    try:
        os.fchmod(snapshot_fd, 0o700)
        os.fsync(snapshot_fd)
    finally:
        os.close(snapshot_fd)
    os.fsync(root_fd)
finally:
    os.close(root_fd)
PY
[[ "$(realpath -e "${SNAPSHOT_DIR}")" == "${CERT_ROOT_REAL}/kidults-predeployment-${TIMESTAMP}" ]] || fail "Snapshot directory path substitution is forbidden"

# Copying a live SQLite main file can omit committed WAL pages.  This helper
# keeps O_NOFOLLOW source/target descriptors open, proves the SQLite connection
# itself opened those exact inodes, and uses the online backup API.
DATABASE_CAPTURE_RECORD="$(python3 -I "${SQLITE_SNAPSHOT_HELPER}" "${PROD_DB}" \
  "${SNAPSHOT_DIR}/kaios.db" "${SNAPSHOT_DIR}/database-metadata.tsv")" \
  || fail "Inode-bound SQLite online backup failed"
IFS=$'\t' read -r DATABASE_CAPTURED_AT DATABASE_CAPTURE_UID DATABASE_CAPTURE_GID DATABASE_CAPTURE_MODE \
  <<< "${DATABASE_CAPTURE_RECORD}"
[[ "${DATABASE_CAPTURED_AT}" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$ ]] \
  || fail "SQLite snapshot completion timestamp is invalid"
[[ "${DATABASE_CAPTURE_UID}" =~ ^[0-9]+$ && "${DATABASE_CAPTURE_GID}" =~ ^[0-9]+$ \
  && "${DATABASE_CAPTURE_MODE}" =~ ^0[0-7]{3}$ ]] \
  || fail "SQLite held-inode metadata receipt is invalid"
[[ "${DATABASE_CAPTURE_RECORD}" == "${DATABASE_CAPTURED_AT}"$'\t'"${DATABASE_CAPTURE_UID}"$'\t'"${DATABASE_CAPTURE_GID}"$'\t'"${DATABASE_CAPTURE_MODE}" ]] \
  || fail "SQLite held-inode metadata receipt has extra fields"
printf '%s\n' "${DATABASE_CAPTURE_RECORD}" | cmp -s - "${SNAPSHOT_DIR}/database-metadata.tsv" \
  || fail "SQLite held-inode metadata receipt does not match helper output"
sqlite3 "${SNAPSHOT_DIR}/kaios.db" "PRAGMA integrity_check;" > "${SNAPSHOT_DIR}/database-integrity.txt"
grep -qx 'ok' "${SNAPSHOT_DIR}/database-integrity.txt" || fail "Snapshot database integrity is not ok"
(cd "${SNAPSHOT_DIR}" && sha256sum kaios.db > kaios.db.sha256)

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

COMPOSE_IMAGE_BINDINGS="$(
  docker compose \
    --project-directory "${PROD_ROOT}" \
    --env-file "${PROD_ROOT}/.env.production" \
    -f "${PROD_ROOT}/docker-compose.production.yml" \
    config --format json |
    python3 -I -c '
import json
import re
import sys

payload = json.load(sys.stdin)
services = payload.get("services")
if not isinstance(services, dict):
    raise SystemExit("Production compose services are invalid")
by_container = {}
for service_name, service in services.items():
    if not isinstance(service_name, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,127}", service_name):
        raise SystemExit("Production compose service name is invalid")
    if not isinstance(service, dict):
        raise SystemExit("Production compose service is invalid")
    container_name = service.get("container_name")
    if container_name in {"kidults-gateway", "kidults-scheduler"}:
        image = service.get("image")
        if container_name in by_container or not isinstance(image, str) or not image or any(ch.isspace() for ch in image):
            raise SystemExit("Production compose image binding is invalid")
        by_container[container_name] = (service_name, image)
if set(by_container) != {"kidults-gateway", "kidults-scheduler"}:
    raise SystemExit("Production compose container set is invalid")
print(*by_container["kidults-gateway"], *by_container["kidults-scheduler"], sep="\t")
'
)" || fail "Production compose image bindings are invalid"
IFS=$'\t' read -r GATEWAY_SERVICE COMPOSE_GATEWAY_IMAGE_REF SCHEDULER_SERVICE COMPOSE_SCHEDULER_IMAGE_REF <<< "${COMPOSE_IMAGE_BINDINGS}"
[[ "${GATEWAY_IMAGE_REF}" == "${COMPOSE_GATEWAY_IMAGE_REF}" ]] || fail "Live gateway image reference does not match captured compose"
[[ "${SCHEDULER_IMAGE_REF}" == "${COMPOSE_SCHEDULER_IMAGE_REF}" ]] || fail "Live scheduler image reference does not match captured compose"

python3 -I - "${SNAPSHOT_DIR}/rollback-images.json" "${GATEWAY_IMAGE_ID}" "${GATEWAY_IMAGE_REF}" "${SCHEDULER_IMAGE_ID}" "${SCHEDULER_IMAGE_REF}" <<'PY'
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
(cd "${SNAPSHOT_DIR}" && sha256sum rollback-images.tar > rollback-images.tar.sha256)

cp -p "${PROD_ROOT}/.env.production" "${SNAPSHOT_DIR}/env.production.snapshot"
cp -p "${PROD_ROOT}/docker-compose.production.yml" "${SNAPSHOT_DIR}/docker-compose.production.yml"
(cd "${SNAPSHOT_DIR}" && sha256sum env.production.snapshot > env.production.snapshot.sha256)
(cd "${SNAPSHOT_DIR}" && sha256sum docker-compose.production.yml > docker-compose.production.yml.sha256)

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

python3 -I - "${SNAPSHOT_DIR}" "${SOURCE_SHA}" "${PROD_ROOT_REAL}" "${PROD_DB_REAL}" \
  "${GATEWAY_IMAGE_ID}" "${SCHEDULER_IMAGE_ID}" "${DATABASE_CAPTURED_AT}" <<'PY'
import hashlib
import json
import os
import stat
import sys
from datetime import datetime, timezone
from pathlib import Path

root = Path(sys.argv[1])
source_sha = sys.argv[2]
production_root = sys.argv[3]
production_database = sys.argv[4]
gateway_image_id = sys.argv[5]
scheduler_image_id = sys.argv[6]
database_captured_at = sys.argv[7]
files = {}
for path in sorted(root.iterdir()):
    metadata = path.lstat()
    if path.is_symlink() or not stat.S_ISREG(metadata.st_mode):
        raise SystemExit(f"unsafe snapshot member: {path.name}")
    files[path.name] = hashlib.sha256(path.read_bytes()).hexdigest()

minimum_required = {
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
missing = sorted(minimum_required - files.keys())
if missing:
    raise SystemExit(f"incomplete rollback snapshot: {missing}")
required = set(files)

manifest = {
    "id": "KIDULTS_PREDEPLOYMENT_SNAPSHOT_V1",
    "version": "1.0.0",
    "producer_id": "KIDULTS_PREDEPLOYMENT_SNAPSHOT_COLLECTOR_V1",
    "status": "captured",
    "vertical": "kidults",
    "captured_at": database_captured_at,
    "snapshot_completed_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    "source_sha": source_sha,
    "production_root": production_root,
    "production_database": production_database,
    "database_capture_method": "SQLITE_ONLINE_BACKUP_API",
    "database_integrity": "ok",
    "database_sha256": files["kaios.db"],
    "environment_sha256": files["env.production.snapshot"],
    "compose_sha256": files["docker-compose.production.yml"],
    "gateway_image_id": gateway_image_id,
    "scheduler_image_id": scheduler_image_id,
    "snapshot_directory": str(root.resolve()),
    "rollback_ready": True,
    "required_rollback_files": sorted(required),
    "production_change_executed": False,
    "artfund_change_executed": False,
    "files": files,
}
destination = root / "manifest.json"
encoded = (json.dumps(manifest, indent=2) + "\n").encode()
flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0)
descriptor = os.open(destination, flags, 0o600)
try:
    remaining = memoryview(encoded)
    while remaining:
        written = os.write(descriptor, remaining)
        if written <= 0:
            raise SystemExit("snapshot manifest write failed")
        remaining = remaining[written:]
    os.fsync(descriptor)
finally:
    os.close(descriptor)
directory_fd = os.open(root, os.O_RDONLY | os.O_DIRECTORY)
try:
    os.fsync(directory_fd)
finally:
    os.close(directory_fd)
print(json.dumps(manifest, indent=2))
PY

find "${SNAPSHOT_DIR}" -maxdepth 1 -type f -exec chmod 600 {} +
python3 -I - "${SNAPSHOT_DIR}" "${CERT_ROOT_REAL}" <<'PY'
import os
import stat
import sys
from pathlib import Path

root = Path(sys.argv[1])
root_fd = os.open(root, os.O_RDONLY | os.O_DIRECTORY | getattr(os, "O_NOFOLLOW", 0))
try:
    for name in sorted(os.listdir(root_fd)):
        descriptor = os.open(
            name,
            os.O_RDONLY | os.O_NONBLOCK | getattr(os, "O_NOFOLLOW", 0),
            dir_fd=root_fd,
        )
        try:
            metadata = os.fstat(descriptor)
            if not stat.S_ISREG(metadata.st_mode) or metadata.st_uid != 0 or stat.S_IMODE(metadata.st_mode) & 0o077:
                raise SystemExit(f"snapshot member is not immutable to non-root callers: {name}")
            os.fsync(descriptor)
        finally:
            os.close(descriptor)
    os.fsync(root_fd)
finally:
    os.close(root_fd)
certification_fd = os.open(sys.argv[2], os.O_RDONLY | os.O_DIRECTORY | getattr(os, "O_NOFOLLOW", 0))
try:
    os.fsync(certification_fd)
finally:
    os.close(certification_fd)
PY

echo "Kidults predeployment snapshot captured and rollback-ready: ${SNAPSHOT_DIR}"
