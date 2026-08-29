#!/usr/bin/env bash
set -euo pipefail

APPROVAL_ID="${APPROVAL_ID:-CF-KIDULTS-14501AC-01}"
APPROVAL_RECEIPT_PATH="${APPROVAL_RECEIPT_PATH:-coordination/kidults/runtime/cf-kidults-14501ac-01-approval.json}"
TARGET_SHA="${TARGET_SHA:-14501ac022bdd7c918924a207f257b047b1ba970}"
PROJECT_NAME="${CLOUDFLARE_PAGES_PROJECT_NAME:-kidults-workspace-staging}"
EXPECTED_REPOSITORY="${EXPECTED_REPOSITORY:-johnkim9524-collab/kaios_enterprise_repo}"
EXPECTED_ACCOUNT_ID="${EXPECTED_CLOUDFLARE_ACCOUNT_ID:-235eaa51d04e7f4436a9faa507a04f9d}"
SOURCE_DIR="${SOURCE_DIR:-target-source/apps/kidults-enterprise-staging/public}"
RECEIPT_ROOT="${RECEIPT_ROOT:-artifacts/cf-kidults-14501ac-01}"
MAX_PREVIEW_DELETIONS="${MAX_PREVIEW_DELETIONS:-588}"
PAGE_SIZE="${PAGE_SIZE:-25}"
MAX_PAGES="${MAX_PAGES:-100}"
API_BASE="https://api.cloudflare.com/client/v4"
API_ROOT="${API_BASE}/accounts/${CLOUDFLARE_ACCOUNT_ID:-MISSING}/pages/projects/${PROJECT_NAME}"
CONTROL_RECEIPT="${RECEIPT_ROOT}/final.json"

mkdir -p "$RECEIPT_ROOT"
tmp_dir="$(mktemp -d)"
current_stage="INITIALIZE"
provider_http_status="NOT_CALLED"
provider_error_codes='[]'
cloudflare_api_called=false
deleted_preview_count=0
deployment_created=false
new_deployment_id=""
production_history_preserved=false
preview_zero_verified=false
approval_consumed=false

cleanup_tmp() { rm -rf "$tmp_dir"; }

write_receipt() {
  local state="$1" reason_code="$2" exit_code="$3"
  local now_utc
  now_utc="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  jq -n \
    --arg id "cf-kidults-14501ac-01-execution-receipt-v1" \
    --arg state "$state" \
    --arg reason_code "$reason_code" \
    --arg approval_id "$APPROVAL_ID" \
    --arg target_sha "$TARGET_SHA" \
    --arg control_sha "${GITHUB_SHA:-UNKNOWN}" \
    --arg project "$PROJECT_NAME" \
    --arg repository "$EXPECTED_REPOSITORY" \
    --arg stage "$current_stage" \
    --arg provider_http_status "$provider_http_status" \
    --arg new_deployment_id "$new_deployment_id" \
    --arg observed_at "$now_utc" \
    --argjson provider_error_codes "$provider_error_codes" \
    --argjson exit_code "$exit_code" \
    --argjson cloudflare_api_called "$cloudflare_api_called" \
    --argjson approval_consumed "$approval_consumed" \
    --argjson deleted_preview_count "$deleted_preview_count" \
    --argjson deployment_created "$deployment_created" \
    --argjson production_history_preserved "$production_history_preserved" \
    --argjson preview_zero_verified "$preview_zero_verified" \
    --argjson max_preview_deletions "$MAX_PREVIEW_DELETIONS" \
    '{
      id:$id,
      state:$state,
      reason_code:$reason_code,
      exit_code:$exit_code,
      approval:{id:$approval_id,consumed:$approval_consumed,one_time:true},
      target_sha:$target_sha,
      control_sha:$control_sha,
      project:$project,
      repository:$repository,
      stage:$stage,
      cloudflare_api_called:$cloudflare_api_called,
      provider_http_status:$provider_http_status,
      provider_error_codes:$provider_error_codes,
      max_preview_deletions:$max_preview_deletions,
      deleted_preview_count:$deleted_preview_count,
      preview_zero_verified:$preview_zero_verified,
      production_history_preserved:$production_history_preserved,
      deployment_created:$deployment_created,
      new_deployment_id:(if $new_deployment_id == "" then null else $new_deployment_id end),
      settings_mutated:false,
      automatic_git_deployments_enabled:false,
      pages_project_deleted:false,
      production_deployment_deleted:false,
      observed_at_utc:$observed_at,
      platform_environment:"STAGING",
      public_release:"HOLD",
      production:"HOLD",
      g5:"HOLD"
    }' > "$CONTROL_RECEIPT"
}

