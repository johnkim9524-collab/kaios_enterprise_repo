import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertObservedSchemaKeyPathsSafe,
  createPsaCertReferenceToken,
  runPsaSchemaProbe,
} from './probe-psa-single-cert-schema-v1.mjs';

const referenceKey = Buffer.alloc(32, 7).toString('base64');
const accessToken = ['synthetic', 'access', 'token'].join('-');
const certA = ['40', '41', '32', '52'].join('');
const certB = ['12', '34', '56', '78'].join('');
const certC = ['87', '65', '43', '21'].join('');
const executeProviderAttempt = async ({ request }) => request();
const contract = {
  provider_id: 'psa-public-api',
  production: 'HOLD',
  publication: 'HOLD',
  max_schema_probe_calls: 3,
  documented_transport: {
    endpoint_template: 'https://api.psacard.com/publicapi/cert/GetByCertNumber/{cert_number}',
  },
};

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    text: async () => typeof body === 'string' ? body : JSON.stringify(body),
  };
}

test('cert reference is a deterministic domain-separated HMAC token', () => {
  const token = createPsaCertReferenceToken(certA, referenceKey);
  assert.match(token, /^hmac-sha256:v1:[a-f0-9]{64}$/);
  assert.equal(token, createPsaCertReferenceToken(certA, referenceKey));
  assert.notEqual(token, createPsaCertReferenceToken(certB, referenceKey));
  assert(!token.includes(certA));
  assert.throws(() => createPsaCertReferenceToken(certA, 'not-a-key'), /PSA_REFERENCE_KEY_INVALID/);
});

test('successful probe records every attempt without cert, API token, or HMAC key', async () => {
  const artifact = await runPsaSchemaProbe({
    contract,
    certNumbers: [certA, certB],
    accessToken,
    certReferenceKey: referenceKey,
    executeProviderAttempt,
    fetchImpl: async () => response(200, { PSACert: { CertNumber: 'present', Grade: 'present' }, Population: 3 }),
    sleep: async () => {},
  });

  assert.equal(artifact.state, 'VERIFIED_PASS');
  assert.equal(artifact.provider_calls, 2);
  assert.equal(artifact.provider_call_budget, 3);
  assert.equal(artifact.provider_call_attempts.length, 2);
  assert.deepEqual(artifact.results.map(result => result.provider_call_attempts), [1, 1]);
  assert(artifact.results.every(result => /^hmac-sha256:v1:[a-f0-9]{64}$/.test(result.cert_reference_token)));
  const serialized = JSON.stringify(artifact);
  for (const sensitive of [certA, certB, accessToken, referenceKey]) assert(!serialized.includes(sensitive));
});

test('one global provider-call budget includes retries and reserves later certs', async () => {
  let calls = 0;
  const artifact = await runPsaSchemaProbe({
    contract,
    certNumbers: [certA, certB],
    accessToken,
    certReferenceKey: referenceKey,
    executeProviderAttempt,
    fetchImpl: async () => {
      calls += 1;
      return calls === 1 ? response(503, { Message: 'retry' }) : response(200, { PSACert: { Grade: 'present' } });
    },
    sleep: async () => {},
  });

  assert.equal(calls, 3);
  assert.equal(artifact.provider_calls, 3);
  assert.equal(artifact.provider_call_attempts.length, 3);
  assert.deepEqual(artifact.results.map(result => result.provider_call_attempts), [2, 1]);
  assert.equal(artifact.state, 'VERIFIED_PASS');
});

test('three requested certs consume exactly one call each even when the first is retryable', async () => {
  let calls = 0;
  const artifact = await runPsaSchemaProbe({
    contract,
    certNumbers: [certA, certB, certC],
    accessToken,
    certReferenceKey: referenceKey,
    executeProviderAttempt,
    fetchImpl: async () => {
      calls += 1;
      return calls === 1 ? response(429, { Message: 'bounded' }) : response(200, { PSACert: { Grade: 'present' } });
    },
    sleep: async () => {},
  });

  assert.equal(calls, 3);
  assert.equal(artifact.provider_calls, 3);
  assert.deepEqual(artifact.results.map(result => result.provider_call_attempts), [1, 1, 1]);
  assert.equal(artifact.state, 'VERIFIED_FAIL');
});

