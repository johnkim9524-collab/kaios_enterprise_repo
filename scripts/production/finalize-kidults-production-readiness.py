#!/usr/bin/env python3
from __future__ import annotations

import ctypes
import errno
import fcntl
import hashlib
import json
import os
import re
import secrets
import stat
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
EVIDENCE = Path(os.environ.get("EVIDENCE_DIR", ROOT / "artifacts" / "production-audit"))
OUTPUT = Path(os.environ.get("READINESS_OUTPUT", EVIDENCE / "kidults-production-readiness.json"))
TECHNICAL_EVIDENCE = Path(
    os.environ.get(
        "PRODUCTION_READINESS_EVIDENCE_FILE",
        EVIDENCE / "production-readiness-evidence-v1.json",
    )
)
POLICY = ROOT / "coordination" / "kidults" / "source-intelligence" / "current-sold-sample-governance-v1.json"
GATE = ROOT / "scripts" / "production" / "validate-kidults-production-release-v1.mjs"

def checksum(payload: dict[str, Any]) -> str:
    raw = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
    return "sha256:" + hashlib.sha256(raw).hexdigest()


def rename_noreplace(parent_fd: int, source: str, destination: str) -> None:
    libc = ctypes.CDLL(None, use_errno=True)
    function = getattr(libc, "renameat2", None)
    if function is None:
        raise ValueError("READINESS_RENAME_NOREPLACE_REQUIRED")
    function.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint]
    function.restype = ctypes.c_int
    if function(parent_fd, os.fsencode(source), parent_fd, os.fsencode(destination), 1) != 0:
        number = ctypes.get_errno()
        if number == errno.EEXIST:
            raise FileExistsError(number, os.strerror(number), destination)
        raise OSError(number, os.strerror(number), destination)


def verify_parent_identity(parent_fd: int, expected_parent: Path, code: str) -> None:
    try:
        held_metadata = os.fstat(parent_fd)
        path_metadata = os.stat(expected_parent, follow_symlinks=False)
    except OSError as exc:
        raise ValueError(code) from exc
    if (
        not stat.S_ISDIR(held_metadata.st_mode)
        or not stat.S_ISDIR(path_metadata.st_mode)
        or (held_metadata.st_dev, held_metadata.st_ino)
        != (path_metadata.st_dev, path_metadata.st_ino)
    ):
        raise ValueError(code)


def read_stable_regular_json(candidate: Path, *, maximum_bytes: int) -> Any:
    """Read a fixed evidence member through a nonblocking, identity-bound FD."""
    try:
        expected_parent = EVIDENCE.resolve(strict=True)
        if (
            candidate.name not in {"production-audit.json", "staging-production-delta.json"}
            or candidate.parent.resolve(strict=True) != expected_parent
        ):
            raise ValueError("LEGACY_AUDIT_EVIDENCE_PATH_UNSAFE")
        parent_fd = os.open(
            expected_parent,
            os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW,
        )
    except OSError as exc:
        raise ValueError("LEGACY_AUDIT_EVIDENCE_PARENT_INVALID") from exc
    descriptor = -1
    try:
        verify_parent_identity(
            parent_fd,
            expected_parent,
            "LEGACY_AUDIT_EVIDENCE_PARENT_CHANGED",
        )
        descriptor = os.open(
            candidate.name,
            os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK,
            dir_fd=parent_fd,
        )
        before = os.fstat(descriptor)
        entry_before = os.stat(candidate.name, dir_fd=parent_fd, follow_symlinks=False)
        if (
            not stat.S_ISREG(before.st_mode)
            or before.st_nlink != 1
            or (before.st_dev, before.st_ino) != (entry_before.st_dev, entry_before.st_ino)
            or before.st_size > maximum_bytes
        ):
            raise ValueError("LEGACY_AUDIT_EVIDENCE_IDENTITY_INVALID")
        raw = bytearray()
        while True:
            block = os.read(descriptor, min(1024 * 1024, maximum_bytes + 1 - len(raw)))
            if not block:
                break
            raw.extend(block)
            if len(raw) > maximum_bytes:
                raise ValueError("LEGACY_AUDIT_EVIDENCE_TOO_LARGE")
        after = os.fstat(descriptor)
        entry_after = os.stat(candidate.name, dir_fd=parent_fd, follow_symlinks=False)
        stable_fields = (
            "st_dev", "st_ino", "st_size", "st_mtime_ns", "st_ctime_ns",
            "st_nlink", "st_mode", "st_uid", "st_gid",
        )
        if (
            tuple(getattr(before, field) for field in stable_fields)
            != tuple(getattr(after, field) for field in stable_fields)
            or (after.st_dev, after.st_ino) != (entry_after.st_dev, entry_after.st_ino)
            or len(raw) != before.st_size
        ):
            raise ValueError("LEGACY_AUDIT_EVIDENCE_CHANGED_DURING_READ")
        verify_parent_identity(
            parent_fd,
            expected_parent,
            "LEGACY_AUDIT_EVIDENCE_PARENT_CHANGED",
        )
        return json.loads(bytes(raw).decode("utf-8"))
    finally:
        if descriptor >= 0:
            os.close(descriptor)
        os.close(parent_fd)


