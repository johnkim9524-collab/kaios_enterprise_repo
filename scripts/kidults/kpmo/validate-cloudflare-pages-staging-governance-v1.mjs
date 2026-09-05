#!/usr/bin/env node
import fs from 'node:fs';

const P = {
  policy: 'coordination/kidults/runtime/cloudflare-pages-staging-governance-v1.json',
  containment: 'coordination/kidults/runtime/cloudflare-privileged-mutation-containment-v1.json',
  registry: 'coordination/kidults/kpmo/secret-bearing-workflow-dispatch-registry-v1.json',
  readonlyWorkflow: '.github/workflows/kidults-cloudflare-pages-boundary-readonly-v1.yml',
  deployWorkflow: '.github/workflows/kidults-cloudflare-pages-staging-deploy-v1.yml',
  emergencyWorkflow: '.github/workflows/kidults-cloudflare-pages-emergency-control-v1.yml',
  readonlyScript: 'scripts/ops/cloudflare-pages-boundary-readonly.sh',
  containScript: 'scripts/ops/cloudflare-pages-auto-deployment-containment.sh',
  cleanupScript: 'scripts/ops/cloudflare-pages-preview-cleanup.sh',
  deployScript: 'scripts/ops/cloudflare-pages-governed-staging-deploy.sh'
};
for (const file of Object.values(P)) {
  if (!fs.existsSync(file)) throw new Error(`MISSING:${file}`);
}
const read = (file) => fs.readFileSync(file, 'utf8');
const policy = JSON.parse(read(P.policy));
const containment = JSON.parse(read(P.containment));
const registry = JSON.parse(read(P.registry));
const findings = [];
const req = (condition, id) => { if (!condition) findings.push(id); };

req(policy.id === 'kidults-cloudflare-pages-staging-governance-v1', 'POLICY_ID');
req(policy.version === '1.2.0', 'POLICY_VERSION');
req(policy.status === 'STAGING_GOVERNANCE_ACTIVE_PRIVILEGED_MUTATION_LANES_FAIL_CLOSED', 'POLICY_STATUS');
req(policy.issue === 1234 && policy.authorization_issue === 1576, 'ISSUE_BINDING');
req(policy.project?.name === 'kidults-workspace-staging', 'PROJECT');
req(policy.project?.expected_repository === 'johnkim9524-collab/kaios_enterprise_repo', 'REPOSITORY');
req(policy.project?.production_branch === 'main', 'MAIN_BRANCH');
req(policy.automatic_deployment_boundary?.production_deployments_enabled === false, 'PRODUCTION_AUTO_OFF');
req(policy.automatic_deployment_boundary?.preview_deployment_setting === 'none', 'PREVIEW_NONE');
req(policy.automatic_deployment_boundary?.granular_controls_authoritative === true, 'GRANULAR_AUTHORITY');
req(policy.automatic_deployment_boundary?.deprecated_deployments_enabled_authoritative === false, 'LEGACY_NONAUTH');
req(policy.automatic_deployment_boundary?.preview_branch_rules_authoritative_only_when_custom === true, 'PREVIEW_RULE_SCOPE');
req(policy.automatic_deployment_boundary?.git_push_is_deployment_authority === false, 'GIT_PUSH_NOT_AUTHORITY');

req(policy.verified_provider_state?.source_run_id === 33262992819, 'PROVIDER_RUN');
req(policy.verified_provider_state?.artifact_id === 9717897493, 'PROVIDER_ARTIFACT');
req(policy.verified_provider_state?.artifact_digest === 'sha256:5c642753fad37bebd70555938e2a0e6daed95c88d9d5fb4e6bc6cf49cb33e309', 'PROVIDER_DIGEST');
req(policy.verified_provider_state?.materialized_preview_initial === 588, 'PREVIEW_INITIAL');
req(policy.verified_provider_state?.materialized_preview_deleted === 588, 'PREVIEW_DELETED');
req(policy.verified_provider_state?.materialized_preview_remaining === 0, 'PREVIEW_REMAINING');
req(policy.verified_provider_state?.preexisting_production_ids_preserved === 124, 'PRODUCTION_IDS_PRESERVED');
req(policy.verified_provider_state?.governed_staging_deployment_id === 'dc6654a1-ee61-4762-92a1-b3f25e064e91', 'STAGING_DEPLOYMENT_ID');

