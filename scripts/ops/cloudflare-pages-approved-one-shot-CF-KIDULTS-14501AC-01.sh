#!/usr/bin/env bash
set -Eeuo pipefail

APPROVAL_ID="CF-KIDULTS-14501AC-01"
TARGET_SHA="14501ac022bdd7c918924a207f257b047b1ba970"
APPROVAL_ISSUED_AT="2026-08-29T14:33:31Z"
APPROVAL_EXPIRES_AT="2026-08-29T15:33:31Z"
MAX_PREVIEW_DELETIONS=588
APPROVAL_FILE="coordination/kidults/runtime/cloudflare-one-shot-approval-CF-KIDULTS-14501AC-01.json"
PROJECT_NAME="${CLOUDFLARE_PAGES_PROJECT_NAME:-kidults-workspace-staging}"
EXPECTED_REPOSITORY="${EXPECTED_REPOSITORY:-johnkim9524-collab/kaios_enterprise_repo}"
SOURCE_DIR_REL="apps/kidults-enterprise-staging/public"
RECEIPT_DIR="${RECEIPT_DIR:-artifacts/cloudflare-approved-one-shot-CF-KIDULTS-14501AC-01}"
PAGE_SIZE=25
MAX_PAGES=100
API_BASE="https://api.cloudflare.com/client/v4"

mkdir -p "$RECEIPT_DIR"
: > "$RECEIPT_DIR/deletions.ndjson"
tmp_dir="$(mktemp -d)"
source_root=""
provider_call_count=0
deleted_preview_count=0
deployment_created=false
preview_cleanup_complete=false
cloudflare_api_called=false
LAST_HTTP_STATUS="NOT_CALLED"
LAST_CURL_EXIT=0
LAST_ERROR_CODES='[]'
LAST_PROVIDER_STAGE="NOT_CALLED"

cleanup() {
  if [[ -n "$source_root" && -d "$source_root" ]]; then
    git worktree remove --force "$source_root" >/dev/null 2>&1 || true
  fi
  rm -rf "$tmp_dir"
}
trap cleanup EXIT

account_digest="UNKNOWN"
if [[ -n "${CLOUDFLARE_ACCOUNT_ID:-}" ]]; then
  account_digest="sha256:$(printf '%s' "$CLOUDFLARE_ACCOUNT_ID" | sha256sum | awk '{print $1}')"
fi

jq -n \
  --arg id "$APPROVAL_ID" \
  --arg state "PREFLIGHT_PENDING" \
  --arg target_sha "$TARGET_SHA" \
  --arg control_sha "${GITHUB_SHA:-UNKNOWN}" \
  --arg project "$PROJECT_NAME" \
  --arg repository "$EXPECTED_REPOSITORY" \
  --arg issued_at "$APPROVAL_ISSUED_AT" \
  --arg expires_at "$APPROVAL_EXPIRES_AT" \
  --arg account_id_digest "$account_digest" \
  --argjson max_preview_deletions "$MAX_PREVIEW_DELETIONS" \
  '{
    id:$id,
    state:$state,
    target_sha:$target_sha,
    control_sha:$control_sha,
    project:$project,
    repository:$repository,
    issued_at:$issued_at,
    expires_at:$expires_at,
    max_materialized_preview_deletions:$max_preview_deletions,
    account_id_digest:$account_id_digest,
    approval_validated:false,
    approval_consumed:true,
    cloudflare_api_called:false,
    provider_call_count:0,
    preview_cleanup_complete:false,
    deleted_preview_count:0,
    existing_production_ids_preserved:true,
    production_deployment_deleted:false,
    settings_mutated:false,
    deployment_created:false,
    public_release:"HOLD",
    production:"HOLD",
    g5:"HOLD"
  }' > "$RECEIPT_DIR/final.json"