on_exit() {
  local rc=$?
  trap - EXIT
  if [[ "$rc" -ne 0 ]]; then
    write_receipt "BLOCKED_FAIL_CLOSED" "${FAILURE_REASON:-UNEXPECTED_FAILURE}" "$rc"
  fi
  cleanup_tmp
  exit "$rc"
}
trap on_exit EXIT

fail() {
  FAILURE_REASON="$1"
  local rc="${2:-67}"
  return "$rc"
}

current_stage="VALIDATE_LOCAL_INPUTS"
[[ "$APPROVAL_ID" == "CF-KIDULTS-14501AC-01" ]] || fail "APPROVAL_ID_MISMATCH" 64
[[ "$TARGET_SHA" == "14501ac022bdd7c918924a207f257b047b1ba970" ]] || fail "TARGET_SHA_MISMATCH" 64
[[ "$PROJECT_NAME" == "kidults-workspace-staging" ]] || fail "PROJECT_MISMATCH" 64
[[ "$EXPECTED_REPOSITORY" == "johnkim9524-collab/kaios_enterprise_repo" ]] || fail "REPOSITORY_MISMATCH" 64
[[ "$EXPECTED_ACCOUNT_ID" == "235eaa51d04e7f4436a9faa507a04f9d" ]] || fail "EXPECTED_ACCOUNT_ID_MISMATCH" 64
[[ "$MAX_PREVIEW_DELETIONS" =~ ^[0-9]+$ ]] && (( MAX_PREVIEW_DELETIONS == 588 )) || fail "MAX_PREVIEW_BOUND_MISMATCH" 64
[[ "$PAGE_SIZE" =~ ^[1-9][0-9]*$ ]] && (( PAGE_SIZE <= 25 )) || fail "INVALID_PAGE_SIZE" 64
[[ "$MAX_PAGES" =~ ^[1-9][0-9]*$ ]] && (( MAX_PAGES <= 100 )) || fail "INVALID_MAX_PAGES" 64
[[ -n "${CLOUDFLARE_API_TOKEN:-}" && -n "${CLOUDFLARE_ACCOUNT_ID:-}" ]] || fail "CLOUDFLARE_CREDENTIALS_ABSENT" 65
[[ "$CLOUDFLARE_ACCOUNT_ID" == "$EXPECTED_ACCOUNT_ID" ]] || fail "CONFIGURED_ACCOUNT_ID_PARITY_FAILURE" 65
[[ -f "$APPROVAL_RECEIPT_PATH" ]] || fail "APPROVAL_RECEIPT_MISSING" 65
[[ -d "$SOURCE_DIR" ]] || fail "TARGET_SOURCE_DIRECTORY_MISSING" 65
[[ "${GITHUB_RUN_ATTEMPT:-}" == "1" ]] || fail "ONE_TIME_APPROVAL_REPLAY_REFUSED" 65

