#!/usr/bin/env bash
set -euo pipefail

PROJECT_NAME="${CLOUDFLARE_PAGES_PROJECT_NAME:-kidults-workspace-staging}"
EXPECTED_REPOSITORY="${EXPECTED_REPOSITORY:-johnkim9524-collab/kaios_enterprise_repo}"
MODE="${1:---dry-run}"
RECEIPT_DIR="${RECEIPT_DIR:-artifacts/cloudflare-auto-deployment-containment}"
MAX_PAGES="${MAX_PAGES:-100}"
PAGE_SIZE="${PAGE_SIZE:-25}"
API_ROOT="https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID:-MISSING}/pages/projects/${PROJECT_NAME}"

if [[ "$PROJECT_NAME" != "kidults-workspace-staging" ]]; then
  echo "Refusing unexpected Pages project: $PROJECT_NAME" >&2
  exit 64
fi
if [[ "$EXPECTED_REPOSITORY" != "johnkim9524-collab/kaios_enterprise_repo" ]]; then
  echo "Refusing unexpected repository: $EXPECTED_REPOSITORY" >&2
  exit 64
fi
if [[ "$MODE" != "--dry-run" && "$MODE" != "--execute" ]]; then
  echo "Usage: $0 [--dry-run|--execute]" >&2
  exit 64
fi
if [[ "$MODE" == "--execute" ]]; then
  echo "Cloudflare mutation NO-RERUN: durable one-shot ledger trust root is not activated" >&2
  exit 78
fi
if [[ ! "$MAX_PAGES" =~ ^[1-9][0-9]*$ ]] || (( MAX_PAGES > 100 )); then
  echo "MAX_PAGES must be an integer from 1 to 100" >&2
  exit 64
fi
if [[ ! "$PAGE_SIZE" =~ ^[1-9][0-9]*$ ]] || (( PAGE_SIZE > 25 )); then
  echo "PAGE_SIZE must be an integer from 1 to 25" >&2
  exit 64
fi
if [[ -z "${CLOUDFLARE_API_TOKEN:-}" || -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]]; then
  echo "Cloudflare credentials are absent" >&2
  exit 65
fi

mkdir -p "$RECEIPT_DIR"
rm -f "$RECEIPT_DIR/final.json"
tmp_dir="$(mktemp -d)"
stage="INITIALIZE"
on_exit() {
  local rc=$?
  trap - EXIT
  if [[ "$rc" -ne 0 && ! -f "$RECEIPT_DIR/final.json" ]]; then
    jq -n \
      --arg project "$PROJECT_NAME" \
      --arg state "BLOCKED" \
      --arg failure_stage "$stage" \
      --argjson exit_code "$rc" \
      '{
        id:"kidults-cloudflare-pages-auto-deployment-containment-receipt-v1",
        project:$project,state:$state,failure_stage:$failure_stage,exit_code:$exit_code,
        pages_project_configuration_mutated:"UNKNOWN",
        deployment_created:false,deployment_deleted:false,
        public_release:"HOLD",production:"HOLD",g5:"HOLD"
      }' > "$RECEIPT_DIR/final.json" || true
  fi
  rm -rf "$tmp_dir"
  exit "$rc"
}
trap on_exit EXIT

api_request() {
  local method="$1" url="$2" output="$3"
  shift 3
  curl --fail-with-body --silent --show-error \
    --retry 3 --retry-delay 1 --retry-all-errors \
    --connect-timeout 10 --max-time 45 \
    --request "$method" \
    --header "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
    --header "Content-Type: application/json" \
    "$@" "$url" > "$output"
}

project_snapshot() {
  local input="$1"
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
  }' "$input"
}

list_all_deployment_ids() {
  local output="$1" page=1 total_pages=1 page_file
  : > "$tmp_dir/deployment-ids.ndjson"
  while (( page <= total_pages )); do
    if (( page > MAX_PAGES )); then
      echo "Deployment pagination exceeded MAX_PAGES=$MAX_PAGES" >&2
      return 68
    fi
    page_file="$tmp_dir/deployments-page-${page}.json"
    api_request GET "$API_ROOT/deployments?per_page=${PAGE_SIZE}&page=$page" "$page_file"
    jq -e '.success == true and (.result | type == "array")' "$page_file" >/dev/null
    jq -r '.result[]?.id' "$page_file" >> "$tmp_dir/deployment-ids.ndjson"
    total_pages="$(jq -r '(.result_info.total_pages // 1) | if type == "number" and . >= 1 and floor == . then . else error("invalid total_pages") end' "$page_file")"
    if (( total_pages > MAX_PAGES )); then
      echo "Cloudflare deployment inventory exceeds bounded pagination: $total_pages pages" >&2
      return 68
    fi
    page=$((page + 1))
  done
  if [[ -s "$tmp_dir/deployment-ids.ndjson" ]]; then
    jq -R -s 'split("\n") | map(select(length > 0)) | unique | sort' "$tmp_dir/deployment-ids.ndjson" > "$output"
  else
    printf '[]\n' > "$output"
  fi
}

