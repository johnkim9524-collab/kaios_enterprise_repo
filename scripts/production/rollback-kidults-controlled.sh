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
  COMPOSE_FILE COMPOSE_PROJECT_NAME COMPOSE_PROFILES COMPOSE_ENV_FILES COMPOSE_PATH_SEPARATOR \
  KIDULTS_SQLITE_RESTORE_TEST_HOOKS KIDULTS_ROLLBACK_ERROR_RECEIPT_TEST_HOOKS \
  KIDULTS_ROLLBACK_ERROR_RECEIPT_TEST_FAIL_PHASE KIDULTS_CONFIG_RESTORE_TEST_HOOKS \
  KIDULTS_CONFIG_RESTORE_TEST_FAIL_PHASE KIDULTS_ROLLBACK_TERMINAL_MANIFEST_TEST_HOOKS \
  KIDULTS_ROLLBACK_TERMINAL_MANIFEST_TEST_FAIL_PHASE ROLLBACK_RECEIPT_ROOT
readonly DOCKER_HOST="unix:///var/run/docker.sock"
export DOCKER_HOST
umask 077

ROOT_DIR="${ROOT_DIR:-$PWD}"
PROD_ROOT="${PROD_ROOT:-/opt/intelligence-holdings/kidults/app}"
PROD_DB="${PROD_DB:-/opt/intelligence-holdings/kidults/data/kaios.db}"
PREDEPLOYMENT_SNAPSHOT_DIR="${PREDEPLOYMENT_SNAPSHOT_DIR:-}"
EXPECTED_PREDEPLOYMENT_SNAPSHOT_MANIFEST_SHA256="${EXPECTED_PREDEPLOYMENT_SNAPSHOT_MANIFEST_SHA256:-}"
ROLLBACK_AUTHORIZATION_FILE="${KIDULTS_ROLLBACK_AUTHORIZATION_FILE:-}"
ROLLBACK_TRIGGER="${ROLLBACK_TRIGGER:-UNSPECIFIED_FAILURE}"
EXECUTE="${KAIOS_EXECUTE_PRODUCTION_ROLLBACK:-false}"
PREPARE_ONLY="${KAIOS_PREPARE_PRODUCTION_ROLLBACK:-false}"
PREPARED_ROLLBACK_DIR="${KIDULTS_PREPARED_ROLLBACK_DIR:-}"
readonly BASE_URL="https://kaios.kidults.com"
readonly CANONICAL_PROD_ROOT="/opt/intelligence-holdings/kidults/app"
readonly CANONICAL_PROD_DB="/opt/intelligence-holdings/kidults/data/kaios.db"
readonly ROLLBACK_AUTHORIZATION_ROOT="/var/lib/kaios/kidults-production-release/consumed"
readonly ROLLBACK_PIN_ROOT="/var/lib/kaios/kidults-production-release/rollback-inputs"
readonly ROLLBACK_RECEIPT_ROOT="/mnt/ih_prod_01/backups/production-certification/rollback-receipts"

fail() {
  echo "ERROR: $*" >&2
  if [[ "${ROLLBACK_TRANSACTION_ACTIVE:-false}" == "true" ]]; then
    rollback_failure_trap 1 EXPLICIT_FAILURE
  fi
  exit 1
}

[[ "${EXECUTE}" == "true" || "${EXECUTE}" == "false" ]] || fail "KAIOS_EXECUTE_PRODUCTION_ROLLBACK must be true or false"
[[ "${PREPARE_ONLY}" == "true" || "${PREPARE_ONLY}" == "false" ]] || fail "KAIOS_PREPARE_PRODUCTION_ROLLBACK must be true or false"
[[ ! ( "${EXECUTE}" == "true" && "${PREPARE_ONLY}" == "true" ) ]] || fail "Rollback prepare and execute modes are mutually exclusive"
[[ "${EXPECTED_PREDEPLOYMENT_SNAPSHOT_MANIFEST_SHA256}" =~ ^sha256:[0-9a-f]{64}$ ]] || fail "Signed predeployment snapshot manifest digest is required"
SOURCE_SHA="$(git -C "${PROD_ROOT}" rev-parse HEAD 2>/dev/null)" || fail "Production root is not an exact Git checkout"
[[ "${SOURCE_SHA}" =~ ^[0-9a-f]{40}$ ]] || fail "Production source SHA is invalid"
PROD_ROOT_REAL="$(realpath -e "${PROD_ROOT}")"
PROD_DB_PARENT_REAL="$(realpath -e "$(dirname "${PROD_DB}")")"
PROD_DB_REAL="${PROD_DB_PARENT_REAL}/$(basename "${PROD_DB}")"

verify_protected_directory_chain_fd() {
  local candidate="$1"
  local held_fd="$2"
  python3 -I - "${candidate}" "${held_fd}" <<'PY'
import os
import stat
import sys
from pathlib import Path

candidate = Path(sys.argv[1])
held_fd = int(sys.argv[2])
if not candidate.is_absolute() or os.path.normpath(str(candidate)) != str(candidate):
    raise SystemExit("PROTECTED_DIRECTORY_PATH_NOT_CANONICAL")

def require_protected(descriptor, label):
    metadata = os.fstat(descriptor)
    if not stat.S_ISDIR(metadata.st_mode) or metadata.st_uid != 0 or stat.S_IMODE(metadata.st_mode) & 0o022:
        raise SystemExit(f"PROTECTED_DIRECTORY_ANCESTOR:{label}")
    return metadata

flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
current_fd = os.open("/", flags)
try:
    current_metadata = require_protected(current_fd, "/")
    for component in candidate.parts[1:]:
        next_fd = os.open(component, flags, dir_fd=current_fd)
        os.close(current_fd)
        current_fd = next_fd
        current_metadata = require_protected(current_fd, component)
    held_metadata = require_protected(held_fd, "held-fd")
    if (current_metadata.st_dev, current_metadata.st_ino) != (held_metadata.st_dev, held_metadata.st_ino):
        raise SystemExit("PROTECTED_DIRECTORY_STABLE_IDENTITY_MISMATCH")
    print(f"{held_metadata.st_dev}:{held_metadata.st_ino}")
finally:
    os.close(current_fd)
PY
}

verify_protected_database_parent_fd() {
  local candidate="$1"
  local held_fd="$2"
  python3 -I - "${candidate}" "${held_fd}" <<'PY'
import os
import stat
import sys
from pathlib import Path

candidate = Path(sys.argv[1])
held_fd = int(sys.argv[2])
if not candidate.is_absolute() or os.path.normpath(str(candidate)) != str(candidate):
    raise SystemExit("PRODUCTION_DATABASE_PARENT_PATH_NOT_CANONICAL")
flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
current_fd = os.open("/", flags)
try:
    components = ["/", *candidate.parts[1:]]
    current_metadata = None
    for index, component in enumerate(components):
        if index:
            next_fd = os.open(component, flags, dir_fd=current_fd)
            os.close(current_fd)
            current_fd = next_fd
        current_metadata = os.fstat(current_fd)
        final = index == len(components) - 1
        if not stat.S_ISDIR(current_metadata.st_mode) or stat.S_IMODE(current_metadata.st_mode) & 0o022:
            raise SystemExit(f"PRODUCTION_DATABASE_PARENT_UNSAFE:{component}")
        if not final and current_metadata.st_uid != 0:
            raise SystemExit(f"PRODUCTION_DATABASE_ANCESTOR_NOT_ROOT:{component}")
    held_metadata = os.fstat(held_fd)
    if (
        current_metadata is None
        or not stat.S_ISDIR(held_metadata.st_mode)
        or stat.S_IMODE(held_metadata.st_mode) & 0o022
        or (current_metadata.st_dev, current_metadata.st_ino) != (held_metadata.st_dev, held_metadata.st_ino)
    ):
        raise SystemExit("PRODUCTION_DATABASE_PARENT_STABLE_IDENTITY_MISMATCH")
    print(f"{held_metadata.st_dev}:{held_metadata.st_ino}")
finally:
    os.close(current_fd)
PY
}

verify_existing_database_entry_fd() {
  python3 -I - 7 "$(basename "${PROD_DB}")" <<'PY'
import os
import stat
import sys

parent_fd = int(sys.argv[1])
name = sys.argv[2]
try:
    metadata = os.stat(name, dir_fd=parent_fd, follow_symlinks=False)
except FileNotFoundError:
    raise SystemExit(0)
if not stat.S_ISREG(metadata.st_mode):
    raise SystemExit("PRODUCTION_DATABASE_ENTRY_NOT_REGULAR")
PY
}

verify_sqlite_restore_helper_fd() {
  python3 -I - 6 "restore-kidults-sqlite-rollback-v1.py" "${EXPECTED_SQLITE_RESTORE_HELPER_BLOB}" <<'PY'
import hashlib
import os
import stat
import sys

parent_fd = int(sys.argv[1])
candidate_name = sys.argv[2]
expected_blob = sys.argv[3]
parent_metadata = os.fstat(parent_fd)
if not stat.S_ISDIR(parent_metadata.st_mode):
    raise SystemExit("SQLITE_RESTORE_HELPER_PARENT_FD_INVALID")
try:
    helper_fd = os.open(
        candidate_name,
        os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK,
        dir_fd=parent_fd,
    )
    try:
        before = os.fstat(helper_fd)
        entry_before = os.stat(candidate_name, dir_fd=parent_fd, follow_symlinks=False)
        if (
            not stat.S_ISREG(before.st_mode)
            or before.st_uid != 0
            or before.st_gid != 0
            or stat.S_IMODE(before.st_mode) != 0o644
            or (before.st_dev, before.st_ino) != (entry_before.st_dev, entry_before.st_ino)
        ):
            raise SystemExit("SQLITE_RESTORE_HELPER_PERMISSIONS_OR_IDENTITY")
        raw = b""
        while True:
            block = os.read(helper_fd, 1024 * 1024)
            if not block:
                break
            raw += block
            if len(raw) > 1024 * 1024:
                raise SystemExit("SQLITE_RESTORE_HELPER_TOO_LARGE")
        actual_blob = hashlib.sha1(f"blob {len(raw)}\0".encode("ascii") + raw).hexdigest()
        if actual_blob != expected_blob:
            raise SystemExit("SQLITE_RESTORE_HELPER_BLOB_MISMATCH")
        compile(raw.decode("utf-8"), candidate_name, "exec")
        after = os.fstat(helper_fd)
        entry_after = os.stat(candidate_name, dir_fd=parent_fd, follow_symlinks=False)
        if (
            (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns)
            != (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns)
            or (after.st_dev, after.st_ino) != (entry_after.st_dev, entry_after.st_ino)
        ):
            raise SystemExit("SQLITE_RESTORE_HELPER_CHANGED_DURING_VALIDATION")
    finally:
        os.close(helper_fd)
finally:
    pass
PY
}

create_exclusive_receipt_directory_fd() {
  python3 -I - 5 "${TIMESTAMP}" <<'PY'
import os
import re
import secrets
import stat
import sys

root_fd = int(sys.argv[1])
timestamp = sys.argv[2]
if re.fullmatch(r"[0-9]{8}T[0-9]{6}Z", timestamp) is None:
    raise SystemExit("ROLLBACK_RECEIPT_TIMESTAMP_INVALID")
if not stat.S_ISDIR(os.fstat(root_fd).st_mode):
    raise SystemExit("ROLLBACK_RECEIPT_ROOT_FD_INVALID")
for _ in range(32):
    name = f"kidults-rollback-{timestamp}-{secrets.token_hex(32)}"
    try:
        os.mkdir(name, 0o700, dir_fd=root_fd)
        break
    except FileExistsError:
        continue
else:
    raise SystemExit("ROLLBACK_RECEIPT_RANDOM_DIRECTORY_EXHAUSTED")
directory_fd = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=root_fd)
try:
    held = os.fstat(directory_fd)
    entry = os.stat(name, dir_fd=root_fd, follow_symlinks=False)
    if (
        not stat.S_ISDIR(held.st_mode)
        or held.st_uid != 0
        or held.st_gid != 0
        or stat.S_IMODE(held.st_mode) != 0o700
        or (held.st_dev, held.st_ino) != (entry.st_dev, entry.st_ino)
    ):
        raise SystemExit("ROLLBACK_RECEIPT_DIRECTORY_IDENTITY_OR_MODE_INVALID")
    os.fsync(directory_fd)
    os.fsync(root_fd)
    print(name)
finally:
    os.close(directory_fd)
PY
}

copy_regular_path_to_receipt_fd() {
  local source_path="$1"
  local receipt_name="$2"
  python3 -I - 4 "${source_path}" "${receipt_name}" <<'PY'
import os
import re
import stat
import sys

receipt_fd = int(sys.argv[1])
source_path = sys.argv[2]
receipt_name = sys.argv[3]
if re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,127}", receipt_name) is None:
    raise SystemExit("ROLLBACK_RECEIPT_MEMBER_NAME_INVALID")
source_fd = os.open(source_path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
target_fd = -1
try:
    source_before = os.fstat(source_fd)
    source_entry = os.stat(source_path, follow_symlinks=False)
    if not stat.S_ISREG(source_before.st_mode) or (source_before.st_dev, source_before.st_ino) != (source_entry.st_dev, source_entry.st_ino):
        raise SystemExit("ROLLBACK_RECEIPT_SOURCE_NOT_STABLE_REGULAR")
    target_fd = os.open(receipt_name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=receipt_fd)
    while True:
        block = os.read(source_fd, 1024 * 1024)
        if not block:
            break
        remaining = memoryview(block)
        while remaining:
            written = os.write(target_fd, remaining)
            if written <= 0:
                raise SystemExit("ROLLBACK_RECEIPT_MEMBER_WRITE_FAILED")
            remaining = remaining[written:]
    os.fsync(target_fd)
    source_after = os.fstat(source_fd)
    target_metadata = os.fstat(target_fd)
    target_entry = os.stat(receipt_name, dir_fd=receipt_fd, follow_symlinks=False)
    if (
        (source_before.st_dev, source_before.st_ino, source_before.st_size, source_before.st_mtime_ns)
        != (source_after.st_dev, source_after.st_ino, source_after.st_size, source_after.st_mtime_ns)
        or not stat.S_ISREG(target_metadata.st_mode)
        or target_metadata.st_uid != 0
        or target_metadata.st_gid != 0
        or stat.S_IMODE(target_metadata.st_mode) != 0o600
        or (target_metadata.st_dev, target_metadata.st_ino) != (target_entry.st_dev, target_entry.st_ino)
    ):
        raise SystemExit("ROLLBACK_RECEIPT_MEMBER_IDENTITY_OR_MODE_INVALID")
    os.fsync(receipt_fd)
finally:
    if target_fd >= 0:
        os.close(target_fd)
    os.close(source_fd)
PY
}

run_with_exclusive_receipt_stdout_fd() {
  local receipt_name="$1"
  shift
  python3 -I - 4 "${receipt_name}" "$@" <<'PY'
import os
import re
import stat
import subprocess
import sys

receipt_fd = int(sys.argv[1])
receipt_name = sys.argv[2]
command = sys.argv[3:]
if re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,127}", receipt_name) is None or not command:
    raise SystemExit("ROLLBACK_RECEIPT_COMMAND_MEMBER_INVALID")
target_fd = os.open(receipt_name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=receipt_fd)
try:
    completed = subprocess.run(command, stdin=subprocess.DEVNULL, stdout=target_fd, check=False)
    os.fsync(target_fd)
    metadata = os.fstat(target_fd)
    entry = os.stat(receipt_name, dir_fd=receipt_fd, follow_symlinks=False)
    if (
        not stat.S_ISREG(metadata.st_mode)
        or metadata.st_uid != 0
        or metadata.st_gid != 0
        or stat.S_IMODE(metadata.st_mode) != 0o600
        or (metadata.st_dev, metadata.st_ino) != (entry.st_dev, entry.st_ino)
    ):
        raise SystemExit("ROLLBACK_RECEIPT_COMMAND_MEMBER_IDENTITY_INVALID")
    os.fsync(receipt_fd)
    if completed.returncode != 0:
        raise SystemExit(f"ROLLBACK_RECEIPT_COMMAND_FAILED:{completed.returncode}")
finally:
    os.close(target_fd)
PY
}

curl_to_exclusive_receipt_fd() {
  local receipt_name="$1"
  local url="$2"
  python3 -I - 4 "${receipt_name}" "${url}" <<'PY'
import os
import re
import stat
import subprocess
import sys

receipt_fd = int(sys.argv[1])
receipt_name = sys.argv[2]
url = sys.argv[3]
if re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,127}", receipt_name) is None:
    raise SystemExit("ROLLBACK_RECEIPT_CURL_MEMBER_INVALID")
target_fd = os.open(receipt_name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=receipt_fd)
try:
    completed = subprocess.run(
        [
            "curl", "--proto", "=https", "--max-redirs", "0", "--max-time", "15",
            "--max-filesize", "10485760", "--silent", "--show-error",
            "--write-out", "\\n%{http_code}", url,
        ],
        stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    body, separator, status = completed.stdout.rpartition(b"\n")
    http_code = status.decode("ascii", errors="ignore") if separator and re.fullmatch(rb"[0-9]{3}", status) else "000"
    if completed.returncode != 0:
        http_code = "000"
    remaining = memoryview(body if separator else completed.stdout)
    while remaining:
        written = os.write(target_fd, remaining)
        if written <= 0:
            raise SystemExit("ROLLBACK_RECEIPT_CURL_MEMBER_WRITE_FAILED")
        remaining = remaining[written:]
    os.fsync(target_fd)
    metadata = os.fstat(target_fd)
    entry = os.stat(receipt_name, dir_fd=receipt_fd, follow_symlinks=False)
    if (
        not stat.S_ISREG(metadata.st_mode)
        or metadata.st_uid != 0
        or metadata.st_gid != 0
        or stat.S_IMODE(metadata.st_mode) != 0o600
        or (metadata.st_dev, metadata.st_ino) != (entry.st_dev, entry.st_ino)
    ):
        raise SystemExit("ROLLBACK_RECEIPT_CURL_MEMBER_IDENTITY_INVALID")
    os.fsync(receipt_fd)
    print(http_code)
finally:
    os.close(target_fd)
PY
}

verify_runtime_containers_stopped() {
  local receipt_name="${1:-}"
  python3 -I - "${CURRENT_GATEWAY_CONTAINER_ID}" "${CURRENT_SCHEDULER_CONTAINER_ID}" 4 "${receipt_name}" <<'PY'
import datetime as dt
import json
import os
import re
import stat
import subprocess
import sys

expected = {
    sys.argv[1]: "/kidults-gateway",
    sys.argv[2]: "/kidults-scheduler",
}
receipt_fd = int(sys.argv[3])
receipt_name = sys.argv[4]
if len(expected) != 2 or any(re.fullmatch(r"[0-9a-f]{64}", value) is None for value in expected):
    raise SystemExit("ROLLBACK_CONTAINER_ID_BINDING_INVALID")
completed = subprocess.run(
    ["docker", "inspect", *expected],
    stdin=subprocess.DEVNULL,
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    check=False,
)
if completed.returncode != 0:
    raise SystemExit("ROLLBACK_CONTAINER_INSPECT_FAILED")
payload = json.loads(completed.stdout)
if not isinstance(payload, list) or len(payload) != 2:
    raise SystemExit("ROLLBACK_CONTAINER_INSPECT_CLOSURE")
seen = set()
normalized = []
for item in payload:
    identifier = item.get("Id")
    name = item.get("Name")
    state = item.get("State")
    if identifier not in expected or name != expected[identifier] or identifier in seen or not isinstance(state, dict):
        raise SystemExit("ROLLBACK_CONTAINER_ID_OR_NAME_REBOUND")
    seen.add(identifier)
    if (
        state.get("Running") is not False
        or state.get("Paused") is not False
        or state.get("Restarting") is not False
        or state.get("Pid") != 0
        or state.get("Status") not in {"created", "exited"}
    ):
        raise SystemExit(f"ROLLBACK_CONTAINER_NOT_QUIESCENT:{name}")
    normalized.append({
        "id": identifier,
        "name": name,
        "running": state["Running"],
        "paused": state["Paused"],
        "restarting": state["Restarting"],
        "pid": state["Pid"],
        "status": state["Status"],
    })
if seen != set(expected):
    raise SystemExit("ROLLBACK_CONTAINER_INSPECT_CLOSURE")
if receipt_name:
    if re.fullmatch(r"container-quiescence-[a-z-]+\.json", receipt_name) is None:
        raise SystemExit("ROLLBACK_CONTAINER_RECEIPT_NAME_INVALID")
    raw = (json.dumps({
        "id": "KIDULTS_ROLLBACK_CONTAINER_QUIESCENCE_V1",
        "version": "1.0.0",
        "observed_at": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "containers": sorted(normalized, key=lambda value: value["name"]),
    }, indent=2) + "\n").encode("utf-8")
    target_fd = os.open(receipt_name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=receipt_fd)
    try:
        remaining = memoryview(raw)
        while remaining:
            written = os.write(target_fd, remaining)
            if written <= 0:
                raise SystemExit("ROLLBACK_CONTAINER_RECEIPT_WRITE_FAILED")
            remaining = remaining[written:]
        os.fsync(target_fd)
        metadata = os.fstat(target_fd)
        entry = os.stat(receipt_name, dir_fd=receipt_fd, follow_symlinks=False)
        if (
            not stat.S_ISREG(metadata.st_mode)
            or metadata.st_uid != 0
            or metadata.st_gid != 0
            or stat.S_IMODE(metadata.st_mode) != 0o600
            or (metadata.st_dev, metadata.st_ino) != (entry.st_dev, entry.st_ino)
        ):
            raise SystemExit("ROLLBACK_CONTAINER_RECEIPT_IDENTITY_INVALID")
        os.fsync(receipt_fd)
    finally:
        os.close(target_fd)
print("ROLLBACK_RUNTIME_QUIESCENCE_PASS")
PY
}

verify_sqlite_sidecar_namespace_absent_fd() {
  python3 -I - 7 "$(basename "${PROD_DB}")" <<'PY'
import os
import sys

parent_fd = int(sys.argv[1])
database_name = sys.argv[2]
known = {
    database_name + "-wal",
    database_name + "-shm",
    database_name + "-journal",
}


def namespace():
    return sorted(name for name in os.listdir(parent_fd) if name.startswith(database_name + "-"))


before = namespace()
known_present = sorted(set(before) & known)
unknown_present = sorted(set(before) - known)
if known_present:
    raise SystemExit("ROLLBACK_SQLITE_KNOWN_SIDECAR_REAPPEARED:" + ",".join(known_present))
if unknown_present:
    raise SystemExit("ROLLBACK_SQLITE_UNKNOWN_SIDECAR_NAMESPACE:" + ",".join(unknown_present))
for name in sorted(known):
    try:
        os.stat(name, dir_fd=parent_fd, follow_symlinks=False)
    except FileNotFoundError:
        continue
    raise SystemExit("ROLLBACK_SQLITE_KNOWN_SIDECAR_REAPPEARED:" + name)
after = namespace()
if after != before or after:
    raise SystemExit("ROLLBACK_SQLITE_SIDECAR_NAMESPACE_CHANGED_DURING_REVALIDATION")
print("ROLLBACK_SQLITE_SIDECAR_NAMESPACE_ABSENT")
PY
}

