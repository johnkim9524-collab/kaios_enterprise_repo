#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$' \t\n'
PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
export PATH
readonly PATH
export LC_ALL=C TZ=UTC
unset BASH_ENV ENV NODE_OPTIONS NODE_PATH PYTHONHOME PYTHONPATH TAR_OPTIONS GZIP \
  GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_OBJECT_DIRECTORY GIT_ALTERNATE_OBJECT_DIRECTORIES \
  GIT_CONFIG_COUNT GIT_CONFIG_GLOBAL GIT_CONFIG_SYSTEM GIT_CONFIG_NOSYSTEM \
  GIT_SSL_NO_VERIFY GIT_SSL_CAINFO DOCKER_CONTEXT DOCKER_CONFIG DOCKER_CERT_PATH DOCKER_TLS_VERIFY \
  COMPOSE_FILE COMPOSE_PROJECT_NAME COMPOSE_PROFILES COMPOSE_ENV_FILES COMPOSE_PATH_SEPARATOR \
  LD_PRELOAD LD_LIBRARY_PATH
readonly DOCKER_HOST="unix:///var/run/docker.sock"
export DOCKER_HOST
umask 077

readonly ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd -P)"
readonly CANONICAL_PROD_ROOT="/opt/intelligence-holdings/kidults/app"
readonly CANONICAL_PROD_DB="/opt/intelligence-holdings/kidults/data/kaios.db"
readonly CANONICAL_REPOSITORY_ORIGIN="https://github.com/johnkim9524-collab/kaios_enterprise_repo.git"
PROD_ROOT="${PROD_ROOT:-${CANONICAL_PROD_ROOT}}"
EVIDENCE_ARCHIVE="${EVIDENCE_ARCHIVE:-}"
PREDEPLOYMENT_SNAPSHOT_DIR="${PREDEPLOYMENT_SNAPSHOT_DIR:-}"
readonly BASE_URL="https://kaios.kidults.com"
readonly CANONICAL_ADMIN_TOKEN_FILE="/opt/intelligence-holdings/kidults/secrets/kaios_admin_token"
ADMIN_TOKEN_FILE="${ADMIN_TOKEN_FILE:-${CANONICAL_ADMIN_TOKEN_FILE}}"
EXECUTE="${KAIOS_EXECUTE_PRODUCTION_PROMOTION:-false}"
ROLLBACK_SCRIPT="${ROOT_DIR}/scripts/production/rollback-kidults-controlled.sh"
PRODUCTION_RELEASE_GATE="${ROOT_DIR}/scripts/production/validate-kidults-production-release-v1.mjs"
CURRENT_SOLD_POLICY="${ROOT_DIR}/coordination/kidults/source-intelligence/current-sold-sample-governance-v1.json"
readonly PROTECTED_RELEASE_TRUST_ROOT="/etc/kaios/kidults-production-release"
readonly PROGRAM_OWNER_RELEASE_PUBLIC_KEY_FILE="${PROTECTED_RELEASE_TRUST_ROOT}/program-owner-ed25519-public.pem"
readonly PROGRAM_OWNER_RELEASE_KEY_ID_FILE="${PROTECTED_RELEASE_TRUST_ROOT}/program-owner-ed25519-key-id"
readonly RELEASE_EXECUTOR_PUBLIC_KEY_FILE="${PROTECTED_RELEASE_TRUST_ROOT}/release-executor-ed25519-public.pem"
readonly RELEASE_EXECUTOR_KEY_ID_FILE="${PROTECTED_RELEASE_TRUST_ROOT}/release-executor-ed25519-key-id"
readonly REPLAY_CONSUMPTION_ROOT="${PROTECTED_RELEASE_TRUST_ROOT}/replay-consumption"
readonly LOCAL_CONSUMPTION_MARKER_ROOT="/var/lib/kaios/kidults-production-release/consumed"
readonly ROLLBACK_PIN_ROOT="/var/lib/kaios/kidults-production-release/rollback-inputs"
ROLLBACK_ARMED=false
SMOKE_TEMP_DIR=""
TARGET_COMPOSE_OVERRIDE=""
TARGET_GATEWAY_SERVICE=""
TARGET_SCHEDULER_SERVICE=""
PREPARED_ROLLBACK_DIR=""
PREPARED_ROLLBACK_STABLE=""
ROLLBACK_PIN_ROOT_STABLE=""
ROLLBACK_PIN_ROOT_ID=""
PREPARED_ROLLBACK_ID=""
DEPLOYED_GATEWAY_CONTAINER_ID=""
DEPLOYED_SCHEDULER_CONTAINER_ID=""

fail() {
  echo "ERROR: $*" >&2
  if [[ "${ROLLBACK_ARMED}" == "true" ]]; then
    rollback_and_exit "EXPLICIT_FAILURE" 1
  fi
  exit 1
}

cleanup_smoke_files() {
  local cleanup_status=0
  if [[ -n "${SMOKE_TEMP_DIR}" && -d "${SMOKE_TEMP_DIR}" ]]; then
    rm -f -- "${SMOKE_TEMP_DIR}/health.json" "${SMOKE_TEMP_DIR}/portal.html" \
      "${SMOKE_TEMP_DIR}/unauth.json" "${SMOKE_TEMP_DIR}/auth.json" \
      "${SMOKE_TEMP_DIR}/admin-header" || cleanup_status=$?
    rmdir -- "${SMOKE_TEMP_DIR}" 2>/dev/null || true
  fi
  return "${cleanup_status}"
}

cleanup_target_override() {
  local cleanup_status=0
  if [[ -n "${TARGET_COMPOSE_OVERRIDE}" && -f "${TARGET_COMPOSE_OVERRIDE}" && ! -L "${TARGET_COMPOSE_OVERRIDE}" ]]; then
    rm -f -- "${TARGET_COMPOSE_OVERRIDE}" || cleanup_status=$?
  fi
  return "${cleanup_status}"
}

verify_protected_file() {
  local candidate="$1"
  local expected_parent="$2"
  python3 -I - "$candidate" "$expected_parent" <<'PY'
import stat
import sys
from pathlib import Path

candidate = Path(sys.argv[1])
expected_parent_path = Path(sys.argv[2])
expected_parent = expected_parent_path.resolve(strict=True)
if expected_parent_path.is_symlink() or expected_parent != expected_parent_path.absolute():
    raise SystemExit("PROTECTED_RELEASE_ROOT_PATH_MISMATCH")
if candidate.is_symlink() or not candidate.is_file():
    raise SystemExit("PROTECTED_RELEASE_FILE_NOT_REGULAR")
resolved = candidate.resolve(strict=True)
if resolved != candidate.absolute() or resolved.parent != expected_parent:
    raise SystemExit("PROTECTED_RELEASE_FILE_PATH_MISMATCH")
metadata = resolved.stat()
if metadata.st_uid != 0 or stat.S_IMODE(metadata.st_mode) & 0o022:
    raise SystemExit("PROTECTED_RELEASE_FILE_PERMISSIONS")
parent_metadata = expected_parent.stat()
if parent_metadata.st_uid != 0 or stat.S_IMODE(parent_metadata.st_mode) & 0o022:
    raise SystemExit("PROTECTED_RELEASE_ROOT_PERMISSIONS")
PY
}

verify_protected_directory() {
  local candidate="$1"
  python3 -I - "$candidate" <<'PY'
import os
import stat
import sys
from pathlib import Path

candidate = Path(sys.argv[1])
if not candidate.is_absolute() or os.path.normpath(str(candidate)) != str(candidate):
    raise SystemExit("PROTECTED_RELEASE_DIRECTORY_PATH_MISMATCH")
flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
descriptor = os.open("/", flags)
try:
    components = ["/", *candidate.parts[1:]]
    for index, component in enumerate(components):
        if index:
            next_descriptor = os.open(component, flags, dir_fd=descriptor)
            os.close(descriptor)
            descriptor = next_descriptor
        metadata = os.fstat(descriptor)
        if not stat.S_ISDIR(metadata.st_mode) or metadata.st_uid != 0 or stat.S_IMODE(metadata.st_mode) & 0o022:
            raise SystemExit(f"PROTECTED_RELEASE_DIRECTORY_ANCESTOR:{component}")
finally:
    os.close(descriptor)
PY
}

verify_protected_directory_fd() {
  local candidate="$1"
  local held_fd="$2"
  python3 -I - "$candidate" "$held_fd" <<'PY'
import os
import stat
import sys
from pathlib import Path

candidate = Path(sys.argv[1])
held_fd = int(sys.argv[2])
if not candidate.is_absolute() or os.path.normpath(str(candidate)) != str(candidate):
    raise SystemExit("PROTECTED_RELEASE_DIRECTORY_PATH_MISMATCH")
flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
descriptor = os.open("/", flags)
try:
    components = ["/", *candidate.parts[1:]]
    current = None
    for index, component in enumerate(components):
        if index:
            next_descriptor = os.open(component, flags, dir_fd=descriptor)
            os.close(descriptor)
            descriptor = next_descriptor
        current = os.fstat(descriptor)
        if not stat.S_ISDIR(current.st_mode) or current.st_uid != 0 or stat.S_IMODE(current.st_mode) & 0o022:
            raise SystemExit(f"PROTECTED_RELEASE_DIRECTORY_ANCESTOR:{component}")
    held = os.fstat(held_fd)
    if not stat.S_ISDIR(held.st_mode) or held.st_uid != 0 or stat.S_IMODE(held.st_mode) & 0o022:
        raise SystemExit("PROTECTED_RELEASE_DIRECTORY_HELD_FD")
    if current is None or (current.st_dev, current.st_ino) != (held.st_dev, held.st_ino):
        raise SystemExit("PROTECTED_RELEASE_DIRECTORY_STABLE_IDENTITY_MISMATCH")
    print(f"{held.st_dev}:{held.st_ino}")
finally:
    os.close(descriptor)
PY
}

