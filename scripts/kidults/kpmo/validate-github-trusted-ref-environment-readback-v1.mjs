#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  CONTRACT_PATH,
  REGISTRY_PATH,
  analyzeWorkflow,
  buildWorkflowInventory,
  computeReadbackDigest,
  validateRequiredEnvironmentBindings
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
  require(receipt?.version === '1.3.0', 'receipt_version');
  require(receipt?.issue === 974 && receipt?.parent_gate_issue === 881, 'issue_binding');
  require(['BLOCKED', 'VERIFIED_PASS'].includes(receipt?.state), 'governed_state');
  require(!Number.isNaN(Date.parse(String(receipt?.observed_at || ''))), 'observed_at');
  require([
    'PUBLIC_METADATA_ONLY',
    'GITHUB_TOKEN_METADATA_READ',
    'GITHUB_APP_ENVIRONMENTS_AND_SECRETS_READ',
    'TEST_FIXTURE'
  ].includes(receipt?.authorization_mode), 'authorization_mode');
  const expectedProofScope = receipt?.authorization_mode === 'GITHUB_APP_ENVIRONMENTS_AND_SECRETS_READ'
    ? 'AUTHORIZED_ENVIRONMENT_AND_SECRET_SCOPE_METADATA_READBACK'
    : (receipt?.authorization_mode === 'GITHUB_TOKEN_METADATA_READ'
        ? 'LIMITED_GITHUB_TOKEN_METADATA_READBACK'
        : (receipt?.authorization_mode === 'TEST_FIXTURE' ? 'SYNTHETIC_TEST_CONTROL' : 'PUBLIC_METADATA_OBSERVATION'));
  require(receipt?.proof_scope === expectedProofScope, 'proof_scope_semantics');
  require(receipt?.repository === 'johnkim9524-collab/kaios_enterprise_repo', 'repository_identity');
  require(receipt?.source_ref === 'refs/heads/main' || receipt?.state === 'BLOCKED', 'verified_source_ref');
  require(/^[0-9a-f]{40}$/.test(String(receipt?.exact_source_sha || '')), 'exact_source_sha');
  require(/^sha256:[0-9a-f]{64}$/.test(String(receipt?.readback_digest || '')), 'readback_digest');
  require(receipt?.readback_digest === computeReadbackDigest(receipt), 'readback_digest_integrity');
  require(receipt?.endpoint_http_statuses && typeof receipt.endpoint_http_statuses === 'object', 'endpoint_statuses');
  require(!hasForbiddenKey(receipt), 'raw_secret_or_credential_field_forbidden');
  require(receipt?.settings_mutated === false, 'settings_mutation_boundary');
  require(receipt?.secret_material_read === false, 'secret_material_boundary');
  require(receipt?.secret_names_emitted === false, 'secret_name_output_boundary');
  const expectedCredentialActivation = receipt?.authorization_mode === 'GITHUB_APP_ENVIRONMENTS_AND_SECRETS_READ'
    ? 'EPHEMERAL_GITHUB_APP_INSTALLATION_TOKEN_ENVIRONMENTS_AND_SECRETS_READ'
    : (receipt?.authorization_mode === 'GITHUB_TOKEN_METADATA_READ' ? 'EPHEMERAL_GITHUB_TOKEN_METADATA_READ' : 'NONE');
  require(receipt?.credential_activation === expectedCredentialActivation, 'credential_activation_semantics');
  require(receipt?.stored_repository_or_environment_secret_activated === false, 'stored_secret_activation_boundary');
  require(receipt?.provider_credential_activated === false, 'provider_credential_activation_boundary');
  require(receipt?.issue_974_closed_by_this_readback === false, 'issue_974_auto_closure_forbidden');
  require(receipt?.issue_974_closure_eligible === false, 'issue_974_closure_eligibility_forbidden_until_attestor');
  require(receipt?.issue_881_control_pass_promoted === false, 'issue_881_promotion_forbidden');
  require(receipt?.effective_ruleset_readback_issue_936_closed === false, 'issue_936_closure_forbidden');
  require(receipt?.empirical_evidence_promoted === false, 'empirical_promotion_forbidden');
  require(receipt?.external_partner_ingestion_authorized === false, 'partner_ingestion_boundary');
  require(receipt?.production === 'HOLD' && receipt?.public === 'HOLD', 'release_boundary');
  require(receipt?.g5 === 'EXPLICIT_APPROVAL_REQUIRED', 'g5_boundary');
  require(receipt?.registered_privileged_manual_lanes === 15, 'registered_lane_count');
  require(Array.isArray(receipt?.binding_results) && receipt.binding_results.length === receipt?.secret_bearing_jobs, 'binding_partition');
  require(receipt?.verified_secret_bearing_jobs === receipt?.binding_results?.filter((item) => item.state === 'VERIFIED_PASS').length, 'verified_binding_count');
  require(receipt?.binding_results?.every((item) => (
    typeof item?.repository_main_guard_present === 'boolean'
    && typeof item?.registry_environment_binding_declared === 'boolean'
    && (item?.registry_environment_name === null || typeof item?.registry_environment_name === 'string')
    && (item?.registry_required_secret_name_digest === null || /^sha256:[0-9a-f]{64}$/.test(String(item?.registry_required_secret_name_digest)))
  )), 'registry_binding_receipt_shape');
  require(receipt?.ruleset_context_only === true, 'ruleset_context_boundary');
  const negativeControls = receipt?.negative_execution_proof;
  require(negativeControls && typeof negativeControls === 'object', 'negative_execution_proof_partition');
  for (const control of ['selected_non_main_ref', 'branch_controlled_workflow_replacement']) {
    const observed = negativeControls?.[control];
    require(['VERIFIED_REJECTED', 'NOT_PROVEN'].includes(observed?.state), `negative_execution_state_${control}`);
    if (observed?.state === 'VERIFIED_REJECTED') {
      require(/^https:\/\/github\.com\/johnkim9524-collab\/kaios_enterprise_repo\/actions\/runs\/[1-9][0-9]*$/.test(String(observed?.evidence_ref || '')), `negative_execution_evidence_${control}`);
      require(/^refs\/heads\//.test(String(observed?.source_ref || '')) && observed.source_ref !== 'refs/heads/main', `negative_execution_ref_${control}`);
      require(!Number.isNaN(Date.parse(String(observed?.observed_at || ''))), `negative_execution_observed_at_${control}`);
    }
  }
  require(receipt?.trusted_execution_attestation?.state === 'NOT_IMPLEMENTED', 'trusted_execution_attestation_state');
  require(receipt?.trusted_execution_attestation?.provenance_type === 'NONE', 'trusted_execution_attestation_provenance');
  require(receipt?.trusted_execution_attestation?.subject_digest === null, 'trusted_execution_attestation_subject');
  require(receipt?.trusted_execution_attestation?.workflow_run_id === null, 'trusted_execution_attestation_run');
  require(receipt?.trusted_execution_attestation?.verified_by === null, 'trusted_execution_attestation_verifier');
  require(receipt?.external_proof_state === 'BLOCKED', 'external_proof_state');
  require(
    Array.isArray(receipt?.external_proof_blockers)
      && receipt.external_proof_blockers.includes('TRUSTED_POST_RUN_ATTESTOR_NOT_IMPLEMENTED')
      && receipt.external_proof_blockers.includes('CRYPTOGRAPHIC_ARTIFACT_PROVENANCE_NOT_VERIFIED'),
    'external_proof_blockers'
  );
  if (receipt?.state === 'BLOCKED') {
    require(receipt?.issue_974_closure_eligible === false, 'blocked_not_closure_eligible');
    require(Array.isArray(receipt?.blockers) && receipt.blockers.length > 0, 'blocked_requires_blocker');
  }
  if (receipt?.state === 'VERIFIED_PASS') {
    require(receipt?.binding_results?.every((item) => item.state === 'VERIFIED_PASS'), 'verified_all_bindings');
    require(Array.isArray(receipt?.blockers) && receipt.blockers.length === 0, 'verified_has_no_blockers');
    require(Object.values(negativeControls || {}).every((item) => item?.state === 'VERIFIED_REJECTED'), 'verified_negative_execution_proof');
    const expectedControlTruth = receipt?.authorization_mode === 'TEST_FIXTURE'
      ? 'SYNTHETIC_POSITIVE_CONTROL_ONLY_NOT_EXTERNAL_PROOF'
      : 'CONTROL_PLANE_READBACK_COMPLETE_EXTERNAL_TRUSTED_EXECUTION_NOT_PROVEN';
    require(receipt?.control_truth === expectedControlTruth, 'verified_control_truth');
  }
  if (requireExternalProof) {
    require(false, 'external_proof_validator_fail_closed_until_trusted_attestor');
    require(receipt?.state === 'VERIFIED_PASS', 'external_proof_required');
    require(receipt?.authorization_mode === 'GITHUB_APP_ENVIRONMENTS_AND_SECRETS_READ', 'external_proof_authorization_mode');
    require(receipt?.proof_scope === 'AUTHORIZED_ENVIRONMENT_AND_SECRET_SCOPE_METADATA_READBACK', 'external_proof_scope');
    require(receipt?.source_ref === 'refs/heads/main', 'external_proof_exact_main_ref');
    require(receipt?.exact_source_sha === receipt?.observed_default_branch_sha, 'external_proof_exact_main_sha');
    require(receipt?.observed_default_branch === 'main' && receipt?.observed_default_branch_protected === true, 'external_proof_protected_main');
    require(receipt?.external_proof_state === 'VERIFIED_PASS', 'external_proof_attested_state');
    require(receipt?.trusted_execution_attestation?.state === 'VERIFIED_PASS', 'external_proof_trusted_execution_attestation');
    for (const endpointName of ['repository', 'default_branch', 'environments', 'rulesets', 'repository_secrets', 'organization_secrets']) {
      const endpoint = receipt?.endpoint_http_statuses?.[endpointName];
      require(
        endpoint?.readable === true
          && endpoint?.http_status === 200
          && (!['environments', 'rulesets', 'repository_secrets', 'organization_secrets'].includes(endpointName) || endpoint?.complete === true),
        `external_proof_endpoint_${endpointName}`
      );
    }
    require(receipt?.binding_results?.every((item) => (
      item?.state === 'VERIFIED_PASS'
      && Array.isArray(item?.blockers) && item.blockers.length === 0
      && item?.required_secret_count > 0
      && /^sha256:[0-9a-f]{64}$/.test(String(item?.required_secret_name_digest || ''))
      && item?.dynamic_secret_context === false
      && item?.inherited_reusable_secrets === false
      && item?.repository_main_guard_present === true
      && item?.registry_environment_binding_declared === true
      && item?.registry_environment_name === item?.environment_name
      && item?.registry_required_secret_name_digest === item?.required_secret_name_digest
      && item?.environment_declared === true
      && item?.environment_binding_static === true
      && typeof item?.environment_name === 'string' && item.environment_name.length > 0
      && item?.environment_observed === true
      && item?.exact_main_deployment_policy_verified === true
      && item?.environment_secret_metadata_readable === true
      && item?.environment_secret_metadata_complete === true
      && item?.matched_required_secret_count === item?.required_secret_count
      && item?.environment_secret_name_coverage_complete === true
      && item?.repository_secret_metadata_readable === true
      && item?.repository_secret_metadata_complete === true
      && item?.organization_secret_metadata_readable === true
      && item?.organization_secret_metadata_complete === true
      && item?.repository_scoped_required_secret_count === 0
      && item?.organization_scoped_required_secret_count === 0
      && item?.credential_environment_exclusive === true
    )), 'external_proof_binding_semantics');
    const summaries = new Map((receipt?.environment_summary || []).map((item) => [item?.name, item]));
    require(receipt?.binding_results?.every((item) => {
      const summary = summaries.get(item?.environment_name);
      return summary?.can_admins_bypass === false
        && summary?.exact_main_only === true
        && summary?.deployment_branch_policy_readback?.readable === true
        && summary?.deployment_branch_policy_readback?.http_status === 200
        && summary?.deployment_branch_policy_readback?.complete === true
        && summary?.environment_secret_metadata_readback?.readable === true
        && summary?.environment_secret_metadata_readback?.http_status === 200
        && summary?.environment_secret_metadata_readback?.complete === true;
    }), 'external_proof_environment_summary');
    require(
      receipt?.credential_scope_summary?.repository_secret_metadata_readback?.readable === true
      && receipt?.credential_scope_summary?.repository_secret_metadata_readback?.http_status === 200
      && receipt?.credential_scope_summary?.repository_secret_metadata_readback?.complete === true
      && receipt?.credential_scope_summary?.organization_secret_metadata_readback?.readable === true
      && receipt?.credential_scope_summary?.organization_secret_metadata_readback?.http_status === 200
      && receipt?.credential_scope_summary?.organization_secret_metadata_readback?.complete === true
      && /^sha256:[0-9a-f]{64}$/.test(String(receipt?.credential_scope_summary?.repository_secret_name_digest || ''))
      && /^sha256:[0-9a-f]{64}$/.test(String(receipt?.credential_scope_summary?.organization_secret_name_digest || ''))
      && receipt?.credential_scope_summary?.secret_names_emitted === false,
      'external_proof_credential_scope_summary'
    );
  }
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
  require((source.match(/node-version:\s*['"]24\.19\.0['"]/g) || []).length === 2, 'node_24_19_0');
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
  assert(contract.version === '1.3.0', 'CONTRACT_VERSION');
  assert(contract.issue === 974 && contract.parent_gate_issue === 881, 'CONTRACT_ISSUE_BINDING');
  assert(contract.status === 'IMPLEMENTED_READ_ONLY_PROOF_PATH_EXTERNAL_POLICY_NOT_VERIFIED', 'CONTRACT_STATUS');
  assert(JSON.stringify(contract.platform_principles) === JSON.stringify(['AUTONOMOUS', 'GLOBAL', 'IRREPLACEABLE_VALUE', 'TRANSPARENT']), 'PRINCIPLE_ORDER');
  assert(contract.approved_closure_patterns.github_environment.deployment_branch_policy_is_exact_main_only === true, 'EXACT_MAIN_POLICY');
  assert(contract.approved_closure_patterns.github_environment.each_secret_bearing_job_matches_registry_environment_and_secret_digest === true, 'REGISTRY_ENVIRONMENT_SECRET_BINDING');
  assert(contract.approved_closure_patterns.github_environment.each_secret_bearing_job_has_repository_exact_main_guard === true, 'REPOSITORY_EXACT_MAIN_GUARD');
  assert(contract.approved_closure_patterns.github_environment.environment_administrator_bypass_is_disabled === true, 'ADMIN_BYPASS_DISABLED');
  assert(contract.approved_closure_patterns.github_environment.required_secret_names_are_absent_from_repository_and_organization_scopes === true, 'ENVIRONMENT_EXCLUSIVE_SECRET_SCOPE');
  assert(contract.approved_closure_patterns.github_environment.all_list_endpoints_are_exhaustively_paginated_and_count_reconciled === true, 'COMPLETE_LIST_READBACK');
  assert(contract.approved_closure_patterns.trusted_default_branch_or_release_handoff.repository_declaration_alone_is_sufficient === false, 'REPOSITORY_DECLARATION_NOT_PROOF');
  assert(contract.approved_closure_patterns.trusted_default_branch_or_release_handoff.implemented_by_this_contract === false, 'HANDOFF_NOT_IMPLEMENTED');
  assert(contract.receipt_requirements.credential_activation_by_authorization_mode.GITHUB_TOKEN_METADATA_READ === 'EPHEMERAL_GITHUB_TOKEN_METADATA_READ', 'EPHEMERAL_TOKEN_SEMANTICS');
  assert(contract.receipt_requirements.external_proof_authorization_mode === 'GITHUB_APP_ENVIRONMENTS_AND_SECRETS_READ', 'EXTERNAL_PROOF_AUTHORIZATION_MODE');
  assert(contract.receipt_requirements.registry_environment_name_and_secret_digest_binding_results === true, 'REGISTRY_BINDING_RECEIPT_REQUIRED');
  assert(contract.receipt_requirements.repository_exact_main_guard_results === true, 'REPOSITORY_MAIN_GUARD_RECEIPT_REQUIRED');
  assert(contract.receipt_requirements.trusted_post_run_attestor_required_for_external_proof === true, 'TRUSTED_ATTESTOR_REQUIRED');
  assert(contract.receipt_requirements.external_proof_validator_fail_closed_until_attestor_is_implemented === true, 'EXTERNAL_VALIDATOR_FAIL_CLOSED');
  assert(contract.receipt_requirements.credential_activation_by_authorization_mode.GITHUB_APP_ENVIRONMENTS_AND_SECRETS_READ === 'EPHEMERAL_GITHUB_APP_INSTALLATION_TOKEN_ENVIRONMENTS_AND_SECRETS_READ', 'GITHUB_APP_TOKEN_SEMANTICS');
  assert(contract.receipt_requirements.stored_repository_or_environment_secret_activated === false, 'STORED_SECRET_ACTIVATION_BOUNDARY');
  assert(contract.receipt_requirements.provider_credential_activated === false, 'PROVIDER_CREDENTIAL_ACTIVATION_BOUNDARY');
  assert(contract.truth_boundary.issue_974_closed_by_repository_implementation === false, 'ISSUE_974_BOUNDARY');
  assert(contract.truth_boundary.issue_881_control_pass_promoted === false, 'ISSUE_881_BOUNDARY');
  assert(contract.truth_boundary.empirical_evidence_promoted === false, 'EMPIRICAL_BOUNDARY');
  assert(contract.truth_boundary.production === 'HOLD' && contract.truth_boundary.public === 'HOLD', 'RELEASE_HOLD');
  assert(contract.truth_boundary.g5 === 'EXPLICIT_APPROVAL_REQUIRED', 'G5_HOLD');
  assert(contract.truth_boundary.issue_974_closure_eligible_before_trusted_attestor === false, 'ISSUE_974_NOT_ELIGIBLE_BEFORE_ATTESTOR');
  assert(registry.issue === 974 && registry.status === 'EXTERNAL_APPROVAL_REQUIRED', 'REGISTRY_REMAINS_OPEN');
  assert(registry.inventory_evidence?.evidence_semantics === 'HISTORICAL_REGISTRATION_BASELINE_NOT_LIVE_EXTERNAL_POLICY_READBACK', 'REGISTRY_BASELINE_TIME_SEMANTICS');
  assert(registry.internal_readback_control?.contract === CONTRACT_PATH, 'REGISTRY_READBACK_CONTRACT_POINTER');
  assert(registry.internal_readback_control?.workflow === WORKFLOW_PATH, 'REGISTRY_READBACK_WORKFLOW_POINTER');
  assert(registry.internal_readback_control?.state === contract.status, 'REGISTRY_READBACK_STATE');
  assert(registry.internal_readback_control?.settings_mutated === false && registry.internal_readback_control?.secret_material_read === false, 'REGISTRY_READBACK_SAFETY_BOUNDARY');
  assert(registry.internal_readback_control?.issue_974_closed === false && registry.internal_readback_control?.issue_881_control_pass_promoted === false, 'REGISTRY_SEMANTIC_BOUNDARY');
  assert(inventory.registered_lane_count === registry.registered_count && registry.registered_count === 15, 'REGISTRY_LANE_PARTITION');
  assert(inventory.secret_bearing_job_count === 15, 'SECRET_BEARING_JOB_PARTITION');
  const repositoryBindingFailures = validateRequiredEnvironmentBindings(inventory, registry);
  assert(repositoryBindingFailures.length === 0, `REPOSITORY_ENVIRONMENT_BINDINGS:${repositoryBindingFailures.join(',')}`);
  const repositoryGuardedLanes = inventory.lanes
    .filter((lane) => lane.secret_bearing_jobs.some((job) => job.explicit_main_ref_guard))
    .map((lane) => lane.workflow)
    .sort();
  assert(JSON.stringify(repositoryGuardedLanes) === JSON.stringify([...registry.registered_workflows].sort()), 'REPOSITORY_MAIN_GUARD_LANES');
  assert(validateWorkflowSource(workflow).length === 0, `WORKFLOW_PROVENANCE:${validateWorkflowSource(workflow).join(',')}`);
  assert(/method:\s*'GET'/.test(collector), 'COLLECTOR_GET_ONLY');
  assert(!/method:\s*['"](?:POST|PUT|PATCH|DELETE)['"]/.test(collector), 'COLLECTOR_MUTATING_METHOD');
  assert(collector.includes("githubGetCompleteList(repository, '/actions/secrets', token"), 'REPOSITORY_SECRET_METADATA_ENDPOINT_REQUIRED');
  assert(collector.includes("githubGetCompleteList(repository, '/actions/organization-secrets', token"), 'ORGANIZATION_SECRET_METADATA_ENDPOINT_REQUIRED');
  assert(collector.includes('/environments/${encoded}/secrets'), 'ENVIRONMENT_SECRET_METADATA_ENDPOINT_REQUIRED');
  assert(collector.includes('secret_names_emitted: false'), 'SECRET_NAMES_OUTPUT_BOUNDARY');
  assert(collector.includes("credentialActivation = authorizationMode === 'GITHUB_APP_ENVIRONMENTS_AND_SECRETS_READ'"), 'CREDENTIAL_ACTIVATION_MAPPING');
  assert(collector.includes("authorizationMode === 'GITHUB_TOKEN_METADATA_READ' ? 'EPHEMERAL_GITHUB_TOKEN_METADATA_READ'"), 'LIMITED_GITHUB_TOKEN_MAPPING');
  assert(collector.includes('githubGetCompleteList'), 'PAGINATED_LIST_READBACK_REQUIRED');
  assert(!collector.includes('KIDULTS_GITHUB_AUTHORIZATION_MODE'), 'AUTHORIZATION_MODE_SELF_ASSERTION_FORBIDDEN');
  assert(collector.includes("stored_repository_or_environment_secret_activated: false"), 'STORED_SECRET_FALSE_RECEIPT');
  assert(collector.includes("provider_credential_activated: false"), 'PROVIDER_CREDENTIAL_FALSE_RECEIPT');
  assert(testSource.includes('selected non-main ref and stale main SHA are independently rejected'), 'NEGATIVE_REF_TEST_MISSING');
  assert(testSource.includes('external-proof mode rejects forged state, fixture scope, stale digest, stale SHA, and non-exclusive credentials'), 'EXTERNAL_PROOF_MUTATION_TEST_MISSING');
  assert(docs.includes('BLOCKED_EXTERNAL_CONTROL_PLANE_NOT_ESTABLISHED'), 'DOC_CURRENT_STATE');
  assert(docs.includes('#881'), 'DOC_PARENT_BOUNDARY');
  assert(docs.includes('EPHEMERAL_GITHUB_TOKEN_METADATA_READ'), 'DOC_EPHEMERAL_TOKEN_SEMANTICS');
  assert(docs.includes('external_proof_validator_fail_closed_until_trusted_attestor'), 'DOC_EXTERNAL_ATTESTOR_FAIL_CLOSED');

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
    ['node_downgrade', workflow.replace("node-version: '24.19.0'", "node-version: '22'")],
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

  const firstLane = inventory.lanes[0];
  const firstJob = firstLane.secret_bearing_jobs[0];
  const bindingMutations = [
    ['environment_removed', (mutatedInventory, mutatedRegistry) => { void mutatedRegistry; mutatedInventory.lanes[0].secret_bearing_jobs[0].environment = { declared: false, name: null, static: false }; }],
    ['environment_renamed', (mutatedInventory, mutatedRegistry) => { void mutatedRegistry; mutatedInventory.lanes[0].secret_bearing_jobs[0].environment.name = 'kidults-unregistered-environment'; }],
    ['main_guard_removed', (mutatedInventory, mutatedRegistry) => { void mutatedRegistry; mutatedInventory.lanes[0].secret_bearing_jobs[0].explicit_main_ref_guard = false; }],
    ['secret_digest_changed', (mutatedInventory, mutatedRegistry) => { void mutatedInventory; mutatedRegistry.required_environment_bindings[0].required_secret_name_digest = `sha256:${'0'.repeat(64)}`; }],
    ['binding_removed', (mutatedInventory, mutatedRegistry) => { void mutatedInventory; mutatedRegistry.required_environment_bindings.shift(); }]
  ];
  assert(Boolean(firstLane && firstJob), 'BINDING_MUTATION_FIXTURE');
  for (const [id, mutate] of bindingMutations) {
    const mutatedInventory = structuredClone(inventory);
    const mutatedRegistry = structuredClone(registry);
    mutate(mutatedInventory, mutatedRegistry);
    assert(validateRequiredEnvironmentBindings(mutatedInventory, mutatedRegistry).length > 0, `REPOSITORY_BINDING_MUTATION_ACCEPTED:${id}`);
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
    repository_main_guard_lanes: repositoryGuardedLanes.length,
    required_environment_count: registry.required_environment_count,
    repository_binding_mutations_rejected: bindingMutations.length,
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