contain_exact_named_rollback_containers() {
  python3 -I - "${CURRENT_GATEWAY_CONTAINER_ID}" "${CURRENT_SCHEDULER_CONTAINER_ID}" <<'PY'
import json
import re
import subprocess
import time

roles = (
    ("gateway", "kidults-gateway", "/kidults-gateway"),
    ("scheduler", "kidults-scheduler", "/kidults-scheduler"),
)
resolved = {}
failures = []


def inspect_one(reference):
    completed = subprocess.run(
        ["docker", "inspect", reference],
        stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if completed.returncode != 0:
        raise RuntimeError("INSPECT_FAILED")
    try:
        payload = json.loads(completed.stdout)
    except (UnicodeDecodeError, json.JSONDecodeError):
        raise RuntimeError("INVALID_INSPECT_JSON")
    if not isinstance(payload, list) or len(payload) != 1:
        raise RuntimeError("INSPECT_CLOSURE")
    return payload[0]


def resolve_exact_name(query, expected_name):
    completed = subprocess.run(
        ["docker", "container", "ls", "-a", "--no-trunc", "--filter", f"name=^/{query}$", "--format", "{{.ID}}\t{{.Names}}"],
        stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if completed.returncode != 0:
        raise RuntimeError("EXACT_NAME_ENUMERATION_FAILED")
    try:
        lines = [line for line in completed.stdout.decode("utf-8").splitlines() if line]
    except UnicodeDecodeError:
        raise RuntimeError("EXACT_NAME_ENUMERATION_INVALID")
    if not lines:
        return None
    if len(lines) != 1:
        raise RuntimeError("EXACT_NAME_ENUMERATION_CLOSURE")
    fields = lines[0].split("\t")
    if len(fields) != 2 or fields[1] != query or re.fullmatch(r"[0-9a-f]{64}", fields[0]) is None:
        raise RuntimeError("EXACT_NAME_ENUMERATION_BINDING")
    item = inspect_one(fields[0])
    if item.get("Id") != fields[0] or item.get("Name") != expected_name:
        raise RuntimeError("ID_OR_NAME_REBOUND")
    return fields[0]


previous_snapshot = None
for _ in range(4):
    snapshot = {}
    for role, query, expected_name in roles:
        try:
            snapshot[role] = resolve_exact_name(query, expected_name)
        except RuntimeError as error:
            failures.append(f"{role}:{error}")
    if failures:
        break
    for role, _, _ in roles:
        identifier = snapshot[role]
        if not identifier:
            continue
        for command in (
            ["docker", "update", "--restart=no", identifier],
            ["docker", "stop", "--time", "30", identifier],
        ):
            completed = subprocess.run(
                command,
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                check=False,
            )
            if completed.returncode != 0:
                failures.append(f"{role}:{command[1].upper()}_FAILED")
    if failures:
        break
    verified = {}
    for role, query, expected_name in roles:
        try:
            identifier = resolve_exact_name(query, expected_name)
        except RuntimeError as error:
            failures.append(f"{role}:FINAL_{error}")
            continue
        verified[role] = identifier
        if identifier != snapshot[role] or identifier is None:
            continue
        try:
            item = inspect_one(identifier)
        except RuntimeError as error:
            failures.append(f"{role}:FINAL_{error}")
            continue
        state = item.get("State", {})
        policy = item.get("HostConfig", {}).get("RestartPolicy", {}).get("Name")
        if (
            policy != "no"
            or state.get("Running") is not False
            or state.get("Paused") is not False
            or state.get("Restarting") is not False
            or state.get("Pid") != 0
            or state.get("Status") not in {"created", "exited"}
        ):
            failures.append(f"{role}:FINAL_STATE_UNSAFE")
    if failures:
        break
    if verified == snapshot and verified == previous_snapshot:
        resolved = verified
        break
    previous_snapshot = verified
    time.sleep(0.25)
else:
    failures.append("EXACT_NAME_NAMESPACE_DID_NOT_CONVERGE")

if failures:
    raise SystemExit("ROLLBACK_EXACT_NAME_CONTAINMENT_UNVERIFIED:" + ",".join(failures))
present = sum(value is not None for value in resolved.values())
if present == 2:
    state = "EXACT_NAMED_PAIR_RESTART_DISABLED_AND_STOPPED"
elif present == 1:
    state = "EXACT_NAMED_PRESENT_CONTAINED_PARTIAL_ABSENCE_HOLD"
else:
    state = "NO_EXACT_NAMED_CONTAINERS_PRESENT_HOLD"
print(state, resolved.get("gateway") or "ABSENT", resolved.get("scheduler") or "ABSENT", sep="\t")
PY
}

ROLLBACK_PIN_ROOT_ID=""
PREPARED_ROLLBACK_ID=""
ROLLBACK_PIN_ROOT_STABLE=""
ROLLBACK_TRANSACTION_ACTIVE=false
ROLLBACK_TERMINAL_SUCCESS=false
ROLLBACK_TERMINAL_SUCCESS_MANIFEST_SHA256=""
ROLLBACK_PHASE="PREFLIGHT"
CURRENT_GATEWAY_CONTAINER_ID=""
CURRENT_SCHEDULER_CONTAINER_ID=""

append_rollback_transaction_event() {
  local phase="$1"
  local detail="${2:-}"
  python3 -I - 4 "${phase}" "${detail}" "${SOURCE_SHA}" \
    "${EXPECTED_PREDEPLOYMENT_SNAPSHOT_MANIFEST_SHA256}" "${ROLLBACK_TRIGGER}" <<'PY'
import datetime as dt
import json
import os
import stat
import sys

receipt_fd = int(sys.argv[1])
phase, detail, source_sha, snapshot_digest, trigger = sys.argv[2:]
name = "rollback-transaction-v1.jsonl"
descriptor = os.open(
    name,
    os.O_RDWR | os.O_APPEND | os.O_NOFOLLOW | os.O_NONBLOCK,
    dir_fd=receipt_fd,
)
try:
    metadata = os.fstat(descriptor)
    entry = os.stat(name, dir_fd=receipt_fd, follow_symlinks=False)
    if not stat.S_ISREG(metadata.st_mode) or metadata.st_nlink != 1 or (metadata.st_dev, metadata.st_ino) != (entry.st_dev, entry.st_ino):
        raise SystemExit("ROLLBACK_TRANSACTION_JOURNAL_IDENTITY")
    os.lseek(descriptor, 0, os.SEEK_SET)
    raw = b""
    while True:
        block = os.read(descriptor, 1024 * 1024)
        if not block:
            break
        raw += block
        if len(raw) > 4 * 1024 * 1024:
            raise SystemExit("ROLLBACK_TRANSACTION_JOURNAL_TOO_LARGE")
    lines = [line for line in raw.splitlines() if line]
    sequence = len(lines) + 1
    payload = {
        "id": "KIDULTS_PRODUCTION_ROLLBACK_TRANSACTION_EVENT_V1",
        "version": "1.0.0",
        "sequence": sequence,
        "phase": phase,
        "detail": detail,
        "observed_at": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "source_sha": source_sha,
        "snapshot_manifest_sha256": snapshot_digest,
        "trigger": trigger,
    }
    encoded = (json.dumps(payload, sort_keys=True, separators=(",", ":")) + "\n").encode("utf-8")
    remaining = memoryview(encoded)
    while remaining:
        written = os.write(descriptor, remaining)
        if written <= 0:
            raise SystemExit("ROLLBACK_TRANSACTION_JOURNAL_WRITE")
        remaining = remaining[written:]
    os.fsync(descriptor)
    os.fsync(receipt_fd)
finally:
    os.close(descriptor)
PY
}

rollback_terminal_pointer_is_authoritative() {
  [[ "${ROLLBACK_TERMINAL_SUCCESS_MANIFEST_SHA256:-}" =~ ^sha256:[0-9a-f]{64}$ ]] || return 1
  python3 -I - 5 4 "${RECEIPT_DIR_NAME}" "${SOURCE_SHA}" \
    "${EXPECTED_PREDEPLOYMENT_SNAPSHOT_MANIFEST_SHA256}" \
    "${ROLLBACK_TERMINAL_SUCCESS_MANIFEST_SHA256}" "${ROLLBACK_RECEIPT_ROOT_ID}" \
    "${ROLLBACK_RECEIPT_DIR_ID}" <<'PY'
import hashlib
import json
import os
import stat
import sys

root_fd = int(sys.argv[1])
receipt_fd = int(sys.argv[2])
name = ".kidults-rollback-active-v1.json"
descriptor = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=root_fd)
try:
    metadata = os.fstat(descriptor)
    entry = os.stat(name, dir_fd=root_fd, follow_symlinks=False)
    if (
        not stat.S_ISREG(metadata.st_mode)
        or metadata.st_nlink != 1
        or metadata.st_uid != 0
        or metadata.st_gid != 0
        or stat.S_IMODE(metadata.st_mode) != 0o600
        or (metadata.st_dev, metadata.st_ino) != (entry.st_dev, entry.st_ino)
    ):
        raise SystemExit("ROLLBACK_TERMINAL_POINTER_IDENTITY")
    raw = b""
    while True:
        block = os.read(descriptor, 1024 * 1024)
        if not block:
            break
        raw += block
        if len(raw) > 1024 * 1024:
            raise SystemExit("ROLLBACK_TERMINAL_POINTER_TOO_LARGE")
    metadata_after = os.fstat(descriptor)
    entry_after = os.stat(name, dir_fd=root_fd, follow_symlinks=False)
    stable_fields = (
        "st_dev", "st_ino", "st_size", "st_mtime_ns", "st_ctime_ns",
        "st_nlink", "st_uid", "st_gid", "st_mode",
    )
    if (
        tuple(getattr(metadata, field) for field in stable_fields)
        != tuple(getattr(metadata_after, field) for field in stable_fields)
        or (metadata_after.st_dev, metadata_after.st_ino)
        != (entry_after.st_dev, entry_after.st_ino)
        or len(raw) != metadata.st_size
    ):
        raise SystemExit("ROLLBACK_TERMINAL_POINTER_CHANGED_DURING_READ")
    payload = json.loads(raw)
    expected_pointer_keys = {
        "id", "version", "state", "receipt_directory_name", "source_sha",
        "snapshot_manifest_sha256", "receipt_root_identity",
        "receipt_directory_identity", "created_at", "terminal_success_manifest",
        "terminal_success_manifest_sha256", "prior_restart_policy_restoration_permitted",
        "nonterminal_rollback_pointer", "transitioned_at",
    }
    if (
        set(payload) != expected_pointer_keys
        or payload.get("id") != "KIDULTS_PRODUCTION_ROLLBACK_ACTIVE_TRANSACTION_V1"
        or payload.get("version") != "1.0.0"
        or payload.get("state") != "TERMINAL_SUCCESS_RESTART_POLICY_CLEANUP_PENDING"
        or payload.get("receipt_directory_name") != sys.argv[3]
        or payload.get("source_sha") != sys.argv[4]
        or payload.get("snapshot_manifest_sha256") != sys.argv[5]
        or payload.get("receipt_root_identity") != sys.argv[7]
        or payload.get("receipt_directory_identity") != sys.argv[8]
        or payload.get("terminal_success_manifest") != "rollback-terminal-success-manifest.json"
        or payload.get("terminal_success_manifest_sha256") != sys.argv[6]
        or payload.get("prior_restart_policy_restoration_permitted") is not True
        or payload.get("nonterminal_rollback_pointer") is not False
    ):
        raise SystemExit("ROLLBACK_TERMINAL_POINTER_BINDING")
finally:
    os.close(descriptor)

root_metadata = os.fstat(root_fd)
receipt_metadata = os.fstat(receipt_fd)
receipt_entry = os.stat(sys.argv[3], dir_fd=root_fd, follow_symlinks=False)
if (
    not stat.S_ISDIR(root_metadata.st_mode)
    or not stat.S_ISDIR(receipt_metadata.st_mode)
    or receipt_metadata.st_uid != 0
    or receipt_metadata.st_gid != 0
    or stat.S_IMODE(receipt_metadata.st_mode) != 0o700
    or f"{root_metadata.st_dev}:{root_metadata.st_ino}" != sys.argv[7]
    or f"{receipt_metadata.st_dev}:{receipt_metadata.st_ino}" != sys.argv[8]
    or (receipt_metadata.st_dev, receipt_metadata.st_ino) != (receipt_entry.st_dev, receipt_entry.st_ino)
):
    raise SystemExit("ROLLBACK_TERMINAL_RECEIPT_DIRECTORY_BINDING")

manifest_name = "rollback-terminal-success-manifest.json"
manifest_fd = os.open(manifest_name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=receipt_fd)
try:
    before = os.fstat(manifest_fd)
    entry_before = os.stat(manifest_name, dir_fd=receipt_fd, follow_symlinks=False)
    if (
        not stat.S_ISREG(before.st_mode)
        or before.st_nlink != 1
        or before.st_uid != 0
        or before.st_gid != 0
        or stat.S_IMODE(before.st_mode) != 0o600
        or (before.st_dev, before.st_ino) != (entry_before.st_dev, entry_before.st_ino)
    ):
        raise SystemExit("ROLLBACK_TERMINAL_SUCCESS_MANIFEST_IDENTITY")
    manifest_digest = hashlib.sha256()
    manifest_raw = b""
    while True:
        block = os.read(manifest_fd, 1024 * 1024)
        if not block:
            break
        manifest_digest.update(block)
        manifest_raw += block
        if len(manifest_raw) > 4 * 1024 * 1024:
            raise SystemExit("ROLLBACK_TERMINAL_SUCCESS_MANIFEST_TOO_LARGE")
    after = os.fstat(manifest_fd)
    entry_after = os.stat(manifest_name, dir_fd=receipt_fd, follow_symlinks=False)
    stable_fields = ("st_dev", "st_ino", "st_size", "st_mtime_ns", "st_ctime_ns", "st_nlink", "st_uid", "st_gid", "st_mode")
    if (
        tuple(getattr(before, field) for field in stable_fields) != tuple(getattr(after, field) for field in stable_fields)
        or (after.st_dev, after.st_ino) != (entry_after.st_dev, entry_after.st_ino)
    ):
        raise SystemExit("ROLLBACK_TERMINAL_SUCCESS_MANIFEST_IDENTITY")
finally:
    os.close(manifest_fd)
if "sha256:" + manifest_digest.hexdigest() != sys.argv[6]:
    raise SystemExit("ROLLBACK_TERMINAL_SUCCESS_MANIFEST_DIGEST")
manifest = json.loads(manifest_raw)
expected_manifest_keys = {
    "id", "version", "state", "commit_marker", "manifest_published_last_at_terminal_boundary",
    "restart_policy_at_commit", "receipt_directory_name", "source_sha", "snapshot_manifest_sha256",
    "rollback_receipt_sha256", "rollback_receipt_checksum_sha256", "members_at_terminal_boundary", "committed_at",
}
if (
    set(manifest) != expected_manifest_keys
    or manifest.get("id") != "KIDULTS_PRODUCTION_ROLLBACK_TERMINAL_SUCCESS_MANIFEST_V1"
    or manifest.get("version") != "1.0.0"
    or manifest.get("state") != "TERMINAL_SUCCESS_RESTART_POLICY_CLEANUP_PENDING"
    or manifest.get("commit_marker") is not True
    or manifest.get("manifest_published_last_at_terminal_boundary") is not True
    or manifest.get("restart_policy_at_commit") != "no"
    or manifest.get("receipt_directory_name") != sys.argv[3]
    or manifest.get("source_sha") != sys.argv[4]
    or manifest.get("snapshot_manifest_sha256") != sys.argv[5]
):
    raise SystemExit("ROLLBACK_TERMINAL_SUCCESS_MANIFEST_BINDING")


def scan_bound_member(member_name, capture_limit=None):
    member_fd = os.open(
        member_name,
        os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK,
        dir_fd=receipt_fd,
    )
    try:
        member_before = os.fstat(member_fd)
        member_entry_before = os.stat(member_name, dir_fd=receipt_fd, follow_symlinks=False)
        if (
            not stat.S_ISREG(member_before.st_mode)
            or member_before.st_nlink != 1
            or member_before.st_uid != 0
            or member_before.st_gid != 0
            or stat.S_IMODE(member_before.st_mode) != 0o600
            or (member_before.st_dev, member_before.st_ino)
            != (member_entry_before.st_dev, member_entry_before.st_ino)
        ):
            raise SystemExit("ROLLBACK_TERMINAL_BOUND_MEMBER_IDENTITY:" + member_name)
        digest = hashlib.sha256()
        size = 0
        captured = bytearray() if capture_limit is not None else None
        while True:
            block = os.read(member_fd, 1024 * 1024)
            if not block:
                break
            digest.update(block)
            size += len(block)
            if captured is not None:
                if size > capture_limit:
                    raise SystemExit("ROLLBACK_TERMINAL_BOUND_MEMBER_TOO_LARGE:" + member_name)
                captured.extend(block)
        member_after = os.fstat(member_fd)
        member_entry_after = os.stat(member_name, dir_fd=receipt_fd, follow_symlinks=False)
        stable_fields = (
            "st_dev", "st_ino", "st_size", "st_mtime_ns", "st_ctime_ns",
            "st_nlink", "st_uid", "st_gid", "st_mode",
        )
        if (
            tuple(getattr(member_before, field) for field in stable_fields)
            != tuple(getattr(member_after, field) for field in stable_fields)
            or (member_after.st_dev, member_after.st_ino)
            != (member_entry_after.st_dev, member_entry_after.st_ino)
            or size != member_before.st_size
        ):
            raise SystemExit("ROLLBACK_TERMINAL_BOUND_MEMBER_CHANGED:" + member_name)
        return "sha256:" + digest.hexdigest(), bytes(captured) if captured is not None else None
    finally:
        os.close(member_fd)


receipt_digest, _ = scan_bound_member("rollback-receipt.json")
checksum_digest, checksum_raw = scan_bound_member("rollback-receipt.json.sha256", 4096)
expected_checksum = f"{receipt_digest.removeprefix('sha256:')}  rollback-receipt.json\n".encode("ascii")
actual_members = set(os.listdir(receipt_fd))
manifest_members = manifest.get("members_at_terminal_boundary")
terminal_boundary_members = set(manifest_members) if isinstance(manifest_members, list) else set()
post_terminal_members = actual_members - terminal_boundary_members - {manifest_name}
allowed_post_terminal_members = {
    "restart-policy-after.json",
    "restart-policy-after.json.sha256",
}
if (
    receipt_digest != manifest.get("rollback_receipt_sha256")
    or checksum_digest != manifest.get("rollback_receipt_checksum_sha256")
    or checksum_raw != expected_checksum
    or not isinstance(manifest_members, list)
    or len(manifest_members) != len(set(manifest_members))
    or any(not isinstance(value, str) for value in manifest_members)
    or manifest_name in terminal_boundary_members
    or not (terminal_boundary_members | {manifest_name}) <= actual_members
    or post_terminal_members not in (set(), allowed_post_terminal_members)
):
    raise SystemExit("ROLLBACK_TERMINAL_SUCCESS_MANIFEST_HELD_FD_CONTEXT_BINDING")
print("ROLLBACK_TERMINAL_SUCCESS_AUTHORITY_PASS")
PY
}

transition_rollback_pointer_to_terminal_success() {
  python3 -I - 5 "${RECEIPT_DIR_NAME}" "${SOURCE_SHA}" \
    "${EXPECTED_PREDEPLOYMENT_SNAPSHOT_MANIFEST_SHA256}" "${ROLLBACK_RECEIPT_ROOT_ID}" \
    "${ROLLBACK_RECEIPT_DIR_ID}" "${ROLLBACK_TERMINAL_SUCCESS_MANIFEST_SHA256}" <<'PY'
import ctypes
import datetime as dt
import json
import os
import re
import secrets
import stat
import sys

root_fd = int(sys.argv[1])
name = ".kidults-rollback-active-v1.json"


def read_bound(candidate):
    descriptor = os.open(candidate, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=root_fd)
    try:
        metadata = os.fstat(descriptor)
        entry = os.stat(candidate, dir_fd=root_fd, follow_symlinks=False)
        if (
            not stat.S_ISREG(metadata.st_mode)
            or metadata.st_nlink != 1
            or metadata.st_uid != 0
            or metadata.st_gid != 0
            or stat.S_IMODE(metadata.st_mode) != 0o600
            or (metadata.st_dev, metadata.st_ino) != (entry.st_dev, entry.st_ino)
        ):
            raise SystemExit("ROLLBACK_ACTIVE_POINTER_IDENTITY")
        raw = b""
        while True:
            block = os.read(descriptor, 1024 * 1024)
            if not block:
                break
            raw += block
            if len(raw) > 1024 * 1024:
                raise SystemExit("ROLLBACK_ACTIVE_POINTER_TOO_LARGE")
        if (
            len(raw) == 0
        ):
            raise SystemExit("ROLLBACK_ACTIVE_POINTER_IDENTITY")
        after = os.fstat(descriptor)
        entry_after = os.stat(candidate, dir_fd=root_fd, follow_symlinks=False)
        stable_fields = (
            "st_dev", "st_ino", "st_size", "st_mtime_ns", "st_ctime_ns",
            "st_nlink", "st_uid", "st_gid", "st_mode",
        )
        if (
            tuple(getattr(metadata, field) for field in stable_fields)
            != tuple(getattr(after, field) for field in stable_fields)
            or (after.st_dev, after.st_ino) != (entry_after.st_dev, entry_after.st_ino)
            or len(raw) != metadata.st_size
        ):
            raise SystemExit("ROLLBACK_ACTIVE_POINTER_CHANGED_DURING_READ")
        return raw, json.loads(raw)
    finally:
        os.close(descriptor)


active_keys = {
    "id", "version", "state", "receipt_directory_name", "source_sha",
    "snapshot_manifest_sha256", "receipt_root_identity",
    "receipt_directory_identity", "created_at",
}
terminal_keys = active_keys | {
    "terminal_success_manifest", "terminal_success_manifest_sha256",
    "prior_restart_policy_restoration_permitted", "nonterminal_rollback_pointer",
    "transitioned_at",
}


def require_pointer_binding(payload, expected_state):
    expected_keys = active_keys if expected_state == "ACTIVE_HOLD_ON_REENTRY" else terminal_keys
    if (
        not isinstance(payload, dict)
        or set(payload) != expected_keys
        or payload.get("id") != "KIDULTS_PRODUCTION_ROLLBACK_ACTIVE_TRANSACTION_V1"
        or payload.get("version") != "1.0.0"
        or payload.get("state") != expected_state
        or payload.get("receipt_directory_name") != sys.argv[2]
        or payload.get("source_sha") != sys.argv[3]
        or payload.get("snapshot_manifest_sha256") != sys.argv[4]
        or payload.get("receipt_root_identity") != sys.argv[5]
        or payload.get("receipt_directory_identity") != sys.argv[6]
    ):
        raise SystemExit("ROLLBACK_ACTIVE_POINTER_BINDING_BEFORE_TERMINAL_TRANSITION")
    if expected_state == "TERMINAL_SUCCESS_RESTART_POLICY_CLEANUP_PENDING" and (
        payload.get("terminal_success_manifest") != "rollback-terminal-success-manifest.json"
        or payload.get("terminal_success_manifest_sha256") != sys.argv[7]
        or payload.get("prior_restart_policy_restoration_permitted") is not True
        or payload.get("nonterminal_rollback_pointer") is not False
        or not isinstance(payload.get("transitioned_at"), str)
    ):
        raise SystemExit("ROLLBACK_TERMINAL_POINTER_RECOVERY_BINDING")


active_raw, active = read_bound(name)
if active.get("state") not in {
    "ACTIVE_HOLD_ON_REENTRY",
    "TERMINAL_SUCCESS_RESTART_POLICY_CLEANUP_PENDING",
}:
    raise SystemExit("ROLLBACK_ACTIVE_POINTER_STATE_BEFORE_TERMINAL_TRANSITION")
require_pointer_binding(active, active["state"])
stale_stages = sorted(
    value for value in os.listdir(root_fd)
    if re.fullmatch(r"\.kidults-rollback-active-v1\.terminal\.[0-9a-f]{64}\.tmp", value)
)
if len(stale_stages) > 1:
    raise SystemExit("ROLLBACK_TERMINAL_POINTER_STALE_STAGE_CLOSURE_HOLD")
if stale_stages:
    stale_name = stale_stages[0]
    _, stale = read_bound(stale_name)
    if active["state"] == "TERMINAL_SUCCESS_RESTART_POLICY_CLEANUP_PENDING":
        require_pointer_binding(stale, "ACTIVE_HOLD_ON_REENTRY")
        os.unlink(stale_name, dir_fd=root_fd)
        os.fsync(root_fd)
        print("ROLLBACK_TERMINAL_POINTER_TRANSITION_RECOVERED_OLD_ACTIVE_STAGE")
        raise SystemExit(0)
    require_pointer_binding(stale, "TERMINAL_SUCCESS_RESTART_POLICY_CLEANUP_PENDING")
    os.unlink(stale_name, dir_fd=root_fd)
    os.fsync(root_fd)
require_pointer_binding(active, "ACTIVE_HOLD_ON_REENTRY")
stage_name = f".kidults-rollback-active-v1.terminal.{secrets.token_hex(32)}.tmp"
terminal = {
    **active,
    "state": "TERMINAL_SUCCESS_RESTART_POLICY_CLEANUP_PENDING",
    "terminal_success_manifest": "rollback-terminal-success-manifest.json",
    "terminal_success_manifest_sha256": sys.argv[7],
    "prior_restart_policy_restoration_permitted": True,
    "nonterminal_rollback_pointer": False,
    "transitioned_at": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
}
terminal_raw = (json.dumps(terminal, indent=2) + "\n").encode("utf-8")
stage_fd = os.open(stage_name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=root_fd)
try:
    remaining = memoryview(terminal_raw)
    while remaining:
        written = os.write(stage_fd, remaining)
        if written <= 0:
            raise SystemExit("ROLLBACK_TERMINAL_POINTER_STAGE_WRITE")
        remaining = remaining[written:]
    os.fsync(stage_fd)
finally:
    os.close(stage_fd)
os.fsync(root_fd)
libc = ctypes.CDLL(None, use_errno=True)
renameat2 = getattr(libc, "renameat2", None)
if renameat2 is None:
    raise SystemExit("ROLLBACK_TERMINAL_POINTER_RENAME_EXCHANGE_REQUIRED")
renameat2.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint]
renameat2.restype = ctypes.c_int
if renameat2(root_fd, os.fsencode(stage_name), root_fd, os.fsencode(name), 2) != 0:
    number = ctypes.get_errno()
    raise OSError(number, os.strerror(number))
os.fsync(root_fd)
published_raw, published = read_bound(name)
replaced_raw, replaced = read_bound(stage_name)
if published_raw != terminal_raw or published != terminal:
    raise SystemExit("ROLLBACK_TERMINAL_POINTER_PUBLICATION_BINDING")
if replaced_raw != active_raw or replaced != active:
    raise SystemExit("ROLLBACK_TERMINAL_POINTER_REPLACED_ACTIVE_BINDING")
os.unlink(stage_name, dir_fd=root_fd)
os.fsync(root_fd)
print("ROLLBACK_TERMINAL_POINTER_TRANSITION_PASS")
PY
}

