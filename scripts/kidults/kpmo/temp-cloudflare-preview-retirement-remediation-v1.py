#!/usr/bin/env python3
from pathlib import Path
import json
import subprocess


def read(path: str) -> str:
    return Path(path).read_text()


def write(path: str, text: str) -> None:
    Path(path).write_text(text)


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


base_sha = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()

policy_path = "coordination/kidults/runtime/cloudflare-pages-staging-governance-v1.json"
policy = json.loads(read(policy_path))
policy["version"] = "1.1.0"
policy["implementation_state"] = "AUTO_DEPLOYMENT_CONTAINMENT_API_VERIFIED_PREVIEW_RETIREMENT_AND_GOVERNED_DEPLOY_PENDING"
policy["validated_base_main_sha"] = base_sha
policy["automatic_deployment_boundary"] = {
    "production_deployments_enabled": False,
    "preview_deployment_setting": "none",
    "granular_controls_authoritative": True,
    "deprecated_deployments_enabled_authoritative": False,
    "preview_branch_rules_authoritative_only_when_custom": True,
    "git_push_is_deployment_authority": False,
}
policy["read_only_monitor"]["latest_materialized_deployment_must_be_governed"] = True
policy["read_only_monitor"]["current_main_auto_attempt_should_be_skipped"] = True
policy["read_only_monitor"]["skipped_attempts_are_not_visible_deployments"] = True
policy["emergency_control"]["delete_concurrency_default"] = 4
policy["emergency_control"]["delete_concurrency_max"] = 8
policy["emergency_control"]["deletion_success_uses_post_readback_absence"] = True
write(policy_path, json.dumps(policy, indent=2) + "\n")

