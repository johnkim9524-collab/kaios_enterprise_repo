import copy
import importlib.util
import json
from datetime import datetime, timezone
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[2]
VALIDATOR_PATH = ROOT / "scripts/kidults/portal/proof_product_projection_semantics_v1.py"
PORTAL_CONTRACT_PATH = ROOT / "coordination/kidults/portal/portal-semantic-product-consumer-contract-v1.json"


def load_validator_module():
    spec = importlib.util.spec_from_file_location("proof_product_projection_semantics_v1", VALIDATOR_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def approved_projection():
    return {
        "projection_state": "APPROVED_PUBLIC",
        "lineage": {"assessment_id": "assessment-v1"},
        "rankability": {"state": "RANKABLE", "assessment_id": "assessment-v1"},
        "rights": {
            "state": "CLEARED",
            "internal_analysis": "ALLOWED",
            "public_display": "ALLOWED",
            "api_redistribution": "ALLOWED",
        },
        "freshness": {
            "state": "CURRENT",
            "observed_at": "2026-08-22T10:00:00Z",
            "valid_until": "2026-08-22T12:00:00Z",
        },
        "generated_at": "2026-08-22T10:00:00Z",
        "updated_at": "2026-08-22T10:05:00Z",
    }


def closed_projection():
    return {
        "projection_state": "AWAITING_APPROVED_PROJECTION",
        "lineage": {},
        "rankability": {"state": "PENDING", "assessment_id": None},
        "rights": {
            "state": "UNKNOWN",
            "internal_analysis": "UNKNOWN",
            "public_display": "UNKNOWN",
            "api_redistribution": "UNKNOWN",
        },
        "freshness": {"state": "UNKNOWN", "observed_at": None, "valid_until": None},
        "generated_at": "2026-08-22T10:00:00Z",
        "updated_at": "2026-08-22T10:05:00Z",
    }


def validate(candidate, *, purpose="PUBLIC_DISPLAY", trusted_now="2026-08-22T11:00:00Z"):
    module = load_validator_module()
    now = datetime.fromisoformat(trusted_now.replace("Z", "+00:00")).astimezone(timezone.utc)
    module.validate_projection_semantics(candidate, trusted_now=now, consumer_purpose=purpose)


def test_portal_contract_requires_semantic_gate_and_trusted_clock():
    contract = json.loads(PORTAL_CONTRACT_PATH.read_text(encoding="utf-8"))
    binding = contract["proof_product_binding"]
    assert binding["schema_only_validation_sufficient"] is False
    assert binding["semantic_validator"] == "../../../scripts/kidults/portal/proof_product_projection_semantics_v1.py"
    assert binding["trusted_clock_required"] is True
    assert set(binding["semantic_validation_required_at"]) == {
        "PORTAL_RENDER",
        "PUBLIC_API_RESPONSE",
        "EXPORT",
    }


def test_valid_projection_passes_semantic_gate():
    validate(approved_projection())


def test_closed_projection_with_unknown_freshness_remains_renderable_as_state_only():
    validate(closed_projection())


@pytest.mark.parametrize(
    "mutator,purpose,trusted_now",
    [
        (lambda p: p["rankability"].update(assessment_id="assessment-other"), "PUBLIC_DISPLAY", "2026-08-22T11:00:00Z"),
        (lambda p: p["freshness"].update(valid_until="2026-08-22T10:59:59Z"), "PUBLIC_DISPLAY", "2026-08-22T11:00:00Z"),
        (lambda p: p["freshness"].update(observed_at="2026-08-22T11:30:00Z"), "PUBLIC_DISPLAY", "2026-08-22T11:00:00Z"),
        (lambda p: p["freshness"].update(observed_at="2026-08-22T12:01:00Z", valid_until="2026-08-22T12:00:00Z"), "PUBLIC_DISPLAY", "2026-08-22T11:00:00Z"),
        (lambda p: p["rights"].update(state="BLOCKED"), "PUBLIC_DISPLAY", "2026-08-22T11:00:00Z"),
        (lambda p: p["rights"].update(public_display="BLOCKED", state="PARTIAL"), "PUBLIC_DISPLAY", "2026-08-22T11:00:00Z"),
        (lambda p: p["rights"].update(api_redistribution="BLOCKED", state="PARTIAL"), "API_REDISTRIBUTION", "2026-08-22T11:00:00Z"),
        (lambda p: p.update(updated_at="2026-08-22T11:30:00Z"), "PUBLIC_DISPLAY", "2026-08-22T11:00:00Z"),
        (lambda p: p.update(generated_at="2026-08-22T10:30:00Z", updated_at="2026-08-22T10:05:00Z"), "PUBLIC_DISPLAY", "2026-08-22T11:00:00Z"),
    ],
)
def test_semantic_rebound_and_time_mutations_fail_closed(mutator, purpose, trusted_now):
    candidate = copy.deepcopy(approved_projection())
    mutator(candidate)
    with pytest.raises(ValueError):
        validate(candidate, purpose=purpose, trusted_now=trusted_now)
