#!/usr/bin/env node
import fs from 'node:fs';
import process from 'node:process';
import {createHash, createPublicKey, verify as verifySignature} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const CONTRACT_PATH = 'coordination/kidults/governance/portal-physical-mobile-screen-reader-acceptance-contract-v1.json';
const RECEIPT_PATH = 'coordination/kidults/portal/portal-physical-mobile-screen-reader-acceptance-receipt-v1.json';
const DOMAIN = 'KIDULTS.PORTAL.PHYSICAL-MOBILE.VOICEOVER-ACCEPTANCE.V1';
const SHA_RE = /^[0-9a-f]{40}$/;
const HASH_RE = /^sha256:[0-9a-f]{64}$/;
const ID_RE = /^[a-z0-9][a-z0-9._:-]{15,127}$/;
const NONCE_RE = /^[0-9a-f]{32,128}$/;
const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;
const EVIDENCE_URI_RE = /^(?:https:\/\/|artifact:\/\/|github-actions:\/\/)/;
const MAX_RECEIPT_LIFETIME_MS = 86_400_000;

// Authority-controlled verifier provisioning is deliberately out of scope for
// this packet. Contract or receipt data can never inject these trust roots.
const VALIDATOR_PINNED_VERIFIER_ROOTS = Object.freeze({
  physical_mobile: null,
  screen_reader: null,
});

const ATTESTATION_KEYS = Object.freeze([
  'signed', 'signer_id', 'signed_at', 'statement', 'algorithm', 'verifier_key_id',
  'attestation_id', 'payload_digest', 'payload_base64url', 'signature_base64url', 'verification_state',
]);
const CYCLE_COUNT_FIELDS = Object.freeze([
  'completed', 'navigation_pass', 'background_foreground_pass', 'history_traversal_pass',
  'menu_restoration_pass', 'focus_restoration_pass', 'scroll_restoration_pass',
]);
const ZERO_COUNT_FIELDS = Object.freeze([
  'stale_value_leak_count', 'runtime_error_count', 'crash_count', 'failed_cycle_count',
]);
const HISTORY_KEYS = Object.freeze([
  'cycle', 'navigation_type', 'same_origin_second_document', 'synthetic_dispatch_used',
  'pagehide_is_trusted', 'pageshow_is_trusted', 'pagehide_persisted', 'pageshow_persisted',
  'document_identity_preserved', 'immediate_containment_pass', 'settled_containment_pass',
  'claimed_outcome',
]);
const READER_CHECKS = Object.freeze([
  'landmarks', 'name_role_value', 'focus_order', 'focus_restoration',
  'menu_announcement', 'status_announcement', 'error_announcement',
]);
const REPLAY_REGISTRY_KEYS = Object.freeze([
  'status', 'generated_at', 'snapshot_digest', 'seen_receipt_instance_ids', 'seen_receipt_nonces',
  'seen_attestation_ids', 'seen_payload_digests', 'seen_device_session_ids',
]);

const present = (value) => typeof value === 'string' && value.trim().length > 0;
const validIso = (value) => present(value) && Number.isFinite(Date.parse(value));
const sha256 = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;

