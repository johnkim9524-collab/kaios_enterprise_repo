#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  CONTRACT_PATH,
  REGISTRY_PATH,
  analyzeWorkflow,
  buildWorkflowInventory
} from './github-trusted-ref-environment-readback-v1.mjs';

const WORKFLOW_PATH = '.github/workflows/kpmo-github-trusted-ref-environment-readback-v1.yml';
const TEST_PATH = 'tests/kidults/kpmo/github-trusted-ref-environment-readback-v1.test.mjs';
const DOC_PATH = 'docs/kidults/security/github-trusted-ref-environment-readback-v1.md';
const COLLECTOR_PATH = 'scripts/kidults/kpmo/github-trusted-ref-environment-readback-v1.mjs';
const CHECKOUT_SHA = '3d3c42e5aac5ba805825da76410c181273ba90b1';
const SETUP_NODE_SHA = '820762786026740c76f36085b0efc47a31fe5020';
const UPLOAD_ARTIFACT_SHA = 'ea165f8d65b6e75b540449e92b4886f43607fa02';
const EXPECTED_SOURCE_EXPR = '${{ github.event.pull_request.head.sha || github.sha }}';
const assert = (condition, message) => { if (!condition) throw new Error(message); };

export function validateReceipt(receipt, { requireExternalProof = false } = {}) {
  const failures = [];
  const require = (condition, id) => { if (!condition) failures.push(id); };
  const forbiddenKeys = new Set(['authorization', 'password', 'private_key', 'secret', 'secret_names', 'secret_value', 'secrets', 'token']);
  const hasForbiddenKey = (value) => {
    if (Array.isArray(value)) return value.some(hasForbiddenKey);
    if (!value || typeof value !== 'object') return false;
    return Object.entries(value).some(([key, nested]) => forbiddenKeys.has(key.toLowerCase()) || hasForbiddenKey(nested));
  };
  require(receipt?.id === 'kidults-github-trusted-ref-environment-readback-receipt-v1', 'receipt_id');
  require(receipt?.version === '1.1.0', 'receipt_version');
  require(receipt?.issue === 974 && receipt?.parent_gate_issue === 881, 'issue_binding');
  require(['BLOCKED', 'VERIFIED_PASS'].includes(receipt?.state), 'governed_state');
  require(!Number.isNaN(Date.parse(String(receipt?.observed_at || ''))), 'observed_at');
  require(['PUBLIC_METADATA_ONLY', 'GITHUB_TOKEN_METADATA_READ', 'TEST_FIXTURE'].includes(receipt?.authorization_mode), 'authorization_mode');
  require(/^[0-9a-f]{40}$/.test(String(receipt?.exact_source_sha || '')), 'exact_source_sha');
  require(/^sha256:[0-9a-f]{64}$/.test(String(receipt?.readback_digest || '')), 'readback_digest');
  require(receipt?.endpoint_http_statuses && typeof receipt.endpoint_http_statuses === 'object', 'endpoint_statuses');
  require(!hasForbiddenKey(receipt), 'raw_secret_or_credential_field_forbidden');
  require(receipt?.settings_mutated === false, 'settings_mutation_boundary');
  require(receipt?.secret_material_read === false, 'secret_material_boundary');
  require(receipt?.secret_names_emitted === false, 'secret_name_output_boundary');
  const expectedCredentialActivation = receipt?.authorization_mode === 'GITHUB_TOKEN_METADATA_READ'
    ? 'EPHEMERAL_GITHUB_TOKEN_METADATA_READ'
    : 'NONE';
  require(receipt?.credential_activation === expectedCredentialActivation, 'credential_activation_semantics');
  require(receipt?.stored_repository_or_environment_secret_activated === false, 'stored_secret_activation_boundary');
  require(receipt?.provider_credential_activated === false, 'provider_credential_activation_boundary');
  require(receipt?.issue_974_closed_by_this_readback === false, 'issue_974_auto_closure_forbidden');
  require(receipt?.issue_881_control_pass_promoted === false, 'issue_881_promotion_forbidden');
  require(receipt?.effective_ruleset_readback_issue_936_closed === false, 'issue_936_closure_forbidden');
  require(receipt?.empirical_evidence_promoted === false, 'empirical_promotion_forbidden');
  require(receipt?.external_partner_ingestion_authorized === false, 'partner_ingestion_boundary');
  require(receipt?.production === 'HOLD' && receipt?.public === 'HOLD', 'release_boundary');
  require(receipt?.g5 === 'EXPLICIT_APPROVAL_REQUIRED', 'g5_boundary');
  require(receipt?.registered_privileged_manual_lanes === 15, 'registered_lane_count');
  require(Array.isArray(receipt?.binding_results) && receipt.binding_results.length === receipt?.secret_bearing_jobs, 'binding_partition');
  require(receipt?.verified_secret_bearing_jobs === receipt?.binding_results?.filter((item) => item.state === 'VERIFIED_PASS').length, 'verified_binding_count');
  require(receipt?.ruleset_context_only === true, 'ruleset_context_boundary');
  if (receipt?.state === 'BLOCKED') {
    require(receipt?.issue_974_closure_eligible === false, 'blocked_not_closure_eligible');
    require(Array.isArray(receipt?.blockers) && receipt.blockers.length > 0, 'blocked_requires_blocker');
  }
  if (receipt?.state === 'VERIFIED_PASS') {
    require(receipt?.issue_974_closure_eligible === true, 'verified_closure_eligibility');
    require(receipt?.binding_results?.every((item) => item.state === 'VERIFIED_PASS'), 'verified_all_bindings');
    require(Array.isArray(receipt?.blockers) && receipt.blockers.length === 0, 'verified_has_no_blockers');
  }
  if (requireExternalProof) require(receipt?.state === 'VERIFIED_PASS', 'external_proof_required');
  return [...new Set(failures)];
}