file_sha256() {
  local candidate="$1"
  printf 'sha256:%s' "$(sha256sum "${candidate}" | awk '{print $1}')"
}

write_local_terminal_result() {
  local result="$1"
  local trigger="$2"
  python3 -I - "${CONSUMPTION_MARKER_DIR}" "${result}" "${trigger}" \
    "${CONSUMPTION_ID}" "${SOURCE_SHA}" "${SNAPSHOT_MANIFEST_SHA256}" \
    "${TARGET_GATEWAY_IMAGE_ID}" "${TARGET_SCHEDULER_IMAGE_ID}" \
    "${DEPLOYED_GATEWAY_CONTAINER_ID}" "${DEPLOYED_SCHEDULER_CONTAINER_ID}" \
    "${DEPLOYMENT_MANIFEST_SHA256}" <<'PY'
import ctypes
import errno
import json
import os
import secrets
import stat
import sys
from datetime import datetime, timezone
from pathlib import Path

allowed = {"PROMOTION_SUCCEEDED", "AUTOMATIC_ROLLBACK_SUCCEEDED", "AUTOMATIC_ROLLBACK_FAILED"}
if sys.argv[2] not in allowed:
    raise SystemExit("LOCAL_TERMINAL_RESULT_INVALID")
payload = {
    "id": "KIDULTS_LOCAL_PRODUCTION_RELEASE_TERMINAL_RESULT_V1",
    "version": "1.0.0",
    "result": sys.argv[2],
    "trigger": sys.argv[3],
    "observed_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    "consumption_id": sys.argv[4],
    "source_sha": sys.argv[5],
    "predeployment_snapshot_manifest_sha256": sys.argv[6],
    "target_gateway_image_id": sys.argv[7],
    "target_scheduler_image_id": sys.argv[8],
    "deployed_gateway_container_id": sys.argv[9] or None,
    "deployed_scheduler_container_id": sys.argv[10] or None,
    "deployment_manifest_sha256": sys.argv[11],
}
parent = Path(sys.argv[1])
if parent.is_symlink() or parent.resolve(strict=True) != parent.absolute():
    raise SystemExit("LOCAL_TERMINAL_RESULT_PARENT_UNSAFE")
encoded = (json.dumps(payload, indent=2) + "\n").encode()
parent_fd = os.open(parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
stale_temps = sorted(
    name for name in os.listdir(parent_fd)
    if name.startswith(".terminal-result.") and name.endswith(".tmp")
)
if stale_temps:
    os.close(parent_fd)
    raise SystemExit("LOCAL_TERMINAL_RESULT_STALE_TEMP_HOLD")
temporary_name = f".terminal-result.{secrets.token_hex(32)}.tmp"
descriptor = os.open(temporary_name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=parent_fd)
published = False
try:
    remaining = memoryview(encoded)
    while remaining:
        written = os.write(descriptor, remaining)
        if written <= 0:
            raise SystemExit("LOCAL_TERMINAL_RESULT_WRITE_FAILED")
        remaining = remaining[written:]
    os.fsync(descriptor)
    held = os.fstat(descriptor)
    entry = os.stat(temporary_name, dir_fd=parent_fd, follow_symlinks=False)
    if (
        not stat.S_ISREG(held.st_mode)
        or held.st_nlink != 1
        or stat.S_IMODE(held.st_mode) != 0o600
        or (held.st_dev, held.st_ino) != (entry.st_dev, entry.st_ino)
    ):
        raise SystemExit("LOCAL_TERMINAL_RESULT_TEMP_IDENTITY")
    # This fully-written, fsynced RENAME_NOREPLACE is the sole authoritative
    # terminal transition. It never creates an nlink=2 crash window.
    libc = ctypes.CDLL(None, use_errno=True)
    renameat2 = getattr(libc, "renameat2", None)
    if renameat2 is None:
        raise SystemExit("LOCAL_TERMINAL_RESULT_RENAME_NOREPLACE_REQUIRED")
    renameat2.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint]
    renameat2.restype = ctypes.c_int
    if renameat2(parent_fd, os.fsencode(temporary_name), parent_fd, b"terminal-result.json", 1) != 0:
        number = ctypes.get_errno()
        if number == errno.EEXIST:
            raise SystemExit("LOCAL_TERMINAL_RESULT_ALREADY_EXISTS")
        raise OSError(number, os.strerror(number))
    final = os.stat("terminal-result.json", dir_fd=parent_fd, follow_symlinks=False)
    if (final.st_dev, final.st_ino) != (held.st_dev, held.st_ino) or final.st_nlink != 1:
        raise SystemExit("LOCAL_TERMINAL_RESULT_PUBLISHED_IDENTITY")
    os.fsync(parent_fd)
    published = True
finally:
    os.close(descriptor)
    try:
        os.unlink(temporary_name, dir_fd=parent_fd)
        os.fsync(parent_fd)
    except FileNotFoundError:
        pass
    os.close(parent_fd)
if not published:
    raise SystemExit("LOCAL_TERMINAL_RESULT_NOT_PUBLISHED")
PY
}

