#!/usr/bin/env node
import fs from 'node:fs';

const paths = {
  policy: 'coordination/kidults/kpmo/governed-landing-authorization-policy-v1.json',
  workflow: '.github/workflows/kidults-governed-landing-authorization-v1.yml',
  preflight: '.github/workflows/solo-owner-preflight.yml',
  atomicWorkflow: '.github/workflows/kidults-atomic-governed-landing-v1.yml',
  aggregateWorkflow: '.github/workflows/kidults-scope-aware-authoritative-status-v1.yml',
  aggregatePolicy: 'coordination/kidults/kpmo/scope-aware-required-status-policy-v1.json',
  atomicRunner: 'scripts/kidults/kpmo/run-atomic-governed-landing-v1.mjs',
  aggregateRunner: 'scripts/kidults/kpmo/run-scope-aware-authoritative-status-v1.mjs',
  lifecycleRunner: 'scripts/kidults/kpmo/validate-pr-lifecycle-integrity-v1.mjs',
  liveRegistryValidator: 'scripts/kidults/kpmo/validate-approval-generation-equality-live-pr-v1.mjs',
  approvalLibrary: 'scripts/kidults/kpmo/lib/approval-generation-equality-v1.mjs',
};

const requiredPrefixes = [
  '.github/',
  'services/kidults-control-plane/',
  'services/kidults-autonomous-intelligence/',
  'scripts/kidults/kpmo/',
  'scripts/kidults/redteam/',
  'scripts/kidults/portal/runtime/',
  'coordination/kidults/kpmo/',
  'coordination/kidults/audit/',
  'coordination/kidults/security/',
  'coordination/kidults/provider/',
  'coordination/kidults/runtime/',
  'infra/',
];

const read = (file) => fs.readFileSync(file, 'utf8');
const clone = (value) => JSON.parse(JSON.stringify(value));
const occurrences = (text, fragment) => text.split(fragment).length - 1;

function loadInputs() {
  return {
    policy: JSON.parse(read(paths.policy)),
    workflow: read(paths.workflow),
    preflight: read(paths.preflight),
    atomicWorkflow: read(paths.atomicWorkflow),
    aggregateWorkflow: read(paths.aggregateWorkflow),
    aggregatePolicy: JSON.parse(read(paths.aggregatePolicy)),
    atomicRunner: read(paths.atomicRunner),
    aggregateRunner: read(paths.aggregateRunner),
    lifecycleRunner: read(paths.lifecycleRunner),
    liveRegistryValidator: read(paths.liveRegistryValidator),
    approvalLibrary: read(paths.approvalLibrary),
  };
}

