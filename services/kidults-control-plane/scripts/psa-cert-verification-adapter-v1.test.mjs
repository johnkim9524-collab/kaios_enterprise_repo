import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPsaSchemaCanaryPlan, executePsaSchemaCanary } from '../src/psa-cert-verification-adapter.mjs';

const certReferenceKey = Buffer.alloc(32, 5).toString('base64');
const syntheticCertA = '4'.repeat(8);
const syntheticCertB = '7'.repeat(8);
const executeProviderAttempt = async ({ request }) => request();
const rights = {
  provider_id: 'psa-public-api',
  scope: 'PRIVATE_TEMPORARY_CERT_VERIFICATION_EVALUATION',
  collect: 'ALLOW', store_private: 'ALLOW', derive_internal_er_calibration: 'ALLOW',
  internal_human_qa: 'ALLOW', public_display: 'BLOCK', redistribute: 'BLOCK',
  retention_days: 30, evidence_ref: 'github:#1251/source-message-immutability-pending',
};

test('PSA plan is bounded to three schema-only calls and contains no cert values', () => {
  const plan = buildPsaSchemaCanaryPlan({
    certNumbers: [syntheticCertA, syntheticCertB], certReferenceKey,
    rightsReceipt: rights, asOf: '2026-08-27T00:00:00Z',
  });
  assert.equal(plan.probe_count, 2);
  assert.equal(plan.raw_payload_persistence, 'PROHIBITED');
  assert.equal(plan.reference_key_id, 'PSA_CERT_REFERENCE_KEY_V1');
  assert(plan.cert_reference_digests.every(value => /^hmac-sha256:v1:[0-9a-f]{64}$/.test(value)));
  assert(!JSON.stringify(plan).includes(syntheticCertA));
  assert.throws(() => buildPsaSchemaCanaryPlan({
    certNumbers: ['1'.repeat(4), '2'.repeat(4), '3'.repeat(4), '4'.repeat(4)],
    certReferenceKey, rightsReceipt: rights,
  }), /ONE_TO_THREE/);
  assert.throws(() => buildPsaSchemaCanaryPlan({
    certNumbers: [syntheticCertA], certReferenceKey: 'invalid', rightsReceipt: rights,
  }), /PSA_REFERENCE_KEY_INVALID/);
});

test('PSA schema canary never returns token, cert values, or raw payload', async () => {
  const token = 'super-secret-token';
  const response = { cert: { number: syntheticCertA, grade: '10' }, population: { total: 3 } };
  const receipt = await executePsaSchemaCanary({
    fetchImpl: async (_url, options) => {
      assert.equal(options.headers.Authorization, `bearer ${token}`);
      return { ok: true, status: 200, text: async () => JSON.stringify(response) };
    }, accessToken: token, certNumbers: [syntheticCertA], certReferenceKey, rightsReceipt: rights,
    executeProviderAttempt,
    now: () => new Date('2026-08-27T00:00:00Z'),
  });
  assert.equal(receipt.state, 'VERIFIED_PASS');
  assert.deepEqual(receipt.attempts[0].schema_keys, ['cert', 'cert.grade', 'cert.number', 'population', 'population.total']);
  assert.equal(receipt.raw_payload_retained, false);
  const serialized = JSON.stringify(receipt);
  assert(!serialized.includes(token));
  assert(!serialized.includes(syntheticCertA));
  assert.match(receipt.attempts[0].cert_reference_digest, /^hmac-sha256:v1:[0-9a-f]{64}$/);
  assert(!serialized.includes('"grade":"10"'));
});

test('PSA failure still emits a bounded non-promotable receipt', async () => {
  const receipt = await executePsaSchemaCanary({
    fetchImpl: async () => ({ ok: false, status: 429, text: async () => '{"message":"slow down"}' }),
    accessToken: 'valid-token', certNumbers: [syntheticCertA], certReferenceKey, rightsReceipt: rights,
    executeProviderAttempt,
    now: () => new Date('2026-08-27T00:00:00Z'),
  });
  assert.equal(receipt.state, 'VERIFIED_FAIL');
  assert.equal(receipt.attempts[0].failure_class, 'RATE_LIMIT');
  assert.equal(receipt.promotion_authority, 'NONE');
  assert.equal(receipt.graded_population_increment, 0);
});

test('PSA retry budget is bounded and preserves one call for each requested cert', async () => {
  let calls = 0;
  const receipt = await executePsaSchemaCanary({
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) return { ok: false, status: 503, headers: { get: () => '0' }, text: async () => '{}' };
      return { ok: true, status: 200, text: async () => '{"cert":{"grade":"10"}}' };
    },
    sleep: async () => {}, accessToken: 'valid-token', certNumbers: [syntheticCertA, syntheticCertB],
    certReferenceKey, rightsReceipt: rights,
    executeProviderAttempt,
    now: () => new Date('2026-08-27T00:00:00Z'),
  });
  assert.equal(calls, 3);
  assert.equal(receipt.provider_calls, 3);
  assert.equal(receipt.provider_call_budget, 3);
  assert.equal(receipt.attempts.length, 2);
  assert.equal(receipt.attempts[0].outcome, 'SCHEMA_OBSERVED');
  assert.equal(receipt.attempts[1].outcome, 'SCHEMA_OBSERVED');
});

test('PSA canary cannot reach fetch without a quota-bound attempt executor', async () => {
  let fetchCalls = 0;
  const input = {
    fetchImpl: async () => {
      fetchCalls += 1;
      return { ok: true, status: 200, text: async () => '{}' };
    },
    accessToken: 'valid-token', certNumbers: [syntheticCertA], certReferenceKey, rightsReceipt: rights,
  };
  await assert.rejects(() => executePsaSchemaCanary(input), /PSA_QUOTA_BOUND_PROVIDER_ATTEMPT_REQUIRED/);
  await assert.rejects(() => executePsaSchemaCanary({
    ...input,
    executeProviderAttempt: async () => {
      const error = new Error('PSA_QUOTA_DAILY_BUDGET_EXHAUSTED');
      error.code = 'PSA_QUOTA_DAILY_BUDGET_EXHAUSTED';
      throw error;
    },
  }), /PSA_QUOTA_DAILY_BUDGET_EXHAUSTED/);
  assert.equal(fetchCalls, 0);
});

test('PSA policy rejects public use and retention beyond thirty days', () => {
  assert.throws(() => buildPsaSchemaCanaryPlan({
    certNumbers: [syntheticCertA], certReferenceKey,
    rightsReceipt: { ...rights, public_display: 'ALLOW' },
  }), /MUST_BE_BLOCKED/);
  assert.throws(() => buildPsaSchemaCanaryPlan({
    certNumbers: [syntheticCertA], certReferenceKey,
    rightsReceipt: { ...rights, retention_days: 31 },
  }), /ONE_TO_THIRTY/);
});
