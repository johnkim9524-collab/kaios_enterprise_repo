#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash, generateKeyPairSync, sign} from 'node:crypto';
import {
  assessAcceptanceBundle,
  canonicalAttestationPayload,
  verifyAttestationAgainstPinnedVerifier,
} from '../../../scripts/kidults/portal/validate-physical-mobile-screen-reader-acceptance-v1.mjs';

const DOMAIN = 'KIDULTS.PORTAL.PHYSICAL-MOBILE.VOICEOVER-ACCEPTANCE.V1';
const read = (path) => JSON.parse(fs.readFileSync(path, 'utf8'));
const contract = read('coordination/kidults/governance/portal-physical-mobile-screen-reader-acceptance-contract-v1.json');
const pending = read('coordination/kidults/portal/portal-physical-mobile-screen-reader-acceptance-receipt-v1.json');
const hash = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const evidenceDigest = `sha256:${'a'.repeat(64)}`;

const pendingResult = assessAcceptanceBundle(pending, contract);
assert.equal(pendingResult.contractState, 'VERIFIED_PASS');
assert.equal(pendingResult.acceptance, 'HOLD');
assert.equal(pendingResult.physicalMobileAcceptance, 'HOLD_PENDING_PHYSICAL_DEVICE');
assert.equal(pendingResult.screenReaderAcceptance, 'HOLD_PENDING_HUMAN_REVIEW');
assert.deepEqual(pendingResult.verifierProvisioning, {physical_mobile: 'NOT_PROVISIONED', screen_reader: 'NOT_PROVISIONED'});
assert.deepEqual(pendingResult.independentValidatorTrustRoots, {physical_mobile: 'NOT_PROVISIONED', screen_reader: 'NOT_PROVISIONED'});

const completeFixture = structuredClone(pending);
completeFixture.source_binding = {
  current_main_sha: '1'.repeat(40),
  governed_staging_source_sha: '1'.repeat(40),
  governed_staging_deployment_id: 'in-memory-test-fixture-deployment',
  governed_staging_url: 'https://staging.invalid/portal/',
  current_main_parity: 'VERIFIED_PASS',
};
completeFixture.physical_mobile_receipt = {
  state: 'VERIFIED_PASS', evidence_class: 'PHYSICAL_IPHONE_MOBILE_SAFARI_HUMAN_ACCEPTANCE',
  session_id: 'in-memory-device-session', executed: true, physical_device: true, simulator: false,
  automation_only: false, device_model: 'IN_MEMORY_FIXTURE_IPHONE', ios_version: 'IN_MEMORY_FIXTURE_IOS',
  browser: 'MOBILE_SAFARI', browser_version: 'IN_MEMORY_FIXTURE_SAFARI',
  started_at: '2026-01-01T00:00:00Z', completed_at: '2026-01-01T01:00:00Z',
  reviewer_id: 'IN_MEMORY_FIXTURE_REVIEWER', human_reviewer: true,
  cycles: {
    required: 30, completed: 30, navigation_pass: 30, background_foreground_pass: 30,
    history_traversal_pass: 30, bfcache_or_reload_containment_pass: 30, menu_restoration_pass: 30,
    focus_restoration_pass: 30, scroll_restoration_pass: 30, stale_value_leak_count: 0,
    runtime_error_count: 0, crash_count: 0, failed_cycle_count: 0,
  },
  evidence_refs: [
    {kind: 'IN_MEMORY_CYCLE_LOG', uri: 'test://cycle-log', digest: evidenceDigest},
    {kind: 'IN_MEMORY_VIDEO', uri: 'test://video', digest: evidenceDigest},
  ],
  attestation: {
    signed: true, signer_id: 'IN_MEMORY_FIXTURE_REVIEWER', signed_at: '2026-01-01T01:01:00Z',
    statement: 'IN-MEMORY TEST FIXTURE ONLY', algorithm: 'Ed25519',
    verifier_key_id: 'portal-mobile-verifier-2026', attestation_id: '1'.repeat(32),
    payload_digest: null, payload_base64url: null, signature_base64url: null,
    verification_state: 'MACHINE_VERIFICATION_REQUIRED',
  },
};
completeFixture.screen_reader_receipt = {
  state: 'VERIFIED_PASS', evidence_class: 'PHYSICAL_IPHONE_VOICEOVER_HUMAN_ACCEPTANCE',
  session_id: 'in-memory-voiceover-session', device_session_id: 'in-memory-device-session', executed: true,
  screen_reader: 'VoiceOver', enabled: true, human_operated: true, reviewer_id: 'IN_MEMORY_FIXTURE_REVIEWER',
  started_at: '2026-01-01T01:02:00Z', completed_at: '2026-01-01T01:30:00Z',
  checks: Object.fromEntries(contract.receipts.screen_reader.required_checks.map((field) => [field, 'PASS'])),
  evidence_refs: [
    {kind: 'IN_MEMORY_CHECKLIST', uri: 'test://checklist', digest: evidenceDigest},
    {kind: 'IN_MEMORY_AUDIO_VIDEO', uri: 'test://audio-video', digest: evidenceDigest},
  ],
  attestation: {
    signed: true, signer_id: 'IN_MEMORY_FIXTURE_REVIEWER', signed_at: '2026-01-01T01:31:00Z',
    statement: 'IN-MEMORY TEST FIXTURE ONLY', algorithm: 'Ed25519',
    verifier_key_id: 'portal-voiceover-verifier-2026', attestation_id: '2'.repeat(32),
    payload_digest: null, payload_base64url: null, signature_base64url: null,
    verification_state: 'MACHINE_VERIFICATION_REQUIRED',
  },
};
completeFixture.decision = {
  physical_iphone_mobile_safari: 'VERIFIED_PASS', voiceover_screen_reader: 'VERIFIED_PASS',
  combined_acceptance: 'VERIFIED_PASS', promotion_authority: 'NONE', public: 'HOLD', production: 'HOLD', g5: 'HOLD',
};

