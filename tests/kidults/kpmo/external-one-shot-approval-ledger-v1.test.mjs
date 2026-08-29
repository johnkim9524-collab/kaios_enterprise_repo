import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';
import {
  BASE_URL_ENV,
  CLIENT_RECEIPT_ID,
  ENDPOINT_PATH,
  REQUEST_ID,
  REQUEST_KEY_ENV,
  REQUEST_SIGNATURE_HEADER,
  RESPONSE_ID,
  RESPONSE_PUBLIC_KEY_ENV,
  RESPONSE_PUBLIC_KEY_SHA256_ENV,
  RESPONSE_SIGNATURE_HEADER,
  VERSION,
  computeTargetDigest,
  consumeApproval,
  validateConsumeRequest,
  verifyClientReceipt,
  verifyLedgerResponse
} from '../../../scripts/governance/external-one-shot-approval-ledger-v1.mjs';

const NOW = Date.parse('2026-08-30T02:00:00.000Z');
const REQUEST_KEY = Buffer.alloc(32, 0x41);
const RESPONSE_KEYS = crypto.generateKeyPairSync('ed25519');
const RESPONSE_PUBLIC_KEY_B64 = RESPONSE_KEYS.publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
const RESPONSE_PUBLIC_KEY_PIN = `sha256:${crypto.createHash('sha256').update(Buffer.from(RESPONSE_PUBLIC_KEY_B64, 'base64')).digest('hex')}`;
const stable = (value) => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
};
const sign = rawBody => `ed25519=${crypto.sign(null, rawBody, RESPONSE_KEYS.privateKey).toString('base64')}`;
const requestSign = rawBody => `hmac-sha256=${crypto.createHmac('sha256', REQUEST_KEY).update(rawBody).digest('hex')}`;
const target = () => {
  const value = {
    provider: 'postgresql',
    resource_type: 'database-cluster',
    resource_id: 'kidults-staging-db',
    environment: 'STAGING'
  };
  return { ...value, target_digest: computeTargetDigest(value) };
};
const request = () => ({
  id: REQUEST_ID,
  version: VERSION,
  approval_id: 'PG-RESTORE-20260830-01',
  operation_id: 'postgres-target-time-restore',
  repository: 'johnkim9524-collab/kaios_enterprise_repo',
  workflow_ref: '.github/workflows/kidults-postgres-target-time-restore-v1.yml@refs/heads/main',
  control_sha: 'a'.repeat(40),
  source_sha: 'b'.repeat(40),
  github_run_id: '33270000001',
  github_run_attempt: 1,
  consume_nonce: '018f0e58-7ee4-4fd1-8a53-629a2feca8a1',
  requested_at: '2026-08-30T02:00:00.000Z',
  request_expires_at: '2026-08-30T02:05:00.000Z',
  approval_expires_at: '2026-08-30T02:10:00.000Z',
  target: target()
});
const ledgerResponse = (consumeRequest = request()) => ({
  ...structuredClone(consumeRequest),
  id: RESPONSE_ID,
  version: VERSION,
  state: 'CONSUMED',
  consumption_id: 'consume-01HV7EXACT',
  consumed_at: '2026-08-30T02:00:01.000Z',
  ledger_transaction_id: 'txn-01HV7DURABLE'
});
const signedResponse = (value = ledgerResponse(), options = {}) => {
  const raw = Buffer.from(options.raw ?? JSON.stringify(value), 'utf8');
  return {
    raw,
    signature: options.signature ?? sign(raw),
    response: new Response(raw, {
      status: options.status ?? 201,
      headers: {
        'content-type': options.contentType ?? 'application/json; charset=utf-8',
        [RESPONSE_SIGNATURE_HEADER]: options.signature ?? sign(raw),
        ...(options.headers ?? {})
      }
    })
  };
};
const expectCode = async (operation, code) => {
  await assert.rejects(operation, (error) => {
    assert.match(error.message, new RegExp(`^${code}(?::|$)`));
    return true;
  });
};

