#!/usr/bin/env python3
"""Autonomously advance a genuine exact pair through the internal product chain."""

from __future__ import annotations

import json
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

    if not manifest_path.exists():
        print(json.dumps({
            "suite": "KIDULTS_EXACT_PAIR_PRODUCT_CHAIN_V1",
            "result": "PASS",
            "state": "WAITING_PAIR",
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
    require(manifest.get("synthetic") is False and manifest.get("promotable") is True, "NON_PROMOTABLE_INPUT_REJECTED")
    candidate_path = resolve_repository_path(manifest.get("candidate_path", ""))
    evidence_path = resolve_repository_path(manifest.get("evidence_path", ""))
    remote_attestation_path = resolve_repository_path(manifest.get("remote_staging_attestation_path", ""))
    require(candidate_path.exists() and evidence_path.exists(), "EXACT_PAIR_FILE_MISSING")
    require(remote_attestation_path.exists(), "REMOTE_STAGING_ATTESTATION_REQUIRED")

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
