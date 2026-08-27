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
  'scripts/kidults/portal/runtime/',
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
  require(policy.version === '1.1.0', 'POLICY_VERSION');
  for (const prefix of requiredPrefixes) {
    require(prefixes.has(prefix), `POLICY_PREFIX_MISSING:${prefix}`);
    require(workflow.includes(`'${prefix}'`), `WORKFLOW_PREFIX_MISSING:${prefix}`);
  }
  require(!prefixes.has('coordination/kidults/providers/'), 'STALE_PROVIDER_PREFIX_POLICY');
  require(!workflow.includes("'coordination/kidults/providers/'"), 'STALE_PROVIDER_PREFIX_WORKFLOW');

  const review = policy.review_policy || {};
  require(review.minimum_non_author_approvals >= 1, 'MINIMUM_APPROVAL');
  require(review.self_review_counts === false, 'SELF_REVIEW');
  require(review.approval_must_bind_exact_head_sha === true, 'EXACT_HEAD');
  require(review.stale_approval_counts === false, 'STALE_APPROVAL');
  require(review.approval_reason_marker === 'Governance-Reason:', 'REASON_MARKER');

  for (const marker of [
    "required_approving_review_count||0)<1",
    'dismiss_stale_reviews_on_push',
    'require_last_push_approval',
    'required_review_thread_resolution',
    'require_extra_approval_for_unattributed_changes',
    "r.user.login!==pr.user.login",
    "review.commit_id!==pr.head.sha",
    "/Governance-Reason:\\s*\\S/i",
    "ruleset bypass actor detected",
  ]) require(workflow.includes(marker), `WORKFLOW_REVIEW_GUARD_MISSING:${marker}`);

  require(!preflight.includes('WAIVED_FOR_SOLO_POC'), 'SOLO_REVIEW_WAIVER');
  require(preflight.includes("independent_human_review: 'REQUIRED_BY_PROTECT_MAIN_RULESET'"), 'SOLO_REVIEW_REQUIREMENT');
  require(preflight.includes('technical_preflight_is_merge_authorization: false'), 'SOLO_TECHNICAL_AUTHORITY_BOUNDARY');
  require(preflight.includes('exact_head_approval_required: true'), 'SOLO_EXACT_HEAD_APPROVAL');

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
    id: 'INDEPENDENT_APPROVAL_RULESET_CHECK_REMOVED',
    policy,
    workflow: workflow.replace("if((protectPr?.parameters?.required_approving_review_count||0)<1) fail('Protect main independent approval disabled');", ''),
    preflight,
  },
  {
    id: 'SOLO_REVIEW_WAIVER_RESTORED',
    policy,
    workflow,
    preflight: preflight.replace('REQUIRED_BY_PROTECT_MAIN_RULESET', 'WAIVED_FOR_SOLO_POC'),
  },
  {
    id: 'CONTROL_PLANE_PATH_REMOVED',
    policy: {...policy, governed_path_prefixes: policy.governed_path_prefixes.filter(x => x !== 'services/kidults-control-plane/')},
    workflow,
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
  version: '1.0.0',
  state: findings.length ? 'VERIFIED_FAIL' : 'VERIFIED_PASS',
  governed_prefix_count: requiredPrefixes.length,
  protected_surfaces: {
    workflows: true,
    control_plane: true,
    autonomous_intelligence: true,
    provider_rights: true,
    runtime: true,
    infrastructure: true,
  },
  review_boundary: {
    minimum_non_author_approvals: 1,
    exact_head: true,
    stale_review_rejected: true,
    last_push_approval: true,
    review_threads_resolved: true,
    self_review: false,
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