def current_source_sha() -> str:
    result = subprocess.run(
        ["git", "-C", str(ROOT), "rev-parse", "HEAD"],
        check=True,
        capture_output=True,
        text=True,
    )
    actual = result.stdout.strip().lower()
    expected = os.environ.get("EXPECTED_SOURCE_SHA", actual).lower()
    if not re.fullmatch(r"[0-9a-f]{40}", expected) or actual != expected:
        raise ValueError("SOURCE_SHA_BINDING_FAILURE")
    return actual


def technical_gate(source_sha: str) -> tuple[dict[str, Any] | None, str | None]:
    if not TECHNICAL_EVIDENCE.is_file():
        return None, "TECHNICAL_EVIDENCE_MISSING"
    command = [
        "node",
        str(GATE),
        "technical",
        "--evidence",
        str(TECHNICAL_EVIDENCE),
        "--policy",
        str(POLICY),
        "--expected-source-sha",
        source_sha,
        "--evidence-dir",
        str(EVIDENCE),
    ]
    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode != 0:
        try:
            failure = json.loads(result.stderr.strip().splitlines()[-1])
            return None, str(failure.get("code") or "TECHNICAL_EVIDENCE_INVALID")
        except (IndexError, json.JSONDecodeError):
            return None, "TECHNICAL_EVIDENCE_VALIDATOR_FAILURE"
    try:
        payload = json.loads(result.stdout)
        if payload.get("result") != "VERIFIED_PASS" or not isinstance(payload.get("summary"), dict):
            return None, "TECHNICAL_EVIDENCE_NOT_VERIFIED"
        return payload["summary"], None
    except json.JSONDecodeError:
        return None, "TECHNICAL_EVIDENCE_VALIDATOR_OUTPUT"


def auxiliary_evidence(
    payload: Any,
    *,
    expected_id: str,
    expected_producer: str,
    source_sha: str,
) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise ValueError("AUXILIARY_EVIDENCE_NOT_OBJECT")
    if set(payload) != {
        "id", "version", "producer_id", "source_sha", "observed_at", "state", "evidence"
    }:
        raise ValueError("AUXILIARY_EVIDENCE_FIELD_SET")
    if (
        payload.get("id") != expected_id
        or payload.get("version") != "1.0.0"
        or payload.get("producer_id") != expected_producer
        or payload.get("source_sha") != source_sha
        or payload.get("state") != "VERIFIED"
        or not isinstance(payload.get("evidence"), dict)
        or not payload["evidence"]
    ):
        raise ValueError("AUXILIARY_EVIDENCE_IDENTITY")
    return payload["evidence"]