terminal_promotion_success_is_authoritative() {
  [[ -n "${CONSUMPTION_MARKER_DIR:-}" ]] || return 1
  python3 -I - "${CONSUMPTION_MARKER_DIR}" "${CONSUMPTION_ID}" "${SOURCE_SHA}" \
    "${SNAPSHOT_MANIFEST_SHA256}" "${TARGET_GATEWAY_IMAGE_ID}" \
    "${TARGET_SCHEDULER_IMAGE_ID}" "${DEPLOYED_GATEWAY_CONTAINER_ID}" \
    "${DEPLOYED_SCHEDULER_CONTAINER_ID}" "${DEPLOYMENT_MANIFEST_SHA256}" <<'PY'
import datetime as dt
import json
import os
import re
import stat
import sys

parent_fd = os.open(sys.argv[1], os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
try:
    # A signal may terminate the publisher after RENAME_NOREPLACE but before its
    # directory fsync. The handler must establish that durability itself before
    # treating a visible success marker as rollback-disarm authority.
    parent_fsync_failed = False
    try:
        os.fsync(parent_fd)
    except OSError:
        # RENAME_NOREPLACE may already have made an exact success marker
        # visible.  Validate that marker before deciding whether rollback is
        # still permissible; never create a contradictory rollback outcome.
        parent_fsync_failed = True
    # Never let a special-file collision block the signal/error handler.  Open
    # nonblocking, then accept only the exact regular single-link marker below.
    descriptor = os.open(
        "terminal-result.json",
        os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK,
        dir_fd=parent_fd,
    )
    try:
        metadata_before = os.fstat(descriptor)
        entry_before = os.stat("terminal-result.json", dir_fd=parent_fd, follow_symlinks=False)
        raw = b""
        while True:
            block = os.read(descriptor, 1024 * 1024)
            if not block:
                break
            raw += block
            if len(raw) > 1024 * 1024:
                raise SystemExit(1)
        metadata_after = os.fstat(descriptor)
        entry_after = os.stat("terminal-result.json", dir_fd=parent_fd, follow_symlinks=False)
        payload = json.loads(raw.decode("utf-8"))
        if not isinstance(payload, dict):
            raise SystemExit(1)
        expected_keys = {
            "id", "version", "result", "trigger", "observed_at", "consumption_id",
            "source_sha", "predeployment_snapshot_manifest_sha256",
            "target_gateway_image_id", "target_scheduler_image_id",
            "deployed_gateway_container_id", "deployed_scheduler_container_id",
            "deployment_manifest_sha256",
        }
        try:
            observed_at = dt.datetime.fromisoformat(str(payload.get("observed_at", "")).replace("Z", "+00:00"))
            strict_utc_observed_at = (
                isinstance(payload.get("observed_at"), str)
                and payload["observed_at"].endswith("Z")
                and observed_at.tzinfo is not None
                and observed_at.utcoffset() == dt.timedelta(0)
            )
        except (TypeError, ValueError):
            strict_utc_observed_at = False
        stable_fields = (
            "st_dev", "st_ino", "st_size", "st_mtime_ns", "st_ctime_ns",
            "st_nlink", "st_uid", "st_gid", "st_mode",
        )
        checks = [
            set(payload) == expected_keys,
            stat.S_ISREG(metadata_before.st_mode), metadata_before.st_nlink == 1,
            stat.S_IMODE(metadata_before.st_mode) == 0o600,
            (metadata_before.st_dev, metadata_before.st_ino) == (entry_before.st_dev, entry_before.st_ino),
            tuple(getattr(metadata_before, field) for field in stable_fields)
            == tuple(getattr(metadata_after, field) for field in stable_fields),
            (metadata_after.st_dev, metadata_after.st_ino) == (entry_after.st_dev, entry_after.st_ino),
            len(raw) == metadata_before.st_size,
            payload.get("id") == "KIDULTS_LOCAL_PRODUCTION_RELEASE_TERMINAL_RESULT_V1",
            payload.get("version") == "1.0.0",
            payload.get("result") == "PROMOTION_SUCCEEDED",
            payload.get("trigger") == "POST_DEPLOYMENT_SMOKE_PASS",
            strict_utc_observed_at,
            payload.get("consumption_id") == sys.argv[2],
            payload.get("source_sha") == sys.argv[3],
            payload.get("predeployment_snapshot_manifest_sha256") == sys.argv[4],
            payload.get("target_gateway_image_id") == sys.argv[5],
            payload.get("target_scheduler_image_id") == sys.argv[6],
            payload.get("deployed_gateway_container_id") == sys.argv[7],
            payload.get("deployed_scheduler_container_id") == sys.argv[8],
            re.fullmatch(r"[0-9a-f]{64}", sys.argv[7]) is not None,
            re.fullmatch(r"[0-9a-f]{64}", sys.argv[8]) is not None,
            sys.argv[7] != sys.argv[8],
            payload.get("deployment_manifest_sha256") == sys.argv[9],
        ]
        if not all(checks):
            raise SystemExit(1)
        # 75 is a distinct fail-closed state: exact success is already visible,
        # but this handler could not independently attest directory durability.
        # The caller must HOLD without rollback because rollback may only occur
        # before the atomic success publication boundary.
        raise SystemExit(75 if parent_fsync_failed else 0)
    finally:
        os.close(descriptor)
finally:
    os.close(parent_fd)
PY
}

rollback_and_exit() {
  # Once any failure/signal enters containment, a second ERR/INT/TERM must not
  # restore default process termination before the bound rollback or exact
  # terminal authority decision.  The bound rollback child inherits the
  # ignored dispositions for this bounded containment invocation.
  trap '' ERR INT TERM
  local trigger="$1"
  local original_code="$2"
  local rollback_code=0
  local terminal_authority_code=0
  if ! cleanup_smoke_files; then
    echo "WARNING: smoke-file cleanup failed; rollback decision continues." >&2
  fi
  if ! cleanup_target_override; then
    echo "WARNING: target-override cleanup failed; rollback decision continues." >&2
  fi

  if terminal_promotion_success_is_authoritative; then
    ROLLBACK_ARMED=false
    echo "Promotion success is already durably committed; rollback signal is ignored." >&2
    exit "${original_code}"
  else
    terminal_authority_code=$?
  fi
  if [[ "${terminal_authority_code}" -eq 75 ]]; then
    echo "CRITICAL: exact promotion success is atomically visible but directory durability could not be re-attested; rollback is forbidden and operator HOLD is required." >&2
    exit 93
  fi

  if [[ "${ROLLBACK_ARMED}" == "true" ]]; then
    echo "Production mutation failed after rollback arm; executing bound rollback. trigger=${trigger}" >&2
    set +e
    KAIOS_EXECUTE_PRODUCTION_ROLLBACK=true \
      ROLLBACK_TRIGGER="${trigger}" \
      ROOT_DIR="${ROOT_DIR}" \
      PROD_ROOT="${PROD_ROOT}" \
      PREDEPLOYMENT_SNAPSHOT_DIR="${PREPARED_ROLLBACK_DIR}" \
      EXPECTED_PREDEPLOYMENT_SNAPSHOT_MANIFEST_SHA256="${SNAPSHOT_MANIFEST_SHA256}" \
      KIDULTS_ROLLBACK_AUTHORIZATION_FILE="${CONSUMPTION_MARKER_DIR}/local-consumption.json" \
      KIDULTS_PREPARED_ROLLBACK_DIR="${PREPARED_ROLLBACK_DIR}" \
      bash "${ROLLBACK_SCRIPT}"
    rollback_code=$?
    set -e
    if [[ "${rollback_code}" -ne 0 ]]; then
      write_local_terminal_result "AUTOMATIC_ROLLBACK_FAILED" "${trigger}" || {
        echo "CRITICAL: automatic rollback failed and its local terminal evidence could not be persisted." >&2
        exit 92
      }
      echo "CRITICAL: automatic Production rollback failed. rollback_code=${rollback_code}" >&2
      exit 90
    fi
    write_local_terminal_result "AUTOMATIC_ROLLBACK_SUCCEEDED" "${trigger}" || {
      echo "CRITICAL: rollback succeeded but terminal evidence could not be persisted." >&2
      exit 91
    }
    echo "Automatic Production rollback completed successfully." >&2
  fi

  exit "${original_code}"
}

on_error() {
  local code=$?
  rollback_and_exit "ERR" "${code}"
}

trap on_error ERR
trap 'rollback_and_exit SIGINT 130' INT
trap 'rollback_and_exit SIGTERM 143' TERM

test -n "${EVIDENCE_ARCHIVE}" || fail "EVIDENCE_ARCHIVE is required"
test -f "${EVIDENCE_ARCHIVE}" || fail "Evidence archive not found"
test -f "${EVIDENCE_ARCHIVE}.sha256" || fail "Evidence checksum not found"
test -f "${EVIDENCE_ARCHIVE}.manifest.json" || fail "Evidence manifest not found"
test -n "${PREDEPLOYMENT_SNAPSHOT_DIR}" || fail "PREDEPLOYMENT_SNAPSHOT_DIR is required"
test -f "${PREDEPLOYMENT_SNAPSHOT_DIR}/manifest.json" || fail "Predeployment snapshot manifest not found"
test -f "${ROLLBACK_SCRIPT}" || fail "Rollback executor missing"
test -f "${PRODUCTION_RELEASE_GATE}" || fail "Production release gate missing"
test -f "${CURRENT_SOLD_POLICY}" || fail "Current-SOLD policy missing"
command -v git >/dev/null || fail "git is required"
command -v node >/dev/null || fail "node is required"
command -v python3 >/dev/null || fail "python3 is required"
command -v sha256sum >/dev/null || fail "sha256sum is required"
command -v timeout >/dev/null || fail "timeout is required"
command -v curl >/dev/null || fail "curl is required"
command -v sqlite3 >/dev/null || fail "sqlite3 is required"

test -d "${PROTECTED_RELEASE_TRUST_ROOT}" || fail "Protected release trust root is missing"
test -d "${REPLAY_CONSUMPTION_ROOT}" || fail "Protected replay-consumption root is missing"
verify_protected_file "${PROGRAM_OWNER_RELEASE_PUBLIC_KEY_FILE}" "${PROTECTED_RELEASE_TRUST_ROOT}" || fail "Protected Program Owner public key is invalid"
verify_protected_file "${PROGRAM_OWNER_RELEASE_KEY_ID_FILE}" "${PROTECTED_RELEASE_TRUST_ROOT}" || fail "Protected Program Owner key fingerprint is invalid"
verify_protected_file "${RELEASE_EXECUTOR_PUBLIC_KEY_FILE}" "${PROTECTED_RELEASE_TRUST_ROOT}" || fail "Protected release-executor public key is invalid"
verify_protected_file "${RELEASE_EXECUTOR_KEY_ID_FILE}" "${PROTECTED_RELEASE_TRUST_ROOT}" || fail "Protected release-executor key fingerprint is invalid"

PROGRAM_OWNER_RELEASE_EXPECTED_KEY_ID="$(tr -d '\r\n' < "${PROGRAM_OWNER_RELEASE_KEY_ID_FILE}")"
[[ "${PROGRAM_OWNER_RELEASE_EXPECTED_KEY_ID}" =~ ^sha256:[0-9a-f]{64}$ ]] || fail "Protected Program Owner key fingerprint format is invalid"
ACTUAL_OWNER_KEY_ID="$(
  node - "${PROGRAM_OWNER_RELEASE_PUBLIC_KEY_FILE}" <<'NODE'
const crypto = require('node:crypto');
const fs = require('node:fs');
const key = crypto.createPublicKey(fs.readFileSync(process.argv[2]));
if (key.asymmetricKeyType !== 'ed25519') process.exit(65);
const der = key.export({ type: 'spki', format: 'der' });
process.stdout.write(`sha256:${crypto.createHash('sha256').update(der).digest('hex')}`);
NODE
)" || fail "Protected Program Owner public key is not valid Ed25519"
test "${ACTUAL_OWNER_KEY_ID}" = "${PROGRAM_OWNER_RELEASE_EXPECTED_KEY_ID}" || fail "Protected Program Owner key fingerprint mismatch"

RELEASE_EXECUTOR_EXPECTED_KEY_ID="$(tr -d '\r\n' < "${RELEASE_EXECUTOR_KEY_ID_FILE}")"
[[ "${RELEASE_EXECUTOR_EXPECTED_KEY_ID}" =~ ^sha256:[0-9a-f]{64}$ ]] || fail "Protected release-executor key fingerprint format is invalid"
ACTUAL_EXECUTOR_KEY_ID="$(
  node - "${RELEASE_EXECUTOR_PUBLIC_KEY_FILE}" <<'NODE'
const crypto = require('node:crypto');
const fs = require('node:fs');
const key = crypto.createPublicKey(fs.readFileSync(process.argv[2]));
if (key.asymmetricKeyType !== 'ed25519') process.exit(65);
const der = key.export({ type: 'spki', format: 'der' });
process.stdout.write(`sha256:${crypto.createHash('sha256').update(der).digest('hex')}`);
NODE
)" || fail "Protected release-executor public key is not valid Ed25519"
test "${ACTUAL_EXECUTOR_KEY_ID}" = "${RELEASE_EXECUTOR_EXPECTED_KEY_ID}" || fail "Protected release-executor key fingerprint mismatch"
test "${RELEASE_EXECUTOR_EXPECTED_KEY_ID}" != "${PROGRAM_OWNER_RELEASE_EXPECTED_KEY_ID}" || fail "Program Owner and release-executor trust roots must be independent"

SOURCE_SHA="$(git -C "${ROOT_DIR}" rev-parse HEAD)"
[[ "${SOURCE_SHA}" =~ ^[0-9a-f]{40}$ ]] || fail "Current source SHA is invalid"
git -C "${ROOT_DIR}" diff --quiet || fail "Tracked worktree changes are forbidden for Production promotion"
git -C "${ROOT_DIR}" diff --cached --quiet || fail "Staged worktree changes are forbidden for Production promotion"

