#!/usr/bin/env python3
"""Create one inode-bound, WAL-aware SQLite online-backup snapshot."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import os
from pathlib import Path
import sqlite3
import stat
import sys


def fail(message: str) -> None:
    raise SystemExit(message)


def descriptor_identity(descriptor: int) -> tuple[int, int]:
    metadata = os.fstat(descriptor)
    if not stat.S_ISREG(metadata.st_mode):
        fail("SQLITE_SNAPSHOT_DESCRIPTOR_NOT_REGULAR")
    return metadata.st_dev, metadata.st_ino


def database_metadata_identity(metadata: os.stat_result) -> tuple[int, int, int, int, int]:
    mode = stat.S_IMODE(metadata.st_mode)
    if not stat.S_ISREG(metadata.st_mode):
        fail("SQLITE_SOURCE_METADATA_NOT_REGULAR")
    if mode & 0o7000 or mode & 0o022:
        fail("SQLITE_SOURCE_METADATA_UNSAFE")
    return metadata.st_dev, metadata.st_ino, metadata.st_uid, metadata.st_gid, mode


def write_all(descriptor: int, payload: bytes) -> None:
    remaining = memoryview(payload)
    while remaining:
        written = os.write(descriptor, remaining)
        if written <= 0:
            fail("SQLITE_SNAPSHOT_METADATA_WRITE_FAILED")
        remaining = remaining[written:]


def require_bound_entry(parent_fd: int, name: str, descriptor: int, code: str) -> None:
    entry = os.stat(name, dir_fd=parent_fd, follow_symlinks=False)
    if not stat.S_ISREG(entry.st_mode):
        fail(code)
    if (entry.st_dev, entry.st_ino) != descriptor_identity(descriptor):
        fail(code)


def matching_open_descriptors(identity: tuple[int, int]) -> set[int]:
    proc_fd = Path("/proc/self/fd")
    if not proc_fd.is_dir():
        fail("SQLITE_SNAPSHOT_PROC_FD_REQUIRED")
    descriptors: set[int] = set()
    for name in os.listdir(proc_fd):
        try:
            descriptor = int(name)
            metadata = os.fstat(descriptor)
        except (OSError, ValueError):
            continue
        if stat.S_ISREG(metadata.st_mode) and (metadata.st_dev, metadata.st_ino) == identity:
            descriptors.add(descriptor)
    return descriptors


def require_connection_descriptors(descriptors: set[int], identity: tuple[int, int], code: str) -> None:
    if not descriptors:
        fail(code)
    for descriptor in descriptors:
        try:
            metadata = os.fstat(descriptor)
        except OSError:
            fail(code)
        if not stat.S_ISREG(metadata.st_mode) or (metadata.st_dev, metadata.st_ino) != identity:
            fail(code)


def sqlite_uri(path: Path, mode: str) -> str:
    return f"{path.as_uri()}?mode={mode}"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("source")
    parser.add_argument("target")
    parser.add_argument("metadata_target")
    parser.add_argument("--test-source-connect-path")
    parser.add_argument("--test-target-connect-path")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    test_hooks_requested = args.test_source_connect_path is not None or args.test_target_connect_path is not None
    if test_hooks_requested and os.environ.get("KIDULTS_SQLITE_SNAPSHOT_TEST_HOOKS") != "ENABLED_FAIL_CLOSED_ONLY":
        fail("SQLITE_SNAPSHOT_TEST_HOOKS_FORBIDDEN")
    source_input = Path(args.source)
    target_input = Path(args.target)
    metadata_input = Path(args.metadata_target)
    if source_input.is_symlink() or not source_input.is_file():
        fail("SQLITE_SNAPSHOT_SOURCE_NOT_REGULAR")
    if target_input.exists() or target_input.is_symlink():
        fail("SQLITE_SNAPSHOT_TARGET_ALREADY_EXISTS")
    if metadata_input.exists() or metadata_input.is_symlink():
        fail("SQLITE_SNAPSHOT_METADATA_ALREADY_EXISTS")

    source_path = source_input.resolve(strict=True)
    target_parent = target_input.parent.resolve(strict=True)
    target_path = target_parent / target_input.name
    metadata_parent = metadata_input.parent.resolve(strict=True)
    metadata_path = metadata_parent / metadata_input.name
    if metadata_parent != target_parent or metadata_path.name == target_path.name:
        fail("SQLITE_SNAPSHOT_METADATA_TARGET_INVALID")
    source_parent_fd = os.open(
        source_path.parent,
        os.O_RDONLY | os.O_DIRECTORY | getattr(os, "O_NOFOLLOW", 0),
    )
    target_parent_fd = os.open(
        target_parent,
        os.O_RDONLY | os.O_DIRECTORY | getattr(os, "O_NOFOLLOW", 0),
    )
    source_fd = os.open(
        source_path.name,
        os.O_RDONLY | os.O_NONBLOCK | getattr(os, "O_NOFOLLOW", 0),
        dir_fd=source_parent_fd,
    )
    target_fd = -1
    metadata_fd = -1
    source: sqlite3.Connection | None = None
    target: sqlite3.Connection | None = None
    capture_record = ""
    try:
        source_metadata_before = database_metadata_identity(os.fstat(source_fd))
        target_fd = os.open(
            target_path.name,
            os.O_RDWR | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0),
            0o600,
            dir_fd=target_parent_fd,
        )
        metadata_fd = os.open(
            metadata_path.name,
            os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0),
            0o600,
            dir_fd=target_parent_fd,
        )
        require_bound_entry(source_parent_fd, source_path.name, source_fd, "SQLITE_SOURCE_ENTRY_CHANGED_BEFORE_CONNECT")
        require_bound_entry(target_parent_fd, target_path.name, target_fd, "SQLITE_TARGET_ENTRY_CHANGED_BEFORE_CONNECT")
        source_identity = descriptor_identity(source_fd)
        target_identity = descriptor_identity(target_fd)
        source_descriptors_before = matching_open_descriptors(source_identity)
        target_descriptors_before = matching_open_descriptors(target_identity)

        source_connect_path = (
            Path(args.test_source_connect_path).resolve(strict=True)
            if args.test_source_connect_path
            else Path(f"/proc/self/fd/{source_parent_fd}/{source_path.name}")
        )
        target_connect_path = (
            Path(args.test_target_connect_path).resolve(strict=True)
            if args.test_target_connect_path
            else Path(f"/proc/self/fd/{target_parent_fd}/{target_path.name}")
        )
        source = sqlite3.connect(sqlite_uri(source_connect_path, "ro"), uri=True, timeout=30)
        target = sqlite3.connect(sqlite_uri(target_connect_path, "rw"), uri=True, timeout=30)

        require_bound_entry(source_parent_fd, source_path.name, source_fd, "SQLITE_SOURCE_ENTRY_CHANGED_AT_CONNECT")
        require_bound_entry(target_parent_fd, target_path.name, target_fd, "SQLITE_TARGET_ENTRY_CHANGED_AT_CONNECT")
        source_connection_descriptors = matching_open_descriptors(source_identity) - source_descriptors_before
        target_connection_descriptors = matching_open_descriptors(target_identity) - target_descriptors_before
        require_connection_descriptors(source_connection_descriptors, source_identity, "SQLITE_SOURCE_CONNECTION_NOT_BOUND_TO_HELD_INODE")
        require_connection_descriptors(target_connection_descriptors, target_identity, "SQLITE_TARGET_CONNECTION_NOT_BOUND_TO_HELD_INODE")

        source.execute("PRAGMA query_only = ON")
        source.backup(target)
        # This is the recovery point.  Do not move this timestamp below
        # integrity checking, connection teardown, or durability work: those
        # operations can be slow and must not make the backup appear newer
        # than the instant at which SQLite completed the online backup.
        captured_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        result = target.execute("PRAGMA integrity_check").fetchone()
        if result != ("ok",):
            fail(f"SQLITE_SNAPSHOT_INTEGRITY_FAILED:{result!r}")
        require_bound_entry(source_parent_fd, source_path.name, source_fd, "SQLITE_SOURCE_ENTRY_CHANGED_DURING_BACKUP")
        require_bound_entry(target_parent_fd, target_path.name, target_fd, "SQLITE_TARGET_ENTRY_CHANGED_DURING_BACKUP")
        require_connection_descriptors(source_connection_descriptors, source_identity, "SQLITE_SOURCE_CONNECTION_LOST_HELD_INODE")
        require_connection_descriptors(target_connection_descriptors, target_identity, "SQLITE_TARGET_CONNECTION_LOST_HELD_INODE")
        source_metadata_after = database_metadata_identity(os.fstat(source_fd))
        if source_metadata_after != source_metadata_before:
            fail("SQLITE_SOURCE_METADATA_CHANGED_DURING_BACKUP")

        target.close()
        target = None
        source.close()
        source = None
        os.fsync(target_fd)
        require_bound_entry(source_parent_fd, source_path.name, source_fd, "SQLITE_SOURCE_ENTRY_CHANGED_AFTER_BACKUP")
        source_metadata_receipt = database_metadata_identity(os.fstat(source_fd))
        if source_metadata_receipt != source_metadata_before:
            fail("SQLITE_SOURCE_METADATA_CHANGED_AFTER_BACKUP")
        _, _, source_uid, source_gid, source_mode = source_metadata_receipt
        capture_record = f"{captured_at}\t{source_uid}\t{source_gid}\t{source_mode:04o}\n"
        write_all(metadata_fd, capture_record.encode("ascii"))
        os.fsync(metadata_fd)
    finally:
        if target is not None:
            target.close()
        if source is not None:
            source.close()
        if target_fd >= 0:
            os.fsync(target_fd)
            os.close(target_fd)
        if metadata_fd >= 0:
            os.close(metadata_fd)
        os.close(source_fd)
        os.fsync(target_parent_fd)
        os.close(target_parent_fd)
        os.close(source_parent_fd)

    print(capture_record, end="")


if __name__ == "__main__":
    main()
