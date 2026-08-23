#!/usr/bin/env python3
"""Fail-closed semantic validation for KIDULTS proof-product Projections.

JSON Schema provides structural validation. This module enforces invariants that
require cross-field identity comparison or a trusted consumer clock.
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


APPROVED_STATES = {"APPROVED_INTERNAL", "APPROVED_PUBLIC"}
PURPOSE_TO_RIGHT = {
    "INTERNAL_ANALYSIS": "internal_analysis",
    "PUBLIC_DISPLAY": "public_display",
    "API_REDISTRIBUTION": "api_redistribution",
}


def _parse_time(value: Any, field: str) -> datetime:
    if not isinstance(value, str) or not value:
        raise ValueError(f"{field} must be a non-empty date-time")
    candidate = value[:-1] + "+00:00" if value.endswith("Z") else value
    try:
        parsed = datetime.fromisoformat(candidate)
    except ValueError as exc:
        raise ValueError(f"{field} must be ISO-8601 date-time") from exc
    if parsed.tzinfo is None:
        raise ValueError(f"{field} must include a timezone")
    return parsed.astimezone(timezone.utc)


def _expected_rights_summary(rights: dict[str, Any]) -> str:
    decisions = [rights.get(name) for name in ("internal_analysis", "public_display", "api_redistribution")]
    if any(value not in {"ALLOWED", "BLOCKED", "UNKNOWN"} for value in decisions):
        raise ValueError("rights purpose decision invalid")
    if all(value == "ALLOWED" for value in decisions):
        return "CLEARED"
    if any(value == "ALLOWED" for value in decisions):
        return "PARTIAL"
    if all(value == "BLOCKED" for value in decisions):
        return "BLOCKED"
    return "UNKNOWN"


def validate_projection_semantics(
    projection: dict[str, Any],
    *,
    trusted_now: datetime,
    consumer_purpose: str,
) -> None:
    if trusted_now.tzinfo is None:
        raise ValueError("trusted_now must be timezone-aware")
    trusted_now = trusted_now.astimezone(timezone.utc)

    if consumer_purpose not in PURPOSE_TO_RIGHT:
        raise ValueError(f"unsupported consumer purpose: {consumer_purpose}")

    projection_state = projection.get("projection_state")
    lineage = projection.get("lineage") or {}
    rankability = projection.get("rankability") or {}
    rights = projection.get("rights") or {}
    freshness = projection.get("freshness") or {}

    expected_summary = _expected_rights_summary(rights)
    if rights.get("state") != expected_summary:
        raise ValueError(
            f"rights.state={rights.get('state')} contradicts purpose decisions; expected {expected_summary}"
        )

    requested_right = PURPOSE_TO_RIGHT[consumer_purpose]
    if projection_state in APPROVED_STATES and rights.get(requested_right) != "ALLOWED":
        raise ValueError(f"approved Projection lacks {consumer_purpose} right")

    if projection_state in APPROVED_STATES:
        lineage_assessment = lineage.get("assessment_id")
        rankability_assessment = rankability.get("assessment_id")
        if not lineage_assessment or lineage_assessment != rankability_assessment:
            raise ValueError("approved Projection assessment identity rebound/mismatch")

    freshness_state = freshness.get("state")
    observed_raw = freshness.get("observed_at")
    valid_until_raw = freshness.get("valid_until")
    if freshness_state == "CURRENT":
        observed_at = _parse_time(observed_raw, "freshness.observed_at")
        valid_until = _parse_time(valid_until_raw, "freshness.valid_until")
        if observed_at > valid_until:
            raise ValueError("freshness observation occurs after validity end")
        if observed_at > trusted_now:
            raise ValueError("CURRENT freshness observation is in the future")
        if trusted_now >= valid_until:
            raise ValueError("CURRENT freshness has expired at trusted consumer clock")
    elif observed_raw is not None or valid_until_raw is not None:
        if observed_raw is None or valid_until_raw is None:
            raise ValueError("freshness timestamps must be both present or both absent")
        observed_at = _parse_time(observed_raw, "freshness.observed_at")
        valid_until = _parse_time(valid_until_raw, "freshness.valid_until")
        if observed_at > valid_until:
            raise ValueError("freshness observation occurs after validity end")

    generated_at = _parse_time(projection.get("generated_at"), "generated_at")
    updated_at = _parse_time(projection.get("updated_at"), "updated_at")
    if generated_at > updated_at:
        raise ValueError("generated_at is later than updated_at")
    if updated_at > trusted_now:
        raise ValueError("updated_at is in the future relative to trusted consumer clock")


def _main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--projection", required=True)
    parser.add_argument("--trusted-now", required=True)
    parser.add_argument("--purpose", choices=sorted(PURPOSE_TO_RIGHT), required=True)
    args = parser.parse_args()

    projection = json.loads(Path(args.projection).read_text(encoding="utf-8"))
    trusted_now = _parse_time(args.trusted_now, "trusted_now")
    validate_projection_semantics(
        projection,
        trusted_now=trusted_now,
        consumer_purpose=args.purpose,
    )
    print(
        json.dumps(
            {
                "suite": "KIDULTS_PROOF_PRODUCT_PROJECTION_SEMANTICS_V1",
                "result": "PASS",
                "trusted_clock_revalidated": True,
                "assessment_identity_bound": True,
                "rights_summary_recomputed": True,
                "consumer_purpose": args.purpose,
                "production": "HOLD",
                "public": "HOLD",
                "g5": "EXPLICIT_APPROVAL_REQUIRED",
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(_main())
