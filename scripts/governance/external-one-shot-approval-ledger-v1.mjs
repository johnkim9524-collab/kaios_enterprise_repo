#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const CONTRACT_ID = 'external-one-shot-approval-ledger-v1';
export const REQUEST_ID = 'kidults-external-one-shot-approval-consume-request-v1';
export const RESPONSE_ID = 'kidults-external-one-shot-approval-consumption-receipt-v1';
export const CLIENT_RECEIPT_ID = 'kidults-external-one-shot-approval-client-receipt-v1';
export const VERSION = '1.0.0';
export const ENDPOINT_PATH = '/v1/approvals/consume';
export const REQUEST_SIGNATURE_HEADER = 'X-KIDULTS-Approval-Request-Signature';
export const RESPONSE_SIGNATURE_HEADER = 'X-KIDULTS-Approval-Signature';
export const BASE_URL_ENV = 'KIDULTS_APPROVAL_LEDGER_BASE_URL';
export const REQUEST_KEY_ENV = 'KIDULTS_APPROVAL_LEDGER_REQUEST_HMAC_KEY_B64';
export const RESPONSE_PUBLIC_KEY_ENV = 'KIDULTS_APPROVAL_LEDGER_RESPONSE_ED25519_PUBLIC_KEY_B64';
export const RESPONSE_PUBLIC_KEY_SHA256_ENV = 'KIDULTS_APPROVAL_LEDGER_RESPONSE_ED25519_PUBLIC_KEY_SHA256';

const REQUEST_FIELDS = [
  'id', 'version', 'approval_id', 'operation_id', 'repository', 'workflow_ref',
  'control_sha', 'source_sha', 'github_run_id', 'github_run_attempt', 'consume_nonce',
  'requested_at', 'request_expires_at', 'approval_expires_at', 'target'
];
const BINDING_FIELDS = REQUEST_FIELDS.filter((field) => !['id', 'version'].includes(field));
const TARGET_FIELDS = ['provider', 'resource_type', 'resource_id', 'environment', 'target_digest'];
const RESPONSE_FIELDS = [...REQUEST_FIELDS, 'state', 'consumption_id', 'consumed_at', 'ledger_transaction_id'];
const CLIENT_RECEIPT_FIELDS = [
  'id', 'version', 'verified_at', 'endpoint_path', 'http_status', 'request_sha256',
  'verification_key_spki_sha256', 'signature_header', 'response_body_base64', 'ledger_receipt'
];
const MAX_CLOCK_SKEW_MS = 60_000;
const MAX_REQUEST_TTL_MS = 600_000;
const MAX_RESPONSE_BYTES = 65_536;
const DEFAULT_TIMEOUT_MS = 5_000;
const MAX_TIMEOUT_MS = 30_000;