readonly_path = "scripts/ops/cloudflare-pages-boundary-readonly.sh"
text = read(readonly_path)
text = replace_once(
    text,
    """  legacy_deployments_enabled: (.result.source.config.deployments_enabled // false),
  production_deployments_enabled: .result.source.config.production_deployments_enabled,
  preview_deployment_setting: .result.source.config.preview_deployment_setting,
  preview_branch_includes: (.result.source.config.preview_branch_includes // []),
  preview_branch_excludes: (.result.source.config.preview_branch_excludes // []),
""",
    """  legacy_deployments_enabled: (.result.source.config.deployments_enabled // false),
  legacy_deployments_enabled_authoritative: false,
  production_deployments_enabled: .result.source.config.production_deployments_enabled,
  preview_deployment_setting: .result.source.config.preview_deployment_setting,
  preview_branch_includes: (.result.source.config.preview_branch_includes // []),
  preview_branch_excludes: (.result.source.config.preview_branch_excludes // []),
  preview_branch_rules_authoritative: (.result.source.config.preview_deployment_setting == "custom"),
  preview_branch_rules_inert: (.result.source.config.preview_deployment_setting != "custom"),
""",
    "readonly project semantics",
)
text = replace_once(
    text,
    """settings_pass="$(jq -r '
  .repository_matches_expected == true
  and .legacy_deployments_enabled == false
  and .production_deployments_enabled == false
  and .preview_deployment_setting == "none"
  and (.preview_branch_includes | length == 0)
  and (.preview_branch_excludes | length == 0)
' "$RECEIPT_DIR/project-readback.json")"
""",
    """settings_pass="$(jq -r '
  .repository_matches_expected == true
  and .production_deployments_enabled == false
  and .preview_deployment_setting == "none"
' "$RECEIPT_DIR/project-readback.json")"
""",
    "readonly granular settings gate",
)
text = replace_once(
    text,
    """' "$RECEIPT_DIR/latest-deployment.json")"

state="VERIFIED_FAIL"
""",
    """' "$RECEIPT_DIR/latest-deployment.json")"

current_main_auto_attempt_skipped="$(jq -r --arg sha "${GITHUB_SHA:-UNKNOWN}" '
  . != null
  and .environment == "production"
  and .branch == "main"
  and .commit_hash == $sha
  and .is_skipped == true
  and .materialized == false
  and .skip_reason == "production_deployments_disabled"
' "$RECEIPT_DIR/latest-attempt.json")"
preview_branch_rules_authoritative="$(jq -r '.preview_branch_rules_authoritative' "$RECEIPT_DIR/project-readback.json")"

state="VERIFIED_FAIL"
""",
    "readonly current-main skipped attempt",
)
text = replace_once(
    text,
    """state="VERIFIED_FAIL"
if [[ "$settings_pass" == "true" && "$latest_governed" == "true" && "$preview_count" -eq 0 ]]; then
  state="COMPLETE_VERIFIED"
fi
""",
    """state="VERIFIED_FAIL"
if [[ "$settings_pass" == "true" ]]; then
  if [[ "$latest_governed" == "true" && "$preview_count" -eq 0 ]]; then
    state="COMPLETE_VERIFIED"
  elif [[ "$latest_governed" != "true" && "$preview_count" -gt 0 ]]; then
    state="CONTAINMENT_VERIFIED_CLEANUP_AND_GOVERNED_DEPLOYMENT_PENDING"
  elif [[ "$preview_count" -gt 0 ]]; then
    state="CONTAINMENT_VERIFIED_CLEANUP_PENDING"
  else
    state="CONTAINMENT_VERIFIED_GOVERNED_DEPLOYMENT_PENDING"
  fi
fi
""",
    "readonly state taxonomy",
)
text = replace_once(
    text,
    """  --argjson settings_pass "$settings_pass" \\
  --argjson latest_deployment_governed "$latest_governed" \\
""",
    """  --argjson settings_pass "$settings_pass" \\
  --argjson automatic_deployment_containment_pass "$settings_pass" \\
  --argjson current_main_auto_attempt_skipped "$current_main_auto_attempt_skipped" \\
  --argjson preview_branch_rules_authoritative "$preview_branch_rules_authoritative" \\
  --argjson latest_deployment_governed "$latest_governed" \\
""",
    "readonly receipt arguments",
)
text = replace_once(
    text,
    """    settings_pass:$settings_pass,
    latest_deployment_governed:$latest_deployment_governed,
""",
    """    settings_pass:$settings_pass,
    automatic_deployment_containment_pass:$automatic_deployment_containment_pass,
    current_main_auto_attempt_skipped:$current_main_auto_attempt_skipped,
    preview_branch_rules_authoritative:$preview_branch_rules_authoritative,
    preview_branch_rules_inert:($preview_branch_rules_authoritative == false),
    latest_deployment_governed:$latest_deployment_governed,
""",
    "readonly receipt fields",
)
write(readonly_path, text)