write_rollback_error_receipt() {
  local exit_code="$1"
  local signal_name="$2"
  local containment="$3"
  python3 -I - 4 "${exit_code}" "${signal_name}" "${ROLLBACK_PHASE}" "${containment}" \
    "${CURRENT_GATEWAY_CONTAINER_ID}" "${CURRENT_SCHEDULER_CONTAINER_ID}" \
    "${ROLLBACK_TERMINAL_SUCCESS}" "${SOURCE_SHA}" \
    "${EXPECTED_PREDEPLOYMENT_SNAPSHOT_MANIFEST_SHA256}" "${RECEIPT_DIR_NAME}" <<'PY'
import ctypes
import datetime as dt
import hashlib
import json
import os
import re
import secrets
import stat
import sys

receipt_fd = int(sys.argv[1])
terminal_success = sys.argv[8] == "true"
payload = {
    "id": "KIDULTS_PRODUCTION_ROLLBACK_ERROR_RECEIPT_V1",
    "version": "1.0.0",
    "state": "TERMINAL_SUCCESS_CLEANUP_HOLD" if terminal_success else "FAILED_HOLD",
    "exit_code": int(sys.argv[2]),
    "signal": sys.argv[3],
    "failed_phase": sys.argv[4],
    "containment": sys.argv[5],
    "container_ids": {"gateway": sys.argv[6] or None, "scheduler": sys.argv[7] or None},
    "terminal_success_authoritative": terminal_success,
    "source_sha": sys.argv[9],
    "snapshot_manifest_sha256": sys.argv[10],
    "receipt_directory_name": sys.argv[11],
    "observed_at": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
    "production_restart_is_forbidden_while_active_pointer_exists": True,
}
raw = (json.dumps(payload, indent=2) + "\n").encode("utf-8")
checksum = f"{hashlib.sha256(raw).hexdigest()}  rollback-error-receipt.json\n".encode("ascii")
manifest = {
    "id": "KIDULTS_PRODUCTION_ROLLBACK_ERROR_MANIFEST_V1",
    "version": "1.0.0",
    "state": payload["state"],
    "commit_marker": True,
    "manifest_published_last": True,
    "members": ["rollback-error-receipt.json", "rollback-error-receipt.json.sha256"],
    "rollback_error_receipt_sha256": "sha256:" + hashlib.sha256(raw).hexdigest(),
    "rollback_error_checksum_sha256": "sha256:" + hashlib.sha256(checksum).hexdigest(),
    "source_sha": payload["source_sha"],
    "snapshot_manifest_sha256": payload["snapshot_manifest_sha256"],
    "receipt_directory_name": payload["receipt_directory_name"],
    "observed_at": payload["observed_at"],
}
manifest_raw = (json.dumps(manifest, indent=2) + "\n").encode("utf-8")
finals = {
    "rollback-error-receipt.json": raw,
    "rollback-error-receipt.json.sha256": checksum,
    "rollback-error-manifest.json": manifest_raw,
}
test_hooks = os.environ.get("KIDULTS_ROLLBACK_ERROR_RECEIPT_TEST_HOOKS")
test_fail_phase = os.environ.get("KIDULTS_ROLLBACK_ERROR_RECEIPT_TEST_FAIL_PHASE", "")
allowed_test_phases = {
    "after_receipt_stage",
    "after_checksum_stage",
    "after_receipt_publish",
    "after_checksum_publish",
    "before_manifest_publish",
    "after_manifest_publish",
}
if test_fail_phase and test_hooks != "ENABLED_FAIL_CLOSED_ONLY":
    raise SystemExit("ROLLBACK_ERROR_RECEIPT_TEST_HOOK_FORBIDDEN")
if test_fail_phase not in allowed_test_phases | {""}:
    raise SystemExit("ROLLBACK_ERROR_RECEIPT_TEST_PHASE_INVALID")


def maybe_fail(phase):
    if test_fail_phase == phase:
        raise SystemExit("ROLLBACK_ERROR_RECEIPT_INJECTED_FAILURE:" + phase)


def write_all(descriptor, body):
    remaining = memoryview(body)
    while remaining:
        written = os.write(descriptor, remaining)
        if written <= 0:
            raise SystemExit("ROLLBACK_ERROR_RECEIPT_STAGE_WRITE")
        remaining = remaining[written:]


def rename_noreplace(source, destination):
    libc = ctypes.CDLL(None, use_errno=True)
    function = getattr(libc, "renameat2", None)
    if function is None:
        raise SystemExit("ROLLBACK_ERROR_RECEIPT_RENAME_NOREPLACE_REQUIRED")
    function.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint]
    function.restype = ctypes.c_int
    if function(receipt_fd, os.fsencode(source), receipt_fd, os.fsencode(destination), 1) != 0:
        number = ctypes.get_errno()
        raise OSError(number, os.strerror(number))


def require_regular_single_link(name, expected=None):
    descriptor = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=receipt_fd)
    try:
        metadata = os.fstat(descriptor)
        entry = os.stat(name, dir_fd=receipt_fd, follow_symlinks=False)
        if (
            not stat.S_ISREG(metadata.st_mode)
            or metadata.st_nlink != 1
            or metadata.st_uid != os.geteuid()
            or metadata.st_gid != os.getegid()
            or stat.S_IMODE(metadata.st_mode) != 0o600
            or (metadata.st_dev, metadata.st_ino) != (entry.st_dev, entry.st_ino)
        ):
            raise SystemExit("ROLLBACK_ERROR_RECEIPT_MEMBER_IDENTITY:" + name)
        body = b""
        while True:
            block = os.read(descriptor, 1024 * 1024)
            if not block:
                break
            body += block
            if len(body) > 4 * 1024 * 1024:
                raise SystemExit("ROLLBACK_ERROR_RECEIPT_MEMBER_TOO_LARGE:" + name)
        if expected is not None and body != expected:
            raise SystemExit("ROLLBACK_ERROR_RECEIPT_MEMBER_BYTES:" + name)
        return body
    finally:
        os.close(descriptor)


def digest_stable_cohort_member(name):
    descriptor = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=receipt_fd)
    try:
        before = os.fstat(descriptor)
        entry_before = os.stat(name, dir_fd=receipt_fd, follow_symlinks=False)
        if (
            not stat.S_ISREG(before.st_mode)
            or before.st_nlink != 1
            or before.st_uid != os.geteuid()
            or before.st_gid != os.getegid()
            or stat.S_IMODE(before.st_mode) != 0o600
            or (before.st_dev, before.st_ino) != (entry_before.st_dev, entry_before.st_ino)
        ):
            raise SystemExit("ROLLBACK_ERROR_PARTIAL_COHORT_IDENTITY:" + name)
        digest = hashlib.sha256()
        size = 0
        while True:
            block = os.read(descriptor, 1024 * 1024)
            if not block:
                break
            digest.update(block)
            size += len(block)
        after = os.fstat(descriptor)
        entry_after = os.stat(name, dir_fd=receipt_fd, follow_symlinks=False)
        fields = ("st_dev", "st_ino", "st_size", "st_mtime_ns", "st_ctime_ns", "st_nlink", "st_uid", "st_gid", "st_mode")
        if (
            tuple(getattr(before, field) for field in fields) != tuple(getattr(after, field) for field in fields)
            or (after.st_dev, after.st_ino) != (entry_after.st_dev, entry_after.st_ino)
            or size != before.st_size
        ):
            raise SystemExit("ROLLBACK_ERROR_PARTIAL_COHORT_CHANGED:" + name)
        return {"name": name, "sha256": "sha256:" + digest.hexdigest(), "size": size}
    finally:
        os.close(descriptor)


if not stat.S_ISDIR(os.fstat(receipt_fd).st_mode):
    raise SystemExit("ROLLBACK_ERROR_RECEIPT_PARENT_NOT_DIRECTORY")
actual_before = set(os.listdir(receipt_fd))
if any(name in actual_before for name in finals) or any(name.startswith(".rollback-error-") for name in actual_before):
    raise SystemExit("ROLLBACK_ERROR_RECEIPT_PREEXISTING_TRANSACTION_HOLD")
if any(
    re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,127}", name) is None
    and re.fullmatch(r"\.rollback-terminal-success\.[0-9a-f]{64}\.tmp", name) is None
    for name in actual_before
):
    raise SystemExit("ROLLBACK_ERROR_PARTIAL_COHORT_MEMBER_NAME_HOLD")
partial_cohort = [digest_stable_cohort_member(name) for name in sorted(actual_before)]
manifest["partial_cohort_exact_members"] = partial_cohort
manifest["partial_cohort_member_count"] = len(partial_cohort)
manifest_raw = (json.dumps(manifest, indent=2) + "\n").encode("utf-8")
finals["rollback-error-manifest.json"] = manifest_raw
token = secrets.token_hex(32)
stages = {
    final_name: f".rollback-error-{token}-{index}.tmp"
    for index, final_name in enumerate(finals)
}
for index, (final_name, body) in enumerate(finals.items()):
    stage_name = stages[final_name]
    descriptor = os.open(stage_name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=receipt_fd)
    try:
        write_all(descriptor, body)
        os.fsync(descriptor)
    finally:
        os.close(descriptor)
    require_regular_single_link(stage_name, body)
    if index == 0:
        maybe_fail("after_receipt_stage")
    elif index == 1:
        maybe_fail("after_checksum_stage")
os.fsync(receipt_fd)
rename_noreplace(stages["rollback-error-receipt.json"], "rollback-error-receipt.json")
os.fsync(receipt_fd)
require_regular_single_link("rollback-error-receipt.json", raw)
maybe_fail("after_receipt_publish")
rename_noreplace(stages["rollback-error-receipt.json.sha256"], "rollback-error-receipt.json.sha256")
os.fsync(receipt_fd)
require_regular_single_link("rollback-error-receipt.json.sha256", checksum)
maybe_fail("after_checksum_publish")
maybe_fail("before_manifest_publish")
rename_noreplace(stages["rollback-error-manifest.json"], "rollback-error-manifest.json")
os.fsync(receipt_fd)
maybe_fail("after_manifest_publish")
actual_after = set(os.listdir(receipt_fd))
error_namespace = {name for name in actual_after if name.startswith("rollback-error-")}
if (
    actual_after != actual_before | set(finals)
    or error_namespace != set(finals)
    or any(name.startswith(".rollback-error-") for name in actual_after)
):
    raise SystemExit("ROLLBACK_ERROR_RECEIPT_EXACT_CLOSURE")
if [digest_stable_cohort_member(name) for name in sorted(actual_before)] != partial_cohort:
    raise SystemExit("ROLLBACK_ERROR_PARTIAL_COHORT_DIGEST_CHANGED")
for final_name, body in finals.items():
    require_regular_single_link(final_name, body)
if json.loads(require_regular_single_link("rollback-error-manifest.json")) != manifest:
    raise SystemExit("ROLLBACK_ERROR_RECEIPT_MANIFEST_BINDING")
os.fsync(receipt_fd)
print("ROLLBACK_ERROR_RECEIPT_COMMITTED_MANIFEST_LAST")
PY
}

rollback_failure_trap() {
  local exit_code="$1"
  local signal_name="$2"
  # The first fault owns containment.  Ignore nested ERR/INT/TERM until the
  # manifest-last error receipt is durably committed or this handler exits.
  trap '' ERR INT TERM
  set +e
  local terminal_authority=false
  if rollback_terminal_pointer_is_authoritative >/dev/null 2>&1; then
    terminal_authority=true
    ROLLBACK_TERMINAL_SUCCESS=true
  fi
  local containment="CONTAINMENT_UNVERIFIED_HOLD"
  local containment_line=""
  if containment_line="$(contain_exact_named_rollback_containers 2>/dev/null)"; then
    local resolved_gateway="ABSENT"
    local resolved_scheduler="ABSENT"
    IFS=$'\t' read -r containment resolved_gateway resolved_scheduler <<< "${containment_line}"
    if [[ "${resolved_gateway}" =~ ^[0-9a-f]{64}$ ]]; then
      CURRENT_GATEWAY_CONTAINER_ID="${resolved_gateway}"
    else
      CURRENT_GATEWAY_CONTAINER_ID=""
    fi
    if [[ "${resolved_scheduler}" =~ ^[0-9a-f]{64}$ ]]; then
      CURRENT_SCHEDULER_CONTAINER_ID="${resolved_scheduler}"
    else
      CURRENT_SCHEDULER_CONTAINER_ID=""
    fi
  fi
  local journal_status=0
  if [[ "${terminal_authority}" == "true" ]]; then
    append_rollback_transaction_event "TERMINAL_SUCCESS_CLEANUP_HOLD" \
      "${signal_name}:${exit_code}:${containment}" >/dev/null 2>&1 || journal_status=$?
  else
    append_rollback_transaction_event "FAILED_HOLD" \
      "${signal_name}:${exit_code}:${containment}" >/dev/null 2>&1 || journal_status=$?
  fi
  local error_receipt_status=0
  write_rollback_error_receipt "${exit_code}" "${signal_name}" "${containment}" \
    || error_receipt_status=$?
  if (( error_receipt_status != 0 )); then
    append_rollback_transaction_event "ERROR_RECEIPT_PUBLICATION_HOLD" \
      "writer_status:${error_receipt_status}:prior_journal_status:${journal_status}" >/dev/null 2>&1 || true
    echo "CRITICAL: rollback error receipt did not reach manifest-last closure; pointer retained for HOLD (writer_status=${error_receipt_status})" >&2
    exit 74
  fi
  if (( journal_status != 0 )); then
    echo "CRITICAL: rollback failure journal append failed, but the manifest-last error receipt is authoritative (journal_status=${journal_status})" >&2
  fi
  exit "${exit_code}"
}
if [[ "${EXECUTE}" == "true" || "${PREPARE_ONLY}" == "true" ]]; then
  [[ "${EUID}" -eq 0 ]] || fail "Production rollback execution requires the protected root executor"
  [[ "${PROD_ROOT_REAL}" == "${CANONICAL_PROD_ROOT}" ]] || fail "Production rollback requires the canonical runtime root"
  [[ "${PROD_DB_REAL}" == "${CANONICAL_PROD_DB}" ]] || fail "Production rollback requires the canonical database path"
  [[ "$(git -C "${PROD_ROOT}" symbolic-ref -q HEAD)" == "refs/heads/main" ]] || fail "Production rollback runtime must remain on protected main"
  PROD_SOURCE_ORIGIN="$(git -C "${PROD_ROOT}" remote get-url origin)"
  [[ "${PROD_SOURCE_ORIGIN}" == "https://github.com/johnkim9524-collab/kaios_enterprise_repo.git" || "${PROD_SOURCE_ORIGIN}" == "https://github.com/johnkim9524-collab/kaios_enterprise_repo" ]] || fail "Production rollback requires the canonical repository origin"
  test -d "${ROLLBACK_PIN_ROOT}" && test ! -L "${ROLLBACK_PIN_ROOT}" || fail "Protected rollback input root is missing or unsafe"
  exec 9<"${ROLLBACK_PIN_ROOT}" || fail "Protected rollback input root cannot be opened"
  ROLLBACK_PIN_ROOT_ID="$(verify_protected_directory_chain_fd "${ROLLBACK_PIN_ROOT}" 9)" \
    || fail "Protected rollback input ancestry or identity is invalid"
  [[ "${ROLLBACK_PIN_ROOT_ID}" =~ ^[0-9]+:[0-9]+$ ]] || fail "Protected rollback input root identity is invalid"
  ROLLBACK_PIN_ROOT_STABLE="/proc/self/fd/9"
  SQLITE_RESTORE_HELPER_PARENT="${PROD_ROOT}/scripts/production"
  test -d "${SQLITE_RESTORE_HELPER_PARENT}" && test ! -L "${SQLITE_RESTORE_HELPER_PARENT}" \
    || fail "Tracked SQLite rollback restore helper parent is missing or unsafe"
  exec 6<"${SQLITE_RESTORE_HELPER_PARENT}" || fail "Tracked SQLite rollback restore helper parent cannot be opened"
  SQLITE_RESTORE_HELPER_PARENT_ID="$(verify_protected_directory_chain_fd "${SQLITE_RESTORE_HELPER_PARENT}" 6)" \
    || fail "Tracked SQLite rollback restore helper ancestry or identity is invalid"
  [[ "${SQLITE_RESTORE_HELPER_PARENT_ID}" =~ ^[0-9]+:[0-9]+$ ]] \
    || fail "Tracked SQLite rollback restore helper parent identity is invalid"
  SQLITE_RESTORE_HELPER_STABLE="/proc/self/fd/6/restore-kidults-sqlite-rollback-v1.py"
  EXPECTED_SQLITE_RESTORE_HELPER_BLOB="$(git -C "${PROD_ROOT}" rev-parse "${SOURCE_SHA}:scripts/production/restore-kidults-sqlite-rollback-v1.py")" \
    || fail "SQLite rollback restore helper is not tracked at the signed source SHA"
  [[ "${EXPECTED_SQLITE_RESTORE_HELPER_BLOB}" =~ ^[0-9a-f]{40}$ ]] \
    || fail "SQLite rollback restore helper Git blob is invalid"
  verify_sqlite_restore_helper_fd || fail "SQLite rollback restore helper is not the protected signed-source program"
fi

if [[ "${EXECUTE}" == "true" ]]; then
  test -n "${PREPARED_ROLLBACK_DIR}" || fail "A pre-mutation durable pinned rollback directory is required"
  EXPECTED_PREPARED_ROLLBACK_DIR="${ROLLBACK_PIN_ROOT}/${EXPECTED_PREDEPLOYMENT_SNAPSHOT_MANIFEST_SHA256#sha256:}"
  [[ "${PREPARED_ROLLBACK_DIR}" == "${EXPECTED_PREPARED_ROLLBACK_DIR}" ]] || fail "Prepared rollback input path is not digest-bound"
  exec 8<"${ROLLBACK_PIN_ROOT_STABLE}/${EXPECTED_PREDEPLOYMENT_SNAPSHOT_MANIFEST_SHA256#sha256:}" \
    || fail "Prepared rollback input cannot be opened through the stable root"
  PREPARED_ROLLBACK_ID="$(verify_protected_directory_chain_fd "${EXPECTED_PREPARED_ROLLBACK_DIR}" 8)" \
    || fail "Prepared rollback input ancestry or identity is invalid"
  [[ "${PREPARED_ROLLBACK_ID}" =~ ^[0-9]+:[0-9]+$ ]] || fail "Prepared rollback input identity is invalid"
  PREDEPLOYMENT_SNAPSHOT_DIR="/proc/self/fd/8"
  test -f "${PREDEPLOYMENT_SNAPSHOT_DIR}/manifest.json" || fail "Prepared rollback manifest is missing"
  ORIGINAL_SNAPSHOT_DIR="$(python3 -I - "${PREDEPLOYMENT_SNAPSHOT_DIR}/manifest.json" <<'PY'
import json
import sys
from pathlib import Path
value = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8")).get("snapshot_directory")
if not isinstance(value, str) or not value.startswith("/"):
    raise SystemExit("snapshot_directory binding is invalid")
print(value)
PY
)" || fail "Prepared rollback origin binding is invalid"
else
  test -n "${PREDEPLOYMENT_SNAPSHOT_DIR}" || fail "PREDEPLOYMENT_SNAPSHOT_DIR is required"
  test -d "${PREDEPLOYMENT_SNAPSHOT_DIR}" || fail "Predeployment snapshot directory not found"
  test -f "${PREDEPLOYMENT_SNAPSHOT_DIR}/manifest.json" || fail "Snapshot manifest missing"
  ORIGINAL_SNAPSHOT_DIR="$(realpath -e "${PREDEPLOYMENT_SNAPSHOT_DIR}")"
fi

if [[ "${EXECUTE}" == "true" ]]; then
  [[ "$(basename "${PROD_DB}")" == "kaios.db" ]] || fail "Production database basename is invalid"
  exec 7<"${PROD_DB_PARENT_REAL}" || fail "Production database parent cannot be opened"
  PROD_DB_PARENT_ID="$(verify_protected_database_parent_fd "${PROD_DB_PARENT_REAL}" 7)" \
    || fail "Production database parent ancestry or stable identity is invalid"
  [[ "${PROD_DB_PARENT_ID}" =~ ^[0-9]+:[0-9]+$ ]] || fail "Production database parent identity is invalid"
  verify_existing_database_entry_fd || fail "Production database entry is unsafe"
  exec 10<"${PROD_ROOT_REAL}" || fail "Production runtime root cannot be opened"
  PROD_ROOT_ID="$(verify_protected_directory_chain_fd "${PROD_ROOT_REAL}" 10)" \
    || fail "Production runtime root ancestry or stable identity is invalid"
  [[ "${PROD_ROOT_ID}" =~ ^[0-9]+:[0-9]+$ ]] || fail "Production runtime root identity is invalid"
  test -n "${ROLLBACK_AUTHORIZATION_FILE}" || fail "Protected rollback authorization is required"
  test -d "${ROLLBACK_AUTHORIZATION_ROOT}" || fail "Protected rollback authorization root is missing"
  python3 -I - "${ROLLBACK_AUTHORIZATION_FILE}" "${ROLLBACK_AUTHORIZATION_ROOT}" \
    "${EXPECTED_PREDEPLOYMENT_SNAPSHOT_MANIFEST_SHA256}" "${SOURCE_SHA}" \
    "${ROLLBACK_PIN_ROOT_ID}" "${PREPARED_ROLLBACK_ID}" <<'PY'