EXPECTED_ARCHIVE_SHA256="$(awk 'NR == 1 { print $1 }' "${EVIDENCE_ARCHIVE}.sha256")"
[[ "${EXPECTED_ARCHIVE_SHA256}" =~ ^[0-9a-f]{64}$ ]] || fail "Evidence checksum format is invalid"
ACTUAL_ARCHIVE_SHA256="$(sha256sum "${EVIDENCE_ARCHIVE}" | awk '{print $1}')"
[[ "${ACTUAL_ARCHIVE_SHA256}" == "${EXPECTED_ARCHIVE_SHA256}" ]] || fail "Evidence archive checksum mismatch"
ARCHIVE_SHA256="sha256:${ACTUAL_ARCHIVE_SHA256}"
REPLAY_CONSUMPTION_ATTESTATION_FILE="${REPLAY_CONSUMPTION_ROOT}/${ACTUAL_ARCHIVE_SHA256}.json"
verify_protected_file "${REPLAY_CONSUMPTION_ATTESTATION_FILE}" "${REPLAY_CONSUMPTION_ROOT}" || fail "Protected replay-consumption attestation is missing or invalid"
SNAPSHOT_MANIFEST_SHA256="sha256:$(sha256sum "${PREDEPLOYMENT_SNAPSHOT_DIR}/manifest.json" | awk '{print $1}')"
[[ "${SNAPSHOT_MANIFEST_SHA256}" =~ ^sha256:[0-9a-f]{64}$ ]] || fail "Predeployment snapshot manifest digest is invalid"

IFS=$'\t' read -r CONSUMPTION_ID ATTESTED_REPOSITORY ATTESTED_ENVIRONMENT EVIDENCE_RUN_ID EVIDENCE_RUN_ATTEMPT \
  EVIDENCE_ARTIFACT_ID EVIDENCE_ARTIFACT_NAME EVIDENCE_ARTIFACT_SHA256 EXECUTOR_RUN_ID EXECUTOR_RUN_ATTEMPT \
  ATTESTATION_CONSUMED_AT OWNER_RECEIPT_ID OWNER_RECEIPT_CANONICAL_SHA256 RELEASE_NONCE NONCE_STORE_KEY \
  NONCE_STORE_RECEIPT_SHA256 TARGET_GATEWAY_IMAGE_ID TARGET_SCHEDULER_IMAGE_ID DEPLOYMENT_MANIFEST_SHA256 < <(
  python3 -I - "${REPLAY_CONSUMPTION_ATTESTATION_FILE}" <<'PY'
import json
import re
import sys
from pathlib import Path

attestation = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
fields = [
    attestation.get("consumption_id"),
    attestation.get("repository"),
    attestation.get("protected_environment"),
    attestation.get("evidence_run_id"),
    attestation.get("evidence_run_attempt"),
    attestation.get("artifact_id"),
    attestation.get("artifact_name"),
    attestation.get("artifact_sha256"),
    attestation.get("executor_run_id"),
    attestation.get("executor_run_attempt"),
    attestation.get("consumed_at"),
    attestation.get("owner_receipt_id"),
    attestation.get("owner_receipt_canonical_sha256"),
    attestation.get("release_nonce"),
    attestation.get("nonce_store_key"),
    attestation.get("nonce_store_receipt_sha256"),
    attestation.get("target_gateway_image_id"),
    attestation.get("target_scheduler_image_id"),
    attestation.get("deployment_manifest_sha256"),
]
if not isinstance(fields[0], str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._:-]{0,127}", fields[0]):
    raise SystemExit("PROTECTED_EXECUTOR_CONSUMPTION_ID")
if fields[1] != "johnkim9524-collab/kaios_enterprise_repo" or fields[2] != "kidults-production-release":
    raise SystemExit("PROTECTED_EXECUTOR_CONTEXT_SCOPE")
if not all(re.fullmatch(r"[1-9][0-9]*", str(fields[index])) for index in (3, 4, 5, 8, 9)):
    raise SystemExit("PROTECTED_EXECUTOR_CONTEXT_RUN_ID")
if not isinstance(fields[6], str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._:-]{0,127}", fields[6]):
    raise SystemExit("PROTECTED_EXECUTOR_CONTEXT_ARTIFACT_NAME")
if not isinstance(fields[7], str) or not re.fullmatch(r"sha256:[0-9a-f]{64}", fields[7]):
    raise SystemExit("PROTECTED_EXECUTOR_CONTEXT_ARTIFACT_DIGEST")
if not isinstance(fields[10], str) or not re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}T[^\t\r\n]+Z", fields[10]):
    raise SystemExit("PROTECTED_EXECUTOR_CONSUMED_AT")
if not isinstance(fields[11], str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._:-]{0,127}", fields[11]):
    raise SystemExit("PROTECTED_EXECUTOR_OWNER_RECEIPT_ID")
if not isinstance(fields[13], str) or not re.fullmatch(r"[A-Za-z0-9._:-]{32,128}", fields[13]):
    raise SystemExit("PROTECTED_EXECUTOR_RELEASE_NONCE")
for index in (12, 14, 15, 16, 17, 18):
    if not isinstance(fields[index], str) or not re.fullmatch(r"sha256:[0-9a-f]{64}", fields[index]):
        raise SystemExit("PROTECTED_EXECUTOR_DIGEST_BINDING")
print(*fields, sep="\t")
PY
)
test -n "${CONSUMPTION_ID}" || fail "Protected executor context is missing"
test "${CONSUMPTION_ID}" = "${NONCE_STORE_KEY}" || fail "Consumption identity is not bound to the owner nonce-store key"
NONCE_STORE_RECEIPT_FILE="${REPLAY_CONSUMPTION_ROOT}/${NONCE_STORE_KEY#sha256:}.nonce-store-receipt.json"
verify_protected_file "${NONCE_STORE_RECEIPT_FILE}" "${REPLAY_CONSUMPTION_ROOT}" || fail "Protected external nonce-store receipt is missing or invalid"
test "$(file_sha256 "${NONCE_STORE_RECEIPT_FILE}")" = "${NONCE_STORE_RECEIPT_SHA256}" || fail "Protected external nonce-store receipt digest mismatch"

verify_release_gate() {
  node "${PRODUCTION_RELEASE_GATE}" verify-sealed-release \
    --archive "${EVIDENCE_ARCHIVE}" \
    --manifest "${EVIDENCE_ARCHIVE}.manifest.json" \
    --owner-public-key "${PROGRAM_OWNER_RELEASE_PUBLIC_KEY_FILE}" \
    --executor-public-key "${RELEASE_EXECUTOR_PUBLIC_KEY_FILE}" \
    --expected-owner-key-id "${PROGRAM_OWNER_RELEASE_EXPECTED_KEY_ID}" \
    --expected-executor-key-id "${RELEASE_EXECUTOR_EXPECTED_KEY_ID}" \
    --consumption-attestation "${REPLAY_CONSUMPTION_ATTESTATION_FILE}" \
    --repository "${ATTESTED_REPOSITORY}" \
    --protected-environment "${ATTESTED_ENVIRONMENT}" \
    --evidence-run-id "${EVIDENCE_RUN_ID}" \
    --evidence-run-attempt "${EVIDENCE_RUN_ATTEMPT}" \
    --artifact-id "${EVIDENCE_ARTIFACT_ID}" \
    --artifact-name "${EVIDENCE_ARTIFACT_NAME}" \
    --artifact-sha256 "${EVIDENCE_ARTIFACT_SHA256}" \
    --executor-run-id "${EXECUTOR_RUN_ID}" \
    --executor-run-attempt "${EXECUTOR_RUN_ATTEMPT}" \
    --policy "${CURRENT_SOLD_POLICY}" \
    --execution-mode CONTROLLED_PRODUCTION_PROMOTION \
    --predeployment-snapshot-manifest-sha256 "${SNAPSHOT_MANIFEST_SHA256}" \
    --target-gateway-image-id "${TARGET_GATEWAY_IMAGE_ID}" \
    --target-scheduler-image-id "${TARGET_SCHEDULER_IMAGE_ID}" \
    --deployment-manifest-sha256 "${DEPLOYMENT_MANIFEST_SHA256}" \
    --nonce-store-receipt "${NONCE_STORE_RECEIPT_FILE}" \
    --expected-source-sha "${SOURCE_SHA}"
}

verify_release_gate

test -f "${PROD_ROOT}/.env.production" || fail "Production environment file missing"
test -f "${PROD_ROOT}/docker-compose.production.yml" || fail "Production compose file missing"
test -f "${CANONICAL_PROD_DB}" || fail "Production database file missing"
PROD_ROOT_REAL="$(realpath -e -- "${PROD_ROOT}")"
PROD_DB_REAL="$(realpath -e -- "${CANONICAL_PROD_DB}")"
SNAPSHOT_DIR_REAL="$(realpath -e -- "${PREDEPLOYMENT_SNAPSHOT_DIR}")"

