#!/usr/bin/env python3
"""Negative and positive regression cases for pre-extraction ZIP limits."""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import stat
import subprocess
import sys
import tempfile
import zipfile


SCRIPT = Path(__file__).with_name("validate-safe-zip-archive-v1.py")
RESERVE_ROOT = "asi-sharded-source-reserve-v1/"
SOURCE_SHA = "a" * 40


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


def reserve_entries(mutation: str | None = None) -> list[tuple[str, bytes]]:
    rows = []
    contents: dict[str, bytes] = {}
    for index in range(256):
        shard_id = f"{index:02x}"
        relative_path = f"shards/{shard_id}.ndjson"
        data = b"{}\n" if index == 0 else b""
        contents[RESERVE_ROOT + relative_path] = data
        rows.append({
            "shard_id": shard_id,
            "path": relative_path,
            "sha256": hashlib.sha256(data).hexdigest(),
            "candidate_count": 1 if index == 0 else 0,
        })
    global_digest = "sha256:" + hashlib.sha256(
        "|".join(f"{row['shard_id']}:{row['sha256']}:{row['candidate_count']}" for row in rows).encode()
    ).hexdigest()
    manifest = {
        "id": "kidults-asi-sharded-source-reserve-manifest-v1",
        "status": "SHADOW_SHARDED_DISCOVERY_SOURCE_RESERVE_READY",
        "shard_count": 256,
        "shards": rows,
        "unique_candidate_count": 1,
        "nonempty_shard_count": 1,
        "global_digest": global_digest,
        "cycle_number": 7,
        "production": "HOLD",
        "public_release": "HOLD",
        "acquisition_authorized": False,
        "content_acquired": False,
    }
    activation = {
        "id": "kidults-asi-sharded-source-reserve-activation-receipt-v1",
        "state": "VERIFIED_PASS",
        "exact_generation_bound": True,
        "promotion_authority": False,
        "content_acquisition_authorized": False,
        "collection_right_created": False,
        "public_release": "HOLD",
        "production": "HOLD",
        "reserve_cycle": 7,
        "reserve_unique_candidates": 1,
        "reserve_nonempty_shards": 1,
        "discovery_producer_head_sha": SOURCE_SHA,
    }
    contents[RESERVE_ROOT + "asi-sharded-source-reserve-manifest-v1.json"] = json.dumps(manifest, separators=(",", ":")).encode()
    contents["asi-sharded-source-reserve-activation-receipt-v1.json"] = json.dumps(activation, separators=(",", ":")).encode()
    if mutation == "missing":
        contents.pop(RESERVE_ROOT + "shards/ff.ndjson")
    elif mutation == "extra":
        contents[RESERVE_ROOT + "unexpected.txt"] = b"x"
    elif mutation == "traversal":
        contents.pop(RESERVE_ROOT + "shards/ff.ndjson")
        contents["../escape.txt"] = b"x"
    elif mutation == "tamper":
        contents[RESERVE_ROOT + "shards/00.ndjson"] = b'{"tampered":true}\n'
    elif mutation == "release":
        activation["production"] = "ENABLED"
        contents["asi-sharded-source-reserve-activation-receipt-v1.json"] = json.dumps(activation, separators=(",", ":")).encode()
    return list(contents.items())


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

        reserve = root / "reserve.zip"
        make_zip(reserve, reserve_entries())
        reserve_result = invoke(reserve, overrides={"max-entries": "32"})
        if reserve_result.returncode != 0:
            raise AssertionError(f"healthy Reserve artifact class rejected: {reserve_result.stderr}")
        reserve_receipt = json.loads(reserve.with_suffix(".receipt.json").read_text())
        if not (
            reserve_receipt.get("artifact_class") == "KIDULTS_ASI_SHARDED_SOURCE_RESERVE_V1"
            and reserve_receipt.get("artifact_class_contract_verified") is True
            and reserve_receipt.get("entry_count") == 258
            and reserve_receipt.get("limits", {}).get("requested_max_entries") == 32
            and reserve_receipt.get("limits", {}).get("effective_max_entries") == 258
            and reserve_receipt.get("production") == "HOLD"
        ):
            raise AssertionError(f"Reserve class receipt invalid: {reserve_receipt}")
        for mutation, code in [
            ("missing", "ARCHIVE_ENTRY_COUNT_LIMIT"),
            ("extra", "ARCHIVE_ENTRY_COUNT_LIMIT"),
            ("traversal", "ARCHIVE_ENTRY_COUNT_LIMIT"),
            ("tamper", "RESERVE_SHARD_DIGEST_MISMATCH"),
            ("release", "RESERVE_ACTIVATION_RELEASE_BOUNDARY"),
        ]:
            archive = root / f"reserve-{mutation}.zip"
            make_zip(archive, reserve_entries(mutation))
            assert_rejected(invoke(archive, overrides={"max-entries": "32"}), code)

    print("SAFE_ZIP_ARCHIVE_VALIDATOR_TEST_PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
