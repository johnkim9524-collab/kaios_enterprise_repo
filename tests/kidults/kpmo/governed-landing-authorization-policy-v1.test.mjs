import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  GovernedLandingAuthorizationPolicyFailure,
  assertGovernedLandingAuthorizationPolicyV150,
} from '../../../scripts/kidults/kpmo/lib/governed-landing-authorization-policy-v1.mjs';

const policyPath = 'coordination/kidults/kpmo/governed-landing-authorization-policy-v1.json';
const sourcePolicy = JSON.parse(fs.readFileSync(policyPath, 'utf8'));

function clonePolicy() {
  return structuredClone(sourcePolicy);
}

function expectRejected(policy, code) {
  assert.throws(
    () => assertGovernedLandingAuthorizationPolicyV150(policy),
    error => error instanceof GovernedLandingAuthorizationPolicyFailure && error.code === code,
  );
}

test('committed authorization policy is the exact supported 1.5.0 contract', () => {
  const result = assertGovernedLandingAuthorizationPolicyV150(clonePolicy());
  assert.deepEqual(result, {
    policy_version: '1.5.0',
    generation_mode: 'EXACT_CURRENT_PROTECTED_MAIN_EQUALITY',
    generation_enforcement_points: sourcePolicy.approval_generation_policy.enforcement_points,
    replay_defense_exact: true,
  });
});

for (const version of ['1.4.0', '1.6.0', '2.0.0']) {
  test(`unsupported authorization policy version ${version} fails closed`, () => {
    const policy = clonePolicy();
    policy.version = version;
    expectRejected(policy, 'POLICY_VERSION_UNSUPPORTED');
  });
}

for (const field of [
  'mode',
  'active_record_exact_main_equality_required',
  'issuance_main_must_equal_pr_base_sha',
  'issuance_main_must_equal_live_main_sha',
  'survives_main_drift',
  'ancestor_reuse_allowed',
  'same_candidate_blob_different_main_allowed',
  'stale_canonical_comment_allowed',
  'terminal_records_are_non_authority',
  'root_issue',
]) {
  test(`missing approval-generation field ${field} fails closed`, () => {
    const policy = clonePolicy();
    delete policy.approval_generation_policy[field];
    expectRejected(policy, `APPROVAL_GENERATION_FIELD_MISSING:${field}`);
  });

  test(`tampered approval-generation field ${field} fails closed`, () => {
    const policy = clonePolicy();
    const value = policy.approval_generation_policy[field];
    policy.approval_generation_policy[field] = typeof value === 'boolean' ? !value : 'TAMPERED';
    expectRejected(policy, `APPROVAL_GENERATION_FIELD_INVALID:${field}`);
  });
}

test('missing, reordered, and extended generation enforcement points fail closed', () => {
  for (const mutate of [
    values => values.slice(1),
    values => [values[1], values[0], ...values.slice(2)],
    values => [...values, 'UNSUPPORTED_POINT'],
  ]) {
    const policy = clonePolicy();
    policy.approval_generation_policy.enforcement_points = mutate(
      policy.approval_generation_policy.enforcement_points,
    );
    assert.throws(() => assertGovernedLandingAuthorizationPolicyV150(policy),
      GovernedLandingAuthorizationPolicyFailure);
  }
});
test('missing or tampered negative-case contract fails closed', () => {
  for (const mutate of [
    values => values.slice(1),
    values => values.map(value => value === 'STALE_CANONICAL_COMMENT' ? 'ALLOW_STALE_COMMENT' : value),
  ]) {
    const policy = clonePolicy();
    policy.approval_generation_policy.negative_cases_required = mutate(
      policy.approval_generation_policy.negative_cases_required,
    );
    assert.throws(() => assertGovernedLandingAuthorizationPolicyV150(policy),
      GovernedLandingAuthorizationPolicyFailure);
  }
});

for (const field of [
  'operation_specific_dispatch_required',
  'event_emitting_transport_availability_before_consumption',
  'expected_base_sha_required',
  'expected_head_sha_required',
  'expected_head_tree_sha_required',
  'postmerge_exact_main_tree_and_parent_binding_required',
  'postmerge_exact_merge_sha_push_suite_required',
  'terminal_pass_requires_postmerge_success',
  'failure_revokes_exact_head_status',
  'immediate_post_status_premerge_reread_required',
  'external_transport_race_detected_postmerge_fail_closed',
]) {
  test(`missing replay-defense field ${field} fails closed`, () => {
    const policy = clonePolicy();
    delete policy.atomic_landing_policy[field];
    expectRejected(policy, `ATOMIC_REPLAY_FIELD_MISSING:${field}`);
  });

  test(`disabled replay-defense field ${field} fails closed`, () => {
    const policy = clonePolicy();
    policy.atomic_landing_policy[field] = false;
    expectRejected(policy, `ATOMIC_REPLAY_FIELD_INVALID:${field}`);
  });
}

test('transport, secret boundary, and atomicity claims cannot be weakened or generalized', () => {
  for (const [field, value] of [
    ['event_emitting_transport', 'ANY_AVAILABLE_TRANSPORT'],
    ['repository_github_token_merge_forbidden', false],
    ['new_secret_or_permission_expansion_forbidden', false],
    ['expected_head_compare_is_atomic_for_sha_only', true],
    ['no_merge_label_atomicity_claimed', true],
  ]) {
    const policy = clonePolicy();
    policy.atomic_landing_policy[field] = value;
    assert.throws(() => assertGovernedLandingAuthorizationPolicyV150(policy),
      GovernedLandingAuthorizationPolicyFailure);
  }
});


test('architecture contracts are governed and the workflow consumes the policy as the single path source', () => {
  for (const [prefix, examplePath] of [
    ['docs/architecture/', 'docs/architecture/taz-software-architecture-specification-v1.md'],
    ['architecture/', 'architecture/TAZ-000.md'],
    ['src/trust/', 'src/trust/controller.ts'],
    ['tests/trust/', 'tests/trust/controller.test.ts'],
  ]) {
    assert.ok(sourcePolicy.governed_path_prefixes.includes(prefix));
    assert.ok(
      sourcePolicy.governed_path_prefixes.some(candidate => examplePath.startsWith(candidate)),
    );
  }

  const workflow = fs.readFileSync(
    '.github/workflows/kidults-governed-landing-authorization-v1.yml',
    'utf8',
  );
  assert.match(
    workflow,
    /const prefixes = policy\.governed_path_prefixes;/,
  );
  assert.match(
    workflow,
    /const exact = new Set\(policy\.governed_exact_paths\);/,
  );
  assert.doesNotMatch(workflow, /const prefixes = \[/);
});