stage="READ_PREFLIGHT"
api_request GET "$API_ROOT" "$tmp_dir/project-before.json"
list_all_deployment_ids "$tmp_dir/deployment-ids-before.json"
jq -e --arg project "$PROJECT_NAME" '
  .success == true
  and .result.name == $project
  and .result.source.type == "github"
  and .result.production_branch == "main"
' "$tmp_dir/project-before.json" >/dev/null
project_snapshot "$tmp_dir/project-before.json" > "$RECEIPT_DIR/preflight.json"
jq -e '.repository_matches_expected == true' "$RECEIPT_DIR/preflight.json" >/dev/null
before_ids="$(jq -c '.' "$tmp_dir/deployment-ids-before.json")"

if [[ "$MODE" == "--dry-run" ]]; then
  jq -n \
    --arg project "$PROJECT_NAME" \
    --arg state "DRY_RUN_VERIFIED" \
    --argjson deployment_ids "$before_ids" \
    --slurpfile before "$RECEIPT_DIR/preflight.json" \
    '{
      id:"kidults-cloudflare-pages-auto-deployment-containment-receipt-v1",
      project:$project,state:$state,before:$before[0],deployment_ids:$deployment_ids,
      requested:{
        legacy_deployments_enabled:false,
        production_deployments_enabled:false,
        preview_deployment_setting:"none",
        preview_branch_includes:[],
        preview_branch_excludes:[]
      },
      pages_project_configuration_mutated:false,
      deployment_created:false,deployment_deleted:false,
      public_release:"HOLD",production:"HOLD",g5:"HOLD"
    }' > "$RECEIPT_DIR/final.json"
  cat "$RECEIPT_DIR/final.json"
  exit 0
fi

stage="BUILD_PATCH_PAYLOAD"
jq '{
  source: (
    .result.source
    | .config.deployments_enabled = false
    | .config.production_deployments_enabled = false
    | .config.preview_deployment_setting = "none"
    | .config.preview_branch_includes = []
    | .config.preview_branch_excludes = []
  )
}' "$tmp_dir/project-before.json" > "$tmp_dir/patch-payload.json"

stage="PATCH_PROJECT"
api_request PATCH "$API_ROOT" "$tmp_dir/project-patch.json" --data-binary "@$tmp_dir/patch-payload.json"
jq -e --arg project "$PROJECT_NAME" '.success == true and .result.name == $project' "$tmp_dir/project-patch.json" >/dev/null
project_snapshot "$tmp_dir/project-patch.json" > "$RECEIPT_DIR/patch-response.json"

stage="READBACK_PROJECT"
api_request GET "$API_ROOT" "$tmp_dir/project-after.json"
list_all_deployment_ids "$tmp_dir/deployment-ids-after.json"
jq -e --arg project "$PROJECT_NAME" '
  .success == true
  and .result.name == $project
  and .result.source.type == "github"
  and .result.production_branch == "main"
  and (.result.source.config.deployments_enabled // false) == false
  and .result.source.config.production_deployments_enabled == false
  and .result.source.config.preview_deployment_setting == "none"
  and ((.result.source.config.preview_branch_includes // []) | length == 0)
  and ((.result.source.config.preview_branch_excludes // []) | length == 0)
' "$tmp_dir/project-after.json" >/dev/null
project_snapshot "$tmp_dir/project-after.json" > "$RECEIPT_DIR/readback.json"
jq -e '.repository_matches_expected == true' "$RECEIPT_DIR/readback.json" >/dev/null
after_ids="$(jq -c '.' "$tmp_dir/deployment-ids-after.json")"
test "$before_ids" = "$after_ids"

stage="WRITE_FINAL_RECEIPT"
jq -n \
  --arg project "$PROJECT_NAME" \
  --arg state "COMPLETE_VERIFIED" \
  --arg control_reason "${CONTROL_REASON:-NOT_PROVIDED}" \
  --argjson deployment_ids "$after_ids" \
  --slurpfile before "$RECEIPT_DIR/preflight.json" \
  --slurpfile patch "$RECEIPT_DIR/patch-response.json" \
  --slurpfile after "$RECEIPT_DIR/readback.json" \
  '{
    id:"kidults-cloudflare-pages-auto-deployment-containment-receipt-v1",
    project:$project,state:$state,control_reason:$control_reason,
    before:$before[0],patch_response:$patch[0],after:$after[0],deployment_ids_preserved:$deployment_ids,
    exact_readback:{
      legacy_deployments_enabled:false,
      production_deployments_enabled:false,
      preview_deployment_setting:"none",
      preview_branch_includes:[],
      preview_branch_excludes:[]
    },
    pages_project_configuration_mutated:true,
    deployment_created:false,deployment_deleted:false,
    production_history_preserved:true,
    platform_environment:"STAGING",
    public_release:"HOLD",production:"HOLD",g5:"HOLD"
  }' > "$RECEIPT_DIR/final.json"

cat "$RECEIPT_DIR/final.json"