patch_receipt() {
  local state="$1" reason_code="$2" failure_stage="$3" exit_code="$4"
  jq \
    --arg state "$state" \
    --arg reason_code "$reason_code" \
    --arg failure_stage "$failure_stage" \
    --arg last_http_status "$LAST_HTTP_STATUS" \
    --arg last_provider_stage "$LAST_PROVIDER_STAGE" \
    --argjson exit_code "$exit_code" \
    --argjson provider_call_count "$provider_call_count" \
    --argjson deleted_preview_count "$deleted_preview_count" \
    --argjson cloudflare_api_called "$cloudflare_api_called" \
    --argjson preview_cleanup_complete "$preview_cleanup_complete" \
    --argjson deployment_created "$deployment_created" \
    --argjson last_curl_exit "$LAST_CURL_EXIT" \
    --argjson last_error_codes "$LAST_ERROR_CODES" \
    '.state=$state
     | .reason_code=$reason_code
     | .failure_stage=$failure_stage
     | .exit_code=$exit_code
     | .cloudflare_api_called=$cloudflare_api_called
     | .provider_call_count=$provider_call_count
     | .deleted_preview_count=$deleted_preview_count
     | .preview_cleanup_complete=$preview_cleanup_complete
     | .deployment_created=$deployment_created
     | .last_provider_status={stage:$last_provider_stage,http_status:$last_http_status,curl_exit:$last_curl_exit,error_codes:$last_error_codes}
     | .production_deployment_deleted=false
     | .settings_mutated=false
     | .public_release="HOLD"
     | .production="HOLD"
     | .g5="HOLD"' \
    "$RECEIPT_DIR/final.json" > "$RECEIPT_DIR/final.tmp.json"
  mv "$RECEIPT_DIR/final.tmp.json" "$RECEIPT_DIR/final.json"
}

fail_closed() {
  local state="$1" reason_code="$2" failure_stage="$3" exit_code="$4"
  patch_receipt "$state" "$reason_code" "$failure_stage" "$exit_code"
  cat "$RECEIPT_DIR/final.json"
  exit "$exit_code"
}

[[ "$PROJECT_NAME" == "kidults-workspace-staging" ]] || fail_closed "REFUSED_INVALID_INPUT" "UNEXPECTED_PROJECT" "LOCAL_PREFLIGHT" 64
[[ "$EXPECTED_REPOSITORY" == "johnkim9524-collab/kaios_enterprise_repo" ]] || fail_closed "REFUSED_INVALID_INPUT" "UNEXPECTED_REPOSITORY" "LOCAL_PREFLIGHT" 64
[[ "${GITHUB_REPOSITORY:-}" == "$EXPECTED_REPOSITORY" ]] || fail_closed "REFUSED_INVALID_INPUT" "GITHUB_REPOSITORY_MISMATCH" "LOCAL_PREFLIGHT" 64
[[ "${GITHUB_REF:-}" == "refs/heads/main" ]] || fail_closed "REFUSED_INVALID_INPUT" "NON_MAIN_REF" "LOCAL_PREFLIGHT" 64
[[ "${GITHUB_SHA:-}" =~ ^[0-9a-f]{40}$ ]] || fail_closed "REFUSED_INVALID_INPUT" "INVALID_CONTROL_SHA" "LOCAL_PREFLIGHT" 64
[[ -f "$APPROVAL_FILE" ]] || fail_closed "REFUSED_INVALID_INPUT" "APPROVAL_FILE_MISSING" "LOCAL_PREFLIGHT" 64
[[ -n "${CLOUDFLARE_API_TOKEN:-}" && -n "${CLOUDFLARE_ACCOUNT_ID:-}" ]] || fail_closed "BLOCKED_CREDENTIALS_ABSENT" "STAGING_DEPLOY_CREDENTIALS_ABSENT" "LOCAL_PREFLIGHT" 65
[[ "$CLOUDFLARE_ACCOUNT_ID" =~ ^[0-9a-f]{32}$ ]] || fail_closed "BLOCKED_ACCOUNT_ID_INVALID" "ACCOUNT_ID_FORMAT_INVALID" "LOCAL_PREFLIGHT" 65

