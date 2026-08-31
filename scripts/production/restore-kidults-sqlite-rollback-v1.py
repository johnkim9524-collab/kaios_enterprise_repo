#!/usr/bin/env python3
"""Atomically restore one digest-bound SQLite rollback image via held directory FDs."""

from __future__ import annotations

import argparse
import ctypes
import datetime as dt
import errno
import hashlib
import json
import os
import re
import secrets
import stat


def fail(message: str) -> None:
    raise SystemExit(message)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-dir-fd", required=True, type=int)
    parser.add_argument("--source-name", required=True)
    parser.add_argument("--destination-dir-fd", required=True, type=int)
    parser.add_argument("--destination-name", required=True)
    parser.add_argument("--receipt-dir-fd", required=True, type=int)
    parser.add_argument("--expected-sha256", required=True)
    parser.add_argument("--uid", required=True, type=int)
    parser.add_argument("--gid", required=True, type=int)
    parser.add_argument("--mode", required=True)
    parser.add_argument("--test-temp-name")
    parser.add_argument("--test-fail-phase")
    return parser.parse_args()


def require_directory(descriptor: int, code: str) -> os.stat_result:
    metadata = os.fstat(descriptor)
    if not stat.S_ISDIR(metadata.st_mode):
        fail(code)
    return metadata


def regular_entry_identity(parent_fd: int, name: str, code: str) -> tuple[int, int] | None:
    try:
        metadata = os.stat(name, dir_fd=parent_fd, follow_symlinks=False)
    except FileNotFoundError:
        return None
    if not stat.S_ISREG(metadata.st_mode):
        fail(code)
    return metadata.st_dev, metadata.st_ino


def write_from_source(source_fd: int, target_fd: int) -> str:
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
                fail("SQLITE_RESTORE_TEMP_WRITE_FAILED")
            remaining = remaining[written:]
    return "sha256:" + digest.hexdigest()


def write_all(descriptor: int, payload: bytes, code: str) -> None:
    remaining = memoryview(payload)
    while remaining:
        written = os.write(descriptor, remaining)
        if written <= 0:
            fail(code)
        remaining = remaining[written:]


def require_sidecars_absent(destination_fd: int, database_name: str) -> None:
    known = {database_name + suffix for suffix in ("-wal", "-shm", "-journal")}
    unknown = sorted(name for name in os.listdir(destination_fd) if name.startswith(database_name + "-") and name not in known)
    if unknown:
        fail(f"SQLITE_RESTORE_UNKNOWN_SIDECAR_NAMESPACE:{','.join(unknown)}")
    for name in sorted(known):
        try:
            os.stat(name, dir_fd=destination_fd, follow_symlinks=False)
        except FileNotFoundError:
            continue
        fail(f"SQLITE_RESTORE_SIDECAR_REMAINS:{name}")


TRANSACTION_JOURNAL_NAME = ".kaios.db.restore.transaction-v1.jsonl"
RECEIPT_JOURNAL_NAME = "sqlite-restore-transaction-v1.jsonl"


def metadata_record(metadata: os.stat_result) -> dict[str, int]:
    return {
        "dev": metadata.st_dev,
        "ino": metadata.st_ino,
        "size": metadata.st_size,
        "mtime_ns": metadata.st_mtime_ns,
        "ctime_ns": metadata.st_ctime_ns,
        "nlink": metadata.st_nlink,
        "uid": metadata.st_uid,
        "gid": metadata.st_gid,
        "mode": stat.S_IMODE(metadata.st_mode),
    }


def rename_noreplace(source_fd: int, source_name: str, target_fd: int, target_name: str) -> None:
    libc = ctypes.CDLL(None, use_errno=True)
    renameat2 = getattr(libc, "renameat2", None)
    if renameat2 is None:
        fail("SQLITE_RESTORE_RENAME_NOREPLACE_REQUIRED")
    renameat2.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_int, ctypes.c_char_p, ctypes.c_uint]
    renameat2.restype = ctypes.c_int
    result = renameat2(
        source_fd,
        os.fsencode(source_name),
        target_fd,
        os.fsencode(target_name),
        1,  # RENAME_NOREPLACE
    )
    if result != 0:
        error_number = ctypes.get_errno()
        if error_number == errno.EEXIST:
            raise FileExistsError(error_number, os.strerror(error_number), target_name)
        raise OSError(error_number, os.strerror(error_number), target_name)