function findingsFor(input) {
  const findings = [];
  const require = (condition, id) => { if (!condition) findings.push(id); };
  const {
    policy,
    workflow,
    preflight,
    atomicWorkflow,
    aggregateWorkflow,
    aggregatePolicy,
    atomicRunner,
    aggregateRunner,
    lifecycleRunner,
    liveRegistryValidator,
    approvalLibrary,
  } = input;

  const prefixes = new Set(policy.governed_path_prefixes || []);
  require(policy.id === 'kidults-governed-landing-authorization-policy-v1', 'POLICY_ID');
  require(policy.version === '1.5.0', 'POLICY_VERSION');
  require(policy.status === 'PROGRAM_OWNER_APPROVED_SOLO_GOVERNANCE', 'POLICY_STATUS');
  require(policy.governance_mode === 'SOLO_OWNER_GOVERNED', 'GOVERNANCE_MODE');
  require(policy.decision_id === 'JOHN-SOLO-OWNER-APPROVAL-0-2026-08-27', 'DECISION_ID');
  for (const prefix of requiredPrefixes) {
    require(prefixes.has(prefix), `POLICY_PREFIX_MISSING:${prefix}`);
    require(workflow.includes(`'${prefix}'`), `WORKFLOW_PREFIX_MISSING:${prefix}`);
  }
  require(!prefixes.has('coordination/kidults/providers/'), 'STALE_PROVIDER_PREFIX_POLICY');
  require(!workflow.includes("'coordination/kidults/providers/'"), 'STALE_PROVIDER_PREFIX_WORKFLOW');

  const generation = policy.approval_generation_policy || {};
  require(generation.mode === 'EXACT_CURRENT_PROTECTED_MAIN_EQUALITY', 'APPROVAL_GENERATION_MODE');
  require(generation.registry_scope === 'COMPLETE_BOUNDED_CANDIDATE_AND_BASE_GIT_TREES', 'APPROVAL_REGISTRY_SCOPE');
  require(generation.registry_prefix === 'coordination/kidults/governance/', 'APPROVAL_REGISTRY_PREFIX');
  require(generation.active_record_exact_main_equality_required === true, 'APPROVAL_GENERATION_ACTIVE_RECORD');
  require(generation.issuance_main_must_equal_pr_base_sha === true, 'APPROVAL_GENERATION_PR_BASE');
  require(generation.issuance_main_must_equal_live_main_sha === true, 'APPROVAL_GENERATION_LIVE_MAIN');
  require(generation.full_candidate_registry_scan_required === true, 'APPROVAL_FULL_CANDIDATE_SCAN');
  require(generation.full_base_registry_scan_required === true, 'APPROVAL_FULL_BASE_SCAN');
  require(generation.git_tree_truncated_or_unknown === 'FAIL_CLOSED', 'APPROVAL_TREE_TRUNCATION');
  require(generation.changed_file_pagination_incomplete === 'FAIL_CLOSED', 'APPROVAL_DIFF_PAGINATION');
  require(generation.approval_record_delete_or_rename === 'FAIL_CLOSED', 'APPROVAL_DELETE_RENAME');
  require(generation.malformed_or_unreadable_registry_record === 'FAIL_CLOSED', 'APPROVAL_MALFORMED_RECORD');
  require(generation.duplicate_authority_id === 'FAIL_CLOSED', 'APPROVAL_DUPLICATE_ID');
  require(generation.active_committed_authority_may_survive_merge === false, 'APPROVAL_ACTIVE_SURVIVAL');
  require(generation.live_issue_comment_readback_required_for_active_authority === true, 'APPROVAL_LIVE_COMMENT');
  require(generation.runtime_workflow_specific_live_comment_verifier_required === true, 'APPROVAL_RUNTIME_VERIFIER');
  require(generation.generic_helper_or_synthetic_test_is_live_runtime_proof === false, 'APPROVAL_SYNTHETIC_BOUNDARY');
  require(generation.survives_main_drift === false, 'APPROVAL_GENERATION_DRIFT');
  require(generation.ancestor_reuse_allowed === false, 'APPROVAL_GENERATION_ANCESTRY');
  require(generation.same_candidate_blob_different_main_allowed === false, 'APPROVAL_GENERATION_SAME_BLOB');
  require(generation.stale_canonical_comment_allowed === false, 'APPROVAL_GENERATION_STALE_COMMENT');
  require(Array.isArray(generation.root_issues)
    && generation.root_issues.includes(1787)
    && generation.root_issues.includes(1793), 'APPROVAL_GENERATION_ROOT_ISSUES');

  const review = policy.review_policy || {};
  require(review.minimum_non_author_approvals === 0, 'APPROVAL_COUNT_NOT_ZERO');
  require(review.self_review_counts === false, 'SELF_REVIEW_MUST_NOT_COUNT_AS_INDEPENDENT');
  require(review.solo_owner_author_must_match_repository_owner === true, 'OWNER_IDENTITY');
  require(review.same_repository_head_required === true, 'CANONICAL_REPOSITORY');
  require(review.ready_state_by_owner_is_authorization === true, 'OWNER_READY_AUTHORIZATION');
  require(review.changes_requested_on_exact_head_blocks === true, 'CHANGES_REQUESTED_BLOCK');
  require(policy.no_merge_policy?.closed_pull_request_blocks === true, 'CLOSED_PR_BLOCK_MISSING');
  require(policy.no_merge_policy?.merged_pull_request_blocks === true, 'MERGED_PR_BLOCK_MISSING');
  require(policy.no_merge_policy?.exact_labels?.includes('no-merge'), 'NO_MERGE_LABEL_BLOCK_MISSING');
  require(policy.atomic_landing_policy?.ordinary_readiness_may_publish_success === false, 'READINESS_FALSE_SUCCESS_ALLOWED');
  require(policy.atomic_landing_policy?.server_side_merge_must_bind_expected_head_sha === true, 'SERVER_SHA_COMPARE_MISSING');
  require(policy.atomic_landing_policy?.live_dispatch_actor_must_equal_repository_owner === true, 'LIVE_LANDING_ACTOR_GUARD_MISSING');
  require(policy.atomic_landing_policy?.immediate_post_status_premerge_reread_required === true, 'IMMEDIATE_PREMERGE_REREAD_POLICY_MISSING');
  require(policy.atomic_landing_policy?.immediate_full_authority_registry_rescan_required === true, 'IMMEDIATE_REGISTRY_RESCAN_POLICY_MISSING');
  require(policy.atomic_landing_policy?.expected_head_compare_is_atomic_for_sha_only === true
    && policy.atomic_landing_policy?.no_merge_label_atomicity_claimed === false, 'ATOMICITY_CLAIM_BOUNDARY_INVALID');

  for (const marker of [
    "required_approving_review_count||0)!==0",
    'dismiss_stale_reviews_on_push',
    'last-push approval must remain disabled in solo-owner mode',
    'required_review_thread_resolution',
    'require_extra_approval_for_unattributed_changes',
    "pr.user?.login!==repository.owner?.login",
    "pr.head?.repo?.full_name!==repo",
    "readinessReceipt.actor!==repository.owner?.login",
    "state:'AUTHORIZED_SOLO_OWNER_EXACT_HEAD'",
    'required_approval_count:0',
    'ruleset bypass actor detected',
    "pr.state !== 'open' || pr.merged === true",
    "['no-merge','do-not-merge','merge-hold']",
    "types: [opened, synchronize, reopened, ready_for_review, converted_to_draft, edited, labeled, unlabeled, closed]",
    "Ready; operation-specific atomic landing is required",
    'validate-approval-generation-equality-live-pr-v1.mjs',
  ]) require(workflow.includes(marker), `WORKFLOW_SOLO_GUARD_MISSING:${marker}`);
  require(workflow.indexOf('validate-approval-generation-equality-live-pr-v1.mjs')
    < workflow.indexOf('Enforce exact-head solo-owner authorization'), 'WORKFLOW_REGISTRY_SCAN_ORDER');

  for (const marker of [
    'workflow_dispatch:',
    'cancel-in-progress: false',
    'LANDING_AUTHORIZATION_ID',
    'run-atomic-governed-landing-v1.mjs',
    'contents: write',
    'statuses: write',
  ]) require(atomicWorkflow.includes(marker), `ATOMIC_WORKFLOW_MARKER_MISSING:${marker}`);

  for (const [name, source] of [
    ['LIFECYCLE', lifecycleRunner],
    ['SCOPE', aggregateRunner],
    ['ATOMIC', atomicRunner],
    ['LIVE_REGISTRY', liveRegistryValidator],
  ]) {
    require(source.includes('assertCompleteApprovalGenerationRegistry'), `${name}_FULL_REGISTRY_CALL`);
    require(!source.includes('assertChangedApprovalGenerationEquality'), `${name}_CHANGED_ONLY_SCAN_PRESENT`);
    require(source.includes('?recursive=1'), `${name}_RECURSIVE_GIT_TREE_MISSING`);
    require(source.includes('readIssueComment'), `${name}_LIVE_COMMENT_READER_MISSING`);
    require(source.includes('prBaseSha'), `${name}_PR_BASE_BINDING_MISSING`);
    require(source.includes('liveMainSha'), `${name}_LIVE_MAIN_BINDING_MISSING`);
  }

  for (const marker of [
    'assertStableFinalReread(initial, final',
    'assertAtomicLandingMergeable',
    "['clean', 'unstable', 'has_hooks', 'blocked']",
    'assertNativeRequiredContexts',
    'SCOPE_AWARE_AUTHORITATIVE_STATUS_NOT_SUCCESS',
    'assertLandingActorAndAuthorization',
    'ATOMIC_LANDING_BASE_NOT_CURRENT_PROTECTED_MAIN',
    'immediatePreMerge',
    'IMMEDIATE_PREMERGE_SCOPE_STATUS_DRIFT',
    'IMMEDIATE_PREMERGE_LIVE_MAIN_DRIFT',
    'const immediateApprovalRegistry = await scanApprovalRegistry',
    'full_registry_rescanned_immediately_before_merge: true',
    "body: JSON.stringify({sha: expectedHeadSha, merge_method: 'merge'})",
    "await publish('failure'",
  ]) require(atomicRunner.includes(marker), `ATOMIC_RUNNER_MARKER_MISSING:${marker}`);
  require(occurrences(atomicRunner, 'scanApprovalRegistry(') >= 3, 'ATOMIC_REGISTRY_SCAN_CARDINALITY');

  require(aggregatePolicy.id === 'kidults-scope-aware-required-status-policy-v1', 'AGGREGATE_POLICY_ID');
  require(aggregatePolicy.zero_coverage_policy === 'FAIL_CLOSED', 'AGGREGATE_ZERO_COVERAGE_FAIL_CLOSE');
  require(aggregatePolicy.required_status_context === policy.scope_aware_required_status_context, 'AGGREGATE_CONTEXT_MISMATCH');
  for (const context of [policy.required_status_context, policy.scope_aware_required_status_context]) {
    require(policy.bypass_policy?.required_status_contexts?.includes(context), `NATIVE_REQUIRED_CONTEXT_POLICY_MISSING:${context}`);
    require(aggregatePolicy.native_required_status_contexts?.includes(context), `AGGREGATE_NATIVE_CONTEXT_MISSING:${context}`);
  }
  for (const marker of ['pull_request_target:', 'statuses: write', 'run-scope-aware-authoritative-status-v1.mjs', 'closed]']) {
    require(aggregateWorkflow.includes(marker), `AGGREGATE_WORKFLOW_MARKER_MISSING:${marker}`);
  }
  for (const marker of [
    'resolveScopeRequirements',
    'evaluateRequiredCheckRuns',
    'SCOPE_AGGREGATOR_BASE_NOT_CURRENT_PROTECTED_MAIN',
    'APPROVAL_REGISTRY_CHANGED_FILE_PAGINATION_INCOMPLETE',
    "await postStatus('failure'",
    'assertStableFinalReread(initial, final',
  ]) require(aggregateRunner.includes(marker), `AGGREGATE_RUNNER_MARKER_MISSING:${marker}`);

  for (const marker of [
    'APPROVAL_CHANGED_FILE_ONLY_SCAN_FORBIDDEN',
    'APPROVAL_ACTIVE_RECORD_WOULD_SURVIVE_MERGE',
    'APPROVAL_REGISTRY_CANDIDATE_TREE_TRUNCATED_OR_UNKNOWN',
    'APPROVAL_REGISTRY_BASE_TREE_TRUNCATED_OR_UNKNOWN',
    'APPROVAL_REGISTRY_PATH_REMOVED_OR_RENAMED',
    'APPROVAL_REGISTRY_DIFF_REMOVAL_OR_RENAME',
    'APPROVAL_REGISTRY_DUPLICATE_AUTHORITY_ID',
    'APPROVAL_LIVE_COMMENT_BODY_DIGEST_MISMATCH',
    'assertRuntimeApprovalLiveBinding',
  ]) require(approvalLibrary.includes(marker), `APPROVAL_LIBRARY_MARKER_MISSING:${marker}`);

  require(workflow.includes("state:'ZERO_DIFF_NO_GOVERNED_CHANGE_PASS'"), 'ZERO_DIFF_RECEIPT_MISSING');
  require(workflow.includes('commitCount !== 0 || changedFileCount !== 0'), 'ZERO_DIFF_METADATA_FAIL_CLOSED_MISSING');
  require(workflow.includes('promotion_eligible:false'), 'ZERO_DIFF_PROMOTION_HOLD_MISSING');
  require(!workflow.includes("fail('changed-file set is empty or unavailable')"), 'LEGACY_ZERO_DIFF_FALSE_RED_PRESENT');

  require(!preflight.includes('REQUIRED_BY_PROTECT_MAIN_RULESET'), 'STALE_INDEPENDENT_REVIEW_REQUIREMENT');
  require(preflight.includes("independent_human_review: 'OPTIONAL_NOT_REQUIRED_BY_SOLO_OWNER_RULESET'"), 'SOLO_REVIEW_MODE');
  require(preflight.includes('technical_preflight_is_merge_authorization: false'), 'TECHNICAL_AUTHORITY_BOUNDARY');
  require(preflight.includes('exact_head_approval_required: false'), 'EXACT_HEAD_REVIEW_MUST_BE_OPTIONAL');
  require(preflight.includes("merge_authorization: 'PROGRAM_OWNER_READY_AND_MERGE_DECISION_REQUIRED'"), 'PROGRAM_OWNER_AUTHORIZATION');

  return findings;
}

