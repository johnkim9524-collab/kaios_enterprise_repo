const EXPECTED_POLICY_VERSION = '1.8.0';

const EXACT_GENERATION_POLICY = Object.freeze({
  mode: 'EXACT_CURRENT_PROTECTED_MAIN_EQUALITY',
  active_record_exact_main_equality_required: true,
  issuance_main_must_equal_pr_base_sha: true,
  issuance_main_must_equal_live_main_sha: true,
  survives_main_drift: false,
  ancestor_reuse_allowed: false,
  same_candidate_blob_different_main_allowed: false,
  stale_canonical_comment_allowed: false,
  terminal_records_are_non_authority: true,
  final_lifecycle_boundary_required: true,
  approval_strictly_after_final_lifecycle_boundary: true,
  later_lifecycle_mutation_invalidates_approval: true,
  approval_must_precede_landing_attempt: true,
  single_governed_consumption_required: true,
  pre_ready_approval_allowed: false,
  multiple_current_generation_approvals_allowed: false,
  lifecycle_root_issue: 2028,
  root_issue: 1787,
});

const EXACT_ENFORCEMENT_POINTS = Object.freeze([
  'PR_LIFECYCLE_CLASSIFICATION',
  'GOVERNED_LANDING_READINESS',
  'SCOPE_AWARE_STATUS',
  'ATOMIC_GOVERNED_LANDING',
  'EXTERNAL_CALL_RUNTIME_BEFORE_SECRET_RESOLUTION',
]);

const EXACT_NEGATIVE_CASES = Object.freeze([
  'DESCENDANT_MAIN_DRIFT',
  'MERGE_MAIN_REBOUND',
  'SAME_CANDIDATE_BLOB_DIFFERENT_MAIN',
  'STALE_CANONICAL_COMMENT',
  'APPROVAL_BEFORE_FINAL_READY',
  'APPROVAL_AT_FINAL_READY',
  'LIFECYCLE_MUTATION_AFTER_APPROVAL',
  'APPROVAL_AFTER_LANDING_ATTEMPT_START',
  'MULTIPLE_CURRENT_GENERATION_APPROVALS',
  'APPROVAL_REPLAY',
]);

const EXACT_REVIEW_POLICY = Object.freeze({
  minimum_non_author_approvals: 0,
  self_review_counts: false,
  approval_must_bind_exact_head_sha: true,
  stale_approval_counts: false,
  changes_requested_on_exact_head_blocks: true,
  solo_owner_author_must_match_repository_owner: true,
  same_repository_head_required: true,
  ready_state_by_owner_is_authorization: false,
  optional_external_review_must_bind_exact_head: true,
  independent_exact_head_approval_required: false,
  independent_review_root_issue: 1582,
  human_review_mode: 'OPTIONAL_ADVISORY_EXACT_HEAD_ONLY',
});

const EXACT_AUTONOMOUS_VERIFICATION_POLICY = Object.freeze({
  mode: 'MACHINE_ENFORCED_RISK_ROUTED_MULTI_LANE_EXACT_HEAD',
  required: true,
  risk_routing_required: true,
  scope_aware_status_context: 'KIDULTS Scope-Aware Authoritative Status V1',
  all_required_contexts_terminal_success: true,
  missing_context_fails_closed: true,
  ambiguous_latest_context_fails_closed: true,
  owner_exact_head_approval_separate_required: true,
  human_review_required: false,
  internal_control_evidence_only: true,
  empirical_launch_authority: false,
  root_issue: 1582,
});

const EXACT_AUTONOMOUS_BASELINE_CONTEXTS = Object.freeze([
  'KAIOS Solo Owner Preflight',
  'Validate KAIOS Foundation',
  'Validate Production Container',
]);

const EXACT_AUTONOMOUS_RISK_CONTEXTS = Object.freeze([
  'full-value-chain-redteam',
]);

const EXACT_ATOMIC_REPLAY_POLICY = Object.freeze({
  operation_specific_dispatch_required: true,
  event_emitting_transport_availability_before_consumption: true,
  expected_base_sha_required: true,
  expected_head_sha_required: true,
  expected_head_tree_sha_required: true,
  postmerge_exact_main_tree_and_parent_binding_required: true,
  postmerge_exact_merge_sha_push_suite_required: true,
  terminal_pass_requires_postmerge_success: true,
  failure_revokes_exact_head_status: true,
  immediate_post_status_premerge_reread_required: true,
  external_transport_race_detected_postmerge_fail_closed: true,
});

export class GovernedLandingAuthorizationPolicyFailure extends Error {
  constructor(code) {
    super(code);
    this.name = 'GovernedLandingAuthorizationPolicyFailure';
    this.code = code;
  }
}

function requireExact(condition, code) {
  if (!condition) throw new GovernedLandingAuthorizationPolicyFailure(code);
}

function requireExactArray(actual, expected, code) {
  requireExact(Array.isArray(actual), `${code}_MISSING`);
  requireExact(actual.length === expected.length, `${code}_CARDINALITY_INVALID`);
  for (let index = 0; index < expected.length; index += 1) {
    requireExact(actual[index] === expected[index], `${code}_VALUE_INVALID`);
  }
}