jq -e \
  --arg id "$APPROVAL_ID" \
  --arg repository "$EXPECTED_REPOSITORY" \
  --arg project "$PROJECT_NAME" \
  --arg target_sha "$TARGET_SHA" \
  --arg issued_at "$APPROVAL_ISSUED_AT" \
  --arg expires_at "$APPROVAL_EXPIRES_AT" \
  --argjson max_preview "$MAX_PREVIEW_DELETIONS" \
  '.id == $id
   and .state == "PROGRAM_OWNER_EXPLICIT_OPERATION_SPECIFIC_APPROVAL"
   and .repository == $repository
   and .project == $project
   and .target_protected_main_sha == $target_sha
   and .issued_at == $issued_at
   and .expires_at == $expires_at
   and .one_time == true
   and .max_materialized_preview_deletions == $max_preview
   and (.authorized_operations | index("READ_ONLY_WRITE_ENVIRONMENT_ACCOUNT_PROJECT_REPOSITORY_PREFLIGHT")) != null
   and (.authorized_operations | index("DELETE_MATERIALIZED_PREVIEW_DEPLOYMENTS_ONLY_UP_TO_588")) != null
   and (.authorized_operations | index("CREATE_ONE_GOVERNED_STAGING_DEPLOYMENT_FROM_EXACT_APPROVED_SHA")) != null
   and (.forbidden_operations | index("DELETE_PRODUCTION_DEPLOYMENT")) != null
   and (.forbidden_operations | index("ENABLE_AUTOMATIC_GIT_DEPLOYMENTS")) != null
   and .public_release == "HOLD"
   and .production == "HOLD"
   and .g5 == "HOLD"' \
  "$APPROVAL_FILE" >/dev/null || fail_closed "BLOCKED_APPROVAL_INVALID" "APPROVAL_CONTRACT_MISMATCH" "LOCAL_PREFLIGHT" 65

now_epoch="$(date -u +%s)"
issued_epoch="$(date -u -d "$APPROVAL_ISSUED_AT" +%s)"
expires_epoch="$(date -u -d "$APPROVAL_EXPIRES_AT" +%s)"
(( now_epoch >= issued_epoch )) || fail_closed "BLOCKED_APPROVAL_INVALID" "APPROVAL_NOT_YET_VALID" "LOCAL_PREFLIGHT" 65
(( now_epoch <= expires_epoch )) || fail_closed "BLOCKED_APPROVAL_EXPIRED" "APPROVAL_EXPIRED" "LOCAL_PREFLIGHT" 65

git cat-file -e "${TARGET_SHA}^{commit}" 2>/dev/null || fail_closed "BLOCKED_SOURCE_INVALID" "APPROVED_SOURCE_SHA_NOT_PRESENT" "LOCAL_PREFLIGHT" 65
git merge-base --is-ancestor "$TARGET_SHA" "$GITHUB_SHA" || fail_closed "BLOCKED_SOURCE_INVALID" "APPROVED_SOURCE_NOT_ANCESTOR_OF_CONTROL_MAIN" "LOCAL_PREFLIGHT" 65

jq '.approval_validated=true | .state="APPROVAL_AND_LOCAL_PREFLIGHT_VERIFIED"' "$RECEIPT_DIR/final.json" > "$RECEIPT_DIR/final.tmp.json"
mv "$RECEIPT_DIR/final.tmp.json" "$RECEIPT_DIR/final.json"

API_ROOT="$API_BASE/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/$PROJECT_NAME"

mark_provider_call_started() {
  local stage="$1"
  cloudflare_api_called=true
  LAST_PROVIDER_STAGE="$stage"
  jq \
    --arg stage "$stage" \
    '.state="PROVIDER_CALL_STARTED"
     | .cloudflare_api_called=true
     | .provider_call_started_stage=$stage' \
    "$RECEIPT_DIR/final.json" > "$RECEIPT_DIR/final.tmp.json"
  mv "$RECEIPT_DIR/final.tmp.json" "$RECEIPT_DIR/final.json"
}

api_request() {
  local method="$1" url="$2" output="$3" stage="$4"
  local http_code rc
  provider_call_count=$((provider_call_count + 1))
  LAST_PROVIDER_STAGE="$stage"
  set +e
  http_code="$(curl --silent --show-error \
    --connect-timeout 10 \
    --max-time 45 \
    --request "$method" \
    --header "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
    --header "Accept: application/json" \
    --header "Content-Type: application/json" \
    --output "$output" \
    --write-out '%{http_code}' \
    "$url")"
  rc=$?
  set -e
  [[ "$http_code" =~ ^[0-9]{3}$ ]] || http_code="000"
  LAST_HTTP_STATUS="$http_code"
  LAST_CURL_EXIT="$rc"
  LAST_ERROR_CODES="$(jq -c 'if type == "object" then [(.errors // [])[]?.code] else [] end' "$output" 2>/dev/null || true)"
  [[ -n "$LAST_ERROR_CODES" ]] || LAST_ERROR_CODES='[]'
  if [[ "$rc" -ne 0 || ! "$http_code" =~ ^2[0-9][0-9]$ ]]; then
    return 1
  fi
  jq -e '.success == true' "$output" >/dev/null 2>&1
}