const fail = (code, detail = '') => {
  const safeDetail = String(detail).replace(/[\r\n]/g, ' ').slice(0, 240);
  throw new Error(safeDetail ? `${code}:${safeDetail}` : code);
};

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const exactKeys = (value, fields, code) => {
  if (!isRecord(value)) fail(code, 'OBJECT_REQUIRED');
  const actual = Object.keys(value).sort();
  const expected = [...fields].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail(code, `EXPECTED_${expected.join(',')}_GOT_${actual.join(',')}`);
  }
};
const requireString = (value, name, pattern = null, maxLength = 512) => {
  if (typeof value !== 'string' || value.length === 0 || value.length > maxLength || value.includes('\0')) {
    fail('FIELD_INVALID', name);
  }
  if (pattern && !pattern.test(value)) fail('FIELD_INVALID', name);
};
const parseTime = (value, name) => {
  requireString(value, name, null, 64);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) fail('TIME_FORMAT_INVALID', name);
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) fail('TIME_INVALID', name);
  return milliseconds;
};
const stableStringify = (value) => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
};
const sha256 = (bytes) => `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
const timingSafeEqualText = (left, right) => {
  const a = Buffer.from(left, 'utf8');
  const b = Buffer.from(right, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

export const canonicalTarget = (target) => {
  if (!isRecord(target)) fail('TARGET_INVALID', 'OBJECT_REQUIRED');
  return stableStringify({
    environment: target.environment,
    provider: target.provider,
    resource_id: target.resource_id,
    resource_type: target.resource_type
  });
};

export const computeTargetDigest = (target) => sha256(Buffer.from(canonicalTarget(target), 'utf8'));

const validateTarget = (target) => {
  exactKeys(target, TARGET_FIELDS, 'TARGET_SCHEMA_INVALID');
  for (const field of ['provider', 'resource_type', 'resource_id', 'environment']) {
    requireString(target[field], `target.${field}`, /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/, 256);
  }
  requireString(target.target_digest, 'target.target_digest', /^sha256:[0-9a-f]{64}$/, 71);
  const expected = computeTargetDigest(target);
  if (!timingSafeEqualText(target.target_digest, expected)) fail('TARGET_DIGEST_MISMATCH');
};

export const validateConsumeRequest = (request, { now = Date.now(), requireUnexpired = true } = {}) => {
  exactKeys(request, REQUEST_FIELDS, 'REQUEST_SCHEMA_INVALID');
  if (request.id !== REQUEST_ID || request.version !== VERSION) fail('REQUEST_ID_VERSION_INVALID');
  requireString(request.approval_id, 'approval_id', /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/, 128);
  requireString(request.operation_id, 'operation_id', /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/, 128);
  requireString(request.repository, 'repository', /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/, 256);
  requireString(request.workflow_ref, 'workflow_ref', /^[^\s\0]{1,512}$/, 512);
  requireString(request.control_sha, 'control_sha', /^[0-9a-f]{40}$/, 40);
  requireString(request.source_sha, 'source_sha', /^[0-9a-f]{40}$/, 40);
  requireString(request.github_run_id, 'github_run_id', /^(?:0|[1-9][0-9]{0,19})$/, 20);
  if (request.github_run_attempt !== 1) fail('GITHUB_RUN_ATTEMPT_INVALID');
  requireString(request.consume_nonce, 'consume_nonce', /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/, 36);
  const requestedAt = parseTime(request.requested_at, 'requested_at');
  const requestExpiresAt = parseTime(request.request_expires_at, 'request_expires_at');
  const approvalExpiresAt = parseTime(request.approval_expires_at, 'approval_expires_at');
  if (requestExpiresAt <= requestedAt || approvalExpiresAt <= requestedAt) fail('EXPIRY_ORDER_INVALID');
  if (requestExpiresAt - requestedAt > MAX_REQUEST_TTL_MS) fail('REQUEST_TTL_EXCEEDED');
  if (requestedAt > now + MAX_CLOCK_SKEW_MS) fail('REQUESTED_AT_IN_FUTURE');
  if (requireUnexpired && (requestExpiresAt <= now || approvalExpiresAt <= now)) fail('APPROVAL_OR_REQUEST_EXPIRED');
  validateTarget(request.target);
  return request;
};

const parseSignature = (value, code) => {
  if (typeof value !== 'string' || !/^ed25519=[A-Za-z0-9+/]{86}==$/.test(value)) fail(code);
  const signature = Buffer.from(value.slice('ed25519='.length), 'base64');
  if (signature.length !== 64 || signature.toString('base64') !== value.slice('ed25519='.length)) fail(code);
  return signature;
};
const decodeKey = (value, envName) => {
  if (typeof value !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    fail('HMAC_KEY_BASE64_INVALID', envName);
  }
  const key = Buffer.from(value, 'base64');
  if (key.length < 32 || key.toString('base64') !== value) fail('HMAC_KEY_INVALID', envName);
  return key;
};
const hmacHex = (key, rawBody) => crypto.createHmac('sha256', key).update(rawBody).digest('hex');
const validateKeyBytes = (key, label) => {
  if (!(Buffer.isBuffer(key) || key instanceof Uint8Array) || key.byteLength < 32) fail('HMAC_KEY_INVALID', label);
  return Buffer.from(key);
};
const parseEd25519PublicKey = (encoded) => {
  if (typeof encoded !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) {
    fail('RESPONSE_PUBLIC_KEY_BASE64_INVALID');
  }
  const der = Buffer.from(encoded, 'base64');
  if (der.length === 0 || der.toString('base64') !== encoded) fail('RESPONSE_PUBLIC_KEY_BASE64_INVALID');
  let key;
  try { key = crypto.createPublicKey({ key: der, format: 'der', type: 'spki' }); }
  catch { fail('RESPONSE_PUBLIC_KEY_SPKI_INVALID'); }
  if (key.asymmetricKeyType !== 'ed25519') fail('RESPONSE_PUBLIC_KEY_TYPE_INVALID');
  return key;
};
const publicKeyDigest = key => sha256(key.export({ format: 'der', type: 'spki' }));
const verifyPublicKeyPin = (key, expectedDigest) => {
  if (typeof expectedDigest !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(expectedDigest)) fail('RESPONSE_PUBLIC_KEY_PIN_INVALID');
  if (!timingSafeEqualText(publicKeyDigest(key), expectedDigest)) fail('RESPONSE_PUBLIC_KEY_PIN_MISMATCH');
};
const verifyDetachedSignature = (key, rawBody, signatureHeader) => {
  const signature = parseSignature(signatureHeader, 'RESPONSE_SIGNATURE_INVALID');
  if (!crypto.verify(null, rawBody, key, signature)) fail('RESPONSE_ED25519_SIGNATURE_MISMATCH');
};

const assertMirroredBindings = (request, response) => {
  for (const field of BINDING_FIELDS) {
    if (stableStringify(request[field]) !== stableStringify(response[field])) fail('RESPONSE_BINDING_MISMATCH', field);
  }
};

export const verifyLedgerResponse = ({ request, rawBody, signatureHeader, responsePublicKey, expectedResponsePublicKeySha256, now = Date.now() }) => {
  validateConsumeRequest(request, { now, requireUnexpired: false });
  if (!Buffer.isBuffer(rawBody)) fail('RESPONSE_BODY_INVALID', 'BUFFER_REQUIRED');
  if (rawBody.length === 0 || rawBody.length > MAX_RESPONSE_BYTES) fail('RESPONSE_SIZE_INVALID');
  const publicKey = typeof responsePublicKey === 'string' ? parseEd25519PublicKey(responsePublicKey) : responsePublicKey;
  if (!publicKey || publicKey.asymmetricKeyType !== 'ed25519') fail('RESPONSE_PUBLIC_KEY_TYPE_INVALID');
  verifyPublicKeyPin(publicKey, expectedResponsePublicKeySha256);
  verifyDetachedSignature(publicKey, rawBody, signatureHeader);
  let response;
  try {
    response = JSON.parse(rawBody.toString('utf8'));
  } catch {
    fail('RESPONSE_JSON_INVALID');
  }
  exactKeys(response, RESPONSE_FIELDS, 'RESPONSE_SCHEMA_INVALID');
  if (response.id !== RESPONSE_ID || response.version !== VERSION || response.state !== 'CONSUMED') {
    fail('RESPONSE_ID_VERSION_STATE_INVALID');
  }
  assertMirroredBindings(request, response);
  requireString(response.consumption_id, 'consumption_id', /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/, 128);
  requireString(response.ledger_transaction_id, 'ledger_transaction_id', /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/, 128);
  const consumedAt = parseTime(response.consumed_at, 'consumed_at');
  const requestedAt = parseTime(request.requested_at, 'requested_at');
  const requestExpiresAt = parseTime(request.request_expires_at, 'request_expires_at');
  const approvalExpiresAt = parseTime(request.approval_expires_at, 'approval_expires_at');
  if (consumedAt < requestedAt - MAX_CLOCK_SKEW_MS || consumedAt > requestExpiresAt || consumedAt > approvalExpiresAt) {
    fail('CONSUMED_AT_OUTSIDE_AUTHORIZATION_WINDOW');
  }
  if (consumedAt > now + MAX_CLOCK_SKEW_MS) fail('CONSUMED_AT_IN_FUTURE');
  return response;
};

const validatedBaseUrl = (value) => {
  let url;
  try { url = new URL(value); } catch { fail('BASE_URL_INVALID'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    fail('BASE_URL_INVALID');
  }
  return url;
};
const validatedTimeout = (value) => {
  const timeout = Number(value ?? DEFAULT_TIMEOUT_MS);
  if (!Number.isInteger(timeout) || timeout < 1 || timeout > MAX_TIMEOUT_MS) fail('TIMEOUT_INVALID');
  return timeout;
};
const headerValue = (headers, name) => typeof headers?.get === 'function' ? headers.get(name) : null;
const awaitWithAbort = (promise, signal) => new Promise((resolve, reject) => {
  const abort = () => reject(new DOMException('aborted', 'AbortError'));
  if (signal?.aborted) return abort();
  signal?.addEventListener('abort', abort, { once: true });
  Promise.resolve(promise).then(resolve, reject).finally(() => signal?.removeEventListener('abort', abort));
});
const readBoundedResponseBody = async (response, signal) => {
  const contentLength = headerValue(response.headers, 'content-length');
  if (contentLength !== null) {
    if (!/^(?:0|[1-9][0-9]*)$/.test(contentLength)) fail('RESPONSE_CONTENT_LENGTH_INVALID');
    if (Number(contentLength) > MAX_RESPONSE_BYTES) fail('RESPONSE_SIZE_INVALID');
  }
  if (response.body && typeof response.body.getReader === 'function') {
    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    try {
      while (true) {
        const { done, value } = await awaitWithAbort(reader.read(), signal);
        if (done) break;
        const chunk = Buffer.from(value);
        total += chunk.length;
        if (total > MAX_RESPONSE_BYTES) {
          await reader.cancel();
          fail('RESPONSE_SIZE_INVALID');
        }
        chunks.push(chunk);
      }
    } catch (error) {
      try { await reader.cancel(); } catch {}
      throw error;
    }
    return Buffer.concat(chunks, total);
  }
  const rawBody = Buffer.from(await awaitWithAbort(response.arrayBuffer(), signal));
  if (rawBody.length > MAX_RESPONSE_BYTES) fail('RESPONSE_SIZE_INVALID');
  return rawBody;
};

export const consumeApproval = async ({
  request,
  baseUrl,
  requestKey,
  responsePublicKey,
  expectedResponsePublicKeySha256,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  now = Date.now(),
  fetchImpl = globalThis.fetch
}) => {
  validateConsumeRequest(request, { now, requireUnexpired: true });
  const base = validatedBaseUrl(baseUrl);
  const timeout = validatedTimeout(timeoutMs);
  const requestKeyBytes = validateKeyBytes(requestKey, 'requestKey');
  const responseVerificationKey = typeof responsePublicKey === 'string'
    ? parseEd25519PublicKey(responsePublicKey)
    : responsePublicKey;
  if (!responseVerificationKey || responseVerificationKey.asymmetricKeyType !== 'ed25519') fail('RESPONSE_PUBLIC_KEY_TYPE_INVALID');
  verifyPublicKeyPin(responseVerificationKey, expectedResponsePublicKeySha256);
  if (typeof fetchImpl !== 'function') fail('FETCH_UNAVAILABLE');
  const rawRequest = Buffer.from(stableStringify(request), 'utf8');
  const requestSignature = `hmac-sha256=${hmacHex(requestKeyBytes, rawRequest)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  let response;
  try {
    response = await fetchImpl(new URL(ENDPOINT_PATH, base), {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        [REQUEST_SIGNATURE_HEADER]: requestSignature
      },
      body: rawRequest,
      redirect: 'manual',
      signal: controller.signal
    });
  } catch (error) {
    clearTimeout(timer);
    if (controller.signal.aborted || error?.name === 'AbortError') fail('LEDGER_TIMEOUT');
    fail('LEDGER_NETWORK_ERROR');
  }
  let rawBody;
  try {
    if (!response || typeof response.status !== 'number') fail('LEDGER_RESPONSE_INVALID');
    if (response.status >= 300 && response.status < 400) fail('LEDGER_REDIRECT_FORBIDDEN', String(response.status));
    if (response.status !== 201) {
      const outcomes = { 404: 'UNKNOWN_APPROVAL', 409: 'ALREADY_CONSUMED_OR_REPLAY', 410: 'EXPIRED', 422: 'IMMUTABLE_BINDING_MISMATCH' };
      fail(outcomes[response.status] ?? (response.status >= 500 ? 'LEDGER_SERVER_ERROR' : 'LEDGER_HTTP_STATUS_REJECTED'), String(response.status));
    }
    const contentType = headerValue(response.headers, 'content-type');
    if (typeof contentType !== 'string' || !/^application\/json(?:\s*;|$)/i.test(contentType)) fail('RESPONSE_CONTENT_TYPE_INVALID');
    rawBody = await readBoundedResponseBody(response, controller.signal);
  } catch (error) {
    if (controller.signal.aborted || error?.name === 'AbortError') {
      fail('LEDGER_TIMEOUT');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
  const signatureHeader = headerValue(response.headers, RESPONSE_SIGNATURE_HEADER);
  const ledgerReceipt = verifyLedgerResponse({ request, rawBody, signatureHeader, responsePublicKey: responseVerificationKey, expectedResponsePublicKeySha256, now });
  return {
    id: CLIENT_RECEIPT_ID,
    version: VERSION,
    verified_at: new Date(now).toISOString(),
    endpoint_path: ENDPOINT_PATH,
    http_status: 201,
    request_sha256: sha256(rawRequest),
    verification_key_spki_sha256: publicKeyDigest(responseVerificationKey),
    signature_header: signatureHeader,
    response_body_base64: rawBody.toString('base64'),
    ledger_receipt: ledgerReceipt
  };
};

export const verifyClientReceipt = ({ request, clientReceipt, responsePublicKey, expectedResponsePublicKeySha256, now = Date.now() }) => {
  exactKeys(clientReceipt, CLIENT_RECEIPT_FIELDS, 'CLIENT_RECEIPT_SCHEMA_INVALID');
  if (clientReceipt.id !== CLIENT_RECEIPT_ID || clientReceipt.version !== VERSION ||
      clientReceipt.endpoint_path !== ENDPOINT_PATH || clientReceipt.http_status !== 201) {
    fail('CLIENT_RECEIPT_ID_VERSION_STATUS_INVALID');
  }
  const verifiedAt = parseTime(clientReceipt.verified_at, 'verified_at');
  if (verifiedAt > now + MAX_CLOCK_SKEW_MS) fail('CLIENT_RECEIPT_VERIFIED_AT_IN_FUTURE');
  requireString(clientReceipt.request_sha256, 'request_sha256', /^sha256:[0-9a-f]{64}$/, 71);
  requireString(clientReceipt.verification_key_spki_sha256, 'verification_key_spki_sha256', /^sha256:[0-9a-f]{64}$/, 71);
  const responseVerificationKey = typeof responsePublicKey === 'string'
    ? parseEd25519PublicKey(responsePublicKey)
    : responsePublicKey;
  if (!responseVerificationKey || responseVerificationKey.asymmetricKeyType !== 'ed25519') fail('RESPONSE_PUBLIC_KEY_TYPE_INVALID');
  verifyPublicKeyPin(responseVerificationKey, expectedResponsePublicKeySha256);
  if (!timingSafeEqualText(clientReceipt.verification_key_spki_sha256, publicKeyDigest(responseVerificationKey))) {
    fail('CLIENT_RECEIPT_VERIFICATION_KEY_MISMATCH');
  }
  const rawRequest = Buffer.from(stableStringify(request), 'utf8');
  if (!timingSafeEqualText(clientReceipt.request_sha256, sha256(rawRequest))) fail('CLIENT_RECEIPT_REQUEST_DIGEST_MISMATCH');
  if (typeof clientReceipt.response_body_base64 !== 'string' || clientReceipt.response_body_base64.length === 0) {
    fail('CLIENT_RECEIPT_BODY_INVALID');
  }
  const rawBody = Buffer.from(clientReceipt.response_body_base64, 'base64');
  if (rawBody.toString('base64') !== clientReceipt.response_body_base64) fail('CLIENT_RECEIPT_BODY_INVALID');
  const ledgerReceipt = verifyLedgerResponse({
    request,
    rawBody,
    signatureHeader: clientReceipt.signature_header,
    responsePublicKey: responseVerificationKey,
    expectedResponsePublicKeySha256,
    now
  });
  if (stableStringify(ledgerReceipt) !== stableStringify(clientReceipt.ledger_receipt)) fail('CLIENT_RECEIPT_PARSED_BODY_MISMATCH');
  return ledgerReceipt;
};

const readJson = (filePath, code) => {
  let raw;
  try { raw = fs.readFileSync(filePath, 'utf8'); } catch { fail(code, 'READ_FAILED'); }
  try { return JSON.parse(raw); } catch { fail(code, 'JSON_INVALID'); }
};
const parseArgs = (argv) => {
  const command = argv[0];
  const options = { command, request: null, receipt: null, receiptOut: null, timeoutMs: null };
  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--request') options.request = argv[++index];
    else if (arg === '--receipt') options.receipt = argv[++index];
    else if (arg === '--receipt-out') options.receiptOut = argv[++index];
    else if (arg === '--timeout-ms') options.timeoutMs = argv[++index];
    else fail('UNKNOWN_ARGUMENT', arg);
  }
  if (!['consume', 'verify'].includes(command)) fail('COMMAND_REQUIRED', 'consume_or_verify');
  if (!options.request) fail('REQUEST_PATH_REQUIRED');
  if (command === 'consume' && !options.receiptOut) fail('RECEIPT_OUT_PATH_REQUIRED');
  if (command === 'verify' && !options.receipt) fail('RECEIPT_PATH_REQUIRED');
  return options;
};