import json
import stat
import sys
from pathlib import Path

candidate = Path(sys.argv[1])
root = Path(sys.argv[2]).resolve(strict=True)
if candidate.is_symlink() or not candidate.is_file():
    raise SystemExit("ROLLBACK_AUTHORIZATION_NOT_REGULAR")
resolved = candidate.resolve(strict=True)
if root not in resolved.parents or resolved.name != "local-consumption.json":
    raise SystemExit("ROLLBACK_AUTHORIZATION_PATH")
for component in (root, resolved.parent, resolved):
    metadata = component.stat()
    if metadata.st_uid != 0 or stat.S_IMODE(metadata.st_mode) & 0o022:
        raise SystemExit("ROLLBACK_AUTHORIZATION_PERMISSIONS")
payload = json.loads(resolved.read_text(encoding="utf-8"))
checks = [
    payload.get("id") == "KIDULTS_LOCAL_PRODUCTION_RELEASE_CONSUMPTION_V1",
    payload.get("version") == "1.0.0",
    payload.get("state") == "CONSUMED_BEFORE_FIRST_PRODUCTION_MUTATION",
    payload.get("execution_mode") == "CONTROLLED_PRODUCTION_PROMOTION",
    payload.get("source_sha") == sys.argv[4],
    payload.get("predeployment_snapshot_manifest_sha256") == sys.argv[3],
    payload.get("rollback_pin_root_identity") == sys.argv[5],
    payload.get("prepared_rollback_identity") == sys.argv[6],
]
if not all(checks):
    raise SystemExit("ROLLBACK_AUTHORIZATION_BINDING")
PY
fi

FINAL_PREPARED_ROLLBACK_DIR=""
FINAL_PREPARED_ROLLBACK_STABLE=""
if [[ "${EXECUTE}" == "true" ]]; then
  PINNED_SNAPSHOT_DIR="${PREDEPLOYMENT_SNAPSHOT_DIR}"
elif [[ "${PREPARE_ONLY}" == "true" ]]; then
  FINAL_PREPARED_ROLLBACK_DIR="${ROLLBACK_PIN_ROOT}/${EXPECTED_PREDEPLOYMENT_SNAPSHOT_MANIFEST_SHA256#sha256:}"
  FINAL_PREPARED_ROLLBACK_STABLE="${ROLLBACK_PIN_ROOT_STABLE}/${EXPECTED_PREDEPLOYMENT_SNAPSHOT_MANIFEST_SHA256#sha256:}"
  test ! -e "${FINAL_PREPARED_ROLLBACK_STABLE}" && test ! -L "${FINAL_PREPARED_ROLLBACK_STABLE}" || fail "Digest-bound rollback inputs are already prepared"
  PINNED_SNAPSHOT_DIR="$(mktemp -d "${ROLLBACK_PIN_ROOT_STABLE}/.prepare-rollback-input.XXXXXX")"
else
  PINNED_SNAPSHOT_DIR="$(mktemp -d "${TMPDIR:-/tmp}/kidults-rollback-input.XXXXXX")"
fi
if [[ "${EXECUTE}" != "true" ]]; then
  chmod 700 "${PINNED_SNAPSHOT_DIR}"
fi

if [[ "${EXECUTE}" != "true" ]]; then
  python3 -I - "${ORIGINAL_SNAPSHOT_DIR}" "${PINNED_SNAPSHOT_DIR}" \
    "${EXPECTED_PREDEPLOYMENT_SNAPSHOT_MANIFEST_SHA256}" "${SOURCE_SHA}" \
    "${PROD_ROOT_REAL}" "${PROD_DB_REAL}" "${PREPARE_ONLY}" <<'PY'
import hashlib
import json
import os
import re
import shutil
import stat
import sys
from pathlib import Path

source_root = Path(sys.argv[1])
pinned_root = Path(sys.argv[2])
expected_manifest_digest = sys.argv[3]
execute = sys.argv[7] == "true"

def require(condition, message):
    if not condition:
        raise SystemExit(message)

source_metadata = source_root.lstat()
require(stat.S_ISDIR(source_metadata.st_mode) and not source_root.is_symlink(), "snapshot root must be a regular directory")
if execute:
    require(source_metadata.st_uid == 0 and not stat.S_IMODE(source_metadata.st_mode) & 0o022, "snapshot root is not protected")
root_fd = os.open(source_root, os.O_RDONLY | os.O_DIRECTORY | getattr(os, "O_NOFOLLOW", 0))
try:
    manifest_fd = os.open(
        "manifest.json",
        os.O_RDONLY | os.O_NONBLOCK | getattr(os, "O_NOFOLLOW", 0),
        dir_fd=root_fd,
    )
    try:
        manifest_raw = b""
        while True:
            block = os.read(manifest_fd, 1024 * 1024)
            if not block:
                break
            manifest_raw += block
            require(len(manifest_raw) <= 1024 * 1024, "snapshot manifest is too large")
        require(stat.S_ISREG(os.fstat(manifest_fd).st_mode), "snapshot manifest is not regular")
    finally:
        os.close(manifest_fd)
    actual_manifest_digest = "sha256:" + hashlib.sha256(manifest_raw).hexdigest()
    require(actual_manifest_digest == expected_manifest_digest, "signed snapshot manifest digest mismatch")
    manifest = json.loads(manifest_raw)
    require(manifest.get("id") == "KIDULTS_PREDEPLOYMENT_SNAPSHOT_V1", "snapshot identity mismatch")
    require(manifest.get("version") == "1.0.0", "snapshot version mismatch")
    require(manifest.get("producer_id") == "KIDULTS_PREDEPLOYMENT_SNAPSHOT_COLLECTOR_V1", "snapshot producer mismatch")
    require(manifest.get("status") == "captured", "snapshot status must be captured")
    require(manifest.get("vertical") == "kidults", "snapshot vertical mismatch")
    require(manifest.get("source_sha") == sys.argv[4], "snapshot source SHA mismatch")
    require(manifest.get("production_root") == sys.argv[5], "snapshot Production root mismatch")
    require(manifest.get("production_database") == sys.argv[6], "snapshot Production database mismatch")
    require(manifest.get("database_capture_method") == "SQLITE_ONLINE_BACKUP_API", "unsafe snapshot database capture method")
    require(manifest.get("database_integrity") == "ok", "snapshot database integrity mismatch")
    require(manifest.get("snapshot_directory") == str(source_root), "snapshot directory binding mismatch")
    require(manifest.get("rollback_ready") is True, "snapshot is not rollback_ready")
    require(manifest.get("production_change_executed") is False, "snapshot must predate Production mutation")
    require(manifest.get("artfund_change_executed") is False, "Artfund isolation violated")
    required_list = manifest.get("required_rollback_files")
    require(isinstance(required_list, list) and len(required_list) == len(set(required_list)), "rollback file set is invalid")
    required = set(required_list)
    files = manifest.get("files")
    require(isinstance(files, dict) and set(files) == required, "rollback manifest file closure mismatch")
    actual_names = set(os.listdir(root_fd))
    require(actual_names == required | {"manifest.json"}, "rollback snapshot directory closure mismatch")
    require(all(isinstance(name, str) and re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,127}", name) for name in required), "rollback file name is unsafe")
    (pinned_root / "manifest.json").write_bytes(manifest_raw)
    with (pinned_root / "manifest.json").open("rb") as handle:
        os.fsync(handle.fileno())
    for name in sorted(required):
        source_fd = os.open(
            name,
            os.O_RDONLY | os.O_NONBLOCK | getattr(os, "O_NOFOLLOW", 0),
            dir_fd=root_fd,
        )
        try:
            metadata = os.fstat(source_fd)
            require(stat.S_ISREG(metadata.st_mode), f"rollback file is not regular: {name}")
            if execute:
                require(metadata.st_uid == 0 and not stat.S_IMODE(metadata.st_mode) & 0o022, f"rollback file is not protected: {name}")
            hasher = hashlib.sha256()
            with (pinned_root / name).open("xb") as target:
                while True:
                    block = os.read(source_fd, 1024 * 1024)
                    if not block:
                        break
                    hasher.update(block)
                    target.write(block)
                target.flush()
                os.fsync(target.fileno())
            require(hasher.hexdigest() == files[name], f"rollback file digest mismatch: {name}")
        finally:
            os.close(source_fd)
finally:
    os.close(root_fd)

expected_required = {
    "kaios.db", "kaios.db.sha256", "database-metadata.tsv", "database-integrity.txt",
    "env.production.snapshot", "env.production.snapshot.sha256", "docker-compose.production.yml",
    "docker-compose.production.yml.sha256", "docker-inspect.json", "rollback-images.json",
    "rollback-images.tar", "rollback-images.tar.sha256", "rollback-plan.txt",
}
require(expected_required <= required, f"rollback manifest missing required entries: {sorted(expected_required - required)}")
require(manifest.get("database_sha256") == files.get("kaios.db"), "snapshot database binding mismatch")
require(manifest.get("environment_sha256") == files.get("env.production.snapshot"), "snapshot environment binding mismatch")
require(manifest.get("compose_sha256") == files.get("docker-compose.production.yml"), "snapshot compose binding mismatch")
for data_name, checksum_name in (
    ("kaios.db", "kaios.db.sha256"),
    ("env.production.snapshot", "env.production.snapshot.sha256"),
    ("docker-compose.production.yml", "docker-compose.production.yml.sha256"),
    ("rollback-images.tar", "rollback-images.tar.sha256"),
):
    expected_line = f"{files[data_name]}  {data_name}\n"
    require((pinned_root / checksum_name).read_text(encoding="utf-8") == expected_line, f"unsafe checksum binding: {checksum_name}")
directory_fd = os.open(pinned_root, os.O_RDONLY | os.O_DIRECTORY)
try:
    os.fsync(directory_fd)
finally:
    os.close(directory_fd)
print("Rollback snapshot manifest and file digests verified.")
PY
fi

PREDEPLOYMENT_SNAPSHOT_DIR="${PINNED_SNAPSHOT_DIR}"
if [[ "${EXECUTE}" != "true" ]]; then
  find "${PREDEPLOYMENT_SNAPSHOT_DIR}" -maxdepth 1 -type f -exec chmod 400 {} +
  chmod 500 "${PREDEPLOYMENT_SNAPSHOT_DIR}"
fi

verify_pinned_snapshot() {
  python3 -I - "${PREDEPLOYMENT_SNAPSHOT_DIR}" "${EXPECTED_PREDEPLOYMENT_SNAPSHOT_MANIFEST_SHA256}" \
    "${SOURCE_SHA}" "${PROD_ROOT_REAL}" "${PROD_DB_REAL}" "${EXECUTE}" "${PREPARE_ONLY}" <<'PY'
import hashlib
import json
import re
import stat
import sys
from pathlib import Path

root = Path(sys.argv[1])
manifest_path = root / "manifest.json"
execute = sys.argv[6] == "true"
prepare = sys.argv[7] == "true"
protected = execute or prepare
if execute:
    if str(root) != "/proc/self/fd/8" or not root.is_dir():
        raise SystemExit("PINNED_SNAPSHOT_STABLE_FD_PATH_INVALID")
elif prepare:
    stable_prepare_path = re.fullmatch(r"/proc/self/fd/9/\.prepare-rollback-input\.[A-Za-z0-9]+", str(root))
    if str(root) != "/proc/self/fd/8" and stable_prepare_path is None:
        raise SystemExit("PINNED_SNAPSHOT_STABLE_FD_PATH_INVALID")
    if not root.is_dir():
        raise SystemExit("PINNED_SNAPSHOT_STABLE_FD_PATH_INVALID")
elif root.is_symlink() or not root.is_dir():
    raise SystemExit("PINNED_SNAPSHOT_PATH_INVALID")
if manifest_path.is_symlink() or not manifest_path.is_file():
    raise SystemExit("PINNED_SNAPSHOT_PATH_INVALID")
root_metadata = root.stat()
if protected and (root_metadata.st_uid != 0 or stat.S_IMODE(root_metadata.st_mode) & 0o022):
    raise SystemExit("PINNED_SNAPSHOT_ROOT_PERMISSIONS")
manifest_raw = manifest_path.read_bytes()
if "sha256:" + hashlib.sha256(manifest_raw).hexdigest() != sys.argv[2]:
    raise SystemExit("PINNED_SNAPSHOT_MANIFEST_CHANGED")
manifest = json.loads(manifest_raw)
checks = [
    manifest.get("id") == "KIDULTS_PREDEPLOYMENT_SNAPSHOT_V1",
    manifest.get("version") == "1.0.0",
    manifest.get("producer_id") == "KIDULTS_PREDEPLOYMENT_SNAPSHOT_COLLECTOR_V1",
    manifest.get("status") == "captured",
    manifest.get("vertical") == "kidults",
    manifest.get("source_sha") == sys.argv[3],
    manifest.get("production_root") == sys.argv[4],
    manifest.get("production_database") == sys.argv[5],
    manifest.get("database_capture_method") == "SQLITE_ONLINE_BACKUP_API",
    manifest.get("database_integrity") == "ok",
    manifest.get("rollback_ready") is True,
    manifest.get("production_change_executed") is False,
    manifest.get("artfund_change_executed") is False,
]
if not all(checks):
    raise SystemExit("PINNED_SNAPSHOT_CONTEXT_BINDING")
files = manifest.get("files")
required = manifest.get("required_rollback_files")
if not isinstance(files, dict) or not isinstance(required, list) or set(files) != set(required):
    raise SystemExit("PINNED_SNAPSHOT_CLOSURE")
if set(path.name for path in root.iterdir()) != set(files) | {"manifest.json"}:
    raise SystemExit("PINNED_SNAPSHOT_DIRECTORY_CHANGED")
for name, expected in files.items():
    candidate = root / name
    metadata = candidate.lstat()
    if candidate.is_symlink() or not stat.S_ISREG(metadata.st_mode):
        raise SystemExit(f"PINNED_SNAPSHOT_MEMBER_TYPE:{name}")
    if protected and (metadata.st_uid != 0 or stat.S_IMODE(metadata.st_mode) & 0o022):
        raise SystemExit(f"PINNED_SNAPSHOT_MEMBER_PERMISSIONS:{name}")
    if hashlib.sha256(candidate.read_bytes()).hexdigest() != expected:
        raise SystemExit(f"PINNED_SNAPSHOT_MEMBER_CHANGED:{name}")
PY
}

verify_pinned_snapshot

python3 -I - "${PREDEPLOYMENT_SNAPSHOT_DIR}/rollback-images.json" "${PREDEPLOYMENT_SNAPSHOT_DIR}/manifest.json" <<'PY'
import json
import re
import sys
from pathlib import Path
payload = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
manifest = json.loads(Path(sys.argv[2]).read_text(encoding="utf-8"))
def require(condition, message):
    if not condition:
        raise SystemExit(message)
require(set(payload) == {"kidults-gateway", "kidults-scheduler"}, "rollback image map must bind exact containers")
for container, value in payload.items():
    image_id = value.get("image_id", "")
    image_ref = value.get("image_ref", "")
    require(re.fullmatch(r"sha256:[0-9a-f]{64}", image_id), f"invalid image id for {container}")
    require(image_ref and not any(ch.isspace() for ch in image_ref), f"invalid image ref for {container}")
require(payload["kidults-gateway"]["image_id"] == manifest.get("gateway_image_id"), "gateway snapshot image binding mismatch")
require(payload["kidults-scheduler"]["image_id"] == manifest.get("scheduler_image_id"), "scheduler snapshot image binding mismatch")
print("Rollback image identity map verified.")
PY

DATABASE_RESTORE_METADATA="$(python3 -I - "${PREDEPLOYMENT_SNAPSHOT_DIR}/database-metadata.tsv" \
  "${PREDEPLOYMENT_SNAPSHOT_DIR}/manifest.json" <<'PY'
import json
import re
import stat
import sys
from pathlib import Path

raw = Path(sys.argv[1]).read_bytes()
match = re.fullmatch(rb"([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z)\t([0-9]+)\t([0-9]+)\t([0-7]{4})\n", raw)
if match is None:
    raise SystemExit("Invalid captured database ownership/mode metadata")
captured_at, uid_raw, gid_raw, mode_raw = (value.decode("ascii") for value in match.groups())
uid = int(uid_raw, 10)
gid = int(gid_raw, 10)
mode = int(mode_raw, 8)
if uid > 2**32 - 2 or gid > 2**32 - 2:
    raise SystemExit("Invalid captured database ownership/mode metadata")
if mode & 0o7000 or mode & 0o022:
    raise SystemExit("Unsafe captured database mode metadata")
manifest = json.loads(Path(sys.argv[2]).read_text(encoding="utf-8"))
if manifest.get("captured_at") != captured_at:
    raise SystemExit("Captured database metadata timestamp binding mismatch")
print(uid, gid, f"{mode:04o}", sep="\t")
PY
)" || fail "Captured database ownership/mode receipt is unsafe"
IFS=$'\t' read -r DB_UID DB_GID DB_MODE <<< "${DATABASE_RESTORE_METADATA}"
[[ "${DB_UID}" =~ ^[0-9]+$ && "${DB_GID}" =~ ^[0-9]+$ && "${DB_MODE}" =~ ^0[0-7]{3}$ ]] \
  || fail "Invalid normalized database ownership/mode metadata"

test -d "${PROD_ROOT}" || fail "Production root missing"
test -d "$(dirname "${PROD_DB}")" || fail "Production database directory missing"

if [[ "${PREPARE_ONLY}" == "true" ]]; then
  mv -T -- "${PREDEPLOYMENT_SNAPSHOT_DIR}" "${FINAL_PREPARED_ROLLBACK_STABLE}" || fail "Digest-bound rollback input publication failed"
  exec 8<"${FINAL_PREPARED_ROLLBACK_STABLE}" || fail "Published rollback input cannot be opened"
  PREPARED_ROLLBACK_ID="$(verify_protected_directory_chain_fd "${FINAL_PREPARED_ROLLBACK_DIR}" 8)" \
    || fail "Published rollback input ancestry or identity is invalid"
  [[ "${PREPARED_ROLLBACK_ID}" =~ ^[0-9]+:[0-9]+$ ]] || fail "Published rollback input identity is invalid"
  PREDEPLOYMENT_SNAPSHOT_DIR="/proc/self/fd/8"
  PINNED_SNAPSHOT_DIR="${PREDEPLOYMENT_SNAPSHOT_DIR}"
  python3 -I - 9 <<'PY'
import os
import sys
os.fsync(int(sys.argv[1]))
PY
  verify_pinned_snapshot
  echo "ROLLBACK PREPARE COMPLETE. Durable pinned snapshot: ${FINAL_PREPARED_ROLLBACK_DIR} root_identity=${ROLLBACK_PIN_ROOT_ID} prepared_identity=${PREPARED_ROLLBACK_ID}"
  exit 0
fi

if [[ "${EXECUTE}" != "true" ]]; then
  echo "ROLLBACK DRY RUN COMPLETE. Snapshot is machine-restorable; no Production change executed."
  chmod 700 "${PREDEPLOYMENT_SNAPSHOT_DIR}"
  find "${PREDEPLOYMENT_SNAPSHOT_DIR}" -maxdepth 1 -type f -delete
  rmdir "${PREDEPLOYMENT_SNAPSHOT_DIR}"
  exit 0
fi

TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
test -d "${ROLLBACK_RECEIPT_ROOT}" && test ! -L "${ROLLBACK_RECEIPT_ROOT}" \
  || fail "Canonical rollback receipt root is missing or unsafe"
exec 5<"${ROLLBACK_RECEIPT_ROOT}" || fail "Canonical rollback receipt root cannot be opened"
ROLLBACK_RECEIPT_ROOT_ID="$(verify_protected_directory_chain_fd "${ROLLBACK_RECEIPT_ROOT}" 5)" \
  || fail "Rollback receipt root ancestry or stable identity is invalid"
[[ "${ROLLBACK_RECEIPT_ROOT_ID}" =~ ^[0-9]+:[0-9]+$ ]] || fail "Rollback receipt root identity is invalid"
python3 -I - 5 <<'PY' || fail "A prior rollback pointer requires state-specific deterministic operator recovery"
import hashlib
import json
import os
import re
import stat
import sys
root_fd = int(sys.argv[1])
try:
    descriptor = os.open(
        ".kidults-rollback-active-v1.json",
        os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK,
        dir_fd=root_fd,
    )
except FileNotFoundError:
    raise SystemExit(0)
