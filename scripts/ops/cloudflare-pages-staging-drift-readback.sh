#!/usr/bin/env bash
set -euo pipefail

PROJECT_NAME="${CLOUDFLARE_PAGES_PROJECT_NAME:-kidults-workspace-staging}"
EXPECTED_REPOSITORY="${EXPECTED_REPOSITORY:-johnkim9524-collab/kaios_enterprise_repo}"
RECEIPT_DIR="${RECEIPT_DIR:-artifacts/cloudflare-staging-drift-readback}"
TOKEN="${CLOUDFLARE_READ_API_TOKEN:-}"
ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-}"
API_ROOT="https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID:-MISSING}/pages/projects/${PROJECT_NAME}"

mkdir -p "$RECEIPT_DIR"
rm -f "$RECEIPT_DIR/final.json"
tmp_dir="$(mktemp -d)"
stage="INITIALIZE"

on_exit() {
  local rc=$?
  trap - EXIT
  if [[ "$rc" -ne 0 && ! -s "$RECEIPT_DIR/final.json" ]]; then
    jq -n \
      --arg project "$PROJECT_NAME" \
      --arg state "BLOCKED" \
      --arg blocker "$stage" \
      --argjson exit_code "$rc" \
      '{
        project:$project,
        state:$state,
        blocker:$blocker,
        exit_code:$exit_code,
        read_only:true,
        cloudflare_patch_executed:false,
        deployment_created:false,
        deployment_deleted:false,
        public_release:"HOLD",
        production:"HOLD",
        g5:"HOLD"
      }' > "$RECEIPT_DIR/final.json" || true
  fi
  rm -rf "$tmp_dir"
  exit "$rc"
}
trap on_exit EXIT

if [[ "$PROJECT_NAME" != "kidults-workspace-staging" ]]; then
  stage="UNEXPECTED_PROJECT"
  exit 64
fi
if [[ "$EXPECTED_REPOSITORY" != "johnkim9524-collab/kaios_enterprise_repo" ]]; then
  stage="UNEXPECTED_REPOSITORY"
  exit 64
fi
if [[ -z "$TOKEN" ]]; then
  stage="CLOUDFLARE_READ_TOKEN_ABSENT"
  exit 65
fi
if [[ -z "$ACCOUNT_ID" ]]; then
  stage="CLOUDFLARE_ACCOUNT_ID_ABSENT"
  exit 65
fi

api_get() {
  local url="$1" output="$2"
  curl --fail-with-body --silent --show-error \
    --retry 3 --retry-delay 1 --retry-all-errors \
    --connect-timeout 10 --max-time 45 \
    --request GET \
    --header "Authorization: Bearer ${TOKEN}" \
    --header "Content-Type: application/json" \
    "$url" > "$output"
}

stage="PROJECT_READBACK"
project_raw="$tmp_dir/project.json"
api_get "$API_ROOT" "$project_raw"
jq -e --arg project "$PROJECT_NAME" '.success == true and .result.name == $project' "$project_raw" >/dev/null

jq --arg expected_repository "$EXPECTED_REPOSITORY" '{
  project: .result.name,
  project_id: .result.id,
  production_branch: .result.production_branch,
  source_type: .result.source.type,
  repository: ((.result.source.config.owner // "") + "/" + (.result.source.config.repo_name // "")),
  repository_matches_expected: (((.result.source.config.owner // "") + "/" + (.result.source.config.repo_name // "")) == $expected_repository),
  legacy_deployments_enabled: .result.source.config.deployments_enabled,
  production_deployments_enabled: .result.source.config.production_deployments_enabled,
  preview_deployment_setting: .result.source.config.preview_deployment_setting,
  preview_branch_includes: (.result.source.config.preview_branch_includes // []),
  preview_branch_excludes: (.result.source.config.preview_branch_excludes // []),
  modified_on: .result.modified_on
}' "$project_raw" > "$RECEIPT_DIR/project-readback.json"

stage="DEPLOYMENT_INVENTORY"
deployments_raw="$tmp_dir/deployments.json"
api_get "${API_ROOT}/deployments?per_page=25" "$deployments_raw"
jq -e '.success == true and (.result | type == "array")' "$deployments_raw" >/dev/null
jq '{
  deployment_count: (.result | length),
  deployments: [.result[] | {
    id,
    environment,
    url,
    created_on,
    modified_on,
    latest_stage: (.latest_stage | {name,status,started_on,ended_on}),
    source: {
      type: .source.type,
      branch: .source.config.branch,
      commit_hash: .source.config.commit_hash,
      commit_message: .source.config.commit_message
    }
  }]
}' "$deployments_raw" > "$RECEIPT_DIR/deployment-inventory.json"

stage="POLICY_EVALUATION"
findings="$tmp_dir/findings.json"
jq '[
  if .repository_matches_expected == true then empty else "REPOSITORY_BINDING_DRIFT" end,
  if .source_type == "github" then empty else "SOURCE_TYPE_DRIFT" end,
  if .production_branch == "main" then empty else "PRODUCTION_BRANCH_DRIFT" end,
  if .legacy_deployments_enabled == false then empty else "LEGACY_DEPLOYMENTS_ENABLED" end,
  if .production_deployments_enabled == false then empty else "PRODUCTION_AUTO_DEPLOY_ENABLED" end,
  if .preview_deployment_setting == "none" then empty else "PREVIEW_DEPLOYMENT_SETTING_NOT_NONE" end,
  if (.preview_branch_includes | length) == 0 then empty else "PREVIEW_INCLUDE_RULES_PRESENT" end,
  if (.preview_branch_excludes | length) == 0 then empty else "PREVIEW_EXCLUDE_RULES_PRESENT" end
]' "$RECEIPT_DIR/project-readback.json" > "$findings"

finding_count="$(jq 'length' "$findings")"
state="VERIFIED_PASS"
if [[ "$finding_count" -ne 0 ]]; then
  state="VERIFIED_FAIL"
fi

jq -n \
  --arg project "$PROJECT_NAME" \
  --arg state "$state" \
  --argjson findings "$(cat "$findings")" \
  --slurpfile settings "$RECEIPT_DIR/project-readback.json" \
  --slurpfile inventory "$RECEIPT_DIR/deployment-inventory.json" \
  '{
    project:$project,
    state:$state,
    read_only:true,
    findings:$findings,
    settings:$settings[0],
    recent_deployment_count:$inventory[0].deployment_count,
    deployment_inventory_file:"deployment-inventory.json",
    unauthorized_deployment_detection:"ACTIVATES_AFTER_BOUNDARY_RECEIPT",
    cloudflare_patch_executed:false,
    deployment_created:false,
    deployment_deleted:false,
    public_release:"HOLD",
    production:"HOLD",
    g5:"HOLD"
  }' > "$RECEIPT_DIR/final.json"

cat "$RECEIPT_DIR/final.json"
if [[ "$state" != "VERIFIED_PASS" ]]; then
  exit 1
fi
