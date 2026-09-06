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
RESERVE_ROOT = "asi-sharded-source-reserve-v1/"
RESERVE_MANIFEST = RESERVE_ROOT + "asi-sharded-source-reserve-manifest-v1.json"
RESERVE_ACTIVATION = "asi-sharded-source-reserve-activation-receipt-v1.json"
RESERVE_SHARDS = [f"{RESERVE_ROOT}shards/{index:02x}.ndjson" for index in range(256)]
RESERVE_ENTRY_SET = frozenset([RESERVE_MANIFEST, RESERVE_ACTIVATION, *RESERVE_SHARDS])
RESERVE_ARTIFACT_CLASS = "KIDULTS_ASI_SHARDED_SOURCE_RESERVE_V1"


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


def sha256_bytes(value: bytes) -> str:
    return f"sha256:{hashlib.sha256(value).hexdigest()}"


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


def exact_reserve_entry_set(entries: list[zipfile.ZipInfo]) -> bool:
    names = [entry.filename for entry in entries]
    return len(names) == 258 and len(set(names)) == 258 and set(names) == RESERVE_ENTRY_SET


def validate_reserve_semantics(bundle: zipfile.ZipFile) -> dict[str, object]:
    try:
        manifest_raw = bundle.read(RESERVE_MANIFEST)
        activation_raw = bundle.read(RESERVE_ACTIVATION)
        manifest = json.loads(manifest_raw.decode("utf-8"))
        activation = json.loads(activation_raw.decode("utf-8"))
    except (KeyError, UnicodeDecodeError, json.JSONDecodeError) as error:
        fail("RESERVE_CONTRACT_JSON_INVALID", str(error))

    if manifest.get("id") != "kidults-asi-sharded-source-reserve-manifest-v1":
        fail("RESERVE_MANIFEST_ID")
    if manifest.get("status") != "SHADOW_SHARDED_DISCOVERY_SOURCE_RESERVE_READY":
        fail("RESERVE_MANIFEST_STATE")
    if manifest.get("shard_count") != 256:
        fail("RESERVE_MANIFEST_SHARD_COUNT")
    if manifest.get("production") != "HOLD" or manifest.get("public_release") != "HOLD":
        fail("RESERVE_MANIFEST_RELEASE_BOUNDARY")
    if manifest.get("acquisition_authorized") is not False or manifest.get("content_acquired") is not False:
        fail("RESERVE_MANIFEST_ACQUISITION_BOUNDARY")
    shards = manifest.get("shards")
    if not isinstance(shards, list) or len(shards) != 256:
        fail("RESERVE_MANIFEST_SHARDS_CARDINALITY")

    digest_rows: list[str] = []
    total_candidates = 0
    nonempty_shards = 0
    for index, shard in enumerate(shards):
        if not isinstance(shard, dict):
            fail("RESERVE_MANIFEST_SHARD_OBJECT", index)
        shard_id = f"{index:02x}"
        relative_path = f"shards/{shard_id}.ndjson"
        full_path = RESERVE_ROOT + relative_path
        if shard.get("shard_id") != shard_id or shard.get("path") != relative_path:
            fail("RESERVE_MANIFEST_SHARD_ORDER", shard_id)
        expected_sha = shard.get("sha256")
        if not isinstance(expected_sha, str) or not re.fullmatch(r"[a-f0-9]{64}", expected_sha):
            fail("RESERVE_SHARD_DIGEST_FORMAT", shard_id)
        raw = bundle.read(full_path)
        if hashlib.sha256(raw).hexdigest() != expected_sha:
            fail("RESERVE_SHARD_DIGEST_MISMATCH", shard_id)
        try:
            text = raw.decode("utf-8")
        except UnicodeDecodeError:
            fail("RESERVE_SHARD_UTF8_INVALID", shard_id)
        lines = [line for line in text.splitlines() if line]
        candidate_count = shard.get("candidate_count")
        if not isinstance(candidate_count, int) or candidate_count < 0:
            fail("RESERVE_SHARD_CANDIDATE_COUNT_INVALID", shard_id)
        if len(lines) != candidate_count:
            fail("RESERVE_SHARD_CANDIDATE_COUNT_MISMATCH", shard_id)
        total_candidates += candidate_count
        if candidate_count > 0:
            nonempty_shards += 1
        digest_rows.append(f"{shard_id}:{expected_sha}:{candidate_count}")

    global_digest = "sha256:" + hashlib.sha256("|".join(digest_rows).encode("utf-8")).hexdigest()
    if manifest.get("global_digest") != global_digest:
        fail("RESERVE_GLOBAL_DIGEST_MISMATCH")
    if total_candidates < 1:
        fail("RESERVE_EMPTY")
    if manifest.get("unique_candidate_count") != total_candidates:
        fail("RESERVE_GLOBAL_CANDIDATE_COUNT_MISMATCH")
    if manifest.get("nonempty_shard_count") != nonempty_shards:
        fail("RESERVE_GLOBAL_NONEMPTY_SHARD_COUNT_MISMATCH")

    if activation.get("id") != "kidults-asi-sharded-source-reserve-activation-receipt-v1":
        fail("RESERVE_ACTIVATION_ID")
    if activation.get("state") != "VERIFIED_PASS" or activation.get("exact_generation_bound") is not True:
        fail("RESERVE_ACTIVATION_STATE")
    if activation.get("promotion_authority") is not False:
        fail("RESERVE_ACTIVATION_PROMOTION_AUTHORITY")
    if activation.get("content_acquisition_authorized") is not False or activation.get("collection_right_created") is not False:
        fail("RESERVE_ACTIVATION_EXTERNAL_AUTHORITY")
    if activation.get("public_release") != "HOLD" or activation.get("production") != "HOLD":
        fail("RESERVE_ACTIVATION_RELEASE_BOUNDARY")
    if activation.get("reserve_cycle") != manifest.get("cycle_number"):
        fail("RESERVE_ACTIVATION_CYCLE_BINDING")
    if activation.get("reserve_unique_candidates") != total_candidates:
        fail("RESERVE_ACTIVATION_CANDIDATE_BINDING")
    if activation.get("reserve_nonempty_shards") != nonempty_shards:
        fail("RESERVE_ACTIVATION_SHARD_BINDING")
    producer_sha = activation.get("discovery_producer_head_sha")
    if not isinstance(producer_sha, str) or not re.fullmatch(r"[a-f0-9]{40}", producer_sha):
        fail("RESERVE_ACTIVATION_SOURCE_SHA")

    shard_set = [
        {
            "shard_id": f"{index:02x}",
            "path": f"shards/{index:02x}.ndjson",
            "sha256": shards[index]["sha256"],
            "candidate_count": shards[index]["candidate_count"],
        }
        for index in range(256)
    ]
    shard_set_digest = sha256_bytes(
        json.dumps(shard_set, sort_keys=True, separators=(",", ":")).encode("utf-8")
    )
    return {
        "artifact_class": RESERVE_ARTIFACT_CLASS,
        "artifact_class_contract_verified": True,
        "manifest_digest": sha256_bytes(manifest_raw),
        "activation_receipt_digest": sha256_bytes(activation_raw),
        "shard_set_digest": shard_set_digest,
        "shard_count": 256,
        "candidate_count": total_candidates,
        "nonempty_shard_count": nonempty_shards,
        "producer_source_sha": producer_sha,
    }


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
    artifact_class_details: dict[str, object] = {}
    effective_max_entries = max_entries
    try:
        with zipfile.ZipFile(archive, "r", allowZip64=True) as bundle:
            entries = bundle.infolist()
            if not entries:
                fail("ARCHIVE_ENTRY_COUNT_LIMIT", 0)
            if len(entries) > max_entries:
                if exact_reserve_entry_set(entries):
                    effective_max_entries = 258
                    artifact_class_details = validate_reserve_semantics(bundle)
                else:
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
        "version": "1.1.0",
        "state": "VERIFIED_PASS_PRE_EXTRACTION",
        "archive_digest": actual_digest,
        "archive_compressed_bytes": archive_stat.st_size,
        "entry_count": len(normalized_names),
        "total_uncompressed_bytes": total_uncompressed,
        "maximum_entry_uncompressed_bytes": maximum_entry_size,
        "maximum_observed_compression_ratio": round(maximum_ratio, 6),
        "limits": {
            "requested_max_entries": max_entries,
            "effective_max_entries": effective_max_entries,
            "max_compressed_bytes": max_compressed_bytes,
            "max_entry_uncompressed_bytes": max_entry_uncompressed_bytes,
            "max_total_uncompressed_bytes": max_total_uncompressed_bytes,
            "max_compression_ratio": max_compression_ratio,
        },
        "safe_names_verified": True,
        "safe_regular_file_or_directory_types_verified": True,
        "encrypted_entries_allowed": False,
        "required_basename_cardinality": required_basename_cardinality,
        "required_basename_cardinality_verified": True,
        "artifact_class": artifact_class_details.get("artifact_class", "GENERIC_ZIP_ARTIFACT"),
        "artifact_class_contract_verified": bool(artifact_class_details),
        "artifact_class_details": artifact_class_details,
        "generic_entry_limit_bypass": bool(artifact_class_details),
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