try:
    metadata = os.fstat(descriptor)
    entry = os.stat(".kidults-rollback-active-v1.json", dir_fd=root_fd, follow_symlinks=False)
    raw = b""
    while True:
        block = os.read(descriptor, 1024 * 1024)
        if not block:
            break
        raw += block
        if len(raw) > 1024 * 1024:
            raise SystemExit("ROLLBACK_PRIOR_POINTER_TOO_LARGE_HOLD")
    metadata_after = os.fstat(descriptor)
    entry_after = os.stat(".kidults-rollback-active-v1.json", dir_fd=root_fd, follow_symlinks=False)
    stable_fields = (
        "st_dev", "st_ino", "st_size", "st_mtime_ns", "st_ctime_ns",
        "st_nlink", "st_uid", "st_gid", "st_mode",
    )
    payload = json.loads(raw)
    active_keys = {
        "id", "version", "state", "receipt_directory_name", "source_sha",
        "snapshot_manifest_sha256", "receipt_root_identity",
        "receipt_directory_identity", "created_at",
    }
    terminal_keys = active_keys | {
        "terminal_success_manifest", "terminal_success_manifest_sha256",
        "prior_restart_policy_restoration_permitted", "nonterminal_rollback_pointer",
        "transitioned_at",
    }
    state = payload.get("state")
    expected_keys = terminal_keys if state == "TERMINAL_SUCCESS_RESTART_POLICY_CLEANUP_PENDING" else active_keys
    if (
        not stat.S_ISREG(metadata.st_mode)
        or metadata.st_nlink != 1
        or metadata.st_uid != 0
        or metadata.st_gid != 0
        or stat.S_IMODE(metadata.st_mode) != 0o600
        or (metadata.st_dev, metadata.st_ino) != (entry.st_dev, entry.st_ino)
        or tuple(getattr(metadata, field) for field in stable_fields)
        != tuple(getattr(metadata_after, field) for field in stable_fields)
        or (metadata_after.st_dev, metadata_after.st_ino)
        != (entry_after.st_dev, entry_after.st_ino)
        or len(raw) != metadata.st_size
        or set(payload) != expected_keys
        or payload.get("id") != "KIDULTS_PRODUCTION_ROLLBACK_ACTIVE_TRANSACTION_V1"
        or payload.get("version") != "1.0.0"
    ):
        raise SystemExit("ROLLBACK_PRIOR_POINTER_IDENTITY_HOLD")
    directory = payload.get("receipt_directory_name")
    if re.fullmatch(r"kidults-rollback-[0-9]{8}T[0-9]{6}Z-[0-9a-f]{64}", directory or "") is None:
        raise SystemExit("ROLLBACK_PRIOR_POINTER_RECEIPT_BINDING_HOLD")
    if state == "TERMINAL_SUCCESS_RESTART_POLICY_CLEANUP_PENDING":
        digest = payload.get("terminal_success_manifest_sha256")
        if (
            payload.get("terminal_success_manifest") != "rollback-terminal-success-manifest.json"
            or payload.get("prior_restart_policy_restoration_permitted") is not True
            or payload.get("nonterminal_rollback_pointer") is not False
            or not isinstance(payload.get("created_at"), str)
            or not isinstance(payload.get("transitioned_at"), str)
            or re.fullmatch(r"sha256:[0-9a-f]{64}", digest or "") is None
        ):
            raise SystemExit("ROLLBACK_TERMINAL_CLEANUP_POINTER_MANIFEST_BINDING_HOLD")
        root_metadata = os.fstat(root_fd)
        if payload.get("receipt_root_identity") != f"{root_metadata.st_dev}:{root_metadata.st_ino}":
            raise SystemExit("ROLLBACK_TERMINAL_CLEANUP_ROOT_BINDING_HOLD")
        receipt_fd = os.open(directory, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=root_fd)
        try:
            receipt_metadata = os.fstat(receipt_fd)
            receipt_entry = os.stat(directory, dir_fd=root_fd, follow_symlinks=False)
            if (
                receipt_metadata.st_uid != 0
                or receipt_metadata.st_gid != 0
                or stat.S_IMODE(receipt_metadata.st_mode) != 0o700
                or (receipt_metadata.st_dev, receipt_metadata.st_ino) != (receipt_entry.st_dev, receipt_entry.st_ino)
                or payload.get("receipt_directory_identity") != f"{receipt_metadata.st_dev}:{receipt_metadata.st_ino}"
            ):
                raise SystemExit("ROLLBACK_TERMINAL_CLEANUP_RECEIPT_DIRECTORY_BINDING_HOLD")
            manifest_name = "rollback-terminal-success-manifest.json"
            manifest_fd = os.open(
                manifest_name,
                os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK,
                dir_fd=receipt_fd,
            )
            try:
                manifest_metadata = os.fstat(manifest_fd)
                manifest_entry = os.stat(manifest_name, dir_fd=receipt_fd, follow_symlinks=False)
                manifest_raw = b""
                while True:
                    block = os.read(manifest_fd, 1024 * 1024)
                    if not block:
                        break
                    manifest_raw += block
                    if len(manifest_raw) > 4 * 1024 * 1024:
                        raise SystemExit("ROLLBACK_TERMINAL_CLEANUP_MANIFEST_TOO_LARGE_HOLD")
                manifest_after = os.fstat(manifest_fd)
                manifest_entry_after = os.stat(manifest_name, dir_fd=receipt_fd, follow_symlinks=False)
                stable_fields = ("st_dev", "st_ino", "st_size", "st_mtime_ns", "st_ctime_ns", "st_nlink", "st_uid", "st_gid", "st_mode")
                if (
                    not stat.S_ISREG(manifest_metadata.st_mode)
                    or manifest_metadata.st_nlink != 1
                    or manifest_metadata.st_uid != 0
                    or manifest_metadata.st_gid != 0
                    or stat.S_IMODE(manifest_metadata.st_mode) != 0o600
                    or (manifest_metadata.st_dev, manifest_metadata.st_ino) != (manifest_entry.st_dev, manifest_entry.st_ino)
                    or tuple(getattr(manifest_metadata, field) for field in stable_fields)
                    != tuple(getattr(manifest_after, field) for field in stable_fields)
                    or (manifest_after.st_dev, manifest_after.st_ino) != (manifest_entry_after.st_dev, manifest_entry_after.st_ino)
                ):
                    raise SystemExit("ROLLBACK_TERMINAL_CLEANUP_MANIFEST_IDENTITY_HOLD")
            finally:
                os.close(manifest_fd)
            if "sha256:" + hashlib.sha256(manifest_raw).hexdigest() != digest:
                raise SystemExit("ROLLBACK_TERMINAL_CLEANUP_MANIFEST_DIGEST_HOLD")
            manifest = json.loads(manifest_raw)
            expected_manifest_keys = {
                "id", "version", "state", "commit_marker",
                "manifest_published_last_at_terminal_boundary", "restart_policy_at_commit",
                "receipt_directory_name", "source_sha", "snapshot_manifest_sha256",
                "rollback_receipt_sha256", "rollback_receipt_checksum_sha256",
                "members_at_terminal_boundary", "committed_at",
            }
            if (
                set(manifest) != expected_manifest_keys
                or manifest.get("id") != "KIDULTS_PRODUCTION_ROLLBACK_TERMINAL_SUCCESS_MANIFEST_V1"
                or manifest.get("version") != "1.0.0"
                or manifest.get("state") != state
                or manifest.get("commit_marker") is not True
                or manifest.get("manifest_published_last_at_terminal_boundary") is not True
                or manifest.get("restart_policy_at_commit") != "no"
                or manifest.get("receipt_directory_name") != directory
                or manifest.get("source_sha") != payload.get("source_sha")
                or manifest.get("snapshot_manifest_sha256") != payload.get("snapshot_manifest_sha256")
                or re.fullmatch(r"sha256:[0-9a-f]{64}", manifest.get("rollback_receipt_sha256") or "") is None
                or re.fullmatch(r"sha256:[0-9a-f]{64}", manifest.get("rollback_receipt_checksum_sha256") or "") is None
                or not isinstance(manifest.get("members_at_terminal_boundary"), list)
                or len(manifest["members_at_terminal_boundary"]) != len(set(manifest["members_at_terminal_boundary"]))
                or any(not isinstance(member, str) for member in manifest["members_at_terminal_boundary"])
            ):
                raise SystemExit("ROLLBACK_TERMINAL_CLEANUP_MANIFEST_CONTENT_HOLD")
        finally:
            os.close(receipt_fd)
        exchanged_stages = sorted(
            name for name in os.listdir(root_fd)
            if re.fullmatch(r"\.kidults-rollback-active-v1\.terminal\.[0-9a-f]{64}\.tmp", name)
        )
        if len(exchanged_stages) > 1:
            raise SystemExit("ROLLBACK_TERMINAL_CLEANUP_EXCHANGED_STAGE_CLOSURE_HOLD")
        for stage_name in exchanged_stages:
            stage_fd = os.open(
                stage_name,
                os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK,
                dir_fd=root_fd,
            )
            try:
                stage_metadata = os.fstat(stage_fd)
                stage_entry = os.stat(stage_name, dir_fd=root_fd, follow_symlinks=False)
                if (
                    not stat.S_ISREG(stage_metadata.st_mode)
                    or stage_metadata.st_nlink != 1
                    or stage_metadata.st_uid != 0
                    or stage_metadata.st_gid != 0
                    or stat.S_IMODE(stage_metadata.st_mode) != 0o600
                    or (stage_metadata.st_dev, stage_metadata.st_ino)
                    != (stage_entry.st_dev, stage_entry.st_ino)
                ):
                    raise SystemExit("ROLLBACK_TERMINAL_CLEANUP_EXCHANGED_STAGE_BINDING_HOLD")
                stage_raw = os.read(stage_fd, 1024 * 1024 + 1)
                stage_payload = json.loads(stage_raw)
                stage_after = os.fstat(stage_fd)
                stage_entry_after = os.stat(stage_name, dir_fd=root_fd, follow_symlinks=False)
                stable_fields = (
                    "st_dev", "st_ino", "st_size", "st_mtime_ns", "st_ctime_ns",
                    "st_nlink", "st_uid", "st_gid", "st_mode",
                )
                if (
                    len(stage_raw) > 1024 * 1024
                    or tuple(getattr(stage_metadata, field) for field in stable_fields)
                    != tuple(getattr(stage_after, field) for field in stable_fields)
                    or (stage_after.st_dev, stage_after.st_ino)
                    != (stage_entry_after.st_dev, stage_entry_after.st_ino)
                    or len(stage_raw) != stage_metadata.st_size
                    or set(stage_payload) != {
                        "id", "version", "state", "receipt_directory_name", "source_sha",
                        "snapshot_manifest_sha256", "receipt_root_identity",
                        "receipt_directory_identity", "created_at",
                    }
                    or stage_payload.get("id") != "KIDULTS_PRODUCTION_ROLLBACK_ACTIVE_TRANSACTION_V1"
                    or stage_payload.get("version") != "1.0.0"
                    or stage_payload.get("state") != "ACTIVE_HOLD_ON_REENTRY"
                    or stage_payload.get("receipt_directory_name") != directory
                    or stage_payload.get("source_sha") != payload.get("source_sha")
                    or stage_payload.get("snapshot_manifest_sha256") != payload.get("snapshot_manifest_sha256")
                    or stage_payload.get("receipt_root_identity") != payload.get("receipt_root_identity")
                    or stage_payload.get("receipt_directory_identity") != payload.get("receipt_directory_identity")
                ):
                    raise SystemExit("ROLLBACK_TERMINAL_CLEANUP_EXCHANGED_STAGE_BINDING_HOLD")
            finally:
                os.close(stage_fd)
            os.unlink(stage_name, dir_fd=root_fd)
            os.fsync(root_fd)
        stage_instruction = ", exchanged old-active stage reconciled and root fsynced" if exchanged_stages else ""
        raise SystemExit(
            "ROLLBACK_TERMINAL_CLEANUP_PENDING_HOLD:"
            + directory
            + ":verified manifest; reconcile restart-policy-before.json against exact named containers, write restart-policy-after receipt"
            + stage_instruction
            + ", then atomically archive and fsync the bound terminal pointer"
        )
    if state == "ACTIVE_HOLD_ON_REENTRY":
        raise SystemExit("ROLLBACK_NONTERMINAL_ACTIVE_TRANSACTION_HOLD:" + directory)
    raise SystemExit("ROLLBACK_PRIOR_POINTER_STATE_INVALID_HOLD")
finally:
    os.close(descriptor)
PY
ROLLBACK_RECEIPT_ROOT_STABLE="/proc/self/fd/5"
RECEIPT_DIR_NAME="$(create_exclusive_receipt_directory_fd)" \
  || fail "Exclusive random rollback receipt directory creation failed"
[[ "${RECEIPT_DIR_NAME}" =~ ^kidults-rollback-[0-9]{8}T[0-9]{6}Z-[0-9a-f]{64}$ ]] \
  || fail "Rollback receipt directory name is invalid"
RECEIPT_DIR="${ROLLBACK_RECEIPT_ROOT}/${RECEIPT_DIR_NAME}"
exec 4<"${ROLLBACK_RECEIPT_ROOT_STABLE}/${RECEIPT_DIR_NAME}" \
  || fail "Rollback receipt directory cannot be opened through the stable root"
ROLLBACK_RECEIPT_DIR_ID="$(verify_protected_directory_chain_fd "${RECEIPT_DIR}" 4)" \
  || fail "Rollback receipt directory ancestry or stable identity is invalid"
[[ "${ROLLBACK_RECEIPT_DIR_ID}" =~ ^[0-9]+:[0-9]+$ ]] || fail "Rollback receipt directory identity is invalid"
RECEIPT_DIR_STABLE="/proc/self/fd/4"

python3 -I - 5 4 "${RECEIPT_DIR_NAME}" "${SOURCE_SHA}" \
  "${EXPECTED_PREDEPLOYMENT_SNAPSHOT_MANIFEST_SHA256}" "${ROLLBACK_RECEIPT_ROOT_ID}" \
  "${ROLLBACK_RECEIPT_DIR_ID}" <<'PY' \
  || fail "Durable rollback transaction initialization failed"
import datetime as dt
import json
import os
import stat
import sys

root_fd = int(sys.argv[1])
receipt_fd = int(sys.argv[2])
payload = {
    "id": "KIDULTS_PRODUCTION_ROLLBACK_ACTIVE_TRANSACTION_V1",
    "version": "1.0.0",
    "state": "ACTIVE_HOLD_ON_REENTRY",
    "receipt_directory_name": sys.argv[3],
    "source_sha": sys.argv[4],
    "snapshot_manifest_sha256": sys.argv[5],
    "receipt_root_identity": sys.argv[6],
    "receipt_directory_identity": sys.argv[7],
    "created_at": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
}
active_raw = (json.dumps(payload, indent=2) + "\n").encode("utf-8")
journal_event = {
    "id": "KIDULTS_PRODUCTION_ROLLBACK_TRANSACTION_EVENT_V1",
    "version": "1.0.0",
    "sequence": 1,
    "phase": "INITIALIZED",
    "detail": "ACTIVE_POINTER_DURABLE_BEFORE_MUTATION",
    "observed_at": payload["created_at"],
    "source_sha": payload["source_sha"],
    "snapshot_manifest_sha256": payload["snapshot_manifest_sha256"],
    "trigger": "INITIALIZATION",
}
journal_raw = (json.dumps(journal_event, sort_keys=True, separators=(",", ":")) + "\n").encode("utf-8")

def write_exclusive(parent_fd, name, raw):
    descriptor = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=parent_fd)
    try:
        remaining = memoryview(raw)
        while remaining:
            written = os.write(descriptor, remaining)
            if written <= 0:
                raise SystemExit("ROLLBACK_TRANSACTION_INITIAL_WRITE")
            remaining = remaining[written:]
        os.fsync(descriptor)
    finally:
        os.close(descriptor)

write_exclusive(receipt_fd, "rollback-transaction-v1.jsonl", journal_raw)
os.fsync(receipt_fd)
try:
    write_exclusive(root_fd, ".kidults-rollback-active-v1.json", active_raw)
except BaseException:
    os.unlink("rollback-transaction-v1.jsonl", dir_fd=receipt_fd)
    os.fsync(receipt_fd)
    raise
os.fsync(root_fd)
PY
ROLLBACK_TRANSACTION_ACTIVE=true
ROLLBACK_PHASE="INITIALIZED"
trap 'code=$?; rollback_failure_trap "${code}" ERR' ERR
trap 'rollback_failure_trap 130 SIGINT' INT
trap 'rollback_failure_trap 143 SIGTERM' TERM

SNAPSHOT_MANIFEST_SHA256="${EXPECTED_PREDEPLOYMENT_SNAPSHOT_MANIFEST_SHA256}"
BEFORE_GATEWAY_CONTAINER_ID="$(docker inspect --format '{{.Id}}' kidults-gateway)" \
  || fail "Gateway rollback container identity is unavailable"
BEFORE_SCHEDULER_CONTAINER_ID="$(docker inspect --format '{{.Id}}' kidults-scheduler)" \
  || fail "Scheduler rollback container identity is unavailable"
[[ "${BEFORE_GATEWAY_CONTAINER_ID}" =~ ^[0-9a-f]{64}$ \
  && "${BEFORE_SCHEDULER_CONTAINER_ID}" =~ ^[0-9a-f]{64}$ \
  && "${BEFORE_GATEWAY_CONTAINER_ID}" != "${BEFORE_SCHEDULER_CONTAINER_ID}" ]] \
  || fail "Rollback container identity binding is invalid"
CURRENT_GATEWAY_CONTAINER_ID="${BEFORE_GATEWAY_CONTAINER_ID}"
CURRENT_SCHEDULER_CONTAINER_ID="${BEFORE_SCHEDULER_CONTAINER_ID}"
python3 -I - 4 "${BEFORE_GATEWAY_CONTAINER_ID}" "${BEFORE_SCHEDULER_CONTAINER_ID}" <<'PY'
import hashlib
import json
import os
import re
import subprocess
import sys

receipt_fd = int(sys.argv[1])
identifiers = sys.argv[2:]
completed = subprocess.run(["docker", "inspect", *identifiers], stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, check=True)
payload = json.loads(completed.stdout)
if len(payload) != 2 or {value.get("Id") for value in payload} != set(identifiers):
    raise SystemExit("ROLLBACK_RESTART_POLICY_CONTAINER_CLOSURE")
records = []
for value in payload:
    policy = value.get("HostConfig", {}).get("RestartPolicy", {})
    name = policy.get("Name")
    maximum = policy.get("MaximumRetryCount")
    if name not in {"no", "always", "unless-stopped", "on-failure"} or not isinstance(maximum, int) or maximum < 0:
        raise SystemExit("ROLLBACK_RESTART_POLICY_INVALID")
    records.append({"container_id": value["Id"], "container_name": value.get("Name"), "name": name, "maximum_retry_count": maximum})
raw = (json.dumps({"id": "KIDULTS_ROLLBACK_RESTART_POLICY_V1", "version": "1.0.0", "prior_policies": sorted(records, key=lambda item: item["container_name"])}, indent=2) + "\n").encode("utf-8")
data_fd = os.open("restart-policy-before.json", os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=receipt_fd)
checksum_fd = -1
try:
    for descriptor, payload in ((data_fd, raw),):
        remaining = memoryview(payload)
        while remaining:
            written = os.write(descriptor, remaining)
            if written <= 0:
                raise SystemExit("ROLLBACK_RESTART_POLICY_RECEIPT_WRITE")
            remaining = remaining[written:]
    os.fsync(data_fd)
    checksum = f"{hashlib.sha256(raw).hexdigest()}  restart-policy-before.json\n".encode("ascii")
    checksum_fd = os.open("restart-policy-before.json.sha256", os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=receipt_fd)
    remaining = memoryview(checksum)
    while remaining:
        written = os.write(checksum_fd, remaining)
        if written <= 0:
            raise SystemExit("ROLLBACK_RESTART_POLICY_CHECKSUM_WRITE")
        remaining = remaining[written:]
    os.fsync(checksum_fd)
    os.fsync(receipt_fd)
finally:
    if checksum_fd >= 0:
        os.close(checksum_fd)
    os.close(data_fd)
PY
append_rollback_transaction_event "RESTART_POLICIES_CAPTURED" "EXACT_IMMUTABLE_CONTAINER_IDS"
ROLLBACK_PHASE="RESTART_POLICIES_CAPTURED"
docker update --restart=no "${BEFORE_GATEWAY_CONTAINER_ID}" "${BEFORE_SCHEDULER_CONTAINER_ID}" >/dev/null \
  || fail "Production rollback could not disable automatic container restart"
[[ "$(docker inspect --format '{{.HostConfig.RestartPolicy.Name}}' "${BEFORE_GATEWAY_CONTAINER_ID}")" == "no" \
  && "$(docker inspect --format '{{.HostConfig.RestartPolicy.Name}}' "${BEFORE_SCHEDULER_CONTAINER_ID}")" == "no" ]] \
  || fail "Production rollback automatic restart disablement was not verified"
append_rollback_transaction_event "AUTO_RESTART_DISABLED" "DURABLE_ACTIVE_POINTER_REQUIRES_MANUAL_RECOVERY_ON_CRASH"
ROLLBACK_PHASE="AUTO_RESTART_DISABLED"
BEFORE_GATEWAY_IMAGE="$(docker inspect -f '{{.Image}}' "${BEFORE_GATEWAY_CONTAINER_ID}")" \
  || fail "Gateway rollback image identity is unavailable"
BEFORE_SCHEDULER_IMAGE="$(docker inspect -f '{{.Image}}' "${BEFORE_SCHEDULER_CONTAINER_ID}")" \
  || fail "Scheduler rollback image identity is unavailable"

# Prove the captured compose resolves to the exact captured references, then load
# and bind those references to the captured immutable IDs before stopping anything.
[[ "$(verify_protected_directory_chain_fd "${ROLLBACK_PIN_ROOT}" 9)" == "${ROLLBACK_PIN_ROOT_ID}" ]] \
  || fail "Rollback pin root ancestry or stable identity changed before restore"
[[ "$(verify_protected_directory_chain_fd "${EXPECTED_PREPARED_ROLLBACK_DIR}" 8)" == "${PREPARED_ROLLBACK_ID}" ]] \
  || fail "Prepared rollback ancestry or stable identity changed before restore"
verify_pinned_snapshot
ROLLBACK_SERVICE_BINDINGS="$(
  docker compose \
    --project-directory "${PREDEPLOYMENT_SNAPSHOT_DIR}" \
    --env-file "${PREDEPLOYMENT_SNAPSHOT_DIR}/env.production.snapshot" \
    -f "${PREDEPLOYMENT_SNAPSHOT_DIR}/docker-compose.production.yml" \
    config --format json |
    python3 -I -c '
import json
import sys
from pathlib import Path

compose = json.load(sys.stdin)
captured = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
services = compose.get("services")
if not isinstance(services, dict):
    raise SystemExit("ROLLBACK_COMPOSE_SERVICES_INVALID")
by_container = {}
for service_name, service in services.items():
    if not isinstance(service, dict):
        raise SystemExit("ROLLBACK_COMPOSE_SERVICE_INVALID")
    container = service.get("container_name")
    if container in captured:
        if container in by_container:
            raise SystemExit("ROLLBACK_COMPOSE_CONTAINER_DUPLICATE")
        by_container[container] = (service_name, service.get("image"))
if set(by_container) != set(captured):
    raise SystemExit("ROLLBACK_COMPOSE_CONTAINER_SET")
for container, (_, image) in by_container.items():
    if image != captured[container]["image_ref"]:
        raise SystemExit(f"ROLLBACK_COMPOSE_IMAGE_REF:{container}")
print(by_container["kidults-gateway"][0], by_container["kidults-scheduler"][0], sep="\t")
' "${PREDEPLOYMENT_SNAPSHOT_DIR}/rollback-images.json"
)" || fail "Captured rollback compose bindings are invalid"
IFS=$'\t' read -r ROLLBACK_GATEWAY_SERVICE ROLLBACK_SCHEDULER_SERVICE <<< "${ROLLBACK_SERVICE_BINDINGS}"

run_with_exclusive_receipt_stdout_fd \
  "docker-load.txt" docker load --input "${PREDEPLOYMENT_SNAPSHOT_DIR}/rollback-images.tar" \
  || fail "Captured rollback image archive load failed"
while IFS=$'\t' read -r IMAGE_ID IMAGE_REF; do
  docker image inspect "${IMAGE_ID}" >/dev/null
  if [[ "${IMAGE_REF}" != sha256:* && "${IMAGE_REF}" != *@sha256:* ]]; then
    docker tag "${IMAGE_ID}" "${IMAGE_REF}"
  fi
  [[ "$(docker image inspect --format '{{.Id}}' "${IMAGE_REF}")" == "${IMAGE_ID}" ]] || fail "Captured rollback image reference does not resolve to its immutable ID"
done < <(python3 -I - "${PREDEPLOYMENT_SNAPSHOT_DIR}/rollback-images.json" <<'PY'
import json
import sys
from pathlib import Path
payload = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
for container in ("kidults-gateway", "kidults-scheduler"):
    value = payload[container]
    print(f"{value['image_id']}\t{value['image_ref']}")
PY
)

# Stop only the KIDULTS runtime containers. Do not delete volumes, networks, host services or Artfund state.
[[ "$(verify_protected_database_parent_fd "${PROD_DB_PARENT_REAL}" 7)" == "${PROD_DB_PARENT_ID}" ]] \
  || fail "Production database parent changed before restore"
verify_existing_database_entry_fd || fail "Production database entry is unsafe before restore"
docker stop --time 30 "${BEFORE_GATEWAY_CONTAINER_ID}" "${BEFORE_SCHEDULER_CONTAINER_ID}" >/dev/null \
  || fail "Production rollback container stop failed"
verify_runtime_containers_stopped "container-quiescence-after-stop.json" \
  || fail "Production rollback containers are not quiescent after stop"
append_rollback_transaction_event "QUIESCED" "EXACT_CONTAINER_IDS_STOPPED_WITH_RESTART_NO"
ROLLBACK_PHASE="QUIESCED"