const input = loadInputs();
const findings = findingsFor(input);

const mutations = [
  ['PROVIDER_PATH_REVERTS_TO_STALE_PLURAL', (x) => {
    x.policy.governed_path_prefixes = x.policy.governed_path_prefixes.map((value) => (
      value === 'coordination/kidults/provider/' ? 'coordination/kidults/providers/' : value
    ));
  }],
  ['SOLO_APPROVAL_COUNT_GUARD_REMOVED', (x) => {
    x.workflow = x.workflow.replace("if((protectPr?.parameters?.required_approving_review_count||0)!==0) fail('Protect main approval count drifted from approved solo-owner zero');", '');
  }],
  ['PROGRAM_OWNER_IDENTITY_GUARD_REMOVED', (x) => {
    x.workflow = x.workflow.replace("if(pr.user?.login!==repository.owner?.login) fail('governed PR author is not repository Program Owner');", '');
  }],
  ['INDEPENDENT_REVIEW_REINTRODUCED', (x) => {
    x.preflight = x.preflight.replace('OPTIONAL_NOT_REQUIRED_BY_SOLO_OWNER_RULESET', 'REQUIRED_BY_PROTECT_MAIN_RULESET');
  }],
  ['CONTROL_PLANE_PATH_REMOVED', (x) => {
    x.policy.governed_path_prefixes = x.policy.governed_path_prefixes.filter((value) => value !== 'services/kidults-control-plane/');
  }],
  ['ZERO_DIFF_METADATA_GUARD_REMOVED', (x) => {
    x.workflow = x.workflow.replace("if (commitCount !== 0 || changedFileCount !== 0) fail(`changed-file API empty but PR metadata is nonzero: commits=${commitCount} changed_files=${changedFileCount}`);", '');
  }],
  ['ZERO_DIFF_RECEIPT_REMOVED', (x) => {
    x.workflow = x.workflow.replace("state:'ZERO_DIFF_NO_GOVERNED_CHANGE_PASS'", "state:'NOT_GOVERNED_PATH_PASS'");
  }],
  ['CLOSED_PR_GUARD_REMOVED', (x) => {
    x.workflow = x.workflow.replace("if (pr.state !== 'open' || pr.merged === true) fail('pull request is closed, merged, or NO-MERGE');", '');
  }],
  ['ATOMIC_SELF_STATUS_BLOCKED_STATE_REMOVED', (x) => {
    x.atomicRunner = x.atomicRunner.replace(", 'blocked']", "]");
  }],
  ['SERVER_EXPECTED_SHA_COMPARE_REMOVED', (x) => {
    x.atomicRunner = x.atomicRunner.replace("body: JSON.stringify({sha: expectedHeadSha, merge_method: 'merge'})", "body: JSON.stringify({merge_method: 'merge'})");
  }],
  ['ZERO_COVERAGE_FAIL_CLOSE_REMOVED', (x) => {
    x.aggregatePolicy.zero_coverage_policy = 'ALLOW';
  }],
  ['APPROVAL_ANCESTOR_REUSE_REINTRODUCED', (x) => {
    x.policy.approval_generation_policy.ancestor_reuse_allowed = true;
  }],
  ['APPROVAL_FULL_CANDIDATE_SCAN_DISABLED', (x) => {
    x.policy.approval_generation_policy.full_candidate_registry_scan_required = false;
  }],
  ['APPROVAL_READY_GATE_REMOVED', (x) => {
    x.workflow = x.workflow.replace('validate-approval-generation-equality-live-pr-v1.mjs', 'approval-registry-check-removed.mjs');
  }],
  ['APPROVAL_LIFECYCLE_FULL_SCAN_REMOVED', (x) => {
    x.lifecycleRunner = x.lifecycleRunner.replace('assertCompleteApprovalGenerationRegistry', 'removedFullRegistryScan');
  }],
  ['APPROVAL_SCOPE_FULL_SCAN_REMOVED', (x) => {
    x.aggregateRunner = x.aggregateRunner.replace('assertCompleteApprovalGenerationRegistry', 'removedFullRegistryScan');
  }],
  ['APPROVAL_ATOMIC_FULL_SCAN_REMOVED', (x) => {
    x.atomicRunner = x.atomicRunner.replace('assertCompleteApprovalGenerationRegistry', 'removedFullRegistryScan');
  }],
  ['APPROVAL_IMMEDIATE_RESCAN_REMOVED', (x) => {
    x.atomicRunner = x.atomicRunner.replace('const immediateApprovalRegistry = await scanApprovalRegistry', 'const immediateApprovalRegistry = approvalRegistry; void scanApprovalRegistry');
  }],
  ['APPROVAL_TRUNCATION_GUARD_REMOVED', (x) => {
    x.approvalLibrary = x.approvalLibrary.replace('APPROVAL_REGISTRY_CANDIDATE_TREE_TRUNCATED_OR_UNKNOWN', 'REMOVED_CANDIDATE_TRUNCATION_GUARD');
  }],
  ['APPROVAL_LIVE_COMMENT_DIGEST_REMOVED', (x) => {
    x.approvalLibrary = x.approvalLibrary.replace('APPROVAL_LIVE_COMMENT_BODY_DIGEST_MISMATCH', 'REMOVED_LIVE_COMMENT_DIGEST_GUARD');
  }],
];