list_all_deployments() {
  local output="$1" prefix="$2"
  local page=1 total_pages=1 page_file ndjson
  ndjson="$tmp_dir/${prefix}-deployments.ndjson"
  : > "$ndjson"
  while (( page <= total_pages )); do
    (( page <= MAX_PAGES )) || return 2
    page_file="$tmp_dir/${prefix}-page-${page}.json"
    api_request GET "$API_ROOT/deployments?per_page=${PAGE_SIZE}&page=${page}" "$page_file" "${prefix^^}_DEPLOYMENT_INVENTORY_PAGE_${page}" || return 1
    jq -e '.result | type == "array"' "$page_file" >/dev/null || return 3
    jq -c '.result[]' "$page_file" >> "$ndjson"
    total_pages="$(jq -r '(.result_info.total_pages // 1) | if type == "number" and . >= 1 and floor == . then . else error("invalid total_pages") end' "$page_file" 2>/dev/null)" || return 3
    (( total_pages <= MAX_PAGES )) || return 2
    page=$((page + 1))
  done
  if [[ -s "$ndjson" ]]; then
    jq -s '.' "$ndjson" > "$output"
  else
    printf '[]\n' > "$output"
  fi
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
  }] | sort_by(.created_on) | reverse'
}

mark_provider_call_started "TOKEN_VERIFY"
api_request GET "$API_BASE/user/tokens/verify" "$tmp_dir/token-verify.json" "TOKEN_VERIFY" || fail_closed "BLOCKED_PROVIDER_PREFLIGHT" "TOKEN_VERIFY_HTTP_OR_TRANSPORT_FAILURE" "TOKEN_VERIFY" 67
jq -e '.result.status == "active"' "$tmp_dir/token-verify.json" >/dev/null || fail_closed "BLOCKED_PROVIDER_PREFLIGHT" "TOKEN_NOT_ACTIVE" "TOKEN_VERIFY" 67

