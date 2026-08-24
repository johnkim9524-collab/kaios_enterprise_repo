#!/usr/bin/env node
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import {
  capabilitySigningBytes,
  canonicalProjectionDigest,
  serverProjectionCapabilityContract,
  verifyServerProjectionCapability
} from './server-projection-capability-v1.mjs';
import {approvedProjectionFixture} from './proof-product-test-fixtures-v1.mjs';

const clone = value => structuredClone(value);
const {publicKey, privateKey} = crypto.generateKeyPairSync('ed25519');
const {publicKey: wrongPublicKey} = crypto.generateKeyPairSync('ed25519');
const {publicKey: wrongTypePublicKey} = crypto.generateKeyPairSync('rsa',{modulusLength:2048});
const projection = approvedProjectionFixture();
const evidencePairDigest = `sha256:${'a'.repeat(64)}`;
let assertions = 0;
const check = (condition, message) => { assert.ok(condition, message); assertions += 1; };

class SyntheticNonceLedger {
  #seen = new Set();
  async consume({issuer,keyId,nonce}) {
    const key = `${issuer}\u0000${keyId}\u0000${nonce}`;
    if (this.#seen.has(key)) return false;
    this.#seen.add(key);
    return true;
  }
}

class FailingNonceLedger {
  async consume() { throw new Error('synthetic durable store outage'); }
}

function unsignedCapability(overrides = {}) {
  return {
    record_type: 'kidults_server_projection_capability',
    contract_version: '1.0.0',
    issuer: 'KIDULTS_PROJECTION_CONTROL_PLANE',
    environment: 'STAGING',
    key_id: 'synthetic-ed25519-key-v1',
    surface: 'PORTAL_RENDER',
    purpose: 'PUBLIC_DISPLAY',
    projection_id: projection.projection_id,
    projection_digest: canonicalProjectionDigest(projection),
    assessment_id: projection.lineage.assessment_id,
    evidence_pair_digest: evidencePairDigest,
    decision: 'ALLOW',
    issued_at: '2026-08-24T10:00:00Z',
    not_before: '2026-08-24T10:00:00Z',
    expires_at: '2026-08-24T10:10:00Z',
    nonce: `synthetic-${crypto.randomUUID()}`,
    max_uses: 1,
    release_ref: 'refs/heads/synthetic-staging-proof',
    workload_ref: 'synthetic-approved-projection-v1',
    revocation_epoch: 7,
    rollback_generation: 3,
    ...overrides
  };
}

function signCapability(overrides = {}, signingKey = privateKey) {
  const capability = unsignedCapability(overrides);
  capability.signature = {
    algorithm: 'Ed25519',
    value: crypto.sign(null, capabilitySigningBytes(capability), signingKey).toString('base64')
  };
  return capability;
}

function trustedContext(overrides = {}) {
  return {
    issuer: 'KIDULTS_PROJECTION_CONTROL_PLANE',
    environment: 'STAGING',
    surface: 'PORTAL_RENDER',
    purpose: 'PUBLIC_DISPLAY',
    releaseRef: 'refs/heads/synthetic-staging-proof',
    workloadRef: 'synthetic-approved-projection-v1',
    evidencePairDigest,
    trustedNow: new Date('2026-08-24T10:05:00Z'),
    clockAuthority: 'KIDULTS_CONTROL_PLANE',
    minimumRevocationEpoch: 7,
    minimumRollbackGeneration: 3,
    publicKeys: {'synthetic-ed25519-key-v1': publicKey},
    nonceLedger: new SyntheticNonceLedger(),
    ...overrides
  };
}

async function verify(capability, context = trustedContext(), candidateProjection = projection) {
  return verifyServerProjectionCapability({projection:candidateProjection,capability,trustedContext:context});
}

check(serverProjectionCapabilityContract.server_only_module === true, 'capability module must remain server-only');
check(serverProjectionCapabilityContract.browser_asset === false, 'capability must not be a browser asset');
check(serverProjectionCapabilityContract.route_binding === 'NOT_IMPLEMENTED_HOLD', 'route must remain fail-closed');
check(serverProjectionCapabilityContract.payload_exposure === 'NONE', 'validator must expose no payload');

const positiveCapability = signCapability();
const positive = await verify(positiveCapability);
check(positive.verified === true, 'valid synthetic Ed25519 capability must verify');
check(positive.release_state === 'CRYPTOGRAPHIC_CORE_VERIFIED_ROUTE_NOT_BOUND_HOLD', 'verification cannot self-bind a route');
check(positive.payload === null && positive.receipt.payload_exposed === false, 'verification must expose no payload');
check(positive.receipt.signature_verified === true && positive.receipt.nonce_consumed === true, 'signature and nonce must be receipt-bound');
check(positive.receipt.production === 'HOLD' && positive.receipt.public === 'HOLD', 'verification cannot promote release');

const replayLedger = new SyntheticNonceLedger();
const replayContext = trustedContext({nonceLedger:replayLedger});
const replayCapability = signCapability();
const firstUse = await verify(replayCapability,replayContext);
const secondUse = await verify(replayCapability,replayContext);
check(firstUse.verified === true && secondUse.verified === false, 'second nonce use must fail');
check(secondUse.receipt.errors.includes('CAPABILITY_NONCE_REPLAYED'), 'nonce replay reason must be explicit');

const mutations = [
  ['TAMPERED_SIGNATURE','CAPABILITY_SIGNATURE_INVALID',capability=>{capability.projection_id='tampered-after-signing';},{}],
  ['WRONG_KEY','CAPABILITY_SIGNATURE_INVALID',capability=>{}, {publicKeys:{'synthetic-ed25519-key-v1':wrongPublicKey}}],
  ['UNKNOWN_KEY','TRUSTED_PUBLIC_KEY_NOT_FOUND',capability=>{capability.key_id='unknown-key';},{}],
  ['EXPIRED','CAPABILITY_EXPIRED',capability=>{}, {trustedNow:new Date('2026-08-24T10:10:00Z')}],
  ['NOT_YET_VALID','CAPABILITY_NOT_YET_VALID',capability=>{}, {trustedNow:new Date('2026-08-24T09:59:59Z')}],
  ['WRONG_ENVIRONMENT','ENVIRONMENT_MISMATCH',capability=>{}, {environment:'PRODUCTION'}],
  ['WRONG_SURFACE','SURFACE_MISMATCH',capability=>{}, {surface:'EXPORT'}],
  ['WRONG_PURPOSE','PURPOSE_MISMATCH',capability=>{}, {purpose:'API_REDISTRIBUTION'}],
  ['WRONG_ISSUER','ISSUER_MISMATCH',capability=>{}, {issuer:'UNTRUSTED_ISSUER'}],
  ['WRONG_RELEASE_REF','RELEASE_REF_MISMATCH',capability=>{}, {releaseRef:'refs/heads/other'}],
  ['WRONG_WORKLOAD','WORKLOAD_REF_MISMATCH',capability=>{}, {workloadRef:'other-workload'}],
  ['WRONG_EVIDENCE_PAIR','EVIDENCE_PAIR_DIGEST_MISMATCH',capability=>{}, {evidencePairDigest:`sha256:${'b'.repeat(64)}`}],
  ['REVOKED_EPOCH','CAPABILITY_REVOKED',capability=>{}, {minimumRevocationEpoch:8}],
  ['ROLLBACK_GENERATION','CAPABILITY_ROLLBACK_REJECTED',capability=>{}, {minimumRollbackGeneration:4}],
  ['UNTRUSTED_CLOCK','TRUSTED_CLOCK_REQUIRED',capability=>{}, {clockAuthority:'CALLER'}],
  ['MISSING_NONCE_LEDGER','DURABLE_NONCE_LEDGER_REQUIRED',capability=>{}, {nonceLedger:null}],
  ['NONCE_LEDGER_OUTAGE','CAPABILITY_NONCE_LEDGER_ERROR',capability=>{}, {nonceLedger:new FailingNonceLedger()}],
  ['WRONG_KEY_TYPE','TRUSTED_PUBLIC_KEY_TYPE_INVALID',capability=>{}, {publicKeys:{'synthetic-ed25519-key-v1':wrongTypePublicKey}}],
  ['PROTOTYPE_KEY_ID','TRUSTED_PUBLIC_KEY_NOT_FOUND',capability=>{capability.key_id='__proto__';}, {publicKeys:{}}],
  ['INVALID_BASE64','CAPABILITY_SIGNATURE_ENCODING_INVALID',capability=>{capability.signature.value='!'.repeat(88);},{}],
  ['EXCESSIVE_LIFETIME','CAPABILITY_LIFETIME_EXCEEDED',capability=>{}, {trustedNow:new Date('2026-08-24T10:05:00Z')}],
  ['NON_CANONICAL_TIME','CAPABILITY_TIME_INVALID:issued_at',capability=>{capability.issued_at='2026-08-24 10:00:00Z';},{}],
  ['DENY_DECISION','CAPABILITY_DECISION_NOT_ALLOW',capability=>{capability.decision='DENY';},{}],
  ['MULTI_USE','CAPABILITY_MAX_USES_INVALID',capability=>{capability.max_uses=2;},{}],
  ['EXTRA_FIELD','CAPABILITY_FIELDS_INVALID',capability=>{capability.caller_override=true;},{}]
];

mutations.find(([name])=>name === 'EXCESSIVE_LIFETIME')[2] = capability=>{
  capability.expires_at='2026-08-24T10:16:00Z';
};

for (const [name,expected,mutate,contextOverrides] of mutations) {
  const capability = signCapability();
  mutate(capability);
  const result = await verify(capability,trustedContext(contextOverrides));
  check(result.verified === false, `${name} must fail closed`);
  check(result.receipt.errors.includes(expected), `${name} must record ${expected}`);
  check(result.payload === null && result.receipt.payload_exposed === false, `${name} must expose no payload`);
}

const digestMismatchProjection = clone(projection);
digestMismatchProjection.payload.collector_lens.liquidity.value = 999;
const digestMismatch = await verify(signCapability(),trustedContext(),digestMismatchProjection);
check(digestMismatch.verified === false && digestMismatch.receipt.errors.includes('PROJECTION_DIGEST_MISMATCH'),'projection tamper must fail exact digest');

const assessmentMismatchProjection = clone(projection);
assessmentMismatchProjection.lineage.assessment_id = 'assessment-rebound';
const assessmentMismatch = await verify(signCapability(),trustedContext(),assessmentMismatchProjection);
check(assessmentMismatch.verified === false && assessmentMismatch.receipt.errors.includes('ASSESSMENT_ID_MISMATCH'),'assessment rebound must fail');

const apiCapability = signCapability({surface:'PUBLIC_API_RESPONSE',purpose:'API_REDISTRIBUTION'});
const apiContext = trustedContext({surface:'PUBLIC_API_RESPONSE',purpose:'API_REDISTRIBUTION'});
const apiResult = await verify(apiCapability,apiContext);
check(apiResult.verified === true && apiResult.payload === null,'API cryptographic core may verify but route/payload remain HOLD');

console.log(JSON.stringify({
  suite:'KIDULTS_SERVER_PROJECTION_CAPABILITY_V1',
  result:'PASS',
  assertions,
  algorithm:'Ed25519',
  negative_mutations:mutations.length + 2,
  signature_binding:'VERIFIED',
  exact_projection_digest:'VERIFIED',
  assessment_evidence_pair_binding:'VERIFIED',
  trusted_time:'VERIFIED',
  nonce_replay:'REJECTED',
  revocation_rollback:'REJECTED_WHEN_STALE',
  cross_environment_surface_purpose:'REJECTED',
  route_binding:'NOT_IMPLEMENTED_HOLD',
  payload_exposed:false,
  live_capability_issued:false,
  remote_staging_executed:false,
  empirical_gate_effect:'NONE',
  candidate_evidence:'NONE',
  track_b:'NOT_STARTED',
  production:'HOLD',
  public:'HOLD',
  g5:'EXPLICIT_APPROVAL_REQUIRED'
},null,2));
