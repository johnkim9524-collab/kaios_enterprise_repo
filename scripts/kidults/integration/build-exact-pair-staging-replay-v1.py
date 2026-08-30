#!/usr/bin/env python3
"""Execute the bounded staging replay that precedes Projection production."""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[3]


def canonical(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: canonical(value[key]) for key in sorted(value)}
    if isinstance(value, list):
        return [canonical(item) for item in value]
    return value


def digest_json(value: Any) -> str:
    encoded = json.dumps(canonical(value), separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    return "sha256:" + hashlib.sha256(encoded).hexdigest()


def correlation_id(pair_digest: str) -> str:
    return "sha256:" + hashlib.sha256(f"kidults-live-chain-v1|{pair_digest}".encode("utf-8")).hexdigest()


def require(condition: bool, code: str) -> None:
    if not condition:
        raise RuntimeError(code)


def nonempty(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def object_identity(record: dict[str, Any]) -> str | None:
    for key in ("canonical_object_id", "asset_identity_id"):
        if nonempty(record.get(key)):
            return record[key]
    return None


def select_object_id(evidence: dict[str, Any], requested: str | None = None) -> str:
    identities = sorted({
        identity for record in evidence.get("evidence_records", [])
        if (identity := object_identity(record)) is not None
    })
    require(identities, "CANONICAL_OBJECT_ID_MISSING")
    if requested is not None:
        require(requested in identities, "REQUESTED_CANONICAL_OBJECT_NOT_IN_PAIR")
        return requested
    require(len(identities) == 1, "CANONICAL_OBJECT_SELECTION_REQUIRED")
    return identities[0]


def build_replay_receipt(
    snapshot: dict[str, Any],
    evidence: dict[str, Any],
    envelope: dict[str, Any],
    *,
    canonical_object_id: str | None = None,
) -> dict[str, Any]:
    pair_digest = digest_json({"snapshot": snapshot, "evidence": evidence})
    expected_correlation = correlation_id(pair_digest)
    require(envelope.get("record_type") == "live_rankability_assessment_envelope", "ASSESSMENT_ENVELOPE_INVALID")
    require(envelope.get("version") == "1.0.0", "ASSESSMENT_ENVELOPE_VERSION_INVALID")
    require(envelope.get("synthetic") is False and envelope.get("promotable") is True, "ASSESSMENT_NON_PROMOTABLE")
    require(envelope.get("exact_pair_digest") == pair_digest, "ASSESSMENT_PAIR_BINDING_MISMATCH")
    require(envelope.get("correlation_id") == expected_correlation, "ASSESSMENT_CORRELATION_MISMATCH")
    assessment = envelope.get("assessment") or {}
    require(assessment.get("record_type") == "rankability_assessment", "ASSESSMENT_BODY_INVALID")
    require(assessment.get("assessment_status") == "COMPLETED", "ASSESSMENT_NOT_COMPLETED")
    require(assessment.get("immutable") is True, "ASSESSMENT_NOT_IMMUTABLE")
    require(assessment.get("overall_rankability") is True, "ASSESSMENT_NOT_RANKABLE")
    require(assessment.get("recommendation") in {"PUBLISHABLE_INTERNAL", "PUBLISHABLE_PUBLIC"}, "ASSESSMENT_NOT_PASS")
    require(assessment.get("assessment_fingerprint") == digest_json({
        key: value for key, value in assessment.items() if key != "assessment_fingerprint"
    }), "ASSESSMENT_FINGERPRINT_INVALID")
    require(assessment.get("production_eligible") is False, "ASSESSMENT_PRODUCTION_PREAUTH_FORBIDDEN")
    require(assessment.get("publication_eligible") is False, "ASSESSMENT_PUBLIC_PREAUTH_FORBIDDEN")
    require(assessment.get("snapshot_id") == snapshot.get("snapshot_id"), "ASSESSMENT_SNAPSHOT_ID_MISMATCH")
    evidence_id = evidence.get("package_id") or evidence.get("evidence_package_id")
    require(assessment.get("evidence_package_id") == evidence_id, "ASSESSMENT_EVIDENCE_ID_MISMATCH")

    selected = select_object_id(evidence, canonical_object_id)
    records = [
        record for record in evidence.get("evidence_records", [])
        if object_identity(record) == selected
    ]
    require(records, "OBJECT_EVIDENCE_MISSING")
    sold_records = [
        record for record in records
        if record.get("temporality") == "CURRENT_MARKET"
        and record.get("market_observation_type") == "SOLD_TRANSACTION"
        and record.get("rights_state") == "ALLOW"
    ]
    require(sold_records, "OBJECT_CURRENT_SOLD_EVIDENCE_MISSING")
    require(all(nonempty(record.get("evidence_id")) for record in records), "OBJECT_EVIDENCE_ID_MISSING")
    require(all(record.get("rights_state") == "ALLOW" for record in records), "OBJECT_EVIDENCE_RIGHTS_NOT_ALLOW")

    assessment_id = assessment.get("assessment_id") or assessment.get("id")
    seed = {
        "pair_digest": pair_digest,
        "assessment_id": assessment_id,
        "canonical_object_id": selected,
        "evidence_record_ids": sorted(record["evidence_id"] for record in records),
    }
    replay_id = "replay-" + digest_json(seed).split(":", 1)[1][:32]
    receipt = {
        "record_type": "kidults_internal_staging_replay_receipt",
        "version": "1.0.0",
        "id": replay_id,
        "replay_id": replay_id,
        "result": "PASS",
        "environment": "STAGING",
        "workload": "OBJECT_PASSPORT_EXACT_PAIR_REPLAY",
        "workload_result": "PASS",
        "exact_pair_digest": pair_digest,
        "correlation_id": expected_correlation,
        "snapshot_id": snapshot.get("snapshot_id"),
        "evidence_package_id": evidence_id,
        "assessment_id": assessment_id,
        "canonical_object_id": selected,
        "evidence_record_ids": sorted(record["evidence_id"] for record in records),
        "current_sold_record_count": len(sold_records),
        "expected_product_type": "OBJECT_PASSPORT",
        "expected_actions": ["COMPARE", "WATCHLIST"],
        "projection_ready": True,
        "synthetic": False,
        "promotable": True,
        "production_touch": False,
        "public_touch": False,
        "g5": "HOLD",
        "authority_boundary": "INTERNAL_STAGING_REPLAY_ONLY",
    }
    receipt["replay_fingerprint"] = digest_json(receipt)
    return receipt


def resolve_repository_path(value: str) -> Path:
    path = Path(value)
    resolved = path.resolve() if path.is_absolute() else (ROOT / path).resolve()
    require(resolved == ROOT or ROOT in resolved.parents, "PATH_ESCAPES_REPOSITORY")
    return resolved


def main(argv: list[str]) -> int:
    if len(argv) not in {4, 5}:
        raise RuntimeError(
            "Usage: build-exact-pair-staging-replay-v1.py "
            "<snapshot-candidate.json> <evidence-package.json> <assessment-envelope.json> "
            "<output-receipt.json> [canonical-object-id]"
        )
    candidate_path, evidence_path, assessment_path, output_path = map(resolve_repository_path, argv[:4])
    requested_object_id = argv[4] if len(argv) == 5 else None
    snapshot = json.loads(candidate_path.read_text(encoding="utf-8"))
    evidence = json.loads(evidence_path.read_text(encoding="utf-8"))
    envelope = json.loads(assessment_path.read_text(encoding="utf-8"))
    receipt = build_replay_receipt(
        snapshot,
        evidence,
        envelope,
        canonical_object_id=requested_object_id,
    )
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(receipt, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({
        "suite": "KIDULTS_EXACT_PAIR_STAGING_REPLAY_V1",
        "result": "PASS",
        "replay_id": receipt["replay_id"],
        "canonical_object_id": receipt["canonical_object_id"],
        "workload_result": receipt["workload_result"],
        "public": "HOLD",
        "production": "HOLD",
        "g5": "HOLD",
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