test('duplicate certs and invalid reference keys fail before any provider call', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return response(200, { PSACert: {} });
  };
  await assert.rejects(
    runPsaSchemaProbe({ contract, certNumbers: [certA, certA], accessToken, certReferenceKey: referenceKey, fetchImpl, executeProviderAttempt }),
    /PSA_CERT_NUMBER_DUPLICATE/,
  );
  await assert.rejects(
    runPsaSchemaProbe({ contract, certNumbers: [certA], accessToken, certReferenceKey: 'invalid', fetchImpl, executeProviderAttempt }),
    /PSA_REFERENCE_KEY_INVALID/,
  );
  assert.equal(calls, 0);
});

test('dynamic or raw-like provider keys are rejected and never emitted', async () => {
  const artifact = await runPsaSchemaProbe({
    contract,
    certNumbers: [certA],
    accessToken,
    certReferenceKey: referenceKey,
    executeProviderAttempt,
    fetchImpl: async () => response(200, { PSACert: { [certA]: 'raw-like-key' } }),
  });

  assert.equal(artifact.state, 'VERIFIED_FAIL');
  assert.equal(artifact.policy_violation_count, 1);
  assert.equal(artifact.provider_calls, 1);
  assert.equal(artifact.provider_call_attempts[0].failure_class, 'PSA_PROVIDER_SCHEMA_KEY_DYNAMIC_OR_INVALID');
  assert(!JSON.stringify(artifact).includes(certA));
  assert.throws(
    () => assertObservedSchemaKeyPathsSafe([`PSACert.${certA}`], [certA]),
    /PSA_PROVIDER_SCHEMA_KEY_DYNAMIC_OR_INVALID/,
  );
});

test('quota execution is required and reservation failure prevents fetch', async () => {
  let fetchCalls = 0;
  const base = {
    contract,
    certNumbers: [certA],
    accessToken,
    certReferenceKey: referenceKey,
    fetchImpl: async () => {
      fetchCalls += 1;
      return response(200, { PSACert: {} });
    },
  };

  await assert.rejects(
    runPsaSchemaProbe(base),
    error => error.code === 'PSA_QUOTA_BOUND_PROVIDER_ATTEMPT_REQUIRED',
  );
  await assert.rejects(
    runPsaSchemaProbe({
      ...base,
      executeProviderAttempt: async () => {
        const error = new Error('PSA_QUOTA_DAILY_BUDGET_EXHAUSTED');
        error.code = 'PSA_QUOTA_DAILY_BUDGET_EXHAUSTED';
        throw error;
      },
    }),
    error => error.code === 'PSA_QUOTA_DAILY_BUDGET_EXHAUSTED',
  );
  assert.equal(fetchCalls, 0);
});

test('quota reservation callback completes before each provider fetch', async () => {
  const events = [];
  const artifact = await runPsaSchemaProbe({
    contract,
    certNumbers: [certA, certB],
    accessToken,
    certReferenceKey: referenceKey,
    executeProviderAttempt: async ({ request, certReferenceDigest, attemptOrdinal }) => {
      assert.match(certReferenceDigest, /^hmac-sha256:v1:[a-f0-9]{64}$/);
      events.push(`reserved-${attemptOrdinal}`);
      return request();
    },
    fetchImpl: async () => {
      events.push('fetch');
      return response(200, { PSACert: {} });
    },
  });
  assert.equal(artifact.state, 'VERIFIED_PASS');
  assert.deepEqual(events, ['reserved-1', 'fetch', 'reserved-1', 'fetch']);
});
