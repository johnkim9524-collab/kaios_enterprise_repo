const EXPECTED_POLICY_VERSION = '1.5.0';

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

export function assertGovernedLandingAuthorizationPolicyV150(policy) {
  requireExact(policy && typeof policy === 'object' && !Array.isArray(policy), 'POLICY_INVALID');
  requireExact(policy.id === 'kidults-governed-landing-authorization-policy-v1', 'POLICY_ID_INVALID');
  requireExact(policy.version === EXPECTED_POLICY_VERSION, 'POLICY_VERSION_UNSUPPORTED');
  requireExact(policy.status === 'PROGRAM_OWNER_APPROVED_SOLO_GOVERNANCE', 'POLICY_STATUS_INVALID');
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
  };
}