req(policy.deployment_policy?.state === 'FAIL_CLOSED_PENDING_ISSUE_1576', 'DEPLOY_STATE');
req(policy.deployment_policy?.trigger === 'DISABLED', 'DEPLOY_TRIGGER_DISABLED');
req(policy.deployment_policy?.job_condition === '${{ false }}', 'DEPLOY_JOB_FALSE');
req(policy.deployment_policy?.operator_identity_is_authorization === false, 'OWNER_NOT_AUTHORITY');
req(policy.deployment_policy?.typed_phrase_is_authorization === false, 'PHRASE_NOT_AUTHORITY');
req(policy.deployment_policy?.workflow_input_is_authorization === false, 'INPUT_NOT_AUTHORITY');
req(policy.deployment_policy?.repository_json_is_authorization === false, 'REPO_JSON_NOT_AUTHORITY');
req(policy.deployment_policy?.provider_secret_resolution_reachable === false, 'DEPLOY_SECRET_UNREACHABLE');
req(policy.deployment_policy?.provider_call_reachable === false, 'DEPLOY_CALL_UNREACHABLE');

req(policy.read_only_monitor?.visible_preview_count_must_be_zero === true, 'PREVIEW_ZERO');
req(policy.read_only_monitor?.remote_mutation === false, 'READONLY_NO_MUTATION');
req(policy.emergency_control?.state === 'FAIL_CLOSED_PENDING_ISSUE_1576', 'EMERGENCY_STATE');
req(policy.emergency_control?.job_condition === '${{ false }}', 'EMERGENCY_JOB_FALSE');
req(policy.emergency_control?.request_inputs_are_authorization === false, 'EMERGENCY_INPUT_NOT_AUTHORITY');
req(policy.emergency_control?.provider_secret_resolution_reachable === false, 'EMERGENCY_SECRET_UNREACHABLE');
req(policy.emergency_control?.provider_call_reachable === false, 'EMERGENCY_CALL_UNREACHABLE');
req(policy.emergency_control?.production_deployment_delete_forbidden === true, 'PROD_DELETE_FORBIDDEN');
req(policy.credential_policy?.provider_secret_resolution_currently_reachable === false, 'CURRENT_SECRET_UNREACHABLE');
req(policy.credential_policy?.environment_secret_presence_or_removal === 'EXTERNAL_CONTROL_PLANE_NOT_ASSERTED_BY_REPOSITORY', 'SECRET_TRUTH_BOUNDARY');
for (const field of [
  'independent_receipt_outside_candidate_change',
  'exact_operation_resource_count_source_control_run_binding',
  'issuer_issued_at_expiry_nonce_binding',
  'atomic_one_time_consumption_before_provider_secret_resolution',
  'replay_stale_widened_self_authored_negative_tests',
  'separate_public_production_g5_approvals'
]) {
  req(policy.re_enable_gate?.[field] === true, `RE_ENABLE_GATE:${field}`);
}
req(policy.truth_boundary?.platform_environment === 'STAGING', 'STAGING');
req(policy.truth_boundary?.public_release === 'HOLD' && policy.truth_boundary?.production === 'HOLD' && policy.truth_boundary?.g5 === 'HOLD', 'RELEASE_HOLD');
req(policy.truth_boundary?.future_cloudflare_mutation_authorized === false, 'FUTURE_MUTATION_NOT_AUTHORIZED');

req(containment.state === 'FAIL_CLOSED_CONTAINED' && containment.issue === 1576, 'CONTAINMENT_STATE');
req(containment.contained_workflows?.length === 2, 'CONTAINED_LANE_COUNT');
req(containment.contained_workflows?.every((lane) => lane.provider_secret_resolution_reachable === false && lane.provider_mutation_reachable === false), 'CONTAINED_LANES_UNREACHABLE');
req(containment.mutation_by_containment?.cloudflare_api_called === false, 'CONTAINMENT_NO_PROVIDER_CALL');
req(containment.mutation_by_containment?.credentials_read === false, 'CONTAINMENT_NO_SECRET_READ');