const keyPairs = {
  physical_mobile: generateKeyPairSync('ed25519'),
  screen_reader: generateKeyPairSync('ed25519'),
};
const provisionedContract = structuredClone(contract);
for (const [scope, keyPair] of Object.entries(keyPairs)) {
  const rawPublicKey = Buffer.from(keyPair.publicKey.export({format: 'jwk'}).x, 'base64url');
  const keyId = completeFixture[scope === 'physical_mobile' ? 'physical_mobile_receipt' : 'screen_reader_receipt'].attestation.verifier_key_id;
  provisionedContract.attestation_verifiers[scope] = {
    status: 'PROVISIONED', verification_method: 'ED25519_PINNED_PUBLIC_KEY', algorithm: 'Ed25519',
    authority: 'INDEPENDENT_ACCEPTANCE_VERIFIER', environment: 'GOVERNED_STAGING',
    key_purpose: 'PORTAL_PHYSICAL_ACCEPTANCE_VERIFICATION', key_id: keyId,
    public_key_raw_base64url: rawPublicKey.toString('base64url'), public_key_sha256: hash(rawPublicKey),
    revoked: false, provisioned_by: 'IN_MEMORY_FIXTURE_PROVISIONER', provisioned_at: '2025-12-31T00:00:00Z',
    provisioning_receipt_digest: `sha256:${'b'.repeat(64)}`,
  };
}

function signScope(receipt, scope, privateKey, payloadTransform = (value) => value) {
  const node = scope === 'physical_mobile' ? receipt.physical_mobile_receipt : receipt.screen_reader_receipt;
  const canonical = canonicalAttestationPayload(receipt, scope);
  const payload = Buffer.from(payloadTransform(canonical), 'utf8');
  node.attestation.payload_digest = hash(payload);
  node.attestation.payload_base64url = payload.toString('base64url');
  node.attestation.signature_base64url = sign(
    null,
    Buffer.concat([Buffer.from(`${DOMAIN}\n`, 'ascii'), payload]),
    privateKey,
  ).toString('base64url');
}

