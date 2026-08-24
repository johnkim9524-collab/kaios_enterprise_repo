import json
from pathlib import Path

import jsonschema
import pytest


ROOT = Path(__file__).resolve().parents[2]
SCHEMA_PATH = ROOT / "coordination/kidults/schemas/kidults-proof-product-projection-v1.schema.json"
CONTRACT_PATH = ROOT / "coordination/kidults/product/kidults-proof-product-data-contract-v1.json"


def load(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def closed_field(field_id):
    return {
        "field_id": field_id,
        "state": "UNAVAILABLE",
        "evidence_references": [],
        "rights_state": "UNKNOWN",
        "freshness_state": "UNKNOWN",
        "confidence_classification": "NOT_ASSESSED",
        "reason": "Evidence not paired",
        "opening_conditions": ["Approved Evidence Package and Track B assessment"],
        "limitations": ["No live approved Projection"],
    }


def envelope(product_type, payload):
    return {
        "record_type": "kidults_proof_product_projection",
        "contract_version": "1.0.0",
        "projection_id": f"closed-{product_type.lower()}-v1",
        "product_type": product_type,
        "projection_state": "AWAITING_APPROVED_PROJECTION",
        "display_eligibility": "STATE_ONLY",
        "scope": {
            "verticals": [],
            "period": {"start": None, "end": None},
            "geographies": [],
            "venues": [],
            "currencies": [],
        },
        "method_version": "method-not-approved",
        "lineage": {"previous_projection_id": None},
        "evidence_summary": {
            "state": "NOT_PAIRED",
            "source_count": None,
            "independent_source_family_count": None,
            "evidence_references": [],
        },
        "rights": {
            "state": "UNKNOWN",
            "internal_analysis": "UNKNOWN",
            "public_display": "UNKNOWN",
            "api_redistribution": "UNKNOWN",
            "profile_id": None,
        },
        "freshness": {"state": "UNKNOWN", "observed_at": None, "valid_until": None},
        "confidence": {
            "state": "NOT_ASSESSED",
            "classification": "NOT_ASSESSED",
            "value": None,
            "method_version": None,
        },
        "rankability": {"state": "PENDING", "assessment_id": None, "reasons": ["Track B not started"]},
        "limitations": ["No live approved Projection"],
        "missing_data": [
            {
                "field_id": "projection",
                "reason": "Evidence not paired",
                "opening_conditions": ["Immutable Candidate/Evidence pair and Track B assessment"],
                "treatment": "PRESERVE_MISSING_NEVER_ZERO",
            }
        ],
        "actions": [
            {
                "action_id": "VIEW_GOVERNANCE",
                "state": "ENABLED",
                "destination": "/governance",
                "reason": "",
            },
            {
                "action_id": "EXPORT",
                "state": "DISABLED",
                "destination": None,
                "reason": "Approved Projection and export rights required",
            },
        ],
        "audit": {
            "governance_record_uri": "/governance",
            "projection_record_uri": f"/governance/projections/closed-{product_type.lower()}-v1",
            "events": [],
        },
        "payload": payload,
        "generated_at": "2026-08-22T00:00:00Z",
        "updated_at": "2026-08-22T00:00:00Z",
    }


def test_contract_and_schema_are_parseable_and_bound():
    schema = load(SCHEMA_PATH)
    contract = load(CONTRACT_PATH)

    assert schema["$schema"] == "https://json-schema.org/draft/2020-12/schema"
    assert contract["schema"] == "../schemas/kidults-proof-product-projection-v1.schema.json"
    assert contract["projection_only"] is True
    assert contract["public_claims_authorized"] is False
    assert contract["production"] == "HOLD"
    assert set(contract["products"]) == {
        "OBJECT_PASSPORT",
        "MARKET_PROJECTION_API",
        "KIDULT_100_INDEX",
    }


def test_closed_field_forbids_a_value_and_requires_opening_explanation():
    field_schema = load(SCHEMA_PATH)["$defs"]["field"]
    closed = closed_field("liquidity")
    jsonschema.Draft202012Validator(field_schema).validate(closed)

    fabricated = {**closed, "value": 0}
    with pytest.raises(jsonschema.ValidationError):
        jsonschema.Draft202012Validator(field_schema).validate(fabricated)


def test_verified_field_requires_evidence_reference():
    field_schema = load(SCHEMA_PATH)["$defs"]["field"]
    unbound = {
        "field_id": "identity",
        "state": "VERIFIED",
        "value": "example",
        "evidence_references": [],
        "rights_state": "CLEARED",
        "freshness_state": "CURRENT",
        "confidence_classification": "HIGH",
        "limitations": [],
    }
    with pytest.raises(jsonschema.ValidationError):
        jsonschema.Draft202012Validator(field_schema).validate(unbound)


def test_all_three_closed_state_payloads_validate_without_fabricated_values():
    schema = load(SCHEMA_PATH)
    validator = jsonschema.Draft202012Validator(schema)

    passport_fields = {
        name: closed_field(name)
        for name in load(CONTRACT_PATH)["products"]["OBJECT_PASSPORT"]["required_fields"]
    }
    passport = envelope(
        "OBJECT_PASSPORT",
        {"canonical_object_id": "object-example", "fields": passport_fields},
    )

    market = envelope(
        "MARKET_PROJECTION_API",
        {
            "axes": [{"axis_id": "time", "label": "Observation period", "unit": "date"}],
            "filters": ["PERIOD", "CURRENCY", "GEOGRAPHY", "VENUE", "VERTICAL"],
            "collector_lens": {
                name: closed_field(name)
                for name in load(CONTRACT_PATH)["products"]["MARKET_PROJECTION_API"]["collector_lens"]
            },
            "institutional_lens": {
                name: closed_field(name)
                for name in load(CONTRACT_PATH)["products"]["MARKET_PROJECTION_API"]["institutional_lens"]
            },
        },
    )

    methodology = {
        name: closed_field(name)
        for name in load(CONTRACT_PATH)["products"]["KIDULT_100_INDEX"]["required_methodology"]
    }
    kidult_100 = envelope(
        "KIDULT_100_INDEX",
        {
            "methodology": methodology,
            "index_level": closed_field("index_level"),
            "constituents": closed_field("constituents"),
        },
    )

    for projection in (passport, market, kidult_100):
        validator.validate(projection)


def test_product_required_fields_match_positioning_contract():
    contract = load(CONTRACT_PATH)
    assert len(contract["products"]["OBJECT_PASSPORT"]["required_fields"]) == 17
    assert contract["products"]["MARKET_PROJECTION_API"]["collector_lens"] == [
        "what_changed",
        "why_it_matters",
        "comparable_context",
        "liquidity",
        "risk",
        "possible_action",
    ]
    assert len(contract["products"]["KIDULT_100_INDEX"]["required_methodology"]) == 14
