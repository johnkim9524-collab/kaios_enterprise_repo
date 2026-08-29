#!/usr/bin/env bash
set -euo pipefail

PROJECT_NAME="${CLOUDFLARE_PAGES_PROJECT_NAME:-kidults-workspace-staging}"
EXPECTED_REPOSITORY="${EXPECTED_REPOSITORY:-johnkim9524-collab/kaios_enterprise_repo}"
RECEIPT_DIR="${RECEIPT_DIR:-artifacts/cloudflare-pages-boundary-readonly}"
MAX_PAGES="${MAX_PAGES:-100}"
API_ROOT="https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID:-MISSING}/pages/projects/${PROJECT_NAME}"

if [[ "$PROJECT_NAME" != "kidults-workspace-staging" ]]; then
  echo "Refusing unexpected Pages project: $PROJECT_NAME" >&2
  exit 64
fi
if [[ "$EXPECTED_REPOSITORY" != "johnkim9524-collab/kaios_enterprise_repo" ]]; then
  echo "Refusing unexpected repository: $EXPECTED_REPOSITORY" >&2
  exit 64
fi
if [[ ! "$MAX_PAGES" =~ ^[1-9][0-9]*$ ]] || (( MAX_PAGES > 100 )); then
  echo "MAX_PAGES must be an integer from 1 to 100" >&2
  exit 64
fi
if [[ -z "${CLOUDFLARE_API_TOKEN:-}" || -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]]; then
  echo "Cloudflare read-only credentials are absent" >&2
  exit 65
fi

mkdir -p "$RECEIPT_DIR"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

api_get() {
  local url="$1" output="$2"
  curl --fail-with-body --silent --show-error \
    --retry 3 --retry-delay 1 --retry-all-errors \
    --connect-timeout 10 --max-time 45 \
    --request GET \
    --header "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
    --header "Accept: application/json" \
    "$url" > "$output"
}

list_all_deployments() {
  local output="$1" page=1 total_pages=1 page_file
  : > "$tmp_dir/deployments.ndjson"
  while (( page <= total_pages )); do
    if (( page > MAX_PAGES )); then
      echo "Deployment pagination exceeded MAX_PAGES=$MAX_PAGES" >&2
      return 68
    fi
    page_file="$tmp_dir/deployments-page-${page}.json"
    api_get "$API_ROOT/deployments?per_page=100&page=$page" "$page_file"
    jq -e '.success == true and (.result | type == "array")' "$page_file" >/dev/null
    jq -c '.result[]' "$page_file" >> "$tmp_dir/deployments.ndjson"
    total_pages="$(jq -r '(.result_info.total_pages // 1) | if type == "number" and . >= 1 and floor == . then . else error("invalid total_pages") end' "$page_file")"
    if (( total_pages > MAX_PAGES )); then
      echo "Cloudflare deployment inventory exceeds bounded pagination: $total_pages pages" >&2
      return 68
    fi
    page=$((page + 1))
  done
  if [[ -s "$tmp_dir/deployments.ndjson" ]]; then
    jq -s '.' "$tmp_dir/deployments.ndjson" > "$output"
  else
    printf '[]\n' > "$output"
  fi
}

api_get "$API_ROOT" "$tmp_dir/project.json"
list_all_deployments "$tmp_dir/deployments-all.json"

