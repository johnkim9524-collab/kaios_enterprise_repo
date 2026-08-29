#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  CONTRACT_PATH,
  LIVE_MAIN_GUARD_STEP_NAME,
  REGISTRY_PATH,
  analyzeWorkflow,
  buildWorkflowInventory,
  computeReadbackDigest,
  evaluateNativeRequiredStatusBinding,
  validateRequiredEnvironmentBindings
} from './github-trusted-ref-environment-readback-v1.mjs';

const WORKFLOW_PATH = '.github/workflows/kpmo-github-trusted-ref-environment-readback-v1.yml';
const TEST_PATH = 'tests/kidults/kpmo/github-trusted-ref-environment-readback-v1.test.mjs';
const DOC_PATH = 'docs/kidults/security/github-trusted-ref-environment-readback-v1.md';
const COLLECTOR_PATH = 'scripts/kidults/kpmo/github-trusted-ref-environment-readback-v1.mjs';
const CHECKOUT_SHA = '3d3c42e5aac5ba805825da76410c181273ba90b1';
const SETUP_NODE_SHA = '820762786026740c76f36085b0efc47a31fe5020';
const UPLOAD_ARTIFACT_SHA = 'ea165f8d65b6e75b540449e92b4886f43607fa02';

function expectedRegisteredLaneCountFromRegistry(root = process.cwd()) {
  const registry = JSON.parse(fs.readFileSync(path.join(root, REGISTRY_PATH), 'utf8'));
  if (!Number.isInteger(registry?.registered_count) || registry.registered_count < 1) {
    throw new Error('REGISTERED_SECRET_BEARING_LANE_COUNT_INVALID');
  }
  return registry.registered_count;
}
function expectedReadbackContract(root = process.cwd()) {
  return JSON.parse(fs.readFileSync(path.join(root, CONTRACT_PATH), 'utf8'));
}
const EXPECTED_SOURCE_EXPR = '${{ github.event.pull_request.head.sha || github.sha }}';
const assert = (condition, message) => { if (!condition) throw new Error(message); };

