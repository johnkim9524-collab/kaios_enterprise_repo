import crypto from 'node:crypto';

const SHA_RE = /^[0-9a-f]{40}$/;
const NONCE_RE = /^[A-Za-z0-9_-]{32,128}$/;
const SLOT_RE = /^(POOLING|P0B|RESERVE|SENTINEL|ASSURANCE)$/;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

export class NaturalClockError extends Error {
  constructor(code) {
    super(code);
    this.name = 'NaturalClockError';
    this.code = code;
  }
}

function fail(code) {
  throw new NaturalClockError(code);
}

export function canonicalNaturalClockPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) fail('NATURAL_CLOCK_PAYLOAD_INVALID');
  const keys = Object.keys(payload).sort();
  const expected = ['dispatch_id', 'exact_main_sha', 'issued_at', 'nonce', 'slot', 'source'].sort();
  if (JSON.stringify(keys) !== JSON.stringify(expected)) fail('NATURAL_CLOCK_PAYLOAD_FIELDS_INVALID');
  if (payload.source !== 'AWS_EVENTBRIDGE_SCHEDULER') fail('NATURAL_CLOCK_SOURCE_INVALID');
  if (!SLOT_RE.test(payload.slot)) fail('NATURAL_CLOCK_SLOT_INVALID');
  if (!SHA_RE.test(payload.exact_main_sha)) fail('NATURAL_CLOCK_SHA_INVALID');
  if (!NONCE_RE.test(payload.nonce)) fail('NATURAL_CLOCK_NONCE_INVALID');
  if (payload.dispatch_id !== `kidults-natural-clock-v1:${payload.slot}:${payload.exact_main_sha}:${payload.nonce}`) {
    fail('NATURAL_CLOCK_DISPATCH_ID_INVALID');
  }
  const issuedAt = Date.parse(payload.issued_at);
  if (!Number.isFinite(issuedAt) || new Date(issuedAt).toISOString() !== payload.issued_at) fail('NATURAL_CLOCK_TIME_INVALID');
  return {
    dispatch_id: payload.dispatch_id,
    exact_main_sha: payload.exact_main_sha,
    issued_at: payload.issued_at,
    nonce: payload.nonce,
    slot: payload.slot,
    source: payload.source,
  };
}

export function verifyNaturalClockDispatch({payload, liveMainSha, now = Date.now(), seenDispatchIds = new Set()}) {
  const canonical = canonicalNaturalClockPayload(payload);
  if (!SHA_RE.test(liveMainSha) || canonical.exact_main_sha !== liveMainSha) fail('NATURAL_CLOCK_EXACT_MAIN_MISMATCH');
  const age = now - Date.parse(canonical.issued_at);
  if (age < -MAX_CLOCK_SKEW_MS || age > MAX_CLOCK_SKEW_MS) fail('NATURAL_CLOCK_OUTSIDE_ACCEPTANCE_WINDOW');
  if (seenDispatchIds.has(canonical.dispatch_id)) fail('NATURAL_CLOCK_REPLAY');
  return {
    id: 'kidults-natural-clock-dispatch-receipt-v1',
    state: 'VERIFIED_PASS',
    ...canonical,
    live_main_sha: liveMainSha,
    accepted_at: new Date(now).toISOString(),
    receipt_digest: `sha256:${crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex')}`,
    natural_authority: 'REDUNDANT_EXTERNAL_TIME_SOURCE_ONLY',
    manual_dispatch: false,
    production: 'HOLD',
    public: 'HOLD',
    g5: 'HOLD',
  };
}

export const NATURAL_CLOCK_MAX_SKEW_MS = MAX_CLOCK_SKEW_MS;

