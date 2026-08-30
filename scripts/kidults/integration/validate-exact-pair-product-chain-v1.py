#!/usr/bin/env python3
"""Regression, negative, and bounded E2E validation for the exact-pair chain."""

from __future__ import annotations

import copy
import importlib.util
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[3]
ASSESSOR_PATH = ROOT / "scripts/kidults/integration/build-official-track-b-assessment-v1.py"
REPLAY_PATH = ROOT / "scripts/kidults/integration/build-exact-pair-staging-replay-v1.py"
PRODUCER_PATH = ROOT / "scripts/kidults/integration/build-canonical-object-projection-v1.mjs"


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"MODULE_LOAD_FAILED:{name}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


assessor = load_module("kidults_official_track_b", ASSESSOR_PATH)
replay_builder = load_module("kidults_exact_pair_replay", REPLAY_PATH)
errors: list[str] = []
negative_count = 0


def check(condition: bool, message: str) -> None:
    if not condition:
        errors.append(message)


def expect_rejection(label: str, function, code: str) -> None:
    global negative_count
    negative_count += 1
    try:
        function()
        errors.append(f"{label}: mutation was accepted")
    except Exception as error:  # deliberate mutation boundary
        if code not in str(error):
            errors.append(f"{label}: expected {code}, received {error}")


def fixture_pair(object_id: str = "object-redteam-camera-001") -> tuple[dict[str, Any], dict[str, Any]]:
    snapshot_id = "candidate-exact-pair-e2e-001"
    evidence_id = "evidence-exact-pair-e2e-001"
    observed_at = "2026-08-30T01:00:00.000Z"
    valid_until = "2026-09-20T01:00:00.000Z"
    sold = {
        "evidence_id": "evidence-sold-camera-001",
        "canonical_object_id": object_id,
        "asset_identity_id": object_id,
        "temporality": "CURRENT_MARKET",
        "market_observation_type": "SOLD_TRANSACTION",
        "rights_state": "ALLOW",
        "evidence_strength": 0.93,
        "source_owner_id": "auction-owner-a",
        "factual_origin_id": "auction-origin-a",
        "source_url": "https://auction.example.invalid/normalized-away-in-live-preflight",
        "source_payload_sha256": "sha256:" + "1" * 64,
        "license_evidence_refs": ["https://rights.example.invalid/test-only"],
        "observed_at": observed_at,
        "valid_until": valid_until,
        "transaction_occurred_at": "2026-08-29T20:00:00.000Z",
        "sold_price": {"amount": 12500, "currency": "USD"},
        "grade_or_condition": "GRADE_A",
        "market_venue_id": "venue-a",
        "maker": "Test Camera Maker",
        "model": "Model One",
        "year": 1965,
        "rights_assertion": {
            "assertion_id": "rights-camera-001",
            "source_owner_id": "auction-owner-a",
            "purpose_binding_id": "purpose-product-internal",
            "jurisdiction": "US",
            "rights_atoms": ["COLLECT", "DERIVE", "DISPLAY", "STORE"],
            "effective_at": "2026-08-01T00:00:00.000Z",
            "expires_at": "2026-12-01T00:00:00.000Z",
            "document_sha256": "sha256:" + "2" * 64,
            "evidence_uri": "https://rights.example.invalid/test-only",
        },
    }
    liquidity = {
        "evidence_id": "evidence-liquidity-camera-001",
        "canonical_object_id": object_id,
        "asset_identity_id": object_id,
        "temporality": "CURRENT_MARKET",
        "market_observation_type": "LIQUIDITY_EXPOSURE",
        "rights_state": "ALLOW",
        "evidence_strength": 0.88,
        "source_owner_id": "auction-owner-b",
        "factual_origin_id": "auction-origin-b",
        "source_url": "https://market.example.invalid/normalized-away-in-live-preflight",
        "source_payload_sha256": "sha256:" + "3" * 64,
        "license_evidence_refs": ["https://rights.example.invalid/test-only"],
        "observed_at": observed_at,
        "valid_until": valid_until,
        "exposure_started_at": "2026-08-20T01:00:00.000Z",
        "exposure_ended_at": "2026-08-29T01:00:00.000Z",
        "exposure_days": 9,
        "censoring_state": "SOLD_EVENT_OBSERVED",
        "market_venue_id": "venue-b",
        "rights_assertion": {
            "assertion_id": "rights-camera-002",
            "source_owner_id": "auction-owner-b",
            "purpose_binding_id": "purpose-product-internal",
            "jurisdiction": "GB",
            "rights_atoms": ["COLLECT", "DERIVE", "DISPLAY", "STORE"],
            "effective_at": "2026-08-01T00:00:00.000Z",
            "expires_at": "2026-12-01T00:00:00.000Z",
            "document_sha256": "sha256:" + "4" * 64,
            "evidence_uri": "https://rights.example.invalid/test-only",
        },
    }
    evidence = {
        "package_id": evidence_id,
        "evidence_package_id": evidence_id,
        "package_status": "IMMUTABLE",
        "bound_snapshot_id": snapshot_id,
        "registry_version": "e2e-test-v1",
        "methodology_version": "canonical-method-v1",
        "evidence_lineage_version": "lineage-v1",
        "evidence_records": [sold, liquidity],
        "claims": [
            {
                "claim_id": "claim-camera-current-sold",
                "claim_type": "SOLD_TRANSACTION",
                "temporality": "CURRENT_MARKET",
                "rights_state": "ALLOW",
                "claim_strength": 0.9,
                "evidence_refs": [sold["evidence_id"]],
                "current_market_evidence_present": True,
                "listing_only": False,
            }
        ],
        "unresolved_critical_contradiction_count": 0,
        "unknown_or_denied_claim_input_count": 0,
        "publication_authorized": False,
        "production_authorized": False,
    }
    snapshot = {
        "snapshot_id": snapshot_id,
        "snapshot_status": "DRAFT_CANDIDATE",
        "bound_evidence_package_id": evidence_id,
        "registry_version": "e2e-test-v1",
        "methodology_version": "canonical-method-v1",
        "evidence_lineage_version": "lineage-v1",
        "as_of": "2026-08-30T02:00:00.000Z",
        "publication_eligible": False,
        "production_authorized": False,
    }
    return snapshot, evidence


