#!/usr/bin/env python3
"""Autonomously advance a genuine exact pair through the internal product chain."""

from __future__ import annotations

import json
import hashlib
import tempfile
import subprocess
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[3]
DEFAULT_MANIFEST = ROOT / "coordination/kidults/integration/live-arrival/live-admission-manifest.json"
DEFAULT_OUTPUT = ROOT / "artifacts/exact-pair-arrival"
ASSESSOR = ROOT / "scripts/kidults/integration/build-official-track-b-assessment-v1.py"
REPLAY = ROOT / "scripts/kidults/integration/build-exact-pair-staging-replay-v1.py"
PRODUCER = ROOT / "scripts/kidults/integration/build-canonical-object-projection-v1.mjs"
INPUT_CONNECTION = ROOT / "scripts/kidults/integration/run-runtime-domain-input-connections-v1.mjs"


def require(condition: bool, code: str) -> None:
    if not condition:
        raise RuntimeError(code)


def resolve_repository_path(value: str | Path) -> Path:
    path = Path(value)
    resolved = path.resolve() if path.is_absolute() else (ROOT / path).resolve()
    require(resolved == ROOT or ROOT in resolved.parents, "PATH_ESCAPES_REPOSITORY")
    return resolved


def relative(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def write_exclusive(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("x", encoding="utf-8") as handle:
        json.dump(value, handle, indent=2, sort_keys=True)
        handle.write("\n")


def main(argv: list[str]) -> int:
    if len(argv) > 2:
        raise RuntimeError(
            "Usage: run-exact-pair-product-chain-v1.py [live-admission-manifest.json] [output-directory]"
        )
    manifest_path = resolve_repository_path(argv[0]) if argv else DEFAULT_MANIFEST
    output_dir = resolve_repository_path(argv[1]) if len(argv) == 2 else DEFAULT_OUTPUT
    output_dir.mkdir(parents=True, exist_ok=True)
    runtime_manifest_path = output_dir / "runtime-live-admission-manifest.json"

    # This observation is deliberately not an empirical domain certificate.
    # It executes the native input connector and records all 13 outstanding joins.
    subprocess.run([
        "node", str(INPUT_CONNECTION), relative(manifest_path),
        relative(output_dir / "runtime-domain-input-connections.json"),
    ], cwd=ROOT, check=True)

    if not manifest_path.exists():
        observation = json.loads((output_dir / "runtime-domain-input-connections.json").read_text(encoding="utf-8"))
        require(observation.get("source_sha") == subprocess.check_output(
            ["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(), "RUNTIME_DOMAIN_OBSERVATION_SOURCE_MISMATCH")
        print(json.dumps({
            "suite": "KIDULTS_EXACT_PAIR_PRODUCT_CHAIN_V1",
            "result": "PASS",
            "state": "WAITING_PAIR",
            "native_runtime_proven": False,
            "runtime_domain_observation_digest": observation["receipt_digest"],
            "locally_executed_domain_count": observation["workload_execution"]["locally_executed_domain_count"],
            "authenticated_native_output_count": observation["native_output_connections"]["authenticated_output_count"],
            "evidence_scope": "LOCAL_CONTENT_PROCESSING_NOT_NATIVE_DOMAIN_PROOF",
            "runtime_manifest": None,
            "assessment": "NOT_CREATED",
            "replay": "NOT_RUN",
            "projection": "NONE",
            "public": "HOLD",
            "production": "HOLD",
            "g5": "HOLD",
        }, indent=2))
        return 0

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    # A manifest that claims native provenance must consume the authenticated
    # connector result before any pair, assessor or remote attestation is read.
    # Legacy local replay remains explicitly outside native domain proof.
    if manifest.get("native_business_input_reference") is not None:
        connection = json.loads((output_dir / "runtime-domain-input-connections.json").read_text(encoding="utf-8"))
        require(connection.get("source_sha") == subprocess.check_output(
            ["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(), "NATIVE_INPUT_SOURCE_MISMATCH")
        require(connection.get("native_input_transport_state") == "INPUT_TRANSPORT_AND_CONTENT_VERIFIED"
                and connection.get("native_input_reference") is not None,
                "AUTHENTICATED_NATIVE_INPUT_REQUIRED")
    require(manifest.get("synthetic") is False and manifest.get("promotable") is True, "NON_PROMOTABLE_INPUT_REJECTED")
    candidate_path = resolve_repository_path(manifest.get("candidate_path", ""))
    evidence_path = resolve_repository_path(manifest.get("evidence_path", ""))
    remote_attestation_path = resolve_repository_path(manifest.get("remote_staging_attestation_path", ""))
    require(candidate_path.exists() and evidence_path.exists(), "EXACT_PAIR_FILE_MISSING")
    require(remote_attestation_path.exists(), "REMOTE_STAGING_ATTESTATION_REQUIRED")

    # Bind the actual pair before any assessor/processor starts. The later arrival
    # evaluator cannot retroactively protect a processor that already read drifted bytes.
    captured = {}
    for key, file_path, expected_name in [
        ("candidate_sha256", candidate_path, "snapshot-candidate.json"),
        ("evidence_sha256", evidence_path, "evidence-package.json"),
    ]:
        require(file_path.name == expected_name and file_path.is_file(), "EXACT_PAIR_FILENAME_INVALID")
        captured[expected_name] = file_path.read_bytes()
        require(0 < len(captured[expected_name]) <= 2 * 1024 * 1024, "EXACT_PAIR_BOUNDED_BYTES")
        actual = "sha256:" + hashlib.sha256(captured[expected_name]).hexdigest()
        require(manifest.get(key) == actual, "EXACT_FILE_DIGEST_MISMATCH")
    pair = {"snapshot": json.loads(captured["snapshot-candidate.json"].decode("utf-8")),
            "evidence": json.loads(captured["evidence-package.json"].decode("utf-8"))}
    pair_digest = "sha256:" + hashlib.sha256(json.dumps(pair, sort_keys=True, separators=(",", ":"),
                                                        ensure_ascii=False).encode("utf-8")).hexdigest()
    require(manifest.get("exact_pair_digest") == pair_digest, "EXACT_PAIR_DIGEST_MISMATCH")

    require(remote_attestation_path.is_file(), "REMOTE_STAGING_ATTESTATION_REQUIRED")
    captured["remote-staging-attestation.json"] = remote_attestation_path.read_bytes()
    require(0 < len(captured["remote-staging-attestation.json"]) <= 2 * 1024 * 1024,
            "REMOTE_STAGING_ATTESTATION_BOUNDED_BYTES")
    # Private transient snapshots stay outside the uploaded artifact directory.
    # This is local byte continuity, never Object Lock or native execution proof.
    with tempfile.TemporaryDirectory(prefix=".kidults-pair-input-", dir=ROOT) as temporary:
        frozen = Path(temporary)
        for name, contents in captured.items():
            with (frozen / name).open("xb") as handle:
                handle.write(contents)
            (frozen / name).chmod(0o400)
        return advance_captured_pair(manifest, frozen / "snapshot-candidate.json",
                                     frozen / "evidence-package.json", frozen / "remote-staging-attestation.json",
                                     output_dir, runtime_manifest_path)


def advance_captured_pair(manifest, candidate_path, evidence_path, remote_attestation_path,
                          output_dir, runtime_manifest_path):

    # Downstream paths are always produced in this run.  A source manifest may
    # never inject a precomputed assessment, replay, or Projection around the
    # canonical builders.
    for key in ["assessment_path", "replay_receipt_path", "projection_path", "projection_admission_path"]:
        manifest.pop(key, None)

    handoff_path = output_dir / "handoff-r2.json"
    assessment_path = output_dir / "live-rankability-assessment-envelope.json"
    process = subprocess.run([
        sys.executable,
        str(ASSESSOR),
        relative(candidate_path),
        relative(evidence_path),
        relative(assessment_path),
        relative(handoff_path),
    ], cwd=ROOT, check=False)
    if process.returncode == 2:
        write_exclusive(runtime_manifest_path, manifest)
        print(json.dumps({
            "suite": "KIDULTS_EXACT_PAIR_PRODUCT_CHAIN_V1",
            "result": "PASS",
            "state": "PAIR_BLOCKED_PRE_TRACK_B",
            "native_runtime_proven": False,
            "evidence_scope": "LOCAL_CONTENT_PROCESSING_NOT_NATIVE_DOMAIN_PROOF",
            "runtime_manifest": relative(runtime_manifest_path),
            "assessment": "NOT_CREATED",
            "replay": "NOT_RUN",
            "projection": "NONE",
            "public": "HOLD",
            "production": "HOLD",
            "g5": "HOLD",
        }, indent=2))
        return 0
    require(process.returncode == 0 and assessment_path.exists(), "OFFICIAL_TRACK_B_ASSESSOR_FAILED")
    manifest["assessment_path"] = relative(assessment_path)

    replay_path = output_dir / "staging-replay-receipt.json"
    replay_arguments = [
        sys.executable,
        str(REPLAY),
        relative(candidate_path),
        relative(evidence_path),
        relative(assessment_path),
        relative(remote_attestation_path),
        relative(replay_path),
    ]
    if manifest.get("canonical_object_id"):
        replay_arguments.append(str(manifest["canonical_object_id"]))
    subprocess.run(replay_arguments, cwd=ROOT, check=True)
    manifest["replay_receipt_path"] = relative(replay_path)

    projection_path = output_dir / "approved-internal-object-projection.json"
    admission_path = output_dir / "projection-admission-receipt.json"
    producer_arguments = [
        "node",
        str(PRODUCER),
        relative(candidate_path),
        relative(evidence_path),
        relative(assessment_path),
        relative(replay_path),
        relative(projection_path),
        relative(admission_path),
    ]
    if manifest.get("canonical_object_id"):
        producer_arguments.append(str(manifest["canonical_object_id"]))
    subprocess.run(producer_arguments, cwd=ROOT, check=True)
    manifest["projection_path"] = relative(projection_path)
    manifest["projection_admission_path"] = relative(admission_path)
    write_exclusive(runtime_manifest_path, manifest)

    admission = json.loads(admission_path.read_text(encoding="utf-8"))
    print(json.dumps({
        "suite": "KIDULTS_EXACT_PAIR_PRODUCT_CHAIN_V1",
        "result": "PASS",
        "state": "READY_FOR_CHAIN_EVALUATION",
        "native_runtime_proven": False,
        "evidence_scope": "LOCAL_CONTENT_PROCESSING_NOT_NATIVE_DOMAIN_PROOF",
        "runtime_manifest": relative(runtime_manifest_path),
        "assessment": manifest["assessment_path"],
        "replay": manifest["replay_receipt_path"],
        "projection": manifest["projection_path"],
        "projection_id": admission["projection_id"],
        "canonical_object_id": admission["canonical_object_id"],
        "enabled_actions": admission["enabled_actions"],
        "public": "HOLD",
        "production": "HOLD",
        "g5": "HOLD",
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