export function stableCanonicalize(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) throw new TypeError('CANONICAL_NUMBER_MUST_BE_SAFE_INTEGER');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(stableCanonicalize).join(',')}]`;
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableCanonicalize(value[key])}`).join(',')}}`;
  }
  throw new TypeError('CANONICAL_VALUE_UNSUPPORTED');
}

function exactKeys(value, expected, errors, prefix) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    errors.push(`${prefix}.object_required`);
    return false;
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    errors.push(`${prefix}.exact_schema`);
    return false;
  }
  return true;
}

function decodeBase64url(value, expectedLength = null) {
  if (!present(value) || !BASE64URL_RE.test(value) || value.includes('=')) throw new Error('NON_CANONICAL_BASE64URL');
  const decoded = Buffer.from(value, 'base64url');
  if (decoded.length > 65_536 || decoded.toString('base64url') !== value) throw new Error('NON_CANONICAL_BASE64URL');
  if (expectedLength !== null && decoded.length !== expectedLength) throw new Error('BASE64URL_LENGTH');
  return decoded;
}

function withoutAttestation(value) {
  if (!value || typeof value !== 'object') return value;
  const {attestation: _omitted, ...rest} = value;
  return rest;
}

export function canonicalAttestationPayload(receipt, scope) {
  if (!['physical_mobile', 'screen_reader'].includes(scope)) throw new TypeError('INVALID_ATTESTATION_SCOPE');
  const mobile = receipt?.physical_mobile_receipt;
  const reader = receipt?.screen_reader_receipt;
  const node = scope === 'physical_mobile' ? mobile : reader;
  const payload = {
    schema: 'kidults.portal.physical-mobile.voiceover-acceptance',
    version: 1,
    scope,
    contract_id: receipt?.contract_id,
    receipt_id: receipt?.id,
    receipt_version: receipt?.receipt_version,
    replay_protection: receipt?.replay_protection,
    source_binding: receipt?.source_binding,
    attester: {
      signer_id: node?.attestation?.signer_id,
      signed_at: node?.attestation?.signed_at,
      statement: node?.attestation?.statement,
      algorithm: node?.attestation?.algorithm,
      verifier_key_id: node?.attestation?.verifier_key_id,
      attestation_id: node?.attestation?.attestation_id,
    },
    authority_boundary: {promotion_authority: 'NONE', public: 'HOLD', production: 'HOLD', g5: 'HOLD'},
  };
  if (scope === 'physical_mobile') payload.physical_mobile_receipt = withoutAttestation(mobile);
  else {
    payload.physical_device_binding = {
      session_id: mobile?.session_id,
      physical_device: mobile?.physical_device,
      simulator: mobile?.simulator,
      automation_only: mobile?.automation_only,
      device_model: mobile?.device_model,
      ios_version: mobile?.ios_version,
      browser: mobile?.browser,
      browser_version: mobile?.browser_version,
    };
    payload.screen_reader_receipt = withoutAttestation(reader);
  }
  return stableCanonicalize(payload);
}

export function verifyAttestationAgainstPinnedVerifier(receipt, scope, pinnedVerifier) {
  const attestation = scope === 'physical_mobile'
    ? receipt?.physical_mobile_receipt?.attestation
    : receipt?.screen_reader_receipt?.attestation;
  try {
    if (!['physical_mobile', 'screen_reader'].includes(scope)) throw new Error('INVALID_ATTESTATION_SCOPE');
    if (pinnedVerifier?.status !== 'PROVISIONED'
      || pinnedVerifier?.verification_method !== 'ED25519_PINNED_PUBLIC_KEY'
      || pinnedVerifier?.algorithm !== 'Ed25519'
      || pinnedVerifier?.authority !== 'INDEPENDENT_ACCEPTANCE_VERIFIER'
      || pinnedVerifier?.environment !== 'GOVERNED_STAGING'
      || pinnedVerifier?.key_purpose !== 'PORTAL_PHYSICAL_ACCEPTANCE_VERIFICATION'
      || pinnedVerifier?.revoked !== false) throw new Error('VERIFIER_POLICY');
    if (!ID_RE.test(pinnedVerifier?.key_id || '') || pinnedVerifier.key_id !== attestation?.verifier_key_id) throw new Error('PINNED_KEY_ID');
    if (!validIso(pinnedVerifier?.provisioned_at) || !present(pinnedVerifier?.provisioned_by)
      || !HASH_RE.test(pinnedVerifier?.provisioning_receipt_digest || '')) throw new Error('PROVISIONING_RECEIPT');
    const rawKey = decodeBase64url(pinnedVerifier?.public_key_raw_base64url, 32);
    if (sha256(rawKey) !== pinnedVerifier?.public_key_sha256) throw new Error('PIN_FINGERPRINT_MISMATCH');
    const publicKey = createPublicKey({key: {kty: 'OKP', crv: 'Ed25519', x: rawKey.toString('base64url')}, format: 'jwk'});
    const payload = decodeBase64url(attestation?.payload_base64url);
    const signature = decodeBase64url(attestation?.signature_base64url, 64);
    if (sha256(payload) !== attestation?.payload_digest) throw new Error('PAYLOAD_DIGEST_MISMATCH');
    if (!verifySignature(null, Buffer.concat([Buffer.from(`${DOMAIN}\n`, 'ascii'), payload]), publicKey, signature)) {
      throw new Error('SIGNATURE_INVALID');
    }
    const payloadText = payload.toString('utf8');
    if (stableCanonicalize(JSON.parse(payloadText)) !== payloadText) throw new Error('PAYLOAD_NOT_CANONICAL');
    if (payloadText !== canonicalAttestationPayload(receipt, scope)) throw new Error('PAYLOAD_SUBJECT_MISMATCH');
    return Object.freeze({verified: true, finding: null});
  } catch (error) {
    return Object.freeze({verified: false, finding: error?.message || 'FAIL'});
  }
}

function checkContract(contract, errors) {
  if (contract?.id !== 'portal-physical-mobile-screen-reader-acceptance-contract-v1'
    || contract?.version !== '1.2.0' || contract?.status !== 'ACTIVE_FAIL_CLOSED') errors.push('contract.identity');
  if (contract?.source_binding?.live_protected_main_readback_required !== true
    || contract?.source_binding?.governed_staging_deployment_readback_required !== true
    || contract?.source_binding?.exact_sha_equality_required !== true
    || contract?.source_binding?.hashed_read_only_parity_evidence_ref_required !== true) errors.push('contract.source_binding_policy');
  if (contract?.replay_protection?.independent_read_only_replay_registry_required !== true
    || contract?.replay_protection?.maximum_receipt_lifetime_seconds !== 86400
    || contract?.replay_protection?.validator_mutates_registry !== false) errors.push('contract.replay_policy');
  if (contract?.receipts?.physical_mobile?.required_cycles !== 30
    || contract?.receipts?.physical_mobile?.history_classification?.validator_derives_outcome_from_raw_fields !== true
    || contract?.receipts?.physical_mobile?.simulator_or_emulation_eligible !== false
    || contract?.receipts?.screen_reader?.technology !== 'VoiceOver'
    || contract?.receipts?.screen_reader?.human_operated_required !== true) errors.push('contract.physical_policy');
  if (contract?.signed_payload?.domain !== DOMAIN
    || contract?.signed_payload?.canonicalization !== 'KIDULTS_SORTED_JSON_V1'
    || contract?.signed_payload?.signature_algorithm !== 'Ed25519'
    || contract?.signed_payload?.document_or_environment_supplied_verifier_key_allowed !== false
    || contract?.signed_payload?.independent_validator_pin_required !== true
    || contract?.signed_payload?.verifier_key_absent_result !== 'HOLD') errors.push('contract.signature_policy');
  if (contract?.authority?.promotion_authority !== 'NONE' || contract?.authority?.public !== 'HOLD'
    || contract?.authority?.production !== 'HOLD' || contract?.authority?.g5 !== 'HOLD') errors.push('contract.authority_boundary');
}

function checkPendingAttestation(attestation, errors, prefix) {
  exactKeys(attestation, ATTESTATION_KEYS, errors, `${prefix}.attestation`);
  const expected = {
    signed: false, signer_id: null, signed_at: null, statement: null, algorithm: null,
    verifier_key_id: null, attestation_id: null, payload_digest: null,
    payload_base64url: null, signature_base64url: null,
    verification_state: 'HOLD_VERIFIER_NOT_PROVISIONED',
  };
  for (const [field, value] of Object.entries(expected)) if (attestation?.[field] !== value) errors.push(`${prefix}.attestation.${field}`);
}

function checkPending(receipt, errors) {
  const replay = receipt?.replay_protection;
  for (const field of ['receipt_instance_id', 'receipt_nonce', 'issued_at', 'expires_at', 'replay_registry_digest']) {
    if (replay?.[field] !== null) errors.push(`pending.replay.${field}`);
  }
  if (replay?.registry_check !== 'HOLD_NOT_EXECUTED') errors.push('pending.replay.registry_check');
  const binding = receipt?.source_binding;
  for (const field of ['current_main_sha', 'governed_staging_source_sha', 'governed_staging_deployment_id', 'governed_staging_url', 'parity_evidence_ref']) {
    if (binding?.[field] !== null) errors.push(`pending.source.${field}`);
  }
  if (binding?.current_main_parity !== 'HOLD_NOT_EXECUTED') errors.push('pending.source.current_main_parity');
  const mobile = receipt?.physical_mobile_receipt;
  if (mobile?.state !== 'HOLD_PENDING_PHYSICAL_DEVICE' || mobile?.executed !== false
    || mobile?.physical_device !== false || mobile?.human_reviewer !== false) errors.push('pending.mobile.execution');
  if (mobile?.evidence_class !== null || mobile?.session_id !== null || !Array.isArray(mobile?.history_cycles)
    || mobile.history_cycles.length !== 0 || !Array.isArray(mobile?.evidence_refs) || mobile.evidence_refs.length !== 0) errors.push('pending.mobile.evidence');
  if (mobile?.cycles?.required !== 30) errors.push('pending.mobile.required_cycles');
  for (const field of [...CYCLE_COUNT_FIELDS, ...ZERO_COUNT_FIELDS]) if (mobile?.cycles?.[field] !== 0) errors.push(`pending.mobile.cycles.${field}`);
  checkPendingAttestation(mobile?.attestation, errors, 'pending.mobile');
  const reader = receipt?.screen_reader_receipt;
  if (reader?.state !== 'HOLD_PENDING_HUMAN_REVIEW' || reader?.executed !== false
    || reader?.enabled !== false || reader?.human_operated !== false) errors.push('pending.reader.execution');
  if (reader?.evidence_class !== null || reader?.session_id !== null || reader?.device_session_id !== null
    || !Array.isArray(reader?.evidence_refs) || reader.evidence_refs.length !== 0) errors.push('pending.reader.evidence');
  for (const field of READER_CHECKS) if (reader?.checks?.[field] !== 'NOT_EXECUTED') errors.push(`pending.reader.checks.${field}`);
  checkPendingAttestation(reader?.attestation, errors, 'pending.reader');
  if (receipt?.decision?.physical_iphone_mobile_safari !== 'HOLD_PENDING_PHYSICAL_DEVICE'
    || receipt?.decision?.voiceover_screen_reader !== 'HOLD_PENDING_HUMAN_REVIEW'
    || receipt?.decision?.combined_acceptance !== 'HOLD'
    || receipt?.decision?.promotion_authority !== 'NONE'
    || receipt?.decision?.public !== 'HOLD' || receipt?.decision?.production !== 'HOLD'
    || receipt?.decision?.g5 !== 'HOLD') errors.push('pending.decision');
}

function checkEvidenceRefs(refs, minimum, sessionId, errors, prefix) {
  if (!Array.isArray(refs) || refs.length < minimum) {
    errors.push(`${prefix}.evidence_refs_min_${minimum}`);
    return;
  }
  const uris = new Set();
  const digests = new Set();
  const kinds = new Set();
  for (const [index, ref] of refs.entries()) {
    exactKeys(ref, ['kind', 'uri', 'digest', 'bytes', 'media_type', 'captured_at', 'session_id'], errors, `${prefix}.evidence_refs[${index}]`);
    if (!present(ref?.kind) || kinds.has(ref.kind)) errors.push(`${prefix}.evidence_refs[${index}].kind`);
    if (!EVIDENCE_URI_RE.test(ref?.uri || '') || uris.has(ref.uri)) errors.push(`${prefix}.evidence_refs[${index}].uri`);
    if (!HASH_RE.test(ref?.digest || '') || digests.has(ref.digest)) errors.push(`${prefix}.evidence_refs[${index}].digest`);
    if (!Number.isSafeInteger(ref?.bytes) || ref.bytes <= 0) errors.push(`${prefix}.evidence_refs[${index}].bytes`);
    if (!present(ref?.media_type) || !validIso(ref?.captured_at) || ref?.session_id !== sessionId) errors.push(`${prefix}.evidence_refs[${index}].binding`);
    kinds.add(ref?.kind); uris.add(ref?.uri); digests.add(ref?.digest);
  }
}

function checkHistoryCycles(records, errors) {
  if (!Array.isArray(records) || records.length !== 30) {
    errors.push('mobile.history_cycles.count_30');
    return;
  }
  for (const [index, record] of records.entries()) {
    const prefix = `mobile.history_cycles[${index}]`;
    exactKeys(record, HISTORY_KEYS, errors, prefix);
    if (record?.cycle !== index + 1) errors.push(`${prefix}.cycle_sequence`);
    if (record?.navigation_type !== 'back_forward' || record?.same_origin_second_document !== true
      || record?.synthetic_dispatch_used !== false || record?.pagehide_is_trusted !== true
      || record?.pageshow_is_trusted !== true || record?.immediate_containment_pass !== true
      || record?.settled_containment_pass !== true) errors.push(`${prefix}.trusted_lifecycle`);
    let derived = 'INVALID_OR_AMBIGUOUS';
    if (record?.pagehide_persisted === true && record?.pageshow_persisted === true
      && record?.document_identity_preserved === true) derived = 'BFCACHE_RESTORED';
    else if (record?.pagehide_persisted === false && record?.pageshow_persisted === false
      && record?.document_identity_preserved === false) derived = 'HISTORY_RELOAD_NO_BFCACHE';
    if (record?.claimed_outcome !== derived || derived === 'INVALID_OR_AMBIGUOUS') errors.push(`${prefix}.truthful_classification`);
  }
}

function registrySnapshotDigest(registry) {
  const {snapshot_digest: _omitted, ...body} = registry;
  return sha256(stableCanonicalize(body));
}

function checkReplay(receipt, registry, evaluationTime, errors) {
  const replay = receipt?.replay_protection;
  if (!ID_RE.test(replay?.receipt_instance_id || '') || !NONCE_RE.test(replay?.receipt_nonce || '')) errors.push('replay.identity');
  if (!validIso(replay?.issued_at) || !validIso(replay?.expires_at)) errors.push('replay.timestamps');
  const issued = Date.parse(replay?.issued_at);
  const expires = Date.parse(replay?.expires_at);
  const evaluated = Date.parse(evaluationTime);
  if (!validIso(evaluationTime) || !Number.isFinite(issued) || !Number.isFinite(expires)
    || expires <= issued || expires - issued > MAX_RECEIPT_LIFETIME_MS || evaluated < issued || evaluated > expires) errors.push('replay.expired_or_not_yet_valid');
  if (!registry) {
    errors.push('replay.registry_missing');
    return;
  }
  exactKeys(registry, REPLAY_REGISTRY_KEYS, errors, 'replay.registry');
  if (registry?.status !== 'PROVISIONED_READ_ONLY' || !validIso(registry?.generated_at)
    || !HASH_RE.test(registry?.snapshot_digest || '') || registrySnapshotDigest(registry) !== registry?.snapshot_digest) errors.push('replay.registry_integrity');
  for (const field of ['seen_receipt_instance_ids', 'seen_receipt_nonces', 'seen_attestation_ids', 'seen_payload_digests', 'seen_device_session_ids']) {
    if (!Array.isArray(registry?.[field])) errors.push(`replay.registry.${field}`);
  }
  const mobileAttestation = receipt?.physical_mobile_receipt?.attestation;
  const readerAttestation = receipt?.screen_reader_receipt?.attestation;
  const probes = [
    ['seen_receipt_instance_ids', replay?.receipt_instance_id],
    ['seen_receipt_nonces', replay?.receipt_nonce],
    ['seen_attestation_ids', mobileAttestation?.attestation_id],
    ['seen_attestation_ids', readerAttestation?.attestation_id],
    ['seen_payload_digests', mobileAttestation?.payload_digest],
    ['seen_payload_digests', readerAttestation?.payload_digest],
    ['seen_device_session_ids', receipt?.physical_mobile_receipt?.session_id],
  ];
  for (const [field, value] of probes) if (registry?.[field]?.includes(value)) errors.push(`replay.detected.${field}`);
  if (replay?.replay_registry_digest !== registry?.snapshot_digest || replay?.registry_check !== 'VERIFIED_UNSEEN') errors.push('replay.receipt_registry_binding');
  if (mobileAttestation?.attestation_id === readerAttestation?.attestation_id) errors.push('replay.cross_scope_attestation_id_reuse');
}

function checkSourceBinding(binding, expectedCurrentMainSha, errors) {
  if (!SHA_RE.test(expectedCurrentMainSha || '')) errors.push('source.expected_live_main_sha_missing');
  if (!SHA_RE.test(binding?.current_main_sha || '') || binding?.current_main_sha !== expectedCurrentMainSha) errors.push('source.current_main_sha');
  if (!SHA_RE.test(binding?.governed_staging_source_sha || '')
    || binding?.governed_staging_source_sha !== binding?.current_main_sha) errors.push('source.exact_sha_mismatch');
  if (!present(binding?.governed_staging_deployment_id) || !/^https:\/\//.test(binding?.governed_staging_url || '')
    || binding?.current_main_parity !== 'VERIFIED_PASS') errors.push('source.deployment_binding');
  const ref = binding?.parity_evidence_ref;
  exactKeys(ref, ['kind', 'uri', 'digest', 'run_id', 'run_attempt', 'observed_at', 'read_only'], errors, 'source.parity_evidence_ref');
  if (ref?.kind !== 'GOVERNED_STAGING_READ_ONLY_PARITY_RECEIPT' || !EVIDENCE_URI_RE.test(ref?.uri || '')
    || !HASH_RE.test(ref?.digest || '') || !Number.isSafeInteger(ref?.run_id) || ref.run_id <= 0
    || !Number.isSafeInteger(ref?.run_attempt) || ref.run_attempt <= 0 || !validIso(ref?.observed_at)
    || ref?.read_only !== true) errors.push('source.parity_evidence_ref_invalid');
}

function checkAttestation(receipt, contract, scope, completedAt, reviewerId, errors) {
  const node = scope === 'physical_mobile' ? receipt?.physical_mobile_receipt : receipt?.screen_reader_receipt;
  const attestation = node?.attestation;
  const prefix = scope === 'physical_mobile' ? 'mobile' : 'reader';
  exactKeys(attestation, ATTESTATION_KEYS, errors, `${prefix}.attestation`);
  if (attestation?.signed !== true || attestation?.signer_id !== reviewerId || !validIso(attestation?.signed_at)
    || !present(attestation?.statement) || attestation?.algorithm !== 'Ed25519'
    || !ID_RE.test(attestation?.verifier_key_id || '') || !ID_RE.test(attestation?.attestation_id || '')
    || !HASH_RE.test(attestation?.payload_digest || '') || attestation?.verification_state !== 'MACHINE_VERIFICATION_REQUIRED') {
    errors.push(`${prefix}.attestation.identity`);
  }
  if (validIso(attestation?.signed_at) && validIso(completedAt) && Date.parse(attestation.signed_at) < Date.parse(completedAt)) {
    errors.push(`${prefix}.attestation.before_completion`);
  }
  const declared = contract?.attestation_verifiers?.[scope];
  const pinned = VALIDATOR_PINNED_VERIFIER_ROOTS[scope];
  if (declared?.status !== 'PROVISIONED') errors.push(`${prefix}.attestation.verifier_not_provisioned`);
  if (!pinned) errors.push(`${prefix}.attestation.independent_validator_root_not_provisioned`);
  if (declared?.status === 'PROVISIONED' && pinned) {
    if (stableCanonicalize(declared) !== stableCanonicalize(pinned)) errors.push(`${prefix}.attestation.contract_pin_mismatch`);
    else {
      const result = verifyAttestationAgainstPinnedVerifier(receipt, scope, pinned);
      if (!result.verified) errors.push(`${prefix}.attestation.crypto_${result.finding}`);
    }
  }
}

function checkComplete(receipt, contract, options, errors) {
  checkSourceBinding(receipt?.source_binding, options.expectedCurrentMainSha, errors);
  checkReplay(receipt, options.replayRegistry, options.evaluationTime, errors);
  const mobile = receipt?.physical_mobile_receipt;
  if (mobile?.state !== 'VERIFIED_PASS' || mobile?.evidence_class !== 'PHYSICAL_IPHONE_MOBILE_SAFARI_HUMAN_ACCEPTANCE'
    || mobile?.executed !== true || mobile?.physical_device !== true || mobile?.simulator !== false
    || mobile?.automation_only !== false || mobile?.browser !== 'MOBILE_SAFARI' || mobile?.human_reviewer !== true) errors.push('mobile.physical_execution');
  for (const field of ['session_id', 'device_model', 'ios_version', 'browser_version', 'reviewer_id']) if (!present(mobile?.[field])) errors.push(`mobile.${field}`);
  if (!validIso(mobile?.started_at) || !validIso(mobile?.completed_at) || Date.parse(mobile?.completed_at) < Date.parse(mobile?.started_at)) errors.push('mobile.timestamps');
  if (mobile?.cycles?.required !== 30) errors.push('mobile.cycles.required');
  for (const field of CYCLE_COUNT_FIELDS) if (mobile?.cycles?.[field] !== 30) errors.push(`mobile.cycles.${field}`);
  for (const field of ZERO_COUNT_FIELDS) if (mobile?.cycles?.[field] !== 0) errors.push(`mobile.cycles.${field}`);
  checkHistoryCycles(mobile?.history_cycles, errors);
  checkEvidenceRefs(mobile?.evidence_refs, 2, mobile?.session_id, errors, 'mobile');
  checkAttestation(receipt, contract, 'physical_mobile', mobile?.completed_at, mobile?.reviewer_id, errors);

  const reader = receipt?.screen_reader_receipt;
  if (reader?.state !== 'VERIFIED_PASS' || reader?.evidence_class !== 'PHYSICAL_IPHONE_VOICEOVER_HUMAN_ACCEPTANCE'
    || reader?.executed !== true || reader?.screen_reader !== 'VoiceOver' || reader?.enabled !== true
    || reader?.human_operated !== true || reader?.device_session_id !== mobile?.session_id) errors.push('reader.execution');
  if (!present(reader?.session_id) || !present(reader?.reviewer_id) || reader?.reviewer_id !== mobile?.reviewer_id) errors.push('reader.session_or_reviewer_binding');
  if (!validIso(reader?.started_at) || !validIso(reader?.completed_at) || Date.parse(reader?.completed_at) < Date.parse(reader?.started_at)) errors.push('reader.timestamps');
  for (const field of READER_CHECKS) if (reader?.checks?.[field] !== 'PASS') errors.push(`reader.checks.${field}`);
  checkEvidenceRefs(reader?.evidence_refs, 2, reader?.session_id, errors, 'reader');
  checkAttestation(receipt, contract, 'screen_reader', reader?.completed_at, reader?.reviewer_id, errors);

  if (receipt?.decision?.physical_iphone_mobile_safari !== 'VERIFIED_PASS'
    || receipt?.decision?.voiceover_screen_reader !== 'VERIFIED_PASS'
    || receipt?.decision?.combined_acceptance !== 'VERIFIED_PASS') errors.push('decision.acceptance_binding');
  if (receipt?.decision?.promotion_authority !== 'NONE' || receipt?.decision?.public !== 'HOLD'
    || receipt?.decision?.production !== 'HOLD' || receipt?.decision?.g5 !== 'HOLD') errors.push('decision.authority_boundary');
}

export function assessAcceptanceBundle(receipt, contract, options = {}) {
  const errors = [];
  checkContract(contract, errors);
  if (receipt?.id !== 'portal-physical-mobile-screen-reader-acceptance-receipt-v1'
    || receipt?.receipt_version !== '1.2.0' || receipt?.contract_id !== contract?.id) errors.push('receipt.identity');
  const pending = receipt?.physical_mobile_receipt?.state === 'HOLD_PENDING_PHYSICAL_DEVICE'
    && receipt?.screen_reader_receipt?.state === 'HOLD_PENDING_HUMAN_REVIEW';
  if (pending) checkPending(receipt, errors);
  else checkComplete(receipt, contract, options, errors);
  return Object.freeze({
    contractState: errors.length ? 'VERIFIED_FAIL' : 'VERIFIED_PASS',
    acceptance: pending ? 'HOLD' : (errors.length ? 'HOLD' : 'VERIFIED_PASS'),
    physicalMobileAcceptance: pending ? 'HOLD_PENDING_PHYSICAL_DEVICE' : (errors.length ? 'HOLD' : 'VERIFIED_PASS'),
    screenReaderAcceptance: pending ? 'HOLD_PENDING_HUMAN_REVIEW' : (errors.length ? 'HOLD' : 'VERIFIED_PASS'),
    parity: pending ? 'RED_NOT_EXECUTED' : (errors.some((value) => value.startsWith('source.')) ? 'RED' : 'VERIFIED_PASS'),
    replayProtection: pending ? 'HOLD_NOT_EXECUTED' : (errors.some((value) => value.startsWith('replay.')) ? 'HOLD' : 'VERIFIED_UNSEEN'),
    verifierRoots: Object.freeze({physical_mobile: 'NOT_PROVISIONED', screen_reader: 'NOT_PROVISIONED'}),
    findings: Object.freeze(errors),
    promotionAuthority: 'NONE', public: 'HOLD', production: 'HOLD', g5: 'HOLD',
  });
}

function readJson(path) { return JSON.parse(fs.readFileSync(path, 'utf8')); }
function cliValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const receiptPath = cliValue('--receipt') || RECEIPT_PATH;
  const replayRegistryPath = cliValue('--replay-registry');
  const options = {
    expectedCurrentMainSha: cliValue('--expected-current-main-sha'),
    evaluationTime: cliValue('--evaluation-time'),
    replayRegistry: replayRegistryPath ? readJson(replayRegistryPath) : null,
  };
  const result = assessAcceptanceBundle(readJson(receiptPath), readJson(CONTRACT_PATH), options);
  console.log(JSON.stringify({
    receipt: receiptPath,
    expectedCurrentMainSha: options.expectedCurrentMainSha,
    evaluationTime: options.evaluationTime,
    replayRegistrySupplied: Boolean(options.replayRegistry),
    ...result,
  }, null, 2));
  if (result.contractState !== 'VERIFIED_PASS' || (process.argv.includes('--require-pass') && result.acceptance !== 'VERIFIED_PASS')) process.exitCode = 1;
}