export const runCli = async (argv, environment = process.env) => {
  const options = parseArgs(argv);
  const request = readJson(options.request, 'REQUEST_FILE_INVALID');
  const responsePublicKey = environment[RESPONSE_PUBLIC_KEY_ENV];
  parseEd25519PublicKey(responsePublicKey);
  const expectedResponsePublicKeySha256 = environment[RESPONSE_PUBLIC_KEY_SHA256_ENV];
  if (options.command === 'consume') {
    const requestKey = decodeKey(environment[REQUEST_KEY_ENV], REQUEST_KEY_ENV);
    const receipt = await consumeApproval({
      request,
      baseUrl: environment[BASE_URL_ENV],
      requestKey,
      responsePublicKey,
      expectedResponsePublicKeySha256,
      timeoutMs: options.timeoutMs
    });
    const outputPath = path.resolve(options.receiptOut);
    try { fs.writeFileSync(outputPath, `${JSON.stringify(receipt, null, 2)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 }); }
    catch { fail('RECEIPT_WRITE_FAILED'); }
    process.stdout.write(`${JSON.stringify({ state: 'VERIFIED_CONSUMED', receipt_path: outputPath, approval_id: receipt.ledger_receipt.approval_id, consumption_id: receipt.ledger_receipt.consumption_id })}\n`);
    return;
  }
  const clientReceipt = readJson(options.receipt, 'CLIENT_RECEIPT_FILE_INVALID');
  const ledgerReceipt = verifyClientReceipt({ request, clientReceipt, responsePublicKey, expectedResponsePublicKeySha256 });
  process.stdout.write(`${JSON.stringify({ state: 'VERIFIED_CONSUMED', approval_id: ledgerReceipt.approval_id, consumption_id: ledgerReceipt.consumption_id, ledger_transaction_id: ledgerReceipt.ledger_transaction_id })}\n`);
};

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  runCli(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error?.message ?? 'UNKNOWN_FAILURE'}\n`);
    process.exitCode = 1;
  });
}
