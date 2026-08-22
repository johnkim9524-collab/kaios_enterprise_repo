import copy
import json
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[2]
SCHEMA_PATH = ROOT / "coordination/kidults/schemas/kidults-proof-product-projection-v1.schema.json"


def load_schema():
    return json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))


def verified_field(field_id, value="example"):
    return {
        "field_id": field_id,
        "state": "VERIFIED",
        "value": value,
        "evidence_references": [f"evidence:{field_id}"],
        "rights_state": "CLEARED",
        "freshness_state": "CURRENT",
        "confidence_classification": "HIGH",
        "limitations": [],
    }


def market_payload():
    collector = [
        "what_changed",
        "why_it_matters",
        "comparable_context",
        "liquidity",
        "risk",
        "possible_action",
    ]
    institutional = [
        "universe",
        "coverage",
        "market_scale",
        "depth",
        "turnover",
        "concentration",
        "exposure",
        "confidence",
    ]
    return {
        "axes": [{"axis_id": "time", "label": "Observation period", "unit": "date"}],
        "filters": ["PERIOD", "CURRENCY", "GEOGRAPHY", "VENUE", "VERTICAL"],
        "collector_lens": {name: verified_field(name) for name in collector},
        "institutional_lens": {name: verified_field(name) for name in institutional},
    }


def approved_public_market_projection():
    return {
        "record_type": "kidults_proof_product_projection",
        "contract_version": "1.0.0",
        "projection_id": "projection-market-approved-public-v1",
        "product_type": "MARKET_PROJECTION_API",
        "projection_state": "APPROVED_PUBLIC",
        "display_eligibility": "PUBLIC_ALLOWED",
        "scope": {
            "verticals": ["COLLECTIBLES"],
            "period": {"start": "2026-08-01T00:00:00Z", "end": "2026-08-22T00:00:00Z"},
            "geographies": ["GLOBAL"],
            "venues": ["EXAMPLE"],
            "currencies": ["USD"],
        },
        "method_version": "method-v1",
        "lineage": {
            "snapshot_id": "snapshot-v1",
            "evidence_package_id": "evidence-package-v1",
            "assessment_id": "assessment-v1",
            "previous_projection_id": None,
        },
        "evidence_summary": {
            "state": "PAIRED",
            "source_count": 2,
            "independent_source_family_count": 2,
            "evidence_references": ["evidence:1", "evidence:2"],
        },
        "rights": {
            "state": "CLEARED",
            "internal_analysis": "ALLOWED",
            "public_display": "ALLOWED",
            "api_redistribution": "ALLOWED",
            "profile_id": "rights-profile-v1",
        },
        "freshness": {
            "state": "CURRENT",
            "observed_at": "2026-08-22T00:00:00Z",
            "valid_until": "2026-08-23T00:00:00Z",
        },
        "confidence": {
            "state": "ASSESSED",
            "classification": "HIGH",
            "value": 0.95,
            "method_version": "confidence-v1",
        },
        "rankability": {
            "state": "RANKABLE",
            "assessment_id": "assessment-v1",
            "reasons": ["Track B PASS fixture"],
        },
        "limitations": [],
        "missing_data": [],
        "actions": [
            {
                "action_id": "OPEN_PROVENANCE",
                "state": "ENABLED",
                "destination": "/governance/projections/projection-market-approved-public-v1",
                "reason": "",
            }
        ],
        "audit": {
            "governance_record_uri": "/governance",
            "projection_record_uri": "/governance/projections/projection-market-approved-public-v1",
            "events": [],
        },
        "payload": market_payload(),
        "generated_at": "2026-08-22T00:00:00Z",
        "updated_at": "2026-08-22T00:00:00Z",
    }


def validator():
    jsonschema = pytest.importorskip("jsonschema")
    return jsonschema.Draft202012Validator(load_schema())


def assert_rejected(mutator):
    candidate = approved_public_market_projection()
    mutator(candidate)
    with pytest.raises(Exception):
        validator().validate(candidate)


def test_approved_public_baseline_is_semantically_closed_and_valid():
    validator().validate(approved_public_market_projection())


@pytest.mark.parametrize(
    "mutator",
    [
        lambda p: p["evidence_summary"].update(state="NOT_PAIRED"),
        lambda p: p["evidence_summary"].update(evidence_references=[]),
        lambda p: p["rankability"].update(state="PENDING", assessment_id=None),
        lambda p: p["confidence"].update(state="NOT_ASSESSED", classification="NOT_ASSESSED", value=None, method_version=None),
        lambda p: p["freshness"].update(state="STALE"),
        lambda p: p["rights"].update(public_display="BLOCKED"),
        lambda p: p["rights"].update(api_redistribution="BLOCKED"),
        lambda p: p["rights"].update(profile_id=None),
        lambda p: p["lineage"].pop("assessment_id"),
    ],
)
def test_approved_public_contradictions_fail_closed(mutator):
    assert_rejected(mutator)


def test_public_allowed_cannot_exist_outside_approved_public():
    candidate = approved_public_market_projection()
    candidate["projection_state"] = "AWAITING_APPROVED_PROJECTION"
    with pytest.raises(Exception):
        validator().validate(candidate)


@pytest.mark.parametrize(
    "mutation",
    [
        {"rights_state": "BLOCKED"},
        {"freshness_state": "STALE"},
        {"confidence_classification": "NOT_ASSESSED"},
    ],
)
def test_value_bearing_fields_require_cleared_current_assessed_state(mutation):
    jsonschema = pytest.importorskip("jsonschema")
    field_schema = load_schema()["$defs"]["field"]
    candidate = verified_field("liquidity", 1.0)
    candidate.update(mutation)
    with pytest.raises(jsonschema.ValidationError):
        jsonschema.Draft202012Validator(field_schema).validate(candidate)


def test_rights_blocked_field_must_report_blocked_rights():
    jsonschema = pytest.importorskip("jsonschema")
    field_schema = load_schema()["$defs"]["field"]
    candidate = {
        "field_id": "liquidity",
        "state": "RIGHTS_BLOCKED",
        "evidence_references": [],
        "rights_state": "CLEARED",
        "freshness_state": "CURRENT",
        "confidence_classification": "NOT_ASSESSED",
        "reason": "Rights unavailable",
        "opening_conditions": ["Rights clearance"],
        "limitations": [],
    }
    with pytest.raises(jsonschema.ValidationError):
        jsonschema.Draft202012Validator(field_schema).validate(candidate)


def test_stale_field_must_report_stale_freshness():
    jsonschema = pytest.importorskip("jsonschema")
    field_schema = load_schema()["$defs"]["field"]
    candidate = {
        "field_id": "liquidity",
        "state": "STALE",
        "evidence_references": [],
        "rights_state": "CLEARED",
        "freshness_state": "CURRENT",
        "confidence_classification": "NOT_ASSESSED",
        "reason": "Observation expired",
        "opening_conditions": ["Fresh observation"],
        "limitations": [],
    }
    with pytest.raises(jsonschema.ValidationError):
        jsonschema.Draft202012Validator(field_schema).validate(candidate)
