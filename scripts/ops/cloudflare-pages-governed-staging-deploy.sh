#!/usr/bin/env bash
set -euo pipefail

PROJECT_NAME="${CLOUDFLARE_PAGES_PROJECT_NAME:-kidults-workspace-staging}"
EXPECTED_REPOSITORY="${EXPECTED_REPOSITORY:-johnkim9524-collab/kaios_enterprise_repo}"
SOURCE_DIR="${SOURCE_DIR:-apps/kidults-enterprise-staging/public}"
SOURCE_SHA="${SOURCE_SHA:-}"
DEPLOY_REASON="${DEPLOY_REASON:-}"
RECEIPT_DIR="${RECEIPT_DIR:-artifacts/cloudflare-governed-staging-deploy}"
API_ROOT="https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID:-MISSING}/pages/projects/${PROJECT_NAME}"

[[ "$PROJECT_NAME" == "kidults-workspace-staging" ]] || { echo "Refusing unexpected Pages project" >&2; exit 64; }
[[ "$EXPECTED_REPOSITORY" == "johnkim9524-collab/kaios_enterprise_repo" ]] || { echo "Refusing unexpected repository" >&2; exit 64; }
[[ "$SOURCE_DIR" == "apps/kidults-enterprise-staging/public" ]] || { echo "Refusing unexpected source directory" >&2; exit 64; }
[[ "$SOURCE_SHA" =~ ^[0-9a-f]{40}$ ]] || { echo "Exact source SHA is required" >&2; exit 64; }
[[ -n "$DEPLOY_REASON" ]] || { echo "Deployment reason is required" >&2; exit 64; }
[[ -n "${CLOUDFLARE_API_TOKEN:-}" && -n "${CLOUDFLARE_ACCOUNT_ID:-}" ]] || { echo "Cloudflare deployment credentials are absent" >&2; exit 65; }
[[ "$(git rev-parse HEAD)" == "$SOURCE_SHA" ]] || { echo "Checked-out source does not match SOURCE_SHA" >&2; exit 65; }
! find "$SOURCE_DIR" -type l -print -quit | grep -q . || { echo "Symlinks are prohibited" >&2; exit 66; }
[[ -n "${GITHUB_RUN_ID:-}" && -n "${GITHUB_RUN_ATTEMPT:-}" && -n "${GITHUB_REPOSITORY:-}" ]] || { echo "GitHub run identity is required" >&2; exit 66; }

mkdir -p "$RECEIPT_DIR"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT
api_get(){ curl --fail-with-body --silent --show-error --retry 3 --retry-delay 1 --retry-all-errors --connect-timeout 10 --max-time 45 --request GET --header "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" --header "Accept: application/json" "$1" > "$2"; }