verify_snapshot_binding() {
  local current_prod_env_sha256
  local current_prod_compose_sha256
  current_prod_env_sha256="$(sha256sum "${PROD_ROOT}/.env.production" | awk '{print $1}')"
  current_prod_compose_sha256="$(sha256sum "${PROD_ROOT}/docker-compose.production.yml" | awk '{print $1}')"
  [[ "sha256:${current_prod_compose_sha256}" == "${DEPLOYMENT_MANIFEST_SHA256}" ]] || fail "Production deployment manifest does not match Program Owner authorization"
  python3 -I - "${PREDEPLOYMENT_SNAPSHOT_DIR}/manifest.json" "${SOURCE_SHA}" "${PROD_ROOT_REAL}" \
    "${PROD_DB_REAL}" "${SNAPSHOT_DIR_REAL}" "${current_prod_env_sha256}" \
    "${current_prod_compose_sha256}" "${ATTESTATION_CONSUMED_AT}" <<'PY'
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

snapshot = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
checks = [
    (snapshot.get("id") == "KIDULTS_PREDEPLOYMENT_SNAPSHOT_V1", "SNAPSHOT_IDENTITY"),
    (snapshot.get("version") == "1.0.0", "SNAPSHOT_VERSION"),
    (snapshot.get("producer_id") == "KIDULTS_PREDEPLOYMENT_SNAPSHOT_COLLECTOR_V1", "SNAPSHOT_PRODUCER"),
    (snapshot.get("status") == "captured", "SNAPSHOT_STATUS"),
    (snapshot.get("vertical") == "kidults", "SNAPSHOT_VERTICAL"),
    (snapshot.get("source_sha") == sys.argv[2], "SNAPSHOT_SOURCE_SHA"),
    (snapshot.get("production_root") == sys.argv[3], "SNAPSHOT_PRODUCTION_ROOT"),
    (snapshot.get("production_database") == sys.argv[4], "SNAPSHOT_PRODUCTION_DATABASE"),
    (snapshot.get("snapshot_directory") == sys.argv[5], "SNAPSHOT_DIRECTORY"),
    (snapshot.get("environment_sha256") == sys.argv[6], "SNAPSHOT_LIVE_ENV_DIGEST"),
    (snapshot.get("compose_sha256") == sys.argv[7], "SNAPSHOT_LIVE_COMPOSE_DIGEST"),
    (snapshot.get("rollback_ready") is True, "SNAPSHOT_ROLLBACK_READY"),
    (snapshot.get("production_change_executed") is False, "SNAPSHOT_PRODUCTION_CHANGE"),
    (snapshot.get("artfund_change_executed") is False, "SNAPSHOT_ARTFUND_CHANGE"),
]
for passed, code in checks:
    if not passed:
        raise SystemExit(code)

def parse_utc(value, code):
    if not isinstance(value, str) or not value.endswith("Z"):
        raise SystemExit(code)
    try:
        parsed = datetime.fromisoformat(value[:-1] + "+00:00")
    except ValueError as error:
        raise SystemExit(code) from error
    if parsed.tzinfo is None:
        raise SystemExit(code)
    return parsed.astimezone(timezone.utc)

captured_at = parse_utc(snapshot.get("captured_at"), "SNAPSHOT_CAPTURED_AT")
consumed_at = parse_utc(sys.argv[8], "ATTESTATION_CONSUMED_AT")
now = datetime.now(timezone.utc)
if captured_at > consumed_at:
    raise SystemExit("SNAPSHOT_CAPTURED_AFTER_CONSUMPTION")
if (consumed_at - captured_at).total_seconds() > 3600:
    raise SystemExit("SNAPSHOT_STALE_AT_CONSUMPTION")
age_seconds = (now - captured_at).total_seconds()
if age_seconds < -300 or age_seconds > 3600:
    raise SystemExit("SNAPSHOT_NOT_FRESH_FOR_PROMOTION")
print("Rollback-ready predeployment snapshot verified.")
PY
}

verify_snapshot_binding

PROD_SOURCE_SHA="$(git -C "${PROD_ROOT}" rev-parse HEAD 2>/dev/null)" || fail "Production root is not an exact Git checkout"
[[ "${PROD_SOURCE_SHA}" == "${SOURCE_SHA}" ]] || fail "Production runtime source does not match signed release source SHA"
git -C "${PROD_ROOT}" diff --quiet || fail "Tracked Production runtime changes are forbidden"
git -C "${PROD_ROOT}" diff --cached --quiet || fail "Staged Production runtime changes are forbidden"

verify_target_images() {
  local image_bindings
  local gateway_service
  local gateway_image_ref
  local scheduler_service
  local scheduler_image_ref
  local actual_gateway_image_id
  local actual_scheduler_image_id
  image_bindings="$(
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
    raise SystemExit("PRODUCTION_COMPOSE_SERVICES_INVALID")
by_container = {}
for service_name, service in services.items():
    if not isinstance(service, dict):
        raise SystemExit("PRODUCTION_COMPOSE_SERVICE_INVALID")
    if not isinstance(service_name, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,127}", service_name):
        raise SystemExit("PRODUCTION_COMPOSE_SERVICE_NAME_INVALID")
    container_name = service.get("container_name")
    if container_name in {"kidults-gateway", "kidults-scheduler"}:
        if container_name in by_container:
            raise SystemExit("PRODUCTION_COMPOSE_CONTAINER_DUPLICATE")
        image = service.get("image")
        if not isinstance(image, str) or not image or any(ch.isspace() for ch in image):
            raise SystemExit("PRODUCTION_COMPOSE_IMAGE_REF_INVALID")
        by_container[container_name] = (service_name, image)
if set(by_container) != {"kidults-gateway", "kidults-scheduler"}:
    raise SystemExit("PRODUCTION_COMPOSE_CONTAINER_SET_INVALID")
print(*by_container["kidults-gateway"], *by_container["kidults-scheduler"], sep="\t")
'
  )" || fail "Production compose target-image bindings are invalid"
  IFS=$'\t' read -r gateway_service gateway_image_ref scheduler_service scheduler_image_ref <<< "${image_bindings}"
  actual_gateway_image_id="$(docker image inspect --format '{{.Id}}' "${gateway_image_ref}")" || fail "Signed gateway target image is not present locally"
  actual_scheduler_image_id="$(docker image inspect --format '{{.Id}}' "${scheduler_image_ref}")" || fail "Signed scheduler target image is not present locally"
  [[ "${actual_gateway_image_id}" =~ ^sha256:[0-9a-f]{64}$ ]] || fail "Gateway target image ID is invalid"
  [[ "${actual_scheduler_image_id}" =~ ^sha256:[0-9a-f]{64}$ ]] || fail "Scheduler target image ID is invalid"
  [[ "${actual_gateway_image_id}" == "${TARGET_GATEWAY_IMAGE_ID}" ]] || fail "Gateway target image does not match the signed executor attestation"
  [[ "${actual_scheduler_image_id}" == "${TARGET_SCHEDULER_IMAGE_ID}" ]] || fail "Scheduler target image does not match the signed executor attestation"
  TARGET_GATEWAY_SERVICE="${gateway_service}"
  TARGET_SCHEDULER_SERVICE="${scheduler_service}"
}

verify_predeployment_runtime_binding() {
  local snapshot_image_ids
  local snapshot_gateway_image_id
  local snapshot_scheduler_image_id
  local live_gateway_image_id
  local live_scheduler_image_id
  snapshot_image_ids="$(
    python3 -I - "${PREDEPLOYMENT_SNAPSHOT_DIR}/manifest.json" <<'PY'
import json
import re
import sys
from pathlib import Path

manifest = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
values = (manifest.get("gateway_image_id"), manifest.get("scheduler_image_id"))
if not all(isinstance(value, str) and re.fullmatch(r"sha256:[0-9a-f]{64}", value) for value in values):
    raise SystemExit("SNAPSHOT_ROLLBACK_IMAGE_BINDING_INVALID")
print(*values, sep="\t")
PY
  )" || fail "Snapshot rollback image bindings are invalid"
  IFS=$'\t' read -r snapshot_gateway_image_id snapshot_scheduler_image_id <<< "${snapshot_image_ids}"
  live_gateway_image_id="$(docker inspect -f '{{.Image}}' kidults-gateway)" || fail "Predeployment gateway container is not inspectable"
  live_scheduler_image_id="$(docker inspect -f '{{.Image}}' kidults-scheduler)" || fail "Predeployment scheduler container is not inspectable"
  [[ "${live_gateway_image_id}" == "${snapshot_gateway_image_id}" ]] || fail "Snapshot does not bind the immediate predeployment gateway image"
  [[ "${live_scheduler_image_id}" == "${snapshot_scheduler_image_id}" ]] || fail "Snapshot does not bind the immediate predeployment scheduler image"
}

create_pinned_target_override() {
  verify_protected_directory /run || fail "Protected runtime directory is unavailable"
  TARGET_COMPOSE_OVERRIDE="$(mktemp /run/kidults-promotion-target.XXXXXX.json)"
  chmod 600 "${TARGET_COMPOSE_OVERRIDE}"
  python3 -I - "${TARGET_COMPOSE_OVERRIDE}" "${TARGET_GATEWAY_SERVICE}" "${TARGET_GATEWAY_IMAGE_ID}" \
    "${TARGET_SCHEDULER_SERVICE}" "${TARGET_SCHEDULER_IMAGE_ID}" <<'PY'
import json
import os
import sys
from pathlib import Path

destination = Path(sys.argv[1])
payload = {
    "services": {
        sys.argv[2]: {"image": sys.argv[3], "build": None},
        sys.argv[4]: {"image": sys.argv[5], "build": None},
    }
}
with destination.open("w", encoding="utf-8") as handle:
    json.dump(payload, handle, indent=2)
    handle.write("\n")
    handle.flush()
    os.fsync(handle.fileno())
directory_fd = os.open(destination.parent, os.O_RDONLY | os.O_DIRECTORY)
try:
    os.fsync(directory_fd)
finally:
    os.close(directory_fd)
PY
}

verify_pinned_target_config() {
  [[ -n "${TARGET_COMPOSE_OVERRIDE}" && -f "${TARGET_COMPOSE_OVERRIDE}" && ! -L "${TARGET_COMPOSE_OVERRIDE}" ]] || fail "Pinned target override is missing or unsafe"
  docker compose \
    --project-directory "${PROD_ROOT}" \
    --env-file "${PROD_ROOT}/.env.production" \
    -f "${PROD_ROOT}/docker-compose.production.yml" \
    -f "${TARGET_COMPOSE_OVERRIDE}" \
    config --format json |
    python3 -I -c '
import json
import sys

payload = json.load(sys.stdin)
services = payload.get("services") or {}
expected = {sys.argv[1]: sys.argv[2], sys.argv[3]: sys.argv[4]}
for name, image in expected.items():
    service = services.get(name)
    if not isinstance(service, dict) or service.get("image") != image or service.get("build") is not None:
        raise SystemExit("PINNED_PRODUCTION_TARGET_CONFIG_MISMATCH")
' "${TARGET_GATEWAY_SERVICE}" "${TARGET_GATEWAY_IMAGE_ID}" \
      "${TARGET_SCHEDULER_SERVICE}" "${TARGET_SCHEDULER_IMAGE_ID}"
}

