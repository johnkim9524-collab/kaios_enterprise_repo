#!/usr/bin/env bash
set -euo pipefail
IFS=$' \t\n'
PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
export PATH
readonly PATH
export LC_ALL=C TZ=UTC
unset BASH_ENV ENV NODE_OPTIONS NODE_PATH PYTHONHOME PYTHONPATH TAR_OPTIONS GZIP \
  GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_OBJECT_DIRECTORY GIT_ALTERNATE_OBJECT_DIRECTORIES \
  GIT_CONFIG_COUNT GIT_CONFIG_GLOBAL GIT_CONFIG_SYSTEM GIT_CONFIG_NOSYSTEM \
  GIT_SSL_NO_VERIFY GIT_SSL_CAINFO LD_PRELOAD LD_LIBRARY_PATH
umask 077

readonly ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd -P)"
EVIDENCE_DIR="${EVIDENCE_DIR:-${ROOT_DIR}/artifacts/production-audit}"
readonly CANONICAL_ARCHIVE_ROOT="/mnt/ih_prod_01/backups/production-certification"
readonly CANONICAL_PROTECTED_RELEASE_TRUST_ROOT="/etc/kaios/kidults-production-release"
SEAL_TEST_MODE="${KIDULTS_PRODUCTION_SEAL_TEST_MODE:-DISABLED}"
[[ "${SEAL_TEST_MODE}" == "DISABLED" || "${SEAL_TEST_MODE}" == "ENABLED_ISOLATED_SAFE_TEST_ONLY" ]] \
  || { echo "ERROR: Invalid seal test mode" >&2; exit 1; }
if [[ "${SEAL_TEST_MODE}" == "DISABLED" ]]; then
  [[ -z "${ARCHIVE_ROOT+x}" && -z "${ARCHIVE_FILE+x}" \
      && -z "${KIDULTS_PRODUCTION_SEAL_TEST_ROOT+x}" \
      && -z "${KIDULTS_PRODUCTION_SEAL_TEST_NODE+x}" \
      && -z "${KIDULTS_PRODUCTION_SEAL_TEST_FAILPOINT+x}" \
      && -z "${KIDULTS_PRODUCTION_SEAL_TEST_MUTATE_MEMBER_AFTER_SNAPSHOT+x}" ]] \
    || { echo "ERROR: Production seal output redirection is forbidden" >&2; exit 1; }
  ARCHIVE_ROOT="${CANONICAL_ARCHIVE_ROOT}"
  PROTECTED_RELEASE_TRUST_ROOT="${CANONICAL_PROTECTED_RELEASE_TRUST_ROOT}"
  SEAL_TEST_ROOT=""
else
  [[ -z "${ARCHIVE_ROOT+x}" && -z "${ARCHIVE_FILE+x}" ]] \
    || { echo "ERROR: Safe seal test mode derives output paths only from its private anchor" >&2; exit 1; }
  SEAL_TEST_ROOT="${KIDULTS_PRODUCTION_SEAL_TEST_ROOT:-}"
  [[ -n "${SEAL_TEST_ROOT}" ]] || { echo "ERROR: Safe seal test root is required" >&2; exit 1; }
  ARCHIVE_ROOT="${SEAL_TEST_ROOT}/archive"
  PROTECTED_RELEASE_TRUST_ROOT="${SEAL_TEST_ROOT}/trust"
fi
TIMESTAMP="${TIMESTAMP:-$(date -u +%Y%m%dT%H%M%SZ)}"
[[ "${TIMESTAMP}" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$ ]] \
  || { echo "ERROR: Invalid seal timestamp token" >&2; exit 1; }
ARCHIVE_FILE="${ARCHIVE_ROOT}/kidults-production-evidence-${TIMESTAMP}.tar.gz"
POLICY_FILE="${ROOT_DIR}/coordination/kidults/source-intelligence/current-sold-sample-governance-v1.json"
GATE="${ROOT_DIR}/scripts/production/validate-kidults-production-release-v1.mjs"

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

command -v git >/dev/null || fail "git is required"
test -f "${GATE}" || fail "Production release gate is missing"
if [[ "${SEAL_TEST_MODE}" == "DISABLED" ]]; then
  NODE_BIN="$(command -v node)" || fail "node is required"
