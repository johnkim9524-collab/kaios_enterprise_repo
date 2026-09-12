#!/usr/bin/env python3
"""Fail-closed, pre-extraction validation for GitHub Actions ZIP artifacts."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import PurePosixPath
import re
import stat
import sys
import zipfile


DIGEST_PATTERN = re.compile(r"^sha256:[a-f0-9]{64}$")


class ArchiveValidationError(Exception):
    """A stable error code suitable for fail-closed workflow receipts."""


def fail(code: str, detail: object | None = None) -> None:
    suffix = "" if detail is None else f":{detail}"
    raise ArchiveValidationError(f"{code}{suffix}")


def sha256_file(path: str) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return f"sha256:{digest.hexdigest()}"


def validate_name(name: str) -> tuple[str, bool]:
    if not name or "\x00" in name or "\\" in name:
        fail("ARCHIVE_ENTRY_NAME_UNSAFE", repr(name))
    if any(ord(character) < 32 or ord(character) == 127 for character in name):
        fail("ARCHIVE_ENTRY_NAME_CONTROL_CHARACTER", repr(name))
    if name.startswith("/") or re.match(r"^[A-Za-z]:", name):
        fail("ARCHIVE_ENTRY_NAME_ABSOLUTE", name)
    is_directory = name.endswith("/")
    raw_parts = name[:-1].split("/") if is_directory else name.split("/")
    if not raw_parts or any(part in {"", ".", ".."} for part in raw_parts):
        fail("ARCHIVE_ENTRY_NAME_NONCANONICAL", name)
    pure = PurePosixPath(*raw_parts)
    if pure.is_absolute() or ".." in pure.parts:
        fail("ARCHIVE_ENTRY_NAME_TRAVERSAL", name)
    normalized = pure.as_posix() + ("/" if is_directory else "")
    if normalized != name:
        fail("ARCHIVE_ENTRY_NAME_NONCANONICAL", name)
    return pure.as_posix(), is_directory


def validate_archive(
    archive: str,
    expected_digest: str,
    max_compressed_bytes: int,
    max_entries: int,
    max_entry_uncompressed_bytes: int,
    max_total_uncompressed_bytes: int,
    max_compression_ratio: float,
    required_basenames: list[str] | None = None,
) -> dict[str, object]:
    required_basenames = required_basenames or []
    if len(set(required_basenames)) != len(required_basenames):
        fail("REQUIRED_BASENAME_DUPLICATE")
    for required_basename in required_basenames:
        if (
            not required_basename
            or required_basename in {".", ".."}
            or "/" in required_basename
            or "\\" in required_basename
            or "\x00" in required_basename
        ):
            fail("REQUIRED_BASENAME_INVALID", repr(required_basename))
    try:
        archive_stat = os.lstat(archive)
    except FileNotFoundError:
        fail("ARCHIVE_MISSING", archive)
    if not stat.S_ISREG(archive_stat.st_mode):
        fail("ARCHIVE_NOT_REGULAR_FILE", archive)
    if archive_stat.st_size <= 0 or archive_stat.st_size > max_compressed_bytes:
        fail("ARCHIVE_COMPRESSED_SIZE_LIMIT", archive_stat.st_size)
    if not DIGEST_PATTERN.fullmatch(expected_digest):
        fail("EXPECTED_ARCHIVE_DIGEST_INVALID", expected_digest)
    actual_digest = sha256_file(archive)
    if actual_digest != expected_digest:
        fail("ARCHIVE_DIGEST_MISMATCH", actual_digest)

    total_uncompressed = 0
    maximum_entry_size = 0
    maximum_ratio = 0.0
    normalized_names: set[str] = set()
    required_basename_cardinality = {
        required_basename: 0 for required_basename in required_basenames
    }
    try:
        with zipfile.ZipFile(archive, "r", allowZip64=True) as bundle:
            entries = bundle.infolist()
            if not entries or len(entries) > max_entries:
                fail("ARCHIVE_ENTRY_COUNT_LIMIT", len(entries))
            for entry in entries:
                normalized, name_is_directory = validate_name(entry.filename)
                if normalized in normalized_names:
                    fail("ARCHIVE_DUPLICATE_NORMALIZED_ENTRY", normalized)
                normalized_names.add(normalized)
                if not entry.is_dir():
                    basename = PurePosixPath(normalized).name
                    if basename in required_basename_cardinality:
                        required_basename_cardinality[basename] += 1
                if entry.flag_bits & 0x1:
                    fail("ARCHIVE_ENCRYPTED_ENTRY_FORBIDDEN", entry.filename)
                unix_mode = entry.external_attr >> 16
                file_type = stat.S_IFMT(unix_mode)
                entry_is_directory = entry.is_dir()
                if name_is_directory != entry_is_directory:
                    fail("ARCHIVE_ENTRY_DIRECTORY_MARKER_MISMATCH", entry.filename)
                allowed_type = file_type == 0 or (
                    entry_is_directory and stat.S_ISDIR(unix_mode)
                ) or (
                    not entry_is_directory and stat.S_ISREG(unix_mode)
                )
                if not allowed_type:
                    fail("ARCHIVE_ENTRY_TYPE_FORBIDDEN", entry.filename)
                if entry.file_size < 0 or entry.file_size > max_entry_uncompressed_bytes:
                    fail("ARCHIVE_ENTRY_UNCOMPRESSED_SIZE_LIMIT", entry.filename)
                total_uncompressed += entry.file_size
                if total_uncompressed > max_total_uncompressed_bytes:
                    fail("ARCHIVE_TOTAL_UNCOMPRESSED_SIZE_LIMIT", total_uncompressed)
                if entry.file_size:
                    if entry.compress_size <= 0:
                        fail("ARCHIVE_COMPRESSION_RATIO_LIMIT", entry.filename)
                    ratio = entry.file_size / entry.compress_size
                    if ratio > max_compression_ratio:
                        fail("ARCHIVE_COMPRESSION_RATIO_LIMIT", entry.filename)
                    maximum_ratio = max(maximum_ratio, ratio)
                maximum_entry_size = max(maximum_entry_size, entry.file_size)
            bad_member = bundle.testzip()
            if bad_member is not None:
                fail("ARCHIVE_MEMBER_CRC_INVALID", bad_member)
    except zipfile.BadZipFile as error:
        fail("ARCHIVE_FORMAT_INVALID", str(error))

    for required_basename, cardinality in required_basename_cardinality.items():
        if cardinality != 1:
            fail(
                "ARCHIVE_REQUIRED_BASENAME_CARDINALITY",
                f"{required_basename}:{cardinality}",
            )

    return {
        "id": "kidults-safe-zip-archive-validation-receipt-v1",
        "version": "1.0.0",
        "state": "VERIFIED_PASS_PRE_EXTRACTION",
        "archive_digest": actual_digest,
        "archive_compressed_bytes": archive_stat.st_size,
        "entry_count": len(normalized_names),
        "total_uncompressed_bytes": total_uncompressed,
        "maximum_entry_uncompressed_bytes": maximum_entry_size,
        "maximum_observed_compression_ratio": round(maximum_ratio, 6),
        "limits": {
            "max_compressed_bytes": max_compressed_bytes,
            "max_entries": max_entries,
            "max_entry_uncompressed_bytes": max_entry_uncompressed_bytes,
            "max_total_uncompressed_bytes": max_total_uncompressed_bytes,
            "max_compression_ratio": max_compression_ratio,
        },
        "safe_names_verified": True,
        "safe_regular_file_or_directory_types_verified": True,
        "encrypted_entries_allowed": False,
        "required_basename_cardinality": required_basename_cardinality,
        "required_basename_cardinality_verified": True,
        "extraction_performed": False,
        "public": "HOLD",
        "production": "HOLD",
        "g5": "EXPLICIT_APPROVAL_REQUIRED",
    }


def positive_integer(value: str) -> int:
    parsed = int(value)
    if parsed <= 0:
        raise argparse.ArgumentTypeError("must be positive")
    return parsed


def positive_float(value: str) -> float:
    parsed = float(value)
    if parsed <= 0:
        raise argparse.ArgumentTypeError("must be positive")
    return parsed


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--archive", required=True)
    parser.add_argument("--expected-digest", required=True)
    parser.add_argument("--receipt", required=True)
    parser.add_argument("--max-compressed-bytes", type=positive_integer, required=True)
    parser.add_argument("--max-entries", type=positive_integer, required=True)
    parser.add_argument("--max-entry-uncompressed-bytes", type=positive_integer, required=True)
    parser.add_argument("--max-total-uncompressed-bytes", type=positive_integer, required=True)
    parser.add_argument("--max-compression-ratio", type=positive_float, required=True)
    parser.add_argument("--required-basename", action="append", default=[])
    arguments = parser.parse_args()
    try:
        receipt = validate_archive(
            arguments.archive,
            arguments.expected_digest,
            arguments.max_compressed_bytes,
            arguments.max_entries,
            arguments.max_entry_uncompressed_bytes,
            arguments.max_total_uncompressed_bytes,
            arguments.max_compression_ratio,
            arguments.required_basename,
        )
    except ArchiveValidationError as error:
        print(str(error), file=sys.stderr)
        return 1
    receipt_directory = os.path.dirname(os.path.abspath(arguments.receipt))
    os.makedirs(receipt_directory, exist_ok=True)
    with open(arguments.receipt, "w", encoding="utf-8") as handle:
        json.dump(receipt, handle, indent=2, sort_keys=True)
        handle.write("\n")
    print(json.dumps(receipt, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