const mutationResults = mutations.map(([id, mutate]) => {
  const candidate = clone(input);
  mutate(candidate);
  return {id, rejected: findingsFor(candidate).length > 0};
});
for (const result of mutationResults) {
  if (!result.rejected) findings.push(`MUTATION_FALSE_GREEN:${result.id}`);
}

const receipt = {
  id: 'kidults-governed-landing-coverage-receipt-v1',
  version: '1.5.0',
  state: findings.length ? 'VERIFIED_FAIL' : 'VERIFIED_PASS',
  governance_mode: 'SOLO_OWNER_GOVERNED',
  decision_id: 'JOHN-SOLO-OWNER-APPROVAL-0-2026-08-27',
  governed_prefix_count: requiredPrefixes.length,
  protected_surfaces: {
    workflows: true,
    control_plane: true,
    autonomous_intelligence: true,
    provider_rights: true,
    runtime: true,
    infrastructure: true,
    complete_approval_authority_registry: true,
    live_issue_comment_receipts: true,
  },
  authorization_boundary: {
    required_approvals: 0,
    author_must_be_repository_owner: true,
    canonical_repository_head: true,
    program_owner_ready_state: true,
    exact_head_changes_requested_blocks: true,
    stale_review_rejected: true,
    review_threads_resolved: true,
    last_push_approval: false,
    ruleset_bypass_actor_count: 0,
    zero_diff_non_promotable_pass: true,
    closed_or_no_merge_fails_closed: true,
    final_live_reread: true,
    live_dispatch_actor_is_repository_owner: true,
    immediate_post_status_premerge_reread: true,
    immediate_full_authority_registry_rescan: true,
    server_side_expected_head_compare: true,
    expected_head_compare_atomic_scope: 'SHA_ONLY',
    no_merge_label_atomicity_claimed: false,
    native_required_status_contexts: input.policy.bypass_policy.required_status_contexts,
    zero_coverage_scope_fails_closed: true,
    technical_preflight_is_merge_authorization: false,
    full_candidate_and_base_approval_registry_scanned: true,
    unchanged_active_authority_outside_pr_diff_rejected: true,
    active_committed_authority_survives_merge: false,
    truncated_registry_fails_closed: true,
    live_issue_comment_digest_required: true,
    generic_synthetic_test_is_live_runtime_proof: false,
  },
  mutations: mutationResults,
  findings,
  production: 'HOLD',
  public_release: 'HOLD',
  g5: 'HOLD',
};

console.log(JSON.stringify(receipt, null, 2));
if (findings.length) process.exit(1);