contain_path = "scripts/ops/cloudflare-pages-auto-deployment-containment.sh"
text = read(contain_path)
text = replace_once(
    text,
    """      requested:{
        legacy_deployments_enabled:false,
        production_deployments_enabled:false,
        preview_deployment_setting:"none",
        preview_branch_includes:[],
        preview_branch_excludes:[]
      },
""",
    """      requested:{
        production_deployments_enabled:false,
        preview_deployment_setting:"none",
        deprecated_legacy_flag_mutated:false,
        inactive_preview_branch_rules_mutated:false
      },
""",
    "containment dry-run target",
)
text = replace_once(
    text,
    """jq '{
  source: (
    .result.source
    | .config.deployments_enabled = false
    | .config.production_deployments_enabled = false
    | .config.preview_deployment_setting = "none"
    | .config.preview_branch_includes = []
    | .config.preview_branch_excludes = []
  )
}' "$tmp_dir/project-before.json" > "$tmp_dir/patch-payload.json"
""",
    """jq '{
  source: (
    .result.source
    | .config.production_deployments_enabled = false
    | .config.preview_deployment_setting = "none"
  )
}' "$tmp_dir/project-before.json" > "$tmp_dir/patch-payload.json"
""",
    "containment granular patch",
)
text = replace_once(
    text,
    """  and (.result.source.config.deployments_enabled // false) == false
  and .result.source.config.production_deployments_enabled == false
  and .result.source.config.preview_deployment_setting == "none"
  and ((.result.source.config.preview_branch_includes // []) | length == 0)
  and ((.result.source.config.preview_branch_excludes // []) | length == 0)
""",
    """  and .result.source.config.production_deployments_enabled == false
  and .result.source.config.preview_deployment_setting == "none"
""",
    "containment granular readback",
)
text = replace_once(
    text,
    """    exact_readback:{
      legacy_deployments_enabled:false,
      production_deployments_enabled:false,
      preview_deployment_setting:"none",
      preview_branch_includes:[],
      preview_branch_excludes:[]
    },
""",
    """    exact_readback:{
      production_deployments_enabled:false,
      preview_deployment_setting:"none",
      deprecated_legacy_flag_authoritative:false,
      preview_branch_rules_authoritative_only_when_custom:true
    },
""",
    "containment receipt semantics",
)
write(contain_path, text)

deploy_path = "scripts/ops/cloudflare-pages-governed-staging-deploy.sh"
text = read(deploy_path)
for old in [
    "  and (.result.source.config.deployments_enabled // false) == false\n",
    "  and ((.result.source.config.preview_branch_includes // []) | length == 0)\n",
    "  and ((.result.source.config.preview_branch_excludes // []) | length == 0)\n",
]:
    count = text.count(old)
    if count != 2:
        raise SystemExit(f"deploy granular guard expected two matches for {old!r}, found {count}")
    text = text.replace(old, "")
write(deploy_path, text)