jq -e --arg project "$PROJECT_NAME" --arg expected_repository "$EXPECTED_REPOSITORY" '
  .success == true
  and .result.name == $project
  and .result.source.type == "github"
  and .result.production_branch == "main"
  and (((.result.source.config.owner // "") + "/" + (.result.source.config.repo_name // "")) == $expected_repository)
' "$tmp_dir/project.json" >/dev/null

jq --arg expected_repository "$EXPECTED_REPOSITORY" '{
  project: .result.name,
  project_id: .result.id,
  production_branch: .result.production_branch,
  source_type: .result.source.type,
  repository: ((.result.source.config.owner // "") + "/" + (.result.source.config.repo_name // "")),
  repository_matches_expected: (((.result.source.config.owner // "") + "/" + (.result.source.config.repo_name // "")) == $expected_repository),
  legacy_deployments_enabled: (.result.source.config.deployments_enabled // false),
  production_deployments_enabled: .result.source.config.production_deployments_enabled,
  preview_deployment_setting: .result.source.config.preview_deployment_setting,
  preview_branch_includes: (.result.source.config.preview_branch_includes // []),
  preview_branch_excludes: (.result.source.config.preview_branch_excludes // []),
  modified_on: .result.modified_on
}' "$tmp_dir/project.json" > "$RECEIPT_DIR/project-readback.json"

jq '[.[] | {
  id,
  environment,
  url,
  aliases: (.aliases // []),
  created_on,
  latest_stage_status: (.latest_stage.status // null),
  trigger_type: (.deployment_trigger.type // null),
  branch: (.deployment_trigger.metadata.branch // null),
  commit_hash: (.deployment_trigger.metadata.commit_hash // null),
  commit_message: (.deployment_trigger.metadata.commit_message // null)
}] | sort_by(.created_on) | reverse' "$tmp_dir/deployments-all.json" > "$RECEIPT_DIR/deployments.json"

jq '.[0] // null' "$RECEIPT_DIR/deployments.json" > "$RECEIPT_DIR/latest-deployment.json"

settings_pass="$(jq -r '
  .repository_matches_expected == true
  and .legacy_deployments_enabled == false
  and .production_deployments_enabled == false
  and .preview_deployment_setting == "none"
  and (.preview_branch_includes | length == 0)
  and (.preview_branch_excludes | length == 0)
' "$RECEIPT_DIR/project-readback.json")"

preview_count="$(jq '[.[] | select(.environment == "preview")] | length' "$RECEIPT_DIR/deployments.json")"
latest_governed="$(jq -r --arg expected_repository "$EXPECTED_REPOSITORY" '
  . != null
  and .environment == "production"
  and .trigger_type == "ad_hoc"
  and .branch == "main"
  and (.commit_hash | type == "string" and test("^[0-9a-f]{40}$"))
  and (.commit_message | type == "string" and startswith("[KIDULTS-GOVERNED-STAGING] repository=" + $expected_repository + " "))
  and .latest_stage_status == "success"
' "$RECEIPT_DIR/latest-deployment.json")"

state="VERIFIED_FAIL"
if [[ "$settings_pass" == "true" && "$latest_governed" == "true" && "$preview_count" -eq 0 ]]; then
  state="COMPLETE_VERIFIED"
fi

jq -n \
  --arg state "$state" \
  --arg project "$PROJECT_NAME" \
  --arg current_main_sha "${GITHUB_SHA:-UNKNOWN}" \
  --argjson settings_pass "$settings_pass" \
  --argjson latest_deployment_governed "$latest_governed" \
  --argjson visible_preview_count "$preview_count" \
  --slurpfile project_readback "$RECEIPT_DIR/project-readback.json" \
  --slurpfile latest "$RECEIPT_DIR/latest-deployment.json" \
  '{
    id:"kidults-cloudflare-pages-boundary-readonly-receipt-v1",
    state:$state,
    project:$project,
    current_main_sha:$current_main_sha,
    settings_pass:$settings_pass,
    latest_deployment_governed:$latest_deployment_governed,
    visible_preview_count:$visible_preview_count,
    project_readback:$project_readback[0],
    latest_deployment:$latest[0],
    latest_deployment_matches_current_main:(($latest[0].commit_hash // null) == $current_main_sha),
    current_main_match_is_informational:true,
    read_only:true,
    settings_mutated:false,
    deployment_created:false,
    deployment_deleted:false,
    platform_environment:"STAGING",
    public_release:"HOLD",
    production:"HOLD",
    g5:"HOLD"
  }' > "$RECEIPT_DIR/final.json"

cat "$RECEIPT_DIR/final.json"
[[ "$state" == "COMPLETE_VERIFIED" ]]