SNAPSHOT_DATABASE_SHA256="$(python3 -I - "${PREDEPLOYMENT_SNAPSHOT_DIR}/manifest.json" <<'PY'
import json
import re
import sys
from pathlib import Path
value = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8")).get("database_sha256")
if not isinstance(value, str) or re.fullmatch(r"[0-9a-f]{64}", value) is None:
    raise SystemExit("SNAPSHOT_DATABASE_DIGEST_INVALID")
print(f"sha256:{value}")
PY
)" || fail "Signed snapshot database digest is invalid"
[[ "$(verify_protected_directory_chain_fd "${ROLLBACK_PIN_ROOT}" 9)" == "${ROLLBACK_PIN_ROOT_ID}" ]] \
  || fail "Rollback pin root changed before database restore"
[[ "$(verify_protected_directory_chain_fd "${EXPECTED_PREPARED_ROLLBACK_DIR}" 8)" == "${PREPARED_ROLLBACK_ID}" ]] \
  || fail "Prepared rollback input changed before database restore"
[[ "$(verify_protected_database_parent_fd "${PROD_DB_PARENT_REAL}" 7)" == "${PROD_DB_PARENT_ID}" ]] \
  || fail "Production database parent changed before atomic restore"
verify_runtime_containers_stopped "container-quiescence-before-restore.json" \
  || fail "Production rollback containers restarted before database restore"
[[ "$(verify_protected_directory_chain_fd "${SQLITE_RESTORE_HELPER_PARENT}" 6)" == "${SQLITE_RESTORE_HELPER_PARENT_ID}" ]] \
  || fail "SQLite rollback restore helper parent changed before atomic restore"
verify_sqlite_restore_helper_fd || fail "SQLite rollback restore helper changed before atomic restore"

# Preserve one coherent failed-state cohort only after the exact runtime
# containers are durably quiescent, and immediately before sidecar/main restore.
[[ "$(verify_protected_database_parent_fd "${PROD_DB_PARENT_REAL}" 7)" == "${PROD_DB_PARENT_ID}" ]] \
  || fail "Production database parent changed before quiescent forensic capture"
verify_existing_database_entry_fd || fail "Production database entry is unsafe before quiescent forensic capture"
verify_runtime_containers_stopped \
  || fail "Production rollback containers restarted immediately before forensic capture"
python3 -I - 7 4 "$(basename "${PROD_DB}")" <<'PY'
import datetime as dt
import hashlib
import json
import os
import stat
import sys

source_parent_fd = int(sys.argv[1])
destination_fd = int(sys.argv[2])
source_name = sys.argv[3]
started_at = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")

def read_stable_receipt_member(name, limit):
    before = os.stat(name, dir_fd=destination_fd, follow_symlinks=False)
    descriptor = os.open(
        name,
        os.O_RDONLY | os.O_NONBLOCK | getattr(os, "O_NOFOLLOW", 0),
        dir_fd=destination_fd,
    )
    try:
        opened = os.fstat(descriptor)
        if (
            not stat.S_ISREG(opened.st_mode)
            or opened.st_nlink != 1
            or opened.st_uid != 0
            or opened.st_gid != 0
            or stat.S_IMODE(opened.st_mode) != 0o600
            or (opened.st_dev, opened.st_ino) != (before.st_dev, before.st_ino)
        ):
            raise SystemExit(f"FAILED_DATABASE_FORENSIC_RECEIPT_UNSAFE:{name}")
        chunks = []
        length = 0
        while True:
            block = os.read(descriptor, min(1024 * 1024, limit + 1 - length))
            if not block:
                break
            chunks.append(block)
            length += len(block)
            if length > limit:
                raise SystemExit(f"FAILED_DATABASE_FORENSIC_RECEIPT_TOO_LARGE:{name}")
        after = os.fstat(descriptor)
        path_after = os.stat(name, dir_fd=destination_fd, follow_symlinks=False)
        fields = ("st_dev", "st_ino", "st_size", "st_mtime_ns", "st_ctime_ns", "st_nlink", "st_uid", "st_gid", "st_mode")
        if (
            tuple(getattr(opened, field) for field in fields)
            != tuple(getattr(after, field) for field in fields)
            or (after.st_dev, after.st_ino) != (path_after.st_dev, path_after.st_ino)
        ):
            raise SystemExit(f"FAILED_DATABASE_FORENSIC_RECEIPT_CHANGED:{name}")
        return b"".join(chunks)
    finally:
        os.close(descriptor)

quiescence = json.loads(read_stable_receipt_member("container-quiescence-before-restore.json", 1024 * 1024))
quiesced_at = quiescence.get("observed_at")
if not isinstance(quiesced_at, str):
    raise SystemExit("FAILED_DATABASE_FORENSIC_QUIESCENCE_BINDING")
try:
    source_entry_before = os.stat(source_name, dir_fd=source_parent_fd, follow_symlinks=False)
    source_fd = os.open(
        source_name,
        os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK,
        dir_fd=source_parent_fd,
    )
except FileNotFoundError:
    raise SystemExit("FAILED_DATABASE_FORENSIC_SOURCE_MISSING")
source_before = os.fstat(source_fd)
if (
    not stat.S_ISREG(source_before.st_mode)
    or (source_before.st_dev, source_before.st_ino) != (source_entry_before.st_dev, source_entry_before.st_ino)
    or source_before.st_nlink != 1
):
    os.close(source_fd)
    raise SystemExit("FAILED_DATABASE_FORENSIC_SOURCE_NOT_STABLE_REGULAR")
target_fd = checksum_fd = metadata_fd = metadata_checksum_fd = -1
try:
    target_fd = os.open("failed-kaios.db", os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=destination_fd)
    digest = hashlib.sha256()
    while True:
        block = os.read(source_fd, 1024 * 1024)
        if not block:
            break
        digest.update(block)
        remaining = memoryview(block)
        while remaining:
            written = os.write(target_fd, remaining)
            if written <= 0:
                raise SystemExit("FAILED_DATABASE_FORENSIC_WRITE")
            remaining = remaining[written:]
    os.fsync(target_fd)
    source_after = os.fstat(source_fd)
    source_entry_after = os.stat(source_name, dir_fd=source_parent_fd, follow_symlinks=False)
    fields = ("st_dev", "st_ino", "st_size", "st_mtime_ns", "st_ctime_ns", "st_nlink", "st_uid", "st_gid", "st_mode")
    if (
        tuple(getattr(source_before, name) for name in fields) != tuple(getattr(source_after, name) for name in fields)
        or (source_after.st_dev, source_after.st_ino) != (source_entry_after.st_dev, source_entry_after.st_ino)
    ):
        raise SystemExit("FAILED_DATABASE_FORENSIC_SOURCE_CHANGED_DURING_COPY")
    target_metadata = os.fstat(target_fd)
    target_entry = os.stat("failed-kaios.db", dir_fd=destination_fd, follow_symlinks=False)
    if (
        not stat.S_ISREG(target_metadata.st_mode)
        or (target_metadata.st_dev, target_metadata.st_ino) != (target_entry.st_dev, target_entry.st_ino)
        or stat.S_IMODE(target_metadata.st_mode) != 0o600
    ):
        raise SystemExit("FAILED_DATABASE_FORENSIC_TARGET_IDENTITY")
    checksum = f"{digest.hexdigest()}  failed-kaios.db\n".encode("ascii")
    checksum_fd = os.open("failed-kaios.db.sha256", os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=destination_fd)
    remaining = memoryview(checksum)
    while remaining:
        written = os.write(checksum_fd, remaining)
        if written <= 0:
            raise SystemExit("FAILED_DATABASE_FORENSIC_CHECKSUM_WRITE")
        remaining = remaining[written:]
    os.fsync(checksum_fd)
    completed_at = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    metadata = {
        "id": "KIDULTS_FAILED_DATABASE_FORENSIC_CAPTURE_V1",
        "version": "1.0.0",
        "quiesced_at": quiesced_at,
        "forensic_started_at": started_at,
        "forensic_completed_at": completed_at,
        "source_name": source_name,
        "source": {
            "dev": source_before.st_dev, "ino": source_before.st_ino,
            "size": source_before.st_size, "mtime_ns": source_before.st_mtime_ns,
            "ctime_ns": source_before.st_ctime_ns, "nlink": source_before.st_nlink,
            "uid": source_before.st_uid, "gid": source_before.st_gid,
            "mode": stat.S_IMODE(source_before.st_mode),
        },
        "failed_database_sha256": "sha256:" + digest.hexdigest(),
        "container_quiescence_receipt": "container-quiescence-before-restore.json",
    }
    raw = (json.dumps(metadata, indent=2) + "\n").encode("utf-8")
    metadata_fd = os.open("failed-state-metadata.json", os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=destination_fd)
    remaining = memoryview(raw)
    while remaining:
        written = os.write(metadata_fd, remaining)
        if written <= 0:
            raise SystemExit("FAILED_DATABASE_FORENSIC_METADATA_WRITE")
        remaining = remaining[written:]
    os.fsync(metadata_fd)
    metadata_checksum = f"{hashlib.sha256(raw).hexdigest()}  failed-state-metadata.json\n".encode("ascii")
    metadata_checksum_fd = os.open("failed-state-metadata.json.sha256", os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=destination_fd)
    remaining = memoryview(metadata_checksum)
    while remaining:
        written = os.write(metadata_checksum_fd, remaining)
        if written <= 0:
            raise SystemExit("FAILED_DATABASE_FORENSIC_METADATA_CHECKSUM_WRITE")
        remaining = remaining[written:]
    os.fsync(metadata_checksum_fd)
    os.fsync(destination_fd)
finally:
    for descriptor in (metadata_checksum_fd, metadata_fd, checksum_fd, target_fd, source_fd):
        if descriptor >= 0:
            os.close(descriptor)
PY
if [[ -f "${PROD_ROOT}/.env.production" ]]; then
  copy_regular_path_to_receipt_fd "${PROD_ROOT}/.env.production" "failed-env.production.snapshot" \
    || fail "Failed Production environment forensic receipt is unsafe"
fi
if [[ -f "${PROD_ROOT}/docker-compose.production.yml" ]]; then
  copy_regular_path_to_receipt_fd "${PROD_ROOT}/docker-compose.production.yml" "failed-docker-compose.production.yml" \
    || fail "Failed Production compose forensic receipt is unsafe"
fi
append_rollback_transaction_event "FORENSICS_DURABLE" "FAILED_MAIN_AND_CONFIGURATION_CAPTURED_AFTER_QUIESCENCE"
ROLLBACK_PHASE="FORENSICS_DURABLE"
RESTORE_STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
verify_runtime_containers_stopped \
  || fail "Production rollback containers restarted immediately before atomic restore"
python3 -I "${SQLITE_RESTORE_HELPER_STABLE}" \
  --source-dir-fd 8 \
  --source-name kaios.db \
  --destination-dir-fd 7 \
  --destination-name kaios.db \
  --receipt-dir-fd 4 \
  --expected-sha256 "${SNAPSHOT_DATABASE_SHA256}" \
  --uid "${DB_UID}" \
  --gid "${DB_GID}" \
  --mode "${DB_MODE}" \
  || fail "Inode-bound atomic SQLite rollback restore failed"
RESTORE_COMPLETED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
python3 -I - 4 "${RESTORE_STARTED_AT}" "${RESTORE_COMPLETED_AT}" <<'PY'
import datetime as dt
import hashlib
import json
import os
import stat
import sys

receipt_fd = int(sys.argv[1])
started_at = sys.argv[2]
completed_at = sys.argv[3]
metadata_fd = os.open(
    "failed-state-metadata.json",
    os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK,
    dir_fd=receipt_fd,
)
try:
    before = os.fstat(metadata_fd)
    entry_before = os.stat("failed-state-metadata.json", dir_fd=receipt_fd, follow_symlinks=False)
    if (
        not stat.S_ISREG(before.st_mode)
        or before.st_nlink != 1
        or before.st_uid != 0
        or before.st_gid != 0
        or stat.S_IMODE(before.st_mode) != 0o600
        or (before.st_dev, before.st_ino) != (entry_before.st_dev, entry_before.st_ino)
        or before.st_size > 1024 * 1024
    ):
        raise SystemExit("ROLLBACK_RESTORE_ORDER_METADATA_UNSAFE")
    metadata_raw = b""
    while True:
        block = os.read(metadata_fd, min(1024 * 1024, 1024 * 1024 + 1 - len(metadata_raw)))
        if not block:
            break
        metadata_raw += block
        if len(metadata_raw) > 1024 * 1024:
            raise SystemExit("ROLLBACK_RESTORE_ORDER_METADATA_TOO_LARGE")
    after = os.fstat(metadata_fd)
    entry_after = os.stat("failed-state-metadata.json", dir_fd=receipt_fd, follow_symlinks=False)
    stable_fields = (
        "st_dev", "st_ino", "st_size", "st_mtime_ns", "st_ctime_ns",
        "st_nlink", "st_uid", "st_gid", "st_mode",
    )
    if (
        tuple(getattr(before, field) for field in stable_fields)
        != tuple(getattr(after, field) for field in stable_fields)
        or (after.st_dev, after.st_ino) != (entry_after.st_dev, entry_after.st_ino)
        or len(metadata_raw) != before.st_size
    ):
        raise SystemExit("ROLLBACK_RESTORE_ORDER_METADATA_CHANGED")
    failed_state = json.loads(metadata_raw)
finally:
    os.close(metadata_fd)
parse = lambda value: dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
times = [
    parse(failed_state["quiesced_at"]),
    parse(failed_state["forensic_started_at"]),
    parse(failed_state["forensic_completed_at"]),
    parse(started_at),
    parse(completed_at),
]
if times != sorted(times):
    raise SystemExit("ROLLBACK_FORENSIC_RESTORE_ORDER_INVALID")
payload = {
    "id": "KIDULTS_DATABASE_RESTORE_ORDER_V1",
    "version": "1.0.0",
    "quiesced_at": failed_state["quiesced_at"],
    "forensic_started_at": failed_state["forensic_started_at"],
    "forensic_completed_at": failed_state["forensic_completed_at"],
    "restore_started_at": started_at,
    "restore_completed_at": completed_at,
    "sqlite_transaction_receipt": "sqlite-restore-transaction-v1.jsonl",
}
raw = (json.dumps(payload, indent=2) + "\n").encode("utf-8")
data_fd = os.open("database-restore-order.json", os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=receipt_fd)
checksum_fd = -1
try:
    remaining = memoryview(raw)
    while remaining:
        written = os.write(data_fd, remaining)
        if written <= 0:
            raise SystemExit("ROLLBACK_RESTORE_ORDER_WRITE")
        remaining = remaining[written:]
    os.fsync(data_fd)
    checksum = f"{hashlib.sha256(raw).hexdigest()}  database-restore-order.json\n".encode("ascii")
    checksum_fd = os.open("database-restore-order.json.sha256", os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=receipt_fd)
    remaining = memoryview(checksum)
    while remaining:
        written = os.write(checksum_fd, remaining)
        if written <= 0:
            raise SystemExit("ROLLBACK_RESTORE_ORDER_CHECKSUM_WRITE")
        remaining = remaining[written:]
    os.fsync(checksum_fd)
    os.fsync(receipt_fd)
finally:
    if checksum_fd >= 0:
        os.close(checksum_fd)
    os.close(data_fd)
PY
append_rollback_transaction_event "DATABASE_COMMITTED" "SQLITE_TRANSACTION_RECEIPT_DURABLE"
ROLLBACK_PHASE="DATABASE_COMMITTED"
[[ "$(verify_protected_database_parent_fd "${PROD_DB_PARENT_REAL}" 7)" == "${PROD_DB_PARENT_ID}" ]] \
  || fail "Production database parent changed after atomic restore"
verify_existing_database_entry_fd || fail "Restored Production database entry is unsafe"
verify_runtime_containers_stopped "container-quiescence-after-restore.json" \
  || fail "Production rollback containers restarted after database restore"

python3 -I - 8 10 4 <<'PY'
import ctypes
import datetime as dt
import errno
import hashlib
import json
import os
import secrets
import stat
import sys

source_fd = int(sys.argv[1])
destination_fd = int(sys.argv[2])
receipt_fd = int(sys.argv[3])
transaction_name = ".kidults-config-restore-transaction-v1.jsonl"
receipt_name = "configuration-restore-transaction-v1.jsonl"
files = [
    ("env.production.snapshot", ".env.production"),
    ("docker-compose.production.yml", "docker-compose.production.yml"),
]
test_hooks = os.environ.get("KIDULTS_CONFIG_RESTORE_TEST_HOOKS")
test_fail_phase = os.environ.get("KIDULTS_CONFIG_RESTORE_TEST_FAIL_PHASE", "")
allowed_test_phases = {"after_first_publish", "after_first_publish_reverse_failure"}
if test_fail_phase and test_hooks != "ENABLED_FAIL_CLOSED_ONLY":
    raise SystemExit("CONFIG_RESTORE_TEST_HOOK_FORBIDDEN")
if test_fail_phase not in allowed_test_phases | {""}:
    raise SystemExit("CONFIG_RESTORE_TEST_PHASE_INVALID")


def write_all(descriptor, raw):
    remaining = memoryview(raw)
    while remaining:
        written = os.write(descriptor, remaining)
        if written <= 0:
            raise SystemExit("CONFIG_RESTORE_WRITE_FAILED")
        remaining = remaining[written:]


def copy_and_digest(source_descriptor, target_descriptor):
    digest = hashlib.sha256()
    while True:
        block = os.read(source_descriptor, 1024 * 1024)
        if not block:
            break
        digest.update(block)
        write_all(target_descriptor, block)
    return "sha256:" + digest.hexdigest()


def rename_exchange(parent_fd, left, right):
    libc = ctypes.CDLL(None, use_errno=True)
    function = getattr(libc, "renameat2", None)
    if function is None:
        raise SystemExit("CONFIG_RESTORE_RENAME_EXCHANGE_REQUIRED")
    function.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint]
    function.restype = ctypes.c_int
    if function(parent_fd, os.fsencode(left), parent_fd, os.fsencode(right), 2) != 0:  # RENAME_EXCHANGE
        number = ctypes.get_errno()
        raise OSError(number, os.strerror(number))


def metadata(descriptor):
    value = os.fstat(descriptor)
    if not stat.S_ISREG(value.st_mode) or value.st_nlink != 1 or stat.S_IMODE(value.st_mode) & 0o7022:
        raise SystemExit("CONFIG_RESTORE_ENTRY_METADATA_UNSAFE")
    return value


try:
    os.stat(transaction_name, dir_fd=destination_fd, follow_symlinks=False)
except FileNotFoundError:
    pass
else:
    raise SystemExit("CONFIG_RESTORE_PREEXISTING_TRANSACTION_HOLD")

transaction_fd = os.open(transaction_name, os.O_WRONLY | os.O_APPEND | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=destination_fd)
try:
    receipt_journal_fd = os.open(receipt_name, os.O_WRONLY | os.O_APPEND | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=receipt_fd)
except BaseException:
    os.close(transaction_fd)
    os.unlink(transaction_name, dir_fd=destination_fd)
    os.fsync(destination_fd)
    raise
transaction_id = secrets.token_hex(32)
sequence = 0


def journal(phase, **details):
    global sequence
    sequence += 1
    raw = (json.dumps({
        "id": "KIDULTS_CONFIGURATION_RESTORE_TRANSACTION_EVENT_V1",
        "version": "1.0.0",
        "sequence": sequence,
        "transaction_id": transaction_id,
        "phase": phase,
        "observed_at": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        **details,
    }, sort_keys=True, separators=(",", ":")) + "\n").encode("utf-8")
    for descriptor in (transaction_fd, receipt_journal_fd):
        write_all(descriptor, raw)
        os.fsync(descriptor)
    os.fsync(destination_fd)
    os.fsync(receipt_fd)


records = []
published = []
try:
    for source_name, destination_name in files:
        source_descriptor = os.open(
            source_name,
            os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK,
            dir_fd=source_fd,
        )
        destination_descriptor = os.open(
            destination_name,
            os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK,
            dir_fd=destination_fd,
        )
        try:
            source_before = metadata(source_descriptor)
            destination_before = metadata(destination_descriptor)
            destination_entry = os.stat(destination_name, dir_fd=destination_fd, follow_symlinks=False)
            if (destination_before.st_dev, destination_before.st_ino) != (destination_entry.st_dev, destination_entry.st_ino):
                raise SystemExit("CONFIG_RESTORE_DESTINATION_IDENTITY_CHANGED")
            temp_name = f".kidults-config-restore.{transaction_id}.{len(records)}.tmp"
            temp_descriptor = os.open(temp_name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=destination_fd)
            try:
                replacement_digest = copy_and_digest(source_descriptor, temp_descriptor)
                os.fchown(temp_descriptor, destination_before.st_uid, destination_before.st_gid)
                os.fchmod(temp_descriptor, stat.S_IMODE(destination_before.st_mode))
                os.fsync(temp_descriptor)
                temp_metadata = os.fstat(temp_descriptor)
                temp_entry = os.stat(temp_name, dir_fd=destination_fd, follow_symlinks=False)
                if (temp_metadata.st_dev, temp_metadata.st_ino) != (temp_entry.st_dev, temp_entry.st_ino):
                    raise SystemExit("CONFIG_RESTORE_TEMP_IDENTITY_CHANGED")
            finally:
                os.close(temp_descriptor)
            source_after = os.fstat(source_descriptor)
            if (source_before.st_dev, source_before.st_ino, source_before.st_size, source_before.st_mtime_ns) != (
                source_after.st_dev, source_after.st_ino, source_after.st_size, source_after.st_mtime_ns
            ):
                raise SystemExit("CONFIG_RESTORE_SOURCE_CHANGED")
            records.append({
                "source_name": source_name,
                "destination_name": destination_name,
                "temp_name": temp_name,
                "replacement_digest": replacement_digest,
                "prior_identity": [destination_before.st_dev, destination_before.st_ino],
                "prior_size": destination_before.st_size,
                "prior_mtime_ns": destination_before.st_mtime_ns,
            })
        finally:
            os.close(destination_descriptor)
            os.close(source_descriptor)
    os.fsync(destination_fd)
    journal("STAGED_DURABLE", files=records)
    for record in records:
        destination_entry = os.stat(record["destination_name"], dir_fd=destination_fd, follow_symlinks=False)
        if [destination_entry.st_dev, destination_entry.st_ino] != record["prior_identity"]:
            raise SystemExit("CONFIG_RESTORE_DESTINATION_CHANGED_BEFORE_EXCHANGE")
        rename_exchange(destination_fd, record["temp_name"], record["destination_name"])
        published.append(record)
        os.fsync(destination_fd)
        journal("FILE_PUBLISHED", destination_name=record["destination_name"], replacement_digest=record["replacement_digest"])
        if len(published) == 1 and test_fail_phase in allowed_test_phases:
            raise SystemExit("CONFIG_RESTORE_INJECTED_FAILURE:" + test_fail_phase)
    for record in records:
        descriptor = os.open(
            record["destination_name"],
            os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK,
            dir_fd=destination_fd,
        )
        try:
            digest = hashlib.sha256()
            while True:
                block = os.read(descriptor, 1024 * 1024)
                if not block:
                    break
                digest.update(block)
            if "sha256:" + digest.hexdigest() != record["replacement_digest"]:
                raise SystemExit("CONFIG_RESTORE_PUBLISHED_DIGEST_MISMATCH")
        finally:
            os.close(descriptor)
    journal("COMMITTED", files=[record["destination_name"] for record in records])