current_stage="VALIDATE_APPROVAL_RECEIPT"
now_epoch="$(date -u +%s)"
expiry_epoch="$(date -u -d "$(jq -r '.expires_at' "$APPROVAL_RECEIPT_PATH")" +%s)"
(( now_epoch <= expiry_epoch )) || fail "APPROVAL_EXPIRED" 65
jq -e \
  --arg approval_id "$APPROVAL_ID" \
  --arg target_sha "$TARGET_SHA" \
  --arg project "$PROJECT_NAME" \
  --arg repository "$EXPECTED_REPOSITORY" \
  --arg account_id "$EXPECTED_ACCOUNT_ID" \
  '.state == "PROGRAM_OWNER_EXPLICIT_ONE_SHOT_APPROVAL"
   and .approval_id == $approval_id
   and .source_event_id == $approval_id
   and .source_text_sha256 == "sha256:69bb0b446992e067269b36beb11f936f52e2a08d104d94d9f9940f2a6c9ad71f"
   and .one_time == true
   and .target_sha == $target_sha
   and .repository == $repository
   and .project == $project
   and .expected_account_id == $account_id
   and .max_materialized_preview_deletions == 588
   and .authorization.read_only_parity_preflight == true
   and .authorization.delete_materialized_preview_only == true
   and .authorization.preserve_all_production_deployments == true
   and .authorization.governed_staging_deploy_once == true
   and .authorization.final_read_only_verification == true
   and .forbidden.enable_automatic_git_deployments == true
   and .forbidden.delete_production_deployments == true
   and .forbidden.delete_pages_project == true
   and .forbidden.public_release == true
   and .forbidden.platform_production == true
   and .forbidden.g5 == true' \
  "$APPROVAL_RECEIPT_PATH" >/dev/null || fail "APPROVAL_RECEIPT_INVALID" 65
approval_consumed=true
write_receipt "APPROVAL_CONSUMED_PREFLIGHT_PENDING" "NONE" 0

echo "::add-mask::$CLOUDFLARE_API_TOKEN"
echo "::add-mask::$CLOUDFLARE_ACCOUNT_ID"

extract_error_codes() {
  local file="$1"
  jq -c 'if type == "object" then [(.errors // [])[]?.code] else [] end' "$file" 2>/dev/null || printf '[]\n'
}

cf_request() {
  local method="$1" url="$2" output="$3"
  shift 3
  local http_code rc
  cloudflare_api_called=true
  write_receipt "IN_PROGRESS" "NONE" 0
  set +e
  http_code="$(curl --silent --show-error \
    --connect-timeout 10 --max-time 45 \
    --request "$method" \
    --header "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
    --header "Accept: application/json" \
    --output "$output" \
    --write-out '%{http_code}' \
    "$@" "$url")"
  rc=$?
  set -e
  if [[ "$rc" -ne 0 ]]; then
    provider_http_status="000"
    provider_error_codes='[]'
    fail "PROVIDER_TRANSPORT_OR_TIMEOUT" 68
    return
  fi
  [[ "$http_code" =~ ^[0-9]{3}$ ]] || http_code="000"
  provider_http_status="$http_code"
  provider_error_codes="$(extract_error_codes "$output")"
  if [[ ! "$http_code" =~ ^2[0-9][0-9]$ ]]; then
    case "$http_code" in
      401) fail "PROVIDER_HTTP_401" 67 ;;
      403) fail "PROVIDER_HTTP_403" 67 ;;
      404) fail "PROVIDER_HTTP_404" 67 ;;
      5??) fail "PROVIDER_HTTP_5XX" 68 ;;
      *) fail "PROVIDER_HTTP_NON_SUCCESS" 67 ;;
    esac
    return
  fi
}

list_all_deployments() {
  local prefix="$1" output="$2"
  local page=1 total_pages=1 page_file ndjson
  ndjson="$tmp_dir/${prefix}.ndjson"
  : > "$ndjson"
  while (( page <= total_pages )); do
    (( page <= MAX_PAGES )) || fail "DEPLOYMENT_INVENTORY_MAX_PAGES_EXCEEDED" 68
    page_file="$tmp_dir/${prefix}-page-${page}.json"
    current_stage="${prefix^^}_DEPLOYMENT_INVENTORY_PAGE_${page}"
    cf_request GET "$API_ROOT/deployments" "$page_file" --get --data-urlencode "per_page=${PAGE_SIZE}" --data-urlencode "page=${page}"
    jq -e '.success == true and (.result | type == "array")' "$page_file" >/dev/null || fail "DEPLOYMENT_INVENTORY_INVALID_RESPONSE" 67
    jq -c '.result[]' "$page_file" >> "$ndjson"
    total_pages="$(jq -r '(.result_info.total_pages // 1) | if type == "number" and . >= 1 and floor == . then . else error("invalid total_pages") end' "$page_file")"
    (( total_pages <= MAX_PAGES )) || fail "DEPLOYMENT_INVENTORY_BOUNDED_LIMIT_EXCEEDED" 68
    page=$((page + 1))
  done
  if [[ -s "$ndjson" ]]; then jq -s '.' "$ndjson" > "$output"; else printf '[]\n' > "$output"; fi
}