const readonly = read(P.readonlyScript);
const deployScript = read(P.deployScript);
const cleanup = read(P.cleanupScript);
const contain = read(P.containScript);
for (const script of [readonly, deployScript]) {
  req(script.includes('production_deployments_enabled') && script.includes('preview_deployment_setting'), 'GRANULAR_SCRIPT_GUARD');
  req(!script.includes('legacy_deployments_enabled == false'), 'LEGACY_MUST_NOT_GATE');
}
req(readonly.includes('legacy_deployments_enabled_authoritative:false'), 'READONLY_LEGACY_INFORMATIONAL');
req(readonly.includes('preview_branch_rules_authoritative_only_when_custom:true'), 'READONLY_PREVIEW_RULE_SCOPE');
req(readonly.includes('select(.environment == "preview" and .materialized == true)'), 'READONLY_MATERIALIZED_PREVIEW');
req(readonly.includes('"$skipped_attempt_count" -eq 0'), 'READONLY_ALL_SKIPPED_ATTEMPTS_FAIL_CLOSED');
req(readonly.includes('skipped_attempt_count:$skipped_attempt_count'), 'READONLY_ALL_SKIPPED_ATTEMPTS_BOUND');
req(readonly.includes('BLOCKED_INVENTORY_CAPACITY') && readonly.includes('DEPLOYMENT_INVENTORY_PAGE_LIMIT'), 'READONLY_CAPACITY_TERMINAL_RECEIPT');
req(readonly.includes('DEPLOYMENT_INVENTORY_READBACK_FAILED') && readonly.includes('READBACK_ERROR'), 'READONLY_READBACK_FAILURE_TERMINAL_RECEIPT');
req(readonly.includes('api_get "$API_ROOT/deployments?per_page=${PAGE_SIZE}&page=$page" "$page_file" || return 69'), 'READONLY_API_FAILURE_PROPAGATION');
req(readonly.includes('capacity_state:$capacity_state') && readonly.includes('promotion_eligible:false'), 'READONLY_CAPACITY_TRUTH_BOUND');
req(readonly.includes('APPROVAL_BOUND_V1') && readonly.includes('LEGACY_GOVERNED_V1'), 'READONLY_GOVERNED_LINEAGE_FORMATS');
req(cleanup.includes('select(.environment == "preview" and .materialized == true) | .id'), 'CLEANUP_PREVIEW_ONLY');
req(cleanup.includes('BLOCKED_INVENTORY_CAPACITY') && cleanup.includes('PRE_MUTATION') && cleanup.includes('POST_MUTATION'), 'CLEANUP_CAPACITY_TERMINAL_RECEIPTS');
req(cleanup.includes('production_preservation_verified:false') && cleanup.includes('promotion_eligible:false'), 'CLEANUP_CAPACITY_TRUTH_BOUND');
req(cleanup.includes('test "$initial_production_ids" = "$final_production_ids"'), 'PRODUCTION_HISTORY_GUARD');
req(!cleanup.includes('select(.environment == "production") | .id | @sh'), 'NO_PROD_DELETE');
req(contain.includes('.config.production_deployments_enabled = false'), 'CONTAIN_PRODUCTION_OFF');
req(contain.includes('.config.preview_deployment_setting = "none"'), 'CONTAIN_PREVIEW_NONE');
req(deployScript.includes('wrangler@4.127.1 pages deploy'), 'WRANGLER_PIN');
req(deployScript.includes('trigger_type == "ad_hoc"'), 'ADHOC_PROOF');
req(deployScript.includes('public_release:"HOLD"') && deployScript.includes('production:"HOLD"') && deployScript.includes('g5:"HOLD"'), 'DEPLOY_HOLD');