api_get "$API_ROOT" "$tmp_dir/project-before.json"
api_get "$API_ROOT/deployments?per_page=25&page=1" "$tmp_dir/deployments-before.json"
jq -e --arg project "$PROJECT_NAME" --arg expected_repository "$EXPECTED_REPOSITORY" '
  .success == true and .result.name == $project and .result.source.type == "github" and .result.production_branch == "main"
  and (((.result.source.config.owner // "") + "/" + (.result.source.config.repo_name // "")) == $expected_repository)
  and .result.source.config.production_deployments_enabled == false
  and .result.source.config.preview_deployment_setting == "none"
' "$tmp_dir/project-before.json" >/dev/null
jq -e '.success == true and (.result | type == "array")' "$tmp_dir/deployments-before.json" >/dev/null
before_ids="$(jq -c '[.result[]?.id] | unique | sort' "$tmp_dir/deployments-before.json")"

find "$SOURCE_DIR" -type f -print0 | sort -z | xargs -0 sha256sum | sha256sum | awk '{print "sha256:"$1}' > "$RECEIPT_DIR/source-tree.sha256"
source_tree_sha256="$(cat "$RECEIPT_DIR/source-tree.sha256")"
normalized_reason="$(python3 - <<'PY'
import os,re
v=re.sub(r'\s+',' ',os.environ['DEPLOY_REASON']).strip()
if not v: raise SystemExit(64)
print(v[:160])
PY
)"
commit_message="[KIDULTS-GOVERNED-STAGING] repository=${EXPECTED_REPOSITORY} source_sha=${SOURCE_SHA} run=${GITHUB_RUN_ID} attempt=${GITHUB_RUN_ATTEMPT} reason=${normalized_reason}"

set +e
npx --yes wrangler@4.127.1 pages deploy "$SOURCE_DIR" --project-name "$PROJECT_NAME" --branch main --commit-hash "$SOURCE_SHA" --commit-message "$commit_message" > "$RECEIPT_DIR/wrangler-deploy.log" 2>&1
deploy_rc=$?
set -e
[[ "$deploy_rc" -eq 0 ]] || { cat "$RECEIPT_DIR/wrangler-deploy.log" >&2; exit "$deploy_rc"; }

api_get "$API_ROOT/deployments?per_page=25&page=1" "$tmp_dir/deployments-after.json"
api_get "$API_ROOT" "$tmp_dir/project-after.json"
jq -e '.success == true and (.result | type == "array")' "$tmp_dir/deployments-after.json" >/dev/null
after_ids="$(jq -c '[.result[]?.id] | unique | sort' "$tmp_dir/deployments-after.json")"
new_ids="$(jq -n --argjson before "$before_ids" --argjson after "$after_ids" '$after - $before')"
[[ "$(jq 'length' <<<"$new_ids")" -eq 1 ]] || { echo "Expected exactly one new deployment" >&2; exit 67; }
new_id="$(jq -r '.[0]' <<<"$new_ids")"
jq --arg id "$new_id" '.result[] | select(.id == $id) | {id,environment,url,aliases:(.aliases // []),created_on,latest_stage_status:(.latest_stage.status // null),trigger_type:(.deployment_trigger.type // null),branch:(.deployment_trigger.metadata.branch // null),commit_hash:(.deployment_trigger.metadata.commit_hash // null),commit_message:(.deployment_trigger.metadata.commit_message // null)}' "$tmp_dir/deployments-after.json" > "$RECEIPT_DIR/deployment.json"
[[ -s "$RECEIPT_DIR/deployment.json" ]] || exit 67
jq -e --arg sha "$SOURCE_SHA" --arg message "$commit_message" '.environment == "production" and .latest_stage_status == "success" and .trigger_type == "ad_hoc" and .branch == "main" and .commit_hash == $sha and .commit_message == $message' "$RECEIPT_DIR/deployment.json" >/dev/null
jq -e --arg project "$PROJECT_NAME" '.success == true and .result.name == $project and .result.source.config.production_deployments_enabled == false and .result.source.config.preview_deployment_setting == "none"' "$tmp_dir/project-after.json" >/dev/null

jq -n --arg project "$PROJECT_NAME" --arg repository "$EXPECTED_REPOSITORY" --arg source_sha "$SOURCE_SHA" --arg source_tree_sha256 "$source_tree_sha256" --arg deploy_reason "$normalized_reason" --arg workflow_run_id "$GITHUB_RUN_ID" --argjson workflow_run_attempt "$GITHUB_RUN_ATTEMPT" --slurpfile deployment "$RECEIPT_DIR/deployment.json" '{
  id:"kidults-cloudflare-governed-staging-deployment-receipt-v1",state:"COMPLETE_VERIFIED",project:$project,repository:$repository,
  platform_environment:"STAGING",cloudflare_pages_environment:"production",source_sha:$source_sha,source_tree_sha256:$source_tree_sha256,
  deploy_reason:$deploy_reason,workflow_run_id:$workflow_run_id,workflow_run_attempt:$workflow_run_attempt,deployment:$deployment[0],
  exact_sha_bound:true,automatic_git_deployments_disabled_after_deploy:true,preview_deployment_created:false,deployment_deleted:false,
  public_release:"HOLD",production:"HOLD",g5:"HOLD"
}' > "$RECEIPT_DIR/final.json"
cat "$RECEIPT_DIR/final.json"