test('machine contract fixes endpoint, key environments, atomic transition and fail-closed boundary', () => {
  const contract = JSON.parse(fs.readFileSync('coordination/kidults/governance/external-one-shot-approval-ledger-v1.json', 'utf8'));
  assert.equal(contract.id, 'external-one-shot-approval-ledger-v1');
  assert.equal(contract.version, VERSION);
  assert.equal(contract.transport.path, ENDPOINT_PATH);
  assert.equal(contract.authentication.base_url_environment, BASE_URL_ENV);
  assert.equal(contract.authentication.request.key_environment, REQUEST_KEY_ENV);
  assert.equal(contract.authentication.response.client_public_key_environment, RESPONSE_PUBLIC_KEY_ENV);
  assert.equal(contract.authentication.response.client_public_key_sha256_environment, RESPONSE_PUBLIC_KEY_SHA256_ENV);
  assert.equal(contract.authentication.response.github_private_signing_key_forbidden, true);
  assert.equal(contract.atomic_transition.transition, 'ACTIVE_TO_CONSUMED_COMPARE_AND_SWAP');
  assert.equal(contract.atomic_transition.commit_before_response, true);
  assert.equal(contract.atomic_transition.reset_or_delete_endpoint, false);
  assert.equal(contract.job_isolation.consume_job_has_provider_credentials, false);
  assert.equal(contract.truth_boundary.repository_contract_or_client_is_durable_store_deployment, false);
  assert.equal(contract.truth_boundary.missing_ledger_configuration, 'NO_PROVIDER_MUTATION');
});

test('target digest is canonical and request validation accepts only exact one-shot bindings', () => {
  const left = { provider: 'postgresql', resource_type: 'database-cluster', resource_id: 'kidults-staging-db', environment: 'STAGING' };
  const right = { environment: 'STAGING', resource_id: 'kidults-staging-db', resource_type: 'database-cluster', provider: 'postgresql' };
  assert.equal(computeTargetDigest(left), computeTargetDigest(right));
  assert.deepEqual(validateConsumeRequest(request(), { now: NOW }), request());

  const extra = request();
  extra.authorized = true;
  assert.throws(() => validateConsumeRequest(extra, { now: NOW }), /^Error: REQUEST_SCHEMA_INVALID/);

  const badDigest = request();
  badDigest.target.target_digest = `sha256:${'0'.repeat(64)}`;
  assert.throws(() => validateConsumeRequest(badDigest, { now: NOW }), /^Error: TARGET_DIGEST_MISMATCH/);

  const retry = request();
  retry.github_run_attempt = 2;
  assert.throws(() => validateConsumeRequest(retry, { now: NOW }), /^Error: GITHUB_RUN_ATTEMPT_INVALID/);

  const expired = request();
  assert.throws(() => validateConsumeRequest(expired, { now: Date.parse('2026-08-30T02:11:00Z') }), /^Error: APPROVAL_OR_REQUEST_EXPIRED/);
});

test('consume signs exact canonical request bytes and emits a re-verifiable receipt without a provider call', async () => {
  const consumeRequest = request();
  const signed = signedResponse();
  let calls = 0;
  const receipt = await consumeApproval({
    request: consumeRequest,
    baseUrl: 'https://approval-ledger.example/',
    requestKey: REQUEST_KEY,
    responsePublicKey: RESPONSE_PUBLIC_KEY_B64,
    expectedResponsePublicKeySha256: RESPONSE_PUBLIC_KEY_PIN,
    now: NOW,
    fetchImpl: async (url, init) => {
      calls += 1;
      assert.equal(url.toString(), 'https://approval-ledger.example/v1/approvals/consume');
      assert.equal(init.method, 'POST');
      assert.equal(init.redirect, 'manual');
      assert.equal(init.headers['Content-Type'], 'application/json');
      const rawRequest = Buffer.from(init.body);
      assert.equal(rawRequest.toString('utf8'), stable(consumeRequest));
      assert.equal(init.headers[REQUEST_SIGNATURE_HEADER], requestSign(rawRequest));
      return signed.response;
    }
  });
  assert.equal(calls, 1);
  assert.equal(receipt.id, CLIENT_RECEIPT_ID);
  assert.equal(receipt.ledger_receipt.state, 'CONSUMED');
  assert.equal(receipt.ledger_receipt.consume_nonce, consumeRequest.consume_nonce);
  assert.throws(() => verifyClientReceipt({ request: consumeRequest, clientReceipt: receipt, responsePublicKey: RESPONSE_PUBLIC_KEY_B64, now: NOW }), /^Error: RESPONSE_PUBLIC_KEY_PIN_INVALID/);
  assert.deepEqual(
    verifyClientReceipt({ request: consumeRequest, clientReceipt: receipt, responsePublicKey: RESPONSE_PUBLIC_KEY_B64, expectedResponsePublicKeySha256: RESPONSE_PUBLIC_KEY_PIN, now: NOW + 3_600_000 }),
    ledgerResponse()
  );
});

