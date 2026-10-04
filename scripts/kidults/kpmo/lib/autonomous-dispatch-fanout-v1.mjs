import fs from 'node:fs';
import path from 'node:path';
import {canonicalJson, sha256} from './canonical-json-v1.mjs';

export const DISPATCH_EVENT_TYPE = 'kidults.authorization.generation.v1';
export const DISPATCH_ROLES = Object.freeze([
  'ACCOUNTABLE_TRACK_AGENT',
  'KPMO',
  'INDEPENDENT_VERIFIER',
]);

const SHA = /^[0-9a-f]{40}$/;
const RUN_ID = /^[1-9][0-9]{0,19}$/;

export class AutonomousDispatchError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}:${detail}` : code);
    this.name = 'AutonomousDispatchError';
    this.code = code;
  }
}

const fail = (code, detail = '') => { throw new AutonomousDispatchError(code, detail); };

const bindingFromEnvelope = envelope => {
  const fields = [
    'repository', 'repository_id', 'pull_request', 'base_sha', 'head_sha', 'head_tree_sha',
    'scope_digest', 'authorization_generation', 'nonce_digest',
  ];
  for (const field of fields) {
    if (envelope?.[field] === undefined || envelope?.[field] === null || envelope?.[field] === '') {
      fail('AUTONOMOUS_DISPATCH_BINDING_FIELD_MISSING', field);
    }
  }
  for (const field of ['base_sha', 'head_sha', 'head_tree_sha']) {
    if (!SHA.test(String(envelope[field]))) fail('AUTONOMOUS_DISPATCH_SHA_INVALID', field);
  }
  return Object.fromEntries(fields.map(field => [field, envelope[field]]));
};

const receiptCore = ({envelope, runId, runAttempt, state, roleState, observedAt}) => {
  const binding = bindingFromEnvelope(envelope);
  if (!RUN_ID.test(String(runId))) fail('AUTONOMOUS_DISPATCH_RUN_ID_INVALID');
  const attempt = Number(runAttempt);
  if (!Number.isInteger(attempt) || attempt < 1) fail('AUTONOMOUS_DISPATCH_RUN_ATTEMPT_INVALID');
  const idempotencyKey = sha256(canonicalJson({
    event_type: DISPATCH_EVENT_TYPE,
    ...binding,
  }));
  return {
    id: 'kidults-autonomous-dispatch-fanout-receipt-v1',
    version: '1.0.0',
    state,
    event_type: DISPATCH_EVENT_TYPE,
    dispatch_id: idempotencyKey,
    idempotency_key: idempotencyKey,
    transport: {
      github_run_id: String(runId),
      github_run_attempt: attempt,
    },
    binding,
    target_roles: [...DISPATCH_ROLES],
    role_delivery_bitmap: Object.fromEntries(DISPATCH_ROLES.map(role => [role, roleState])),
    observed_at: observedAt,
    production: 'HOLD',
    public: 'HOLD',
    g5: 'HOLD',
  };
};

const seal = core => ({...core, receipt_digest: sha256(canonicalJson(core))});

export function buildDispatchRequest({envelope, runId, runAttempt, now = new Date().toISOString()}) {
  const dispatch = seal(receiptCore({
    envelope,
    runId,
    runAttempt,
    state: 'DISPATCH_REQUESTED',
    roleState: 'PENDING_COMMON_EVENT',
    observedAt: now,
  }));
  return {
    receipt: dispatch,
    request: {
      event_type: DISPATCH_EVENT_TYPE,
      client_payload: {envelope, dispatch},
    },
  };
}

export function transitionDispatchReceipt(receipt, {state, now = new Date().toISOString(), failureCode = null} = {}) {
  if (!receipt || receipt.id !== 'kidults-autonomous-dispatch-fanout-receipt-v1') fail('AUTONOMOUS_DISPATCH_RECEIPT_INVALID');
  const {receipt_digest: digest, ...priorCore} = receipt;
  if (digest !== sha256(canonicalJson(priorCore))) fail('AUTONOMOUS_DISPATCH_RECEIPT_DIGEST_MISMATCH');
  if (receipt.state !== 'DISPATCH_REQUESTED') fail('AUTONOMOUS_DISPATCH_RECEIPT_NOT_TRANSITIONABLE');
  if (!['DISPATCH_ACCEPTED', 'DISPATCH_FAILED'].includes(state)) fail('AUTONOMOUS_DISPATCH_TERMINAL_STATE_INVALID');
  const roleState = state === 'DISPATCH_ACCEPTED' ? 'COMMON_EVENT_ACCEPTED' : 'DELIVERY_UNKNOWN';
  const core = {
    ...priorCore,
    state,
    role_delivery_bitmap: Object.fromEntries(DISPATCH_ROLES.map(role => [role, roleState])),
    observed_at: now,
    terminal: true,
    ...(state === 'DISPATCH_FAILED' ? {failure_code: String(failureCode || 'DISPATCH_TRANSPORT_FAILED')} : {}),
  };
  return seal(core);
}

export function validateDispatchEvent({eventAction, envelope, dispatch, role = null}) {
  if (eventAction !== DISPATCH_EVENT_TYPE) fail('AUTONOMOUS_DISPATCH_EVENT_INVALID');
  const expected = buildDispatchRequest({
    envelope,
    runId: dispatch?.transport?.github_run_id,
    runAttempt: dispatch?.transport?.github_run_attempt,
    now: dispatch?.observed_at,
  }).receipt;
  if (canonicalJson(expected) !== canonicalJson(dispatch)) fail('AUTONOMOUS_DISPATCH_BINDING_MISMATCH');
  if (role !== null && !DISPATCH_ROLES.includes(role)) fail('AUTONOMOUS_DISPATCH_ROLE_INVALID');
  if (role !== null && dispatch.role_delivery_bitmap?.[role] !== 'PENDING_COMMON_EVENT') {
    fail('AUTONOMOUS_DISPATCH_ROLE_NOT_PENDING', role);
  }
  return {dispatch_id: dispatch.dispatch_id, idempotency_key: dispatch.idempotency_key};
}

export function writeJsonAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), {recursive: true, mode: 0o700});
  const temporary = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, {encoding: 'utf8', mode: 0o600, flag: 'wx'});
  fs.renameSync(temporary, filePath);
}