api_request GET "$API_ROOT" "$tmp_dir/project-before.json" "PROJECT_READ_PREFLIGHT" || fail_closed "BLOCKED_PROVIDER_PREFLIGHT" "PROJECT_READ_HTTP_OR_TRANSPORT_FAILURE" "PROJECT_READ_PREFLIGHT" 67
jq -e \
  --arg project "$PROJECT_NAME" \
  --arg repository "$EXPECTED_REPOSITORY" \
  '.result.name == $project
   and .result.source.type == "github"
   and .result.production_branch == "main"
   and (((.result.source.config.owner // "") + "/" + (.result.source.config.repo_name // "")) == $repository)
   and .result.source.config.production_deployments_enabled == false
   and .result.source.config.preview_deployment_setting == "none"' \
  "$tmp_dir/project-before.json" >/dev/null || fail_closed "BLOCKED_PROVIDER_PREFLIGHT" "ACCOUNT_PROJECT_REPOSITORY_OR_SETTINGS_MISMATCH" "PROJECT_READ_PREFLIGHT" 67

jq --arg repository "$EXPECTED_REPOSITORY" '{
  project:.result.name,
  source_type:.result.source.type,
  repository:((.result.source.config.owner // "") + "/" + (.result.source.config.repo_name // "")),
  repository_matches_expected:(((.result.source.config.owner // "") + "/" + (.result.source.config.repo_name // "")) == $repository),
  production_branch:.result.production_branch,
  production_deployments_enabled:.result.source.config.production_deployments_enabled,
  preview_deployment_setting:.result.source.config.preview_deployment_setting
}' "$tmp_dir/project-before.json" > "$RECEIPT_DIR/project-guard-before.json"

set +e
list_all_deployments "$tmp_dir/initial-deployments-raw.json" initial
inventory_rc=$?
set -e
case "$inventory_rc" in
  0) ;;
  1) fail_closed "BLOCKED_PROVIDER_PREFLIGHT" "INITIAL_INVENTORY_HTTP_OR_TRANSPORT_FAILURE" "$LAST_PROVIDER_STAGE" 67 ;;
  2) fail_closed "BLOCKED_PROVIDER_PREFLIGHT" "INITIAL_INVENTORY_EXCEEDS_BOUNDED_PAGINATION" "INITIAL_INVENTORY" 67 ;;
  *) fail_closed "BLOCKED_PROVIDER_PREFLIGHT" "INITIAL_INVENTORY_INVALID_RESPONSE" "INITIAL_INVENTORY" 67 ;;
esac
normalize_deployments < "$tmp_dir/initial-deployments-raw.json" > "$tmp_dir/initial-deployments.json"

jq -c '[.[] | select(.environment == "production") | .id] | unique | sort' "$tmp_dir/initial-deployments.json" > "$RECEIPT_DIR/initial-production-ids.json"
jq -c '[.[] | select(.environment == "preview" and .materialized == true) | .id] | unique | sort' "$tmp_dir/initial-deployments.json" > "$RECEIPT_DIR/initial-materialized-preview-ids.json"
initial_production_count="$(jq 'length' "$RECEIPT_DIR/initial-production-ids.json")"
initial_preview_count="$(jq 'length' "$RECEIPT_DIR/initial-materialized-preview-ids.json")"
(( initial_production_count >= 1 )) || fail_closed "BLOCKED_PROVIDER_PREFLIGHT" "NO_PRODUCTION_HISTORY_VISIBLE" "INITIAL_INVENTORY" 67
(( initial_preview_count <= MAX_PREVIEW_DELETIONS )) || fail_closed "BLOCKED_PROVIDER_PREFLIGHT" "PREVIEW_COUNT_EXCEEDS_APPROVED_MAXIMUM" "INITIAL_INVENTORY" 67

initial_production_digest="sha256:$(sha256sum "$RECEIPT_DIR/initial-production-ids.json" | awk '{print $1}')"
initial_preview_digest="sha256:$(sha256sum "$RECEIPT_DIR/initial-materialized-preview-ids.json" | awk '{print $1}')"

jq \
  --arg state "PROVIDER_PREFLIGHT_VERIFIED" \
  --arg initial_production_id_digest "$initial_production_digest" \
  --arg initial_preview_id_digest "$initial_preview_digest" \
  --argjson initial_production_count "$initial_production_count" \
  --argjson initial_materialized_preview_count "$initial_preview_count" \
  --argjson provider_call_count "$provider_call_count" \
  '.state=$state
   | .provider_call_count=$provider_call_count
   | .initial_production_count=$initial_production_count
   | .initial_production_id_digest=$initial_production_id_digest
   | .initial_materialized_preview_count=$initial_materialized_preview_count
   | .initial_materialized_preview_id_digest=$initial_preview_id_digest
   | .account_project_repository_preflight=true
   | .automatic_git_production_deployments_disabled=true
   | .preview_deployment_setting_none=true' \
  "$RECEIPT_DIR/final.json" > "$RECEIPT_DIR/final.tmp.json"
mv "$RECEIPT_DIR/final.tmp.json" "$RECEIPT_DIR/final.json"

while IFS= read -r deployment_id; do
  [[ -n "$deployment_id" ]] || continue
  if ! api_request DELETE "$API_ROOT/deployments/$deployment_id?force=true" "$tmp_dir/delete-${deployment_id}.json" "DELETE_MATERIALIZED_PREVIEW"; then
    printf '%s\n' "$(jq -cn --arg id "$deployment_id" --arg http "$LAST_HTTP_STATUS" --argjson errors "$LAST_ERROR_CODES" '{deployment_id:$id,result:"FAILED",http_status:$http,error_codes:$errors}')" >> "$RECEIPT_DIR/deletions.ndjson"
    fail_closed "BLOCKED_PREVIEW_DELETE" "PREVIEW_DELETE_HTTP_OR_TRANSPORT_FAILURE" "DELETE_MATERIALIZED_PREVIEW" 68
  fi
  deleted_preview_count=$((deleted_preview_count + 1))
  printf '%s\n' "$(jq -cn --arg id "$deployment_id" '{deployment_id:$id,result:"DELETED_MATERIALIZED_PREVIEW"}')" >> "$RECEIPT_DIR/deletions.ndjson"
done < <(jq -r '.[]' "$RECEIPT_DIR/initial-materialized-preview-ids.json")

set +e
list_all_deployments "$tmp_dir/post-cleanup-deployments-raw.json" post_cleanup
post_cleanup_rc=$?
set -e
case "$post_cleanup_rc" in
  0) ;;
  1) fail_closed "BLOCKED_POST_CLEANUP_READBACK" "POST_CLEANUP_INVENTORY_HTTP_OR_TRANSPORT_FAILURE" "$LAST_PROVIDER_STAGE" 68 ;;
  2) fail_closed "BLOCKED_POST_CLEANUP_READBACK" "POST_CLEANUP_INVENTORY_EXCEEDS_BOUNDED_PAGINATION" "POST_CLEANUP_INVENTORY" 68 ;;
  *) fail_closed "BLOCKED_POST_CLEANUP_READBACK" "POST_CLEANUP_INVENTORY_INVALID_RESPONSE" "POST_CLEANUP_INVENTORY" 68 ;;