test('signed response verification rejects signature, schema, binding, parsed-body and time mutations', () => {
  const consumeRequest = request();
  const valid = signedResponse();
  assert.deepEqual(verifyLedgerResponse({ request: consumeRequest, rawBody: valid.raw, signatureHeader: valid.signature, responsePublicKey: RESPONSE_PUBLIC_KEY_B64, expectedResponsePublicKeySha256: RESPONSE_PUBLIC_KEY_PIN, now: NOW }), ledgerResponse());
  assert.throws(() => verifyLedgerResponse({ request: consumeRequest, rawBody: valid.raw, signatureHeader: valid.signature, responsePublicKey: RESPONSE_PUBLIC_KEY_B64, expectedResponsePublicKeySha256: `sha256:${'0'.repeat(64)}`, now: NOW }), /^Error: RESPONSE_PUBLIC_KEY_PIN_MISMATCH/);

  assert.throws(() => verifyLedgerResponse({ request: consumeRequest, rawBody: valid.raw, signatureHeader: `hmac-sha256=${'0'.repeat(64)}`, responsePublicKey: RESPONSE_PUBLIC_KEY_B64, expectedResponsePublicKeySha256: RESPONSE_PUBLIC_KEY_PIN, now: NOW }), /^Error: RESPONSE_SIGNATURE_INVALID/);
  assert.throws(() => verifyLedgerResponse({ request: consumeRequest, rawBody: valid.raw, signatureHeader: `ed25519=${Buffer.alloc(64).toString('base64')}`, responsePublicKey: RESPONSE_PUBLIC_KEY_B64, expectedResponsePublicKeySha256: RESPONSE_PUBLIC_KEY_PIN, now: NOW }), /^Error: RESPONSE_ED25519_SIGNATURE_MISMATCH/);

  const extra = ledgerResponse();
  extra.provider_status = 'SUCCESS';
  const extraSigned = signedResponse(extra);
  assert.throws(() => verifyLedgerResponse({ request: consumeRequest, rawBody: extraSigned.raw, signatureHeader: extraSigned.signature, responsePublicKey: RESPONSE_PUBLIC_KEY_B64, expectedResponsePublicKeySha256: RESPONSE_PUBLIC_KEY_PIN, now: NOW }), /^Error: RESPONSE_SCHEMA_INVALID/);

  const rebound = ledgerResponse();
  rebound.operation_id = 'different-operation';
  const reboundSigned = signedResponse(rebound);
  assert.throws(() => verifyLedgerResponse({ request: consumeRequest, rawBody: reboundSigned.raw, signatureHeader: reboundSigned.signature, responsePublicKey: RESPONSE_PUBLIC_KEY_B64, expectedResponsePublicKeySha256: RESPONSE_PUBLIC_KEY_PIN, now: NOW }), /^Error: RESPONSE_BINDING_MISMATCH/);

  const late = ledgerResponse();
  late.consumed_at = '2026-08-30T02:10:01.000Z';
  const lateSigned = signedResponse(late);
  assert.throws(() => verifyLedgerResponse({ request: consumeRequest, rawBody: lateSigned.raw, signatureHeader: lateSigned.signature, responsePublicKey: RESPONSE_PUBLIC_KEY_B64, expectedResponsePublicKeySha256: RESPONSE_PUBLIC_KEY_PIN, now: NOW }), /^Error: CONSUMED_AT_OUTSIDE_AUTHORIZATION_WINDOW/);
});

test('client receipt rejects authenticated-body wrapper drift and request replay under another binding', async () => {
  const consumeRequest = request();
  const signed = signedResponse();
  const receipt = await consumeApproval({
    request: consumeRequest,
    baseUrl: 'https://approval-ledger.example/',
    requestKey: REQUEST_KEY,
    responsePublicKey: RESPONSE_PUBLIC_KEY_B64,
    expectedResponsePublicKeySha256: RESPONSE_PUBLIC_KEY_PIN,
    now: NOW,
    fetchImpl: async () => signed.response
  });
  const drifted = structuredClone(receipt);
  drifted.ledger_receipt.state = 'ACTIVE';
  assert.throws(() => verifyClientReceipt({ request: consumeRequest, clientReceipt: drifted, responsePublicKey: RESPONSE_PUBLIC_KEY_B64, expectedResponsePublicKeySha256: RESPONSE_PUBLIC_KEY_PIN, now: NOW }), /^Error: CLIENT_RECEIPT_PARSED_BODY_MISMATCH/);

  const anotherRequest = request();
  anotherRequest.consume_nonce = '118f0e58-7ee4-4fd1-8a53-629a2feca8a1';
  assert.throws(() => verifyClientReceipt({ request: anotherRequest, clientReceipt: receipt, responsePublicKey: RESPONSE_PUBLIC_KEY_B64, expectedResponsePublicKeySha256: RESPONSE_PUBLIC_KEY_PIN, now: NOW }), /^Error: CLIENT_RECEIPT_REQUEST_DIGEST_MISMATCH/);
});