def ready_handoff(snapshot: dict[str, Any], evidence: dict[str, Any]) -> dict[str, Any]:
    return {
        "handoff_state": "READY_FOR_TRACK_B",
        "handoff_semantics": "TRACK_B_SUBMISSION_ELIGIBILITY_ONLY",
        "blocker_count": 0,
        "blockers": [],
        "pair_digest": assessor.digest_json({"snapshot": snapshot, "evidence": evidence}),
        "snapshot_id": snapshot["snapshot_id"],
        "evidence_package_id": evidence["package_id"],
        "computed_entity_resolution_gates": {
            "canonical_approved_strata_set_complete": True,
            "empirical_attestation_verified": True,
            "empirical_sample_floors_pass": True,
            "empirical_metric_gates_pass": True,
            "current_market_evidence_present": True,
            "total_cases": 480,
            "blind_holdout_cases": 120,
            "overall_accuracy": 0.995,
            "blind_accuracy": 0.992,
        },
    }


snapshot, evidence = fixture_pair()
handoff = ready_handoff(snapshot, evidence)
envelope = assessor.build_assessment_envelope(
    snapshot,
    evidence,
    handoff,
    generated_at=snapshot["as_of"],
    candidate_reference="TEST_ONLY/snapshot-candidate.json",
    evidence_reference="TEST_ONLY/evidence-package.json",
    handoff_reference="TEST_ONLY/handoff-r2.json",
)
replay = replay_builder.build_replay_receipt(snapshot, evidence, envelope)
assessment = envelope["assessment"]
check(assessment["recommendation"] == "PUBLISHABLE_INTERNAL", "official Track B recommendation mismatch")
check(assessment["overall_rankability"] is True, "official Track B did not establish internal rankability")
check(assessment["publication_eligible"] is False and assessment["production_eligible"] is False, "Track B preauthorized release")
check(replay["workload_result"] == "PASS" and replay["projection_ready"] is True, "staging replay did not pass")
check(replay["public_touch"] is False and replay["production_touch"] is False and replay["g5"] == "HOLD", "staging replay boundary changed")