command -v docker >/dev/null || fail "docker is required"
verify_target_images
verify_predeployment_runtime_binding

INITIAL_RELEASE_MANIFEST_SHA256="$(file_sha256 "${EVIDENCE_ARCHIVE}.manifest.json")"
INITIAL_RELEASE_CHECKSUM_SHA256="$(file_sha256 "${EVIDENCE_ARCHIVE}.sha256")"
INITIAL_SNAPSHOT_MANIFEST_SHA256="$(file_sha256 "${PREDEPLOYMENT_SNAPSHOT_DIR}/manifest.json")"
INITIAL_OWNER_PUBLIC_KEY_FILE_SHA256="$(file_sha256 "${PROGRAM_OWNER_RELEASE_PUBLIC_KEY_FILE}")"
INITIAL_OWNER_KEY_ID_FILE_SHA256="$(file_sha256 "${PROGRAM_OWNER_RELEASE_KEY_ID_FILE}")"
INITIAL_EXECUTOR_PUBLIC_KEY_FILE_SHA256="$(file_sha256 "${RELEASE_EXECUTOR_PUBLIC_KEY_FILE}")"
INITIAL_EXECUTOR_KEY_ID_FILE_SHA256="$(file_sha256 "${RELEASE_EXECUTOR_KEY_ID_FILE}")"
INITIAL_ATTESTATION_FILE_SHA256="$(file_sha256 "${REPLAY_CONSUMPTION_ATTESTATION_FILE}")"
INITIAL_NONCE_STORE_RECEIPT_FILE_SHA256="$(file_sha256 "${NONCE_STORE_RECEIPT_FILE}")"
INITIAL_PROD_COMPOSE_SHA256="$(file_sha256 "${PROD_ROOT}/docker-compose.production.yml")"
INITIAL_PROD_ENV_SHA256="$(file_sha256 "${PROD_ROOT}/.env.production")"
INITIAL_ADMIN_TOKEN_SHA256=""

verify_live_remote_main() {
  local remote_output
  remote_output="$(
    cd /usr
    GIT_TERMINAL_PROMPT=0 \
    GIT_CONFIG_NOSYSTEM=1 \
    GIT_CONFIG_GLOBAL=/dev/null \
      timeout --signal=TERM --kill-after=5s 30s \
      git -c credential.helper= \
        -c http.followRedirects=false \
        -c http.sslVerify=true \
        ls-remote --exit-code "${CANONICAL_REPOSITORY_ORIGIN}" refs/heads/main 2>/dev/null
  )" || fail "Live canonical remote main is not readable"
  [[ "${remote_output}" =~ ^([0-9a-f]{40})[[:space:]]+refs/heads/main$ ]] || fail "Live canonical remote main response is invalid"
  [[ "${BASH_REMATCH[1]}" == "${SOURCE_SHA}" ]] || fail "Live canonical remote main does not match the signed source SHA"
}

verify_canonical_checkouts() {
  local source_origin
  local production_origin
  [[ "$(git -C "${ROOT_DIR}" symbolic-ref -q HEAD)" == "refs/heads/main" ]] || fail "Production execution requires the protected main checkout"
  source_origin="$(git -C "${ROOT_DIR}" config --local --get remote.origin.url)" || fail "Release checkout origin is missing"
  [[ "${source_origin}" == "${CANONICAL_REPOSITORY_ORIGIN}" || "${source_origin}" == "${CANONICAL_REPOSITORY_ORIGIN%.git}" ]] || fail "Production execution requires the canonical repository origin"
  [[ "$(git -C "${PROD_ROOT}" symbolic-ref -q HEAD)" == "refs/heads/main" ]] || fail "Production runtime must be on protected main"
  production_origin="$(git -C "${PROD_ROOT}" config --local --get remote.origin.url)" || fail "Production checkout origin is missing"
  [[ "${production_origin}" == "${CANONICAL_REPOSITORY_ORIGIN}" || "${production_origin}" == "${CANONICAL_REPOSITORY_ORIGIN%.git}" ]] || fail "Production runtime requires the canonical repository origin"
}

if [[ "${EXECUTE}" == "true" ]]; then
  [[ "${EUID}" -eq 0 ]] || fail "Production execution requires the protected root executor"
  [[ "$(realpath -e -- "${PROD_ROOT}")" == "${CANONICAL_PROD_ROOT}" ]] || fail "Production execution requires the canonical runtime root"
  [[ "${ADMIN_TOKEN_FILE}" == "${CANONICAL_ADMIN_TOKEN_FILE}" ]] || fail "Production execution requires the canonical admin-token path"
  test -r "${ADMIN_TOKEN_FILE}" && test -s "${ADMIN_TOKEN_FILE}" && test -f "${ADMIN_TOKEN_FILE}" && test ! -L "${ADMIN_TOKEN_FILE}" || fail "Production admin token is not a safe readable regular file"
  [[ "$(realpath -e -- "${ADMIN_TOKEN_FILE}")" == "${CANONICAL_ADMIN_TOKEN_FILE}" ]] || fail "Production admin-token path substitution is forbidden"
  INITIAL_ADMIN_TOKEN_SHA256="$(file_sha256 "${ADMIN_TOKEN_FILE}")"
  verify_canonical_checkouts
  verify_protected_directory "${LOCAL_CONSUMPTION_MARKER_ROOT}" || fail "Local consumption-marker root is missing or unprotected"
  test ! -e "${LOCAL_CONSUMPTION_MARKER_ROOT}/${CONSUMPTION_ID}" || fail "Protected release consumption was already executed locally"
  verify_live_remote_main
fi

KAIOS_EXECUTE_PRODUCTION_ROLLBACK=false \
  ROOT_DIR="${ROOT_DIR}" \
  PROD_ROOT="${PROD_ROOT}" \
  PREDEPLOYMENT_SNAPSHOT_DIR="${PREDEPLOYMENT_SNAPSHOT_DIR}" \
  EXPECTED_PREDEPLOYMENT_SNAPSHOT_MANIFEST_SHA256="${SNAPSHOT_MANIFEST_SHA256}" \
  bash "${ROLLBACK_SCRIPT}"

cat <<EOF
===== KIDULTS CONTROLLED PRODUCTION PROMOTION =====
Mode: ${EXECUTE}
Production root: ${PROD_ROOT}
Signed and runtime source SHA: ${SOURCE_SHA}
Evidence archive: ${EVIDENCE_ARCHIVE}
Predeployment snapshot: ${PREDEPLOYMENT_SNAPSHOT_DIR}
Production origin: ${BASE_URL}
Rollback executor: ${ROLLBACK_SCRIPT}
Rollback inputs: VERIFIED
Current-SOLD technical evidence: VERIFIED
Explicit Program Owner release receipt: VERIFIED
Artfund changes: forbidden
EOF

if [[ "${EXECUTE}" != "true" ]]; then
  echo "DRY RUN COMPLETE. No production change executed."
  exit 0
fi

create_pinned_target_override
INITIAL_TARGET_OVERRIDE_SHA256="$(file_sha256 "${TARGET_COMPOSE_OVERRIDE}")"
verify_pinned_target_config

cd "${PROD_ROOT}"

