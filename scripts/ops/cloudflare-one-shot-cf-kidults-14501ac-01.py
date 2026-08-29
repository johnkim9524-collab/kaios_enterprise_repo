#!/usr/bin/env python3
"""Execute the bounded CF-KIDULTS-14501AC-01 Cloudflare Pages one-shot.

The script performs a read-only identity/settings preflight, removes only the
materialized Preview deployments observed in that preflight (bounded at 588),
proves the existing Production deployment ID set is unchanged, deploys the
approved historical protected-main SHA once to the STAGING Pages project, and
finishes with an authoritative read-back. Any provider/auth/identity error is
fail-closed and recorded without exposing credential material.
"""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

APPROVAL_ID = "CF-KIDULTS-14501AC-01"
EXPECTED_REPOSITORY = "johnkim9524-collab/kaios_enterprise_repo"
EXPECTED_PROJECT = "kidults-workspace-staging"
EXPECTED_ACCOUNT_ID = "235eaa51d04e7f4436a9faa507a04f9d"
TARGET_SHA = "14501ac022bdd7c918924a207f257b047b1ba970"
MAX_PREVIEW_DELETIONS = 588
PAGE_SIZE = 25
MAX_PAGES = 100
API_BASE = "https://api.cloudflare.com/client/v4"

TOKEN = os.environ.get("CLOUDFLARE_API_TOKEN", "")
ACCOUNT_ID = os.environ.get("CLOUDFLARE_ACCOUNT_ID", "")
PROJECT = os.environ.get("CLOUDFLARE_PAGES_PROJECT_NAME", EXPECTED_PROJECT)
REPOSITORY = os.environ.get("EXPECTED_REPOSITORY", EXPECTED_REPOSITORY)
APPROVED_SOURCE_ROOT = Path(os.environ.get("APPROVED_SOURCE_ROOT", "approved-source"))
SOURCE_DIR = APPROVED_SOURCE_ROOT / "apps/kidults-enterprise-staging/public"
RECEIPT_DIR = Path(os.environ.get("RECEIPT_DIR", "artifacts/cf-kidults-14501ac-01"))
RUN_ID = os.environ.get("GITHUB_RUN_ID", "UNKNOWN")
RUN_ATTEMPT = os.environ.get("GITHUB_RUN_ATTEMPT", "UNKNOWN")
CONTROL_SHA = os.environ.get("GITHUB_SHA", "UNKNOWN")

RECEIPT_DIR.mkdir(parents=True, exist_ok=True)

state: dict[str, Any] = {
    "id": "kidults-cloudflare-one-shot-receipt-v1",
    "approval_id": APPROVAL_ID,
    "state": "PREFLIGHT_PENDING",
    "failure_stage": None,
    "reason_code": None,
    "target_sha": TARGET_SHA,
    "control_sha": CONTROL_SHA,
    "project": EXPECTED_PROJECT,
    "repository": EXPECTED_REPOSITORY,
    "cloudflare_api_called": False,
    "token_active": False,
    "project_identity_verified": False,
    "settings_verified": False,
    "initial_materialized_preview_count": None,
    "attempted_preview_deletion_count": 0,
    "deleted_preview_count": 0,
    "remaining_materialized_preview_count": None,
    "initial_production_deployment_count": None,
    "existing_production_ids_preserved": False,
    "production_mutation": False,
    "governed_deployment_created": False,
    "governed_deployment": None,
    "automatic_git_deployments_disabled_after": False,
    "public_release": "HOLD",
    "production": "HOLD",
    "g5": "HOLD",
}


