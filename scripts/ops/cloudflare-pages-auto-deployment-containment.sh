#!/usr/bin/env bash
set -euo pipefail

PROJECT_NAME="${CLOUDFLARE_PAGES_PROJECT_NAME:-kidults-workspace-staging}"
EXPECTED_REPOSITORY="${EXPECTED_REPOSITORY:-johnkim9524-collab/kaios_enterprise_repo}"
MODE="${1:---dry-run}"
RECEIPT_DIR="${RECEIPT_DIR:-artifacts/cloudflare-auto-deployment-containment}"
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
        project:$project,
        state:$state,
        failure_stage:$failure_stage,
        exit_code:$exit_code,
        pages_project_configuration_mutated:"UNKNOWN",
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
    legacy_deployments_enabled: .result.source.config.deployments_enabled,
    production_deployments_enabled: .result.source.config.production_deployments_enabled,
    preview_deployment_setting: .result.source.config.preview_deployment_setting,
    preview_branch_includes: (.result.source.config.preview_branch_includes // []),
    preview_branch_excludes: (.result.source.config.preview_branch_excludes // []),
    modified_on: .result.modified_on
  }' "$input"
}

stage="READ_PREFLIGHT"
before_raw="$tmp_dir/project-before.json"
api_request GET "$API_ROOT" "$before_raw"
jq -e --arg project "$PROJECT_NAME" '
  .success == true
  and .result.name == $project
  and .result.source.type == "github"
  and .result.production_branch == "main"
  and (.result.source.config.owner | type == "string" and length > 0)
  and (.result.source.config.repo_name | type == "string" and length > 0)
' "$before_raw" >/dev/null
project_snapshot "$before_raw" > "$RECEIPT_DIR/preflight.json"
jq -e '.repository_matches_expected == true' "$RECEIPT_DIR/preflight.json" >/dev/null

if [[ "$MODE" == "--dry-run" ]]; then
  jq -n \
    --arg project "$PROJECT_NAME" \
    --arg state "DRY_RUN_VERIFIED" \
    --slurpfile before "$RECEIPT_DIR/preflight.json" \
    '{
      project:$project,
      state:$state,
      before:$before[0],
      requested:{
        legacy_deployments_enabled:false,
        production_deployments_enabled:false,
        preview_deployment_setting:"none",
        preview_branch_includes:[],
        preview_branch_excludes:[]
      },
      pages_project_configuration_mutated:false,
      deployment_created:false,
      deployment_deleted:false,
      public_release:"HOLD",
      production:"HOLD",
      g5:"HOLD"
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
}' "$before_raw" > "$tmp_dir/patch-payload.json"

stage="PATCH_PROJECT"
patch_raw="$tmp_dir/project-patch.json"
api_request PATCH "$API_ROOT" "$patch_raw" --data-binary "@$tmp_dir/patch-payload.json"
jq -e --arg project "$PROJECT_NAME" '.success == true and .result.name == $project' "$patch_raw" >/dev/null
project_snapshot "$patch_raw" > "$RECEIPT_DIR/patch-response.json"

stage="READBACK_PROJECT"
after_raw="$tmp_dir/project-after.json"
api_request GET "$API_ROOT" "$after_raw"
jq -e --arg project "$PROJECT_NAME" '
  .success == true
  and .result.name == $project
  and .result.source.type == "github"
  and .result.production_branch == "main"
  and .result.source.config.deployments_enabled == false
  and .result.source.config.production_deployments_enabled == false
  and .result.source.config.preview_deployment_setting == "none"
  and ((.result.source.config.preview_branch_includes // []) | length == 0)
  and ((.result.source.config.preview_branch_excludes // []) | length == 0)
' "$after_raw" >/dev/null
project_snapshot "$after_raw" > "$RECEIPT_DIR/readback.json"
jq -e '.repository_matches_expected == true' "$RECEIPT_DIR/readback.json" >/dev/null

stage="WRITE_FINAL_RECEIPT"
jq -n \
  --arg project "$PROJECT_NAME" \
  --arg state "COMPLETE_VERIFIED" \
  --slurpfile before "$RECEIPT_DIR/preflight.json" \
  --slurpfile patch "$RECEIPT_DIR/patch-response.json" \
  --slurpfile after "$RECEIPT_DIR/readback.json" \
  '{
    project:$project,
    state:$state,
    before:$before[0],
    patch_response:$patch[0],
    after:$after[0],
    exact_readback:{
      legacy_deployments_enabled:false,
      production_deployments_enabled:false,
      preview_deployment_setting:"none",
      preview_branch_includes:[],
      preview_branch_excludes:[]
    },
    pages_project_configuration_mutated:true,
    deployment_created:false,
    deployment_deleted:false,
    production_history_preserved:true,
    public_release:"HOLD",
    production:"HOLD",
    g5:"HOLD"
  }' > "$RECEIPT_DIR/final.json"

cat "$RECEIPT_DIR/final.json"