def maybe_fail(args: argparse.Namespace, phase: str) -> None:
    if args.test_fail_phase == phase:
        fail(f"SQLITE_RESTORE_INJECTED_FAILURE:{phase}")


def append_journal(transaction: dict[str, object], phase: str, **detail: object) -> None:
    payload = {
        "id": "KIDULTS_SQLITE_RESTORE_TRANSACTION_EVENT_V1",
        "version": "1.0.0",
        "sequence": int(transaction["sequence"]) + 1,
        "phase": phase,
        "observed_at": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "transaction_id": transaction["transaction_id"],
        **detail,
    }
    raw = (json.dumps(payload, sort_keys=True, separators=(",", ":")) + "\n").encode("utf-8")
    for descriptor in (int(transaction["destination_journal_fd"]), int(transaction["receipt_journal_fd"])):
        write_all(descriptor, raw, "SQLITE_RESTORE_TRANSACTION_JOURNAL_WRITE_FAILED")
        os.fsync(descriptor)
    os.fsync(int(transaction["destination_fd"]))
    os.fsync(int(transaction["receipt_fd"]))
    transaction["sequence"] = payload["sequence"]
    transaction["phase"] = phase


def close_transaction_journals(transaction: dict[str, object]) -> None:
    for key in ("destination_journal_fd", "receipt_journal_fd"):
        descriptor = int(transaction.get(key, -1))
        if descriptor >= 0:
            os.close(descriptor)
            transaction[key] = -1


def restore_quarantined_sidecars(transaction: dict[str, object]) -> None:
    destination_fd = int(transaction["destination_fd"])
    records = list(transaction["records"])
    failures: list[str] = []
    for record in reversed(records):
        if not record.get("quarantined"):
            continue
        original = str(record["name"])
        quarantine = str(record["quarantine_name"])
        expected = (int(record["metadata"]["dev"]), int(record["metadata"]["ino"]))
        try:
            os.stat(original, dir_fd=destination_fd, follow_symlinks=False)
            failures.append(f"ORIGINAL_REAPPEARED:{original}")
            continue
        except FileNotFoundError:
            pass
        try:
            current = os.stat(quarantine, dir_fd=destination_fd, follow_symlinks=False)
            if not stat.S_ISREG(current.st_mode) or (current.st_dev, current.st_ino) != expected:
                failures.append(f"QUARANTINE_IDENTITY:{original}")
                continue
            rename_noreplace(destination_fd, quarantine, destination_fd, original)
            restored = os.stat(original, dir_fd=destination_fd, follow_symlinks=False)
            if (restored.st_dev, restored.st_ino) != expected:
                failures.append(f"RESTORED_IDENTITY:{original}")
        except (FileNotFoundError, FileExistsError, OSError) as error:
            failures.append(f"RESTORE_FAILED:{original}:{getattr(error, 'errno', 'UNKNOWN')}")
    os.fsync(destination_fd)
    if failures:
        try:
            append_journal(transaction, "ABORT_RECOVERY_HOLD", failures=failures)
        finally:
            fail("SQLITE_RESTORE_SIDECAR_RECOVERY_HOLD:" + ",".join(failures))
    append_journal(transaction, "ABORTED_SIDECARS_RESTORED", restored_count=sum(bool(r.get("quarantined")) for r in records))
    os.unlink(TRANSACTION_JOURNAL_NAME, dir_fd=destination_fd)
    os.fsync(destination_fd)


