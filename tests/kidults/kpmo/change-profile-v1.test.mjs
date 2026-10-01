import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {
  CHANGE_PROFILES,
  assertExactBinding,
  classifyChangeProfile,
  selectProfileRequiredContexts,
  profileRule,
} from '../../../scripts/kidults/kpmo/lib/change-profile-v1.mjs';

const policy = JSON.parse(readFileSync('coordination/kidults/kpmo/scope-aware-required-status-policy-v1.json', 'utf8'));

test('dispatcher workflow plus regression test is WORKFLOW_ONLY', () => {
  const result = classifyChangeProfile([
    '.github/workflows/kidults-autonomous-dispatcher-v1.yml',
    'tests/kidults/staging-operations/autonomous-dispatcher-v1.test.mjs',
  ]);
  assert.equal(result.profile, CHANGE_PROFILES.WORKFLOW_ONLY);
  assert.equal(result.owner_action, 'AUTONOMOUS_INTERNAL_LANDING_ELIGIBLE');
  assert.ok(result.excluded_contexts.includes('Validate Production Container'));
});

test('CloudFormation or IAM changes remain STAGING approval work', () => {
  const result = classifyChangeProfile(['infrastructure/aws/staging/stack.yml']);
  assert.equal(result.profile, CHANGE_PROFILES.STAGING_OPS);
  assert.equal(result.owner_action, 'STAGING_APPROVAL_REQUIRED_PRODUCTION_HOLD');
});

test('production and trust-root paths remain owner-reserved', () => {
  for (const filename of ['production/release.yml', 'secrets/rotation.json', 'CONSTITUTION.md']) {
    assert.equal(classifyChangeProfile([filename]).profile, CHANGE_PROFILES.OWNER_RESERVED);
  }
});

test('profile selection never invents a required context', () => {
  const classification = classifyChangeProfile(['.github/workflows/example.yml']);
  const selected = selectProfileRequiredContexts(classification, [
    'KAIOS Solo Owner Preflight',
    'Validate KAIOS Foundation',
  ]);
  assert.deepEqual(selected.required_contexts, [
    'KAIOS Solo Owner Preflight',
    'Validate KAIOS Foundation',
  ]);
  assert.ok(selected.missing_contexts.includes('KPMO PR Lifecycle Integrity V1'));
  assert.ok(selected.skipped_contexts.includes('Validate Production Container'));
});

test('exact SHA binding is fail-closed', () => {
  const sha = 'a'.repeat(40);
  assert.equal(assertExactBinding({baseSha: sha, headSha: sha, treeSha: sha}), true);
  assert.throws(() => assertExactBinding({baseSha: 'unknown', headSha: sha, treeSha: sha}),
    /CHANGE_PROFILE_BASE_SHA_INVALID/);
});

test('committed scope policy matches executable profile matrix', () => {
  for (const profile of Object.values(CHANGE_PROFILES).filter(value => value !== CHANGE_PROFILES.OWNER_RESERVED)) {
    assert.deepEqual(policy.change_profiles[profile].required_contexts, profileRule(profile).required_contexts);
    assert.deepEqual(policy.change_profiles[profile].excluded_contexts, profileRule(profile).excluded_contexts);
    assert.equal(policy.change_profiles[profile].owner_action, classifyChangeProfile(
      profile === CHANGE_PROFILES.WORKFLOW_ONLY
        ? ['.github/workflows/example.yml']
        : profile === CHANGE_PROFILES.STAGING_OPS
          ? ['infrastructure/aws/staging/stack.yml']
          : profile === CHANGE_PROFILES.CONTROL_PLANE
            ? ['scripts/kidults/kpmo/example.mjs']
            : ['app/example.js'],
    ).owner_action);
  }
});
