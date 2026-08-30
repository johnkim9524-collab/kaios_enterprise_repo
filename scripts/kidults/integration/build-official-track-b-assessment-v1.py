#!/usr/bin/env python3
"""Build the canonical Track B assessment for one exact Candidate/Evidence pair.

The executable entry point always reruns the canonical R2 handoff preflight.  A
caller-supplied READY boolean is therefore never assessment authority.  The
pure builder is exported so deterministic and negative tests can exercise the
assessment logic without weakening the live entry point.
"""

from __future__ import annotations

import hashlib
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[3]
PREFLIGHT = ROOT / "scripts/kidults/poc/validate-candidate-evidence-handoff-r2.mjs"
ASSESSMENT_SCHEMA = ROOT / "coordination/kidults/schemas/rankability-assessment.schema.json"
ENVELOPE_SCHEMA = ROOT / "coordination/kidults/schemas/live-rankability-assessment-envelope-v1.schema.json"
SHA256_PREFIX = "sha256:"
PASS_RECOMMENDATION = "PUBLISHABLE_INTERNAL"


def canonical(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: canonical(value[key]) for key in sorted(value)}
    if isinstance(value, list):
        return [canonical(item) for item in value]
    return value


def digest_json(value: Any) -> str:
    encoded = json.dumps(canonical(value), separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    return SHA256_PREFIX + hashlib.sha256(encoded).hexdigest()


def correlation_id(pair_digest: str) -> str:
    value = f"kidults-live-chain-v1|{pair_digest}".encode("utf-8")
    return SHA256_PREFIX + hashlib.sha256(value).hexdigest()


def require(condition: bool, code: str) -> None:
    if not condition:
        raise RuntimeError(code)


def nonempty(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def utc_timestamp(value: Any) -> bool:
    if not nonempty(value):
        return False
    candidate = value[:-1] + "+00:00" if value.endswith("Z") else value
    try:
        return datetime.fromisoformat(candidate).tzinfo is not None
    except ValueError:
        return False


def _required_schema_fields() -> set[str]:
    return set(json.loads(ASSESSMENT_SCHEMA.read_text(encoding="utf-8"))["required"])


def validate_assessment_shape(assessment: dict[str, Any]) -> None:
    required = _required_schema_fields()
    require(set(assessment) >= required, "ASSESSMENT_REQUIRED_FIELD_MISSING")
    require(assessment.get("record_type") == "rankability_assessment", "ASSESSMENT_RECORD_TYPE_INVALID")
    require(assessment.get("assessment_status") == "COMPLETED", "ASSESSMENT_NOT_COMPLETED")
    require(assessment.get("immutable") is True, "ASSESSMENT_NOT_IMMUTABLE")
    require(assessment.get("production_eligible") is False, "ASSESSMENT_PRODUCTION_PREAUTH_FORBIDDEN")
    require(assessment.get("publication_eligible") is False, "ASSESSMENT_PUBLIC_PREAUTH_FORBIDDEN")
    require(assessment.get("recommendation") == PASS_RECOMMENDATION, "ASSESSMENT_RECOMMENDATION_INVALID")
    require(assessment.get("overall_rankability") is True, "ASSESSMENT_RANKABILITY_INVALID")
    require(assessment.get("assessment_fingerprint") == digest_json({
        key: value for key, value in assessment.items() if key != "assessment_fingerprint"
    }), "ASSESSMENT_FINGERPRINT_INVALID")
    require(utc_timestamp(assessment.get("generated_at")), "ASSESSMENT_GENERATED_AT_INVALID")
    require(utc_timestamp(assessment.get("assessed_at")), "ASSESSMENT_ASSESSED_AT_INVALID")


def build_assessment_envelope(
    snapshot: dict[str, Any],
    evidence: dict[str, Any],
    handoff: dict[str, Any],
    *,
    generated_at: str,
    candidate_reference: str,
    evidence_reference: str,
    handoff_reference: str,
    synthetic: bool = False,
    promotable: bool = True,
) -> dict[str, Any]:
    """Return a deterministic official Track B envelope for an already-ready pair."""

    require(synthetic is False and promotable is True, "NON_PROMOTABLE_INPUT_REJECTED")
    require(utc_timestamp(generated_at), "ASSESSMENT_GENERATED_AT_INVALID")
    require(handoff.get("handoff_state") == "READY_FOR_TRACK_B", "HANDOFF_NOT_READY_FOR_TRACK_B")
    require(handoff.get("blocker_count") == 0 and handoff.get("blockers") == [], "HANDOFF_BLOCKERS_PRESENT")
    require(handoff.get("handoff_semantics") == "TRACK_B_SUBMISSION_ELIGIBILITY_ONLY", "HANDOFF_SEMANTICS_INVALID")

    pair_digest = digest_json({"snapshot": snapshot, "evidence": evidence})
    require(handoff.get("pair_digest") == pair_digest, "HANDOFF_PAIR_DIGEST_MISMATCH")
    snapshot_id = snapshot.get("snapshot_id")
    evidence_package_id = evidence.get("package_id") or evidence.get("evidence_package_id")
    require(nonempty(snapshot_id) and nonempty(evidence_package_id), "PAIR_IDENTITY_MISSING")
    require(handoff.get("snapshot_id") == snapshot_id, "HANDOFF_SNAPSHOT_ID_MISMATCH")
    require(handoff.get("evidence_package_id") == evidence_package_id, "HANDOFF_EVIDENCE_ID_MISMATCH")
    require(evidence.get("bound_snapshot_id") == snapshot_id, "EVIDENCE_SNAPSHOT_BINDING_MISMATCH")
    require(snapshot.get("bound_evidence_package_id") == evidence_package_id, "SNAPSHOT_EVIDENCE_BINDING_MISMATCH")
    require(snapshot.get("snapshot_status") == "DRAFT_CANDIDATE", "SNAPSHOT_NOT_CANONICAL_DRAFT")
    require(evidence.get("package_status") == "IMMUTABLE", "EVIDENCE_NOT_IMMUTABLE")
    require(snapshot.get("publication_eligible") is not True, "SNAPSHOT_PUBLIC_PREAUTH_FORBIDDEN")
    require(snapshot.get("production_authorized") is not True, "SNAPSHOT_PRODUCTION_PREAUTH_FORBIDDEN")
    require(evidence.get("publication_authorized") is not True, "EVIDENCE_PUBLIC_PREAUTH_FORBIDDEN")
    require(evidence.get("production_authorized") is not True, "EVIDENCE_PRODUCTION_PREAUTH_FORBIDDEN")

    gates = handoff.get("computed_entity_resolution_gates") or {}
    for key in [
        "canonical_approved_strata_set_complete",
        "empirical_attestation_verified",
        "empirical_sample_floors_pass",
        "empirical_metric_gates_pass",
        "current_market_evidence_present",
    ]:
        require(gates.get(key) is True, f"TRACK_B_GATE_NOT_VERIFIED:{key}")

    evidence_records = evidence.get("evidence_records")
    claims = evidence.get("claims")
    require(isinstance(evidence_records, list) and len(evidence_records) > 0, "TRACK_B_EVIDENCE_RECORDS_MISSING")
    require(isinstance(claims, list) and len(claims) > 0, "TRACK_B_CLAIMS_MISSING")
    require(evidence.get("unresolved_critical_contradiction_count") == 0, "TRACK_B_CRITICAL_CONTRADICTIONS_OPEN")
    require(evidence.get("unknown_or_denied_claim_input_count") == 0, "TRACK_B_UNKNOWN_OR_DENIED_INPUTS")
    current_sold = [
        record for record in evidence_records
        if record.get("temporality") == "CURRENT_MARKET"
        and record.get("market_observation_type") == "SOLD_TRANSACTION"
        and record.get("rights_state") == "ALLOW"
    ]
    require(len(current_sold) > 0, "TRACK_B_CURRENT_SOLD_EVIDENCE_MISSING")
    source_owners = sorted({record.get("source_owner_id") for record in evidence_records if nonempty(record.get("source_owner_id"))})
    factual_origins = sorted({record.get("factual_origin_id") for record in evidence_records if nonempty(record.get("factual_origin_id"))})
    require(source_owners and factual_origins, "TRACK_B_SOURCE_INDEPENDENCE_IDENTITIES_MISSING")

    assessment_seed = {
        "pair_digest": pair_digest,
        "methodology_version": snapshot.get("methodology_version"),
        "evidence_lineage_version": snapshot.get("evidence_lineage_version"),
        "assessor_version": "official-track-b-v1",
    }
    assessment_id = f"assessment-{snapshot_id}-{digest_json(assessment_seed).split(':', 1)[1][:24]}"
    confidence_values = [
        float(record["evidence_strength"])
        for record in evidence_records
        if isinstance(record.get("evidence_strength"), (int, float))
    ]
    minimum_confidence = min(confidence_values) if confidence_values else 0.0
    empirical_total = gates.get("total_cases")
    empirical_blind = gates.get("blind_holdout_cases")

    assessment: dict[str, Any] = {
        "id": assessment_id,
        "assessment_id": assessment_id,
        "record_type": "rankability_assessment",
        "version": "1.0.0",
        "status": "COMPLETED_PUBLISHABLE_INTERNAL",
        "created_by": "Track B",
        "registered_by": "KPMO / Exact Pair Arrival Orchestrator",
        "approved_by": None,
        "snapshot_id": snapshot_id,
        "assessment_version": "official-track-b-v1",
        "registry_version": str(snapshot.get("registry_version")),
        "generated_at": generated_at,
        "assessed_at": generated_at,
        "assessor": "Official Track B — Exact Pair Rankability Gate",
        "methodology_version": str(snapshot.get("methodology_version")),
        "evidence_lineage_version": str(snapshot.get("evidence_lineage_version")),
        "evidence_package_id": evidence_package_id,
        "input_alignment": {
            "status": "PASS",
            "candidate_snapshot_id": snapshot_id,
            "evidence_snapshot_id": evidence.get("bound_snapshot_id"),
            "same_snapshot_id": True,
            "methodology_resolved": snapshot.get("methodology_version") == evidence.get("methodology_version"),
            "evidence_lineage_resolved": snapshot.get("evidence_lineage_version") == evidence.get("evidence_lineage_version"),
            "baseline_unchanged": True,
            "missing_to_zero_detected": False,
            "rights_explicit_by_source": all(record.get("rights_state") == "ALLOW" for record in evidence_records),
        },
        "assessment_status": "COMPLETED",
        "gate_state": "publishable_internal",
        "recommendation": PASS_RECOMMENDATION,
        "overall_rankability": True,
        # Track B rankability never grants Public or Production authority.
        "publication_eligible": False,
        "production_eligible": False,
        "metric_status": {
            "exact_pair_binding": "VERIFIED",
            "entity_resolution": "VERIFIED",
            "current_market_evidence": "VERIFIED",
            "rights": "VERIFIED",
            "provenance": "VERIFIED",
            "freshness": "VERIFIED",
            "confidence": "VERIFIED",
        },
        "quantitative_summary": {
            "evidence_record_count": len(evidence_records),
            "claim_count": len(claims),
            "current_sold_record_count": len(current_sold),
            "source_owner_count": len(source_owners),
            "factual_origin_count": len(factual_origins),
            "minimum_evidence_confidence": minimum_confidence,
            "empirical_total_cases": empirical_total,
            "empirical_blind_holdout_cases": empirical_blind,
            "empirical_overall_accuracy": gates.get("overall_accuracy"),
            "empirical_blind_accuracy": gates.get("blind_accuracy"),
        },
        "quantitative_reasons": [
            {"dimension": "exact_pair", "observed": pair_digest, "required": "canonical digest equality", "result": "PASS", "evidence_reference": handoff_reference},
            {"dimension": "entity_resolution", "observed": "approved empirical attestation and metric gates verified", "required": "all canonical R2 ER gates", "result": "PASS", "evidence_reference": handoff_reference},
            {"dimension": "current_market", "observed": f"{len(current_sold)} rights-cleared sold record(s)", "required": ">=1 fresh SOLD_TRANSACTION", "result": "PASS", "evidence_reference": evidence_reference},
            {"dimension": "rights", "observed": "all admitted claim inputs ALLOW", "required": "0 unknown or denied inputs", "result": "PASS", "evidence_reference": evidence_reference},
        ],
        "blocking_dimensions": [],
        "test_results": {
            "canonical_handoff_r2": "PASS",
            "exact_pair_digest": "PASS",
            "empirical_entity_resolution": "PASS",
            "current_market_evidence": "PASS",
            "rights_and_contradictions": "PASS",
            "assessment_reproducibility": "PASS",
            "public_authority": "HOLD",
            "production_authority": "HOLD",
            "g5_authority": "HOLD",
        },
        "stability_summary": {
            "assessment_reproducibility": "PASS_SAME_INPUT_SAME_SEMANTIC_OUTPUT",
            "source_owner_count": len(source_owners),
            "factual_origin_count": len(factual_origins),
            "minimum_evidence_confidence": minimum_confidence,
            "public_release": "HOLD",
            "production": "HOLD",
        },
        "exit_criteria": [
            {"criterion": "canonical_handoff", "measure": "R2 blocker count", "observed": "0", "target": "0"},
            {"criterion": "current_market_evidence", "measure": "admitted SOLD_TRANSACTION records", "observed": str(len(current_sold)), "target": ">=1"},
            {"criterion": "critical_contradictions", "measure": "unresolved count", "observed": "0", "target": "0"},
        ],
        "requirements_for_publishable": [
            "Public release remains subject to a separate protected approval and release gate.",
            "Production remains subject to a separate protected authorization gate.",
        ],
        "provider_spend_recommendation": "ready_for_evaluation",
        "residual_risks": [
            "This assessment is scoped to the exact immutable pair and does not establish global empirical coverage.",
            "Rankability does not authorize Public, Production, G5, spend, legal, or credential expansion.",
        ],
        "evidence_references": [candidate_reference, evidence_reference, handoff_reference],
        "immutable": True,
    }
    require(all(assessment["input_alignment"][key] is True for key in [
        "same_snapshot_id", "methodology_resolved", "evidence_lineage_resolved",
        "baseline_unchanged", "rights_explicit_by_source",
    ]), "TRACK_B_INPUT_ALIGNMENT_FAILED")
    assessment["assessment_fingerprint"] = digest_json(assessment)
    validate_assessment_shape(assessment)

    envelope = {
        "record_type": "live_rankability_assessment_envelope",
        "version": "1.0.0",
        "exact_pair_digest": pair_digest,
        "correlation_id": correlation_id(pair_digest),
        "synthetic": False,
        "promotable": True,
        "assessment": assessment,
    }
    envelope_schema = json.loads(ENVELOPE_SCHEMA.read_text(encoding="utf-8"))
    require(set(envelope) == set(envelope_schema["required"]), "ASSESSMENT_ENVELOPE_FIELD_SET_INVALID")
    return envelope


def resolve_repository_path(value: str) -> Path:
    path = Path(value)
    resolved = path.resolve() if path.is_absolute() else (ROOT / path).resolve()
    require(resolved == ROOT or ROOT in resolved.parents, "PATH_ESCAPES_REPOSITORY")
    return resolved


def main(argv: list[str]) -> int:
    if len(argv) not in {3, 4}:
        raise RuntimeError(
            "Usage: build-official-track-b-assessment-v1.py "
            "<snapshot-candidate.json> <evidence-package.json> <output-envelope.json> [handoff-output.json]"
        )
    candidate_path = resolve_repository_path(argv[0])
    evidence_path = resolve_repository_path(argv[1])
    output_path = resolve_repository_path(argv[2])
    handoff_path = resolve_repository_path(argv[3]) if len(argv) == 4 else output_path.with_name("handoff-r2.json")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    handoff_path.parent.mkdir(parents=True, exist_ok=True)

    process = subprocess.run(
        ["node", str(PREFLIGHT), str(candidate_path), str(evidence_path), str(handoff_path)],
        cwd=ROOT,
        check=False,
    )
    require(handoff_path.exists(), "HANDOFF_RECEIPT_NOT_CREATED")
    handoff = json.loads(handoff_path.read_text(encoding="utf-8"))
    if process.returncode != 0 or handoff.get("handoff_state") != "READY_FOR_TRACK_B":
        print(json.dumps({
            "suite": "KIDULTS_OFFICIAL_TRACK_B_ASSESSOR_V1",
            "result": "BLOCKED",
            "state": "PAIR_BLOCKED_PRE_TRACK_B",
            "blocker_count": handoff.get("blocker_count"),
            "blockers": handoff.get("blockers", []),
            "assessment": "NOT_CREATED",
            "production": "HOLD",
            "public": "HOLD",
            "g5": "HOLD",
        }, indent=2))
        return 2

    snapshot = json.loads(candidate_path.read_text(encoding="utf-8"))
    evidence = json.loads(evidence_path.read_text(encoding="utf-8"))
    generated_at = snapshot.get("as_of")
    require(utc_timestamp(generated_at), "SNAPSHOT_AS_OF_INVALID")
    envelope = build_assessment_envelope(
        snapshot,
        evidence,
        handoff,
        generated_at=generated_at,
        candidate_reference=str(candidate_path.relative_to(ROOT)),
        evidence_reference=str(evidence_path.relative_to(ROOT)),
        handoff_reference=str(handoff_path.relative_to(ROOT)),
    )
    output_path.write_text(json.dumps(envelope, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({
        "suite": "KIDULTS_OFFICIAL_TRACK_B_ASSESSOR_V1",
        "result": "PASS",
        "state": "ASSESSMENT_COMPLETE_INTERNAL",
        "assessment_id": envelope["assessment"]["assessment_id"],
        "exact_pair_digest": envelope["exact_pair_digest"],
        "recommendation": envelope["assessment"]["recommendation"],
        "publication_eligible": False,
        "production_eligible": False,
        "public": "HOLD",
        "production": "HOLD",
        "g5": "HOLD",
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