cleanup_path = "scripts/ops/cloudflare-pages-preview-cleanup.sh"
text = read(cleanup_path)
text = replace_once(
    text,
    'PAGE_SIZE="${PAGE_SIZE:-25}"\n',
    'PAGE_SIZE="${PAGE_SIZE:-25}"\nDELETE_CONCURRENCY="${DELETE_CONCURRENCY:-4}"\n',
    "cleanup concurrency declaration",
)
text = replace_once(
    text,
    'if [[ -z "${CLOUDFLARE_API_TOKEN:-}" || -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]]; then\n',
    'if [[ ! "$DELETE_CONCURRENCY" =~ ^[1-8]$ ]]; then\n'
    '  echo "DELETE_CONCURRENCY must be an integer from 1 to 8" >&2\n'
    '  exit 64\n'
    'fi\n'
    'if [[ -z "${CLOUDFLARE_API_TOKEN:-}" || -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]]; then\n',
    "cleanup concurrency guard",
)
old_loop = """deleted=0
failed=0
while IFS= read -r deployment_id; do
  [[ -n "$deployment_id" ]] || continue
  set +e
  api_request DELETE "$API_ROOT/deployments/$deployment_id" "$tmp_dir/delete-$deployment_id.json"
  rc=$?
  set -e
  if [[ "$rc" -eq 0 ]] && jq -e '.success == true' "$tmp_dir/delete-$deployment_id.json" >/dev/null 2>&1; then
    deleted=$((deleted + 1))
    jq -cn --arg id "$deployment_id" '{deployment_id:$id,result:"DELETED_PREVIEW"}' >> "$RECEIPT_DIR/deletions.ndjson"
  else
    failed=$((failed + 1))
    jq -cn --arg id "$deployment_id" '{deployment_id:$id,result:"FAILED"}' >> "$RECEIPT_DIR/deletions.ndjson"
  fi
done < <(jq -r '.[]' <<<"$initial_preview_ids")
"""
new_loop = """requested_delete_count="$(jq 'length' <<<"$initial_preview_ids")"
delete_result_dir="$tmp_dir/delete-results"
mkdir -p "$delete_result_dir"

delete_one() {
  local deployment_id="$1"
  local response="$tmp_dir/delete-response-$deployment_id.json"
  local result_file="$delete_result_dir/$deployment_id.json"
  local rc=0 api_success=false codes='[]' messages='[]'
  set +e
  curl --fail-with-body --silent --show-error \\
    --retry 3 --retry-delay 1 --retry-all-errors \\
    --connect-timeout 10 --max-time 45 \\
    --request DELETE \\
    --header "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \\
    --header "Content-Type: application/json" \\
    "$API_ROOT/deployments/$deployment_id" > "$response"
  rc=$?
  set -e
  if [[ "$rc" -eq 0 ]] && jq -e '.success == true' "$response" >/dev/null 2>&1; then
    api_success=true
  elif jq -e . "$response" >/dev/null 2>&1; then
    codes="$(jq -c '[.errors[]?.code]' "$response")"
    messages="$(jq -c '[.errors[]?.message]' "$response")"
  fi
  jq -cn \\
    --arg id "$deployment_id" \\
    --argjson curl_exit_code "$rc" \\
    --argjson api_success "$api_success" \\
    --argjson error_codes "$codes" \\
    --argjson error_messages "$messages" \\
    '{deployment_id:$id,curl_exit_code:$curl_exit_code,api_success:$api_success,error_codes:$error_codes,error_messages:$error_messages}' \\
    > "$result_file"
}
export -f delete_one
export API_ROOT CLOUDFLARE_API_TOKEN tmp_dir delete_result_dir

if [[ "$requested_delete_count" -gt 0 ]]; then
  jq -r '.[]' <<<"$initial_preview_ids" \\
    | xargs -r -n 1 -P "$DELETE_CONCURRENCY" bash -c 'delete_one "$1"' _
fi
: > "$RECEIPT_DIR/deletions.ndjson"
find "$delete_result_dir" -type f -name '*.json' -print0 \\
  | sort -z \\
  | xargs -0 -r cat \\
  > "$RECEIPT_DIR/deletions.ndjson"
"""
text = replace_once(text, old_loop, new_loop, "cleanup bounded parallel deletion")
old_final = """final_production_ids="$(jq -c '[.[] | select(.environment == "production") | .id] | unique | sort' <<<"$final")"
remaining_preview_ids="$(jq -c '[.[] | select(.environment == "preview" and .materialized == true) | .id] | unique | sort' <<<"$final")"
test "$initial_production_ids" = "$final_production_ids"

state="COMPLETE_VERIFIED"
if [[ "$(jq 'length' <<<"$remaining_preview_ids")" -ne 0 || "$failed" -ne 0 ]]; then
  state="BLOCKED"
fi

jq -n \\
  --arg project "$PROJECT_NAME" \\
  --arg state "$state" \\
  --arg control_reason "${CONTROL_REASON:-NOT_PROVIDED}" \\
  --argjson deleted "$deleted" \\
  --argjson failed "$failed" \\
  --argjson remaining_preview_ids "$remaining_preview_ids" \\
  --argjson production_ids "$final_production_ids" \\
  '{
    id:"kidults-cloudflare-preview-cleanup-receipt-v1",
    project:$project,state:$state,control_reason:$control_reason,
    deleted_preview_count:$deleted,
    failed_attempts:$failed,
    remaining_preview_ids:$remaining_preview_ids,
    production_ids_preserved:$production_ids,
    production_mutation:false,
    platform_environment:"STAGING",
    public_release:"HOLD",production:"HOLD",g5:"HOLD"
  }' > "$RECEIPT_DIR/final.json"
"""
new_final = """final_production_ids="$(jq -c '[.[] | select(.environment == "production") | .id] | unique | sort' <<<"$final")"
remaining_preview_ids="$(jq -c '[.[] | select(.environment == "preview" and .materialized == true) | .id] | unique | sort' <<<"$final")"
test "$initial_production_ids" = "$final_production_ids"

resolved_absent_ids="$(jq -n --argjson initial "$initial_preview_ids" --argjson remaining "$remaining_preview_ids" '$initial - $remaining')"
unresolved_preview_ids="$(jq -n --argjson initial "$initial_preview_ids" --argjson remaining "$remaining_preview_ids" '$initial - ($initial - $remaining)')"
resolved_absent_count="$(jq 'length' <<<"$resolved_absent_ids")"
unresolved_preview_count="$(jq 'length' <<<"$unresolved_preview_ids")"
remaining_preview_count="$(jq 'length' <<<"$remaining_preview_ids")"
delete_api_success_count="$(jq -s '[.[] | select(.api_success == true)] | length' "$RECEIPT_DIR/deletions.ndjson")"
delete_api_non_success_count="$(jq -s '[.[] | select(.api_success != true)] | length' "$RECEIPT_DIR/deletions.ndjson")"

state="COMPLETE_VERIFIED"
if [[ "$remaining_preview_count" -ne 0 || "$unresolved_preview_count" -ne 0 ]]; then
  state="BLOCKED"
fi

jq -n \\
  --arg project "$PROJECT_NAME" \\
  --arg state "$state" \\
  --arg control_reason "${CONTROL_REASON:-NOT_PROVIDED}" \\
  --argjson delete_concurrency "$DELETE_CONCURRENCY" \\
  --argjson intended_delete_count "$requested_delete_count" \\
  --argjson delete_api_success_count "$delete_api_success_count" \\
  --argjson delete_api_non_success_count "$delete_api_non_success_count" \\
  --argjson resolved_absent_count "$resolved_absent_count" \\
  --argjson unresolved_preview_count "$unresolved_preview_count" \\
  --argjson resolved_absent_ids "$resolved_absent_ids" \\
  --argjson unresolved_preview_ids "$unresolved_preview_ids" \\
  --argjson remaining_preview_ids "$remaining_preview_ids" \\
  --argjson production_ids "$final_production_ids" \\
  '{
    id:"kidults-cloudflare-preview-cleanup-receipt-v1",
    project:$project,state:$state,control_reason:$control_reason,
    delete_concurrency:$delete_concurrency,
    intended_delete_count:$intended_delete_count,
    delete_api_success_count:$delete_api_success_count,
    delete_api_non_success_count:$delete_api_non_success_count,
    deleted_preview_count:$resolved_absent_count,
    resolved_absent_count:$resolved_absent_count,
    failed_attempts:$unresolved_preview_count,
    unresolved_preview_count:$unresolved_preview_count,
    resolved_absent_ids:$resolved_absent_ids,
    unresolved_preview_ids:$unresolved_preview_ids,
    remaining_preview_ids:$remaining_preview_ids,
    deletion_success_uses_post_readback_absence:true,
    production_ids_preserved:$production_ids,
    production_mutation:false,
    platform_environment:"STAGING",
    public_release:"HOLD",production:"HOLD",g5:"HOLD"
  }' > "$RECEIPT_DIR/final.json"
"""
text = replace_once(text, old_final, new_final, "cleanup post-readback resolution")
write(cleanup_path, text)