else
  NODE_BIN="${KIDULTS_PRODUCTION_SEAL_TEST_NODE:-}"
  [[ "${NODE_BIN}" == /* && -x "${NODE_BIN}" && -f "${NODE_BIN}" && ! -L "${NODE_BIN}" ]] \
    || fail "Safe seal test mode requires an explicit regular Node executable"
fi

SOURCE_SHA="$(git -C "${ROOT_DIR}" rev-parse HEAD)"
[[ "${SOURCE_SHA}" =~ ^[0-9a-f]{40}$ ]] || fail "Current source SHA is invalid"

python3 -I - \
  "${ARCHIVE_ROOT}" "${ARCHIVE_FILE}" "${EVIDENCE_DIR}" \
  "${POLICY_FILE}" "${GATE}" "${NODE_BIN}" "${SOURCE_SHA}" "${PROTECTED_RELEASE_TRUST_ROOT}" \
  "${SEAL_TEST_MODE}" "${SEAL_TEST_ROOT}" \
  "${KIDULTS_PRODUCTION_SEAL_TEST_FAILPOINT:-}" \
  "${KIDULTS_PRODUCTION_SEAL_TEST_MUTATE_MEMBER_AFTER_SNAPSHOT:-}" <<'PY'
import gzip
import ctypes
import errno
import fcntl
import hashlib
import io
import json
import os
import re
import secrets
import stat
import subprocess
import sys
import tarfile
from datetime import datetime, timezone
from pathlib import Path


archive_root = Path(sys.argv[1])
archive_path = Path(sys.argv[2])
evidence_root = Path(sys.argv[3])
policy_path = Path(sys.argv[4])
gate_path = Path(sys.argv[5])
node_bin = Path(sys.argv[6])
source_sha = sys.argv[7]
trust_root = Path(sys.argv[8])
test_mode = sys.argv[9]
test_root = Path(sys.argv[10]) if sys.argv[10] else None
test_failpoint = sys.argv[11]
test_mutate_member = sys.argv[12]

TECHNICAL_MEMBER = "production-readiness-evidence-v1.json"
READINESS_MEMBER = "kidults-production-readiness.json"
OWNER_MEMBER = "program-owner-production-release-receipt-v1.json"
OWNER_PUBLIC_KEY_MEMBER = "program-owner-ed25519-public.pem"
OWNER_KEY_ID_MEMBER = "program-owner-ed25519-key-id"
FIXED_MEMBERS = [
    "production-audit.json",
    "production-rollback-rehearsal.json",
    "production-mobile-320.json",
    "production-governance-trust.json",
    "production-observability.json",
    "production-incident-response.json",
    "staging-production-delta.json",
    TECHNICAL_MEMBER,
    READINESS_MEMBER,
    OWNER_MEMBER,
]


def require(condition: bool, code: str) -> None:
    if not condition:
        raise SystemExit(code)


def write_all(descriptor: int, payload: bytes, code: str) -> None:
    remaining = memoryview(payload)
    while remaining:
        written = os.write(descriptor, remaining)
        if written <= 0:
            raise SystemExit(code)
        remaining = remaining[written:]


def rename_noreplace(parent_fd: int, source: str, destination: str) -> None:
    libc = ctypes.CDLL(None, use_errno=True)
    function = getattr(libc, "renameat2", None)
    if function is None:
        raise SystemExit("SEAL_RENAME_NOREPLACE_REQUIRED")
    function.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint]
    function.restype = ctypes.c_int
    if function(parent_fd, os.fsencode(source), parent_fd, os.fsencode(destination), 1) != 0:
        number = ctypes.get_errno()
        if number == errno.EEXIST:
            raise FileExistsError(number, os.strerror(number), destination)
        raise OSError(number, os.strerror(number), destination)


def read_all(descriptor: int, limit: int, code: str) -> bytes:
    chunks: list[bytes] = []
    size = 0
    while True:
        block = os.read(descriptor, 1024 * 1024)
        if not block:
            break
        size += len(block)
        if size > limit:
            raise SystemExit(code)
        chunks.append(block)
    return b"".join(chunks)


def read_all_at(descriptor: int, limit: int, code: str) -> bytes:
    metadata = os.fstat(descriptor)
    require(metadata.st_size <= limit, code)
    chunks: list[bytes] = []
    offset = 0
    while offset < metadata.st_size:
        block = os.pread(descriptor, min(1024 * 1024, metadata.st_size - offset), offset)
        require(bool(block), code)
        chunks.append(block)
        offset += len(block)
    return b"".join(chunks)


def open_directory_chain(candidate: Path) -> int:
    require(candidate.is_absolute() and os.path.normpath(str(candidate)) == str(candidate), "SEAL_ARCHIVE_ROOT_PATH")
    flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
    descriptor = os.open("/", flags)
    try:
        for component in candidate.parts[1:]:
            next_descriptor = os.open(component, flags, dir_fd=descriptor)
            os.close(descriptor)
            descriptor = next_descriptor
        return descriptor
    except BaseException:
        os.close(descriptor)
        raise


def open_protected_directory_chain(candidate: Path) -> int:
    require(candidate.is_absolute() and os.path.normpath(str(candidate)) == str(candidate), "SEAL_ARCHIVE_ROOT_PATH")
    flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
    descriptor = os.open("/", flags)
    try:
        for component in candidate.parts[1:]:
            metadata = os.fstat(descriptor)
            require(
                stat.S_ISDIR(metadata.st_mode)
                and metadata.st_uid == 0
                and not stat.S_IMODE(metadata.st_mode) & 0o022,
                f"SEAL_ARCHIVE_ROOT_ANCESTOR:{component}",
            )
            next_descriptor = os.open(component, flags, dir_fd=descriptor)
            os.close(descriptor)
            descriptor = next_descriptor
        metadata = os.fstat(descriptor)
        require(
            stat.S_ISDIR(metadata.st_mode)
            and metadata.st_uid == 0
            and metadata.st_gid == 0
            and not stat.S_IMODE(metadata.st_mode) & 0o022,
            "SEAL_ARCHIVE_ROOT_PERMISSIONS",
        )
        return descriptor
    except BaseException:
        os.close(descriptor)
        raise


def open_private_test_child(anchor: Path, child: Path, code: str) -> int:
    require(
        anchor.is_absolute()
        and os.path.normpath(str(anchor)) == str(anchor)
        and child == anchor / child.name,
        f"{code}_PATH",
    )
    anchor_fd = os.open(anchor, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        anchor_metadata = os.fstat(anchor_fd)
        anchor_entry = os.stat(anchor, follow_symlinks=False)
        require(
            stat.S_ISDIR(anchor_metadata.st_mode)
            and (anchor_metadata.st_dev, anchor_metadata.st_ino)
            == (anchor_entry.st_dev, anchor_entry.st_ino)
            and anchor_metadata.st_uid == os.geteuid()
            and stat.S_IMODE(anchor_metadata.st_mode) == 0o700,
            f"{code}_ANCHOR",
        )
        descriptor = os.open(child.name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=anchor_fd)
        metadata = os.fstat(descriptor)
        entry = os.stat(child.name, dir_fd=anchor_fd, follow_symlinks=False)
        require(
            stat.S_ISDIR(metadata.st_mode)
            and (metadata.st_dev, metadata.st_ino) == (entry.st_dev, entry.st_ino)
            and metadata.st_uid == os.geteuid()
            and stat.S_IMODE(metadata.st_mode) == 0o700,
            f"{code}_CHILD",
        )
        return descriptor
    finally:
        os.close(anchor_fd)


def open_archive_root() -> int:
    if test_mode == "ENABLED_ISOLATED_SAFE_TEST_ONLY":
        require(test_root is not None and archive_root == test_root / "archive", "SEAL_TEST_ARCHIVE_ROOT")
        return open_private_test_child(test_root, archive_root, "SEAL_TEST_ARCHIVE_ROOT")
    require(test_mode == "DISABLED", "SEAL_TEST_MODE")
    return open_protected_directory_chain(archive_root)


def revalidate_archive_root(held_fd: int, code: str) -> None:
    current_fd = open_archive_root()
    try:
        held = os.fstat(held_fd)
        current = os.fstat(current_fd)
        require(
            (held.st_dev, held.st_ino) == (current.st_dev, current.st_ino),
            code,
        )
    finally:
        os.close(current_fd)


def open_trust_root() -> int:
    if test_mode == "ENABLED_ISOLATED_SAFE_TEST_ONLY":
        require(test_root is not None and trust_root == test_root / "trust", "SEAL_TEST_TRUST_ROOT")
        return open_private_test_child(test_root, trust_root, "SEAL_TEST_TRUST_ROOT")
    require(test_mode == "DISABLED", "SEAL_TEST_MODE")
    return open_protected_directory_chain(trust_root)


def revalidate_trust_root(held_fd: int, code: str) -> None:
    current_fd = open_trust_root()
    try:
        held = os.fstat(held_fd)
        current = os.fstat(current_fd)
        require((held.st_dev, held.st_ino) == (current.st_dev, current.st_ino), code)
    finally:
        os.close(current_fd)


def open_bound_directory(candidate: Path, code: str) -> tuple[int, int, str, tuple[int, int]]:
    require(candidate.is_absolute() and os.path.normpath(str(candidate)) == str(candidate) and candidate.name, f"{code}_PATH")
    parent_fd = open_directory_chain(candidate.parent)
    try:
        descriptor = os.open(candidate.name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=parent_fd)
        metadata = os.fstat(descriptor)
        entry = os.stat(candidate.name, dir_fd=parent_fd, follow_symlinks=False)
        require(
            stat.S_ISDIR(metadata.st_mode)
            and (metadata.st_dev, metadata.st_ino) == (entry.st_dev, entry.st_ino),
            f"{code}_IDENTITY",
        )
        return parent_fd, descriptor, candidate.name, (metadata.st_dev, metadata.st_ino)
    except BaseException:
        os.close(parent_fd)
        raise


def revalidate_bound_directory(
    candidate: Path,
    parent_fd: int,
    descriptor: int,
    name: str,
    identity: tuple[int, int],
    code: str,
) -> None:
    held = os.fstat(descriptor)
    entry = os.stat(name, dir_fd=parent_fd, follow_symlinks=False)
    current_parent_fd = open_directory_chain(candidate.parent)
    current_fd = -1
    try:
        current_fd = os.open(candidate.name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=current_parent_fd)
        current = os.fstat(current_fd)
        current_entry = os.stat(candidate.name, dir_fd=current_parent_fd, follow_symlinks=False)
        require(
            stat.S_ISDIR(held.st_mode)
            and stat.S_ISDIR(current.st_mode)
            and (held.st_dev, held.st_ino) == identity
            and (entry.st_dev, entry.st_ino) == identity
            and (current.st_dev, current.st_ino) == identity
            and (current_entry.st_dev, current_entry.st_ino) == identity,
            code,
        )
    finally:
        if current_fd >= 0:
            os.close(current_fd)
        os.close(current_parent_fd)


def open_member(root_fd: int, member: str) -> tuple[int, os.stat_result]:
    parts = member.split("/")
    require(
        member
        and all(re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,127}", part) for part in parts)
        and ".." not in parts,
        "SEAL_EVIDENCE_MEMBER_NAME",
    )
    parent_fd = os.dup(root_fd)
    try:
        for component in parts[:-1]:
            next_fd = os.open(
                component,
                os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW,
                dir_fd=parent_fd,
            )
            os.close(parent_fd)
            parent_fd = next_fd
        descriptor = os.open(
            parts[-1],
            os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK,
            dir_fd=parent_fd,
        )
        metadata = os.fstat(descriptor)
        entry = os.stat(parts[-1], dir_fd=parent_fd, follow_symlinks=False)
        require(
            stat.S_ISREG(metadata.st_mode)
            and (metadata.st_dev, metadata.st_ino) == (entry.st_dev, entry.st_ino)
            and metadata.st_nlink == 1,
            f"SEAL_EVIDENCE_MEMBER_IDENTITY:{member}",
        )
        return descriptor, metadata
    finally:
        os.close(parent_fd)


def revalidate_member(
    root_fd: int,
    member: str,
    descriptor: int,
    before: os.stat_result,
    expected_raw: bytes,
    code: str,
) -> None:
    parts = member.split("/")
    parent_fd = os.dup(root_fd)
    try:
        for component in parts[:-1]:
            next_fd = os.open(component, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=parent_fd)
            os.close(parent_fd)
            parent_fd = next_fd
        held = os.fstat(descriptor)
        entry = os.stat(parts[-1], dir_fd=parent_fd, follow_symlinks=False)
        require(
            stat.S_ISREG(held.st_mode)
            and held.st_nlink == 1
            and (held.st_dev, held.st_ino, held.st_size, held.st_mtime_ns, held.st_ctime_ns)
            == (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns, before.st_ctime_ns)
            and (entry.st_dev, entry.st_ino) == (before.st_dev, before.st_ino)
            and read_all_at(descriptor, len(expected_raw), f"{code}_SIZE") == expected_raw,
            code,
        )
    finally:
        os.close(parent_fd)


def open_bound_file(candidate: Path, code: str) -> tuple[int, int, str, os.stat_result, bytes]:
    require(candidate.is_absolute() and os.path.normpath(str(candidate)) == str(candidate) and candidate.name, f"{code}_PATH")
    parent_fd = open_directory_chain(candidate.parent)
    try:
        descriptor = os.open(
            candidate.name,
            os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK,
            dir_fd=parent_fd,
        )
        before = os.fstat(descriptor)
        entry = os.stat(candidate.name, dir_fd=parent_fd, follow_symlinks=False)
        require(
            stat.S_ISREG(before.st_mode)
            and before.st_nlink == 1
            and (before.st_dev, before.st_ino) == (entry.st_dev, entry.st_ino),
            f"{code}_IDENTITY",
        )
        raw = read_all_at(descriptor, 16 * 1024 * 1024, f"{code}_SIZE")
        after = os.fstat(descriptor)
        require(
            (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns, before.st_ctime_ns)
            == (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns, after.st_ctime_ns),
            f"{code}_CHANGED",
        )
        return parent_fd, descriptor, candidate.name, before, raw
    except BaseException:
        os.close(parent_fd)
        raise


def revalidate_bound_file(
    candidate: Path,
    parent_fd: int,
    descriptor: int,
    name: str,
    before: os.stat_result,
    raw: bytes,
    code: str,
) -> None:
    held = os.fstat(descriptor)
    entry = os.stat(name, dir_fd=parent_fd, follow_symlinks=False)
    current_parent_fd = open_directory_chain(candidate.parent)
    current_fd = -1
    try:
        current_fd = os.open(
            candidate.name,
            os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK,
            dir_fd=current_parent_fd,
        )
        current = os.fstat(current_fd)
        current_entry = os.stat(candidate.name, dir_fd=current_parent_fd, follow_symlinks=False)
        require(
            stat.S_ISREG(held.st_mode)
            and stat.S_ISREG(current.st_mode)
            and held.st_nlink == 1
            and current.st_nlink == 1
            and (held.st_dev, held.st_ino, held.st_size, held.st_mtime_ns, held.st_ctime_ns)
            == (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns, before.st_ctime_ns)
            and (entry.st_dev, entry.st_ino) == (before.st_dev, before.st_ino)
            and (current.st_dev, current.st_ino) == (before.st_dev, before.st_ino)
            and (current_entry.st_dev, current_entry.st_ino) == (before.st_dev, before.st_ino)
            and read_all_at(descriptor, len(raw), f"{code}_SIZE") == raw,
            code,
        )
    finally:
        if current_fd >= 0:
            os.close(current_fd)
        os.close(current_parent_fd)


def create_snapshot_directory(root_fd: int) -> tuple[str, int]:
    for _ in range(32):
        name = f".seal-{secrets.token_hex(32)}.snapshot.tmp"
        try:
            os.mkdir(name, 0o700, dir_fd=root_fd)
            descriptor = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=root_fd)
            metadata = os.fstat(descriptor)
            entry = os.stat(name, dir_fd=root_fd, follow_symlinks=False)
            require(
                stat.S_ISDIR(metadata.st_mode)
                and metadata.st_uid == os.geteuid()
                and metadata.st_gid == os.getegid()
                and stat.S_IMODE(metadata.st_mode) == 0o700
                and (metadata.st_dev, metadata.st_ino) == (entry.st_dev, entry.st_ino),
                "SEAL_SNAPSHOT_DIRECTORY_IDENTITY",
            )
            return name, descriptor
        except FileExistsError:
            continue
    raise SystemExit("SEAL_SNAPSHOT_DIRECTORY_COLLISION_EXHAUSTED")


def ensure_snapshot_parent(root_fd: int, parts: list[str]) -> int:
    descriptor = os.dup(root_fd)
    for component in parts:
        try:
            os.mkdir(component, 0o700, dir_fd=descriptor)
        except FileExistsError:
            pass
        next_fd = os.open(component, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=descriptor)
        metadata = os.fstat(next_fd)
        require(
            stat.S_ISDIR(metadata.st_mode)
            and metadata.st_uid == os.geteuid()
            and stat.S_IMODE(metadata.st_mode) == 0o700,
            "SEAL_SNAPSHOT_PARENT_IDENTITY",
        )
        os.close(descriptor)
        descriptor = next_fd
    return descriptor


def snapshot_write(root_fd: int, member: str, raw: bytes) -> tuple[int, int, int, int, int]:
    parts = member.split("/")
    parent_fd = ensure_snapshot_parent(root_fd, parts[:-1])
    try:
        descriptor = os.open(
            parts[-1],
            os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
            0o600,
            dir_fd=parent_fd,
        )
        try:
            write_all(descriptor, raw, "SEAL_SNAPSHOT_MEMBER_WRITE")
            os.fsync(descriptor)
            metadata = os.fstat(descriptor)
            require(
                stat.S_ISREG(metadata.st_mode)
                and metadata.st_nlink == 1
                and metadata.st_uid == os.geteuid()
                and metadata.st_gid == os.getegid()
                and stat.S_IMODE(metadata.st_mode) == 0o600,
                "SEAL_SNAPSHOT_MEMBER_METADATA",
            )
            identity = (
                metadata.st_dev,
                metadata.st_ino,
                metadata.st_size,
                metadata.st_mtime_ns,
                metadata.st_ctime_ns,
            )
        finally:
            os.close(descriptor)
        os.fsync(parent_fd)
        return identity
    finally:
        os.close(parent_fd)


def revalidate_snapshot_member(
    root_fd: int,
    member: str,
    expected_identity: tuple[int, int, int, int, int],
    expected_raw: bytes,
) -> None:
    descriptor, before = open_member(root_fd, member)
    try:
        actual_raw = read_all_at(descriptor, len(expected_raw), f"SEAL_SNAPSHOT_MEMBER_SIZE:{member}")
        after = os.fstat(descriptor)
        require(
            (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns, before.st_ctime_ns)
            == expected_identity
            and (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns, after.st_ctime_ns)
            == expected_identity
            and actual_raw == expected_raw,
            f"SEAL_SNAPSHOT_MEMBER_CHANGED:{member}",
        )
    finally:
        os.close(descriptor)


def remove_tree(parent_fd: int, name: str, expected_identity: tuple[int, int] | None = None) -> None:
    descriptor = os.open(name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=parent_fd)
    try:
        metadata = os.fstat(descriptor)
        entry = os.stat(name, dir_fd=parent_fd, follow_symlinks=False)
        require(
            expected_identity is None
            or (
                (metadata.st_dev, metadata.st_ino) == expected_identity
                and (entry.st_dev, entry.st_ino) == expected_identity
            ),
            "SEAL_SNAPSHOT_CLEANUP_IDENTITY",
        )
        for child in os.listdir(descriptor):
            metadata = os.stat(child, dir_fd=descriptor, follow_symlinks=False)
            if stat.S_ISDIR(metadata.st_mode):
                remove_tree(descriptor, child)
            else:
                os.unlink(child, dir_fd=descriptor)
        os.fsync(descriptor)
    finally:
        os.close(descriptor)
    os.rmdir(name, dir_fd=parent_fd)


def unlink_if_identity(parent_fd: int, name: str, expected_identity: tuple[int, int]) -> None:
    try:
        metadata = os.stat(name, dir_fd=parent_fd, follow_symlinks=False)
    except FileNotFoundError:
        return
    if (metadata.st_dev, metadata.st_ino) == expected_identity:
        os.unlink(name, dir_fd=parent_fd)


def mutate_test_evidence_member(root_fd: int, member: str) -> None:
    require(
        test_mode == "ENABLED_ISOLATED_SAFE_TEST_ONLY"
        and re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,127}", member) is not None,
        "SEAL_TEST_MUTATION_MEMBER",
    )
    descriptor = os.open(member, os.O_WRONLY | os.O_TRUNC | os.O_NOFOLLOW, dir_fd=root_fd)
    try:
        write_all(descriptor, b'{"test_mutation_after_snapshot":true}\n', "SEAL_TEST_MUTATION_WRITE")
        os.fsync(descriptor)
    finally:
        os.close(descriptor)
    os.fsync(root_fd)


require(archive_path.parent == archive_root, "SEAL_ARCHIVE_PARENT_REDIRECT")
require(
    re.fullmatch(r"kidults-production-evidence-[A-Za-z0-9._-]{1,128}\.tar\.gz", archive_path.name) is not None,
    "SEAL_ARCHIVE_BASENAME",
)
require(re.fullmatch(r"[0-9a-f]{40}", source_sha) is not None, "SEAL_SOURCE_SHA")
require(
    test_failpoint in {"", "AFTER_SNAPSHOT_FSYNC", "AFTER_ARCHIVE_CHECKSUM_PUBLISH"},
    "SEAL_TEST_FAILPOINT_INVALID",
)
require(
    test_mode == "ENABLED_ISOLATED_SAFE_TEST_ONLY" or (not test_failpoint and not test_mutate_member),
    "SEAL_TEST_HOOK_IN_PRODUCTION",
)

root_fd = -1
evidence_parent_fd = -1
evidence_fd = -1
trust_fd = -1
owner_key_fd = -1
owner_key_id_fd = -1
policy_parent_fd = -1
policy_fd = -1
snapshot_fd = -1
snapshot_name = ""
snapshot_identity: tuple[int, int] | None = None
stage_names: list[str] = []
stage_fds: list[int] = []
stage_identities: list[tuple[int, int]] = []
published: list[tuple[str, tuple[int, int]]] = []
try:
    root_fd = open_archive_root()
    try:
        fcntl.flock(root_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError as exc:
        raise SystemExit("SEAL_CONCURRENT_ATTEMPT_HOLD") from exc
    revalidate_archive_root(root_fd, "SEAL_ARCHIVE_ROOT_STABLE_IDENTITY")
    stale_stages = sorted(
        name for name in os.listdir(root_fd)
        if name.startswith(".seal-") and name.endswith(".tmp")
    )
    require(not stale_stages, "SEAL_STALE_STAGE_HOLD")

    evidence_parent_fd, evidence_fd, evidence_name, evidence_identity = open_bound_directory(
        evidence_root,
        "SEAL_EVIDENCE_ROOT",
    )
    revalidate_bound_directory(
        evidence_root,
        evidence_parent_fd,
        evidence_fd,
        evidence_name,
        evidence_identity,
        "SEAL_EVIDENCE_ROOT_STABLE_IDENTITY",
    )

    trust_fd = open_trust_root()
    revalidate_trust_root(trust_fd, "SEAL_TRUST_ROOT_STABLE_IDENTITY")
    expected_trust_uid = 0 if test_mode == "DISABLED" else os.geteuid()
    owner_key_fd, owner_key_before = open_member(trust_fd, OWNER_PUBLIC_KEY_MEMBER)
    owner_key_raw = read_all_at(owner_key_fd, 1024 * 1024, "SEAL_OWNER_KEY_SIZE")
    owner_key_id_fd, owner_key_id_before = open_member(trust_fd, OWNER_KEY_ID_MEMBER)
    owner_key_id_raw = read_all_at(owner_key_id_fd, 4096, "SEAL_OWNER_KEY_ID_SIZE")
    for metadata in (owner_key_before, owner_key_id_before):
        require(
            metadata.st_uid == expected_trust_uid
            and not stat.S_IMODE(metadata.st_mode) & 0o022,
            "SEAL_OWNER_TRUST_METADATA",
        )
    try:
        expected_owner_key_id = owner_key_id_raw.decode("ascii").strip()
    except UnicodeDecodeError:
        raise SystemExit("SEAL_OWNER_KEY_ID_ENCODING")
    require(
        re.fullmatch(r"sha256:[0-9a-f]{64}", expected_owner_key_id) is not None,
        "SEAL_OWNER_KEY_ID_FORMAT",
    )

    policy_parent_fd, policy_fd, policy_name, policy_before, policy_raw = open_bound_file(
        policy_path,
        "SEAL_POLICY",
    )
    revalidate_bound_file(
        policy_path,
        policy_parent_fd,
        policy_fd,
        policy_name,
        policy_before,
        policy_raw,
        "SEAL_POLICY_STABLE_IDENTITY",
    )

    raw_members: dict[str, bytes] = {}
    descriptor, before = open_member(evidence_fd, TECHNICAL_MEMBER)
    try:
        technical_raw = read_all(descriptor, 100 * 1024 * 1024, "SEAL_TECHNICAL_EVIDENCE_SIZE")
        after = os.fstat(descriptor)
        require(
            (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns, before.st_ctime_ns)
            == (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns, after.st_ctime_ns),
            "SEAL_TECHNICAL_EVIDENCE_CHANGED",
        )
        raw_members[TECHNICAL_MEMBER] = technical_raw
    finally:
        os.close(descriptor)
    try:
        technical = json.loads(technical_raw)
    except json.JSONDecodeError:
        raise SystemExit("SEAL_TECHNICAL_EVIDENCE_JSON")
    support_bindings = technical.get("support_evidence_bindings")
    require(isinstance(support_bindings, list) and support_bindings, "SEAL_SUPPORT_BINDINGS_REQUIRED")
    support_members: list[str] = []
    support_digests: dict[str, str] = {}
    for binding in support_bindings:
        require(isinstance(binding, dict), "SEAL_SUPPORT_BINDING_INVALID")
        member = binding.get("member")
        expected_digest = binding.get("sha256")
        require(
            isinstance(member, str)
            and re.fullmatch(
                r"support/[A-Za-z0-9][A-Za-z0-9._-]{0,127}(?:/[A-Za-z0-9][A-Za-z0-9._-]{0,127})*",
                member,
            ) is not None
            and member not in support_digests,
            "SEAL_SUPPORT_MEMBER_INVALID",
        )
        require(
            isinstance(expected_digest, str)
            and re.fullmatch(r"sha256:[0-9a-f]{64}", expected_digest) is not None,
            "SEAL_SUPPORT_DIGEST_INVALID",
        )
        support_members.append(member)
        support_digests[member] = expected_digest

    members = [*FIXED_MEMBERS, *support_members]
    require(len(members) == len(set(members)), "SEAL_EVIDENCE_MEMBER_CLOSURE")
    total_member_bytes = len(technical_raw)
    for member in members:
        if member == TECHNICAL_MEMBER:
            continue
        descriptor, before = open_member(evidence_fd, member)
        try:
            raw = read_all(descriptor, 100 * 1024 * 1024, f"SEAL_EVIDENCE_MEMBER_SIZE:{member}")
            after = os.fstat(descriptor)
            require(
                (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns, before.st_ctime_ns)
                == (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns, after.st_ctime_ns),
                f"SEAL_EVIDENCE_MEMBER_CHANGED:{member}",
            )
            raw_members[member] = raw
            total_member_bytes += len(raw)
        finally:
            os.close(descriptor)
    require(total_member_bytes <= 1024 * 1024 * 1024, "SEAL_EVIDENCE_TOTAL_SIZE")
    for member, expected_digest in support_digests.items():
        require(
            "sha256:" + hashlib.sha256(raw_members[member]).hexdigest() == expected_digest,
            f"SEAL_SUPPORT_DIGEST_MISMATCH:{member}",
        )

    readiness_raw = raw_members[READINESS_MEMBER]
    owner_raw = raw_members[OWNER_MEMBER]
    try:
        readiness = json.loads(readiness_raw)
        owner = json.loads(owner_raw)
    except json.JSONDecodeError:
        raise SystemExit("SEAL_CORE_EVIDENCE_JSON")
    owner_fields = [
        owner.get("repository"),
        owner.get("protected_environment"),
        owner.get("evidence_run_id"),
        owner.get("evidence_run_attempt"),
        owner.get("artifact_name"),
        owner.get("evidence_bundle_sha256"),
    ]
    require(
        isinstance(owner_fields[0], str)
        and re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", owner_fields[0]) is not None,
        "SEAL_OWNER_REPOSITORY",
    )
    require(
        isinstance(owner_fields[1], str)
        and re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._:-]{0,127}", owner_fields[1]) is not None,
        "SEAL_OWNER_ENVIRONMENT",
    )
    require(
        re.fullmatch(r"[1-9][0-9]*", str(owner_fields[2])) is not None
        and re.fullmatch(r"[1-9][0-9]*", str(owner_fields[3])) is not None,
        "SEAL_OWNER_RUN",
    )
    require(
        isinstance(owner_fields[4], str)
        and re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._:-]{0,127}", owner_fields[4]) is not None,
        "SEAL_OWNER_ARTIFACT",
    )
    require(
        isinstance(owner_fields[5], str)
        and re.fullmatch(r"sha256:[0-9a-f]{64}", owner_fields[5]) is not None,
        "SEAL_OWNER_BUNDLE_DIGEST",
    )

    snapshot_name, snapshot_fd = create_snapshot_directory(root_fd)
    snapshot_metadata = os.fstat(snapshot_fd)
    snapshot_identity = (snapshot_metadata.st_dev, snapshot_metadata.st_ino)
    snapshot_identities: dict[str, tuple[int, int, int, int, int]] = {}
    for member in members:
        snapshot_identities[member] = snapshot_write(snapshot_fd, member, raw_members[member])
    os.fsync(snapshot_fd)
    if test_mutate_member:
        require(test_mutate_member in raw_members, "SEAL_TEST_MUTATION_MEMBER_NOT_CAPTURED")
        mutate_test_evidence_member(evidence_fd, test_mutate_member)
    if test_failpoint == "AFTER_SNAPSHOT_FSYNC":
        os._exit(86)

    revalidate_bound_directory(
        evidence_root,
        evidence_parent_fd,
        evidence_fd,
        evidence_name,
        evidence_identity,
        "SEAL_EVIDENCE_ROOT_CHANGED_AFTER_SNAPSHOT",
    )
    revalidate_archive_root(root_fd, "SEAL_ARCHIVE_ROOT_CHANGED_BEFORE_GATE")
    revalidate_trust_root(trust_fd, "SEAL_TRUST_ROOT_CHANGED_BEFORE_GATE")
    revalidate_member(
        trust_fd,
        OWNER_PUBLIC_KEY_MEMBER,
        owner_key_fd,
        owner_key_before,
        owner_key_raw,
        "SEAL_OWNER_KEY_CHANGED_BEFORE_GATE",
    )
    revalidate_member(
        trust_fd,
        OWNER_KEY_ID_MEMBER,
        owner_key_id_fd,
        owner_key_id_before,
        owner_key_id_raw,
        "SEAL_OWNER_KEY_ID_CHANGED_BEFORE_GATE",
    )
    revalidate_bound_file(
        policy_path,
        policy_parent_fd,
        policy_fd,
        policy_name,
        policy_before,
        policy_raw,
        "SEAL_POLICY_CHANGED_BEFORE_GATE",
    )

    snapshot_path = f"/proc/self/fd/{snapshot_fd}"
    policy_fd_path = f"/proc/self/fd/{policy_fd}"
    owner_key_fd_path = f"/proc/self/fd/{owner_key_fd}"
    gate_result = subprocess.run(
        [
            str(node_bin),
            str(gate_path),
            "release",
            "--evidence",
            f"{snapshot_path}/{TECHNICAL_MEMBER}",
            "--evidence-dir",
            snapshot_path,
            "--readiness",
            f"{snapshot_path}/{READINESS_MEMBER}",
            "--owner-receipt",
            f"{snapshot_path}/{OWNER_MEMBER}",
            "--owner-public-key",
            owner_key_fd_path,
            "--expected-owner-key-id",
            expected_owner_key_id,
            "--evidence-bundle-sha256",
            owner_fields[5],
            "--repository",
            owner_fields[0],
            "--protected-environment",
            owner_fields[1],
            "--evidence-run-id",
            str(owner_fields[2]),
            "--evidence-run-attempt",
            str(owner_fields[3]),
            "--artifact-name",
            owner_fields[4],
            "--policy",
            policy_fd_path,
            "--expected-source-sha",
            source_sha,
        ],
        check=False,
        capture_output=True,
        text=True,
        pass_fds=(snapshot_fd, policy_fd, owner_key_fd),
    )
    if gate_result.returncode != 0:
        if gate_result.stderr:
            sys.stderr.write(gate_result.stderr)
        raise SystemExit("SEAL_EXACT_SNAPSHOT_RELEASE_GATE_FAILED")
    try:
        gate_receipt = json.loads(gate_result.stdout)
    except json.JSONDecodeError:
        raise SystemExit("SEAL_EXACT_SNAPSHOT_RELEASE_GATE_OUTPUT")
    require(
        gate_receipt.get("suite") == "KIDULTS_PRODUCTION_RELEASE_PRESEAL_V1"
        and gate_receipt.get("result") == "HOLD"
        and gate_receipt.get("state") == "PROGRAM_OWNER_SIGNATURE_VERIFIED_UNCONSUMED"
        and gate_receipt.get("production_release_authorized") is False
        and gate_receipt.get("evidence_bundle_sha256") == owner_fields[5],
        "SEAL_EXACT_SNAPSHOT_RELEASE_GATE_RESULT",
    )

    revalidate_archive_root(root_fd, "SEAL_ARCHIVE_ROOT_CHANGED_AFTER_GATE")
    revalidate_trust_root(trust_fd, "SEAL_TRUST_ROOT_CHANGED_AFTER_GATE")
    revalidate_member(
        trust_fd,
        OWNER_PUBLIC_KEY_MEMBER,
        owner_key_fd,
        owner_key_before,
        owner_key_raw,
        "SEAL_OWNER_KEY_CHANGED_AFTER_GATE",
    )
    revalidate_member(
        trust_fd,
        OWNER_KEY_ID_MEMBER,
        owner_key_id_fd,
        owner_key_id_before,
        owner_key_id_raw,
        "SEAL_OWNER_KEY_ID_CHANGED_AFTER_GATE",
    )
    revalidate_bound_file(
        policy_path,
        policy_parent_fd,
        policy_fd,
        policy_name,
        policy_before,
        policy_raw,
        "SEAL_POLICY_CHANGED_AFTER_GATE",
    )
    snapshot_metadata = os.fstat(snapshot_fd)
    snapshot_entry = os.stat(snapshot_name, dir_fd=root_fd, follow_symlinks=False)
    require(
        stat.S_ISDIR(snapshot_metadata.st_mode)
        and (snapshot_metadata.st_dev, snapshot_metadata.st_ino)
        == (snapshot_entry.st_dev, snapshot_entry.st_ino),
        "SEAL_SNAPSHOT_DIRECTORY_CHANGED_AFTER_GATE",
    )
    for member in members:
        revalidate_snapshot_member(
            snapshot_fd,
            member,
            snapshot_identities[member],
            raw_members[member],
        )
    os.close(snapshot_fd)
    snapshot_fd = -1
    remove_tree(
        root_fd,
        snapshot_name,
        snapshot_identity,
    )
    snapshot_name = ""
    snapshot_identity = None
    os.fsync(root_fd)
    revalidate_archive_root(root_fd, "SEAL_ARCHIVE_ROOT_CHANGED_AFTER_SNAPSHOT_CLEANUP")

    for _ in range(32):
        token = secrets.token_hex(32)
        candidates = [
            f".seal-{token}.archive.tmp",
            f".seal-{token}.checksum.tmp",
            f".seal-{token}.manifest.tmp",
        ]
        try:
            for name in candidates:
                descriptor = os.open(
                    name,
                    os.O_RDWR | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                    0o600,
                    dir_fd=root_fd,
                )
                stage_names.append(name)
                stage_fds.append(descriptor)
                metadata = os.fstat(descriptor)
                stage_identities.append((metadata.st_dev, metadata.st_ino))
            break
        except FileExistsError:
            for descriptor in stage_fds:
                os.close(descriptor)
            for name, identity in zip(stage_names, stage_identities, strict=True):
                unlink_if_identity(root_fd, name, identity)
            stage_names.clear()
            stage_fds.clear()
            stage_identities.clear()
    require(len(stage_fds) == 3, "SEAL_STAGE_RANDOM_COLLISION_EXHAUSTED")
    archive_fd, checksum_fd, manifest_fd = stage_fds

    with os.fdopen(os.dup(archive_fd), "wb", closefd=True) as archive_stream:
        with gzip.GzipFile(fileobj=archive_stream, mode="wb", mtime=0) as gzip_stream:
            with tarfile.open(fileobj=gzip_stream, mode="w|") as tar:
                for member in members:
                    raw = raw_members[member]
                    info = tarfile.TarInfo(member)
                    info.size = len(raw)
                    info.mode = 0o600
                    info.uid = 0
                    info.gid = 0
                    info.uname = "root"
                    info.gname = "root"
                    info.mtime = 0
                    tar.addfile(info, io.BytesIO(raw))
    os.fsync(archive_fd)
    os.lseek(archive_fd, 0, os.SEEK_SET)
    archive_raw = read_all(archive_fd, 100 * 1024 * 1024, "SEAL_ARCHIVE_SIZE")
    archive_digest = hashlib.sha256(archive_raw).hexdigest()
    checksum_raw = f"{archive_digest}  {archive_path.name}\n".encode("ascii")
    write_all(checksum_fd, checksum_raw, "SEAL_CHECKSUM_WRITE_FAILED")
    os.fsync(checksum_fd)

    manifest = {
        "id": "KIDULTS_SEALED_PRODUCTION_RELEASE_EVIDENCE_V1",
        "version": "1.0.0",
        "status": "sealed_release_candidate",
        "vertical": "kidults",
        "sealed_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "archive_sha256": "sha256:" + archive_digest,
        "readiness_checksum": readiness["checksum"],
        "decision": readiness["decision"],
        "technical_readiness_verified": True,
        "explicit_program_owner_release_verified": True,
        "protected_executor_consumption_verified": False,
        "owner_release_receipt_sha256": "sha256:" + hashlib.sha256(owner_raw).hexdigest(),
        "owner_key_id": owner["key_id"],
        "repository": owner["repository"],
        "protected_environment": owner["protected_environment"],
        "evidence_run_id": owner["evidence_run_id"],
        "evidence_run_attempt": owner["evidence_run_attempt"],
        "artifact_name": owner["artifact_name"],
        "source_sha": source_sha,
        "policy_sha256": "sha256:" + hashlib.sha256(policy_raw).hexdigest(),
        "readiness_evidence_sha256": "sha256:" + hashlib.sha256(technical_raw).hexdigest(),
        "evidence_bundle_sha256": owner["evidence_bundle_sha256"],
        "production_change_executed": False,
        "artfund_production_promotion_authorized": False,
    }
    manifest_raw = (json.dumps(manifest, indent=2) + "\n").encode("utf-8")
    write_all(manifest_fd, manifest_raw, "SEAL_MANIFEST_WRITE_FAILED")
    os.fsync(manifest_fd)
    for descriptor in stage_fds:
        metadata = os.fstat(descriptor)
        require(
            stat.S_ISREG(metadata.st_mode)
            and metadata.st_nlink == 1
            and metadata.st_uid == os.geteuid()
            and metadata.st_gid == os.getegid()
            and stat.S_IMODE(metadata.st_mode) == 0o600,
            "SEAL_STAGE_METADATA",
        )

    final_names = [archive_path.name, archive_path.name + ".sha256", archive_path.name + ".manifest.json"]
    # Archive and checksum are inert until the fully-written manifest is renamed
    # last as the durable commit marker. RENAME_NOREPLACE cannot clobber a
    # destination and never creates an nlink=2 hidden-stage crash window.
    for index, final_name in enumerate(final_names):
        revalidate_trust_root(trust_fd, f"SEAL_TRUST_ROOT_CHANGED_BEFORE_PUBLISH:{index}")
        revalidate_member(
            trust_fd,
            OWNER_PUBLIC_KEY_MEMBER,
            owner_key_fd,
            owner_key_before,
            owner_key_raw,
            f"SEAL_OWNER_KEY_CHANGED_BEFORE_PUBLISH:{index}",
        )
        revalidate_member(
            trust_fd,
            OWNER_KEY_ID_MEMBER,
            owner_key_id_fd,
            owner_key_id_before,
            owner_key_id_raw,
            f"SEAL_OWNER_KEY_ID_CHANGED_BEFORE_PUBLISH:{index}",
        )
        revalidate_bound_file(
            policy_path,
            policy_parent_fd,
            policy_fd,
            policy_name,
            policy_before,
            policy_raw,
            f"SEAL_POLICY_CHANGED_BEFORE_PUBLISH:{index}",
        )
        revalidate_archive_root(root_fd, f"SEAL_ARCHIVE_ROOT_CHANGED_BEFORE_PUBLISH:{index}")
        stage_metadata = os.fstat(stage_fds[index])
        rename_noreplace(root_fd, stage_names[index], final_name)
        final_metadata = os.stat(final_name, dir_fd=root_fd, follow_symlinks=False)
        require(
            stat.S_ISREG(final_metadata.st_mode)
            and (final_metadata.st_dev, final_metadata.st_ino)
            == (stage_metadata.st_dev, stage_metadata.st_ino),
            "SEAL_FINAL_IDENTITY",
        )
        require(
            final_metadata.st_nlink == 1
            and final_metadata.st_uid == os.geteuid()
            and final_metadata.st_gid == os.getegid()
            and stat.S_IMODE(final_metadata.st_mode) == 0o600,
            "SEAL_FINAL_METADATA",
        )
        published.append((final_name, (stage_metadata.st_dev, stage_metadata.st_ino)))
        if index == 1:
            os.fsync(root_fd)
            if test_failpoint == "AFTER_ARCHIVE_CHECKSUM_PUBLISH":
                os._exit(87)
    os.fsync(root_fd)
    revalidate_trust_root(trust_fd, "SEAL_TRUST_ROOT_CHANGED_AFTER_FINAL_FSYNC")
    revalidate_member(
        trust_fd,
        OWNER_PUBLIC_KEY_MEMBER,
        owner_key_fd,
        owner_key_before,
        owner_key_raw,
        "SEAL_OWNER_KEY_CHANGED_AFTER_FINAL_FSYNC",
    )
    revalidate_member(
        trust_fd,
        OWNER_KEY_ID_MEMBER,
        owner_key_id_fd,
        owner_key_id_before,
        owner_key_id_raw,
        "SEAL_OWNER_KEY_ID_CHANGED_AFTER_FINAL_FSYNC",
    )
    revalidate_bound_file(
        policy_path,
        policy_parent_fd,
        policy_fd,
        policy_name,
        policy_before,
        policy_raw,
        "SEAL_POLICY_CHANGED_AFTER_FINAL_FSYNC",
    )
    revalidate_archive_root(root_fd, "SEAL_ARCHIVE_ROOT_CHANGED_AFTER_FINAL_FSYNC")
    print(json.dumps(manifest, indent=2))
except BaseException:
    if root_fd >= 0:
        for final_name, identity in reversed(published):
            try:
                metadata = os.stat(final_name, dir_fd=root_fd, follow_symlinks=False)
                if (metadata.st_dev, metadata.st_ino) == identity:
                    os.unlink(final_name, dir_fd=root_fd)
            except FileNotFoundError:
                pass
        os.fsync(root_fd)
    raise
finally:
    for descriptor in stage_fds:
        try:
            os.close(descriptor)
        except OSError:
            pass
    if root_fd >= 0:
        for name, identity in zip(stage_names, stage_identities, strict=True):
            unlink_if_identity(root_fd, name, identity)
        if snapshot_name:
            try:
                remove_tree(root_fd, snapshot_name, snapshot_identity)
            except FileNotFoundError:
                pass
        if snapshot_fd >= 0:
            os.close(snapshot_fd)
            snapshot_fd = -1
        os.fsync(root_fd)
    for descriptor in (
        owner_key_fd,
        owner_key_id_fd,
        policy_fd,
        policy_parent_fd,
        trust_fd,
        evidence_fd,
        evidence_parent_fd,
        root_fd,
    ):
        if descriptor >= 0:
            try:
                os.close(descriptor)
            except OSError:
                pass
PY

echo "Kidults production release candidate sealed. Protected executor consumption remains HOLD."
