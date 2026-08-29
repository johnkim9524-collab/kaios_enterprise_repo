import { createHash, createHmac, createPrivateKey, sign as signDetached, timingSafeEqual } from 'node:crypto';

const REQUEST_ID = 'kidults-external-one-shot-approval-consume-request-v1';
const RESPONSE_ID = 'kidults-external-one-shot-approval-consumption-receipt-v1';
const VERSION = '1.0.0';
const ENDPOINT_PATH = '/v1/approvals/consume';
const REQUEST_SIGNATURE_HEADER = 'x-kidults-approval-request-signature';
const RESPONSE_SIGNATURE_HEADER = 'x-kidults-approval-signature';
const REQUEST_KEY_ENV = 'KIDULTS_APPROVAL_LEDGER_REQUEST_HMAC_KEY_B64';
const RESPONSE_PRIVATE_KEY_ENV = 'KIDULTS_APPROVAL_LEDGER_RESPONSE_ED25519_PRIVATE_KEY_B64';
const MAX_BODY_BYTES = 32 * 1024;
const REQUEST_SKEW_MS = 60_000;
const MAX_REQUEST_TTL_MS = 600_000;

const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
const stableStringify = value => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
};
const isSha = value => /^[0-9a-f]{40}$/.test(String(value));
const isStrictUtc = value => typeof value === 'string'
  && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)
  && Number.isFinite(Date.parse(value));
const safeId = (value, maximum = 128) => typeof value === 'string'
  && value.length <= maximum && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value);
const targetId = value => typeof value === 'string'
  && value.length <= 256 && /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(value);
const isUuidV4 = value => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
const secret = (env, name) => {
  const encoded = String(env[name] || '');
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) throw new Error(`${name}_INVALID`);
  const decoded = Buffer.from(encoded, 'base64');
  if (decoded.length < 32 || decoded.toString('base64') !== encoded) throw new Error(`${name}_INVALID`);
  return decoded;
};
const responsePrivateKey = env => {
  const encoded = String(env[RESPONSE_PRIVATE_KEY_ENV] || '');
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) {
    throw new Error(`${RESPONSE_PRIVATE_KEY_ENV}_INVALID`);
  }
  const der = Buffer.from(encoded, 'base64');
  if (der.length === 0 || der.toString('base64') !== encoded) throw new Error(`${RESPONSE_PRIVATE_KEY_ENV}_INVALID`);
  let key;
  try { key = createPrivateKey({ key: der, format: 'der', type: 'pkcs8' }); }
  catch { throw new Error(`${RESPONSE_PRIVATE_KEY_ENV}_INVALID`); }
  if (key.asymmetricKeyType !== 'ed25519') throw new Error(`${RESPONSE_PRIVATE_KEY_ENV}_INVALID`);
  return key;
};
const hmac = (key, value) => createHmac('sha256', key).update(value).digest('hex');
const targetDigest = target => `sha256:${createHash('sha256').update(stableStringify({
  environment: target.environment,
  provider: target.provider,
  resource_id: target.resource_id,
  resource_type: target.resource_type
})).digest('hex')}`;
const signedResponse = (env, status, body) => {
  const raw = JSON.stringify(body);
  const signature = signDetached(null, Buffer.from(raw), responsePrivateKey(env)).toString('base64');
  return new Response(raw, {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
      [RESPONSE_SIGNATURE_HEADER]: `ed25519=${signature}`
    }
  });
};
const rejection = (env, status, reason) => signedResponse(env, status, {
  id: 'kidults-external-one-shot-approval-rejection-v1', version: VERSION, state: 'REJECTED', reason
});
const reject = (code, status) => { throw Object.assign(new Error(code), { status }); };