export function validateWorkflowSource(source) {
  const failures = [];
  const require = (condition, id) => { if (!condition) failures.push(id); };
  const count = (needle) => source.split(needle).length - 1;
  const externalUses = [...source.matchAll(/uses:\s*([^\s#]+)/g)]
    .map((match) => match[1])
    .filter((use) => !use.startsWith('./'));
  require(/^permissions:\s*\n\s*contents:\s*read\s*\n\s*deployments:\s*read\s*$/m.test(source), 'least_privilege_permissions');
  require(/^\s{2}pull_request:\s*$/m.test(source), 'pull_request_trigger');
  require(/^\s{2}push:\s*$/m.test(source) && /branches:\s*\[\s*main\s*\]/.test(source), 'protected_main_push_trigger');
  require(/^\s{2}schedule:\s*$/m.test(source) && /cron:\s*['"][^'"]+['"]/.test(source), 'automatic_schedule_trigger');
  require(/^\s{2}workflow_dispatch:\s*$/m.test(source), 'manual_recovery_trigger');
  require(!/pull_request_target\s*:/.test(source), 'pull_request_target_forbidden');
  require(/runs-on:\s*ubuntu-24\.04/.test(source), 'runner_not_pinned');
  require(source.includes(`uses: actions/checkout@${CHECKOUT_SHA}`), 'checkout_not_immutable');
  require(source.includes(`uses: actions/setup-node@${SETUP_NODE_SHA}`), 'setup_node_not_immutable');
  require(source.includes(`uses: actions/upload-artifact@${UPLOAD_ARTIFACT_SHA}`), 'upload_artifact_not_immutable');
  require(externalUses.every((use) => /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+@[0-9a-f]{40}$/.test(use)), 'mutable_or_unpinned_external_action');
  require(externalUses.filter((use) => use === `actions/checkout@${CHECKOUT_SHA}`).length === 2, 'checkout_action_count');
  require(externalUses.filter((use) => use === `actions/setup-node@${SETUP_NODE_SHA}`).length === 2, 'setup_node_action_count');
  require(externalUses.filter((use) => use === `actions/upload-artifact@${UPLOAD_ARTIFACT_SHA}`).length === 1, 'upload_artifact_action_count');
  require(count(`ref: ${EXPECTED_SOURCE_EXPR}`) === 2, 'exact_source_checkout');
  require((source.match(/fetch-depth:\s*1/g) || []).length === 2, 'bounded_checkout_depth');
  require((source.match(/persist-credentials:\s*false/g) || []).length === 2, 'checkout_credentials_boundary');
  require(count(`EXPECTED_SOURCE_SHA: ${EXPECTED_SOURCE_EXPR}`) === 2, 'expected_sha_binding');
  require(count('git rev-parse HEAD') === 2, 'source_sha_readback');
  require(count('test "$ACTUAL_SOURCE_SHA" = "$EXPECTED_SOURCE_SHA"') === 2, 'source_sha_assertion');
  require((source.match(/node-version:\s*['"]24['"]/g) || []).length === 2, 'node_24');
  require(source.includes(`node ${COLLECTOR_PATH}`), 'collector_execution');
  require(source.includes('node scripts/kidults/kpmo/validate-github-trusted-ref-environment-readback-v1.mjs'), 'validator_execution');
  require(source.includes(`node --test ${TEST_PATH}`), 'test_execution');
  require(source.includes('GITHUB_TOKEN: ${{ github.token }}'), 'ephemeral_github_token_binding');
  require(!/\$\{\{\s*secrets\b/.test(source) && !/^\s*secrets\s*:\s*inherit/m.test(source), 'repository_secret_context_forbidden');
  require(!/continue-on-error\s*:\s*true/.test(source), 'continue_on_error_forbidden');
  require(source.includes('if-no-files-found: error'), 'artifact_missing_fail_closed');
  require(source.includes('retention-days: 30'), 'bounded_retention');
  return [...new Set(failures)];
}

export function validateRepository(root = process.cwd()) {
  const contract = JSON.parse(fs.readFileSync(path.join(root, CONTRACT_PATH), 'utf8'));
  const registry = JSON.parse(fs.readFileSync(path.join(root, REGISTRY_PATH), 'utf8'));
  const inventory = buildWorkflowInventory(root, registry);
  const workflow = fs.readFileSync(path.join(root, WORKFLOW_PATH), 'utf8');
  const collector = fs.readFileSync(path.join(root, COLLECTOR_PATH), 'utf8');
  const testSource = fs.readFileSync(path.join(root, TEST_PATH), 'utf8');
  const docs = fs.readFileSync(path.join(root, DOC_PATH), 'utf8');

  assert(contract.id === 'kidults-github-trusted-ref-environment-readback-contract-v1', 'CONTRACT_ID');
  assert(contract.issue === 974 && contract.parent_gate_issue === 881, 'CONTRACT_ISSUE_BINDING');
  assert(contract.status === 'IMPLEMENTED_READ_ONLY_PROOF_PATH_EXTERNAL_POLICY_NOT_VERIFIED', 'CONTRACT_STATUS');
  assert(JSON.stringify(contract.platform_principles) === JSON.stringify(['AUTONOMOUS', 'GLOBAL', 'IRREPLACEABLE_VALUE', 'TRANSPARENT']), 'PRINCIPLE_ORDER');
  assert(contract.approved_closure_patterns.github_environment.deployment_branch_policy_is_exact_main_only === true, 'EXACT_MAIN_POLICY');
  assert(contract.approved_closure_patterns.trusted_default_branch_or_release_handoff.repository_declaration_alone_is_sufficient === false, 'REPOSITORY_DECLARATION_NOT_PROOF');
  assert(contract.approved_closure_patterns.trusted_default_branch_or_release_handoff.implemented_by_this_contract === false, 'HANDOFF_NOT_IMPLEMENTED');
  assert(contract.truth_boundary.issue_974_closed_by_repository_implementation === false, 'ISSUE_974_BOUNDARY');
  assert(contract.truth_boundary.issue_881_control_pass_promoted === false, 'ISSUE_881_BOUNDARY');
  assert(contract.truth_boundary.empirical_evidence_promoted === false, 'EMPIRICAL_BOUNDARY');
  assert(contract.truth_boundary.production === 'HOLD' && contract.truth_boundary.public === 'HOLD', 'RELEASE_HOLD');
  assert(contract.truth_boundary.g5 === 'EXPLICIT_APPROVAL_REQUIRED', 'G5_HOLD');
  assert(registry.issue === 974 && registry.status === 'EXTERNAL_APPROVAL_REQUIRED', 'REGISTRY_REMAINS_OPEN');
  assert(registry.inventory_evidence?.evidence_semantics === 'HISTORICAL_REGISTRATION_BASELINE_NOT_LIVE_EXTERNAL_POLICY_READBACK', 'REGISTRY_BASELINE_TIME_SEMANTICS');
  assert(registry.internal_readback_control?.contract === CONTRACT_PATH, 'REGISTRY_READBACK_CONTRACT_POINTER');
  assert(registry.internal_readback_control?.workflow === WORKFLOW_PATH, 'REGISTRY_READBACK_WORKFLOW_POINTER');
  assert(registry.internal_readback_control?.state === contract.status, 'REGISTRY_READBACK_STATE');
  assert(registry.internal_readback_control?.settings_mutated === false && registry.internal_readback_control?.secret_material_read === false, 'REGISTRY_READBACK_SAFETY_BOUNDARY');
  assert(registry.internal_readback_control?.issue_974_closed === false && registry.internal_readback_control?.issue_881_control_pass_promoted === false, 'REGISTRY_SEMANTIC_BOUNDARY');
  assert(inventory.registered_lane_count === registry.registered_count && registry.registered_count === 15, 'REGISTRY_LANE_PARTITION');
  assert(inventory.secret_bearing_job_count === 15, 'SECRET_BEARING_JOB_PARTITION');
  assert(inventory.lanes.every((lane) => lane.secret_bearing_jobs.every((job) => !job.environment.declared)), 'CURRENT_LANES_MUST_NOT_BE_PROMOTED_TO_ENV_BOUND');
  assert(inventory.lanes.filter((lane) => lane.secret_bearing_jobs.some((job) => job.explicit_main_ref_guard)).length === 2, 'REPOSITORY_MAIN_GUARD_COUNT');
  assert(validateWorkflowSource(workflow).length === 0, `WORKFLOW_PROVENANCE:${validateWorkflowSource(workflow).join(',')}`);
  assert(/method:\s*'GET'/.test(collector), 'COLLECTOR_GET_ONLY');
  assert(!/method:\s*['"](?:POST|PUT|PATCH|DELETE)['"]/.test(collector), 'COLLECTOR_MUTATING_METHOD');
  assert(!/\/actions\/secrets/.test(collector), 'REPOSITORY_SECRET_ENDPOINT_FORBIDDEN');
  assert(collector.includes('/environments/${encoded}/secrets'), 'ENVIRONMENT_SECRET_METADATA_ENDPOINT_REQUIRED');
  assert(collector.includes('secret_names_emitted: false'), 'SECRET_NAMES_OUTPUT_BOUNDARY');
  assert(testSource.includes('selected non-main ref and stale main SHA are independently rejected'), 'NEGATIVE_REF_TEST_MISSING');
  assert(docs.includes('BLOCKED_EXTERNAL_CONTROL_PLANE_NOT_ESTABLISHED'), 'DOC_CURRENT_STATE');
  assert(docs.includes('#881'), 'DOC_PARENT_BOUNDARY');

  const workflowMutations = [
    ['pull_request_target', workflow.replace('pull_request:', 'pull_request_target:')],
    ['contents_write', workflow.replace('contents: read', 'contents: write')],
    ['mutable_checkout', workflow.replace(`actions/checkout@${CHECKOUT_SHA}`, 'actions/checkout@v4')],
    ['mutable_setup_node', workflow.replace(`actions/setup-node@${SETUP_NODE_SHA}`, 'actions/setup-node@v4')],
    ['mutable_upload', workflow.replace(`actions/upload-artifact@${UPLOAD_ARTIFACT_SHA}`, 'actions/upload-artifact@v4')],
    ['moving_runner', workflow.replaceAll('ubuntu-24.04', 'ubuntu-latest')],
    ['wrong_checkout_ref', workflow.replace(`ref: ${EXPECTED_SOURCE_EXPR}`, 'ref: main')],
    ['persist_credentials', workflow.replace('persist-credentials: false', 'persist-credentials: true')],
    ['sha_assertion_removed', workflow.replace('test "$ACTUAL_SOURCE_SHA" = "$EXPECTED_SOURCE_SHA"', 'true # disabled')],
    ['node_downgrade', workflow.replace("node-version: '24'", "node-version: '22'")],
    ['repository_secret_injection', `${workflow}\nenv:\n  BAD: \${{ secrets.BAD }}\n`],
    ['manual_only', workflow.replace(/\n\s*schedule:\n\s*- cron:[^\n]+/, '')]
  ];
  for (const [id, mutated] of workflowMutations) {
    assert(validateWorkflowSource(mutated).length > 0, `WORKFLOW_MUTATION_ACCEPTED:${id}`);
  }

  const analyzerMutations = [
    ['dot_secret', `on:\n  workflow_dispatch:\njobs:\n  test:\n    env:\n      TOKEN: \${{ secrets.TEST_TOKEN }}`],
    ['static_bracket_secret', `on:\n  workflow_dispatch:\njobs:\n  test:\n    env:\n      TOKEN: \${{ secrets['TEST_TOKEN'] }}`],
    ['dynamic_secret', `on:\n  workflow_dispatch:\njobs:\n  test:\n    env:\n      TOKEN: \${{ secrets[inputs.name] }}`],
    ['whole_secret_context', `on:\n  workflow_dispatch:\njobs:\n  test:\n    env:\n      TOKEN: \${{ toJSON(secrets) }}`],
    ['inherited_secret', `on:\n  workflow_dispatch:\njobs:\n  test:\n    uses: ./.github/workflows/reusable.yml\n    secrets: inherit`]
  ];
  for (const [id, source] of analyzerMutations) {
    assert(analyzeWorkflow(source, `${id}.yml`).privileged_manual_lane, `ANALYZER_MUTATION_MISSED:${id}`);
  }

  return {
    suite: 'KIDULTS_GITHUB_TRUSTED_REF_ENVIRONMENT_READBACK_VALIDATION_V1',
    state: 'VERIFIED_PASS',
    issue: 974,
    parent_gate_issue: 881,
    internal_control_verified: true,
    external_control_plane_policy_verified: false,
    registered_privileged_manual_lanes: inventory.registered_lane_count,
    secret_bearing_jobs: inventory.secret_bearing_job_count,
    environment_bound_secret_bearing_jobs: inventory.lanes.reduce(
      (count, lane) => count + lane.secret_bearing_jobs.filter((job) => job.environment.declared).length,
      0
    ),
    repository_main_guard_lanes: inventory.lanes.filter(
      (lane) => lane.secret_bearing_jobs.some((job) => job.explicit_main_ref_guard)
    ).length,
    workflow_mutations_rejected: workflowMutations.length,
    analyzer_mutations_detected: analyzerMutations.length,
    live_github_requests_executed_by_validator: 0,
    settings_mutated: false,
    secret_material_read: false,
    validator_credential_activation: 'NONE_STATIC_VALIDATION_ONLY',
    issue_974_closed: false,
    issue_881_control_pass_promoted: false,
    empirical_evidence_promoted: false,
    production: 'HOLD',
    public: 'HOLD',
    g5: 'EXPLICIT_APPROVAL_REQUIRED',
    autonomous_effect: contract.effects.autonomous_effect,
    global_effect: contract.effects.global_effect,
    irreplaceable_value_effect: contract.effects.irreplaceable_value_effect,
    transparency_effect: contract.effects.transparency_effect
  };
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : null;
}

function main() {
  const result = validateRepository(process.cwd());
  const receiptPath = argument('--receipt');
  if (receiptPath) {
    const receipt = JSON.parse(fs.readFileSync(path.resolve(receiptPath), 'utf8'));
    const failures = validateReceipt(receipt, { requireExternalProof: process.argv.includes('--require-external-proof') });
    assert(failures.length === 0, `READBACK_RECEIPT:${failures.join(',')}`);
    result.readback_receipt_state = receipt.state;
    result.readback_receipt_digest = receipt.readback_digest;
    result.readback_receipt_truth_validated = true;
  }
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    main();
  } catch (error) {
    console.error(`FAIL:${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
