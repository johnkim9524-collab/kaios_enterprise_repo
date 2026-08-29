#!/usr/bin/env bash
set -euo pipefail

PROJECT_NAME="${CLOUDFLARE_PAGES_PROJECT_NAME:-kidults-workspace-staging}"
EXPECTED_REPOSITORY="${EXPECTED_REPOSITORY:-johnkim9524-collab/kaios_enterprise_repo}"
RECEIPT_DIR="${RECEIPT_DIR:-artifacts/cloudflare-pages-boundary-readonly}"
MAX_PAGES="${MAX_PAGES:-100}"
PAGE_SIZE="${PAGE_SIZE:-25}"

mkdir -p "$RECEIPT_DIR"

write_preflight_failure_receipt() {
  local state="$1" reason_code="$2" exit_code="$3"
  local token_present=false account_id_present=false
  [[ -n "${CLOUDFLARE_API_TOKEN:-}" ]] && token_present=true
  [[ -n "${CLOUDFLARE_ACCOUNT_ID:-}" ]] && account_id_present=true
  jq -n --arg state "$state" --arg reason_code "$reason_code" --arg project "$PROJECT_NAME" \
    --arg expected_repository "$EXPECTED_REPOSITORY" --arg current_main_sha "${GITHUB_SHA:-UNKNOWN}" \
    --argjson exit_code "$exit_code" --argjson api_token_present "$token_present" \
    --argjson account_id_present "$account_id_present" '{
      id:"kidults-cloudflare-pages-boundary-readonly-receipt-v1",state:$state,reason_code:$reason_code,
      exit_code:$exit_code,project:$project,expected_repository:$expected_repository,current_main_sha:$current_main_sha,
      credential_presence:{api_token_present:$api_token_present,account_id_present:$account_id_present},
      cloudflare_api_called:false,settings_readback_complete:false,deployment_inventory_complete:false,
      read_only:true,settings_mutated:false,deployment_created:false,deployment_deleted:false,
      platform_environment:"STAGING",public_release:"HOLD",production:"HOLD",g5:"HOLD"
    }' > "$RECEIPT_DIR/final.json"
  cat "$RECEIPT_DIR/final.json"
  exit "$exit_code"
}

[[ "$PROJECT_NAME" == "kidults-workspace-staging" ]] || write_preflight_failure_receipt "REFUSED_INVALID_INPUT" "UNEXPECTED_PAGES_PROJECT" 64
[[ "$EXPECTED_REPOSITORY" == "johnkim9524-collab/kaios_enterprise_repo" ]] || write_preflight_failure_receipt "REFUSED_INVALID_INPUT" "UNEXPECTED_REPOSITORY" 64
[[ "$MAX_PAGES" =~ ^[1-9][0-9]*$ ]] && (( MAX_PAGES <= 100 )) || write_preflight_failure_receipt "REFUSED_INVALID_INPUT" "INVALID_MAX_PAGES" 64
[[ "$PAGE_SIZE" =~ ^[1-9][0-9]*$ ]] && (( PAGE_SIZE <= 25 )) || write_preflight_failure_receipt "REFUSED_INVALID_INPUT" "INVALID_PAGE_SIZE" 64
[[ -n "${CLOUDFLARE_API_TOKEN:-}" && -n "${CLOUDFLARE_ACCOUNT_ID:-}" ]] || write_preflight_failure_receipt "BLOCKED_CREDENTIALS_ABSENT" "CLOUDFLARE_READONLY_CREDENTIALS_ABSENT" 65

API_ROOT="https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/pages/projects/${PROJECT_NAME}"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

api_get() {
  curl --fail-with-body --silent --show-error --retry 3 --retry-delay 1 --retry-all-errors \
    --connect-timeout 10 --max-time 45 --request GET \
    --header "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" --header "Accept: application/json" "$1" > "$2"
}

list_all_deployments() {
  local output="$1" page=1 total_pages=1 page_file
  : > "$tmp_dir/deployments.ndjson"
  while (( page <= total_pages )); do
    (( page <= MAX_PAGES )) || return 68
    page_file="$tmp_dir/deployments-page-${page}.json"
    api_get "$API_ROOT/deployments?per_page=${PAGE_SIZE}&page=$page" "$page_file"
    jq -e '.success == true and (.result | type == "array")' "$page_file" >/dev/null
    jq -c '.result[]' "$page_file" >> "$tmp_dir/deployments.ndjson"
    total_pages="$(jq -r '(.result_info.total_pages // 1) | if type == "number" and . >= 1 and floor == . then . else error("invalid total_pages") end' "$page_file")"
    (( total_pages <= MAX_PAGES )) || return 68
    page=$((page + 1))
  done
  [[ -s "$tmp_dir/deployments.ndjson" ]] && jq -s '.' "$tmp_dir/deployments.ndjson" > "$output" || printf '[]\n' > "$output"
}

api_get "$API_ROOT" "$tmp_dir/project.json"
list_all_deployments "$tmp_dir/deployments-all.json"