signScope(completeFixture, 'physical_mobile', keyPairs.physical_mobile.privateKey);
signScope(completeFixture, 'screen_reader', keyPairs.screen_reader.privateKey);
assert.equal(verifyAttestationAgainstPinnedVerifier(
  completeFixture,
  'physical_mobile',
  provisionedContract.attestation_verifiers.physical_mobile,
).verified, true);
assert.equal(verifyAttestationAgainstPinnedVerifier(
  completeFixture,
  'screen_reader',
  provisionedContract.attestation_verifiers.screen_reader,
).verified, true);
const cryptographicFixtureResult = assessAcceptanceBundle(completeFixture, provisionedContract);
assert.equal(cryptographicFixtureResult.contractState, 'VERIFIED_FAIL');
assert.equal(cryptographicFixtureResult.acceptance, 'HOLD');
assert.equal(cryptographicFixtureResult.promotionAuthority, 'NONE');
assert.deepEqual(cryptographicFixtureResult.verifierProvisioning, {physical_mobile: 'PROVISIONED', screen_reader: 'PROVISIONED'});
assert.deepEqual(cryptographicFixtureResult.independentValidatorTrustRoots, {physical_mobile: 'NOT_PROVISIONED', screen_reader: 'NOT_PROVISIONED'});
assert.match(cryptographicFixtureResult.findings.join(','), /independent_validator_trust_root_not_provisioned/);

// The repository contract intentionally has no verifier key. Even otherwise
// valid signatures cannot turn the canonical trust root into PASS.
const unprovisionedResult = assessAcceptanceBundle(completeFixture, contract);
assert.equal(unprovisionedResult.acceptance, 'HOLD');
assert.match(unprovisionedResult.findings.join(','), /verifier_not_provisioned/);

// Direct regression for the former self-assertion bypass.
const legacySelfAssertion = structuredClone(completeFixture);
legacySelfAssertion.physical_mobile_receipt.attestation = {
  signed: true, signer_id: 'SELF', signed_at: '2026-01-01T01:01:00Z',
  signature_reference: 'self://arbitrary', statement: 'SELF ASSERTED',
};
legacySelfAssertion.screen_reader_receipt.attestation = structuredClone(legacySelfAssertion.physical_mobile_receipt.attestation);
const legacyResult = assessAcceptanceBundle(legacySelfAssertion, contract);
assert.equal(legacyResult.acceptance, 'HOLD');
assert.equal(legacyResult.contractState, 'VERIFIED_FAIL');

