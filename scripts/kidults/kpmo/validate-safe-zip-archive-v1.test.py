#!/usr/bin/env python3
"""Negative and positive regression cases for pre-extraction ZIP limits."""

from __future__ import annotations

import hashlib
import os
from pathlib import Path
import stat
import subprocess
import sys
import tempfile
import zipfile


SCRIPT = Path(__file__).with_name("validate-safe-zip-archive-v1.py")


def digest(path: Path) -> str:
    return f"sha256:{hashlib.sha256(path.read_bytes()).hexdigest()}"


def invoke(
    path: Path,
    *,
    expected: str | None = None,
    overrides: dict[str, str] | None = None,
    required_basenames: list[str] | None = None,
) -> subprocess.CompletedProcess[str]:
    limits = {
        "max-compressed-bytes": "2097152",
        "max-entries": "8",
        "max-entry-uncompressed-bytes": "1048576",
        "max-total-uncompressed-bytes": "2097152",
        "max-compression-ratio": "100",
    }
    limits.update(overrides or {})
    command = [
        sys.executable,
        str(SCRIPT),
        "--archive", str(path),
        "--expected-digest", expected or digest(path),
        "--receipt", str(path.with_suffix(".receipt.json")),
    ]
    for name, value in limits.items():
        command.extend([f"--{name}", value])
    for required_basename in required_basenames or []:
        command.extend(["--required-basename", required_basename])
    return subprocess.run(command, check=False, capture_output=True, text=True)


def make_zip(path: Path, entries: list[tuple[str, bytes]], compression: int = zipfile.ZIP_DEFLATED) -> None:
    with zipfile.ZipFile(path, "w", compression=compression) as bundle:
        for name, content in entries:
            bundle.writestr(name, content)


def assert_rejected(result: subprocess.CompletedProcess[str], code: str) -> None:
    if result.returncode == 0 or code not in result.stderr:
        raise AssertionError(f"expected {code}; rc={result.returncode}; stderr={result.stderr!r}")


def main() -> int:
    with tempfile.TemporaryDirectory(prefix="safe-zip-v1-") as temp:
        root = Path(temp)
        valid = root / "valid.zip"
        make_zip(valid, [("receipts/a.json", b"{}\n"), ("data.txt", b"bounded")])
        accepted = invoke(valid)
        if accepted.returncode != 0:
            raise AssertionError(accepted.stderr)
        required_accepted = invoke(valid, required_basenames=["a.json", "data.txt"])
        if required_accepted.returncode != 0:
            raise AssertionError(required_accepted.stderr)
        assert_rejected(
            invoke(valid, required_basenames=["missing.json"]),
            "ARCHIVE_REQUIRED_BASENAME_CARDINALITY",
        )

        duplicate_basename = root / "duplicate-basename.zip"
        make_zip(duplicate_basename, [("one/receipt.json", b"{}"), ("two/receipt.json", b"{}")])
        assert_rejected(
            invoke(duplicate_basename, required_basenames=["receipt.json"]),
            "ARCHIVE_REQUIRED_BASENAME_CARDINALITY",
        )

        cases = [
            ("traversal", [("../escape.json", b"x")], "ARCHIVE_ENTRY_NAME_NONCANONICAL", {}),
            ("absolute", [("/absolute.json", b"x")], "ARCHIVE_ENTRY_NAME_ABSOLUTE", {}),
            ("backslash", [("bad\\name.json", b"x")], "ARCHIVE_ENTRY_NAME_UNSAFE", {}),
            ("entry_count", [(f"f-{index}.txt", b"x") for index in range(3)], "ARCHIVE_ENTRY_COUNT_LIMIT", {"max-entries": "2"}),
            ("entry_size", [("large.txt", b"x" * 128)], "ARCHIVE_ENTRY_UNCOMPRESSED_SIZE_LIMIT", {"max-entry-uncompressed-bytes": "64"}),
            ("total_size", [("a.txt", b"x" * 48), ("b.txt", b"y" * 48)], "ARCHIVE_TOTAL_UNCOMPRESSED_SIZE_LIMIT", {"max-total-uncompressed-bytes": "64"}),
            ("ratio", [("zeros.bin", b"\x00" * 131072)], "ARCHIVE_COMPRESSION_RATIO_LIMIT", {"max-compression-ratio": "10"}),
        ]
        for stem, entries, code, overrides in cases:
            archive = root / f"{stem}.zip"
            make_zip(archive, entries)
            assert_rejected(invoke(archive, overrides=overrides), code)

        duplicate = root / "duplicate.zip"
        make_zip(duplicate, [("same.txt", b"a"), ("same.txt", b"b")])
        assert_rejected(invoke(duplicate), "ARCHIVE_DUPLICATE_NORMALIZED_ENTRY")

        symlink = root / "symlink.zip"
        with zipfile.ZipFile(symlink, "w") as bundle:
            info = zipfile.ZipInfo("link")
            info.create_system = 3
            info.external_attr = (stat.S_IFLNK | 0o777) << 16
            bundle.writestr(info, "target")
        assert_rejected(invoke(symlink), "ARCHIVE_ENTRY_TYPE_FORBIDDEN")

        assert_rejected(invoke(valid, expected="sha256:" + "0" * 64), "ARCHIVE_DIGEST_MISMATCH")
        invalid = root / "invalid.zip"
        invalid.write_bytes(b"not-a-zip")
        assert_rejected(invoke(invalid), "ARCHIVE_FORMAT_INVALID")

    print("SAFE_ZIP_ARCHIVE_VALIDATOR_TEST_PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