jq -e --arg project "$PROJECT_NAME" --arg expected_repository "$EXPECTED_REPOSITORY" '
  .success == true and .result.name == $project and .result.source.type == "github" and .result.production_branch == "main"
  and (((.result.source.config.owner // "") + "/" + (.result.source.config.repo_name // "")) == $expected_repository)
' "$tmp_dir/project.json" >/dev/null

jq --arg expected_repository "$EXPECTED_REPOSITORY" '{
  project:.result.name,project_id:.result.id,production_branch:.result.production_branch,source_type:.result.source.type,
  repository:((.result.source.config.owner // "") + "/" + (.result.source.config.repo_name // "")),
  repository_matches_expected:(((.result.source.config.owner // "") + "/" + (.result.source.config.repo_name // "")) == $expected_repository),
  legacy_deployments_enabled:(.result.source.config.deployments_enabled // null),
  legacy_deployments_enabled_authoritative:false,
  production_deployments_enabled:.result.source.config.production_deployments_enabled,
  preview_deployment_setting:.result.source.config.preview_deployment_setting,
  preview_branch_includes:(.result.source.config.preview_branch_includes // []),
  preview_branch_excludes:(.result.source.config.preview_branch_excludes // []),
  preview_branch_rules_authoritative_only_when_custom:true,
  modified_on:.result.modified_on
}' "$tmp_dir/project.json" > "$RECEIPT_DIR/project-readback.json"

jq '[.[] | {id,environment,url,aliases:(.aliases // []),created_on,is_skipped:(.is_skipped // false),skip_reason:(.skip_reason // null),
  materialized:(((.is_skipped // false) != true) and ((.url // "") | (type == "string" and length > 0))),
  latest_stage_status:(.latest_stage.status // null),trigger_type:(.deployment_trigger.type // null),
  branch:(.deployment_trigger.metadata.branch // null),commit_hash:(.deployment_trigger.metadata.commit_hash // null),
  commit_message:(.deployment_trigger.metadata.commit_message // null)}] | sort_by(.created_on) | reverse' \
  "$tmp_dir/deployments-all.json" > "$RECEIPT_DIR/deployments.json"

jq '.[0] // null' "$RECEIPT_DIR/deployments.json" > "$RECEIPT_DIR/latest-attempt.json"
jq '[.[] | select(.materialized == true)][0] // null' "$RECEIPT_DIR/deployments.json" > "$RECEIPT_DIR/latest-deployment.json"

settings_pass="$(jq -r '
  .repository_matches_expected == true
  and .production_deployments_enabled == false
  and .preview_deployment_setting == "none"
' "$RECEIPT_DIR/project-readback.json")"
preview_count="$(jq '[.[] | select(.environment == "preview" and .materialized == true)] | length' "$RECEIPT_DIR/deployments.json")"
skipped_preview_attempt_count="$(jq '[.[] | select(.environment == "preview" and .is_skipped == true)] | length' "$RECEIPT_DIR/deployments.json")"
latest_governed="$(jq -r --arg expected_repository "$EXPECTED_REPOSITORY" '
  . != null and .environment == "production" and .trigger_type == "ad_hoc" and .branch == "main"
  and (.commit_hash | type == "string" and test("^[0-9a-f]{40}$"))
  and (.commit_message | type == "string" and startswith("[KIDULTS-GOVERNED-STAGING] repository=" + $expected_repository + " "))
  and .latest_stage_status == "success"
' "$RECEIPT_DIR/latest-deployment.json")"

state="VERIFIED_FAIL"
[[ "$settings_pass" == "true" && "$latest_governed" == "true" && "$preview_count" -eq 0 ]] && state="COMPLETE_VERIFIED"

jq -n --arg state "$state" --arg project "$PROJECT_NAME" --arg current_main_sha "${GITHUB_SHA:-UNKNOWN}" \
  --argjson settings_pass "$settings_pass" --argjson latest_deployment_governed "$latest_governed" \
  --argjson visible_preview_count "$preview_count" --argjson skipped_preview_attempt_count "$skipped_preview_attempt_count" \
  --slurpfile project_readback "$RECEIPT_DIR/project-readback.json" --slurpfile latest "$RECEIPT_DIR/latest-deployment.json" \
  --slurpfile latest_attempt "$RECEIPT_DIR/latest-attempt.json" '{
    id:"kidults-cloudflare-pages-boundary-readonly-receipt-v1",state:$state,project:$project,current_main_sha:$current_main_sha,
    settings_pass:$settings_pass,latest_deployment_governed:$latest_deployment_governed,
    visible_preview_count:$visible_preview_count,skipped_preview_attempt_count:$skipped_preview_attempt_count,
    project_readback:$project_readback[0],latest_attempt:$latest_attempt[0],latest_deployment:$latest[0],
    latest_deployment_matches_current_main:(($latest[0].commit_hash // null) == $current_main_sha),current_main_match_is_informational:true,
    cloudflare_api_called:true,settings_readback_complete:true,deployment_inventory_complete:true,read_only:true,
    settings_mutated:false,deployment_created:false,deployment_deleted:false,platform_environment:"STAGING",
    public_release:"HOLD",production:"HOLD",g5:"HOLD"
  }' > "$RECEIPT_DIR/final.json"
cat "$RECEIPT_DIR/final.json"
[[ "$state" == "COMPLETE_VERIFIED" ]]