const readBoundedRequestBody = async request => {
  const declared = request.headers.get('content-length');
  if (declared !== null) {
    if (!/^(?:0|[1-9][0-9]*)$/.test(declared)) reject('CONTENT_LENGTH_INVALID', 400);
    if (Number(declared) > MAX_BODY_BYTES) reject('REQUEST_TOO_LARGE', 413);
  }
  if (request.body && typeof request.body.getReader === 'function') {
    const reader = request.body.getReader();
    const chunks = [];
    let total = 0;
    while (true) {
      let next;
      try { next = await reader.read(); } catch { reject('REQUEST_BODY_UNREADABLE', 400); }
      if (next.done) break;
      const chunk = Buffer.from(next.value);
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        try { await reader.cancel(); } catch {}
        reject('REQUEST_TOO_LARGE', 413);
      }
      chunks.push(chunk);
    }
    return Buffer.concat(chunks, total).toString('utf8');
  }
  let raw;
  try { raw = Buffer.from(await request.arrayBuffer()); } catch { reject('REQUEST_BODY_UNREADABLE', 400); }
  if (raw.length > MAX_BODY_BYTES) reject('REQUEST_TOO_LARGE', 413);
  return raw.toString('utf8');
};

function verifyRequest(request, raw, env, now) {
  if (request.method !== 'POST') reject('METHOD_NOT_ALLOWED', 405);
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') || '')) reject('CONTENT_TYPE_INVALID', 415);
  const signature = request.headers.get(REQUEST_SIGNATURE_HEADER) || '';
  const expected = `hmac-sha256=${hmac(secret(env, REQUEST_KEY_ENV), raw)}`;
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) {
    reject('REQUEST_SIGNATURE_INVALID', 401);
  }
  let body;
  try { body = JSON.parse(raw); } catch { reject('REQUEST_JSON_INVALID', 400); }
  const keys = ['id','version','approval_id','operation_id','repository','workflow_ref','control_sha','source_sha','github_run_id','github_run_attempt','consume_nonce','requested_at','request_expires_at','approval_expires_at','target'];
  if (!exactKeys(body, keys) || body.id !== REQUEST_ID || body.version !== VERSION) reject('REQUEST_SCHEMA_INVALID', 422);
  const requestedAt = Date.parse(body.requested_at);
  const requestExpiresAt = Date.parse(body.request_expires_at);
  const approvalExpiresAt = Date.parse(body.approval_expires_at);
  if (!safeId(body.approval_id) || !safeId(body.operation_id)
    || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(String(body.repository))
    || typeof body.workflow_ref !== 'string' || body.workflow_ref.length === 0 || body.workflow_ref.length > 512 || /\s|\0/.test(body.workflow_ref)
    || !/^(?:0|[1-9][0-9]{0,19})$/.test(String(body.github_run_id)) || !isUuidV4(body.consume_nonce)
    || !isSha(body.control_sha) || !isSha(body.source_sha) || body.github_run_attempt !== 1
    || !isStrictUtc(body.requested_at) || !isStrictUtc(body.request_expires_at) || !isStrictUtc(body.approval_expires_at)
    || requestExpiresAt <= requestedAt || approvalExpiresAt <= requestedAt
    || requestExpiresAt - requestedAt > MAX_REQUEST_TTL_MS
    || requestedAt > now + REQUEST_SKEW_MS) {
    reject('REQUEST_BINDING_INVALID', 422);
  }
  if (now >= requestExpiresAt || now >= approvalExpiresAt) reject('REQUEST_OR_APPROVAL_EXPIRED', 410);
  if (!exactKeys(body.target, ['provider','resource_type','resource_id','environment','target_digest'])
    || ![body.target.provider,body.target.resource_type,body.target.resource_id,body.target.environment].every(targetId)
    || !/^sha256:[0-9a-f]{64}$/.test(String(body.target.target_digest))
    || body.target.target_digest !== targetDigest(body.target)) reject('TARGET_BINDING_INVALID', 422);
  return body;
}

export class ApprovalLedger {
  constructor(state, env) { this.state = state; this.env = env; }