expect_rejection(
    "synthetic-assessment",
    lambda: assessor.build_assessment_envelope(snapshot, evidence, handoff, generated_at=snapshot["as_of"], candidate_reference="x", evidence_reference="y", handoff_reference="z", synthetic=True),
    "NON_PROMOTABLE_INPUT_REJECTED",
)
bad_handoff = copy.deepcopy(handoff)
bad_handoff["pair_digest"] = "sha256:" + "0" * 64
expect_rejection(
    "assessment-pair-rebind",
    lambda: assessor.build_assessment_envelope(snapshot, evidence, bad_handoff, generated_at=snapshot["as_of"], candidate_reference="x", evidence_reference="y", handoff_reference="z"),
    "HANDOFF_PAIR_DIGEST_MISMATCH",
)
bad_handoff = copy.deepcopy(handoff)
bad_handoff["computed_entity_resolution_gates"]["empirical_attestation_verified"] = False
expect_rejection(
    "unapproved-empirical-attestation",
    lambda: assessor.build_assessment_envelope(snapshot, evidence, bad_handoff, generated_at=snapshot["as_of"], candidate_reference="x", evidence_reference="y", handoff_reference="z"),
    "TRACK_B_GATE_NOT_VERIFIED:empirical_attestation_verified",
)
bad_evidence = copy.deepcopy(evidence)
bad_evidence["production_authorized"] = True
bad_handoff = ready_handoff(snapshot, bad_evidence)
expect_rejection(
    "evidence-production-preauth",
    lambda: assessor.build_assessment_envelope(snapshot, bad_evidence, bad_handoff, generated_at=snapshot["as_of"], candidate_reference="x", evidence_reference="y", handoff_reference="z"),
    "EVIDENCE_PRODUCTION_PREAUTH_FORBIDDEN",
)
bad_evidence = copy.deepcopy(evidence)
bad_evidence["evidence_records"][0]["market_observation_type"] = "LISTING"
bad_handoff = ready_handoff(snapshot, bad_evidence)
expect_rejection(
    "listing-not-sold",
    lambda: assessor.build_assessment_envelope(snapshot, bad_evidence, bad_handoff, generated_at=snapshot["as_of"], candidate_reference="x", evidence_reference="y", handoff_reference="z"),
    "TRACK_B_CURRENT_SOLD_EVIDENCE_MISSING",
)