validator_path = "scripts/kidults/kpmo/validate-cloudflare-pages-staging-governance-v1.mjs"
text = read(validator_path)
text = replace_once(text, "require(policy.version === '1.0.0', 'POLICY_VERSION');", "require(policy.version === '1.1.0', 'POLICY_VERSION');", "validator policy version")
for old in [
    "  require(policy.automatic_deployment_boundary?.legacy_deployments_enabled === false, 'LEGACY_AUTO_DEPLOY_OFF');\n",
    "  require((policy.automatic_deployment_boundary?.preview_branch_includes || []).length === 0, 'PREVIEW_INCLUDE_EMPTY');\n",
    "  require((policy.automatic_deployment_boundary?.preview_branch_excludes || []).length === 0, 'PREVIEW_EXCLUDE_EMPTY');\n",
]:
    if text.count(old) != 1:
        raise SystemExit(f"validator policy legacy/list check mismatch: {old!r}")
    text = text.replace(old, "")
text = replace_once(
    text,
    "  require(policy.automatic_deployment_boundary?.git_push_is_deployment_authority === false, 'GIT_PUSH_NOT_AUTHORITY');\n",
    "  require(policy.automatic_deployment_boundary?.granular_controls_authoritative === true, 'GRANULAR_CONTROLS_AUTHORITATIVE');\n"
    "  require(policy.automatic_deployment_boundary?.deprecated_deployments_enabled_authoritative === false, 'LEGACY_FLAG_INFORMATIONAL');\n"
    "  require(policy.automatic_deployment_boundary?.preview_branch_rules_authoritative_only_when_custom === true, 'PREVIEW_RULES_CUSTOM_ONLY');\n"
    "  require(policy.automatic_deployment_boundary?.git_push_is_deployment_authority === false, 'GIT_PUSH_NOT_AUTHORITY');\n",
    "validator granular policy",
)
text = replace_once(
    text,
    "    'current_main_match_is_informational:true',\n",
    "    'current_main_match_is_informational:true',\n"
    "    'automatic_deployment_containment_pass',\n"
    "    'current_main_auto_attempt_skipped',\n"
    "    'CONTAINMENT_VERIFIED_CLEANUP_AND_GOVERNED_DEPLOYMENT_PENDING',\n",
    "validator readonly markers",
)
old_markers = """  for (const marker of [
    '.config.deployments_enabled = false',
    '.config.production_deployments_enabled = false',
    '.config.preview_deployment_setting = "none"',
    '.config.preview_branch_includes = []',
    '.config.preview_branch_excludes = []',
    'list_all_deployment_ids()',
    'test "$before_ids" = "$after_ids"',
  ]) require(containScript.includes(marker), `CONTAINMENT_MARKER:${marker}`);
  require(!containScript.includes('/deployments/$deployment_id'), 'CONTAINMENT_MUST_NOT_DELETE');
"""
new_markers = """  for (const marker of [
    '.config.production_deployments_enabled = false',
    '.config.preview_deployment_setting = "none"',
    'list_all_deployment_ids()',
    'test "$before_ids" = "$after_ids"',
    'deprecated_legacy_flag_mutated:false',
    'inactive_preview_branch_rules_mutated:false',
  ]) require(containScript.includes(marker), `CONTAINMENT_MARKER:${marker}`);
  require(!containScript.includes('.config.deployments_enabled = false'), 'CONTAINMENT_DEPRECATED_FLAG_MUTATION_FORBIDDEN');
  require(!containScript.includes('.config.preview_branch_includes = []'), 'CONTAINMENT_INERT_PREVIEW_INCLUDE_MUTATION_FORBIDDEN');
  require(!containScript.includes('.config.preview_branch_excludes = []'), 'CONTAINMENT_INERT_PREVIEW_EXCLUDE_MUTATION_FORBIDDEN');
  require(!containScript.includes('/deployments/$deployment_id'), 'CONTAINMENT_MUST_NOT_DELETE');
"""
text = replace_once(text, old_markers, new_markers, "validator containment semantics")
text = replace_once(
    text,
    "  require(cleanupScript.includes('select(.environment == \"preview\" and .materialized == true) | .id'), 'CLEANUP_MATERIALIZED_PREVIEW_ONLY');\n",
    "  require(cleanupScript.includes('select(.environment == \"preview\" and .materialized == true) | .id'), 'CLEANUP_MATERIALIZED_PREVIEW_ONLY');\n"
    "  require(cleanupScript.includes('DELETE_CONCURRENCY=\"${DELETE_CONCURRENCY:-4}\"'), 'CLEANUP_BOUNDED_CONCURRENCY_DEFAULT');\n"
    "  require(cleanupScript.includes('DELETE_CONCURRENCY must be an integer from 1 to 8'), 'CLEANUP_BOUNDED_CONCURRENCY_GUARD');\n"
    "  require(cleanupScript.includes('deletion_success_uses_post_readback_absence:true'), 'CLEANUP_POST_READBACK_RESOLUTION');\n"
    "  require(cleanupScript.includes('xargs -r -n 1 -P \"$DELETE_CONCURRENCY\"'), 'CLEANUP_PARALLEL_BOUND');\n",
    "validator cleanup concurrency",
)
text = replace_once(
    text,
    "  require((deployScript.match(/production_deployments_enabled == false/g) || []).length >= 2, 'DEPLOY_PRE_AND_POST_AUTO_SETTING_GUARD');\n",
    "  require((deployScript.match(/production_deployments_enabled == false/g) || []).length >= 2, 'DEPLOY_PRE_AND_POST_AUTO_SETTING_GUARD');\n"
    "  require(!deployScript.includes('source.config.deployments_enabled'), 'DEPLOY_DEPRECATED_FLAG_GATE_FORBIDDEN');\n"
    "  require(!deployScript.includes('preview_branch_includes'), 'DEPLOY_INERT_PREVIEW_INCLUDE_GATE_FORBIDDEN');\n"
    "  require(!deployScript.includes('preview_branch_excludes'), 'DEPLOY_INERT_PREVIEW_EXCLUDE_GATE_FORBIDDEN');\n",
    "validator deploy granular semantics",
)
text = replace_once(
    text,
    "  require(validationWorkflow.includes('cloudflare-pages-staging-governance-v1.test.mjs'), 'VALIDATION_EXECUTABLE_TEST');\n",
    "  require(validationWorkflow.includes('cloudflare-pages-staging-governance-v1.test.mjs'), 'VALIDATION_EXECUTABLE_TEST');\n"
    "  require(validationWorkflow.includes('cloudflare-pages-granular-controls-v1.test.mjs'), 'VALIDATION_GRANULAR_CONTROLS_TEST');\n",
    "validator new regression binding",
)
text = replace_once(text, "  version: '1.0.0',\n", "  version: '1.1.0',\n", "validator receipt version")
write(validator_path, text)