const mutations = [
  ['CONTRACT_SELF_PROVISIONED_ATTACKER_KEY', (_r, _c) => {}],
  ['STALE_STAGING_AFTER_SIGNATURE', (r) => { r.source_binding.governed_staging_source_sha = '2'.repeat(40); }],
  ['DEVICE_AFTER_SIGNATURE', (r) => { r.physical_mobile_receipt.device_model = 'ALTERED'; }],
  ['SESSION_AFTER_SIGNATURE', (r) => { r.physical_mobile_receipt.session_id = 'altered'; r.screen_reader_receipt.device_session_id = 'altered'; }],
  ['EVIDENCE_AFTER_SIGNATURE', (r) => { r.physical_mobile_receipt.evidence_refs[0].digest = `sha256:${'c'.repeat(64)}`; }],
  ['EMULATOR', (r) => { r.physical_mobile_receipt.simulator = true; }],
  ['AUTOMATION_ONLY', (r) => { r.physical_mobile_receipt.automation_only = true; }],
  ['CYCLE_29', (r) => { r.physical_mobile_receipt.cycles.completed = 29; }],
  ['RUNTIME_ERROR', (r) => { r.physical_mobile_receipt.cycles.runtime_error_count = 1; }],
  ['CRASH', (r) => { r.physical_mobile_receipt.cycles.crash_count = 1; }],
  ['STALE_VALUE', (r) => { r.physical_mobile_receipt.cycles.stale_value_leak_count = 1; }],
  ['UNSIGNED_MOBILE', (r) => { r.physical_mobile_receipt.attestation.signed = false; }],
  ['VOICEOVER_DISABLED', (r) => { r.screen_reader_receipt.enabled = false; }],
  ['VOICEOVER_NOT_HUMAN', (r) => { r.screen_reader_receipt.human_operated = false; }],
  ['SESSION_MISMATCH', (r) => { r.screen_reader_receipt.device_session_id = 'other'; }],
  ['CHECK_MISSING', (r) => { r.screen_reader_receipt.checks.menu_announcement = 'NOT_EXECUTED'; }],
  ['UNHASHED_EVIDENCE', (r) => { r.screen_reader_receipt.evidence_refs[0].digest = 'missing'; }],
  ['UNSIGNED_READER', (r) => { r.screen_reader_receipt.attestation.signed = false; }],
  ['SELF_PROMOTION', (r) => { r.decision.promotion_authority = 'GRANTED'; }],
  ['SIGNATURE_FLIP', (r) => {
    const signature = Buffer.from(r.physical_mobile_receipt.attestation.signature_base64url, 'base64url');
    signature[0] ^= 1;
    r.physical_mobile_receipt.attestation.signature_base64url = signature.toString('base64url');
  }],
  ['PAYLOAD_FLIP', (r) => {
    const payload = Buffer.from(r.screen_reader_receipt.attestation.payload_base64url, 'base64url');
    payload[0] ^= 1;
    r.screen_reader_receipt.attestation.payload_base64url = payload.toString('base64url');
  }],
  ['PADDED_BASE64URL', (r) => { r.physical_mobile_receipt.attestation.signature_base64url += '='; }],
  ['ATTACKER_KEY_IN_RECEIPT', (r) => { r.physical_mobile_receipt.attestation.public_key = 'attacker'; }],
  ['CROSS_SCOPE_SIGNATURE', (r) => { r.screen_reader_receipt.attestation.signature_base64url = r.physical_mobile_receipt.attestation.signature_base64url; }],
  ['UNKNOWN_KEY_ID', (r) => { r.physical_mobile_receipt.attestation.verifier_key_id = 'unknown-verifier-key'; }],
  ['ALGORITHM_CONFUSION', (r) => { r.physical_mobile_receipt.attestation.algorithm = 'none'; }],
  ['PIN_FINGERPRINT', (_r, c) => { c.attestation_verifiers.physical_mobile.public_key_sha256 = `sha256:${'0'.repeat(64)}`; }],
  ['PIN_KEY_MISSING', (_r, c) => {
    c.attestation_verifiers.physical_mobile.public_key_raw_base64url = null;
    c.attestation_verifiers.physical_mobile.public_key_sha256 = null;
  }],
  ['PIN_REVOKED', (_r, c) => { c.attestation_verifiers.physical_mobile.revoked = true; }],
  ['PIN_ENVIRONMENT', (_r, c) => { c.attestation_verifiers.physical_mobile.environment = 'TEST'; }],
  ['PROVISIONING_RECEIPT', (_r, c) => { c.attestation_verifiers.screen_reader.provisioning_receipt_digest = null; }],
  ['VERIFIER_NOT_PROVISIONED', (_r, c) => { c.attestation_verifiers.screen_reader.status = 'NOT_PROVISIONED'; }],
  ['VERIFIER_KEYS_NOT_INDEPENDENT', (_r, c) => {
    c.attestation_verifiers.screen_reader.key_id = c.attestation_verifiers.physical_mobile.key_id;
    c.attestation_verifiers.screen_reader.public_key_raw_base64url = c.attestation_verifiers.physical_mobile.public_key_raw_base64url;
  }],
];
const cryptographicMutationScope = new Map([
  ['STALE_STAGING_AFTER_SIGNATURE', 'physical_mobile'],
  ['DEVICE_AFTER_SIGNATURE', 'physical_mobile'],
  ['SESSION_AFTER_SIGNATURE', 'physical_mobile'],
  ['EVIDENCE_AFTER_SIGNATURE', 'physical_mobile'],
  ['EMULATOR', 'physical_mobile'],
  ['AUTOMATION_ONLY', 'physical_mobile'],
  ['CYCLE_29', 'physical_mobile'],
  ['RUNTIME_ERROR', 'physical_mobile'],
  ['CRASH', 'physical_mobile'],
  ['STALE_VALUE', 'physical_mobile'],
  ['VOICEOVER_DISABLED', 'screen_reader'],
  ['VOICEOVER_NOT_HUMAN', 'screen_reader'],
  ['SESSION_MISMATCH', 'screen_reader'],
  ['CHECK_MISSING', 'screen_reader'],
  ['UNHASHED_EVIDENCE', 'screen_reader'],
  ['SIGNATURE_FLIP', 'physical_mobile'],
  ['PAYLOAD_FLIP', 'screen_reader'],
  ['PADDED_BASE64URL', 'physical_mobile'],
  ['CROSS_SCOPE_SIGNATURE', 'screen_reader'],
  ['UNKNOWN_KEY_ID', 'physical_mobile'],
  ['ALGORITHM_CONFUSION', 'physical_mobile'],
  ['PIN_FINGERPRINT', 'physical_mobile'],
  ['PIN_KEY_MISSING', 'physical_mobile'],
  ['PIN_REVOKED', 'physical_mobile'],
  ['PIN_ENVIRONMENT', 'physical_mobile'],
  ['PROVISIONING_RECEIPT', 'screen_reader'],
  ['VERIFIER_NOT_PROVISIONED', 'screen_reader'],
  ['VERIFIER_KEYS_NOT_INDEPENDENT', 'screen_reader'],
]);
for (const [id, mutate] of mutations) {
  const receipt = structuredClone(completeFixture);
  const verifierContract = structuredClone(provisionedContract);
  mutate(receipt, verifierContract);
  const result = assessAcceptanceBundle(receipt, verifierContract);
  assert.equal(result.acceptance, 'HOLD', id);
  assert.equal(result.contractState, 'VERIFIED_FAIL', id);
  const scope = cryptographicMutationScope.get(id);
  if (scope) {
    assert.equal(
      verifyAttestationAgainstPinnedVerifier(receipt, scope, verifierContract.attestation_verifiers[scope]).verified,
      false,
      `${id}_CRYPTO_OR_SUBJECT_BINDING`,
    );
  }
}