except BaseException:
    recovery_failures = []
    for record in reversed(published):
        try:
            if test_fail_phase == "after_first_publish_reverse_failure":
                raise OSError(errno.EIO, "injected reverse-exchange failure")
            rename_exchange(destination_fd, record["temp_name"], record["destination_name"])
        except BaseException as error:
            recovery_failures.append(f"{record['destination_name']}:{type(error).__name__}")
    os.fsync(destination_fd)
    journal("ABORTED_ROLLED_BACK" if not recovery_failures else "ABORT_RECOVERY_HOLD", failures=recovery_failures)
    if not recovery_failures:
        for record in records:
            try:
                os.unlink(record["temp_name"], dir_fd=destination_fd)
            except FileNotFoundError:
                pass
        os.fsync(destination_fd)
        os.unlink(transaction_name, dir_fd=destination_fd)
        os.fsync(destination_fd)
    raise
else:
    for record in records:
        old_entry = os.stat(record["temp_name"], dir_fd=destination_fd, follow_symlinks=False)
        if [old_entry.st_dev, old_entry.st_ino] != record["prior_identity"]:
            raise SystemExit("CONFIG_RESTORE_PRIOR_IDENTITY_NOT_RETAINED")
        os.unlink(record["temp_name"], dir_fd=destination_fd)
    os.fsync(destination_fd)
    os.unlink(transaction_name, dir_fd=destination_fd)
    os.fsync(destination_fd)
finally:
    os.close(receipt_journal_fd)
    os.close(transaction_fd)
PY
append_rollback_transaction_event "CONFIGURATION_COMMITTED" "TWO_FILE_EXCHANGE_TRANSACTION_DURABLE"
ROLLBACK_PHASE="CONFIGURATION_COMMITTED"

cd "${PROD_ROOT}"
docker compose --env-file .env.production -f docker-compose.production.yml config >/dev/null
python3 -I - 4 "${ROLLBACK_GATEWAY_SERVICE}" "${ROLLBACK_SCHEDULER_SERVICE}" <<'PY'
import hashlib
import os
import re
import sys
receipt_fd = int(sys.argv[1])
services = sys.argv[2:]
if len(services) != 2 or len(set(services)) != 2 or any(re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,127}", value) is None for value in services):
    raise SystemExit("ROLLBACK_RESTART_NO_OVERRIDE_SERVICE_NAMES")
raw = ("services:\n" + "".join(f"  {service}:\n    restart: \"no\"\n" for service in services)).encode("utf-8")
data_fd = os.open("restart-no-compose-override.yml", os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=receipt_fd)
checksum_fd = -1
try:
    for descriptor, payload in ((data_fd, raw),):
        remaining = memoryview(payload)
        while remaining:
            written = os.write(descriptor, remaining)
            if written <= 0:
                raise SystemExit("ROLLBACK_RESTART_NO_OVERRIDE_WRITE")
            remaining = remaining[written:]
    os.fsync(data_fd)
    checksum = f"{hashlib.sha256(raw).hexdigest()}  restart-no-compose-override.yml\n".encode("ascii")
    checksum_fd = os.open("restart-no-compose-override.yml.sha256", os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=receipt_fd)
    remaining = memoryview(checksum)
    while remaining:
        written = os.write(checksum_fd, remaining)
        if written <= 0:
            raise SystemExit("ROLLBACK_RESTART_NO_OVERRIDE_CHECKSUM_WRITE")
        remaining = remaining[written:]
    os.fsync(checksum_fd)
    os.fsync(receipt_fd)
finally:
    if checksum_fd >= 0:
        os.close(checksum_fd)
    os.close(data_fd)
PY
docker compose --env-file .env.production -f docker-compose.production.yml \
  -f "${RECEIPT_DIR_STABLE}/restart-no-compose-override.yml" config >/dev/null \
  || fail "Rollback restart=no compose override is invalid"
docker compose --env-file .env.production -f docker-compose.production.yml \
  -f "${RECEIPT_DIR_STABLE}/restart-no-compose-override.yml" \
  up --no-start --force-recreate --pull never --no-build --no-deps \
  "${ROLLBACK_GATEWAY_SERVICE}" "${ROLLBACK_SCHEDULER_SERVICE}"
CURRENT_GATEWAY_CONTAINER_ID="$(docker inspect --format '{{.Id}}' kidults-gateway)" \
  || fail "Recreated gateway container identity is unavailable"
CURRENT_SCHEDULER_CONTAINER_ID="$(docker inspect --format '{{.Id}}' kidults-scheduler)" \
  || fail "Recreated scheduler container identity is unavailable"
[[ "${CURRENT_GATEWAY_CONTAINER_ID}" =~ ^[0-9a-f]{64}$ \
  && "${CURRENT_SCHEDULER_CONTAINER_ID}" =~ ^[0-9a-f]{64}$ \
  && "${CURRENT_GATEWAY_CONTAINER_ID}" != "${CURRENT_SCHEDULER_CONTAINER_ID}" ]] \
  || fail "Recreated rollback container identity binding is invalid"
docker update --restart=no "${CURRENT_GATEWAY_CONTAINER_ID}" "${CURRENT_SCHEDULER_CONTAINER_ID}" >/dev/null \
  || fail "Recreated rollback containers could not be pinned to restart=no"
[[ "$(docker inspect --format '{{.HostConfig.RestartPolicy.Name}}' "${CURRENT_GATEWAY_CONTAINER_ID}")" == "no" \
  && "$(docker inspect --format '{{.HostConfig.RestartPolicy.Name}}' "${CURRENT_SCHEDULER_CONTAINER_ID}")" == "no" ]] \
  || fail "Recreated rollback container restart=no containment was not verified"
verify_runtime_containers_stopped "container-quiescence-before-startup.json" \
  || fail "Recreated Production containers are not quiescent before recovery startup"
[[ "$(verify_protected_database_parent_fd "${PROD_DB_PARENT_REAL}" 7)" == "${PROD_DB_PARENT_ID}" ]] \
  || fail "Production database parent changed before recovery startup"
verify_sqlite_sidecar_namespace_absent_fd \
  || fail "Known or unknown SQLite sidecar namespace reappeared before recovery startup"
[[ "$(verify_protected_database_parent_fd "${PROD_DB_PARENT_REAL}" 7)" == "${PROD_DB_PARENT_ID}" ]] \
  || fail "Production database parent changed during pre-start sidecar revalidation"
docker start "${CURRENT_GATEWAY_CONTAINER_ID}" "${CURRENT_SCHEDULER_CONTAINER_ID}" >/dev/null \
  || fail "Production rollback container startup failed"
append_rollback_transaction_event "RECOVERY_STARTED" "RECREATED_CONTAINERS_STARTED_ONLY_AFTER_RESTART_NO"
ROLLBACK_PHASE="RECOVERY_STARTED"
sleep 30

DB_INTEGRITY="$(sqlite3 "${PROD_DB}" 'PRAGMA integrity_check;')"
HEALTH_HTTP="$(curl_to_exclusive_receipt_fd "health.json" "${BASE_URL}/api/health")" \
  || fail "Health rollback receipt capture failed"
PORTAL_HTTP="$(curl_to_exclusive_receipt_fd "portal.html" "${BASE_URL}/portal/")" \
  || fail "Portal rollback receipt capture failed"
UNAUTH_HTTP="$(curl_to_exclusive_receipt_fd "collector-unauth.json" "${BASE_URL}/api/collector?mode=live")" \
  || fail "Unauthenticated collector rollback receipt capture failed"
AFTER_GATEWAY_IMAGE="$(docker inspect -f '{{.Image}}' "${CURRENT_GATEWAY_CONTAINER_ID}")" \
  || fail "Recovered gateway image identity query failed"
AFTER_SCHEDULER_IMAGE="$(docker inspect -f '{{.Image}}' "${CURRENT_SCHEDULER_CONTAINER_ID}")" \
  || fail "Recovered scheduler image identity query failed"

EXPECTED_GATEWAY_IMAGE="$(python3 -I -c 'import json,sys; print(json.load(open(sys.argv[1]))["kidults-gateway"]["image_id"])' "${PREDEPLOYMENT_SNAPSHOT_DIR}/rollback-images.json")"
EXPECTED_SCHEDULER_IMAGE="$(python3 -I -c 'import json,sys; print(json.load(open(sys.argv[1]))["kidults-scheduler"]["image_id"])' "${PREDEPLOYMENT_SNAPSHOT_DIR}/rollback-images.json")"

RESULT="PASS"
FAILURES=()
[[ "${DB_INTEGRITY}" == "ok" ]] || { RESULT="FAIL"; FAILURES+=(database_integrity); }
[[ "${HEALTH_HTTP}" == "200" ]] || { RESULT="FAIL"; FAILURES+=(health_http); }
[[ "${PORTAL_HTTP}" == "200" ]] || { RESULT="FAIL"; FAILURES+=(portal_http); }
[[ "${UNAUTH_HTTP}" == "401" ]] || { RESULT="FAIL"; FAILURES+=(unauthenticated_collector_http); }
[[ "${AFTER_GATEWAY_IMAGE}" == "${EXPECTED_GATEWAY_IMAGE}" ]] || { RESULT="FAIL"; FAILURES+=(gateway_image_identity); }
[[ "${AFTER_SCHEDULER_IMAGE}" == "${EXPECTED_SCHEDULER_IMAGE}" ]] || { RESULT="FAIL"; FAILURES+=(scheduler_image_identity); }

FAILURE_CSV="$(IFS=,; echo "${FAILURES[*]-}")"
if [[ "${RESULT}" != "PASS" ]]; then
  ROLLBACK_PHASE="RECOVERY_VALIDATION_FAILED"
  append_rollback_transaction_event "RECOVERY_VALIDATION_FAILED" "${FAILURE_CSV}"
  rollback_failure_trap 3 RECOVERY_VALIDATION_FAILURE
fi
append_rollback_transaction_event "RECOVERY_VERIFIED" "DATABASE_HEALTH_AUTH_AND_IMMUTABLE_IMAGES_PASS"
ROLLBACK_PHASE="RECOVERY_VERIFIED"

ROLLBACK_COMPLETED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
python3 -I - 4 "${ROLLBACK_COMPLETED_AT}" "${ROLLBACK_TRIGGER}" "${ORIGINAL_SNAPSHOT_DIR}" "${SNAPSHOT_MANIFEST_SHA256}" "${RESULT}" "${FAILURE_CSV}" "${BEFORE_GATEWAY_IMAGE}" "${BEFORE_SCHEDULER_IMAGE}" "${AFTER_GATEWAY_IMAGE}" "${AFTER_SCHEDULER_IMAGE}" "${DB_INTEGRITY}" "${HEALTH_HTTP}" "${PORTAL_HTTP}" "${UNAUTH_HTTP}" "${CURRENT_GATEWAY_CONTAINER_ID}" "${CURRENT_SCHEDULER_CONTAINER_ID}" "${ROLLBACK_RECEIPT_ROOT_ID}" "${ROLLBACK_RECEIPT_DIR_ID}" <<'PY'
import hashlib
import json
import os
import stat
import sys
receipt_fd = int(sys.argv[1])
payload = {
    "id": "KIDULTS_PRODUCTION_ROLLBACK_RECEIPT_V1",
    "version": "1.0.0",
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
    "container_ids": {"gateway": sys.argv[16], "scheduler": sys.argv[17]},
    "container_quiescence_receipts": [
        "container-quiescence-after-stop.json",
        "container-quiescence-before-restore.json",
        "container-quiescence-after-restore.json",
        "container-quiescence-before-startup.json",
    ],
    "sqlite_sidecar_policy": "QUARANTINED_TO_EXCLUSIVE_RECEIPT_AND_ABSENT_BEFORE_MAIN_DB_PUBLISH",
    "rollback_receipt_root_identity": sys.argv[18],
    "rollback_receipt_directory_identity": sys.argv[19],
    "artfund_change_executed": False,
}
raw = (json.dumps(payload, indent=2) + "\n").encode("utf-8")
target_fd = os.open("rollback-receipt.json", os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=receipt_fd)
checksum_fd = -1
try:
    remaining = memoryview(raw)
    while remaining:
        written = os.write(target_fd, remaining)
        if written <= 0:
            raise SystemExit("ROLLBACK_FINAL_RECEIPT_WRITE_FAILED")
        remaining = remaining[written:]
    os.fsync(target_fd)
    metadata = os.fstat(target_fd)
    entry = os.stat("rollback-receipt.json", dir_fd=receipt_fd, follow_symlinks=False)
    if (
        not stat.S_ISREG(metadata.st_mode)
        or metadata.st_uid != 0
        or metadata.st_gid != 0
        or stat.S_IMODE(metadata.st_mode) != 0o600
        or (metadata.st_dev, metadata.st_ino) != (entry.st_dev, entry.st_ino)
    ):
        raise SystemExit("ROLLBACK_FINAL_RECEIPT_IDENTITY_INVALID")
    checksum = f"{hashlib.sha256(raw).hexdigest()}  rollback-receipt.json\n".encode("ascii")
    checksum_fd = os.open("rollback-receipt.json.sha256", os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=receipt_fd)
    remaining = memoryview(checksum)
    while remaining:
        written = os.write(checksum_fd, remaining)
        if written <= 0:
            raise SystemExit("ROLLBACK_FINAL_RECEIPT_CHECKSUM_WRITE_FAILED")
        remaining = remaining[written:]
    os.fsync(checksum_fd)
    os.fsync(receipt_fd)
finally:
    if checksum_fd >= 0:
        os.close(checksum_fd)
    os.close(target_fd)
print(json.dumps(payload, indent=2))
PY
append_rollback_transaction_event "TERMINAL_SUCCESS_RECEIPT_WRITTEN" "ROLLBACK_RECEIPT_AND_CHECKSUM_DURABLE"
ROLLBACK_PHASE="TERMINAL_SUCCESS_RECEIPT_WRITTEN"

[[ "$(docker inspect --format '{{.HostConfig.RestartPolicy.Name}}' "${CURRENT_GATEWAY_CONTAINER_ID}")" == "no" \
  && "$(docker inspect --format '{{.HostConfig.RestartPolicy.Name}}' "${CURRENT_SCHEDULER_CONTAINER_ID}")" == "no" ]] \
  || fail "Rollback restart=no containment changed before terminal success publication"
ROLLBACK_TERMINAL_SUCCESS_MANIFEST_SHA256="$(
  python3 -I - 4 "${RECEIPT_DIR_NAME}" "${SOURCE_SHA}" \
    "${EXPECTED_PREDEPLOYMENT_SNAPSHOT_MANIFEST_SHA256}" <<'PY'
import ctypes
import datetime as dt
import hashlib
import json
import os
import re
import secrets
import stat
import sys

receipt_fd = int(sys.argv[1])
required = {
    "docker-load.txt",
    "health.json",
    "portal.html",
    "collector-unauth.json",
    "container-quiescence-after-stop.json",
    "container-quiescence-before-restore.json",
    "container-quiescence-after-restore.json",
    "container-quiescence-before-startup.json",
    "rollback-transaction-v1.jsonl",
    "restart-policy-before.json",
    "restart-policy-before.json.sha256",
    "restart-no-compose-override.yml",
    "restart-no-compose-override.yml.sha256",
    "failed-state-metadata.json",
    "failed-state-metadata.json.sha256",
    "database-restore-order.json",
    "database-restore-order.json.sha256",
    "sqlite-restore-transaction-v1.jsonl",
    "configuration-restore-transaction-v1.jsonl",
    "rollback-receipt.json",
    "rollback-receipt.json.sha256",
}
optional = {
    "failed-kaios.db", "failed-kaios.db.sha256",
    "failed-env.production.snapshot", "failed-docker-compose.production.yml",
    "failed-kaios.db-wal", "failed-kaios.db-wal.sha256",
    "failed-kaios.db-shm", "failed-kaios.db-shm.sha256",
    "failed-kaios.db-journal", "failed-kaios.db-journal.sha256",
}
pairs = (
    ("failed-kaios.db", "failed-kaios.db.sha256"),
    ("failed-kaios.db-wal", "failed-kaios.db-wal.sha256"),
    ("failed-kaios.db-shm", "failed-kaios.db-shm.sha256"),
    ("failed-kaios.db-journal", "failed-kaios.db-journal.sha256"),
    ("restart-policy-before.json", "restart-policy-before.json.sha256"),
    ("restart-no-compose-override.yml", "restart-no-compose-override.yml.sha256"),
    ("failed-state-metadata.json", "failed-state-metadata.json.sha256"),
    ("database-restore-order.json", "database-restore-order.json.sha256"),
    ("rollback-receipt.json", "rollback-receipt.json.sha256"),
)


def scan_member(name, capture_limit=None):
    descriptor = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=receipt_fd)
    try:
        before = os.fstat(descriptor)
        entry_before = os.stat(name, dir_fd=receipt_fd, follow_symlinks=False)
        if (
            not stat.S_ISREG(before.st_mode)
            or before.st_nlink != 1
            or before.st_uid != 0
            or before.st_gid != 0
            or stat.S_IMODE(before.st_mode) != 0o600
            or (before.st_dev, before.st_ino) != (entry_before.st_dev, entry_before.st_ino)
        ):
            raise SystemExit("ROLLBACK_TERMINAL_MEMBER_IDENTITY:" + name)
        digest = hashlib.sha256()
        size = 0
        captured = bytearray() if capture_limit is not None else None
        while True:
            block = os.read(descriptor, 1024 * 1024)
            if not block:
                break
            digest.update(block)
            size += len(block)
            if captured is not None:
                if size > capture_limit:
                    raise SystemExit("ROLLBACK_TERMINAL_SMALL_MEMBER_TOO_LARGE:" + name)
                captured.extend(block)
        after = os.fstat(descriptor)
        entry_after = os.stat(name, dir_fd=receipt_fd, follow_symlinks=False)
        stable_fields = ("st_dev", "st_ino", "st_size", "st_mtime_ns", "st_ctime_ns", "st_nlink", "st_uid", "st_gid", "st_mode")
        if (
            tuple(getattr(before, field) for field in stable_fields) != tuple(getattr(after, field) for field in stable_fields)
            or (after.st_dev, after.st_ino) != (entry_after.st_dev, entry_after.st_ino)
            or size != before.st_size
        ):
            raise SystemExit("ROLLBACK_TERMINAL_MEMBER_CHANGED_DURING_SCAN:" + name)
        return "sha256:" + digest.hexdigest(), bytes(captured) if captured is not None else None
    finally:
        os.close(descriptor)


actual = set(os.listdir(receipt_fd))
if not required <= actual or not actual <= required | optional:
    raise SystemExit("ROLLBACK_TERMINAL_PRECOMMIT_EXACT_CLOSURE:" + repr(sorted(actual)))
for name in actual:
    if re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,127}", name) is None:
        raise SystemExit("ROLLBACK_TERMINAL_MEMBER_NAME:" + name)
    scan_member(name)
for data_name, checksum_name in pairs:
    if (data_name in actual) != (checksum_name in actual):
        raise SystemExit("ROLLBACK_TERMINAL_CHECKSUM_PAIR:" + data_name)
    if data_name not in actual:
        continue
    data_digest, _ = scan_member(data_name)
    _, checksum = scan_member(checksum_name, 4096)
    expected = f"{data_digest.removeprefix('sha256:')}  {data_name}\n".encode("ascii")
    if checksum != expected:
        raise SystemExit("ROLLBACK_TERMINAL_CHECKSUM_INVALID:" + data_name)
receipt_digest, _ = scan_member("rollback-receipt.json")
receipt_checksum_digest, _ = scan_member("rollback-receipt.json.sha256")
manifest = {
    "id": "KIDULTS_PRODUCTION_ROLLBACK_TERMINAL_SUCCESS_MANIFEST_V1",
    "version": "1.0.0",
    "state": "TERMINAL_SUCCESS_RESTART_POLICY_CLEANUP_PENDING",
    "commit_marker": True,
    "manifest_published_last_at_terminal_boundary": True,
    "restart_policy_at_commit": "no",
    "receipt_directory_name": sys.argv[2],
    "source_sha": sys.argv[3],
    "snapshot_manifest_sha256": sys.argv[4],
    "rollback_receipt_sha256": receipt_digest,
    "rollback_receipt_checksum_sha256": receipt_checksum_digest,
    "members_at_terminal_boundary": sorted(actual),
    "committed_at": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
}
manifest_raw = (json.dumps(manifest, indent=2) + "\n").encode("utf-8")
final_name = "rollback-terminal-success-manifest.json"
if final_name in actual or any(name.startswith(".rollback-terminal-success.") for name in actual):
    raise SystemExit("ROLLBACK_TERMINAL_SUCCESS_MANIFEST_PREEXISTING_HOLD")
stage_name = f".rollback-terminal-success.{secrets.token_hex(32)}.tmp"
test_hooks = os.environ.get("KIDULTS_ROLLBACK_TERMINAL_MANIFEST_TEST_HOOKS")
test_fail_phase = os.environ.get("KIDULTS_ROLLBACK_TERMINAL_MANIFEST_TEST_FAIL_PHASE", "")
allowed_test_phases = {"after_stage_write", "after_stage_fsync", "before_rename"}
if test_fail_phase and test_hooks != "ENABLED_FAIL_CLOSED_ONLY":
    raise SystemExit("ROLLBACK_TERMINAL_MANIFEST_TEST_HOOK_FORBIDDEN")
if test_fail_phase not in allowed_test_phases | {""}:
    raise SystemExit("ROLLBACK_TERMINAL_MANIFEST_TEST_PHASE_INVALID")


def maybe_fail(phase):
    if test_fail_phase == phase:
        raise SystemExit("ROLLBACK_TERMINAL_MANIFEST_INJECTED_FAILURE:" + phase)


stage_identity = None
published = False
try:
    stage_fd = os.open(stage_name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=receipt_fd)
    try:
        stage_metadata = os.fstat(stage_fd)
        stage_identity = (stage_metadata.st_dev, stage_metadata.st_ino)
        remaining = memoryview(manifest_raw)
        while remaining:
            written = os.write(stage_fd, remaining)
            if written <= 0:
                raise SystemExit("ROLLBACK_TERMINAL_SUCCESS_MANIFEST_WRITE")
            remaining = remaining[written:]
        maybe_fail("after_stage_write")
        os.fsync(stage_fd)
        maybe_fail("after_stage_fsync")
    finally:
        os.close(stage_fd)
    os.fsync(receipt_fd)
    libc = ctypes.CDLL(None, use_errno=True)
    renameat2 = getattr(libc, "renameat2", None)
    if renameat2 is None:
        raise SystemExit("ROLLBACK_TERMINAL_SUCCESS_RENAME_NOREPLACE_REQUIRED")
    renameat2.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint]
    renameat2.restype = ctypes.c_int
    maybe_fail("before_rename")
    if renameat2(receipt_fd, os.fsencode(stage_name), receipt_fd, os.fsencode(final_name), 1) != 0:
        number = ctypes.get_errno()
        raise OSError(number, os.strerror(number))
    published = True
    os.fsync(receipt_fd)
    if scan_member(final_name, 4 * 1024 * 1024)[1] != manifest_raw:
        raise SystemExit("ROLLBACK_TERMINAL_SUCCESS_MANIFEST_PUBLICATION_BINDING")
    after = set(os.listdir(receipt_fd))
    if after != actual | {final_name} or any(name.startswith(".rollback-terminal-success.") for name in after):
        raise SystemExit("ROLLBACK_TERMINAL_SUCCESS_MANIFEST_LAST_CLOSURE")
finally:
    if not published and stage_identity is not None:
        try:
            staged = os.stat(stage_name, dir_fd=receipt_fd, follow_symlinks=False)
        except FileNotFoundError:
            pass
        else:
            if (
                not stat.S_ISREG(staged.st_mode)
                or staged.st_nlink != 1
                or staged.st_uid != 0
                or staged.st_gid != 0
                or stat.S_IMODE(staged.st_mode) != 0o600
                or (staged.st_dev, staged.st_ino) != stage_identity
            ):
                raise SystemExit("ROLLBACK_TERMINAL_SUCCESS_STAGE_CLEANUP_IDENTITY_HOLD")
            os.unlink(stage_name, dir_fd=receipt_fd)
            os.fsync(receipt_fd)