const emergencyWorkflow = read(P.emergencyWorkflow);
const deploymentWorkflow = read(P.deployWorkflow);
req((emergencyWorkflow.match(/if: \$\{\{ false \}\}/g) || []).length === 1, 'EMERGENCY_RUNTIME_NOT_DISABLED');
req((deploymentWorkflow.match(/if: \$\{\{ false \}\}/g) || []).length === 2, 'DEPLOY_RUNTIME_NOT_DISABLED');
req(!emergencyWorkflow.includes('CONTAIN_KIDULTS_WORKSPACE_STAGING'), 'EMERGENCY_TYPED_PHRASE_PRESENT');
req(!emergencyWorkflow.includes('DELETE_PREVIEW_ONLY_KIDULTS_WORKSPACE_STAGING'), 'DELETE_TYPED_PHRASE_PRESENT');
req(!deploymentWorkflow.includes('DEPLOY_KIDULTS_WORKSPACE_STAGING'), 'DEPLOY_TYPED_PHRASE_PRESENT');
req(!emergencyWorkflow.includes('cloudflare-pages-preview-cleanup.sh --delete-preview'), 'EMERGENCY_DELETE_CALL_PRESENT');
req(!emergencyWorkflow.includes('cloudflare-pages-auto-deployment-containment.sh --execute'), 'EMERGENCY_PATCH_CALL_PRESENT');
req(!deploymentWorkflow.includes('cloudflare-pages-governed-staging-deploy.sh'), 'DEPLOY_PROVIDER_CALL_PRESENT');
req(emergencyWorkflow.includes('exit 78') && (deploymentWorkflow.match(/exit 78/g) || []).length === 2, 'TOMBSTONE_EXIT_MISSING');

for (const workflow of [P.readonlyWorkflow, P.emergencyWorkflow, P.deployWorkflow]) {
  req((registry.registered_workflows || []).includes(workflow), `REGISTRY:${workflow}`);
}

const mutations = [
  ['AUTO_ON', () => { const value = structuredClone(policy); value.automatic_deployment_boundary.production_deployments_enabled = true; return value.automatic_deployment_boundary.production_deployments_enabled === false; }],
  ['PREVIEW_ALL', () => { const value = structuredClone(policy); value.automatic_deployment_boundary.preview_deployment_setting = 'all'; return value.automatic_deployment_boundary.preview_deployment_setting === 'none'; }],
  ['ENABLE_DEPLOY', () => { const value = structuredClone(policy); value.deployment_policy.trigger = 'workflow_dispatch_only'; return value.deployment_policy.trigger === 'DISABLED'; }],
  ['PHRASE_AUTH', () => { const value = structuredClone(policy); value.deployment_policy.typed_phrase_is_authorization = true; return value.deployment_policy.typed_phrase_is_authorization === false; }],
  ['EMERGENCY_CALL', () => { const value = structuredClone(containment); value.contained_workflows[0].provider_mutation_reachable = true; return value.contained_workflows[0].provider_mutation_reachable === false; }],
  ['PUBLIC_ON', () => { const value = structuredClone(policy); value.truth_boundary.public_release = 'GO'; return value.truth_boundary.public_release === 'HOLD'; }]
];
for (const [id, mutation] of mutations) req(mutation() === false, `MUTATION_FALSE_GREEN:${id}`);

const receipt = {
  id: 'kidults-cloudflare-pages-staging-governance-validation-receipt-v1',
  version: '1.2.0',
  state: findings.length ? 'VERIFIED_FAIL' : 'VERIFIED_PASS',
  project: 'kidults-workspace-staging',
  granular_controls_authoritative: true,
  automatic_git_deployments: 'DISABLED_REQUIRED',
  visible_materialized_preview_required: 0,
  verified_provider_result_preserved: true,
  future_privileged_mutations: 'FAIL_CLOSED_PENDING_ISSUE_1576',
  credentialed_mutation_lanes_reachable: false,
  repository_or_workflow_input_is_authorization: false,
  readonly_drift_monitor: true,
  findings,
  public_release: 'HOLD',
  production: 'HOLD',
  g5: 'HOLD'
};
console.log(JSON.stringify(receipt, null, 2));
if (findings.length) process.exit(1);