def write_receipt() -> None:
    temp = RECEIPT_DIR / "final.tmp.json"
    temp.write_text(json.dumps(state, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    temp.replace(RECEIPT_DIR / "final.json")


def fail(stage: str, reason: str, exit_code: int = 1, *, http_status: int | None = None) -> None:
    state["state"] = "CONSUMED_FAILED"
    state["failure_stage"] = stage
    state["reason_code"] = reason
    if http_status is not None:
        state["provider_http_status"] = http_status
    write_receipt()
    print(json.dumps(state, indent=2, sort_keys=True))
    raise SystemExit(exit_code)


def api_request(method: str, path: str, *, query: dict[str, str] | None = None) -> dict[str, Any]:
    state["cloudflare_api_called"] = True
    write_receipt()
    url = f"{API_BASE}{path}"
    if query:
        url = f"{url}?{urlencode(query)}"
    request = Request(
        url,
        method=method,
        headers={
            "Authorization": f"Bearer {TOKEN}",
            "Accept": "application/json",
            "Content-Type": "application/json",
        },
    )
    try:
        with urlopen(request, timeout=45) as response:  # nosec B310: fixed HTTPS API host
            status = int(response.status)
            payload_bytes = response.read()
    except HTTPError as exc:
        status = int(exc.code)
        try:
            payload_bytes = exc.read()
        except Exception:
            payload_bytes = b""
        reason = {
            401: "HTTP_401",
            403: "HTTP_403",
            404: "HTTP_404",
        }.get(status, "HTTP_5XX" if status >= 500 else "HTTP_NON_SUCCESS")
        fail("CLOUDFLARE_API", reason, 70, http_status=status)
    except (TimeoutError, URLError) as exc:
        state["transport_error_class"] = type(exc).__name__
        fail("CLOUDFLARE_API", "TIMEOUT_OR_TRANSPORT", 71)

    if status < 200 or status >= 300:
        reason = "HTTP_5XX" if status >= 500 else f"HTTP_{status}"
        fail("CLOUDFLARE_API", reason, 70, http_status=status)

    if not payload_bytes:
        return {"success": True, "result": None}
    try:
        payload = json.loads(payload_bytes)
    except json.JSONDecodeError:
        fail("CLOUDFLARE_API", "INVALID_JSON_RESPONSE", 72, http_status=status)
    if not isinstance(payload, dict) or payload.get("success") is not True:
        error_codes = [item.get("code") for item in payload.get("errors", []) if isinstance(item, dict)] if isinstance(payload, dict) else []
        state["provider_error_codes"] = error_codes
        fail("CLOUDFLARE_API", "PROVIDER_SUCCESS_FALSE", 72, http_status=status)
    return payload


def api_root() -> str:
    return f"/accounts/{ACCOUNT_ID}/pages/projects/{PROJECT}"


def list_all_deployments() -> list[dict[str, Any]]:
    deployments: list[dict[str, Any]] = []
    page = 1
    total_pages = 1
    while page <= total_pages:
        if page > MAX_PAGES:
            fail("DEPLOYMENT_INVENTORY", "MAX_PAGES_EXCEEDED", 73)
        payload = api_request(
            "GET",
            f"{api_root()}/deployments",
            query={"per_page": str(PAGE_SIZE), "page": str(page)},
        )
        result = payload.get("result")
        if not isinstance(result, list):
            fail("DEPLOYMENT_INVENTORY", "RESULT_NOT_ARRAY", 73)
        deployments.extend(item for item in result if isinstance(item, dict))
        info = payload.get("result_info") or {}
        try:
            total_pages = int(info.get("total_pages") or 1)
        except (TypeError, ValueError):
            fail("DEPLOYMENT_INVENTORY", "INVALID_TOTAL_PAGES", 73)
        if total_pages < 1 or total_pages > MAX_PAGES:
            fail("DEPLOYMENT_INVENTORY", "UNBOUNDED_TOTAL_PAGES", 73)
        page += 1
    return deployments


def is_materialized(item: dict[str, Any]) -> bool:
    return item.get("is_skipped", False) is not True and isinstance(item.get("url"), str) and bool(item.get("url"))


def preview_ids(items: list[dict[str, Any]]) -> list[str]:
    return sorted({
        str(item.get("id"))
        for item in items
        if item.get("environment") == "preview" and is_materialized(item) and item.get("id")
    })


def production_ids(items: list[dict[str, Any]]) -> list[str]:
    return sorted({
        str(item.get("id"))
        for item in items
        if item.get("environment") == "production" and is_materialized(item) and item.get("id")
    })


def verify_project(payload: dict[str, Any]) -> None:
    result = payload.get("result")
    if not isinstance(result, dict):
        fail("PROJECT_PREFLIGHT", "PROJECT_RESULT_MISSING", 74)
    source = result.get("source") or {}
    config = source.get("config") or {}
    bound_repo = f"{config.get('owner', '')}/{config.get('repo_name', '')}"
    checks = {
        "project_name": result.get("name") == EXPECTED_PROJECT,
        "source_type": source.get("type") == "github",
        "repository": bound_repo == EXPECTED_REPOSITORY,
        "production_branch": result.get("production_branch") == "main",
        "production_auto_off": config.get("production_deployments_enabled") is False,
        "preview_none": config.get("preview_deployment_setting") == "none",
    }
    state["project_preflight"] = checks
    if not all(checks.values()):
        fail("PROJECT_PREFLIGHT", "ACCOUNT_PROJECT_REPOSITORY_MISMATCH", 74)
    state["project_identity_verified"] = True
    state["settings_verified"] = True
    write_receipt()


def tree_digest(root: Path) -> str:
    digest = hashlib.sha256()
    files = sorted(path for path in root.rglob("*") if path.is_file())
    if not files:
        fail("SOURCE_PREFLIGHT", "SOURCE_TREE_EMPTY", 75)
    for path in files:
        if path.is_symlink():
            fail("SOURCE_PREFLIGHT", "SYMLINK_PROHIBITED", 75)
        rel = path.relative_to(root).as_posix().encode("utf-8")
        digest.update(len(rel).to_bytes(8, "big"))
        digest.update(rel)
        content = path.read_bytes()
        digest.update(len(content).to_bytes(8, "big"))
        digest.update(content)
    return f"sha256:{digest.hexdigest()}"


def deployment_metadata(item: dict[str, Any]) -> dict[str, Any]:
    trigger = item.get("deployment_trigger") or {}
    metadata = trigger.get("metadata") or {}
    latest_stage = item.get("latest_stage") or {}
    return {
        "id": item.get("id"),
        "environment": item.get("environment"),
        "url": item.get("url"),
        "created_on": item.get("created_on"),
        "latest_stage_status": latest_stage.get("status"),
        "trigger_type": trigger.get("type"),
        "branch": metadata.get("branch"),
        "commit_hash": metadata.get("commit_hash"),
        "commit_message": metadata.get("commit_message"),
    }


def main() -> None:
    write_receipt()
    if not TOKEN or not ACCOUNT_ID:
        fail("LOCAL_PREFLIGHT", "CLOUDFLARE_STAGING_CREDENTIALS_ABSENT", 65)
    if ACCOUNT_ID != EXPECTED_ACCOUNT_ID:
        fail("LOCAL_PREFLIGHT", "ACCOUNT_ID_MISMATCH", 65)
    if PROJECT != EXPECTED_PROJECT or REPOSITORY != EXPECTED_REPOSITORY:
        fail("LOCAL_PREFLIGHT", "TARGET_IDENTITY_MISMATCH", 65)
    if not SOURCE_DIR.is_dir():
        fail("SOURCE_PREFLIGHT", "APPROVED_SOURCE_DIRECTORY_MISSING", 65)

    git_result = subprocess.run(
        ["git", "-C", str(APPROVED_SOURCE_ROOT), "rev-parse", "HEAD"],
        check=False,
        text=True,
        capture_output=True,
    )
    if git_result.returncode != 0 or git_result.stdout.strip() != TARGET_SHA:
        fail("SOURCE_PREFLIGHT", "APPROVED_SOURCE_SHA_MISMATCH", 65)

    token_payload = api_request("GET", "/user/tokens/verify")
    token_result = token_payload.get("result") or {}
    if token_result.get("status") != "active":
        fail("TOKEN_PREFLIGHT", "TOKEN_INVALID_OR_INACTIVE", 65)
    state["token_active"] = True
    write_receipt()

    project_payload = api_request("GET", api_root())
    verify_project(project_payload)

    initial = list_all_deployments()
    initial_previews = preview_ids(initial)
    initial_production = production_ids(initial)
    state["initial_materialized_preview_count"] = len(initial_previews)
    state["initial_production_deployment_count"] = len(initial_production)
    state["initial_production_ids_sha256"] = "sha256:" + hashlib.sha256("\n".join(initial_production).encode()).hexdigest()
    write_receipt()

    if len(initial_previews) > MAX_PREVIEW_DELETIONS:
        fail("DELETE_PREFLIGHT", "MATERIALIZED_PREVIEW_COUNT_EXCEEDS_588", 76)
    if not initial_production:
        fail("DELETE_PREFLIGHT", "PRODUCTION_DEPLOYMENT_SET_EMPTY", 76)

    state["state"] = "PREFLIGHT_COMPLETE_DELETE_PENDING"
    write_receipt()
    deletion_log = RECEIPT_DIR / "preview-deletions.ndjson"
    with deletion_log.open("w", encoding="utf-8") as log:
        for deployment_id in initial_previews:
            state["attempted_preview_deletion_count"] += 1
            write_receipt()
            api_request(
                "DELETE",
                f"{api_root()}/deployments/{deployment_id}",
                query={"force": "true"},
            )
            state["deleted_preview_count"] += 1
            log.write(json.dumps({"deployment_id": deployment_id, "result": "DELETED_PREVIEW_FORCE_TRUE"}) + "\n")
            log.flush()
            write_receipt()

    after_cleanup = list_all_deployments()
    remaining_previews = preview_ids(after_cleanup)
    after_cleanup_production = production_ids(after_cleanup)
    state["remaining_materialized_preview_count"] = len(remaining_previews)
    if remaining_previews:
        fail("POST_DELETE_READBACK", "MATERIALIZED_PREVIEW_REMAINS", 77)
    if after_cleanup_production != initial_production:
        state["production_mutation"] = True
        fail("POST_DELETE_READBACK", "EXISTING_PRODUCTION_ID_SET_CHANGED", 77)
    state["existing_production_ids_preserved"] = True
    state["state"] = "PREVIEW_ZERO_PRODUCTION_PRESERVED_DEPLOY_PENDING"
    write_receipt()

    source_digest = tree_digest(SOURCE_DIR)
    state["source_tree_sha256"] = source_digest
    commit_message = (
        f"[KIDULTS-GOVERNED-STAGING] approval_id={APPROVAL_ID} "
        f"repository={EXPECTED_REPOSITORY} source_sha={TARGET_SHA} "
        f"run={RUN_ID} attempt={RUN_ATTEMPT}"
    )
    deploy_log = RECEIPT_DIR / "wrangler-deploy.log"
    command = [
        "npx",
        "--yes",
        "wrangler@4.127.1",
        "pages",
        "deploy",
        str(SOURCE_DIR),
        "--project-name",
        EXPECTED_PROJECT,
        "--branch",
        "main",
        "--commit-hash",
        TARGET_SHA,
        "--commit-message",
        commit_message,
    ]
    with deploy_log.open("w", encoding="utf-8") as log:
        deploy = subprocess.run(command, stdout=log, stderr=subprocess.STDOUT, text=True, check=False)
    if deploy.returncode != 0:
        fail("WRANGLER_DEPLOY", "WRANGLER_NONZERO", deploy.returncode or 78)

    matched: list[dict[str, Any]] = []
    final_inventory: list[dict[str, Any]] = []
    for _ in range(30):
        final_inventory = list_all_deployments()
        matched = []
        for item in final_inventory:
            trigger = item.get("deployment_trigger") or {}
            metadata = trigger.get("metadata") or {}
            latest_stage = item.get("latest_stage") or {}
            if (
                item.get("environment") == "production"
                and is_materialized(item)
                and trigger.get("type") == "ad_hoc"
                and metadata.get("branch") == "main"
                and metadata.get("commit_hash") == TARGET_SHA
                and metadata.get("commit_message") == commit_message
                and latest_stage.get("status") == "success"
            ):
                matched.append(item)
        if len(matched) == 1:
            break
        if len(matched) > 1:
            fail("DEPLOYMENT_READBACK", "MULTIPLE_MATCHING_GOVERNED_DEPLOYMENTS", 79)
        time.sleep(2)
    if len(matched) != 1:
        fail("DEPLOYMENT_READBACK", "GOVERNED_DEPLOYMENT_NOT_VISIBLE", 79)

    governed = matched[0]
    governed_id = str(governed.get("id"))
    final_previews = preview_ids(final_inventory)
    final_production = production_ids(final_inventory)
    if final_previews:
        fail("FINAL_READBACK", "MATERIALIZED_PREVIEW_REAPPEARED", 80)
    if not set(initial_production).issubset(set(final_production)):
        state["production_mutation"] = True
        fail("FINAL_READBACK", "EXISTING_PRODUCTION_ID_MISSING", 80)
    new_production = sorted(set(final_production) - set(initial_production))
    if new_production != [governed_id]:
        fail("FINAL_READBACK", "UNEXPECTED_PRODUCTION_DEPLOYMENT_DELTA", 80)

    final_project = api_request("GET", api_root())
    verify_project(final_project)
    state["governed_deployment_created"] = True
    state["governed_deployment"] = deployment_metadata(governed)
    state["automatic_git_deployments_disabled_after"] = True
    state["remaining_materialized_preview_count"] = 0
    state["existing_production_ids_preserved"] = True
    state["production_mutation"] = False
    state["state"] = "COMPLETE_VERIFIED"
    state["failure_stage"] = None
    state["reason_code"] = None
    write_receipt()
    print(json.dumps(state, indent=2, sort_keys=True))


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception as exc:  # durable fail-closed evidence for unexpected defects
        state["unexpected_error_class"] = type(exc).__name__
        fail("UNEXPECTED", "UNHANDLED_EXCEPTION", 99)