conditional_snapshot, conditional_evidence = fixture_pair("ethereum-erc721-0x387c-token-5198")
conditional_evidence["evidence_records"] = [conditional_evidence["evidence_records"][0]]
conditional_evidence["evidence_records"][0]["market_observation_type"] = "ORDER_FULFILLED"
conditional_evidence["evidence_records"][0]["rights_state"] = "CONDITIONAL"
conditional_evidence["evidence_records"][0]["sold_claim"] = False
conditional_evidence["claims"][0].update({
    "claim_type": "ONCHAIN_PAID_FULFILLMENT_FACT",
    "rights_state": "CONDITIONAL",
    "sold_claim": False,
})
conditional_handoff = {
    "handoff_state": "BLOCKED",
    "handoff_semantics": "TRACK_B_SUBMISSION_ELIGIBILITY_ONLY",
    "blocker_count": 2,
    "blockers": ["CURRENT_SOLD_EVIDENCE_MISSING", "RIGHTS_NOT_ALLOW"],
    "pair_digest": assessor.digest_json({"snapshot": conditional_snapshot, "evidence": conditional_evidence}),
    "snapshot_id": conditional_snapshot["snapshot_id"],
    "evidence_package_id": conditional_evidence["package_id"],
}
conditional_envelope = assessor.build_hold_assessment_envelope(
    conditional_snapshot,
    conditional_evidence,
    conditional_handoff,
    generated_at=conditional_snapshot["as_of"],
    candidate_reference="TEST_ONLY/seaport-snapshot-candidate.json",
    evidence_reference="TEST_ONLY/seaport-evidence-package.json",
    handoff_reference="TEST_ONLY/seaport-handoff-r2.json",
)
check(conditional_envelope["assessment"]["assessment_status"] == "COMPLETED", "Track B HOLD assessment was not completed")
check(conditional_envelope["assessment"]["recommendation"] == "CONDITIONAL", "Track B HOLD recommendation mismatch")
check(conditional_envelope["assessment"]["overall_rankability"] is False, "conditional event was promoted")
check(conditional_envelope["assessment"]["quantitative_summary"]["admitted_current_sold_count"] == 0, "ORDER_FULFILLED was relabeled SOLD")
check(conditional_envelope["assessment"]["test_results"]["sold_claim"] == "FALSE", "sold_claim ceiling was lost")
expect_rejection(
    "conditional-replay-forbidden",
    lambda: replay_builder.build_replay_receipt(conditional_snapshot, conditional_evidence, conditional_envelope),
    "ASSESSMENT_NOT_RANKABLE",
)

bad_envelope = copy.deepcopy(envelope)
bad_envelope["assessment"]["overall_rankability"] = False
expect_rejection(
    "replay-before-track-b-pass",
    lambda: replay_builder.build_replay_receipt(snapshot, evidence, bad_envelope),
    "ASSESSMENT_NOT_RANKABLE",
)
multi_evidence = copy.deepcopy(evidence)
other = copy.deepcopy(multi_evidence["evidence_records"][0])
other["evidence_id"] = "evidence-other-object"
other["canonical_object_id"] = "object-other"
other["asset_identity_id"] = "object-other"
multi_evidence["evidence_records"].append(other)
multi_handoff = ready_handoff(snapshot, multi_evidence)
multi_envelope = assessor.build_assessment_envelope(snapshot, multi_evidence, multi_handoff, generated_at=snapshot["as_of"], candidate_reference="x", evidence_reference="y", handoff_reference="z")
expect_rejection(
    "ambiguous-object-selection",
    lambda: replay_builder.build_replay_receipt(snapshot, multi_evidence, multi_envelope),
    "CANONICAL_OBJECT_SELECTION_REQUIRED",
)

