#!/usr/bin/env node
import fs from 'node:fs';
import process from 'node:process';
import {createHash, createPublicKey, verify as verifySignature} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const CONTRACT_PATH = 'coordination/kidults/governance/portal-physical-mobile-screen-reader-acceptance-contract-v1.json';
const RECEIPT_PATH = 'coordination/kidults/portal/portal-physical-mobile-screen-reader-acceptance-receipt-v1.json';
const SHA_RE = /^[0-9a-f]{40}$/i;
const HASH_RE = /^sha256:[0-9a-f]{64}$/i;
const ATTESTATION_ID_RE = /^[0-9a-f]{32}$/;
const KEY_ID_RE = /^[a-z0-9][a-z0-9._-]{7,63}$/;
const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;
const DOMAIN = 'KIDULTS.PORTAL.PHYSICAL-MOBILE.VOICEOVER-ACCEPTANCE.V1';
// Deliberately empty until an independently provisioned trust-root change pins
// exact verifier keys here. A contract or receipt cannot inject these roots.
const VALIDATOR_PINNED_VERIFIER_ROOTS = Object.freeze({
  physical_mobile: null,
  screen_reader: null,
});
const ATTESTATION_KEYS = Object.freeze([
  'signed', 'signer_id', 'signed_at', 'statement', 'algorithm', 'verifier_key_id',
  'attestation_id', 'payload_digest', 'payload_base64url', 'signature_base64url', 'verification_state',
]);
const REQUIRED_SCREEN_READER_CHECKS = Object.freeze([
  'landmarks', 'name_role_value', 'focus_order', 'focus_restoration',
  'menu_announcement', 'status_announcement', 'error_announcement',
]);
const MOBILE_COUNT_FIELDS = Object.freeze([
  'completed', 'navigation_pass', 'background_foreground_pass', 'history_traversal_pass',
  'bfcache_or_reload_containment_pass', 'menu_restoration_pass', 'focus_restoration_pass',
  'scroll_restoration_pass',
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

function withoutAttestation(value) {
  if (!value || typeof value !== 'object') return value;
  const {attestation: _omitted, ...rest} = value;
  return rest;
}

export function canonicalAttestationPayload(receipt, scope) {
  if (!['physical_mobile', 'screen_reader'].includes(scope)) throw new TypeError('INVALID_ATTESTATION_SCOPE');
  const mobile = receipt?.physical_mobile_receipt;
  const reader = receipt?.screen_reader_receipt;
  const attestation = scope === 'physical_mobile' ? mobile?.attestation : reader?.attestation;
  const payload = {
    schema: 'kidults.portal.physical-mobile.voiceover-acceptance',
    version: 1,
    scope,
    contract_id: receipt?.contract_id,
    receipt_id: receipt?.id,
    receipt_version: receipt?.receipt_version,
    source_binding: receipt?.source_binding,
    attester: {
      algorithm: attestation?.algorithm,
      verifier_key_id: attestation?.verifier_key_id,
      attestation_id: attestation?.attestation_id,
      signer_id: attestation?.signer_id,
      signed_at: attestation?.signed_at,
      statement: attestation?.statement,
    },
    authority_boundary: {promotion_authority: 'NONE', public: 'HOLD', production: 'HOLD', g5: 'HOLD'},
  };
  if (scope === 'physical_mobile') {
    payload.physical_mobile_receipt = withoutAttestation(mobile);
  } else {
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

function decodeBase64url(value, {expectedLength = null, maxLength = 65_536} = {}) {
  if (!present(value) || !BASE64URL_RE.test(value) || value.includes('=')) throw new Error('NON_CANONICAL_BASE64URL');
  const decoded = Buffer.from(value, 'base64url');
  if (decoded.length > maxLength || decoded.toString('base64url') !== value) throw new Error('NON_CANONICAL_BASE64URL');
  if (expectedLength !== null && decoded.length !== expectedLength) throw new Error('BASE64URL_LENGTH');
  return decoded;
}

function checkEvidenceRefs(refs, minimum, errors, prefix) {
  if (!Array.isArray(refs) || refs.length < minimum) {
    errors.push(`${prefix}.evidence_refs_min_${minimum}`);
    return;
  }
  refs.forEach((ref, index) => {
    if (!present(ref?.kind)) errors.push(`${prefix}.evidence_refs[${index}].kind`);
    if (!present(ref?.uri)) errors.push(`${prefix}.evidence_refs[${index}].uri`);
    if (!HASH_RE.test(ref?.digest || '')) errors.push(`${prefix}.evidence_refs[${index}].digest`);
  });
}

function checkSourceBinding(binding, errors) {
  if (!SHA_RE.test(binding?.current_main_sha || '')) errors.push('source_binding.current_main_sha');
  if (!SHA_RE.test(binding?.governed_staging_source_sha || '')) errors.push('source_binding.governed_staging_source_sha');
  if (binding?.current_main_sha !== binding?.governed_staging_source_sha) errors.push('source_binding.exact_sha_mismatch');
  if (!present(binding?.governed_staging_deployment_id)) errors.push('source_binding.governed_staging_deployment_id');
  if (!/^https:\/\//.test(binding?.governed_staging_url || '')) errors.push('source_binding.governed_staging_url_https');
  if (binding?.current_main_parity !== 'VERIFIED_PASS') errors.push('source_binding.current_main_parity');
}

function checkPendingAttestation(attestation, errors, prefix) {
  exactKeys(attestation, ATTESTATION_KEYS, errors, `${prefix}.attestation`);
  const expected = {
    signed: false, signer_id: null, signed_at: null, statement: null, algorithm: null,
    verifier_key_id: null, attestation_id: null, payload_digest: null,
    payload_base64url: null, signature_base64url: null,
    verification_state: 'HOLD_VERIFIER_NOT_PROVISIONED',
  };
  for (const [field, value] of Object.entries(expected)) {
    if (attestation?.[field] !== value) errors.push(`${prefix}.attestation.${field}`);
  }
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
    if (!KEY_ID_RE.test(pinnedVerifier?.key_id || '') || pinnedVerifier.key_id !== attestation?.verifier_key_id) {
      throw new Error('PINNED_KEY_ID');
    }
    if (!validIso(pinnedVerifier?.provisioned_at)
      || !present(pinnedVerifier?.provisioned_by)
      || !HASH_RE.test(pinnedVerifier?.provisioning_receipt_digest || '')) throw new Error('PROVISIONING_RECEIPT');
    const rawKey = decodeBase64url(pinnedVerifier?.public_key_raw_base64url, {expectedLength: 32, maxLength: 32});
    if (sha256(rawKey) !== pinnedVerifier?.public_key_sha256) throw new Error('PIN_FINGERPRINT_MISMATCH');
    const key = createPublicKey({key: {kty: 'OKP', crv: 'Ed25519', x: rawKey.toString('base64url')}, format: 'jwk'});
    if (key.asymmetricKeyType !== 'ed25519') throw new Error('PIN_KEY_TYPE');
    const payloadBytes = decodeBase64url(attestation?.payload_base64url, {maxLength: 65_536});
    const signature = decodeBase64url(attestation?.signature_base64url, {expectedLength: 64, maxLength: 64});
    if (sha256(payloadBytes) !== attestation?.payload_digest) throw new Error('PAYLOAD_DIGEST_MISMATCH');
    const signedBytes = Buffer.concat([Buffer.from(`${DOMAIN}\n`, 'ascii'), payloadBytes]);
    if (!verifySignature(null, signedBytes, key, signature)) throw new Error('SIGNATURE_INVALID');
    const payloadText = payloadBytes.toString('utf8');
    const parsed = JSON.parse(payloadText);
    if (stableCanonicalize(parsed) !== payloadText) throw new Error('PAYLOAD_NOT_CANONICAL');
    if (payloadText !== canonicalAttestationPayload(receipt, scope)) throw new Error('PAYLOAD_SUBJECT_MISMATCH');
    return Object.freeze({verified: true, finding: null});
  } catch (error) {
    return Object.freeze({verified: false, finding: error?.message || 'FAIL'});
  }
}

function checkCryptographicAttestation({receipt, contract, scope, attestation, completedAt, errors, prefix}) {
  exactKeys(attestation, ATTESTATION_KEYS, errors, `${prefix}.attestation`);
  if (attestation?.signed !== true) errors.push(`${prefix}.attestation.signed`);
  if (!present(attestation?.signer_id)) errors.push(`${prefix}.attestation.signer_id`);
  if (!validIso(attestation?.signed_at)) errors.push(`${prefix}.attestation.signed_at`);
  if (!present(attestation?.statement)) errors.push(`${prefix}.attestation.statement`);
  if (attestation?.algorithm !== 'Ed25519') errors.push(`${prefix}.attestation.algorithm`);
  if (!KEY_ID_RE.test(attestation?.verifier_key_id || '')) errors.push(`${prefix}.attestation.verifier_key_id`);
  if (!ATTESTATION_ID_RE.test(attestation?.attestation_id || '')) errors.push(`${prefix}.attestation.attestation_id`);
  if (!HASH_RE.test(attestation?.payload_digest || '')) errors.push(`${prefix}.attestation.payload_digest`);
  if (attestation?.verification_state !== 'MACHINE_VERIFICATION_REQUIRED') errors.push(`${prefix}.attestation.verification_state`);
  if (validIso(attestation?.signed_at) && validIso(completedAt) && Date.parse(attestation.signed_at) < Date.parse(completedAt)) {
    errors.push(`${prefix}.attestation.before_completion`);
  }

  const verifier = contract?.attestation_verifiers?.[scope];
  if (verifier?.status !== 'PROVISIONED') {
    errors.push(`${prefix}.attestation.verifier_not_provisioned`);
    return;
  }
  const pinnedVerifier = VALIDATOR_PINNED_VERIFIER_ROOTS[scope];
  if (!pinnedVerifier) {
    errors.push(`${prefix}.attestation.independent_validator_trust_root_not_provisioned`);
    return;
  }
  try {
    if (stableCanonicalize(verifier) !== stableCanonicalize(pinnedVerifier)) {
      errors.push(`${prefix}.attestation.contract_verifier_does_not_match_validator_pin`);
      return;
    }
  } catch {
    errors.push(`${prefix}.attestation.contract_verifier_does_not_match_validator_pin`);
    return;
  }
  const verification = verifyAttestationAgainstPinnedVerifier(receipt, scope, pinnedVerifier);
  if (!verification.verified) errors.push(`${prefix}.attestation.crypto_${verification.finding}`);
}

export function assessAcceptanceBundle(receipt, contract) {
  const errors = [];
  if (contract?.id !== 'portal-physical-mobile-screen-reader-acceptance-contract-v1') errors.push('contract.id');
  if (contract?.version !== '1.1.0' || contract?.status !== 'ACTIVE_FAIL_CLOSED') errors.push('contract.version_or_status');
  if (contract?.signed_payload?.domain !== DOMAIN
    || contract?.signed_payload?.canonicalization !== 'KIDULTS_SORTED_JSON_V1'
    || contract?.signed_payload?.payload_hash !== 'SHA-256'
    || contract?.signed_payload?.signature_algorithm !== 'Ed25519'
    || contract?.signed_payload?.self_asserted_boolean_or_signature_reference_sufficient !== false
    || contract?.signed_payload?.document_supplied_or_environment_override_verifier_key_allowed !== false
    || contract?.signed_payload?.contract_verifier_declaration_is_trust_root !== false
    || contract?.signed_payload?.verifier_trust_root !== 'INDEPENDENT_VALIDATOR_PIN_WITH_EXTERNAL_PROVISIONING_RECEIPT'
    || contract?.signed_payload?.contract_and_validator_pin_exact_match_required !== true
    || contract?.signed_payload?.verifier_key_absent_result !== 'HOLD') errors.push('contract.signed_payload_policy');
  if (contract?.receipts?.physical_mobile?.cryptographic_machine_verification_required !== true
    || contract?.receipts?.physical_mobile?.self_asserted_signed_boolean_eligible !== false
    || contract?.receipts?.screen_reader?.cryptographic_machine_verification_required !== true
    || contract?.receipts?.screen_reader?.self_asserted_signed_boolean_eligible !== false) errors.push('contract.receipt_cryptographic_policy');
  const mobileVerifier = contract?.attestation_verifiers?.physical_mobile;
  const readerVerifier = contract?.attestation_verifiers?.screen_reader;
  if (mobileVerifier?.status === 'PROVISIONED' && readerVerifier?.status === 'PROVISIONED'
    && (mobileVerifier?.key_id === readerVerifier?.key_id
      || mobileVerifier?.public_key_raw_base64url === readerVerifier?.public_key_raw_base64url)) errors.push('contract.verifier_keys_not_independent');
  if (receipt?.contract_id !== contract?.id || receipt?.receipt_version !== '1.1.0') errors.push('receipt.contract_or_version');
  const mobile = receipt?.physical_mobile_receipt;
  const reader = receipt?.screen_reader_receipt;
  const pending = mobile?.state === 'HOLD_PENDING_PHYSICAL_DEVICE'
    && reader?.state === 'HOLD_PENDING_HUMAN_REVIEW';

  if (pending) {
    if (mobile?.executed !== false || mobile?.physical_device !== false || mobile?.human_reviewer !== false) errors.push('pending.mobile_execution_false_claim');
    if (mobile?.evidence_class !== null || mobile?.session_id !== null) errors.push('pending.mobile_identity_must_be_null');
    if (!Array.isArray(mobile?.evidence_refs) || mobile.evidence_refs.length !== 0) errors.push('pending.mobile_evidence_must_be_empty');
    checkPendingAttestation(mobile?.attestation, errors, 'pending.mobile');
    if (mobile?.cycles?.required !== 30) errors.push('pending.mobile_required_cycles');
    for (const field of [...MOBILE_COUNT_FIELDS, 'stale_value_leak_count', 'runtime_error_count', 'crash_count', 'failed_cycle_count']) {
      if (mobile?.cycles?.[field] !== 0) errors.push(`pending.mobile_cycles.${field}`);
    }
    if (reader?.executed !== false || reader?.enabled !== false || reader?.human_operated !== false) errors.push('pending.reader_execution_false_claim');
    if (reader?.evidence_class !== null || reader?.session_id !== null || reader?.device_session_id !== null) errors.push('pending.reader_identity_must_be_null');
    if (!Array.isArray(reader?.evidence_refs) || reader.evidence_refs.length !== 0) errors.push('pending.reader_evidence_must_be_empty');
    checkPendingAttestation(reader?.attestation, errors, 'pending.reader');
    for (const field of REQUIRED_SCREEN_READER_CHECKS) {
      if (reader?.checks?.[field] !== 'NOT_EXECUTED') errors.push(`pending.reader_checks.${field}`);
    }
    const decision = receipt?.decision;
    if (decision?.physical_iphone_mobile_safari !== 'HOLD_PENDING_PHYSICAL_DEVICE'
      || decision?.voiceover_screen_reader !== 'HOLD_PENDING_HUMAN_REVIEW'
      || decision?.combined_acceptance !== 'HOLD'
      || decision?.promotion_authority !== 'NONE'
      || decision?.public !== 'HOLD' || decision?.production !== 'HOLD' || decision?.g5 !== 'HOLD') errors.push('pending.decision');
    return Object.freeze({
      contractState: errors.length ? 'VERIFIED_FAIL' : 'VERIFIED_PASS', acceptance: 'HOLD',
      physicalMobileAcceptance: 'HOLD_PENDING_PHYSICAL_DEVICE', screenReaderAcceptance: 'HOLD_PENDING_HUMAN_REVIEW',
      verifierProvisioning: Object.freeze({
        physical_mobile: contract?.attestation_verifiers?.physical_mobile?.status || 'NOT_PROVISIONED',
        screen_reader: contract?.attestation_verifiers?.screen_reader?.status || 'NOT_PROVISIONED',
      }),
      independentValidatorTrustRoots: Object.freeze({
        physical_mobile: VALIDATOR_PINNED_VERIFIER_ROOTS.physical_mobile ? 'PROVISIONED' : 'NOT_PROVISIONED',
        screen_reader: VALIDATOR_PINNED_VERIFIER_ROOTS.screen_reader ? 'PROVISIONED' : 'NOT_PROVISIONED',
      }),
      findings: Object.freeze(errors), promotionAuthority: 'NONE', public: 'HOLD', production: 'HOLD', g5: 'HOLD',
    });
  }

  checkSourceBinding(receipt?.source_binding, errors);
  if (mobile?.state !== 'VERIFIED_PASS' || mobile?.evidence_class !== 'PHYSICAL_IPHONE_MOBILE_SAFARI_HUMAN_ACCEPTANCE') errors.push('mobile.state_or_class');
  if (mobile?.executed !== true || mobile?.physical_device !== true || mobile?.simulator !== false || mobile?.automation_only !== false) errors.push('mobile.physical_execution');
  for (const field of ['session_id', 'device_model', 'ios_version', 'browser_version', 'reviewer_id']) if (!present(mobile?.[field])) errors.push(`mobile.${field}`);
  if (mobile?.browser !== 'MOBILE_SAFARI' || mobile?.human_reviewer !== true) errors.push('mobile.browser_or_reviewer');
  if (!validIso(mobile?.started_at) || !validIso(mobile?.completed_at) || Date.parse(mobile?.completed_at) < Date.parse(mobile?.started_at)) errors.push('mobile.timestamps');
  if (mobile?.cycles?.required !== 30) errors.push('mobile.cycles.required');
  for (const field of MOBILE_COUNT_FIELDS) if (mobile?.cycles?.[field] !== 30) errors.push(`mobile.cycles.${field}`);
  for (const field of ['stale_value_leak_count', 'runtime_error_count', 'crash_count', 'failed_cycle_count']) if (mobile?.cycles?.[field] !== 0) errors.push(`mobile.cycles.${field}`);
  checkEvidenceRefs(mobile?.evidence_refs, 2, errors, 'mobile');
  checkCryptographicAttestation({receipt, contract, scope: 'physical_mobile', attestation: mobile?.attestation, completedAt: mobile?.completed_at, errors, prefix: 'mobile'});

  if (reader?.state !== 'VERIFIED_PASS' || reader?.evidence_class !== 'PHYSICAL_IPHONE_VOICEOVER_HUMAN_ACCEPTANCE') errors.push('reader.state_or_class');
  if (reader?.executed !== true || reader?.screen_reader !== 'VoiceOver' || reader?.enabled !== true || reader?.human_operated !== true) errors.push('reader.execution');
  if (!present(reader?.session_id) || reader?.device_session_id !== mobile?.session_id || !present(reader?.reviewer_id)) errors.push('reader.session_binding');
  if (!validIso(reader?.started_at) || !validIso(reader?.completed_at) || Date.parse(reader?.completed_at) < Date.parse(reader?.started_at)) errors.push('reader.timestamps');
  for (const field of REQUIRED_SCREEN_READER_CHECKS) if (reader?.checks?.[field] !== 'PASS') errors.push(`reader.checks.${field}`);
  checkEvidenceRefs(reader?.evidence_refs, 2, errors, 'reader');
  checkCryptographicAttestation({receipt, contract, scope: 'screen_reader', attestation: reader?.attestation, completedAt: reader?.completed_at, errors, prefix: 'reader'});

  if (receipt?.decision?.physical_iphone_mobile_safari !== 'VERIFIED_PASS'
    || receipt?.decision?.voiceover_screen_reader !== 'VERIFIED_PASS'
    || receipt?.decision?.combined_acceptance !== 'VERIFIED_PASS') errors.push('decision.pass_binding');
  for (const field of ['promotion_authority', 'public', 'production', 'g5']) {
    const expected = field === 'promotion_authority' ? 'NONE' : 'HOLD';
    if (receipt?.decision?.[field] !== expected) errors.push(`decision.${field}`);
  }
  return Object.freeze({
    contractState: errors.length ? 'VERIFIED_FAIL' : 'VERIFIED_PASS', acceptance: errors.length ? 'HOLD' : 'VERIFIED_PASS',
    physicalMobileAcceptance: errors.length ? 'HOLD' : 'VERIFIED_PASS', screenReaderAcceptance: errors.length ? 'HOLD' : 'VERIFIED_PASS',
    verifierProvisioning: Object.freeze({
      physical_mobile: contract?.attestation_verifiers?.physical_mobile?.status || 'NOT_PROVISIONED',
      screen_reader: contract?.attestation_verifiers?.screen_reader?.status || 'NOT_PROVISIONED',
    }),
    independentValidatorTrustRoots: Object.freeze({
      physical_mobile: VALIDATOR_PINNED_VERIFIER_ROOTS.physical_mobile ? 'PROVISIONED' : 'NOT_PROVISIONED',
      screen_reader: VALIDATOR_PINNED_VERIFIER_ROOTS.screen_reader ? 'PROVISIONED' : 'NOT_PROVISIONED',
    }),
    findings: Object.freeze(errors), promotionAuthority: 'NONE', public: 'HOLD', production: 'HOLD', g5: 'HOLD',
  });
}

function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const requirePass = process.argv.includes('--require-pass');
  const receiptArg = process.argv.slice(2).find((arg) => !arg.startsWith('--')) || RECEIPT_PATH;
  const result = assessAcceptanceBundle(readJson(receiptArg), readJson(CONTRACT_PATH));
  console.log(JSON.stringify({receipt: receiptArg, ...result}, null, 2));
  if (result.contractState !== 'VERIFIED_PASS' || (requirePass && result.acceptance !== 'VERIFIED_PASS')) process.exitCode = 1;
}