export function assertGovernedLandingAuthorizationPolicyV180(policy) {
  requireExact(policy && typeof policy === 'object' && !Array.isArray(policy), 'POLICY_INVALID');
  requireExact(policy.id === 'kidults-governed-landing-authorization-policy-v1', 'POLICY_ID_INVALID');
  requireExact(policy.version === EXPECTED_POLICY_VERSION, 'POLICY_VERSION_UNSUPPORTED');
  requireExact(policy.status === 'PROGRAM_OWNER_APPROVED_AUTONOMOUS_EXACT_HEAD_VERIFICATION', 'POLICY_STATUS_INVALID');
  requireExact(policy.governance_mode === 'AUTONOMOUS_MULTI_LANE_GOVERNED', 'POLICY_GOVERNANCE_MODE_INVALID');
  requireExact(policy.decision_id === 'JOHN-AUTONOMOUS-MULTI-LANE-REVIEW-2026-09-18', 'POLICY_DECISION_ID_INVALID');
  requireExact(policy.owner === 'KPMO', 'POLICY_OWNER_INVALID');

  const generation = policy.approval_generation_policy;
  requireExact(generation && typeof generation === 'object' && !Array.isArray(generation),
    'APPROVAL_GENERATION_POLICY_MISSING');
  for (const [field, expected] of Object.entries(EXACT_GENERATION_POLICY)) {
    requireExact(Object.hasOwn(generation, field), `APPROVAL_GENERATION_FIELD_MISSING:${field}`);
    requireExact(generation[field] === expected, `APPROVAL_GENERATION_FIELD_INVALID:${field}`);
  }
  requireExactArray(generation.enforcement_points, EXACT_ENFORCEMENT_POINTS,
    'APPROVAL_GENERATION_ENFORCEMENT_POINTS');
  requireExactArray(generation.negative_cases_required, EXACT_NEGATIVE_CASES,
    'APPROVAL_GENERATION_NEGATIVE_CASES');

  const review = policy.review_policy;
  requireExact(review && typeof review === 'object' && !Array.isArray(review),
    'REVIEW_POLICY_MISSING');
  for (const [field, expected] of Object.entries(EXACT_REVIEW_POLICY)) {
    requireExact(Object.hasOwn(review, field), `REVIEW_POLICY_FIELD_MISSING:${field}`);
    requireExact(review[field] === expected, `REVIEW_POLICY_FIELD_INVALID:${field}`);
  }
  requireExactArray(review.eligible_reviewer_types, ['User'], 'REVIEW_ELIGIBLE_REVIEWER_TYPES');
  requireExactArray(review.eligible_author_associations, ['OWNER', 'MEMBER', 'COLLABORATOR'],
    'REVIEW_ELIGIBLE_AUTHOR_ASSOCIATIONS');

  const autonomous = policy.autonomous_verification_policy;
  requireExact(autonomous && typeof autonomous === 'object' && !Array.isArray(autonomous),
    'AUTONOMOUS_VERIFICATION_POLICY_MISSING');
  for (const [field, expected] of Object.entries(EXACT_AUTONOMOUS_VERIFICATION_POLICY)) {
    requireExact(Object.hasOwn(autonomous, field), `AUTONOMOUS_VERIFICATION_FIELD_MISSING:${field}`);
    requireExact(autonomous[field] === expected, `AUTONOMOUS_VERIFICATION_FIELD_INVALID:${field}`);
  }
  requireExactArray(autonomous.baseline_required_check_contexts, EXACT_AUTONOMOUS_BASELINE_CONTEXTS,
    'AUTONOMOUS_VERIFICATION_BASELINE_CONTEXTS');
  requireExactArray(autonomous.risk_routed_check_contexts, EXACT_AUTONOMOUS_RISK_CONTEXTS,
    'AUTONOMOUS_VERIFICATION_RISK_CONTEXTS');

  const atomic = policy.atomic_landing_policy;
  requireExact(atomic && typeof atomic === 'object' && !Array.isArray(atomic),
    'ATOMIC_LANDING_POLICY_MISSING');
  requireExact(atomic.repository_github_token_merge_forbidden === true,
    'ATOMIC_REPOSITORY_TOKEN_MERGE_FORBIDDEN_INVALID');
  requireExact(atomic.event_emitting_transport === 'DIRECT_OWNER_GITHUB_UI',
    'ATOMIC_EVENT_EMITTING_TRANSPORT_INVALID');
  requireExact(atomic.new_secret_or_permission_expansion_forbidden === true,
    'ATOMIC_SECRET_PERMISSION_EXPANSION_FORBIDDEN_INVALID');
  requireExact(atomic.expected_head_compare_is_atomic_for_sha_only === false,
    'ATOMIC_SHA_ONLY_ATOMICITY_CLAIM_INVALID');
  requireExact(atomic.no_merge_label_atomicity_claimed === false,
    'ATOMIC_NO_MERGE_LABEL_ATOMICITY_CLAIM_INVALID');
  for (const [field, expected] of Object.entries(EXACT_ATOMIC_REPLAY_POLICY)) {
    requireExact(Object.hasOwn(atomic, field), `ATOMIC_REPLAY_FIELD_MISSING:${field}`);
    requireExact(atomic[field] === expected, `ATOMIC_REPLAY_FIELD_INVALID:${field}`);
  }

  return {
    policy_version: EXPECTED_POLICY_VERSION,
    generation_mode: generation.mode,
    generation_enforcement_points: [...generation.enforcement_points],
    replay_defense_exact: true,
    autonomous_multi_lane_verification_required: true,
  };
}
