#!/usr/bin/env node
import fs from 'node:fs';

const policyPath = 'coordination/kidults/kpmo/governed-landing-authorization-policy-v1.json';
const workflowPath = '.github/workflows/kidults-governed-landing-authorization-v1.yml';
const preflightPath = '.github/workflows/solo-owner-preflight.yml';

const requiredPrefixes = [
  '.github/',
  'services/kidults-control-plane/',
  'services/kidults-autonomous-intelligence/',
  'scripts/kidults/kpmo/',
  'scripts/kidults/redteam/',
  'scripts/kidults/portal/',
  'scripts/kidults/portal/runtime/',
  'apps/kidults-mobile-portal/',
  'coordination/kidults/portal/',
  'coordination/kidults/kpmo/',
  'coordination/kidults/audit/',
  'coordination/kidults/security/',
  'coordination/kidults/provider/',
  'coordination/kidults/runtime/',
  'infra/',
];

function findingsFor(policy, workflow, preflight) {
  const findings = [];
  const require = (condition, id) => { if (!condition) findings.push(id); };
  const prefixes = new Set(policy.governed_path_prefixes || []);

  require(policy.id === 'kidults-governed-landing-authorization-policy-v1', 'POLICY_ID');
  require(policy.version === '1.3.0', 'POLICY_VERSION');
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
  ]) require(workflow.includes(marker), `WORKFLOW_SOLO_GUARD_MISSING:${marker}`);

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
const findings = findingsFor(policy, workflow, preflight);

const mutations = [
  {
    id: 'PROVIDER_PATH_REVERTS_TO_STALE_PLURAL',
    policy: {...policy, governed_path_prefixes: policy.governed_path_prefixes.map(x => x === 'coordination/kidults/provider/' ? 'coordination/kidults/providers/' : x)},
    workflow,
    preflight,
  },
  {
    id: 'SOLO_APPROVAL_COUNT_GUARD_REMOVED',
    policy,
    workflow: workflow.replace("if((protectPr?.parameters?.required_approving_review_count||0)!==0) fail('Protect main approval count drifted from approved solo-owner zero');", ''),
    preflight,
  },
  {
    id: 'PROGRAM_OWNER_IDENTITY_GUARD_REMOVED',
    policy,
    workflow: workflow.replace("if(pr.user?.login!==repository.owner?.login) fail('governed PR author is not repository Program Owner');", ''),
    preflight,
  },
  {
    id: 'INDEPENDENT_REVIEW_REINTRODUCED',
    policy,
    workflow,
    preflight: preflight.replace('OPTIONAL_NOT_REQUIRED_BY_SOLO_OWNER_RULESET', 'REQUIRED_BY_PROTECT_MAIN_RULESET'),
  },
  {
    id: 'CONTROL_PLANE_PATH_REMOVED',
    policy: {...policy, governed_path_prefixes: policy.governed_path_prefixes.filter(x => x !== 'services/kidults-control-plane/')},
    workflow,
    preflight,
  },
  {
    id: 'MOBILE_PORTAL_SURFACE_PATH_REMOVED',
    policy: {...policy, governed_path_prefixes: policy.governed_path_prefixes.filter(x => x !== 'apps/kidults-mobile-portal/')},
    workflow,
    preflight,
  },
  {
    id: 'ZERO_DIFF_METADATA_GUARD_REMOVED',
    policy,
    workflow: workflow.replace("if (commitCount !== 0 || changedFileCount !== 0) fail(`changed-file API empty but PR metadata is nonzero: commits=${commitCount} changed_files=${changedFileCount}`);", ''),
    preflight,
  },
  {
    id: 'ZERO_DIFF_RECEIPT_REMOVED',
    policy,
    workflow: workflow.replace("state:'ZERO_DIFF_NO_GOVERNED_CHANGE_PASS'", "state:'NOT_GOVERNED_PATH_PASS'"),
    preflight,
  },
];

const mutationResults = mutations.map(mutation => ({
  id: mutation.id,
  rejected: findingsFor(mutation.policy, mutation.workflow, mutation.preflight).length > 0,
}));
for (const result of mutationResults) if (!result.rejected) findings.push(`MUTATION_FALSE_GREEN:${result.id}`);

const receipt = {
  id: 'kidults-governed-landing-coverage-receipt-v1',
  version: '1.3.0',
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
    portal_public_surface: true,
    portal_promotion_controls: true,
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
