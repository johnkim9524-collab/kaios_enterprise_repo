import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPsaSchemaCanaryPlan, executePsaSchemaCanary } from '../src/psa-cert-verification-adapter.mjs';

const rights = {
  provider_id: 'psa-public-api',
  scope: 'PRIVATE_TEMPORARY_CERT_VERIFICATION_EVALUATION',
  collect: 'ALLOW', store_private: 'ALLOW', derive_internal_er_calibration: 'ALLOW',
  internal_human_qa: 'ALLOW', public_display: 'BLOCK', redistribute: 'BLOCK',
  retention_days: 30, evidence_ref: 'github:#1251/source-message-immutability-pending',
};

test('PSA plan is bounded to three schema-only calls and contains no cert values', () => {
  const plan = buildPsaSchemaCanaryPlan({ certNumbers: ['40413252', '12345678'], rightsReceipt: rights, asOf: '2026-08-27T00:00:00Z' });
  assert.equal(plan.probe_count, 2);
  assert.equal(plan.raw_payload_persistence, 'PROHIBITED');
  assert(!JSON.stringify(plan).includes('40413252'));
  assert.throws(() => buildPsaSchemaCanaryPlan({ certNumbers: ['1000', '2000', '3000', '4000'], rightsReceipt: rights }), /ONE_TO_THREE/);
});

test('PSA schema canary never returns token, cert values, or raw payload', async () => {
  const token = 'super-secret-token';
  const response = { cert: { number: '40413252', grade: '10' }, population: { total: 3 } };
  const receipt = await executePsaSchemaCanary({
    fetchImpl: async (_url, options) => {
      assert.equal(options.headers.Authorization, `bearer ${token}`);
      return { ok: true, status: 200, text: async () => JSON.stringify(response) };
    }, accessToken: token, certNumbers: ['40413252'], rightsReceipt: rights,
    now: () => new Date('2026-08-27T00:00:00Z'),
  });
  assert.equal(receipt.state, 'VERIFIED_PASS');
  assert.deepEqual(receipt.attempts[0].schema_keys, ['cert', 'cert.grade', 'cert.number', 'population', 'population.total']);
  assert.equal(receipt.raw_payload_retained, false);
  const serialized = JSON.stringify(receipt);
  assert(!serialized.includes(token));
  assert(!serialized.includes('40413252'));
  assert(!serialized.includes('"grade":"10"'));
});

test('PSA failure still emits a bounded non-promotable receipt', async () => {
  const receipt = await executePsaSchemaCanary({
    fetchImpl: async () => ({ ok: false, status: 429, text: async () => '{"message":"slow down"}' }),
    accessToken: 'valid-token', certNumbers: ['40413252'], rightsReceipt: rights,
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
    sleep: async () => {}, accessToken: 'valid-token', certNumbers: ['40413252', '12345678'], rightsReceipt: rights,
    now: () => new Date('2026-08-27T00:00:00Z'),
  });
  assert.equal(calls, 3);
  assert.equal(receipt.provider_calls, 3);
  assert.equal(receipt.provider_call_budget, 3);
  assert.equal(receipt.attempts.length, 2);
  assert.equal(receipt.attempts[0].outcome, 'SCHEMA_OBSERVED');
  assert.equal(receipt.attempts[1].outcome, 'SCHEMA_OBSERVED');
});

test('PSA policy rejects public use and retention beyond thirty days', () => {
  assert.throws(() => buildPsaSchemaCanaryPlan({ certNumbers: ['40413252'], rightsReceipt: { ...rights, public_display: 'ALLOW' } }), /MUST_BE_BLOCKED/);
  assert.throws(() => buildPsaSchemaCanaryPlan({ certNumbers: ['40413252'], rightsReceipt: { ...rights, retention_days: 31 } }), /ONE_TO_THIRTY/);
});