test('consume maps durable-ledger rejection outcomes and rejects redirect, 5xx, content-type and network failures', async () => {
  const base = { request: request(), baseUrl: 'https://approval-ledger.example/', requestKey: REQUEST_KEY, responsePublicKey: RESPONSE_PUBLIC_KEY_B64, expectedResponsePublicKeySha256: RESPONSE_PUBLIC_KEY_PIN, now: NOW };
  const statusResponse = (status) => async () => new Response('{}', { status, headers: { 'content-type': 'application/json' } });
  await expectCode(() => consumeApproval({ ...base, fetchImpl: statusResponse(409) }), 'ALREADY_CONSUMED_OR_REPLAY');
  await expectCode(() => consumeApproval({ ...base, fetchImpl: statusResponse(410) }), 'EXPIRED');
  await expectCode(() => consumeApproval({ ...base, fetchImpl: statusResponse(404) }), 'UNKNOWN_APPROVAL');
  await expectCode(() => consumeApproval({ ...base, fetchImpl: statusResponse(422) }), 'IMMUTABLE_BINDING_MISMATCH');
  await expectCode(() => consumeApproval({ ...base, fetchImpl: statusResponse(503) }), 'LEDGER_SERVER_ERROR');
  await expectCode(() => consumeApproval({ ...base, fetchImpl: statusResponse(302) }), 'LEDGER_REDIRECT_FORBIDDEN');

  const signed = signedResponse();
  signed.response = new Response(signed.raw, { status: 201, headers: { 'content-type': 'text/plain', [RESPONSE_SIGNATURE_HEADER]: signed.signature } });
  await expectCode(() => consumeApproval({ ...base, fetchImpl: async () => signed.response }), 'RESPONSE_CONTENT_TYPE_INVALID');
  await expectCode(() => consumeApproval({ ...base, fetchImpl: async () => { throw new Error('secret-bearing provider error'); } }), 'LEDGER_NETWORK_ERROR');
  await expectCode(() => consumeApproval({ ...base, baseUrl: 'http://approval-ledger.example/', fetchImpl: async () => signed.response }), 'BASE_URL_INVALID');
  await expectCode(() => consumeApproval({ ...base, requestKey: Buffer.alloc(16), fetchImpl: async () => signed.response }), 'HMAC_KEY_INVALID');

  const oversized = signedResponse();
  oversized.response = new Response(oversized.raw, {
    status: 201,
    headers: {
      'content-type': 'application/json',
      'content-length': '65537',
      [RESPONSE_SIGNATURE_HEADER]: oversized.signature
    }
  });
  await expectCode(() => consumeApproval({ ...base, fetchImpl: async () => oversized.response }), 'RESPONSE_SIZE_INVALID');
});

test('consume aborts a non-responsive ledger and never converts timeout into authority', async () => {
  const fetchImpl = async (_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
  });
  await expectCode(() => consumeApproval({
    request: request(),
    baseUrl: 'https://approval-ledger.example/',
    requestKey: REQUEST_KEY,
    responsePublicKey: RESPONSE_PUBLIC_KEY_B64,
    expectedResponsePublicKeySha256: RESPONSE_PUBLIC_KEY_PIN,
    now: NOW,
    timeoutMs: 1,
    fetchImpl
  }), 'LEDGER_TIMEOUT');
});

test('consume deadline covers a stalled 201 response body, not only response headers', async () => {
  const stalled = new ReadableStream({start() {}});
  const response = new Response(stalled, {
    status: 201,
    headers: {
      'content-type': 'application/json',
      [RESPONSE_SIGNATURE_HEADER]: `ed25519=${Buffer.alloc(64).toString('base64')}`,
    },
  });
  await expectCode(() => consumeApproval({
    request: request(),
    baseUrl: 'https://approval-ledger.example/',
    requestKey: REQUEST_KEY,
    responsePublicKey: RESPONSE_PUBLIC_KEY_B64,
    expectedResponsePublicKeySha256: RESPONSE_PUBLIC_KEY_PIN,
    now: NOW,
    timeoutMs: 10,
    fetchImpl: async () => response,
  }), 'LEDGER_TIMEOUT');
});