revalidate_immutable_inputs() {
  [[ "$(file_sha256 "${EVIDENCE_ARCHIVE}")" == "${ARCHIVE_SHA256}" ]] || fail "Evidence archive changed after authorization"
  [[ "$(file_sha256 "${EVIDENCE_ARCHIVE}.manifest.json")" == "${INITIAL_RELEASE_MANIFEST_SHA256}" ]] || fail "Evidence manifest changed after authorization"
  [[ "$(file_sha256 "${EVIDENCE_ARCHIVE}.sha256")" == "${INITIAL_RELEASE_CHECKSUM_SHA256}" ]] || fail "Evidence checksum file changed after authorization"
  [[ "$(file_sha256 "${PREDEPLOYMENT_SNAPSHOT_DIR}/manifest.json")" == "${INITIAL_SNAPSHOT_MANIFEST_SHA256}" ]] || fail "Predeployment snapshot manifest changed after authorization"
  [[ "$(file_sha256 "${PROGRAM_OWNER_RELEASE_PUBLIC_KEY_FILE}")" == "${INITIAL_OWNER_PUBLIC_KEY_FILE_SHA256}" ]] || fail "Program Owner public key changed after authorization"
  [[ "$(file_sha256 "${PROGRAM_OWNER_RELEASE_KEY_ID_FILE}")" == "${INITIAL_OWNER_KEY_ID_FILE_SHA256}" ]] || fail "Program Owner key fingerprint changed after authorization"
  [[ "$(file_sha256 "${RELEASE_EXECUTOR_PUBLIC_KEY_FILE}")" == "${INITIAL_EXECUTOR_PUBLIC_KEY_FILE_SHA256}" ]] || fail "Release-executor public key changed after authorization"
  [[ "$(file_sha256 "${RELEASE_EXECUTOR_KEY_ID_FILE}")" == "${INITIAL_EXECUTOR_KEY_ID_FILE_SHA256}" ]] || fail "Release-executor key fingerprint changed after authorization"
  [[ "$(file_sha256 "${REPLAY_CONSUMPTION_ATTESTATION_FILE}")" == "${INITIAL_ATTESTATION_FILE_SHA256}" ]] || fail "Consumption attestation changed after authorization"
  [[ "$(file_sha256 "${NONCE_STORE_RECEIPT_FILE}")" == "${INITIAL_NONCE_STORE_RECEIPT_FILE_SHA256}" ]] || fail "External nonce-store receipt changed after authorization"
  [[ "$(file_sha256 "${PROD_ROOT}/docker-compose.production.yml")" == "${INITIAL_PROD_COMPOSE_SHA256}" ]] || fail "Production compose changed after authorization"
  [[ "$(file_sha256 "${PROD_ROOT}/.env.production")" == "${INITIAL_PROD_ENV_SHA256}" ]] || fail "Production environment changed after authorization"
  [[ "$(file_sha256 "${ADMIN_TOKEN_FILE}")" == "${INITIAL_ADMIN_TOKEN_SHA256}" ]] || fail "Production admin token changed after authorization"
  [[ "$(file_sha256 "${TARGET_COMPOSE_OVERRIDE}")" == "${INITIAL_TARGET_OVERRIDE_SHA256}" ]] || fail "Pinned target override changed after authorization"
  [[ "$(git -C "${ROOT_DIR}" rev-parse HEAD)" == "${SOURCE_SHA}" ]] || fail "Release source changed after authorization"
  [[ "$(git -C "${PROD_ROOT}" rev-parse HEAD)" == "${SOURCE_SHA}" ]] || fail "Production source changed after authorization"
  git -C "${ROOT_DIR}" diff --quiet || fail "Release worktree changed after authorization"
  git -C "${ROOT_DIR}" diff --cached --quiet || fail "Release index changed after authorization"
  git -C "${PROD_ROOT}" diff --quiet || fail "Production worktree changed after authorization"
  git -C "${PROD_ROOT}" diff --cached --quiet || fail "Production index changed after authorization"
  verify_protected_file "${PROGRAM_OWNER_RELEASE_PUBLIC_KEY_FILE}" "${PROTECTED_RELEASE_TRUST_ROOT}" || fail "Program Owner trust root changed after authorization"
  verify_protected_file "${PROGRAM_OWNER_RELEASE_KEY_ID_FILE}" "${PROTECTED_RELEASE_TRUST_ROOT}" || fail "Program Owner fingerprint trust root changed after authorization"
  verify_protected_file "${RELEASE_EXECUTOR_PUBLIC_KEY_FILE}" "${PROTECTED_RELEASE_TRUST_ROOT}" || fail "Release-executor trust root changed after authorization"
  verify_protected_file "${RELEASE_EXECUTOR_KEY_ID_FILE}" "${PROTECTED_RELEASE_TRUST_ROOT}" || fail "Release-executor fingerprint trust root changed after authorization"
  verify_protected_file "${REPLAY_CONSUMPTION_ATTESTATION_FILE}" "${REPLAY_CONSUMPTION_ROOT}" || fail "Consumption attestation trust boundary changed after authorization"
  verify_protected_file "${NONCE_STORE_RECEIPT_FILE}" "${REPLAY_CONSUMPTION_ROOT}" || fail "External nonce-store receipt trust boundary changed after authorization"
  verify_protected_directory "${LOCAL_CONSUMPTION_MARKER_ROOT}" || fail "Local consumption-marker trust boundary changed after authorization"
  test ! -e "${LOCAL_CONSUMPTION_MARKER_ROOT}/${CONSUMPTION_ID}" || fail "Protected release consumption was already executed locally"
  verify_canonical_checkouts
  verify_snapshot_binding
  verify_target_images
  verify_predeployment_runtime_binding
  verify_pinned_target_config
}

revalidate_immediately_before_mutation() {
  KAIOS_EXECUTE_PRODUCTION_ROLLBACK=false \
    ROOT_DIR="${ROOT_DIR}" \
    PROD_ROOT="${PROD_ROOT}" \
    PREDEPLOYMENT_SNAPSHOT_DIR="${PREDEPLOYMENT_SNAPSHOT_DIR}" \
    EXPECTED_PREDEPLOYMENT_SNAPSHOT_MANIFEST_SHA256="${SNAPSHOT_MANIFEST_SHA256}" \
    bash "${ROLLBACK_SCRIPT}"
  revalidate_immutable_inputs
  verify_release_gate
  revalidate_immutable_inputs
  verify_live_remote_main
  [[ "$(file_sha256 "${EVIDENCE_ARCHIVE}")" == "${ARCHIVE_SHA256}" ]] || fail "Evidence archive changed during final live-main verification"
  [[ "$(file_sha256 "${EVIDENCE_ARCHIVE}.manifest.json")" == "${INITIAL_RELEASE_MANIFEST_SHA256}" ]] || fail "Evidence manifest changed during final live-main verification"
  [[ "$(file_sha256 "${EVIDENCE_ARCHIVE}.sha256")" == "${INITIAL_RELEASE_CHECKSUM_SHA256}" ]] || fail "Evidence checksum changed during final live-main verification"
  [[ "$(file_sha256 "${PREDEPLOYMENT_SNAPSHOT_DIR}/manifest.json")" == "${INITIAL_SNAPSHOT_MANIFEST_SHA256}" ]] || fail "Snapshot changed during final live-main verification"
  [[ "$(file_sha256 "${PROGRAM_OWNER_RELEASE_PUBLIC_KEY_FILE}")" == "${INITIAL_OWNER_PUBLIC_KEY_FILE_SHA256}" ]] || fail "Owner key changed during final live-main verification"
  [[ "$(file_sha256 "${PROGRAM_OWNER_RELEASE_KEY_ID_FILE}")" == "${INITIAL_OWNER_KEY_ID_FILE_SHA256}" ]] || fail "Owner key ID changed during final live-main verification"
  [[ "$(file_sha256 "${RELEASE_EXECUTOR_PUBLIC_KEY_FILE}")" == "${INITIAL_EXECUTOR_PUBLIC_KEY_FILE_SHA256}" ]] || fail "Executor key changed during final live-main verification"
  [[ "$(file_sha256 "${RELEASE_EXECUTOR_KEY_ID_FILE}")" == "${INITIAL_EXECUTOR_KEY_ID_FILE_SHA256}" ]] || fail "Executor key ID changed during final live-main verification"
  [[ "$(file_sha256 "${REPLAY_CONSUMPTION_ATTESTATION_FILE}")" == "${INITIAL_ATTESTATION_FILE_SHA256}" ]] || fail "Attestation changed during final live-main verification"
  [[ "$(file_sha256 "${NONCE_STORE_RECEIPT_FILE}")" == "${INITIAL_NONCE_STORE_RECEIPT_FILE_SHA256}" ]] || fail "Nonce-store receipt changed during final live-main verification"
  [[ "$(file_sha256 "${PROD_ROOT}/docker-compose.production.yml")" == "${INITIAL_PROD_COMPOSE_SHA256}" ]] || fail "Production compose changed during final live-main verification"
  [[ "$(file_sha256 "${PROD_ROOT}/.env.production")" == "${INITIAL_PROD_ENV_SHA256}" ]] || fail "Production environment changed during final live-main verification"
  [[ "$(file_sha256 "${ADMIN_TOKEN_FILE}")" == "${INITIAL_ADMIN_TOKEN_SHA256}" ]] || fail "Admin token changed during final live-main verification"
  [[ "$(file_sha256 "${TARGET_COMPOSE_OVERRIDE}")" == "${INITIAL_TARGET_OVERRIDE_SHA256}" ]] || fail "Pinned target changed during final live-main verification"
  [[ "$(git -C "${ROOT_DIR}" rev-parse HEAD)" == "${SOURCE_SHA}" ]] || fail "Release source changed during final live-main verification"
  [[ "$(git -C "${PROD_ROOT}" rev-parse HEAD)" == "${SOURCE_SHA}" ]] || fail "Production source changed during final live-main verification"
  git -C "${ROOT_DIR}" diff --quiet || fail "Release worktree changed during final live-main verification"
  git -C "${ROOT_DIR}" diff --cached --quiet || fail "Release index changed during final live-main verification"
  git -C "${PROD_ROOT}" diff --quiet || fail "Production worktree changed during final live-main verification"
  git -C "${PROD_ROOT}" diff --cached --quiet || fail "Production index changed during final live-main verification"
  test ! -e "${LOCAL_CONSUMPTION_MARKER_ROOT}/${CONSUMPTION_ID}" || fail "Release was consumed during final live-main verification"
}

revalidate_immediately_before_mutation

verify_protected_directory "${ROLLBACK_PIN_ROOT}" || fail "Durable rollback root ancestry is not protected"
exec 9<"${ROLLBACK_PIN_ROOT}" || fail "Durable rollback root cannot be opened"
ROLLBACK_PIN_ROOT_ID="$(verify_protected_directory_fd "${ROLLBACK_PIN_ROOT}" 9)" \
  || fail "Durable rollback root stable identity is invalid"
[[ "${ROLLBACK_PIN_ROOT_ID}" =~ ^[0-9]+:[0-9]+$ ]] || fail "Durable rollback root identity is invalid"
ROLLBACK_PIN_ROOT_STABLE="/proc/self/fd/9"

prepare_durable_rollback_inputs() {
  local expected_prepared_dir
  local expected_prepared_stable
  expected_prepared_dir="${ROLLBACK_PIN_ROOT}/${SNAPSHOT_MANIFEST_SHA256#sha256:}"
  expected_prepared_stable="${ROLLBACK_PIN_ROOT_STABLE}/${SNAPSHOT_MANIFEST_SHA256#sha256:}"
  test ! -e "${expected_prepared_stable}" && test ! -L "${expected_prepared_stable}" || fail "Digest-bound rollback inputs already exist"
  KAIOS_EXECUTE_PRODUCTION_ROLLBACK=false \
    KAIOS_PREPARE_PRODUCTION_ROLLBACK=true \
    ROOT_DIR="${ROOT_DIR}" \
    PROD_ROOT="${PROD_ROOT}" \
    PREDEPLOYMENT_SNAPSHOT_DIR="${PREDEPLOYMENT_SNAPSHOT_DIR}" \
    EXPECTED_PREDEPLOYMENT_SNAPSHOT_MANIFEST_SHA256="${SNAPSHOT_MANIFEST_SHA256}" \
    bash "${ROLLBACK_SCRIPT}"
  exec 8<"${expected_prepared_stable}" || fail "Durable rollback input cannot be opened through the stable root"
  PREPARED_ROLLBACK_ID="$(verify_protected_directory_fd "${expected_prepared_dir}" 8)" \
    || fail "Durable rollback input ancestry or stable identity is invalid"
  [[ "${PREPARED_ROLLBACK_ID}" =~ ^[0-9]+:[0-9]+$ ]] || fail "Durable rollback input identity is invalid"
  PREPARED_ROLLBACK_STABLE="/proc/self/fd/8"
  [[ "$(file_sha256 "${PREPARED_ROLLBACK_STABLE}/manifest.json")" == "${SNAPSHOT_MANIFEST_SHA256}" ]] || fail "Durable rollback manifest digest mismatch"
  PREPARED_ROLLBACK_DIR="${expected_prepared_dir}"
}