def write_result(result: dict[str, Any]) -> int:
    result["checksum"] = checksum(result)
    encoded = (json.dumps(result, indent=2) + "\n").encode("utf-8")
    expected_parent = EVIDENCE.resolve(strict=True)
    output_parent = OUTPUT.parent
    if (
        OUTPUT.name != "kidults-production-readiness.json"
        or output_parent.is_symlink()
        or output_parent.resolve(strict=True) != expected_parent
        or OUTPUT.absolute() != expected_parent / OUTPUT.name
    ):
        raise ValueError("READINESS_OUTPUT_PATH_UNSAFE")
    if "READINESS_OUTPUT" in os.environ and os.environ.get(
        "KIDULTS_READINESS_TEST_MODE"
    ) != "ENABLED_FAIL_CLOSED_ONLY":
        raise ValueError("READINESS_OUTPUT_REDIRECT_FORBIDDEN")

    parent_fd = os.open(
        expected_parent,
        os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW,
    )
    try:
        fcntl.flock(parent_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError as exc:
        os.close(parent_fd)
        raise ValueError("READINESS_OUTPUT_CONCURRENT_ATTEMPT_HOLD") from exc
    stale_temps = sorted(
        name
        for name in os.listdir(parent_fd)
        if name.startswith(".kidults-production-readiness.") and name.endswith(".tmp")
    )
    if stale_temps:
        os.close(parent_fd)
        raise ValueError("READINESS_OUTPUT_STALE_TEMP_HOLD")
    temporary_name = f".kidults-production-readiness.{secrets.token_hex(32)}.tmp"
    temporary_fd = -1
    published = False
    try:
        verify_parent_identity(
            parent_fd,
            expected_parent,
            "READINESS_OUTPUT_PARENT_IDENTITY_CHANGED_BEFORE_WRITE",
        )
        temporary_fd = os.open(
            temporary_name,
            os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
            0o600,
            dir_fd=parent_fd,
        )
        remaining = memoryview(encoded)
        while remaining:
            written = os.write(temporary_fd, remaining)
            if written <= 0:
                raise ValueError("READINESS_OUTPUT_WRITE_FAILED")
            remaining = remaining[written:]
        os.fsync(temporary_fd)
        temporary_metadata = os.fstat(temporary_fd)
        temporary_entry = os.stat(
            temporary_name,
            dir_fd=parent_fd,
            follow_symlinks=False,
        )
        if (
            not stat.S_ISREG(temporary_metadata.st_mode)
            or stat.S_IMODE(temporary_metadata.st_mode) != 0o600
            or (temporary_metadata.st_dev, temporary_metadata.st_ino)
            != (temporary_entry.st_dev, temporary_entry.st_ino)
        ):
            raise ValueError("READINESS_OUTPUT_TEMP_IDENTITY_INVALID")
        try:
            # O_NONBLOCK is mandatory here: a hostile FIFO at the fixed output
            # name must be classified by fstat and rejected, never block the
            # fail-closed finalizer while it waits for a writer.
            existing_fd = os.open(
                OUTPUT.name,
                os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK,
                dir_fd=parent_fd,
            )
        except FileNotFoundError:
            existing_fd = -1
        if existing_fd >= 0:
            try:
                existing = os.fstat(existing_fd)
                existing_entry = os.stat(OUTPUT.name, dir_fd=parent_fd, follow_symlinks=False)
                if (
                    not stat.S_ISREG(existing.st_mode)
                    or existing.st_nlink != 1
                    or stat.S_IMODE(existing.st_mode) != 0o600
                    or (existing.st_dev, existing.st_ino)
                    != (existing_entry.st_dev, existing_entry.st_ino)
                ):
                    raise ValueError("READINESS_OUTPUT_EXISTING_UNSAFE")
            finally:
                os.close(existing_fd)
        verify_parent_identity(
            parent_fd,
            expected_parent,
            "READINESS_OUTPUT_PARENT_IDENTITY_CHANGED_BEFORE_PUBLISH",
        )
        if existing_fd >= 0:
            # A rerun replaces only a verified, single-link regular output.
            # renameat publishes either the complete previous bytes or the
            # complete new bytes and never follows/truncates a symlink victim.
            os.replace(
                temporary_name,
                OUTPUT.name,
                src_dir_fd=parent_fd,
                dst_dir_fd=parent_fd,
            )
        else:
            # Same-directory RENAME_NOREPLACE is an atomic first publication
            # without any nlink=2 crash window or destination clobber.
            rename_noreplace(parent_fd, temporary_name, OUTPUT.name)
        published = True
        output_entry = os.stat(OUTPUT.name, dir_fd=parent_fd, follow_symlinks=False)
        if (
            (output_entry.st_dev, output_entry.st_ino)
            != (temporary_metadata.st_dev, temporary_metadata.st_ino)
            or output_entry.st_nlink != 1
        ):
            raise ValueError("READINESS_OUTPUT_PUBLISHED_IDENTITY_INVALID")
        os.fsync(parent_fd)
        verify_parent_identity(
            parent_fd,
            expected_parent,
            "READINESS_OUTPUT_PARENT_IDENTITY_CHANGED_AFTER_FSYNC",
        )
    finally:
        if temporary_fd >= 0:
            os.close(temporary_fd)
        try:
            os.unlink(temporary_name, dir_fd=parent_fd)
            os.fsync(parent_fd)
        except FileNotFoundError:
            pass
        os.close(parent_fd)
    if not published:
        raise ValueError("READINESS_OUTPUT_NOT_PUBLISHED")
    print(json.dumps(result, indent=2))
    return 0 if result["decision"] == "ready_for_program_owner_release" else 1


def hold_result(reason: str, source_sha: str | None = None) -> int:
    result: dict[str, Any] = {
        "id": "KIDULTS_PRODUCTION_READINESS_DECISION_V1",
        "version": "1.0.0",
        "decision": "hold",
        "score": 0,
        "maximum_score": 100,
        "sections": {},
        "mandatory_gates_passed": False,
        "hard_blockers": [reason],
        "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "source_sha": source_sha,
        "policy_sha256": None,
        "readiness_evidence_sha256": None,
        "technical_evidence_summary": None,
        "explicit_program_owner_release_required": True,
        "production_promotion_authorized": False,
        "artfund_production_promotion_authorized": False,
    }
    return write_result(result)


def main() -> int:
    try:
        source_sha = current_source_sha()
    except (OSError, subprocess.SubprocessError, ValueError) as exc:
        return hold_result(str(exc) or "SOURCE_SHA_BINDING_FAILURE")

    audit_path = EVIDENCE / "production-audit.json"
    delta_path = EVIDENCE / "staging-production-delta.json"
    try:
        audit = auxiliary_evidence(
            read_stable_regular_json(audit_path, maximum_bytes=16 * 1024 * 1024),
            expected_id="KIDULTS_PRODUCTION_AUDIT_EVIDENCE_V1",
            expected_producer="KIDULTS_PRODUCTION_AUDIT_COLLECTOR_V1",
            source_sha=source_sha,
        )
        delta = auxiliary_evidence(
            read_stable_regular_json(delta_path, maximum_bytes=16 * 1024 * 1024),
            expected_id="KIDULTS_STAGING_PRODUCTION_DELTA_EVIDENCE_V1",
            expected_producer="KIDULTS_STAGING_PRODUCTION_DELTA_CERTIFIER_V1",
            source_sha=source_sha,
        )
    except FileNotFoundError:
        return hold_result("LEGACY_AUDIT_EVIDENCE_MISSING", source_sha)
    except (OSError, UnicodeDecodeError, json.JSONDecodeError, ValueError):
        return hold_result("LEGACY_AUDIT_EVIDENCE_INVALID", source_sha)

    legacy_hard_blockers: list[str] = []
    if audit.get("database_integrity") != "ok":
        legacy_hard_blockers.append("database_integrity_failure")
    if audit.get("health_http") != 200:
        legacy_hard_blockers.append("production_health_failure")
    if audit.get("unauthenticated_collector_http") != 401:
        legacy_hard_blockers.append("authentication_bypass")
    if audit.get("backup_integrity") != "ok":
        legacy_hard_blockers.append("backup_integrity_failure")
    if delta.get("destructive_schema_delta") is True:
        legacy_hard_blockers.append("destructive_schema_delta")
    if delta.get("viewer_export_exposed") is True:
        legacy_hard_blockers.append("viewer_export_exposure")
    if delta.get("restricted_rights_exposed") is True:
        legacy_hard_blockers.append("restricted_rights_exposure")
    hard_blockers = list(legacy_hard_blockers)

    sections = {
        "runtime_availability": 20 if audit.get("health_http") == 200 else 0,
        "database_migration_safety": 15
        if audit.get("database_integrity") == "ok" and not delta.get("destructive_schema_delta")
        else 0,
        "backup_rollback": 15
        if audit.get("backup_integrity") == "ok" and delta.get("rollback_rehearsal_passed")
        else 5,
        "authentication_rbac": 15
        if audit.get("unauthenticated_collector_http") == 401 and not delta.get("viewer_export_exposed")
        else 0,
        "portal_mobile_quality": 10
        if audit.get("portal_http") == 200 and delta.get("mobile_320_passed")
        else 5,
        "governance_trust": 15
        if delta.get("governance_gate_passed") and not delta.get("restricted_rights_exposed")
        else 5,
        "observability_incident": 10
        if delta.get("observability_passed") and delta.get("incident_response_ready")
        else 5,
    }
    score = sum(sections.values())

    mandatory = all(
        [
            audit.get("database_integrity") == "ok",
            audit.get("health_http") == 200,
            audit.get("unauthenticated_collector_http") == 401,
            audit.get("backup_integrity") == "ok",
            delta.get("rollback_rehearsal_passed") is True,
            delta.get("mobile_320_passed") is True,
            delta.get("governance_gate_passed") is True,
            delta.get("observability_passed") is True,
            delta.get("incident_response_ready") is True,
        ]
    )

    technical_summary, technical_failure = technical_gate(source_sha)
    if technical_failure:
        hard_blockers.append(technical_failure)

    technically_ready = (
        not hard_blockers
        and score == 100
        and mandatory
        and technical_summary is not None
    )
    if technically_ready:
        decision = "ready_for_program_owner_release"
    elif legacy_hard_blockers:
        decision = "rollback"
    else:
        decision = "hold"
    result: dict[str, Any] = {
        "id": "KIDULTS_PRODUCTION_READINESS_DECISION_V1",
        "version": "1.0.0",
        "decision": decision,
        "score": score,
        "maximum_score": 100,
        "sections": sections,
        "mandatory_gates_passed": mandatory,
        "hard_blockers": hard_blockers,
        "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "source_sha": source_sha,
        "policy_sha256": technical_summary.get("policy_sha256") if technical_summary else None,
        "readiness_evidence_sha256": technical_summary.get("readiness_evidence_sha256")
        if technical_summary
        else None,
        "technical_evidence_summary": technical_summary,
        "explicit_program_owner_release_required": True,
        "production_promotion_authorized": False,
        "artfund_production_promotion_authorized": False,
    }
    return write_result(result)


if __name__ == "__main__":
    sys.exit(main())