print("sha256:" + hashlib.sha256(manifest_raw).hexdigest())
PY
)" || fail "Rollback terminal success manifest publication failed"
[[ "${ROLLBACK_TERMINAL_SUCCESS_MANIFEST_SHA256}" =~ ^sha256:[0-9a-f]{64}$ ]] \
  || fail "Rollback terminal success manifest digest is invalid"
transition_rollback_pointer_to_terminal_success \
  || fail "Rollback active pointer terminal-success transition failed"
rollback_terminal_pointer_is_authoritative \
  || fail "Rollback terminal-success pointer is not authoritative"
ROLLBACK_TERMINAL_SUCCESS=true
append_rollback_transaction_event "TERMINAL_SUCCESS_COMMITTED" \
  "MANIFEST_LAST_AND_ACTIVE_POINTER_TRANSITIONED_WITH_RESTART_NO"
ROLLBACK_PHASE="TERMINAL_SUCCESS_RESTART_POLICY_CLEANUP_PENDING"

IFS=$'\t' read -r GATEWAY_RESTART_POLICY SCHEDULER_RESTART_POLICY < <(
  python3 -I - 4 <<'PY'
import json
import os
import stat
import sys

receipt_fd = int(sys.argv[1])
name = "restart-policy-before.json"
before = os.stat(name, dir_fd=receipt_fd, follow_symlinks=False)
descriptor = os.open(
    name,
    os.O_RDONLY | os.O_NONBLOCK | getattr(os, "O_NOFOLLOW", 0),
    dir_fd=receipt_fd,
)
try:
    opened = os.fstat(descriptor)
    if (
        not stat.S_ISREG(opened.st_mode)
        or opened.st_nlink != 1
        or opened.st_uid != 0
        or opened.st_gid != 0
        or stat.S_IMODE(opened.st_mode) != 0o600
        or (opened.st_dev, opened.st_ino) != (before.st_dev, before.st_ino)
        or opened.st_size > 1024 * 1024
    ):
        raise SystemExit("ROLLBACK_RESTART_POLICY_RECEIPT_UNSAFE")
    raw = b""
    while True:
        block = os.read(descriptor, min(1024 * 1024, 1024 * 1024 + 1 - len(raw)))
        if not block:
            break
        raw += block
        if len(raw) > 1024 * 1024:
            raise SystemExit("ROLLBACK_RESTART_POLICY_RECEIPT_TOO_LARGE")
    after = os.fstat(descriptor)
    path_after = os.stat(name, dir_fd=receipt_fd, follow_symlinks=False)
    fields = ("st_dev", "st_ino", "st_size", "st_mtime_ns", "st_ctime_ns", "st_nlink", "st_uid", "st_gid", "st_mode")
    if (
        tuple(getattr(opened, field) for field in fields)
        != tuple(getattr(after, field) for field in fields)
        or (after.st_dev, after.st_ino) != (path_after.st_dev, path_after.st_ino)
    ):
        raise SystemExit("ROLLBACK_RESTART_POLICY_RECEIPT_CHANGED")
finally:
    os.close(descriptor)
payload = json.loads(raw)
by_name = {item["container_name"]: item for item in payload["prior_policies"]}
if set(by_name) != {"/kidults-gateway", "/kidults-scheduler"}:
    raise SystemExit("ROLLBACK_RESTART_POLICY_NAME_CLOSURE")
def value(item):
    if item["name"] == "on-failure" and item["maximum_retry_count"]:
        return f"on-failure:{item['maximum_retry_count']}"
    return item["name"]
print(value(by_name["/kidults-gateway"]), value(by_name["/kidults-scheduler"]), sep="\t")
PY
) || fail "Captured restart policies are invalid"
rollback_terminal_pointer_is_authoritative \
  || fail "Nonterminal rollback pointer forbids gateway restart-policy restoration"
docker update --restart="${GATEWAY_RESTART_POLICY}" "${CURRENT_GATEWAY_CONTAINER_ID}" >/dev/null \
  || fail "Gateway restart policy restoration failed"
rollback_terminal_pointer_is_authoritative \
  || fail "Nonterminal rollback pointer forbids scheduler restart-policy restoration"
docker update --restart="${SCHEDULER_RESTART_POLICY}" "${CURRENT_SCHEDULER_CONTAINER_ID}" >/dev/null \
  || fail "Scheduler restart policy restoration failed"
python3 -I - 4 "${CURRENT_GATEWAY_CONTAINER_ID}" "${CURRENT_SCHEDULER_CONTAINER_ID}" \
  "${ROLLBACK_TERMINAL_SUCCESS_MANIFEST_SHA256}" <<'PY'
import hashlib
import json
import os
import stat
import subprocess
import sys

receipt_fd = int(sys.argv[1])
identifiers = sys.argv[2:4]
name = "restart-policy-before.json"
path_before = os.stat(name, dir_fd=receipt_fd, follow_symlinks=False)
before_fd = os.open(
    name,
    os.O_RDONLY | os.O_NONBLOCK | getattr(os, "O_NOFOLLOW", 0),
    dir_fd=receipt_fd,
)
try:
    opened = os.fstat(before_fd)
    if (
        not stat.S_ISREG(opened.st_mode)
        or opened.st_nlink != 1
        or opened.st_uid != 0
        or opened.st_gid != 0
        or stat.S_IMODE(opened.st_mode) != 0o600
        or (opened.st_dev, opened.st_ino) != (path_before.st_dev, path_before.st_ino)
        or opened.st_size > 1024 * 1024
    ):
        raise SystemExit("ROLLBACK_RESTART_POLICY_RECEIPT_UNSAFE")
    before_raw = b""
    while True:
        block = os.read(before_fd, min(1024 * 1024, 1024 * 1024 + 1 - len(before_raw)))
        if not block:
            break
        before_raw += block
        if len(before_raw) > 1024 * 1024:
            raise SystemExit("ROLLBACK_RESTART_POLICY_RECEIPT_TOO_LARGE")
    after = os.fstat(before_fd)
    path_after = os.stat(name, dir_fd=receipt_fd, follow_symlinks=False)
    fields = ("st_dev", "st_ino", "st_size", "st_mtime_ns", "st_ctime_ns", "st_nlink", "st_uid", "st_gid", "st_mode")
    if (
        tuple(getattr(opened, field) for field in fields)
        != tuple(getattr(after, field) for field in fields)
        or (after.st_dev, after.st_ino) != (path_after.st_dev, path_after.st_ino)
    ):
        raise SystemExit("ROLLBACK_RESTART_POLICY_RECEIPT_CHANGED")
finally:
    os.close(before_fd)
before = json.loads(before_raw)
prior_by_name = {item["container_name"]: item for item in before["prior_policies"]}
current = json.loads(subprocess.run(["docker", "inspect", *identifiers], stdout=subprocess.PIPE, check=True).stdout)
records = []
for item in current:
    name = item.get("Name")
    policy = item.get("HostConfig", {}).get("RestartPolicy", {})
    prior = prior_by_name.get(name)
    if prior is None or policy.get("Name") != prior["name"] or policy.get("MaximumRetryCount") != prior["maximum_retry_count"]:
        raise SystemExit("ROLLBACK_RESTART_POLICY_RESTORATION_MISMATCH")
    records.append({"container_id": item["Id"], "container_name": name, "name": policy["Name"], "maximum_retry_count": policy["MaximumRetryCount"]})
raw = (json.dumps({"id": "KIDULTS_ROLLBACK_RESTART_POLICY_RESTORATION_V1", "version": "1.0.0", "terminal_success_manifest_sha256": sys.argv[4], "restored_policies": sorted(records, key=lambda value: value["container_name"])}, indent=2) + "\n").encode("utf-8")
data_fd = os.open("restart-policy-after.json", os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=receipt_fd)
checksum_fd = -1
try:
    remaining = memoryview(raw)
    while remaining:
        written = os.write(data_fd, remaining)
        if written <= 0:
            raise SystemExit("ROLLBACK_RESTART_POLICY_RESTORATION_WRITE")
        remaining = remaining[written:]
    os.fsync(data_fd)
    checksum = f"{hashlib.sha256(raw).hexdigest()}  restart-policy-after.json\n".encode("ascii")
    checksum_fd = os.open("restart-policy-after.json.sha256", os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=receipt_fd)
    remaining = memoryview(checksum)
    while remaining:
        written = os.write(checksum_fd, remaining)
        if written <= 0:
            raise SystemExit("ROLLBACK_RESTART_POLICY_RESTORATION_CHECKSUM_WRITE")
        remaining = remaining[written:]
    os.fsync(checksum_fd)
    os.fsync(receipt_fd)
finally:
    if checksum_fd >= 0:
        os.close(checksum_fd)
    os.close(data_fd)
PY
append_rollback_transaction_event "RESTART_POLICIES_RESTORED" \
  "ONLY_AFTER_TERMINAL_SUCCESS_POINTER_TRANSITION"
ROLLBACK_PHASE="RESTART_POLICIES_RESTORED"

[[ "$(verify_protected_directory_chain_fd "${ROLLBACK_RECEIPT_ROOT}" 5)" == "${ROLLBACK_RECEIPT_ROOT_ID}" ]] \
  || fail "Rollback receipt root changed before final durability seal"
[[ "$(verify_protected_directory_chain_fd "${RECEIPT_DIR}" 4)" == "${ROLLBACK_RECEIPT_DIR_ID}" ]] \
  || fail "Rollback receipt directory changed before final durability seal"
python3 -I - 5 4 "${RECEIPT_DIR_NAME}" <<'PY'
import hashlib
import os
import re
import stat
import sys

root_fd = int(sys.argv[1])
receipt_fd = int(sys.argv[2])
directory_name = sys.argv[3]
root_entry = os.stat(directory_name, dir_fd=root_fd, follow_symlinks=False)
held_directory = os.fstat(receipt_fd)
if (
    not stat.S_ISDIR(held_directory.st_mode)
    or held_directory.st_uid != 0
    or held_directory.st_gid != 0
    or stat.S_IMODE(held_directory.st_mode) != 0o700
    or (held_directory.st_dev, held_directory.st_ino) != (root_entry.st_dev, root_entry.st_ino)
):
    raise SystemExit("ROLLBACK_RECEIPT_FINAL_DIRECTORY_IDENTITY_INVALID")
required = {
    "docker-load.txt",
    "health.json",
    "portal.html",
    "collector-unauth.json",
    "container-quiescence-after-stop.json",
    "container-quiescence-before-restore.json",
    "container-quiescence-after-restore.json",
    "container-quiescence-before-startup.json",
    "rollback-transaction-v1.jsonl",
    "restart-policy-before.json",
    "restart-policy-before.json.sha256",
    "restart-policy-after.json",
    "restart-policy-after.json.sha256",
    "restart-no-compose-override.yml",
    "restart-no-compose-override.yml.sha256",
    "failed-state-metadata.json",
    "failed-state-metadata.json.sha256",
    "database-restore-order.json",
    "database-restore-order.json.sha256",
    "sqlite-restore-transaction-v1.jsonl",
    "configuration-restore-transaction-v1.jsonl",
    "rollback-receipt.json",
    "rollback-receipt.json.sha256",
    "rollback-terminal-success-manifest.json",
}
optional = {
    "failed-kaios.db", "failed-kaios.db.sha256",
    "failed-env.production.snapshot", "failed-docker-compose.production.yml",
    "failed-kaios.db-wal", "failed-kaios.db-wal.sha256",
    "failed-kaios.db-shm", "failed-kaios.db-shm.sha256",
    "failed-kaios.db-journal", "failed-kaios.db-journal.sha256",
}
actual = set(os.listdir(receipt_fd))
if not required <= actual or not actual <= required | optional:
    raise SystemExit(f"ROLLBACK_RECEIPT_FINAL_CLOSURE:{sorted(actual)}")
for data_name, checksum_name in (
    ("failed-kaios.db", "failed-kaios.db.sha256"),
    ("failed-kaios.db-wal", "failed-kaios.db-wal.sha256"),
    ("failed-kaios.db-shm", "failed-kaios.db-shm.sha256"),
    ("failed-kaios.db-journal", "failed-kaios.db-journal.sha256"),
    ("restart-policy-before.json", "restart-policy-before.json.sha256"),
    ("restart-policy-after.json", "restart-policy-after.json.sha256"),
    ("restart-no-compose-override.yml", "restart-no-compose-override.yml.sha256"),
    ("failed-state-metadata.json", "failed-state-metadata.json.sha256"),
    ("database-restore-order.json", "database-restore-order.json.sha256"),
    ("rollback-receipt.json", "rollback-receipt.json.sha256"),
):
    if (data_name in actual) != (checksum_name in actual):
        raise SystemExit(f"ROLLBACK_RECEIPT_CHECKSUM_PAIR:{data_name}")
for name in sorted(actual):
    if re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,127}", name) is None:
        raise SystemExit(f"ROLLBACK_RECEIPT_MEMBER_NAME:{name}")
    member_fd = os.open(
        name,
        os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK,
        dir_fd=receipt_fd,
    )
    try:
        metadata = os.fstat(member_fd)
        entry = os.stat(name, dir_fd=receipt_fd, follow_symlinks=False)
        if (
            not stat.S_ISREG(metadata.st_mode)
            or metadata.st_nlink != 1
            or metadata.st_uid != 0
            or metadata.st_gid != 0
            or stat.S_IMODE(metadata.st_mode) != 0o600
            or (metadata.st_dev, metadata.st_ino) != (entry.st_dev, entry.st_ino)
        ):
            raise SystemExit(f"ROLLBACK_RECEIPT_MEMBER_IDENTITY:{name}")
    finally:
        os.close(member_fd)
for data_name, checksum_name in (
    ("failed-kaios.db", "failed-kaios.db.sha256"),
    ("failed-kaios.db-wal", "failed-kaios.db-wal.sha256"),
    ("failed-kaios.db-shm", "failed-kaios.db-shm.sha256"),
    ("failed-kaios.db-journal", "failed-kaios.db-journal.sha256"),
    ("restart-policy-before.json", "restart-policy-before.json.sha256"),
    ("restart-policy-after.json", "restart-policy-after.json.sha256"),
    ("restart-no-compose-override.yml", "restart-no-compose-override.yml.sha256"),
    ("failed-state-metadata.json", "failed-state-metadata.json.sha256"),
    ("database-restore-order.json", "database-restore-order.json.sha256"),
    ("rollback-receipt.json", "rollback-receipt.json.sha256"),
):
    if data_name not in actual:
        continue
    data_fd = os.open(
        data_name,
        os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK,
        dir_fd=receipt_fd,
    )
    checksum_fd = os.open(
        checksum_name,
        os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK,
        dir_fd=receipt_fd,
    )
    try:
        data_before = os.fstat(data_fd)
        checksum_before = os.fstat(checksum_fd)
        data_entry_before = os.stat(data_name, dir_fd=receipt_fd, follow_symlinks=False)
        checksum_entry_before = os.stat(checksum_name, dir_fd=receipt_fd, follow_symlinks=False)
        for name, metadata, entry in (
            (data_name, data_before, data_entry_before),
            (checksum_name, checksum_before, checksum_entry_before),
        ):
            if (
                not stat.S_ISREG(metadata.st_mode)
                or metadata.st_nlink != 1
                or metadata.st_uid != 0
                or metadata.st_gid != 0
                or stat.S_IMODE(metadata.st_mode) != 0o600
                or (metadata.st_dev, metadata.st_ino) != (entry.st_dev, entry.st_ino)
            ):
                raise SystemExit(f"ROLLBACK_RECEIPT_CHECKSUM_MEMBER_IDENTITY:{name}")
        digest = hashlib.sha256()
        data_size = 0
        while True:
            block = os.read(data_fd, 1024 * 1024)
            if not block:
                break
            digest.update(block)
            data_size += len(block)
        checksum_raw = b""
        while True:
            block = os.read(checksum_fd, 1024)
            if not block:
                break
            checksum_raw += block
            if len(checksum_raw) > 1024:
                raise SystemExit(f"ROLLBACK_RECEIPT_CHECKSUM_TOO_LARGE:{checksum_name}")
        data_after = os.fstat(data_fd)
        checksum_after = os.fstat(checksum_fd)
        data_entry_after = os.stat(data_name, dir_fd=receipt_fd, follow_symlinks=False)
        checksum_entry_after = os.stat(checksum_name, dir_fd=receipt_fd, follow_symlinks=False)
        stable_fields = (
            "st_dev", "st_ino", "st_size", "st_mtime_ns", "st_ctime_ns",
            "st_nlink", "st_uid", "st_gid", "st_mode",
        )
        if (
            tuple(getattr(data_before, field) for field in stable_fields)
            != tuple(getattr(data_after, field) for field in stable_fields)
            or tuple(getattr(checksum_before, field) for field in stable_fields)
            != tuple(getattr(checksum_after, field) for field in stable_fields)
            or (data_after.st_dev, data_after.st_ino)
            != (data_entry_after.st_dev, data_entry_after.st_ino)
            or (checksum_after.st_dev, checksum_after.st_ino)
            != (checksum_entry_after.st_dev, checksum_entry_after.st_ino)
            or data_size != data_before.st_size
            or len(checksum_raw) != checksum_before.st_size
        ):
            raise SystemExit(f"ROLLBACK_RECEIPT_CHECKSUM_MEMBER_CHANGED:{data_name}")
        expected = f"{digest.hexdigest()}  {data_name}\n".encode("ascii")
        if checksum_raw != expected:
            raise SystemExit(f"ROLLBACK_RECEIPT_CHECKSUM_INVALID:{data_name}")
    finally:
        os.close(checksum_fd)
        os.close(data_fd)
os.fsync(receipt_fd)
os.fsync(root_fd)
print(f"ROLLBACK_RECEIPT_DURABILITY_PASS members={len(actual)}")
PY

rollback_terminal_pointer_is_authoritative \
  || fail "Rollback terminal-success pointer changed before deterministic cleanup"
ROLLBACK_PHASE="SEALED"
# From the first namespace mutation of the terminal pointer through shell-level
# transaction disarm, ERR/INT/TERM must not enter the failure handler.  INT and
# TERM are ignored for this short bounded section; ERR is handled explicitly.
# A failed archive attempt enters containment directly while all three traps
# remain ignored, avoiding a second-signal gap before the error receipt commit.
trap '' ERR INT TERM
TERMINAL_POINTER_ARCHIVE_STATUS=0
python3 -I - 5 "${RECEIPT_DIR_NAME}" "${SOURCE_SHA}" "${SNAPSHOT_MANIFEST_SHA256}" \
  "${ROLLBACK_TERMINAL_SUCCESS_MANIFEST_SHA256}" <<'PY' \
  || TERMINAL_POINTER_ARCHIVE_STATUS=$?
import ctypes
import json
import os
import stat
import sys
root_fd = int(sys.argv[1])
name = ".kidults-rollback-active-v1.json"
archive_name = f".kidults-rollback-terminal-v1.{sys.argv[2]}.json"
descriptor = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=root_fd)
try:
    metadata = os.fstat(descriptor)
    entry = os.stat(name, dir_fd=root_fd, follow_symlinks=False)
    if (
        not stat.S_ISREG(metadata.st_mode)
        or metadata.st_nlink != 1
        or metadata.st_uid != 0
        or metadata.st_gid != 0
        or stat.S_IMODE(metadata.st_mode) != 0o600
        or (metadata.st_dev, metadata.st_ino) != (entry.st_dev, entry.st_ino)
    ):
        raise SystemExit("ROLLBACK_TERMINAL_POINTER_CLEANUP_IDENTITY")
    raw = b""
    while True:
        block = os.read(descriptor, 1024 * 1024)
        if not block:
            break
        raw += block
        if len(raw) > 1024 * 1024:
            raise SystemExit("ROLLBACK_TERMINAL_POINTER_CLEANUP_TOO_LARGE")
    metadata_after = os.fstat(descriptor)
    entry_after = os.stat(name, dir_fd=root_fd, follow_symlinks=False)
    stable_fields = (
        "st_dev", "st_ino", "st_size", "st_mtime_ns", "st_ctime_ns",
        "st_nlink", "st_uid", "st_gid", "st_mode",
    )
    if (
        tuple(getattr(metadata, field) for field in stable_fields)
        != tuple(getattr(metadata_after, field) for field in stable_fields)
        or (metadata_after.st_dev, metadata_after.st_ino)
        != (entry_after.st_dev, entry_after.st_ino)
        or len(raw) != metadata.st_size
    ):
        raise SystemExit("ROLLBACK_TERMINAL_POINTER_CLEANUP_CHANGED_DURING_READ")
    payload = json.loads(raw)
    expected_keys = {
        "id", "version", "state", "receipt_directory_name", "source_sha",
        "snapshot_manifest_sha256", "receipt_root_identity",
        "receipt_directory_identity", "created_at", "terminal_success_manifest",
        "terminal_success_manifest_sha256", "prior_restart_policy_restoration_permitted",
        "nonterminal_rollback_pointer", "transitioned_at",
    }
    if (
        set(payload) != expected_keys
        or payload.get("id") != "KIDULTS_PRODUCTION_ROLLBACK_ACTIVE_TRANSACTION_V1"
        or payload.get("version") != "1.0.0"
        or payload.get("state") != "TERMINAL_SUCCESS_RESTART_POLICY_CLEANUP_PENDING"
        or payload.get("receipt_directory_name") != sys.argv[2]
        or payload.get("source_sha") != sys.argv[3]
        or payload.get("snapshot_manifest_sha256") != sys.argv[4]
        or payload.get("terminal_success_manifest") != "rollback-terminal-success-manifest.json"
        or payload.get("terminal_success_manifest_sha256") != sys.argv[5]
        or payload.get("prior_restart_policy_restoration_permitted") is not True
        or payload.get("nonterminal_rollback_pointer") is not False
    ):
        raise SystemExit("ROLLBACK_TERMINAL_POINTER_CLEANUP_BINDING")
finally:
    os.close(descriptor)
try:
    os.stat(archive_name, dir_fd=root_fd, follow_symlinks=False)
except FileNotFoundError:
    pass
else:
    raise SystemExit("ROLLBACK_TERMINAL_ARCHIVE_PREEXISTING_HOLD")
libc = ctypes.CDLL(None, use_errno=True)
renameat2 = getattr(libc, "renameat2", None)
if renameat2 is None:
    raise SystemExit("ROLLBACK_TERMINAL_ARCHIVE_RENAME_NOREPLACE_REQUIRED")
renameat2.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint]
renameat2.restype = ctypes.c_int
if renameat2(root_fd, os.fsencode(name), root_fd, os.fsencode(archive_name), 1) != 0:
    number = ctypes.get_errno()
    raise OSError(number, os.strerror(number))
os.fsync(root_fd)
archived = os.stat(archive_name, dir_fd=root_fd, follow_symlinks=False)
if (archived.st_dev, archived.st_ino) != (metadata.st_dev, metadata.st_ino):
    raise SystemExit("ROLLBACK_TERMINAL_ARCHIVE_IDENTITY")
PY
if (( TERMINAL_POINTER_ARCHIVE_STATUS != 0 )); then
  rollback_failure_trap "${TERMINAL_POINTER_ARCHIVE_STATUS}" TERMINAL_POINTER_ARCHIVE_FAILURE
fi
ROLLBACK_TRANSACTION_ACTIVE=false
trap - ERR INT TERM
ROLLBACK_TERMINAL_SUCCESS=false

if [[ "${RESULT}" != "PASS" ]]; then
  echo "CRITICAL: Production rollback completed with failed recovery checks: ${FAILURE_CSV}" >&2
  exit 3
fi

echo "KIDULTS Production rollback PASS. Receipt: ${RECEIPT_DIR}/rollback-receipt.json"