  async fetch(request) {
    try {
      const url = new URL(request.url);
      if (url.pathname !== ENDPOINT_PATH || url.search) return rejection(this.env, 404, 'ROUTE_NOT_FOUND');
      const raw = await readBoundedRequestBody(request);
      const input = verifyRequest(request, raw, this.env, Date.now());
      return await this.state.storage.transaction(async txn => {
        const record = await txn.get('approval');
        if (!record) return rejection(this.env, 404, 'APPROVAL_NOT_FOUND');
        const bound = ['approval_id','operation_id','repository','workflow_ref','control_sha','source_sha','github_run_id','github_run_attempt'];
        if (bound.some(key => record[key] !== input[key]) || stableStringify(record.target) !== stableStringify(input.target)) {
          return rejection(this.env, 422, 'APPROVAL_SCOPE_MISMATCH');
        }
        if (record.expires_at !== input.approval_expires_at) return rejection(this.env, 422, 'APPROVAL_EXPIRY_MISMATCH');
        if (record.state === 'CONSUMED') return rejection(this.env, 409, 'APPROVAL_ALREADY_CONSUMED');
        if (record.state === 'REVOKED') return rejection(this.env, 409, 'APPROVAL_REVOKED');
        if (record.state !== 'ACTIVE') return rejection(this.env, 409, 'APPROVAL_NOT_ACTIVE');
        // Re-read server time at the atomic transition point. Validation may
        // have waited for another transaction; neither request nor approval
        // may cross expiry while queued and still be consumed.
        const transitionNow = Date.now();
        if (transitionNow >= Date.parse(input.request_expires_at)) return rejection(this.env, 410, 'REQUEST_EXPIRED');
        if (!isStrictUtc(record.expires_at) || transitionNow >= Date.parse(record.expires_at)) return rejection(this.env, 410, 'APPROVAL_EXPIRED');
        const consumedAt = new Date(transitionNow).toISOString();
        const consumptionId = crypto.randomUUID();
        const ledgerTransactionId = crypto.randomUUID();
        const consumed = {
          ...record,
          state: 'CONSUMED',
          consumed_at: consumedAt,
          consumption_id: consumptionId,
          ledger_transaction_id: ledgerTransactionId,
          github_run_id: input.github_run_id,
          github_run_attempt: input.github_run_attempt,
          consume_nonce: input.consume_nonce
        };
        await txn.put('approval', consumed);
        await txn.put(`event:${ledgerTransactionId}`, consumed);
        return signedResponse(this.env, 201, {
          id: RESPONSE_ID,
          version: VERSION,
          state: 'CONSUMED',
          approval_id: input.approval_id,
          operation_id: input.operation_id,
          repository: input.repository,
          workflow_ref: input.workflow_ref,
          control_sha: input.control_sha,
          source_sha: input.source_sha,
          github_run_id: input.github_run_id,
          github_run_attempt: input.github_run_attempt,
          consume_nonce: input.consume_nonce,
          requested_at: input.requested_at,
          request_expires_at: input.request_expires_at,
          approval_expires_at: record.expires_at,
          target: input.target,
          consumption_id: consumptionId,
          consumed_at: consumedAt,
          ledger_transaction_id: ledgerTransactionId
        });
      });
    } catch (error) {
      return rejection(this.env, error.status || 500, error.message || 'LEDGER_FAILURE');
    }
  }
}

const worker = {
  async fetch(request, env) {
    if (request.method !== 'POST') return rejection(env, 405, 'METHOD_NOT_ALLOWED');
    let raw;
    try { raw = await readBoundedRequestBody(request); }
    catch (error) { return rejection(env, error.status || 400, error.message || 'REQUEST_BODY_UNREADABLE'); }
    let approvalId;
    try { approvalId = verifyRequest(request, raw, env, Date.now()).approval_id; }
    catch (error) { return rejection(env, error.status || 500, error.message || 'REQUEST_REJECTED'); }
    if (!safeId(approvalId)) return rejection(env, 422, 'APPROVAL_ID_INVALID');
    const id = env.APPROVAL_LEDGER.idFromName(approvalId);
    const forwarded = new Request(request.url, {method:'POST',headers:request.headers,body:raw});
    return env.APPROVAL_LEDGER.get(id).fetch(forwarded);
  }
};
export default worker;
