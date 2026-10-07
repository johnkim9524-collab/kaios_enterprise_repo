import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  checkPolicyVersionConsistency,
  createStagePolicyAuthorities,
  loadStageEvidence,
} from './a32-production-reality-gate.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const authorities = createStagePolicyAuthorities(ROOT);

test('A15 canonical 1.0.0 is valid', () => {
  const result = checkPolicyVersionConsistency({
    a15: { policyVersion: '1.0.0' },
  }, authorities);

  assert.equal(result.consistent, true);
  assert.deepEqual(result.mismatches, []);
});

test('A29 stage-scoped policy identifier is valid', () => {
  const result = checkPolicyVersionConsistency({
    a29: { policyVersion: 'a29-executive-decision-orchestration-policy.v1' },
  }, authorities);

  assert.equal(result.consistent, true);
  assert.deepEqual(result.mismatches, []);
});

test('unknown policyVersion fails closed', () => {
  const result = checkPolicyVersionConsistency({
    a29: { policyVersion: 'unknown-policy-version' },
  }, authorities);

  assert.equal(result.consistent, false);
  assert.equal(result.mismatches.length, 1);
  assert.equal(result.mismatches[0].stage, 'a29');
  assert.equal(result.mismatches[0].reason, 'POLICY_VERSION_MISMATCH');
});

test('missing critical policyVersion fails closed', () => {
  const result = checkPolicyVersionConsistency({
    a29: {},
  }, authorities);

  assert.equal(result.consistent, false);
  assert.equal(result.mismatches.length, 1);
  assert.equal(result.mismatches[0].stage, 'a29');
  assert.equal(result.mismatches[0].reason, 'MISSING_POLICY_VERSION');
});

test('wrong A15 version fails closed', () => {
  const result = checkPolicyVersionConsistency({
    a15: { policyVersion: '2.0.0' },
  }, authorities);

  assert.equal(result.consistent, false);
  assert.equal(result.mismatches.length, 1);
  assert.equal(result.mismatches[0].stage, 'a15');
  assert.equal(result.mismatches[0].reason, 'POLICY_VERSION_MISMATCH');
});

test('wrong stage-specific version fails closed', () => {
  const result = checkPolicyVersionConsistency({
    a31: { policyVersion: 'a31-gateway-policy.v2' },
  }, authorities);

  assert.equal(result.consistent, false);
  assert.equal(result.mismatches.length, 1);
  assert.equal(result.mismatches[0].stage, 'a31');
  assert.equal(result.mismatches[0].reason, 'POLICY_VERSION_MISMATCH');
});

test('SIMULATION never reads persisted operational evidence', () => {
  const generatedAt = '2026-10-07T00:00:00.000Z';
  const evidence = loadStageEvidence({
    mode: 'SIMULATION',
    reportRoots: { a24: '/persisted/a24' },
    generatedAt,
    readLatest: () => {
      throw new Error('SIMULATION attempted to read persisted evidence');
    },
  });

  assert.deepEqual(evidence, {
    a24: { _fallback: true, stage: 'a24', generatedAt },
  });
});

for (const mode of ['EVIDENCE', 'LIVE_SAFE']) {
  test(`${mode} reads persisted evidence for fail-closed validation`, () => {
    let reads = 0;
    const persisted = {
      policyVersion: 'stale-or-mismatched-policy',
      generatedAt: '2026-01-01T00:00:00.000Z',
    };
    const evidence = loadStageEvidence({
      mode,
      reportRoots: { a24: '/persisted/a24' },
      generatedAt: '2026-10-07T00:00:00.000Z',
      readLatest: (dir) => {
        reads += 1;
        assert.equal(dir, '/persisted/a24');
        return persisted;
      },
    });

    assert.equal(reads, 1);
    assert.equal(evidence.a24, persisted);
  });
}