with tempfile.TemporaryDirectory(prefix="exact-pair-chain-", dir=ROOT / "artifacts") as temporary:
    directory = Path(temporary)
    paths = {
        "candidate": directory / "snapshot-candidate.json",
        "evidence": directory / "evidence-package.json",
        "assessment": directory / "live-rankability-assessment-envelope.json",
        "replay": directory / "staging-replay-receipt.json",
        "projection": directory / "approved-internal-object-projection.json",
        "admission": directory / "projection-admission-receipt.json",
    }
    for key, value in [
        ("candidate", snapshot),
        ("evidence", evidence),
        ("assessment", envelope),
        ("replay", replay),
    ]:
        paths[key].write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    command = [
        "node",
        str(PRODUCER_PATH),
        *[str(paths[key].relative_to(ROOT)) for key in ["candidate", "evidence", "assessment", "replay", "projection", "admission"]],
    ]
    process = subprocess.run(command, cwd=ROOT, text=True, capture_output=True, check=False)
    check(process.returncode == 0, f"canonical Projection producer failed: {process.stderr or process.stdout}")
    if process.returncode == 0:
        projection = json.loads(paths["projection"].read_text(encoding="utf-8"))
        admission = json.loads(paths["admission"].read_text(encoding="utf-8"))
        actions = {action["action_id"]: action for action in projection["actions"]}
        check(projection["product_type"] == "OBJECT_PASSPORT", "Projection product type mismatch")
        check(projection["projection_state"] == "APPROVED_INTERNAL" and projection["display_eligibility"] == "INTERNAL_ONLY", "Projection release state mismatch")
        check(projection["payload"]["canonical_object_id"] == replay["canonical_object_id"], "Projection object identity dropped")
        check(projection["payload"]["fields"]["evidence"]["value"] == replay["evidence_record_ids"], "Projection evidence identity dropped")
        for action_id in ["COMPARE", "WATCHLIST"]:
            check(actions[action_id]["state"] == "ENABLED" and actions[action_id]["destination"].startswith("/portal/"), f"{action_id} action unavailable")
        check(admission["fixture"] is False and admission["synthetic"] is False and admission["promotable"] is True, "Projection admission is fixture/promotability ambiguous")
        check(admission["public"] is False and admission["production"] is False and admission["g5"] == "HOLD", "Projection admission release boundary changed")

        # Full bounded E2E: producer bytes -> signed server mapper -> browser
        # envelope admission -> Dossier action model.  The test Projection
        # remains temporary and never enters a live manifest or public asset.
        portal_e2e = r"""
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {authorizeProjection,toPortalView} from './apps/kidults-enterprise-staging/projection-capability-v1.mjs';
import {readPortalProjection} from './apps/kidults-enterprise-staging/public/portal-r001/projection-store.js';
import {objectIntelligenceModel} from './apps/kidults-enterprise-staging/public/portal-r001/object-intelligence.js';
const projection=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));
const objectId=process.argv[2];
const now=new Date(projection.generated_at);
const secret='exact-pair-product-chain-e2e-secret-at-least-32-bytes';
const authorized=authorizeProjection({projection,surface:'PORTAL_RENDER',secret,now});
const envelope={ok:true,capability_expires_at:authorized.claims.expires_at,revalidate_after_ms:5000,
  consumption_receipt:authorized.admission.receipt,portal_view:toPortalView(projection,authorized.admission.receipt)};
const previous=globalThis.fetch;
globalThis.fetch=async()=>new Response(JSON.stringify(envelope),{status:200,headers:{'content-type':'application/json'}});
try{
  const portal=await readPortalProjection();
  const model=objectIntelligenceModel(portal,{objectId});
  assert.equal(portal.projection.state,'LIVE_APPROVED');
  assert.equal(portal.objects[0].canonical_object_id,objectId);
  assert.ok(portal.evidence.length>0);
  assert.ok(portal.signals.length>0);
  assert.deepEqual(model.actions.map(action=>action.action_id),['COMPARE','WATCHLIST']);
  assert.ok(model.actions.every(action=>action.state==='ENABLED'&&action.destination.startsWith('/portal/')));
  console.log(JSON.stringify({result:'PASS',canonical_object_id:objectId,actions:model.actions.map(action=>action.action_id)}));
}finally{globalThis.fetch=previous}
"""
        portal_process = subprocess.run(
            ["node", "--input-type=module", "-e", portal_e2e, str(paths["projection"]), replay["canonical_object_id"]],
            cwd=ROOT,
            text=True,
            capture_output=True,
            check=False,
        )
        check(portal_process.returncode == 0, f"producer-to-Portal E2E failed: {portal_process.stderr or portal_process.stdout}")

    negative_inputs = [
        (
            "projection-replay-public-touch",
            "REPLAY_BOUNDARY_VIOLATION",
            lambda: {**replay, "public_touch": True},
            envelope,
            "2026-08-30T02:00:00.000Z",
        ),
        (
            "projection-assessment-rebind",
            "ASSESSMENT_PAIR_BINDING_MISMATCH",
            lambda: replay,
            {**envelope, "correlation_id": "sha256:" + "f" * 64},
            "2026-08-30T02:00:00.000Z",
        ),
        (
            "projection-expired-freshness",
            "PROJECTION_GENERATION_OUTSIDE_FRESHNESS_WINDOW",
            lambda: replay,
            envelope,
            "2026-09-21T02:00:00.000Z",
        ),
    ]
    for index, (label, expected, replay_factory, envelope_value, generated_at) in enumerate(negative_inputs, start=1):
        negative_count += 1
        negative_assessment = directory / f"negative-assessment-{index}.json"
        negative_replay = directory / f"negative-replay-{index}.json"
        negative_projection = directory / f"negative-projection-{index}.json"
        negative_admission = directory / f"negative-admission-{index}.json"
        negative_assessment.write_text(json.dumps(envelope_value), encoding="utf-8")
        negative_replay.write_text(json.dumps(replay_factory()), encoding="utf-8")
        negative_command = [
            "node",
            str(PRODUCER_PATH),
            str(paths["candidate"].relative_to(ROOT)),
            str(paths["evidence"].relative_to(ROOT)),
            str(negative_assessment.relative_to(ROOT)),
            str(negative_replay.relative_to(ROOT)),
            str(negative_projection.relative_to(ROOT)),
            str(negative_admission.relative_to(ROOT)),
        ]
        environment = dict(os.environ)
        environment["KIDULTS_PROJECTION_GENERATED_AT"] = generated_at
        rejected = subprocess.run(negative_command, cwd=ROOT, env=environment, text=True, capture_output=True, check=False)
        check(rejected.returncode != 0 and expected in f"{rejected.stdout}\n{rejected.stderr}", f"{label}: expected {expected}")