export function validateReceipt(receipt, { requireExternalProof = false, expectedRegisteredLaneCount = expectedRegisteredLaneCountFromRegistry() } = {}) {
  const failures = [];
  const require = (condition, id) => { if (!condition) failures.push(id); };
  const forbiddenKeys = new Set(['authorization', 'password', 'private_key', 'secret', 'secret_names', 'secret_value', 'secrets', 'token']);
  const hasForbiddenKey = (value) => {
    if (Array.isArray(value)) return value.some(hasForbiddenKey);
    if (!value || typeof value !== 'object') return false;
    return Object.entries(value).some(([key, nested]) => forbiddenKeys.has(key.toLowerCase()) || hasForbiddenKey(nested));
  };
  require(receipt?.id === 'kidults-github-trusted-ref-environment-readback-receipt-v1', 'receipt_id');
  require(receipt?.version === '1.5.0', 'receipt_version');
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
  require(receipt?.registered_secret_bearing_lanes === expectedRegisteredLaneCount, 'registered_secret_lane_count');
  require(receipt?.registered_privileged_manual_lanes === expectedRegisteredLaneCount, 'registered_lane_count_legacy_alias');
  require(Array.isArray(receipt?.binding_results) && receipt.binding_results.length === receipt?.secret_bearing_jobs, 'binding_partition');
  require(receipt?.verified_secret_bearing_jobs === receipt?.binding_results?.filter((item) => item.state === 'VERIFIED_PASS').length, 'verified_binding_count');
  require(receipt?.binding_results?.every((item) => (
    typeof item?.repository_main_guard_present === 'boolean'
    && typeof item?.registry_environment_binding_declared === 'boolean'
    && (item?.registry_environment_name === null || typeof item?.registry_environment_name === 'string')
    && (item?.registry_required_secret_name_digest === null || /^sha256:[0-9a-f]{64}$/.test(String(item?.registry_required_secret_name_digest)))
  )), 'registry_binding_receipt_shape');
  require(receipt?.ruleset_context_only === true, 'ruleset_context_boundary');
  const rulesetContext = receipt?.ruleset_context;
  require(Array.isArray(rulesetContext), 'ruleset_context_partition');
  require(rulesetContext?.every((ruleset) => (
    Number.isSafeInteger(ruleset?.ruleset_id) && ruleset.ruleset_id > 0
      && typeof ruleset?.readable === 'boolean'
      && Number.isSafeInteger(ruleset?.http_status)
      && (ruleset.readable === false || (
        typeof ruleset?.name === 'string'
          && typeof ruleset?.target === 'string'
          && typeof ruleset?.enforcement === 'string'
          && (ruleset?.source_type === null || typeof ruleset?.source_type === 'string')
          && (ruleset?.source === null || typeof ruleset?.source === 'string')
          && (ruleset?.ref_name_include === null || (Array.isArray(ruleset.ref_name_include) && ruleset.ref_name_include.every((item) => typeof item === 'string')))
          && (ruleset?.ref_name_exclude === null || (Array.isArray(ruleset.ref_name_exclude) && ruleset.ref_name_exclude.every((item) => typeof item === 'string')))
          && (ruleset?.bypass_actor_count === null || (Number.isSafeInteger(ruleset.bypass_actor_count) && ruleset.bypass_actor_count >= 0))
          && typeof ruleset?.default_branch_targeted === 'boolean'
          && Array.isArray(ruleset?.rule_types) && ruleset.rule_types.every((item) => typeof item === 'string')
          && (ruleset?.strict_required_status_checks_policy === null || typeof ruleset.strict_required_status_checks_policy === 'boolean')
          && (ruleset?.required_status_checks === null || (
            Array.isArray(ruleset.required_status_checks)
              && ruleset.required_status_checks.every((entry) => (
                (entry?.context === null || typeof entry?.context === 'string')
                  && (entry?.integration_id === null || Number.isSafeInteger(entry?.integration_id))
              ))
          ))
      ))
  )), 'ruleset_context_shape');
  const expectedNativeBinding = expectedReadbackContract().native_required_status_binding;
  let recomputedNativeBinding = null;
  try {
    recomputedNativeBinding = evaluateNativeRequiredStatusBinding(rulesetContext, expectedNativeBinding);
  } catch {
    recomputedNativeBinding = null;
  }
  require(
    recomputedNativeBinding !== null
      && JSON.stringify(receipt?.native_required_status_binding) === JSON.stringify(recomputedNativeBinding),
    'native_required_status_binding_integrity'
  );
  require(['BLOCKED', 'VERIFIED_PASS'].includes(receipt?.native_required_status_binding?.state), 'native_required_status_binding_state');
  if (receipt?.native_required_status_binding?.state === 'VERIFIED_PASS') {
    require(receipt.native_required_status_binding.blockers?.length === 0, 'native_required_status_verified_blockers');
  } else {
    require(receipt.native_required_status_binding.blockers?.length > 0, 'native_required_status_blocked_without_blocker');
    require(receipt?.blockers?.includes('NATIVE_REQUIRED_STATUS_BINDING_NOT_VERIFIED'), 'native_required_status_global_blocker');
  }
  const rulesetEndpoint = receipt?.endpoint_http_statuses?.rulesets;
  require(
    typeof rulesetEndpoint?.list_complete === 'boolean'
      && typeof rulesetEndpoint?.detail_complete === 'boolean'
      && Number.isSafeInteger(rulesetEndpoint?.listed_count)
      && Number.isSafeInteger(rulesetEndpoint?.readable_detail_count)
      && rulesetEndpoint.complete === Boolean(rulesetEndpoint.list_complete && rulesetEndpoint.detail_complete),
    'ruleset_endpoint_completeness_shape'
  );
  if (receipt?.state === 'VERIFIED_PASS') {
    require(receipt?.native_required_status_binding?.state === 'VERIFIED_PASS', 'verified_native_required_status_binding');
    require(rulesetEndpoint?.complete === true, 'verified_ruleset_detail_readback');
  }
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
  assert(contract.version === '1.5.0', 'CONTRACT_VERSION');
  assert(contract.scope.secret_bearing_lane_count_is_dynamic_from_registry === true, 'DYNAMIC_SECRET_BEARING_LANE_COUNT');
  assert(contract.scope.privileged_manual_lane_count_is_dynamic_from_registry === true, 'DYNAMIC_LEGACY_MANUAL_LANE_ALIAS');
  assert(contract.scope.legacy_manual_lane_alias_is_registry_lane_count === true, 'LEGACY_ALIAS_REGISTRY_SEMANTICS');
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
  assert(contract.receipt_requirements.ruleset_list_and_each_detail_readback_must_be_complete === true, 'RULESET_DETAIL_READBACK_REQUIRED');
  assert(contract.receipt_requirements.ruleset_source_conditions_bypass_strict_and_status_bindings_are_digest_bound === true, 'RULESET_SEMANTIC_READBACK_REQUIRED');
  assert(contract.receipt_requirements.native_required_status_binding_results === true, 'NATIVE_STATUS_BINDING_RECEIPT_REQUIRED');
  const expectedNativeBinding = contract.native_required_status_binding;
  assert(expectedNativeBinding?.ruleset_name === 'KAIOS Solo Owner Preflight', 'NATIVE_RULESET_NAME');
  assert(expectedNativeBinding?.enforcement === 'active' && expectedNativeBinding?.target === 'branch', 'NATIVE_RULESET_TARGET');
  assert(expectedNativeBinding?.source_type === 'Repository' && expectedNativeBinding?.source === contract.scope.repository, 'NATIVE_RULESET_SOURCE');
  assert(JSON.stringify(expectedNativeBinding?.ref_name_include) === JSON.stringify(['~DEFAULT_BRANCH']), 'NATIVE_RULESET_INCLUDE');
  assert(JSON.stringify(expectedNativeBinding?.ref_name_exclude) === JSON.stringify([]), 'NATIVE_RULESET_EXCLUDE');
  assert(expectedNativeBinding?.bypass_actor_count === 0, 'NATIVE_RULESET_BYPASS_COUNT');
  assert(expectedNativeBinding?.strict_required_status_checks_policy === true, 'NATIVE_RULESET_STRICT');
  assert(JSON.stringify(expectedNativeBinding?.required_status_checks) === JSON.stringify([
    {context: 'KAIOS Solo Owner Preflight', integration_id: 15368},
    {context: 'Validate KAIOS Foundation', integration_id: 15368},
    {context: 'Validate Production Container', integration_id: 15368},
    {context: 'KIDULTS Governed Landing Authorization V1', integration_id: 15368},
    {context: 'KIDULTS Scope-Aware Authoritative Status V1', integration_id: 15368}
  ]), 'NATIVE_RULESET_STATUS_BINDINGS');
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
  assert(registry.control_truth === 'REPOSITORY_ENVIRONMENT_LIVE_MAIN_AND_SECRET_LIFETIME_CONTROLS_IMPLEMENTED_EXTERNAL_POLICY_NOT_VERIFIED', 'REGISTRY_CONTROL_TRUTH');
  assert(registry.repository_privileged_execution_policy?.required_live_main_guard_step_name === LIVE_MAIN_GUARD_STEP_NAME, 'REGISTRY_LIVE_MAIN_GUARD_POLICY');
  assert(registry.repository_privileged_execution_policy?.provider_secret_scope === 'STEP_ONLY_AFTER_LIVE_MAIN_GUARD', 'REGISTRY_PROVIDER_SECRET_SCOPE_POLICY');
  assert(registry.inventory_evidence?.evidence_semantics === 'HISTORICAL_REGISTRATION_BASELINE_NOT_LIVE_EXTERNAL_POLICY_READBACK', 'REGISTRY_BASELINE_TIME_SEMANTICS');
  assert(registry.internal_readback_control?.contract === CONTRACT_PATH, 'REGISTRY_READBACK_CONTRACT_POINTER');
  assert(registry.internal_readback_control?.workflow === WORKFLOW_PATH, 'REGISTRY_READBACK_WORKFLOW_POINTER');
  assert(registry.internal_readback_control?.state === contract.status, 'REGISTRY_READBACK_STATE');
  assert(registry.internal_readback_control?.settings_mutated === false && registry.internal_readback_control?.secret_material_read === false, 'REGISTRY_READBACK_SAFETY_BOUNDARY');
  assert(registry.internal_readback_control?.issue_974_closed === false && registry.internal_readback_control?.issue_881_control_pass_promoted === false, 'REGISTRY_SEMANTIC_BOUNDARY');
  assert(registry.registered_count === registry.registered_workflows.length, 'REGISTRY_REGISTERED_COUNT');
  assert(Number.isInteger(registry.registered_secret_bearing_job_count) && registry.registered_secret_bearing_job_count >= registry.registered_count, 'REGISTRY_SECRET_BEARING_JOB_COUNT');
  assert(registry.required_environment_bindings.length === registry.registered_secret_bearing_job_count, 'REGISTRY_BINDING_COUNT');
  assert(inventory.registered_lane_count === registry.registered_count, 'REGISTRY_LANE_PARTITION');
  assert(inventory.secret_bearing_job_count === registry.required_environment_bindings.length, 'SECRET_BEARING_JOB_PARTITION');
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
  assert(testSource.includes('all registered secret-bearing jobs reject unreadable, stale, and non-main live-main guards'), 'PRIVILEGED_LIVE_MAIN_MUTATION_TEST_MISSING');
  assert(testSource.includes('all registered secret-bearing jobs reject secret scope and guard order mutations'), 'PRIVILEGED_SECRET_LIFETIME_MUTATION_TEST_MISSING');
  assert(testSource.includes('one-shot receipt body and provider-secret ordering fail closed under mutation'), 'ONE_SHOT_RECEIPT_MUTATION_TEST_MISSING');
  assert(testSource.includes('trigger transformation and missing explicit one-shot standing-false guard fail closed'), 'TRIGGER_TRANSFORMATION_MUTATION_TEST_MISSING');
  assert(testSource.includes('one-shot artifact token step rejects stale, ambiguous, truncated, or unsafe handoff mutations'), 'ONE_SHOT_ARTIFACT_MUTATION_TEST_MISSING');
  assert(testSource.includes('ruleset detail readback preserves native binding and fails closed on drift'), 'RULESET_DETAIL_MUTATION_TEST_MISSING');
  assert(testSource.includes('external-proof mode rejects forged state, fixture scope, stale digest, stale SHA, and non-exclusive credentials'), 'EXTERNAL_PROOF_MUTATION_TEST_MISSING');
  assert(docs.includes('BLOCKED_EXTERNAL_CONTROL_PLANE_NOT_ESTABLISHED'), 'DOC_CURRENT_STATE');
  assert(docs.includes('#881'), 'DOC_PARENT_BOUNDARY');
  assert(docs.includes('EPHEMERAL_GITHUB_TOKEN_METADATA_READ'), 'DOC_EPHEMERAL_TOKEN_SEMANTICS');
  assert(docs.includes('external_proof_validator_fail_closed_until_trusted_attestor'), 'DOC_EXTERNAL_ATTESTOR_FAIL_CLOSED');
  assert(docs.includes('## Repository live-main and credential-lifetime controls'), 'DOC_PRIVILEGED_EXECUTION_CONTROL');
  assert(docs.includes('guard and step-scope counts are derived from the registry') && docs.includes('zero workflow-scope bindings') && docs.includes('zero job-scope bindings'), 'DOC_PRIVILEGED_EXECUTION_COUNTS');
  assert(docs.includes('They therefore do not close #974.'), 'DOC_ISSUE_974_BOUNDARY');

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

  const privilegedExecutionMutationCases = [
    ['live_guard_removed', (job) => { job.live_main_guard.count = 0; }],
    ['live_guard_api_unreadable_fail_open', (job) => { job.live_main_guard.contract_valid = false; }],
    ['live_guard_stale_sha_fail_open', (job) => { job.live_main_guard.contract_valid = false; }],
    ['live_guard_non_main_fail_open', (job) => { job.live_main_guard.contract_valid = false; }],
    ['github_token_scope_expanded', (job) => { job.live_main_guard.github_token_step_names.push('Unapproved token step'); }],
    ['github_token_job_permission_override', (job) => {
      if (job.job_permissions_override) job.job_permissions_exact_actions_contents_read = false;
      else job.job_permissions_override = true;
    }],
    ['guard_after_provider_secret', (job) => { job.live_main_guard.before_all_provider_secret_steps = false; }],
    ['workflow_scope_provider_secret', (job) => { job.workflow_scope_secret_names = ['MUTATED_SECRET']; }],
    ['job_scope_provider_secret', (job) => { job.job_scope_secret_names = ['MUTATED_SECRET']; }],
    ['provider_secret_not_step_scoped', (job) => { job.provider_secrets_step_scoped = false; }],
    ['secret_step_name_drift', (job) => { job.step_secret_bindings[0].step = 'Mutated broad secret step'; }]
  ];
  let privilegedExecutionMutationsRejected = 0;
  for (let laneIndex = 0; laneIndex < inventory.lanes.length; laneIndex += 1) {
    for (let jobIndex = 0; jobIndex < inventory.lanes[laneIndex].secret_bearing_jobs.length; jobIndex += 1) {
      for (const [id, mutate] of privilegedExecutionMutationCases) {
        const mutatedInventory = structuredClone(inventory);
        const job = mutatedInventory.lanes[laneIndex].secret_bearing_jobs[jobIndex];
        mutate(job);
        assert(
          validateRequiredEnvironmentBindings(mutatedInventory, registry).length > 0,
          `PRIVILEGED_EXECUTION_MUTATION_ACCEPTED:${inventory.lanes[laneIndex].workflow}#${job.job}:${id}`
        );
        privilegedExecutionMutationsRejected += 1;
      }
    }
  }

  const oneShotBindings = registry.required_environment_bindings.filter((binding) => binding.required_one_shot_authorization);
  const oneShotMutationCases = [
    ['receipt_removed', (job) => { job.one_shot_authorization.receipt_step_count = 0; }],
    ['receipt_before_live_main', (job) => { job.one_shot_authorization.after_live_main_guard = false; }],
    ['receipt_after_provider_secret', (job) => { job.one_shot_authorization.before_all_provider_secret_steps = false; }],
    ['consume_dependency_removed', (job) => { job.one_shot_authorization.needs_jobs = []; }],
    ['authorized_output_guard_removed', (job) => { job.one_shot_authorization.authorized_output_jobs = []; }],
    ['standing_false_guard_removed', (job) => { job.one_shot_authorization.standing_false_variables = []; }],
    ['artifact_readback_contract_removed', (job) => { job.one_shot_authorization.artifact_readback_contract = false; }],
    ['exact_binding_removed', (job) => { job.one_shot_authorization.binds_exact_sha_run_workflow_target_and_receipt = false; }],
  ];
  let oneShotMutationsRejected = 0;
  for (const binding of oneShotBindings) {
    const laneIndex = inventory.lanes.findIndex((lane) => lane.workflow === binding.workflow);
    const jobIndex = inventory.lanes[laneIndex]?.secret_bearing_jobs.findIndex((job) => job.job === binding.job) ?? -1;
    assert(laneIndex >= 0 && jobIndex >= 0, `ONE_SHOT_MUTATION_FIXTURE:${binding.workflow}#${binding.job}`);
    for (const [id, mutate] of oneShotMutationCases) {
      const mutatedInventory = structuredClone(inventory);
      const job = mutatedInventory.lanes[laneIndex].secret_bearing_jobs[jobIndex];
      mutate(job);
      assert(
        validateRequiredEnvironmentBindings(mutatedInventory, registry).length > 0,
        `ONE_SHOT_MUTATION_ACCEPTED:${binding.workflow}#${binding.job}:${id}`
      );
      oneShotMutationsRejected += 1;
    }
  }

  const secretBearingJobs = inventory.lanes.flatMap((lane) => lane.secret_bearing_jobs);

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
    privileged_execution_mutations_rejected: privilegedExecutionMutationsRejected,
    one_shot_authorization_mutations_rejected: oneShotMutationsRejected,
    live_main_sha_guarded_secret_bearing_jobs: secretBearingJobs.filter((job) => (
      job.live_main_guard.count === 1
      && job.live_main_guard.contract_valid
      && job.live_main_guard.before_all_provider_secret_steps
    )).length,
    workflow_scope_provider_secret_jobs: secretBearingJobs.filter((job) => job.workflow_scope_secret_names.length > 0).length,
    job_scope_provider_secret_jobs: secretBearingJobs.filter((job) => job.job_scope_secret_names.length > 0).length,
    step_scoped_provider_secret_jobs: secretBearingJobs.filter((job) => job.provider_secrets_step_scoped).length,
    privileged_secret_steps: secretBearingJobs.reduce((count, job) => count + job.step_secret_bindings.length, 0),
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
