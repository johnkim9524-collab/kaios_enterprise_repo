#!/usr/bin/env node
import fs from 'node:fs';

const policyPath = 'coordination/kidults/kpmo/governed-landing-authorization-policy-v1.json';
const workflowPath = '.github/workflows/kidults-governed-landing-authorization-v1.yml';
const preflightPath = '.github/workflows/solo-owner-preflight.yml';
const atomicWorkflowPath = '.github/workflows/kidults-atomic-governed-landing-v1.yml';
const aggregateWorkflowPath = '.github/workflows/kidults-scope-aware-authoritative-status-v1.yml';
const aggregatePolicyPath = 'coordination/kidults/kpmo/scope-aware-required-status-policy-v1.json';
const atomicRunnerPath = 'scripts/kidults/kpmo/run-atomic-governed-landing-v1.mjs';
const aggregateRunnerPath = 'scripts/kidults/kpmo/run-scope-aware-authoritative-status-v1.mjs';

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

function findingsFor(policy, workflow, preflight, atomicWorkflow, aggregateWorkflow, aggregatePolicy, atomicRunner, aggregateRunner) {
  const findings = [];
  const require = (condition, id) => { if (!condition) findings.push(id); };
  const prefixes = new Set(policy.governed_path_prefixes || []);

  require(policy.id === 'kidults-governed-landing-authorization-policy-v1', 'POLICY_ID');
  require(policy.version === '1.4.0', 'POLICY_VERSION');
  require(policy.status === 'PROGRAM_OWNER_APPROVED_SOLO_GOVERNANCE', 'POLICY_STATUS');
  require(policy.governance_mode === 'SOLO_OWNER_GOVERNED', 'GOVERNANCE_MODE');
  require(policy.decision_id === 'JOHN-SOLO-OWNER-APPROVAL-0-2026-08-27', 'DECISION_ID');
  for (const prefix of requiredPrefixes) {
    require(prefixes.has(prefix), `POLICY_PREFIX_MISSING:${prefix}`);
    require(workflow.includes(`'${prefix}'`), `WORKFLOW_PREFIX_MISSING:${prefix}`);
  }
  require(!prefixes.has('coordination/kidults/providers/'), 'STALE_PROVIDER_PREFIX_POLICY');
  require(!workflow.includes("'coordination/kidults/providers/'"), 'STALE_PROVIDER_PREFIX_WORKFLOW');

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
  require(policy.atomic_landing_policy?.live_triggering_actor_must_equal_repository_owner === true, 'LIVE_LANDING_TRIGGERING_ACTOR_GUARD_MISSING');
  require(policy.atomic_landing_policy?.workflow_run_attempt_must_equal_one === true
    && policy.atomic_landing_policy?.workflow_rerun_is_forbidden === true, 'LANDING_RERUN_GUARD_MISSING');
  require(policy.atomic_landing_policy?.repository_default_branch_must_equal_main === true, 'DEFAULT_MAIN_GUARD_MISSING');
  require(policy.atomic_landing_policy?.immediate_post_status_premerge_reread_required === true, 'IMMEDIATE_PREMERGE_REREAD_POLICY_MISSING');
  require(policy.atomic_landing_policy?.expected_head_compare_is_atomic_for_sha_only === true && policy.atomic_landing_policy?.no_merge_label_atomicity_claimed === false, 'ATOMICITY_CLAIM_BOUNDARY_INVALID');
  require(policy.atomic_landing_policy?.all_pull_request_landings_globally_serialized === true, 'GLOBAL_LANDING_SERIALIZATION_MISSING');
  require(policy.atomic_landing_policy?.control_sha_must_equal_live_main_at_initial_final_and_immediate_premerge_reads === true, 'CONTROL_MAIN_SHA_BINDING_MISSING');
  require(policy.atomic_landing_policy?.pull_request_base_sha_must_equal_control_sha === true, 'PR_BASE_CONTROL_SHA_BINDING_MISSING');
  require(policy.atomic_landing_policy?.hard_runner_loss_can_leave_orphan_success === true
    && policy.atomic_landing_policy?.orphan_success_lease_or_watchdog_installed === false
    && policy.atomic_landing_policy?.no_merge_authority_state === 'HOLD_RESIDUAL_STATUS_TO_MERGE_WINDOW', 'ORPHAN_SUCCESS_RESIDUAL_MUST_REMAIN_HOLD');

  for (const marker of [
    'assertSoloOwnerProtectPullRequestRule(protectDetail)',
    'assertRepositoryDefaultBranchRuleset(protectDetail, repo)',
    'assertRepositoryDefaultBranch(repository)',
    'assertNativeRequiredStatusBindings(soloDetail',
    "pr.user?.login!==repository.owner?.login",
    "pr.head?.repo?.full_name!==repo",
    "readinessReceipt.actor!==repository.owner?.login",
    "state:'AUTHORIZED_SOLO_OWNER_EXACT_HEAD'",
    'required_approval_count:0',
    "pr.state !== 'open' || pr.merged === true",
    "['no-merge','do-not-merge','merge-hold']",
    "types: [opened, synchronize, reopened, ready_for_review, converted_to_draft, edited, labeled, unlabeled, closed]",
    "Ready; operation-specific atomic landing is required",
  ]) require(workflow.includes(marker), `WORKFLOW_SOLO_GUARD_MISSING:${marker}`);

  for (const marker of [
    'workflow_dispatch:',
    'cancel-in-progress: false',
    'group: kidults-atomic-governed-landing-v1-global',
    'CONTROL_SHA: ${{ github.sha }}',
    'LANDING_TRIGGERING_ACTOR: ${{ github.triggering_actor }}',
    'LANDING_RUN_ATTEMPT: ${{ github.run_attempt }}',
    'LANDING_AUTHORIZATION_ID',
    'run-atomic-governed-landing-v1.mjs',
    'contents: write',
    'statuses: write',
  ]) require(atomicWorkflow.includes(marker), `ATOMIC_WORKFLOW_MARKER_MISSING:${marker}`);
  for (const marker of [
    'assertStableFinalReread(initial, final',
    'assertNativeRequiredStatusBindings',
    'assertSoloOwnerProtectPullRequestRule',
    'assertLiveControlMain(initial)',
    'assertLiveControlMain(final)',
    'assertLiveControlMain(immediatePreMerge)',
    'resolveScopeRequirements(finalFiles',
    'SCOPE_AWARE_AUTHORITATIVE_STATUS_NOT_SUCCESS',
    'assertLandingActorAndAuthorization',
    'assertRepositoryDefaultBranch(repositoryState)',
    'immediatePreMerge',
    'IMMEDIATE_PREMERGE_SCOPE_STATUS_DRIFT',
    "body: JSON.stringify({sha: expectedHeadSha, merge_method: 'merge'})",
    "await publish('failure'",
  ]) require(atomicRunner.includes(marker), `ATOMIC_RUNNER_MARKER_MISSING:${marker}`);
  require(aggregatePolicy.id === 'kidults-scope-aware-required-status-policy-v1', 'AGGREGATE_POLICY_ID');
  require(aggregatePolicy.version === '1.4.0', 'AGGREGATE_POLICY_VERSION');
  require(aggregatePolicy.zero_coverage_policy === 'FAIL_CLOSED', 'AGGREGATE_ZERO_COVERAGE_FAIL_CLOSE');
  require(aggregatePolicy.native_status_binding?.integration_id === 15368, 'AGGREGATE_GITHUB_ACTIONS_INTEGRATION_PIN');
  const specializedRules = (aggregatePolicy.scope_rules || []).filter(rule => (rule.required_contexts || []).length > 0);
  require(specializedRules.length >= 4, 'AGGREGATE_SPECIALIZED_SCOPE_RULES_MISSING');
  for (const context of [
    'KIDULTS Governed Landing Control Validation V1',
    'KIDULTS Cloudflare One-Shot Trust Boundary V1',
    'KIDULTS Cloudflare STAGING Governance Boundary V1',
    'KIDULTS PostgreSQL One-Shot Authorization Boundary V1',
    'KIDULTS Met V&A Candidate R2 Boundary V1',
    'KIDULTS Shared Portal Evidence Integrity V1',
  ]) require(specializedRules.some(rule => rule.required_contexts.includes(context)), `AGGREGATE_SPECIALIZED_CONTEXT_MISSING:${context}`);
  require(aggregatePolicy.required_status_context === policy.scope_aware_required_status_context, 'AGGREGATE_CONTEXT_MISMATCH');
  for (const context of [policy.required_status_context, policy.scope_aware_required_status_context]) {
    require(policy.bypass_policy?.required_status_contexts?.includes(context), `NATIVE_REQUIRED_CONTEXT_POLICY_MISSING:${context}`);
    require(aggregatePolicy.native_required_status_contexts?.includes(context), `AGGREGATE_NATIVE_CONTEXT_MISSING:${context}`);
  }
  for (const marker of ['pull_request_target:', 'statuses: write', 'run-scope-aware-authoritative-status-v1.mjs', 'closed]']) {
    require(aggregateWorkflow.includes(marker), `AGGREGATE_WORKFLOW_MARKER_MISSING:${marker}`);
  }
  for (const marker of ['resolveScopeRequirements', 'evaluateRequiredCheckRuns', "await postStatus('failure'", 'assertStableFinalReread(initial, final']) {
    require(aggregateRunner.includes(marker), `AGGREGATE_RUNNER_MARKER_MISSING:${marker}`);
  }

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

const policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
const workflow = fs.readFileSync(workflowPath, 'utf8');
const preflight = fs.readFileSync(preflightPath, 'utf8');
const atomicWorkflow = fs.readFileSync(atomicWorkflowPath, 'utf8');
const aggregateWorkflow = fs.readFileSync(aggregateWorkflowPath, 'utf8');
const aggregatePolicy = JSON.parse(fs.readFileSync(aggregatePolicyPath, 'utf8'));
const atomicRunner = fs.readFileSync(atomicRunnerPath, 'utf8');
const aggregateRunner = fs.readFileSync(aggregateRunnerPath, 'utf8');
const findings = findingsFor(policy, workflow, preflight, atomicWorkflow, aggregateWorkflow, aggregatePolicy, atomicRunner, aggregateRunner);

const mutations = [
  {
    id: 'PROVIDER_PATH_REVERTS_TO_STALE_PLURAL',
    policy: {...policy, governed_path_prefixes: policy.governed_path_prefixes.map(x => x === 'coordination/kidults/provider/' ? 'coordination/kidults/providers/' : x)},
    workflow,
    preflight,
    atomicWorkflow,
    aggregateWorkflow,
    aggregatePolicy,
    atomicRunner,
    aggregateRunner,
  },
  {
    id: 'SOLO_APPROVAL_COUNT_GUARD_REMOVED',
    policy,
    workflow: workflow.replace('assertSoloOwnerProtectPullRequestRule(protectDetail);', ''),
    preflight,
    atomicWorkflow,
    aggregateWorkflow,
    aggregatePolicy,
    atomicRunner,
    aggregateRunner,
  },
  {
    id: 'PROGRAM_OWNER_IDENTITY_GUARD_REMOVED',
    policy,
    workflow: workflow.replace("if(pr.user?.login!==repository.owner?.login) fail('governed PR author is not repository Program Owner');", ''),
    preflight,
    atomicWorkflow,
    aggregateWorkflow,
    aggregatePolicy,
    atomicRunner,
    aggregateRunner,
  },
  {
    id: 'INDEPENDENT_REVIEW_REINTRODUCED',
    policy,
    workflow,
    preflight: preflight.replace('OPTIONAL_NOT_REQUIRED_BY_SOLO_OWNER_RULESET', 'REQUIRED_BY_PROTECT_MAIN_RULESET'),
    atomicWorkflow,
    aggregateWorkflow,
    aggregatePolicy,
    atomicRunner,
    aggregateRunner,
  },
  {
    id: 'CONTROL_PLANE_PATH_REMOVED',
    policy: {...policy, governed_path_prefixes: policy.governed_path_prefixes.filter(x => x !== 'services/kidults-control-plane/')},
    workflow,
    preflight,
    atomicWorkflow,
    aggregateWorkflow,
    aggregatePolicy,
    atomicRunner,
    aggregateRunner,
  },
  {
    id: 'ZERO_DIFF_METADATA_GUARD_REMOVED',
    policy,
    workflow: workflow.replace("if (commitCount !== 0 || changedFileCount !== 0) fail(`changed-file API empty but PR metadata is nonzero: commits=${commitCount} changed_files=${changedFileCount}`);", ''),
    preflight,
    atomicWorkflow,
    aggregateWorkflow,
    aggregatePolicy,
    atomicRunner,
    aggregateRunner,
  },
  {
    id: 'ZERO_DIFF_RECEIPT_REMOVED',
    policy,
    workflow: workflow.replace("state:'ZERO_DIFF_NO_GOVERNED_CHANGE_PASS'", "state:'NOT_GOVERNED_PATH_PASS'"),
    preflight,
    atomicWorkflow,
    aggregateWorkflow,
    aggregatePolicy,
    atomicRunner,
    aggregateRunner,
  },
  {
    id: 'CLOSED_PR_GUARD_REMOVED',
    policy,
    workflow: workflow.replace("if (pr.state !== 'open' || pr.merged === true) fail('pull request is closed, merged, or NO-MERGE');", ''),
    preflight,
    atomicWorkflow,
    aggregateWorkflow,
    aggregatePolicy,
    atomicRunner,
    aggregateRunner,
  },
  {
    id: 'SERVER_EXPECTED_SHA_COMPARE_REMOVED',
    policy,
    workflow,
    preflight,
    atomicWorkflow,
    aggregateWorkflow,
    aggregatePolicy,
    atomicRunner: atomicRunner.replace("body: JSON.stringify({sha: expectedHeadSha, merge_method: 'merge'})", "body: JSON.stringify({merge_method: 'merge'})"),
    aggregateRunner,
  },
  {
    id: 'DEFAULT_MAIN_GUARD_REMOVED',
    policy,
    workflow: workflow.replace('assertRepositoryDefaultBranch(repository);', ''),
    preflight,
    atomicWorkflow,
    aggregateWorkflow,
    aggregatePolicy,
    atomicRunner,
    aggregateRunner,
  },
  {
    id: 'TRIGGERING_ACTOR_GUARD_REMOVED',
    policy,
    workflow,
    preflight,
    atomicWorkflow: atomicWorkflow.replace('LANDING_TRIGGERING_ACTOR: ${{ github.triggering_actor }}', ''),
    aggregateWorkflow,
    aggregatePolicy,
    atomicRunner,
    aggregateRunner,
  },
  {
    id: 'RUN_ATTEMPT_GUARD_REMOVED',
    policy,
    workflow,
    preflight,
    atomicWorkflow: atomicWorkflow.replace('LANDING_RUN_ATTEMPT: ${{ github.run_attempt }}', ''),
    aggregateWorkflow,
    aggregatePolicy,
    atomicRunner,
    aggregateRunner,
  },
  {
    id: 'ZERO_COVERAGE_FAIL_CLOSE_REMOVED',
    policy,
    workflow,
    preflight,
    atomicWorkflow,
    aggregateWorkflow,
    aggregatePolicy: {...aggregatePolicy, zero_coverage_policy: 'ALLOW'},
    atomicRunner,
    aggregateRunner,
  },
];

const mutationResults = mutations.map(mutation => ({
  id: mutation.id,
  rejected: findingsFor(
    mutation.policy,
    mutation.workflow,
    mutation.preflight,
    mutation.atomicWorkflow,
    mutation.aggregateWorkflow,
    mutation.aggregatePolicy,
    mutation.atomicRunner,
    mutation.aggregateRunner,
  ).length > 0,
}));
for (const result of mutationResults) if (!result.rejected) findings.push(`MUTATION_FALSE_GREEN:${result.id}`);

const receipt = {
  id: 'kidults-governed-landing-coverage-receipt-v1',
  version: '1.4.0',
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
    live_triggering_actor_is_repository_owner: true,
    workflow_rerun_forbidden: true,
    repository_default_branch_is_main: true,
    immediate_post_status_premerge_reread: true,
    server_side_expected_head_compare: true,
    expected_head_compare_atomic_scope: 'SHA_ONLY',
    no_merge_label_atomicity_claimed: false,
    hard_runner_loss_orphan_success_watchdog: false,
    no_merge_authority_state: 'HOLD_RESIDUAL_STATUS_TO_MERGE_WINDOW',
    native_required_status_contexts: policy.bypass_policy.required_status_contexts,
    zero_coverage_scope_fails_closed: true,
    technical_preflight_is_merge_authorization: false,
  },
  mutations: mutationResults,
  findings,
  production: 'HOLD',
  public_release: 'HOLD',
  g5: 'HOLD',
};

console.log(JSON.stringify(receipt, null, 2));
if (findings.length) process.exit(1);