esac
normalize_deployments < "$tmp_dir/post-cleanup-deployments-raw.json" > "$tmp_dir/post-cleanup-deployments.json"
jq -c '[.[] | select(.environment == "production") | .id] | unique | sort' "$tmp_dir/post-cleanup-deployments.json" > "$RECEIPT_DIR/post-cleanup-production-ids.json"
jq -c '[.[] | select(.environment == "preview" and .materialized == true) | .id] | unique | sort' "$tmp_dir/post-cleanup-deployments.json" > "$RECEIPT_DIR/post-cleanup-materialized-preview-ids.json"
cmp -s "$RECEIPT_DIR/initial-production-ids.json" "$RECEIPT_DIR/post-cleanup-production-ids.json" || fail_closed "BLOCKED_PRODUCTION_HISTORY_GUARD" "PRODUCTION_ID_SET_CHANGED_DURING_PREVIEW_CLEANUP" "POST_CLEANUP_INVENTORY" 69
remaining_preview_count="$(jq 'length' "$RECEIPT_DIR/post-cleanup-materialized-preview-ids.json")"
(( remaining_preview_count == 0 )) || fail_closed "BLOCKED_POST_CLEANUP_READBACK" "MATERIALIZED_PREVIEW_REMAINS" "POST_CLEANUP_INVENTORY" 69
(( deleted_preview_count == initial_preview_count )) || fail_closed "BLOCKED_POST_CLEANUP_READBACK" "DELETE_COUNT_MISMATCH" "POST_CLEANUP_INVENTORY" 69
preview_cleanup_complete=true

jq \
  --arg state "PREVIEW_CLEANUP_COMPLETE_VERIFIED" \
  --argjson deleted_preview_count "$deleted_preview_count" \
  --argjson provider_call_count "$provider_call_count" \
  '.state=$state
   | .preview_cleanup_complete=true
   | .deleted_preview_count=$deleted_preview_count
   | .remaining_materialized_preview_count=0
   | .production_ids_unchanged_through_cleanup=true
   | .provider_call_count=$provider_call_count' \
  "$RECEIPT_DIR/final.json" > "$RECEIPT_DIR/final.tmp.json"
mv "$RECEIPT_DIR/final.tmp.json" "$RECEIPT_DIR/final.json"

source_root="$RUNNER_TEMP/kidults-approved-source-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}"
git worktree add --detach "$source_root" "$TARGET_SHA" >/dev/null
source_dir="$source_root/$SOURCE_DIR_REL"
[[ -d "$source_dir" ]] || fail_closed "BLOCKED_SOURCE_INVALID" "APPROVED_SOURCE_DIRECTORY_MISSING" "SOURCE_PREPARE" 70
! find "$source_dir" -type l -print -quit | grep -q . || fail_closed "BLOCKED_SOURCE_INVALID" "SYMLINK_IN_APPROVED_SOURCE" "SOURCE_PREPARE" 70
find "$source_dir" -type f -print0 | sort -z | xargs -0 sha256sum | sha256sum | awk '{print "sha256:"$1}' > "$RECEIPT_DIR/source-tree.sha256"
source_tree_sha256="$(cat "$RECEIPT_DIR/source-tree.sha256")"
commit_message="[KIDULTS-GOVERNED-STAGING] approval_id=${APPROVAL_ID} repository=${EXPECTED_REPOSITORY} source_sha=${TARGET_SHA} run=${GITHUB_RUN_ID} attempt=${GITHUB_RUN_ATTEMPT}"

jq '.state="GOVERNED_STAGING_DEPLOYMENT_STARTED" | .deployment_attempted=true' "$RECEIPT_DIR/final.json" > "$RECEIPT_DIR/final.tmp.json"
mv "$RECEIPT_DIR/final.tmp.json" "$RECEIPT_DIR/final.json"

