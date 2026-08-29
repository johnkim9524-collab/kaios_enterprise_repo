#!/usr/bin/env bash
set -euo pipefail

APPROVAL_ID="${APPROVAL_ID:-CF-KIDULTS-14501AC-01}"
APPROVAL_RECEIPT_PATH="${APPROVAL_RECEIPT_PATH:-coordination/kidults/runtime/cf-kidults-14501ac-01-approval.json}"
COMPLETION_RECEIPT_PATH="${COMPLETION_RECEIPT_PATH:-coordination/kidults/runtime/cloudflare-pages-one-shot-completion-v1.json}"

[[ "$APPROVAL_ID" == "CF-KIDULTS-14501AC-01" ]] || {
  echo "Refusing unexpected approval ID" >&2
  exit 64
}
[[ -f "$APPROVAL_RECEIPT_PATH" ]] || {
  echo "Consumed approval tombstone is missing" >&2
  exit 65
}
[[ -f "$COMPLETION_RECEIPT_PATH" ]] || {
  echo "Completion receipt is missing" >&2
  exit 65
}

jq -e --arg approval_id "$APPROVAL_ID" '
  .state == "CONSUMED_COMPLETED"
  and .approval_id == $approval_id
  and .repository_role == "AUDIT_TOMBSTONE_NOT_AUTHORIZATION"
  and .authoritative_external_receipt.issue == 1583
  and .authoritative_external_receipt.state == "CLOSED_COMPLETED"
  and .authoritative_external_receipt.replay_authorized == false
  and .execution.run_id == 33262992819
  and .execution.artifact_id == 9717897493
  and .execution.artifact_digest == "sha256:5c642753fad37bebd70555938e2a0e6daed95c88d9d5fb4e6bc6cf49cb33e309"
  and .execution.deleted_materialized_preview_count == 588
  and .execution.remaining_materialized_preview_count == 0
  and .execution.preexisting_production_ids_preserved == 124
  and .execution.governed_staging_deployment_id == "dc6654a1-ee61-4762-92a1-b3f25e064e91"
  and .execution_lane.state == "RETIRED"
  and .execution_lane.executable == false
  and .execution_lane.provider_credentials_may_resolve == false
  and .execution_lane.provider_calls_allowed == false
  and .execution_lane.preview_deletion_allowed == false
  and .execution_lane.staging_deployment_allowed == false
  and .execution_lane.replay_allowed == false
  and .execution_lane.rerun_allowed == false
  and .execution_lane.new_run_attempt_one_allowed == false
  and .truth_boundary.public_release == "HOLD"
  and .truth_boundary.production == "HOLD"
  and .truth_boundary.g5 == "HOLD"
' "$APPROVAL_RECEIPT_PATH" >/dev/null

jq -e --arg approval_id "$APPROVAL_ID" '
  .state == "COMPLETE_VERIFIED"
  and .approval_id == $approval_id
  and .approval_consumed == true
  and .workflow_run_id == 33262992819
  and .artifact_id == 9717897493
  and .artifact_digest == "sha256:5c642753fad37bebd70555938e2a0e6daed95c88d9d5fb4e6bc6cf49cb33e309"
  and .preview_retirement.initial_materialized_count == 588
  and .preview_retirement.deleted_materialized_count == 588
  and .preview_retirement.remaining_materialized_count == 0
  and .production_history.initial_count == 124
  and .production_history.all_preexisting_ids_preserved == true
  and .governed_staging_deployment.id == "dc6654a1-ee61-4762-92a1-b3f25e064e91"
  and .release_boundary.public_release == "HOLD"
  and .release_boundary.platform_production == "HOLD"
  and .release_boundary.g5 == "HOLD"
' "$COMPLETION_RECEIPT_PATH" >/dev/null

echo "CF-KIDULTS-14501AC-01 is consumed, completed and permanently retired."
echo "No provider credential resolution, provider call, deletion, deployment, settings mutation or replay is permitted."
exit 78
