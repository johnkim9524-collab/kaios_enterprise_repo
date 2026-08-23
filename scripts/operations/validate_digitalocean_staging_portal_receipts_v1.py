#!/usr/bin/env python3
"""Fail-closed validator for one deployment-scoped Portal STAGING receipt bundle."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


CONTRACT_ID = "kidults-digitalocean-staging-portal-receipt-contract-v1"
SHA256_RE = re.compile(r"^sha256:[0-9a-f]{64}$")
COMMIT_RE = re.compile(r"^[0-9a-f]{40}$")
UTC_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")
REQUIRED_MARKERS = {
    "release": 'data-release="portal-release-001"',
    "no_projection": 'data-state="NO_PROJECTION"',
    "market_copy": "Read the market.",
    "evidence_copy": "Know the evidence.",
}
COMMON_FIELDS = {
    "receipt_contract_id",
    "receipt_type",
    "deployment_id",
    "source_commit_sha",
    "workflow_run_id",
    "workflow_run_attempt",
    "evidence_class",
    "remote_target_observed",
    "environment",
    "hostname",
    "user",
    "bind",
    "observed_at",
    "public_bind",
    "production_touch",
    "raw_provider_ingestion",
    "real_business_workload",
    "g5",
}


class ReceiptValidationError(ValueError):
    pass


def reject_duplicate_keys(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    value: dict[str, Any] = {}
    for key, item in pairs:
        if key in value:
            raise ReceiptValidationError(f"duplicate JSON key: {key}")
        value[key] = item
    return value


def read_json(path: Path) -> dict[str, Any]:
    if path.is_symlink():
        raise ReceiptValidationError(f"receipt must not be a symlink: {path.name}")
    if not path.is_file():
        raise ReceiptValidationError(f"required receipt missing: {path.name}")
    try:
        value = json.loads(path.read_text(), object_pairs_hook=reject_duplicate_keys)
    except (json.JSONDecodeError, OSError) as error:
        raise ReceiptValidationError(f"invalid JSON in {path.name}: {error}") from error
    if not isinstance(value, dict):
        raise ReceiptValidationError(f"receipt must be a JSON object: {path.name}")
    return value


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ReceiptValidationError(message)


def sha256_bytes(value: bytes) -> str:
    return f"sha256:{hashlib.sha256(value).hexdigest()}"


def file_sha256(path: Path) -> str:
    return sha256_bytes(path.read_bytes())


def valid_utc(value: Any) -> bool:
    if not isinstance(value, str) or not UTC_RE.fullmatch(value):
        return False
    try:
        datetime.strptime(value, "%Y-%m-%dT%H:%M:%SZ")
    except ValueError:
        return False
    return True


def validate_common(receipt: dict[str, Any], args: argparse.Namespace, name: str) -> None:
    missing = sorted(COMMON_FIELDS - receipt.keys())
    require(not missing, f"{name}: missing common fields: {', '.join(missing)}")
    require(receipt["receipt_contract_id"] == CONTRACT_ID, f"{name}: receipt contract mismatch")
    require(receipt["deployment_id"] == args.expected_deployment_id, f"{name}: deployment id mismatch")
    require(receipt["source_commit_sha"] == args.expected_source_sha, f"{name}: source commit mismatch")
    require(COMMIT_RE.fullmatch(receipt["source_commit_sha"]) is not None, f"{name}: invalid source commit")
    require(str(receipt["workflow_run_id"]) == args.expected_run_id, f"{name}: workflow run id mismatch")
    require(receipt["workflow_run_attempt"] == args.expected_run_attempt, f"{name}: workflow run attempt mismatch")
    require(receipt["evidence_class"] == args.expected_evidence_class, f"{name}: evidence class mismatch")
    require(
        receipt["remote_target_observed"] is (args.expected_evidence_class == "REMOTE_STAGING"),
        f"{name}: remote target observation flag mismatch",
    )
    require(receipt["environment"] == "STAGING", f"{name}: environment must be STAGING")
    require(receipt["hostname"] == "ih-staging-01", f"{name}: hostname mismatch")
    require(receipt["user"] == "kidults-staging", f"{name}: user mismatch")
    require(receipt["bind"] == "127.0.0.1:4173", f"{name}: bind must be localhost:4173")
    require(valid_utc(receipt["observed_at"]), f"{name}: invalid observed_at")
    require(receipt["public_bind"] is False, f"{name}: public bind must be false")
    require(receipt["production_touch"] is False, f"{name}: Production touch must be false")
    require(receipt["raw_provider_ingestion"] is False, f"{name}: provider ingestion must be false")
    require(receipt["real_business_workload"] is False, f"{name}: real workload must be false")
    require(receipt["g5"] == "HOLD", f"{name}: G5 must remain HOLD")


def validate_body(path: Path, expected_digest: str, required_markers: dict[str, str]) -> None:
    require(path.is_file() and not path.is_symlink(), f"required localhost body missing: {path.name}")
    body = path.read_bytes()
    require(SHA256_RE.fullmatch(expected_digest) is not None, f"invalid body digest in receipt for {path.name}")
    require(sha256_bytes(body) == expected_digest, f"localhost body digest mismatch: {path.name}")
    text = body.decode("utf-8")
    for field, marker in required_markers.items():
        require(marker in text, f"localhost body missing {field} marker: {path.name}")


def managed_release_path(value: Any, evidence_class: str) -> bool:
    if not isinstance(value, str) or not value:
        return False
    if evidence_class == "REMOTE_STAGING":
        prefix = "/home/kidults-staging/kidults-runtime/app/portal-r001-releases/"
        return value.startswith(prefix) and value != prefix.rstrip("/")
    return "/kidults-runtime/app/portal-r001-releases/" in value


def validate_deployed(bundle: Path, args: argparse.Namespace) -> list[Path]:
    deploy_path = bundle / "deploy-receipt.json"
    health_path = bundle / "health-receipt.json"
    rollback_path = bundle / "rollback-receipt.json"
    index_path = bundle / "index.html"
    deploy = read_json(deploy_path)
    health = read_json(health_path)
    rollback = read_json(rollback_path)
    for receipt, name in ((deploy, "deploy"), (health, "health"), (rollback, "rollback")):
        validate_common(receipt, args, name)

    require(deploy["receipt_type"] == "DEPLOYMENT", "deploy: receipt type mismatch")
    expected_deploy_state = "DEPLOYED_VERIFIED" if args.expected_evidence_class == "REMOTE_STAGING" else "VERIFIED_PASS"
    require(deploy.get("state") == expected_deploy_state, f"deploy: state must be {expected_deploy_state}")
    require(managed_release_path(deploy.get("release_path"), args.expected_evidence_class), "deploy: unmanaged release path")
    require(SHA256_RE.fullmatch(str(deploy.get("release_digest", ""))) is not None, "deploy: invalid release digest")
    require(str(deploy.get("server_pid", "")).isdigit() and int(deploy["server_pid"]) > 0, "deploy: invalid server pid")
    require(deploy.get("health_receipt") == "health-receipt.json", "deploy: health receipt reference mismatch")
    require(deploy.get("rollback_receipt") == "rollback-receipt.json", "deploy: rollback receipt reference mismatch")
    require(deploy.get("portal_state") == "NO_PROJECTION", "deploy: portal state mismatch")
    require(deploy.get("rollback_armed") is True, "deploy: rollback must be armed")

    require(health["receipt_type"] == "LOCALHOST_HEALTH", "health: receipt type mismatch")
    require(health.get("state") == "VERIFIED_PASS", "health: state must be VERIFIED_PASS")
    require(health.get("request_url") == "http://127.0.0.1:4173/index.html", "health: request URL mismatch")
    require(health.get("http_status") == 200, "health: HTTP status must be 200")
    require(health.get("portal_state") == "NO_PROJECTION", "health: portal state mismatch")
    markers = health.get("markers")
    require(isinstance(markers, dict), "health: markers must be an object")
    for field in REQUIRED_MARKERS:
        require(markers.get(field) is True, f"health: {field} marker was not verified")
    validate_body(index_path, str(health.get("body_sha256", "")), REQUIRED_MARKERS)

    require(rollback["receipt_type"] == "ROLLBACK", "rollback: receipt type mismatch")
    require(rollback.get("rollback_action") == "ARMED_NOT_EXECUTED", "rollback: deployed bundle must be armed, not executed")
    require(rollback.get("trigger_exit_code") == 0, "rollback: deployed bundle trigger exit code must be zero")
    target_available = rollback.get("rollback_target_available") is True
    require(deploy.get("rollback_target_available") is target_available, "rollback: target availability disagrees with deploy receipt")
    require(rollback.get("failed_release") == deploy.get("release_path"), "rollback: candidate release mismatch")
    require(rollback.get("rollback_target") == deploy.get("previous_release"), "rollback: previous release mismatch")
    if target_available:
        require(rollback.get("state") == "VERIFIED_PASS", "rollback: armed target state must be VERIFIED_PASS")
        require(rollback.get("rollback_status") == "ARMED", "rollback: status must be ARMED")
        require(managed_release_path(rollback.get("rollback_target"), args.expected_evidence_class), "rollback: unmanaged target path")
        require(rollback.get("rollback_target") != deploy.get("release_path"), "rollback: target must differ from deployed release")
        require(SHA256_RE.fullmatch(str(rollback.get("rollback_target_digest", ""))) is not None, "rollback: invalid target digest")
    else:
        require(rollback.get("state") == "BLOCKED", "rollback: missing target must be BLOCKED")
        require(rollback.get("rollback_status") == "NO_PREVIOUS_RELEASE", "rollback: missing target status mismatch")
    if args.require_rollback_target:
        require(target_available, "rollback: previous-release target is required for issue #921 exit")

    return [deploy_path, health_path, rollback_path, index_path]


def validate_rolled_back(bundle: Path, args: argparse.Namespace) -> list[Path]:
    rollback_path = bundle / "rollback-receipt.json"
    index_path = bundle / "rollback-index.html"
    rollback = read_json(rollback_path)
    validate_common(rollback, args, "rollback")
    require(rollback["receipt_type"] == "ROLLBACK", "rollback: receipt type mismatch")
    require(rollback.get("state") == "VERIFIED_PASS", "rollback: state must be VERIFIED_PASS")
    require(rollback.get("rollback_action") == "EXECUTED", "rollback: action must be EXECUTED")
    require(rollback.get("rollback_status") == "RESTORED", "rollback: status must be RESTORED")
    require(isinstance(rollback.get("trigger_exit_code"), int) and rollback["trigger_exit_code"] > 0, "rollback: trigger code must be nonzero")
    require(rollback.get("rollback_target_available") is True, "rollback: target must be available")
    require(managed_release_path(rollback.get("failed_release"), args.expected_evidence_class), "rollback: unmanaged failed release")
    require(managed_release_path(rollback.get("rollback_target"), args.expected_evidence_class), "rollback: unmanaged restored target")
    require(rollback.get("failed_release") != rollback.get("rollback_target"), "rollback: restored target must differ from failed release")
    require(SHA256_RE.fullmatch(str(rollback.get("rollback_target_digest", ""))) is not None, "rollback: invalid target digest")
    require(str(rollback.get("server_pid", "")).isdigit() and int(rollback["server_pid"]) > 0, "rollback: invalid restored server pid")
    restored_markers = rollback.get("restored_markers")
    require(isinstance(restored_markers, dict), "rollback: restored markers must be an object")
    require(restored_markers.get("release") is True, "rollback: release marker not restored")
    require(restored_markers.get("no_projection") is True, "rollback: NO_PROJECTION marker not restored")
    validate_body(
        index_path,
        str(rollback.get("restored_health_body_sha256", "")),
        {"release": REQUIRED_MARKERS["release"], "no_projection": REQUIRED_MARKERS["no_projection"]},
    )
    return [rollback_path, index_path]


def write_validation_receipt(path: Path, args: argparse.Namespace, inputs: list[Path]) -> None:
    payload = {
        "id": "kidults-digitalocean-staging-portal-receipt-validation-v1",
        "receipt_contract_id": CONTRACT_ID,
        "state": "VERIFIED_PASS",
        "validated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "outcome": args.expected_outcome,
        "deployment_id": args.expected_deployment_id,
        "source_commit_sha": args.expected_source_sha,
        "workflow_run_id": args.expected_run_id,
        "workflow_run_attempt": args.expected_run_attempt,
        "evidence_class": args.expected_evidence_class,
        "issue_921_remote_exit_eligible": args.expected_evidence_class == "REMOTE_STAGING",
        "validated_inputs": [
            {"name": item.name, "sha256": file_sha256(item)} for item in sorted(inputs, key=lambda item: item.name)
        ],
        "production": "HOLD",
        "g5": "HOLD",
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(payload, indent=2) + "\n")
    os.replace(temporary, path)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--artifact-dir", type=Path, required=True)
    parser.add_argument("--expected-outcome", choices=("DEPLOYED", "ROLLED_BACK"), required=True)
    parser.add_argument("--expected-deployment-id", required=True)
    parser.add_argument("--expected-source-sha", required=True)
    parser.add_argument("--expected-run-id", required=True)
    parser.add_argument("--expected-run-attempt", type=int, required=True)
    parser.add_argument(
        "--expected-evidence-class",
        choices=("REMOTE_STAGING", "LOCALHOST_CONTRACT_PROOF"),
        required=True,
    )
    parser.add_argument("--require-rollback-target", action="store_true")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    require(COMMIT_RE.fullmatch(args.expected_source_sha) is not None, "caller supplied invalid source commit sha")
    require(args.expected_run_attempt > 0, "caller supplied invalid workflow run attempt")
    return args


def main() -> int:
    try:
        args = parse_args()
        bundle = args.artifact_dir.resolve()
        require(bundle.is_dir(), "artifact directory missing")
        inputs = validate_deployed(bundle, args) if args.expected_outcome == "DEPLOYED" else validate_rolled_back(bundle, args)
        if args.output:
            write_validation_receipt(args.output, args, inputs)
        print(json.dumps({
            "suite": "DIGITALOCEAN_STAGING_PORTAL_RECEIPTS_V1",
            "state": "VERIFIED_PASS",
            "outcome": args.expected_outcome,
            "deployment_id": args.expected_deployment_id,
            "source_commit_sha": args.expected_source_sha,
            "evidence_class": args.expected_evidence_class,
            "issue_921_remote_exit_eligible": args.expected_evidence_class == "REMOTE_STAGING",
            "production": "HOLD",
            "g5": "HOLD",
        }, indent=2))
        return 0
    except (ReceiptValidationError, OSError, UnicodeDecodeError) as error:
        print(json.dumps({
            "suite": "DIGITALOCEAN_STAGING_PORTAL_RECEIPTS_V1",
            "state": "VERIFIED_FAIL",
            "error": str(error),
            "production": "HOLD",
            "g5": "HOLD",
        }, indent=2), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