def prepare_sidecar_transaction(
    args: argparse.Namespace,
    destination_fd: int,
    receipt_fd: int,
    database_name: str,
    expected_uid: int,
    expected_gid: int,
) -> dict[str, object]:
    try:
        existing = os.stat(TRANSACTION_JOURNAL_NAME, dir_fd=destination_fd, follow_symlinks=False)
    except FileNotFoundError:
        existing = None
    if existing is not None:
        fail("SQLITE_RESTORE_PREEXISTING_TRANSACTION_JOURNAL_HOLD")
    transaction_id = secrets.token_hex(32)
    destination_journal_fd = os.open(
        TRANSACTION_JOURNAL_NAME,
        os.O_WRONLY | os.O_APPEND | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
        0o600,
        dir_fd=destination_fd,
    )
    try:
        receipt_journal_fd = os.open(
            RECEIPT_JOURNAL_NAME,
            os.O_WRONLY | os.O_APPEND | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
            0o600,
            dir_fd=receipt_fd,
        )
    except BaseException:
        os.close(destination_journal_fd)
        os.unlink(TRANSACTION_JOURNAL_NAME, dir_fd=destination_fd)
        os.fsync(destination_fd)
        raise
    transaction: dict[str, object] = {
        "transaction_id": transaction_id,
        "sequence": 0,
        "phase": "INITIALIZING",
        "destination_fd": destination_fd,
        "receipt_fd": receipt_fd,
        "destination_journal_fd": destination_journal_fd,
        "receipt_journal_fd": receipt_journal_fd,
        "records": [],
    }
    known_names = [database_name + suffix for suffix in ("-wal", "-shm", "-journal")]
    unknown = sorted(name for name in os.listdir(destination_fd) if name.startswith(database_name + "-") and name not in known_names)
    opened: list[tuple[dict[str, object], int, os.stat_result]] = []
    try:
        if unknown:
            fail(f"SQLITE_RESTORE_UNKNOWN_SIDECAR_NAMESPACE:{','.join(unknown)}")
        for sidecar_name in known_names:
            try:
                entry_before = os.stat(sidecar_name, dir_fd=destination_fd, follow_symlinks=False)
            except FileNotFoundError:
                continue
            suffix = sidecar_name.removeprefix(database_name)
            if not stat.S_ISREG(entry_before.st_mode):
                fail(f"SQLITE_RESTORE_SIDECAR_NOT_REGULAR:{suffix}")
            try:
                source_fd = os.open(
                    sidecar_name,
                    os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK,
                    dir_fd=destination_fd,
                )
            except OSError as error:
                fail(f"SQLITE_RESTORE_SIDECAR_OPEN_FAILED:{suffix}:{error.errno}")
            source_before = os.fstat(source_fd)
            source_identity = (source_before.st_dev, source_before.st_ino)
            if (
                not stat.S_ISREG(source_before.st_mode)
                or source_identity != (entry_before.st_dev, entry_before.st_ino)
                or source_before.st_nlink != 1
                or source_before.st_uid != expected_uid
                or source_before.st_gid != expected_gid
                or stat.S_IMODE(source_before.st_mode) & 0o7022
            ):
                os.close(source_fd)
                fail(f"SQLITE_RESTORE_SIDECAR_METADATA_OR_IDENTITY_INVALID:{suffix}")
            receipt_name = "failed-" + sidecar_name
            for member_name in (receipt_name, receipt_name + ".sha256"):
                try:
                    os.stat(member_name, dir_fd=receipt_fd, follow_symlinks=False)
                except FileNotFoundError:
                    continue
                os.close(source_fd)
                fail(f"SQLITE_RESTORE_SIDECAR_RECEIPT_COLLISION:{member_name}")
            record: dict[str, object] = {
                "name": sidecar_name,
                "receipt_name": receipt_name,
                "quarantine_name": f".kaios.db.sidecar-quarantine.{transaction_id}.{suffix.removeprefix('-')}",
                "metadata": metadata_record(source_before),
                "quarantined": False,
            }
            opened.append((record, source_fd, source_before))
            transaction["records"].append(record)

        append_journal(
            transaction,
            "PREPARED",
            database_name=database_name,
            sidecars=[{key: value for key, value in record.items() if key != "quarantined"} for record in transaction["records"]],
        )
        # Phase 1: durably stage every data/checksum pair.  No live sidecar is
        # renamed or unlinked until the complete receipt cohort and directory
        # entry set have reached stable storage.
        for index, (record, source_fd, source_before) in enumerate(opened):
            receipt_name = str(record["receipt_name"])
            target_fd = os.open(
                receipt_name,
                os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                0o600,
                dir_fd=receipt_fd,
            )
            checksum_fd = -1
            try:
                digest = write_from_source(source_fd, target_fd)
                os.fsync(target_fd)
                checksum_name = receipt_name + ".sha256"
                checksum_fd = os.open(
                    checksum_name,
                    os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                    0o600,
                    dir_fd=receipt_fd,
                )
                write_all(
                    checksum_fd,
                    f"{digest.removeprefix('sha256:')}  {receipt_name}\n".encode("ascii"),
                    "SQLITE_RESTORE_SIDECAR_CHECKSUM_WRITE_FAILED",
                )
                os.fsync(checksum_fd)
                record["sha256"] = digest
                if index == 0:
                    maybe_fail(args, "after_first_sidecar_receipt_pair")
            finally:
                if checksum_fd >= 0:
                    os.close(checksum_fd)
                os.close(target_fd)
        maybe_fail(args, "before_sidecar_receipt_directory_fsync")
        os.fsync(receipt_fd)
        append_journal(
            transaction,
            "SIDECAR_RECEIPTS_DURABLE",
            sidecars=[{"name": record["name"], "sha256": record["sha256"]} for record in transaction["records"]],
        )
        maybe_fail(args, "after_sidecar_receipt_directory_fsync")

        # Revalidate the entire held cohort after receipt durability, then move
        # each inode to an unpredictable same-directory quarantine name.  A
        # no-replace rename preserves the inode and is reversible before main
        # database publication.
        for record, source_fd, source_before in opened:
            sidecar_name = str(record["name"])
            suffix = sidecar_name.removeprefix(database_name)
            source_after = os.fstat(source_fd)
            entry_after = os.stat(sidecar_name, dir_fd=destination_fd, follow_symlinks=False)
            if (
                metadata_record(source_after) != metadata_record(source_before)
                or (entry_after.st_dev, entry_after.st_ino) != (source_before.st_dev, source_before.st_ino)
            ):
                fail(f"SQLITE_RESTORE_SIDECAR_CHANGED_DURING_QUARANTINE:{suffix}")
        for index, record in enumerate(transaction["records"]):
            rename_noreplace(
                destination_fd,
                str(record["name"]),
                destination_fd,
                str(record["quarantine_name"]),
            )
            record["quarantined"] = True
            if index == 0:
                maybe_fail(args, "after_first_sidecar_quarantine_rename")
        os.fsync(destination_fd)
        require_sidecars_absent(destination_fd, database_name)
        append_journal(
            transaction,
            "SIDECARS_QUARANTINED",
            quarantine_names=[record["quarantine_name"] for record in transaction["records"]],
        )
        maybe_fail(args, "before_main_database_publish")
        return transaction
    except BaseException:
        preflight_only = not any("sha256" in record for record in transaction["records"])
        try:
            restore_quarantined_sidecars(transaction)
        finally:
            close_transaction_journals(transaction)
            if preflight_only:
                try:
                    os.unlink(RECEIPT_JOURNAL_NAME, dir_fd=receipt_fd)
                    os.fsync(receipt_fd)
                except FileNotFoundError:
                    pass
        raise
    finally:
        for _, source_fd, _ in opened:
            os.close(source_fd)


