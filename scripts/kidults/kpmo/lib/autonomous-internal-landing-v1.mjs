import crypto from 'node:crypto';

const SHA = /^[0-9a-f]{40}$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const ROLE = new Set(['ACCOUNTABLE_TRACK_AGENT', 'KPMO', 'INDEPENDENT_VERIFIER']);

export class AutonomousLandingError extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}:${detail}` : code);
    this.name = 'AutonomousLandingError';
    this.code = code;
  }
}

const fail = (code, detail = '') => { throw new AutonomousLandingError(code, detail); };
const canonicalize = value => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') return Object.fromEntries(
    Object.keys(value).sort().map(key => [key, canonicalize(value[key])]),
  );
  return value;
};
export const canonicalJson = value => JSON.stringify(canonicalize(value));
export const sha256 = value => `sha256:${crypto.createHash('sha256').update(String(value)).digest('hex')}`;

export function validateActor(actor, registry, expectedRole) {
  if (!ROLE.has(expectedRole)) fail('AUTONOMOUS_ROLE_INVALID');
  const fields = ['actor_login','actor_id','actor_type','app_id','installation_id','workflow_ref','workflow_sha','repository_id'];
  for (const field of fields) if (actor?.[field] === undefined || actor?.[field] === null || actor?.[field] === '') {
    fail('AUTONOMOUS_ACTOR_FIELD_MISSING', field);
  }
  if (!SHA.test(String(actor.workflow_sha))) fail('AUTONOMOUS_ACTOR_WORKFLOW_SHA_INVALID');
  const candidate = registry?.actors?.find(value => value.role === expectedRole
    && String(value.actor_id) === String(actor.actor_id)
    && String(value.app_id) === String(actor.app_id)
    && String(value.installation_id) === String(actor.installation_id)
    && String(value.repository_id) === String(actor.repository_id)
    && value.workflow_ref === actor.workflow_ref);
  if (!candidate) fail('AUTONOMOUS_ACTOR_NOT_ALLOWLISTED');
  if (candidate.actor_login !== actor.actor_login || candidate.actor_type !== actor.actor_type) {
    fail('AUTONOMOUS_ACTOR_IDENTITY_DRIFT');
  }
  return {role: expectedRole, stable_id: String(actor.actor_id)};
}

export function validateEnvelope(envelope, {policy, now = Date.now()} = {}) {
  if (!policy || policy.id !== 'kidults-autonomous-internal-landing-policy-v1') fail('AUTONOMOUS_POLICY_INVALID');
  const exact = policy.exact_binding_fields || [];
  for (const field of exact) if (envelope?.[field] === undefined || envelope?.[field] === null || envelope?.[field] === '') {
    fail('AUTONOMOUS_BINDING_FIELD_MISSING', field);
  }
  for (const field of ['base_sha','head_sha','head_tree_sha']) if (!SHA.test(String(envelope[field]))) {
    fail('AUTONOMOUS_SHA_INVALID', field);
  }
  for (const field of ['scope_digest','test_evidence_digest','rollback_digest','nonce_digest']) if (!DIGEST.test(String(envelope[field]))) {
    fail('AUTONOMOUS_DIGEST_INVALID', field);
  }
  if (!envelope.test_evidence || typeof envelope.test_evidence !== 'object' || Array.isArray(envelope.test_evidence)) {
    fail('AUTONOMOUS_TEST_EVIDENCE_OBJECT_REQUIRED');
  }
  if (!envelope.rollback_plan || typeof envelope.rollback_plan !== 'object' || Array.isArray(envelope.rollback_plan)) {
    fail('AUTONOMOUS_ROLLBACK_PLAN_OBJECT_REQUIRED');
  }
  if (sha256(canonicalJson(envelope.test_evidence)) !== envelope.test_evidence_digest) {
    fail('AUTONOMOUS_TEST_EVIDENCE_DIGEST_MISMATCH');
  }
  if (sha256(canonicalJson(envelope.rollback_plan)) !== envelope.rollback_digest) {
    fail('AUTONOMOUS_ROLLBACK_DIGEST_MISMATCH');
  }
  if (envelope.operation !== policy.delegated_operation) fail('AUTONOMOUS_OPERATION_NOT_DELEGATED');
  if (envelope.production !== 'HOLD' || envelope.public !== 'HOLD' || envelope.g5 !== 'HOLD') fail('AUTONOMOUS_HOLD_WEAKENED');
  const issued = Date.parse(envelope.issued_at);
  const expires = Date.parse(envelope.expires_at);
  if (!Number.isFinite(issued) || !Number.isFinite(expires) || issued > now || expires <= now) fail('AUTONOMOUS_AUTHORITY_EXPIRED');
  if (expires - issued > Number(policy.durable_single_use.maximum_ttl_seconds) * 1000) fail('AUTONOMOUS_AUTHORITY_TTL_EXCEEDED');
  const paths = envelope.changed_paths;
  if (!Array.isArray(paths) || !paths.length || paths.some(path => typeof path !== 'string' || path.startsWith('/') || path.includes('..'))) {
    fail('AUTONOMOUS_SCOPE_PATH_INVALID');
  }
  for (const prefix of policy.owner_reserved_path_prefixes || []) {
    if (paths.some(path => path.startsWith(prefix))) fail('AUTONOMOUS_OWNER_RESERVED_PATH', prefix);
  }
  const expectedScope = sha256([...paths].sort().join('\n'));
  if (expectedScope !== envelope.scope_digest) fail('AUTONOMOUS_SCOPE_DIGEST_MISMATCH');
  return {...envelope, changed_paths:[...paths].sort()};
}

export function validateQuorum({track, kpmo, verifier, registry, policy, now = Date.now()}) {
  const envelopes = [track, kpmo, verifier].map(value => validateEnvelope(value, {policy, now}));
  const tuple = ['repository_id','repository','pull_request','base_sha','head_sha','head_tree_sha','scope_digest',
    'test_evidence_digest','rollback_digest','authorization_generation','nonce_digest','expires_at'];
  for (const field of tuple) if (!envelopes.every(value => String(value[field]) === String(envelopes[0][field]))) {
    fail('AUTONOMOUS_QUORUM_BINDING_MISMATCH', field);
  }
  const identities = [
    validateActor(track.actor, registry, 'ACCOUNTABLE_TRACK_AGENT'),
    validateActor(kpmo.actor, registry, 'KPMO'),
    validateActor(verifier.actor, registry, 'INDEPENDENT_VERIFIER'),
  ];
  if (new Set(identities.map(value => value.stable_id)).size !== identities.length) fail('AUTONOMOUS_IDENTITY_SEPARATION_FAILED');
  if (verifier.verification_state !== 'VERIFIED_PASS') fail('AUTONOMOUS_INDEPENDENT_VERIFICATION_NOT_PASS');
  return {
    state: 'INDEPENDENT_VERIFIED',
    binding: Object.fromEntries(tuple.map(field => [field, envelopes[0][field]])),
    actors: identities,
    quorum_digest: sha256(envelopes.map(value => sha256(canonicalJson(value))).sort().join('\n')),
    production: 'HOLD', public: 'HOLD', g5: 'HOLD',
  };
}

export function buildTerminalReceipt({quorum, reservation, merge, postmerge, now = new Date().toISOString()}) {
  if (reservation?.state !== 'CONSUMED' || reservation?.conditional_write !== true) fail('AUTONOMOUS_NONCE_NOT_CONSUMED');
  if (!SHA.test(String(merge?.merge_sha)) || merge?.main_sha !== merge.merge_sha) fail('AUTONOMOUS_LIVE_MAIN_MISMATCH');
  if (merge?.head_sha !== quorum.binding.head_sha || merge?.tree_sha !== quorum.binding.head_tree_sha) fail('AUTONOMOUS_MERGE_BINDING_MISMATCH');
  if (postmerge?.state !== 'VERIFIED_PASS') fail('AUTONOMOUS_POSTMERGE_NOT_PASS');
  const core = {
    id:'kidults-autonomous-internal-landing-terminal-receipt-v1', version:'1.0.0', state:'RECEIPT_SEALED',
    binding:quorum.binding, quorum_digest:quorum.quorum_digest, actors:quorum.actors,
    durable_reservation:reservation, merge, postmerge, production:'HOLD', public:'HOLD', g5:'HOLD',
    usb_copy_a:'PENDING_PHYSICAL_MEDIA', created_at:now,
  };
  return {...core, receipt_digest:sha256(canonicalJson(core))};
}