# The live CLI must run the real canonical handoff and reject the repository's
# historical structural fixture.  This demonstrates that the pure positive
# test builder is not reachable as a fixture bypass in the production entry
# point.
with tempfile.TemporaryDirectory(prefix="official-track-b-live-cli-", dir=ROOT / "artifacts") as temporary:
    negative_count += 1
    directory = Path(temporary)
    historical = ROOT / "coordination/kidults/candidates/candidate-structural-20260816-r1"
    live_cli = subprocess.run([
        sys.executable,
        str(ASSESSOR_PATH),
        str((historical / "snapshot-candidate.json").relative_to(ROOT)),
        str((historical / "evidence-package.json").relative_to(ROOT)),
        str((directory / "assessment.json").relative_to(ROOT)),
        str((directory / "handoff.json").relative_to(ROOT)),
    ], cwd=ROOT, text=True, capture_output=True, check=False)
    check(live_cli.returncode != 0, "live official Track B CLI accepted the historical structural fixture")
    check(not (directory / "assessment.json").exists(), "identity-invalid historical fixture emitted an assessment")
    if (directory / "handoff.json").exists():
        handoff_state = json.loads((directory / "handoff.json").read_text(encoding="utf-8"))
        check(handoff_state.get("handoff_state") == "BLOCKED", "historical live CLI handoff did not remain BLOCKED")

if errors:
    print(json.dumps({
        "suite": "KIDULTS_EXACT_PAIR_PRODUCT_CHAIN_VALIDATION_V1",
        "result": "FAIL",
        "errors": errors,
        "negative_tests": negative_count,
    }, indent=2))
    raise SystemExit(1)

print(json.dumps({
    "suite": "KIDULTS_EXACT_PAIR_PRODUCT_CHAIN_VALIDATION_V1",
    "result": "PASS",
    "official_track_b": "GENERIC_EXACT_PAIR_BOUND",
    "staging_replay": "PASS",
    "projection_producer": "NONFIXTURE_OBJECT_PASSPORT",
    "producer_to_signed_server_browser_dossier": "PASS",
    "negative_tests": negative_count,
    "enabled_actions": ["COMPARE", "WATCHLIST"],
    "no_live_fixture_bypass": True,
    "public": "HOLD",
    "production": "HOLD",
    "g5": "HOLD",
}, indent=2))