def main() -> None:
    args = parse_args()
    if args.source_name != "kaios.db" or args.destination_name != "kaios.db":
        fail("SQLITE_RESTORE_BASENAME_INVALID")
    if not re.fullmatch(r"sha256:[0-9a-f]{64}", args.expected_sha256):
        fail("SQLITE_RESTORE_EXPECTED_DIGEST_INVALID")
    if not re.fullmatch(r"[0-7]{4}", args.mode):
        fail("SQLITE_RESTORE_MODE_INVALID")
    mode = int(args.mode, 8)
    if mode & 0o7000 or mode & 0o022:
        fail("SQLITE_RESTORE_MODE_UNSAFE")
    if not 0 <= args.uid <= 2**32 - 2 or not 0 <= args.gid <= 2**32 - 2:
        fail("SQLITE_RESTORE_OWNER_INVALID")
    test_hooks_requested = args.test_temp_name is not None or args.test_fail_phase is not None
    if test_hooks_requested:
        if os.environ.get("KIDULTS_SQLITE_RESTORE_TEST_HOOKS") != "ENABLED_FAIL_CLOSED_ONLY":
            fail("SQLITE_RESTORE_TEST_HOOK_FORBIDDEN")
    allowed_failure_phases = {
        "after_first_sidecar_receipt_pair",
        "before_sidecar_receipt_directory_fsync",
        "after_sidecar_receipt_directory_fsync",
        "after_first_sidecar_quarantine_rename",
        "before_main_database_publish",
        "after_main_database_publish",
        "during_sidecar_quarantine_cleanup",
    }
    if args.test_fail_phase is not None and args.test_fail_phase not in allowed_failure_phases:
        fail("SQLITE_RESTORE_TEST_FAILURE_PHASE_INVALID")
    if args.test_temp_name is not None and not re.fullmatch(
        r"\.kaios\.db\.restore\.test-[A-Za-z0-9_-]{1,64}\.tmp",
        args.test_temp_name,
    ):
        fail("SQLITE_RESTORE_TEST_TEMP_NAME_INVALID")

    require_directory(args.source_dir_fd, "SQLITE_RESTORE_SOURCE_DIRECTORY_INVALID")
    require_directory(args.destination_dir_fd, "SQLITE_RESTORE_DESTINATION_DIRECTORY_INVALID")
    require_directory(args.receipt_dir_fd, "SQLITE_RESTORE_RECEIPT_DIRECTORY_INVALID")
    try:
        os.stat(TRANSACTION_JOURNAL_NAME, dir_fd=args.destination_dir_fd, follow_symlinks=False)
    except FileNotFoundError:
        pass
    else:
        fail("SQLITE_RESTORE_PREEXISTING_TRANSACTION_JOURNAL_HOLD")
    initial_destination = regular_entry_identity(
        args.destination_dir_fd,
        args.destination_name,
        "SQLITE_RESTORE_DESTINATION_NOT_REGULAR",
    )
    try:
        source_fd = os.open(
            args.source_name,
            os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK,
            dir_fd=args.source_dir_fd,
        )
    except OSError as error:
        fail(f"SQLITE_RESTORE_SOURCE_OPEN_FAILED:{error.errno}")
    source_metadata = os.fstat(source_fd)
    if not stat.S_ISREG(source_metadata.st_mode):
        os.close(source_fd)
        fail("SQLITE_RESTORE_SOURCE_NOT_REGULAR")

    temp_fd = -1
    temp_name = ""
    published = False
    transaction_committed = False
    transaction: dict[str, object] | None = None
    try:
        attempts = 1 if args.test_temp_name is not None else 32
        for _ in range(attempts):
            temp_name = args.test_temp_name or f".kaios.db.restore.{secrets.token_hex(32)}.tmp"
            try:
                temp_fd = os.open(
                    temp_name,
                    os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                    0o600,
                    dir_fd=args.destination_dir_fd,
                )
                break
            except FileExistsError:
                if args.test_temp_name is not None:
                    fail("SQLITE_RESTORE_TEMP_COLLISION")
        if temp_fd < 0:
            fail("SQLITE_RESTORE_RANDOM_TEMP_EXHAUSTED")

        temp_metadata = os.fstat(temp_fd)
        if not stat.S_ISREG(temp_metadata.st_mode):
            fail("SQLITE_RESTORE_TEMP_NOT_REGULAR")
        temp_identity = (temp_metadata.st_dev, temp_metadata.st_ino)
        if regular_entry_identity(
            args.destination_dir_fd,
            temp_name,
            "SQLITE_RESTORE_TEMP_ENTRY_NOT_REGULAR",
        ) != temp_identity:
            fail("SQLITE_RESTORE_TEMP_IDENTITY_MISMATCH")

        actual_digest = write_from_source(source_fd, temp_fd)
        if actual_digest != args.expected_sha256:
            fail("SQLITE_RESTORE_SOURCE_DIGEST_MISMATCH")
        current_metadata = os.fstat(temp_fd)
        if current_metadata.st_uid != args.uid or current_metadata.st_gid != args.gid:
            os.fchown(temp_fd, args.uid, args.gid)
        os.fchmod(temp_fd, mode)
        os.fsync(temp_fd)

        if regular_entry_identity(
            args.destination_dir_fd,
            temp_name,
            "SQLITE_RESTORE_TEMP_ENTRY_CHANGED",
        ) != temp_identity:
            fail("SQLITE_RESTORE_TEMP_IDENTITY_CHANGED")
        if regular_entry_identity(
            args.destination_dir_fd,
            args.destination_name,
            "SQLITE_RESTORE_DESTINATION_CHANGED_TO_UNSAFE_TYPE",
        ) != initial_destination:
            fail("SQLITE_RESTORE_DESTINATION_CHANGED_BEFORE_RENAME")

        transaction = prepare_sidecar_transaction(
            args,
            args.destination_dir_fd,
            args.receipt_dir_fd,
            args.destination_name,
            args.uid,
            args.gid,
        )
        if regular_entry_identity(
            args.destination_dir_fd,
            args.destination_name,
            "SQLITE_RESTORE_DESTINATION_CHANGED_TO_UNSAFE_TYPE",
        ) != initial_destination:
            fail("SQLITE_RESTORE_DESTINATION_CHANGED_DURING_SIDECAR_QUARANTINE")

        append_journal(
            transaction,
            "MAIN_DATABASE_PUBLISHING",
            prior_destination_identity=list(initial_destination) if initial_destination else None,
            replacement_identity=list(temp_identity),
            replacement_sha256=actual_digest,
        )
        os.replace(
            temp_name,
            args.destination_name,
            src_dir_fd=args.destination_dir_fd,
            dst_dir_fd=args.destination_dir_fd,
        )
        published = True
        os.fsync(args.destination_dir_fd)
        append_journal(transaction, "MAIN_DATABASE_PUBLISHED", replacement_sha256=actual_digest)
        maybe_fail(args, "after_main_database_publish")
        final_metadata = os.stat(
            args.destination_name,
            dir_fd=args.destination_dir_fd,
            follow_symlinks=False,
        )
        if (
            not stat.S_ISREG(final_metadata.st_mode)
            or (final_metadata.st_dev, final_metadata.st_ino) != temp_identity
            or final_metadata.st_uid != args.uid
            or final_metadata.st_gid != args.gid
            or stat.S_IMODE(final_metadata.st_mode) != mode
        ):
            fail("SQLITE_RESTORE_PUBLISHED_IDENTITY_OR_METADATA_MISMATCH")
        require_sidecars_absent(args.destination_dir_fd, args.destination_name)
        for index, record in enumerate(transaction["records"]):
            quarantine_name = str(record["quarantine_name"])
            current = os.stat(quarantine_name, dir_fd=args.destination_dir_fd, follow_symlinks=False)
            expected_identity = (int(record["metadata"]["dev"]), int(record["metadata"]["ino"]))
            if not stat.S_ISREG(current.st_mode) or (current.st_dev, current.st_ino) != expected_identity:
                fail(f"SQLITE_RESTORE_QUARANTINE_IDENTITY_CHANGED:{record['name']}")
            if index == 0:
                maybe_fail(args, "during_sidecar_quarantine_cleanup")
            os.unlink(quarantine_name, dir_fd=args.destination_dir_fd)
        os.fsync(args.destination_dir_fd)
        append_journal(
            transaction,
            "COMMITTED",
            quarantined_sidecar_count=len(transaction["records"]),
            replacement_sha256=actual_digest,
        )
        os.unlink(TRANSACTION_JOURNAL_NAME, dir_fd=args.destination_dir_fd)
        os.fsync(args.destination_dir_fd)
        transaction_committed = True
        print(f"SQLITE_ROLLBACK_RESTORE_PASS {actual_digest} quarantined_sidecars={len(transaction['records'])}")
    finally:
        if transaction is not None:
            if not published and transaction.get("phase") != "ABORTED_SIDECARS_RESTORED":
                try:
                    restore_quarantined_sidecars(transaction)
                except BaseException:
                    # The durable transaction journal is intentionally retained
                    # so a subsequent invocation cannot silently recapture or
                    # restart against an ambiguous sidecar cohort.
                    pass
            elif published and not transaction_committed:
                try:
                    append_journal(
                        transaction,
                        "POST_PUBLISH_FAILURE_HOLD",
                        containment="DO_NOT_RESTORE_STALE_SIDECARS_OR_RESTART_DATABASE_WRITERS",
                    )
                except BaseException:
                    pass
            close_transaction_journals(transaction)
        if temp_fd >= 0:
            if not published and temp_name:
                try:
                    entry = os.stat(temp_name, dir_fd=args.destination_dir_fd, follow_symlinks=False)
                    held = os.fstat(temp_fd)
                    if (entry.st_dev, entry.st_ino) == (held.st_dev, held.st_ino):
                        os.unlink(temp_name, dir_fd=args.destination_dir_fd)
                        os.fsync(args.destination_dir_fd)
                except FileNotFoundError:
                    pass
            os.close(temp_fd)
        os.close(source_fd)


if __name__ == "__main__":
    main()