normalize_deployments() {
  jq '[.[] | {
    id,
    environment,
    url,
    created_on,
    is_skipped:(.is_skipped // false),
    skip_reason:(.skip_reason // null),
    materialized:(((.is_skipped // false) != true) and ((.url // "") | (type == "string" and length > 0))),
    latest_stage_status:(.latest_stage.status // null),
    trigger_type:(.deployment_trigger.type // null),
    branch:(.deployment_trigger.metadata.branch // null),
    commit_hash:(.deployment_trigger.metadata.commit_hash // null),
    commit_message:(.deployment_trigger.metadata.commit_message // null)
  }]'
}

current_stage="TOKEN_VERIFY"
cf_request GET "$API_BASE/user/tokens/verify" "$tmp_dir/token-verify.json"
jq -e '.success == true and .result.status == "active"' "$tmp_dir/token-verify.json" >/dev/null || fail "TOKEN_INVALID_OR_INACTIVE" 65

current_stage="PROJECT_PARITY_PREFLIGHT"
cf_request GET "$API_ROOT" "$tmp_dir/project-before.json"
jq -e \
  --arg project "$PROJECT_NAME" \
  --arg repository "$EXPECTED_REPOSITORY" \
  '.success == true
   and .result.name == $project
   and .result.source.type == "github"
   and (((.result.source.config.owner // "") + "/" + (.result.source.config.repo_name // "")) == $repository)
   and .result.production_branch == "main"
   and .result.source.config.production_deployments_enabled == false
   and .result.source.config.preview_deployment_setting == "none"' \
  "$tmp_dir/project-before.json" >/dev/null || fail "ACCOUNT_PROJECT_REPOSITORY_OR_SETTINGS_PARITY_FAILURE" 67

list_all_deployments "initial" "$tmp_dir/initial-raw.json"
normalize_deployments < "$tmp_dir/initial-raw.json" > "$tmp_dir/initial.json"
initial_production_ids="$(jq -c '[.[] | select(.environment == "production") | .id] | unique | sort' "$tmp_dir/initial.json")"
initial_preview_ids="$(jq -c '[.[] | select(.environment == "preview" and .materialized == true) | .id] | unique | sort' "$tmp_dir/initial.json")"
initial_preview_count="$(jq 'length' <<<"$initial_preview_ids")"
(( initial_preview_count <= MAX_PREVIEW_DELETIONS )) || fail "MATERIALIZED_PREVIEW_COUNT_EXCEEDS_APPROVED_BOUND" 67
(( $(jq 'length' <<<"$initial_production_ids") >= 1 )) || fail "NO_PRODUCTION_HISTORY_VISIBLE" 67
jq -n --argjson production_ids "$initial_production_ids" --argjson preview_ids "$initial_preview_ids" \
  '{production_ids:$production_ids,materialized_preview_ids:$preview_ids}' > "$RECEIPT_ROOT/preflight-inventory.json"

current_stage="DELETE_MATERIALIZED_PREVIEW_ONLY"
index=0
while IFS= read -r deployment_id; do
  [[ -n "$deployment_id" ]] || continue
  index=$((index + 1))
  current_stage="DELETE_MATERIALIZED_PREVIEW_${index}_OF_${initial_preview_count}"
  cf_request DELETE "$API_ROOT/deployments/$deployment_id" "$tmp_dir/delete-${deployment_id}.json" --url-query "force=true"
  jq -e '.success == true' "$tmp_dir/delete-${deployment_id}.json" >/dev/null || fail "PREVIEW_DELETE_RESPONSE_NOT_SUCCESS" 67
  deleted_preview_count=$((deleted_preview_count + 1))
  jq -cn --arg id "$deployment_id" --argjson sequence "$index" '{deployment_id:$id,sequence:$sequence,result:"DELETED_MATERIALIZED_PREVIEW"}' >> "$RECEIPT_ROOT/deletions.ndjson"
done < <(jq -r '.[]' <<<"$initial_preview_ids")

list_all_deployments "post_cleanup" "$tmp_dir/post-cleanup-raw.json"
normalize_deployments < "$tmp_dir/post-cleanup-raw.json" > "$tmp_dir/post-cleanup.json"
post_cleanup_production_ids="$(jq -c '[.[] | select(.environment == "production") | .id] | unique | sort' "$tmp_dir/post-cleanup.json")"
remaining_preview_ids="$(jq -c '[.[] | select(.environment == "preview" and .materialized == true) | .id] | unique | sort' "$tmp_dir/post-cleanup.json")"
[[ "$initial_production_ids" == "$post_cleanup_production_ids" ]] || fail "PRODUCTION_HISTORY_CHANGED_DURING_PREVIEW_CLEANUP" 67
(( $(jq 'length' <<<"$remaining_preview_ids") == 0 )) || fail "MATERIALIZED_PREVIEW_REMAINS_AFTER_CLEANUP" 67
production_history_preserved=true
preview_zero_verified=true
write_receipt "PREVIEW_RETIREMENT_COMPLETE_DEPLOYMENT_PENDING" "NONE" 0

current_stage="TARGET_SOURCE_VALIDATION"
[[ "$(git -C target-source rev-parse HEAD)" == "$TARGET_SHA" ]] || fail "TARGET_CHECKOUT_SHA_MISMATCH" 65
! find "$SOURCE_DIR" -type l -print -quit | grep -q . || fail "TARGET_SOURCE_SYMLINK_PROHIBITED" 66
find "$SOURCE_DIR" -type f -print0 | sort -z | xargs -0 sha256sum | sha256sum | awk '{print "sha256:"$1}' > "$RECEIPT_ROOT/source-tree.sha256"
source_tree_sha256="$(cat "$RECEIPT_ROOT/source-tree.sha256")"

current_stage="GOVERNED_STAGING_DEPLOY"
commit_message="[KIDULTS-GOVERNED-STAGING] approval_id=${APPROVAL_ID} repository=${EXPECTED_REPOSITORY} source_sha=${TARGET_SHA} run=${GITHUB_RUN_ID} attempt=${GITHUB_RUN_ATTEMPT}"
set +e
npx --yes wrangler@4.127.1 pages deploy "$SOURCE_DIR" \
  --project-name "$PROJECT_NAME" \
  --branch main \
  --commit-hash "$TARGET_SHA" \
  --commit-message "$commit_message" > "$RECEIPT_ROOT/wrangler-deploy.log" 2>&1
deploy_rc=$?
set -e
[[ "$deploy_rc" -eq 0 ]] || fail "WRANGLER_DEPLOY_FAILED" "$deploy_rc"

current_stage="GOVERNED_DEPLOYMENT_READBACK"
for attempt in $(seq 1 60); do
  cf_request GET "$API_ROOT/deployments" "$tmp_dir/deployments-after-page1.json" --get --data-urlencode "per_page=25" --data-urlencode "page=1"
  jq -e '.success == true and (.result | type == "array")' "$tmp_dir/deployments-after-page1.json" >/dev/null || fail "DEPLOYMENT_READBACK_INVALID_RESPONSE" 67
  jq --arg sha "$TARGET_SHA" --arg message "$commit_message" '
    [.result[] | select(
      .environment == "production"
      and (.is_skipped // false) != true
      and (.deployment_trigger.type // null) == "ad_hoc"
      and (.deployment_trigger.metadata.branch // null) == "main"
      and (.deployment_trigger.metadata.commit_hash // null) == $sha
      and (.deployment_trigger.metadata.commit_message // null) == $message
    )] | sort_by(.created_on) | reverse | .[0] // null
  ' "$tmp_dir/deployments-after-page1.json" > "$tmp_dir/governed-deployment.json"
  if jq -e '. != null and (.latest_stage.status // null) == "success"' "$tmp_dir/governed-deployment.json" >/dev/null; then
    new_deployment_id="$(jq -r '.id' "$tmp_dir/governed-deployment.json")"
    deployment_created=true
    cp "$tmp_dir/governed-deployment.json" "$RECEIPT_ROOT/governed-deployment.json"
    break
  fi
  if jq -e '. != null and ((.latest_stage.status // null) == "failure" or (.latest_stage.status // null) == "canceled")' "$tmp_dir/governed-deployment.json" >/dev/null; then
    fail "GOVERNED_DEPLOYMENT_TERMINAL_FAILURE" 67
  fi
  sleep 5
done
[[ "$deployment_created" == "true" && -n "$new_deployment_id" ]] || fail "GOVERNED_DEPLOYMENT_SUCCESS_NOT_OBSERVED" 68

current_stage="FINAL_READ_ONLY_VERIFICATION"
cf_request GET "$API_ROOT" "$tmp_dir/project-final.json"
jq -e \
  --arg project "$PROJECT_NAME" \
  --arg repository "$EXPECTED_REPOSITORY" \
  '.success == true
   and .result.name == $project
   and .result.source.type == "github"
   and (((.result.source.config.owner // "") + "/" + (.result.source.config.repo_name // "")) == $repository)
   and .result.production_branch == "main"
   and .result.source.config.production_deployments_enabled == false
   and .result.source.config.preview_deployment_setting == "none"' \
  "$tmp_dir/project-final.json" >/dev/null || fail "FINAL_PROJECT_SETTINGS_OR_BINDING_FAILURE" 67

list_all_deployments "final" "$tmp_dir/final-raw.json"
normalize_deployments < "$tmp_dir/final-raw.json" > "$tmp_dir/final-deployments.json"
final_preview_count="$(jq '[.[] | select(.environment == "preview" and .materialized == true)] | length' "$tmp_dir/final-deployments.json")"
(( final_preview_count == 0 )) || fail "FINAL_MATERIALIZED_PREVIEW_COUNT_NONZERO" 67
final_production_ids="$(jq -c '[.[] | select(.environment == "production") | .id] | unique | sort' "$tmp_dir/final-deployments.json")"
missing_initial_production="$(jq -n --argjson initial "$initial_production_ids" --argjson final "$final_production_ids" '$initial - $final | length')"
(( missing_initial_production == 0 )) || fail "FINAL_PRODUCTION_HISTORY_MISSING_IDS" 67
jq -e --arg id "$new_deployment_id" --arg sha "$TARGET_SHA" --arg message "$commit_message" '
  any(.[];
    .id == $id
    and .environment == "production"
    and .materialized == true
    and .latest_stage_status == "success"
    and .trigger_type == "ad_hoc"
    and .branch == "main"
    and .commit_hash == $sha
    and .commit_message == $message
  )' "$tmp_dir/final-deployments.json" >/dev/null || fail "FINAL_GOVERNED_DEPLOYMENT_NOT_VERIFIED" 67

production_history_preserved=true
preview_zero_verified=true
cp "$tmp_dir/final-deployments.json" "$RECEIPT_ROOT/final-deployments.json"
jq -n \
  --arg approval_id "$APPROVAL_ID" \
  --arg target_sha "$TARGET_SHA" \
  --arg source_tree_sha256 "$source_tree_sha256" \
  --arg deployment_id "$new_deployment_id" \
  --argjson initial_preview_count "$initial_preview_count" \
  --argjson deleted_preview_count "$deleted_preview_count" \
  --argjson initial_production_ids "$initial_production_ids" \
  --argjson final_production_ids "$final_production_ids" \
  '{
    approval_id:$approval_id,
    target_sha:$target_sha,
    source_tree_sha256:$source_tree_sha256,
    initial_materialized_preview_count:$initial_preview_count,
    deleted_materialized_preview_count:$deleted_preview_count,
    remaining_materialized_preview_count:0,
    initial_production_ids:$initial_production_ids,
    final_production_ids:$final_production_ids,
    governed_deployment_id:$deployment_id,
    production_history_preserved:true,
    automatic_git_deployments_disabled:true,
    public_release:"HOLD",
    production:"HOLD",
    g5:"HOLD"
  }' > "$RECEIPT_ROOT/verification-summary.json"

current_stage="COMPLETE"
provider_http_status="200"
provider_error_codes='[]'
write_receipt "COMPLETE_VERIFIED" "NONE" 0
trap - EXIT
cleanup_tmp
cat "$CONTROL_RECEIPT"