runbook_path = "docs/kidults/runtime/cloudflare-pages-staging-governance-v1.md"
text = read(runbook_path)
text = replace_once(
    text,
    """- Git-integrated automatic deployments: disabled.
- Production-branch automatic deployments: disabled.
- Preview branch setting: `none`.
- Preview include/exclude lists: empty.
""",
    """- Production-branch automatic deployments: disabled through `production_deployments_enabled=false`.
- Preview branch automatic deployments: disabled through `preview_deployment_setting=none`.
- Deprecated `deployments_enabled` is informational only and is not an acceptance gate.
- Preview include/exclude rules are authoritative only when the Preview setting is `custom`; under `none` they are inert.
""",
    "runbook granular authority",
)
text = replace_once(
    text,
    "- Preview deletion: emergency manual operation only.\n",
    "- Preview deletion: emergency manual operation only, bounded to 4 concurrent deletes by default and never more than 8.\n"
    "- Delete outcomes are accepted only by post-operation API read-back; an HTTP failure whose target is absent is treated as resolved, while any remaining Preview deployment fails closed.\n",
    "runbook cleanup semantics",
)
text = replace_once(
    text,
    """4. Confirm the project settings read back as:
   - `production_deployments_enabled=false`
   - `preview_deployment_setting=none`
""",
    """4. Confirm the authoritative project settings read back as:
   - `production_deployments_enabled=false`
   - `preview_deployment_setting=none`
   - treat deprecated `deployments_enabled` and non-custom branch rules as informational only
""",
    "runbook readback semantics",
)
write(runbook_path, text)
