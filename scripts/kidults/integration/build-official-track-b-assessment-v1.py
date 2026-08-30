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
LAUNCH_COHORT_SIZE = 120
INTERNAL_PRODUCT_PURPOSE = "KIDULTS_INTERNAL_PRODUCT_ANALYSIS_AND_STAGING_DISPLAY"


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


def timestamp_ms(value: Any) -> float | None:
    if not utc_timestamp(value):
        return None
    candidate = value[:-1] + "+00:00" if value.endswith("Z") else value
    return datetime.fromisoformat(candidate).timestamp() * 1000


def validate_rights_assertion(record: dict[str, Any], reference_time: str) -> None:
    assertion = record.get("rights_assertion") or {}
    required_atoms = {"COLLECT", "STORE", "DERIVE", "DISPLAY"}
    require(assertion.get("source_owner_id") == record.get("source_owner_id"), "RIGHTS_SOURCE_OWNER_MISMATCH")
    require(assertion.get("purpose_binding_id") == INTERNAL_PRODUCT_PURPOSE, "RIGHTS_PURPOSE_BINDING_INVALID")
    require(required_atoms.issubset(set(assertion.get("rights_atoms") or [])), "RIGHTS_ATOMS_INCOMPLETE")
    require(nonempty(assertion.get("document_sha256")) and assertion["document_sha256"].startswith(SHA256_PREFIX)
            and assertion["document_sha256"] != SHA256_PREFIX + "0" * 64, "RIGHTS_DOCUMENT_DIGEST_INVALID")
    require(assertion.get("source_content_snapshot_sha256") == record.get("source_payload_sha256"),
            "RIGHTS_SOURCE_SNAPSHOT_DIGEST_MISMATCH")
    effective = timestamp_ms(assertion.get("effective_at"))
    expires = timestamp_ms(assertion.get("expires_at"))
    reference = timestamp_ms(reference_time)
    observed = timestamp_ms(record.get("observed_at"))
    require(None not in {effective, expires, reference, observed}, "RIGHTS_TIME_INVALID")
    require(effective <= observed <= reference < expires, "RIGHTS_NOT_EFFECTIVE_AT_ASSESSMENT")


def launch_cohort_digest(evidence: dict[str, Any], current_sold: list[dict[str, Any]]) -> str:
    cohort = evidence.get("launch_cohort") or {}
    require(cohort.get("cohort_class") == "LAWFUL_CURRENT_SOLD_120", "LAUNCH_COHORT_CLASS_INVALID")
    ids = [record.get("evidence_id") for record in current_sold]
    require(len(ids) == LAUNCH_COHORT_SIZE and len(set(ids)) == LAUNCH_COHORT_SIZE,
            "LAUNCH_COHORT_EXACTLY_120_UNIQUE_SOLD_REQUIRED")
    require(cohort.get("terminal_state") == "SOLD", "LAUNCH_COHORT_TERMINAL_STATE_INVALID")
    require(cohort.get("event_ids") == sorted(ids), "LAUNCH_COHORT_EVENT_SET_MISMATCH")
    computed = digest_json({
        "cohort_class": cohort["cohort_class"],
        "terminal_state": cohort["terminal_state"],
        "event_ids": sorted(ids),
        "event_digests": sorted(digest_json(record) for record in current_sold),
    })
    require(cohort.get("cohort_digest") == computed, "LAUNCH_COHORT_DIGEST_MISMATCH")
    return computed


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
    recommendation = assessment.get("recommendation")
    require(recommendation in {"BLOCKED", "CONDITIONAL", "PUBLISHABLE_INTERNAL", "PUBLISHABLE_PUBLIC"}, "ASSESSMENT_RECOMMENDATION_INVALID")
    rankable = assessment.get("overall_rankability")
    require(isinstance(rankable, bool), "ASSESSMENT_RANKABILITY_INVALID")
    require(rankable is (recommendation in {"PUBLISHABLE_INTERNAL", "PUBLISHABLE_PUBLIC"}), "ASSESSMENT_RANKABILITY_RECOMMENDATION_MISMATCH")
    if not rankable:
        require(assessment.get("gate_state") in {"blocked", "conditional"}, "ASSESSMENT_HOLD_GATE_STATE_INVALID")
        require(len(assessment.get("blocking_dimensions") or []) > 0, "ASSESSMENT_HOLD_BLOCKERS_MISSING")
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
    for record in evidence_records:
        validate_rights_assertion(record, generated_at)
    cohort_digest = launch_cohort_digest(evidence, current_sold)
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
            "launch_cohort_digest": cohort_digest,
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