set +e
npx --yes wrangler@4.127.1 pages deploy "$source_dir" \
  --project-name "$PROJECT_NAME" \
  --branch main \
  --commit-hash "$TARGET_SHA" \
  --commit-message "$commit_message" \
  > "$RECEIPT_DIR/wrangler-deploy.log" 2>&1
deploy_rc=$?
set -e
if [[ "$deploy_rc" -ne 0 ]]; then
  fail_closed "BLOCKED_GOVERNED_STAGING_DEPLOY" "WRANGLER_DEPLOY_FAILED" "GOVERNED_STAGING_DEPLOY" "$deploy_rc"
fi

new_deployment_id=""
for _ in $(seq 1 40); do
  if api_request GET "$API_ROOT/deployments?per_page=25&page=1" "$tmp_dir/deployments-latest.json" "DEPLOYMENT_VISIBILITY_POLL"; then
    new_deployment_id="$(jq -r --arg sha "$TARGET_SHA" --arg message "$commit_message" '
      [.result[] | select(
        .environment == "production"
        and (.deployment_trigger.type // "") == "ad_hoc"
        and (.deployment_trigger.metadata.branch // "") == "main"
        and (.deployment_trigger.metadata.commit_hash // "") == $sha
        and (.deployment_trigger.metadata.commit_message // "") == $message
        and (.latest_stage.status // "") == "success"
      )][0].id // ""' "$tmp_dir/deployments-latest.json")"
    [[ -n "$new_deployment_id" ]] && break
  else
    if [[ "$LAST_HTTP_STATUS" == "401" || "$LAST_HTTP_STATUS" == "403" || "$LAST_HTTP_STATUS" == "404" || "$LAST_HTTP_STATUS" =~ ^5 ]]; then
      fail_closed "BLOCKED_GOVERNED_STAGING_READBACK" "DEPLOYMENT_VISIBILITY_HTTP_FAILURE" "DEPLOYMENT_VISIBILITY_POLL" 71
    fi
  fi
  sleep 3
done
[[ -n "$new_deployment_id" ]] || fail_closed "BLOCKED_GOVERNED_STAGING_READBACK" "GOVERNED_DEPLOYMENT_NOT_VISIBLE_AS_SUCCESS" "DEPLOYMENT_VISIBILITY_POLL" 71
deployment_created=true

set +e
list_all_deployments "$tmp_dir/final-deployments-raw.json" final
final_inventory_rc=$?
set -e
case "$final_inventory_rc" in
  0) ;;
  1) fail_closed "BLOCKED_FINAL_READBACK" "FINAL_INVENTORY_HTTP_OR_TRANSPORT_FAILURE" "$LAST_PROVIDER_STAGE" 72 ;;
  2) fail_closed "BLOCKED_FINAL_READBACK" "FINAL_INVENTORY_EXCEEDS_BOUNDED_PAGINATION" "FINAL_INVENTORY" 72 ;;
  *) fail_closed "BLOCKED_FINAL_READBACK" "FINAL_INVENTORY_INVALID_RESPONSE" "FINAL_INVENTORY" 72 ;;
esac
normalize_deployments < "$tmp_dir/final-deployments-raw.json" > "$tmp_dir/final-deployments.json"
jq -c '[.[] | select(.environment == "production") | .id] | unique | sort' "$tmp_dir/final-deployments.json" > "$RECEIPT_DIR/final-production-ids.json"
jq -c '[.[] | select(.environment == "preview" and .materialized == true) | .id] | unique | sort' "$tmp_dir/final-deployments.json" > "$RECEIPT_DIR/final-materialized-preview-ids.json"
final_preview_count="$(jq 'length' "$RECEIPT_DIR/final-materialized-preview-ids.json")"
(( final_preview_count == 0 )) || fail_closed "BLOCKED_FINAL_READBACK" "FINAL_MATERIALIZED_PREVIEW_COUNT_NONZERO" "FINAL_INVENTORY" 72

jq -n \
  --slurpfile before "$RECEIPT_DIR/post-cleanup-production-ids.json" \
  --slurpfile after "$RECEIPT_DIR/final-production-ids.json" \
  --arg new_id "$new_deployment_id" \
  '($before[0] - $after[0] | length) == 0
   and (($after[0] - $before[0]) == [$new_id])' >/dev/null || fail_closed "BLOCKED_FINAL_READBACK" "EXISTING_PRODUCTION_HISTORY_NOT_PRESERVED_OR_NEW_DEPLOYMENT_CARDINALITY_INVALID" "FINAL_INVENTORY" 72

jq --arg id "$new_deployment_id" '.[] | select(.id == $id)' "$tmp_dir/final-deployments.json" > "$RECEIPT_DIR/governed-deployment.json"
jq -e \
  --arg id "$new_deployment_id" \
  --arg sha "$TARGET_SHA" \
  --arg message "$commit_message" \
  '.id == $id
   and .environment == "production"
   and .materialized == true
   and .latest_stage_status == "success"
   and .trigger_type == "ad_hoc"
   and .branch == "main"
   and .commit_hash == $sha
   and .commit_message == $message' \
  "$RECEIPT_DIR/governed-deployment.json" >/dev/null || fail_closed "BLOCKED_FINAL_READBACK" "GOVERNED_DEPLOYMENT_IDENTITY_MISMATCH" "FINAL_INVENTORY" 72

api_request GET "$API_ROOT" "$tmp_dir/project-after.json" "FINAL_PROJECT_READBACK" || fail_closed "BLOCKED_FINAL_READBACK" "FINAL_PROJECT_READ_HTTP_OR_TRANSPORT_FAILURE" "FINAL_PROJECT_READBACK" 72
jq --arg repository "$EXPECTED_REPOSITORY" '{
  project:.result.name,
  source_type:.result.source.type,
  repository:((.result.source.config.owner // "") + "/" + (.result.source.config.repo_name // "")),
  repository_matches_expected:(((.result.source.config.owner // "") + "/" + (.result.source.config.repo_name // "")) == $repository),
  production_branch:.result.production_branch,
  production_deployments_enabled:.result.source.config.production_deployments_enabled,
  preview_deployment_setting:.result.source.config.preview_deployment_setting
}' "$tmp_dir/project-after.json" > "$RECEIPT_DIR/project-guard-after.json"
cmp -s "$RECEIPT_DIR/project-guard-before.json" "$RECEIPT_DIR/project-guard-after.json" || fail_closed "BLOCKED_FINAL_READBACK" "PROJECT_GOVERNANCE_SETTINGS_OR_BINDING_CHANGED" "FINAL_PROJECT_READBACK" 72

final_production_count="$(jq 'length' "$RECEIPT_DIR/final-production-ids.json")"
final_production_digest="sha256:$(sha256sum "$RECEIPT_DIR/final-production-ids.json" | awk '{print $1}')"

jq \
  --arg state "COMPLETE_VERIFIED" \
  --arg source_tree_sha256 "$source_tree_sha256" \
  --arg new_deployment_id "$new_deployment_id" \
  --arg final_production_id_digest "$final_production_digest" \
  --argjson provider_call_count "$provider_call_count" \
  --argjson deleted_preview_count "$deleted_preview_count" \
  --argjson final_production_count "$final_production_count" \
  '.state=$state
   | .reason_code="ONE_SHOT_COMPLETE"
   | .failure_stage=null
   | .exit_code=0
   | .cloudflare_api_called=true
   | .provider_call_count=$provider_call_count
   | .preview_cleanup_complete=true
   | .deleted_preview_count=$deleted_preview_count
   | .remaining_materialized_preview_count=0
   | .production_ids_unchanged_through_cleanup=true
   | .existing_production_ids_preserved_after_deploy=true
   | .final_production_count=$final_production_count
   | .final_production_id_digest=$final_production_id_digest
   | .deployment_created=true
   | .governed_deployment_id=$new_deployment_id
   | .deployed_source_sha="14501ac022bdd7c918924a207f257b047b1ba970"
   | .source_tree_sha256=$source_tree_sha256
   | .automatic_git_production_deployments_disabled_after=true
   | .preview_deployment_setting_none_after=true
   | .production_deployment_deleted=false
   | .settings_mutated=false
   | .platform_environment="STAGING"
   | .cloudflare_pages_environment="production"
   | .public_release="HOLD"
   | .production="HOLD"
   | .g5="HOLD"' \
  "$RECEIPT_DIR/final.json" > "$RECEIPT_DIR/final.tmp.json"
mv "$RECEIPT_DIR/final.tmp.json" "$RECEIPT_DIR/final.json"

cat "$RECEIPT_DIR/final.json"
