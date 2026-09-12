#!/usr/bin/env python3
"""Execute the real Seaport pair through canonical preflight and Track B HOLD."""

from __future__ import annotations
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
PAIR = ROOT / "coordination/kidults/integration/live-arrival/seaport-eth-25844482-5198"
OUT = ROOT / "artifacts/kidults-track-b-seaport-eth-25844482-5198"
OUT.mkdir(parents=True, exist_ok=True)
assessment_path = OUT / "live-rankability-assessment-envelope.json"
handoff_path = OUT / "handoff-r2.json"
process = subprocess.run([
    sys.executable,
    str(ROOT / "scripts/kidults/integration/build-official-track-b-assessment-v1.py"),
    str((PAIR / "snapshot-candidate.json").relative_to(ROOT)),
    str((PAIR / "evidence-package.json").relative_to(ROOT)),
    str(assessment_path.relative_to(ROOT)),
    str(handoff_path.relative_to(ROOT)),
], cwd=ROOT, text=True, capture_output=True, check=False)

errors: list[str] = []
def check(condition: bool, message: str) -> None:
    if not condition:
        errors.append(message)

check(process.returncode == 2, f"expected fail-closed HOLD return 2, got {process.returncode}")
check(assessment_path.exists(), "Track B assessment receipt missing")
check(handoff_path.exists(), "canonical R2 handoff receipt missing")
if assessment_path.exists():
    envelope = json.loads(assessment_path.read_text(encoding="utf-8"))
    assessment = envelope["assessment"]
    check(envelope["synthetic"] is False, "synthetic input admitted")
    check(assessment["assessment_status"] == "COMPLETED", "Track B not completed")
    check(assessment["recommendation"] == "CONDITIONAL", "expected CONDITIONAL")
    check(assessment["overall_rankability"] is False, "conditional pair promoted")
    check(assessment["publication_eligible"] is False, "Public preauthorized")
    check(assessment["production_eligible"] is False, "Production preauthorized")
    check(assessment["quantitative_summary"]["factual_order_fulfilled_count"] == 1, "fulfillment fact missing")
    check(assessment["quantitative_summary"]["admitted_current_sold_count"] == 0, "fulfillment relabeled SOLD")
    check(assessment["test_results"]["staging_replay"] == "NOT_RUN", "replay crossed HOLD")
    check(assessment["test_results"]["projection"] == "NOT_RUN", "projection crossed HOLD")

evidence = json.loads((PAIR / "evidence-package.json").read_text(encoding="utf-8"))
record = evidence["evidence_records"][0]
check(record["transaction_hash"] == "0x8180cca28afdc58271732849b20c45e896ca96080aa5925badc0a32b2a52a061", "transaction binding changed")
check(record["log_index"] == 639, "log binding changed")
check(record["market_observation_type"] == "ORDER_FULFILLED", "observation type changed")
check(record["sold_claim"] is False, "sold claim ceiling changed")
check(record["rights_state"] == "CONDITIONAL", "rights overclaimed")

summary = {
    "suite": "KIDULTS_SEAPORT_TRACK_B_HOLD_E2E_V1",
    "result": "FAIL" if errors else "PASS",
    "track_b": "COMPLETED_CONDITIONAL_HOLD",
    "claim_ceiling": "STRICT_CURRENT_ONCHAIN_SEAPORT_PAID_FULFILLMENT_FACT_ONLY",
    "sold_claim": False,
    "replay": "NOT_RUN",
    "projection": "NOT_RUN",
    "public": "HOLD",
    "production": "HOLD",
    "g5": "HOLD",
    "errors": errors,
    "assessor_stdout": process.stdout,
    "assessor_stderr": process.stderr,
}
(OUT / "validation-summary.json").write_text(json.dumps(summary, indent=2, sort_keys=True) + "\n", encoding="utf-8")
print(json.dumps(summary, indent=2))
raise SystemExit(1 if errors else 0)