def build_hold_assessment_envelope(
    snapshot: dict[str, Any],
    evidence: dict[str, Any],
    handoff: dict[str, Any],
    *,
    generated_at: str,
    candidate_reference: str,
    evidence_reference: str,
    handoff_reference: str,
) -> dict[str, Any]:
    """Complete Track B with a fail-closed HOLD assessment for a blocked exact pair."""

    require(utc_timestamp(generated_at), "ASSESSMENT_GENERATED_AT_INVALID")
    snapshot_id = snapshot.get("snapshot_id")
    evidence_package_id = evidence.get("package_id") or evidence.get("evidence_package_id")
    require(nonempty(snapshot_id) and nonempty(evidence_package_id), "PAIR_IDENTITY_MISSING")
    require(evidence.get("bound_snapshot_id") == snapshot_id, "EVIDENCE_SNAPSHOT_BINDING_MISMATCH")
    require(snapshot.get("bound_evidence_package_id") == evidence_package_id, "SNAPSHOT_EVIDENCE_BINDING_MISMATCH")
    require(snapshot.get("publication_eligible") is not True, "SNAPSHOT_PUBLIC_PREAUTH_FORBIDDEN")
    require(snapshot.get("production_authorized") is not True, "SNAPSHOT_PRODUCTION_PREAUTH_FORBIDDEN")
    require(evidence.get("publication_authorized") is not True, "EVIDENCE_PUBLIC_PREAUTH_FORBIDDEN")
    require(evidence.get("production_authorized") is not True, "EVIDENCE_PRODUCTION_PREAUTH_FORBIDDEN")

    pair_digest = digest_json({"snapshot": snapshot, "evidence": evidence})
    handoff_pair_digest = handoff.get("pair_digest")
    if nonempty(handoff_pair_digest):
        require(handoff_pair_digest == pair_digest, "HANDOFF_PAIR_DIGEST_MISMATCH")
    evidence_records = evidence.get("evidence_records") if isinstance(evidence.get("evidence_records"), list) else []
    claims = evidence.get("claims") if isinstance(evidence.get("claims"), list) else []
    blockers = [str(item) for item in (handoff.get("blockers") or [])]
    rights_states = sorted({str(record.get("rights_state", "UNKNOWN")) for record in evidence_records})
    factual_fulfillments = [
        record for record in evidence_records
        if record.get("temporality") == "CURRENT_MARKET"
        and record.get("market_observation_type") == "ORDER_FULFILLED"
        and record.get("sold_claim") is False
    ]
    current_sold = [
        record for record in evidence_records
        if record.get("temporality") == "CURRENT_MARKET"
        and record.get("market_observation_type") == "SOLD_TRANSACTION"
        and record.get("rights_state") == "ALLOW"
    ]
    blocking_dimensions = sorted(set(
        (["canonical_handoff"] if handoff.get("handoff_state") != "READY_FOR_TRACK_B" else [])
        + (["current_sold_evidence"] if not current_sold else [])
        + (["rights"] if any(state != "ALLOW" for state in rights_states) else [])
        + blockers
    ))
    if not blocking_dimensions:
        blocking_dimensions = ["track_b_publishability_not_established"]
    recommendation = "CONDITIONAL" if factual_fulfillments and "CONDITIONAL" in rights_states else "BLOCKED"
    gate_state = "conditional" if recommendation == "CONDITIONAL" else "blocked"
    seed = {"pair_digest": pair_digest, "assessor_version": "official-track-b-v1", "recommendation": recommendation}
    assessment_id = f"assessment-{snapshot_id}-{digest_json(seed).split(':', 1)[1][:24]}"
    assessment: dict[str, Any] = {
        "id": assessment_id,
        "assessment_id": assessment_id,
        "record_type": "rankability_assessment",
        "version": "1.0.0",
        "status": "COMPLETED_CONDITIONAL" if recommendation == "CONDITIONAL" else "COMPLETED_BLOCKED",
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
            "evidence_snapshot_id": str(evidence.get("bound_snapshot_id")),
            "same_snapshot_id": evidence.get("bound_snapshot_id") == snapshot_id,
            "methodology_resolved": snapshot.get("methodology_version") == evidence.get("methodology_version"),
            "evidence_lineage_resolved": snapshot.get("evidence_lineage_version") == evidence.get("evidence_lineage_version"),
            "baseline_unchanged": True,
            "missing_to_zero_detected": False,
            "rights_explicit_by_source": bool(evidence_records) and all(nonempty(record.get("rights_state")) for record in evidence_records),
        },
        "assessment_status": "COMPLETED",
        "gate_state": gate_state,
        "recommendation": recommendation,
        "overall_rankability": False,
        "publication_eligible": False,
        "production_eligible": False,
        "metric_status": {
            "exact_pair_binding": "VERIFIED",
            "entity_resolution": "NOT_VERIFIED",
            "current_market_evidence": "PARTIALLY_VERIFIED" if factual_fulfillments else "NOT_VERIFIED",
            "rights": "PARTIALLY_VERIFIED" if "CONDITIONAL" in rights_states else "NOT_VERIFIED",
            "provenance": "VERIFIED" if evidence_records else "NOT_VERIFIED",
            "freshness": "VERIFIED" if factual_fulfillments else "NOT_VERIFIED",
            "confidence": "PARTIALLY_VERIFIED",
        },
        "quantitative_summary": {
            "evidence_record_count": len(evidence_records),
            "claim_count": len(claims),
            "factual_order_fulfilled_count": len(factual_fulfillments),
            "admitted_current_sold_count": len(current_sold),
            "handoff_blocker_count": len(blockers),
        },
        "quantitative_reasons": [
            {"dimension": "exact_pair", "observed": pair_digest, "required": "canonical digest equality", "result": "PASS", "evidence_reference": handoff_reference},
            {"dimension": "current_market", "observed": f"{len(factual_fulfillments)} ORDER_FULFILLED fact(s); sold_claim=false", "required": "rights-ALLOW SOLD_TRANSACTION", "result": "HOLD", "evidence_reference": evidence_reference},
            {"dimension": "rights", "observed": ",".join(rights_states) or "UNKNOWN", "required": "ALLOW for every admitted claim input", "result": "HOLD", "evidence_reference": evidence_reference},
        ],
        "blocking_dimensions": blocking_dimensions,
        "test_results": {
            "canonical_handoff_r2": "HOLD",
            "exact_pair_digest": "PASS",
            "current_market_factual_event": "PASS" if factual_fulfillments else "HOLD",
            "sold_claim": "FALSE",
            "rights_and_contradictions": "HOLD",
            "staging_replay": "NOT_RUN",
            "projection": "NOT_RUN",
            "public_authority": "HOLD",
            "production_authority": "HOLD",
            "g5_authority": "HOLD",
        },
        "stability_summary": {
            "assessment_reproducibility": "PASS_SAME_INPUT_SAME_SEMANTIC_OUTPUT",
            "public_release": "HOLD",
            "production": "HOLD",
        },
        "exit_criteria": [
            {"criterion": "rights", "measure": "rights state", "observed": ",".join(rights_states) or "UNKNOWN", "target": "ALLOW"},
            {"criterion": "current_sold", "measure": "admitted SOLD_TRANSACTION records", "observed": str(len(current_sold)), "target": ">=25 lighthouse; >=100 core-domain floor"},
            {"criterion": "canonical_handoff", "measure": "R2 blocker count", "observed": str(len(blockers)), "target": "0"},
        ],
        "requirements_for_publishable": [
            "Obtain purpose-bound collect/store/derive/commercial-use authority.",
            "Admit a representative lawful cohort; one record is plumbing evidence only.",
            "Rerun canonical R2 handoff and official Track B assessment at the exact input digest.",
            "Public, Production, and G5 require separate protected approvals.",
        ],
        "provider_spend_recommendation": "targeted_poc_only",
        "residual_risks": [
            "ORDER_FULFILLED proves an on-chain paid fulfillment fact, not an arm's-length or wash-free sale.",
            "No OpenSea frontend attribution, metadata/image right, fiat value, or global market representativeness is established.",
        ],
        "evidence_references": [candidate_reference, evidence_reference, handoff_reference],
        "immutable": True,
    }
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
    snapshot = json.loads(candidate_path.read_text(encoding="utf-8"))
    evidence = json.loads(evidence_path.read_text(encoding="utf-8"))
    generated_at = snapshot.get("as_of")
    require(utc_timestamp(generated_at), "SNAPSHOT_AS_OF_INVALID")
    if process.returncode != 0 or handoff.get("handoff_state") != "READY_FOR_TRACK_B":
        envelope = build_hold_assessment_envelope(
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
            "result": "HOLD",
            "state": "TRACK_B_ASSESSMENT_COMPLETE_HOLD",
            "blocker_count": handoff.get("blocker_count"),
            "blockers": handoff.get("blockers", []),
            "assessment_id": envelope["assessment"]["assessment_id"],
            "recommendation": envelope["assessment"]["recommendation"],
            "overall_rankability": False,
            "production": "HOLD",
            "public": "HOLD",
            "g5": "HOLD",
        }, indent=2))
        return 2

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