prepare_durable_rollback_inputs
revalidate_immediately_before_mutation
[[ "$(verify_protected_directory_fd "${ROLLBACK_PIN_ROOT}" 9)" == "${ROLLBACK_PIN_ROOT_ID}" ]] \
  || fail "Durable rollback root ancestry or stable identity changed before mutation"
[[ "$(verify_protected_directory_fd "${PREPARED_ROLLBACK_DIR}" 8)" == "${PREPARED_ROLLBACK_ID}" ]] \
  || fail "Durable rollback input ancestry or stable identity changed before mutation"
[[ "$(file_sha256 "${PREPARED_ROLLBACK_STABLE}/manifest.json")" == "${SNAPSHOT_MANIFEST_SHA256}" ]] || fail "Durable rollback manifest changed before mutation"

CONSUMPTION_MARKER_DIR="${LOCAL_CONSUMPTION_MARKER_ROOT}/${CONSUMPTION_ID}"
umask 077
mkdir -- "${CONSUMPTION_MARKER_DIR}" || fail "Protected release consumption was already executed locally"
chmod 700 "${CONSUMPTION_MARKER_DIR}"
python3 -I - "${CONSUMPTION_MARKER_DIR}/local-consumption.json" "${CONSUMPTION_ID}" \
  "${SOURCE_SHA}" "${ARCHIVE_SHA256}" "${SNAPSHOT_MANIFEST_SHA256}" \
  "${NONCE_STORE_RECEIPT_SHA256}" "${TARGET_GATEWAY_IMAGE_ID}" "${TARGET_SCHEDULER_IMAGE_ID}" \
  "${OWNER_RECEIPT_CANONICAL_SHA256}" "${DEPLOYMENT_MANIFEST_SHA256}" \
  "${ROLLBACK_PIN_ROOT_ID}" "${PREPARED_ROLLBACK_ID}" <<'PY'
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

payload = {
    "id": "KIDULTS_LOCAL_PRODUCTION_RELEASE_CONSUMPTION_V1",
    "version": "1.0.0",
    "state": "CONSUMED_BEFORE_FIRST_PRODUCTION_MUTATION",
    "consumption_id": sys.argv[2],
    "consumed_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    "source_sha": sys.argv[3],
    "archive_sha256": sys.argv[4],
    "predeployment_snapshot_manifest_sha256": sys.argv[5],
    "nonce_store_receipt_sha256": sys.argv[6],
    "target_gateway_image_id": sys.argv[7],
    "target_scheduler_image_id": sys.argv[8],
    "owner_receipt_canonical_sha256": sys.argv[9],
    "deployment_manifest_sha256": sys.argv[10],
    "rollback_pin_root_identity": sys.argv[11],
    "prepared_rollback_identity": sys.argv[12],
    "execution_mode": "CONTROLLED_PRODUCTION_PROMOTION",
    "production_mutation_result": "NOT_YET_OBSERVED",
}
destination = Path(sys.argv[1])
encoded = (json.dumps(payload, indent=2) + "\n").encode()
flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0)
descriptor = os.open(destination, flags, 0o600)
try:
    remaining = memoryview(encoded)
    while remaining:
        written = os.write(descriptor, remaining)
        if written <= 0:
            raise SystemExit("LOCAL_CONSUMPTION_MARKER_WRITE_FAILED")
        remaining = remaining[written:]
    os.fsync(descriptor)
finally:
    os.close(descriptor)
for directory in (destination.parent, destination.parent.parent):
    descriptor = os.open(directory, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)
PY

[[ "$(verify_protected_directory_fd "${ROLLBACK_PIN_ROOT}" 9)" == "${ROLLBACK_PIN_ROOT_ID}" ]] \
  || fail "Durable rollback root changed after consumption marker publication"
[[ "$(verify_protected_directory_fd "${PREPARED_ROLLBACK_DIR}" 8)" == "${PREPARED_ROLLBACK_ID}" ]] \
  || fail "Durable rollback input changed after consumption marker publication"
[[ "$(file_sha256 "${PREPARED_ROLLBACK_STABLE}/manifest.json")" == "${SNAPSHOT_MANIFEST_SHA256}" ]] \
  || fail "Durable rollback manifest changed after consumption marker publication"

ROLLBACK_ARMED=true
docker compose \
  --project-directory "${PROD_ROOT}" \
  --env-file "${PROD_ROOT}/.env.production" \
  -f "${PROD_ROOT}/docker-compose.production.yml" \
  -f "${TARGET_COMPOSE_OVERRIDE}" \
  up -d --force-recreate --pull never --no-build --no-deps \
  "${TARGET_GATEWAY_SERVICE}" "${TARGET_SCHEDULER_SERVICE}"
DEPLOYED_GATEWAY_IMAGE_ID="$(docker inspect -f '{{.Image}}' kidults-gateway)"
DEPLOYED_SCHEDULER_IMAGE_ID="$(docker inspect -f '{{.Image}}' kidults-scheduler)"
DEPLOYED_GATEWAY_CONTAINER_ID="$(docker inspect -f '{{.Id}}' kidults-gateway)"
DEPLOYED_SCHEDULER_CONTAINER_ID="$(docker inspect -f '{{.Id}}' kidults-scheduler)"
[[ "${DEPLOYED_GATEWAY_IMAGE_ID}" == "${TARGET_GATEWAY_IMAGE_ID}" ]] || fail "Deployed gateway image does not match the signed target"
[[ "${DEPLOYED_SCHEDULER_IMAGE_ID}" == "${TARGET_SCHEDULER_IMAGE_ID}" ]] || fail "Deployed scheduler image does not match the signed target"
[[ "${DEPLOYED_GATEWAY_CONTAINER_ID}" =~ ^[0-9a-f]{64}$ \
  && "${DEPLOYED_SCHEDULER_CONTAINER_ID}" =~ ^[0-9a-f]{64}$ \
  && "${DEPLOYED_GATEWAY_CONTAINER_ID}" != "${DEPLOYED_SCHEDULER_CONTAINER_ID}" ]] \
  || fail "Deployed Production container identity binding is invalid"
sleep 30

SMOKE_TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/kidults-promotion-smoke.XXXXXX")"
chmod 700 "${SMOKE_TEMP_DIR}"
HEALTH_HTTP="$(curl --proto '=https' --max-redirs 0 --connect-timeout 10 --max-time 30 -sS -o "${SMOKE_TEMP_DIR}/health.json" -w '%{http_code}' "${BASE_URL}/api/health")"
PORTAL_HTTP="$(curl --proto '=https' --max-redirs 0 --connect-timeout 10 --max-time 30 -sS -o "${SMOKE_TEMP_DIR}/portal.html" -w '%{http_code}' "${BASE_URL}/portal/")"
UNAUTH_HTTP="$(curl --proto '=https' --max-redirs 0 --connect-timeout 10 --max-time 30 -sS -o "${SMOKE_TEMP_DIR}/unauth.json" -w '%{http_code}' "${BASE_URL}/api/collector?mode=live")"
ADMIN_TOKEN="$(tr -d '\r\n' < "${ADMIN_TOKEN_FILE}")"
test -n "${ADMIN_TOKEN}" || fail "Production admin token is empty"
install -m 600 /dev/null "${SMOKE_TEMP_DIR}/admin-header"
printf 'Authorization: Bearer %s\n' "${ADMIN_TOKEN}" > "${SMOKE_TEMP_DIR}/admin-header"
unset ADMIN_TOKEN
AUTH_HTTP="$(curl --proto '=https' --max-redirs 0 --connect-timeout 10 --max-time 30 -sS -o "${SMOKE_TEMP_DIR}/auth.json" -w '%{http_code}' --header "@${SMOKE_TEMP_DIR}/admin-header" "${BASE_URL}/api/collector?mode=live")"
rm -f -- "${SMOKE_TEMP_DIR}/admin-header"
DB_INTEGRITY="$(sqlite3 /opt/intelligence-holdings/kidults/data/kaios.db 'PRAGMA integrity_check;')"

if [[ "${HEALTH_HTTP}" != "200" || "${PORTAL_HTTP}" != "200" || "${UNAUTH_HTTP}" != "401" || "${AUTH_HTTP}" != "200" || "${DB_INTEGRITY}" != "ok" ]]; then
  echo "Post-deployment smoke failed; automatic rollback is executing." >&2
  echo "HEALTH_HTTP=${HEALTH_HTTP} PORTAL_HTTP=${PORTAL_HTTP} UNAUTH_HTTP=${UNAUTH_HTTP} AUTH_HTTP=${AUTH_HTTP} DB_INTEGRITY=${DB_INTEGRITY}" >&2
  rollback_and_exit "SMOKE_FAILURE" 2
fi

write_local_terminal_result "PROMOTION_SUCCEEDED" "POST_DEPLOYMENT_SMOKE_PASS"
ROLLBACK_ARMED=false
trap - ERR INT TERM
if ! cleanup_smoke_files; then
  echo "WARNING: promotion succeeded but smoke-file cleanup failed." >&2
fi
if ! cleanup_target_override; then
  echo "WARNING: promotion succeeded but target-override cleanup failed." >&2
fi

echo "Kidults controlled production promotion completed and smoke checks passed."