const nonCanonical = structuredClone(completeFixture);
signScope(nonCanonical, 'physical_mobile', keyPairs.physical_mobile.privateKey, (value) => `${value}\n`);
const nonCanonicalResult = assessAcceptanceBundle(nonCanonical, provisionedContract);
assert.equal(nonCanonicalResult.acceptance, 'HOLD');
const nonCanonicalVerification = verifyAttestationAgainstPinnedVerifier(
  nonCanonical,
  'physical_mobile',
  provisionedContract.attestation_verifiers.physical_mobile,
);
assert.equal(nonCanonicalVerification.verified, false);
assert.match(nonCanonicalVerification.finding, /PAYLOAD_NOT_CANONICAL/);

const pendingSelfAssertion = structuredClone(pending);
pendingSelfAssertion.physical_mobile_receipt.attestation.signed = true;
pendingSelfAssertion.physical_mobile_receipt.attestation.signature_reference = 'self://arbitrary';
const pendingSelfAssertionResult = assessAcceptanceBundle(pendingSelfAssertion, contract);
assert.equal(pendingSelfAssertionResult.contractState, 'VERIFIED_FAIL');
assert.equal(pendingSelfAssertionResult.acceptance, 'HOLD');

console.log(`PASS cryptographic physical-mobile + VoiceOver receipt contract: canonical verifier NOT_PROVISIONED/HOLD; signed:true reference and self-provisioned contract key rejected; ${mutations.length + 2} crypto/subject false-green mutations rejected; Ed25519 primitive verified against explicit test pin only; promotion NONE`);
