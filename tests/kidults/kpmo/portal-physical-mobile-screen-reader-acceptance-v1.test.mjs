#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash, generateKeyPairSync, sign} from 'node:crypto';
import {
  assessAcceptanceBundle,
  canonicalAttestationPayload,
  stableCanonicalize,
  verifyAttestationAgainstPinnedVerifier,
} from '../../../scripts/kidults/portal/validate-physical-mobile-screen-reader-acceptance-v1.mjs';

const DOMAIN = 'KIDULTS.PORTAL.PHYSICAL-MOBILE.VOICEOVER-ACCEPTANCE.V1';
const read = (path) => JSON.parse(fs.readFileSync(path, 'utf8'));
const hash = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const contract = read('coordination/kidults/governance/portal-physical-mobile-screen-reader-acceptance-contract-v1.json');
const pending = read('coordination/kidults/portal/portal-physical-mobile-screen-reader-acceptance-receipt-v1.json');

const pendingResult = assessAcceptanceBundle(pending, contract);
assert.equal(pendingResult.contractState, 'VERIFIED_PASS');
assert.equal(pendingResult.acceptance, 'HOLD');
assert.equal(pendingResult.parity, 'RED_NOT_EXECUTED');
assert.equal(pendingResult.physicalMobileAcceptance, 'HOLD_PENDING_PHYSICAL_DEVICE');
assert.equal(pendingResult.screenReaderAcceptance, 'HOLD_PENDING_HUMAN_REVIEW');
assert.deepEqual(pendingResult.verifierRoots, {physical_mobile: 'NOT_PROVISIONED', screen_reader: 'NOT_PROVISIONED'});

const receipt = structuredClone(pending);
receipt.replay_protection = {
  receipt_instance_id: 'receipt:portal:physical:0001',
  receipt_nonce: '0123456789abcdef0123456789abcdef',
  issued_at: '2026-08-30T00:00:00Z',
  expires_at: '2026-08-30T12:00:00Z',
  replay_registry_digest: null,
  registry_check: 'VERIFIED_UNSEEN',
};
receipt.source_binding = {
  current_main_sha: '1'.repeat(40),
  governed_staging_source_sha: '1'.repeat(40),
  governed_staging_deployment_id: 'governed-staging-test-deployment',
  governed_staging_url: 'https://staging.invalid/portal/',
  current_main_parity: 'VERIFIED_PASS',
  parity_evidence_ref: {
    kind: 'GOVERNED_STAGING_READ_ONLY_PARITY_RECEIPT',
    uri: 'github-actions://runs/100/artifacts/200',
    digest: `sha256:${'1'.repeat(64)}`,
    run_id: 100,
    run_attempt: 1,
    observed_at: '2026-08-30T00:00:00Z',
    read_only: true,
  },
};

const historyCycles = Array.from({length: 30}, (_, index) => {
  const bfcache = index < 15;
  return {
    cycle: index + 1,
    navigation_type: 'back_forward',
    same_origin_second_document: true,
    synthetic_dispatch_used: false,
    pagehide_is_trusted: true,
    pageshow_is_trusted: true,
    pagehide_persisted: bfcache,
    pageshow_persisted: bfcache,
    document_identity_preserved: bfcache,
    immediate_containment_pass: true,
    settled_containment_pass: true,
    claimed_outcome: bfcache ? 'BFCACHE_RESTORED' : 'HISTORY_RELOAD_NO_BFCACHE',
  };
});

receipt.physical_mobile_receipt = {
  state: 'VERIFIED_PASS',
  evidence_class: 'PHYSICAL_IPHONE_MOBILE_SAFARI_HUMAN_ACCEPTANCE',
  session_id: 'device-session:physical:0001',
  executed: true,
  physical_device: true,
  simulator: false,
  automation_only: false,
  device_model: 'TEST_FIXTURE_IPHONE',
  ios_version: 'TEST_FIXTURE_IOS',
  browser: 'MOBILE_SAFARI',
  browser_version: 'TEST_FIXTURE_SAFARI',
  started_at: '2026-08-30T01:00:00Z',
  completed_at: '2026-08-30T02:00:00Z',
  reviewer_id: 'reviewer:fixture:0001',
  human_reviewer: true,
  cycles: {
    required: 30,
    completed: 30,
    navigation_pass: 30,
    background_foreground_pass: 30,
    history_traversal_pass: 30,
    menu_restoration_pass: 30,
    focus_restoration_pass: 30,
    scroll_restoration_pass: 30,
    stale_value_leak_count: 0,
    runtime_error_count: 0,
    crash_count: 0,
    failed_cycle_count: 0,
  },
  history_cycles: historyCycles,
  evidence_refs: [
    {kind: 'PHYSICAL_CYCLE_LOG', uri: 'artifact://physical-cycle-log', digest: `sha256:${'2'.repeat(64)}`, bytes: 1000, media_type: 'application/json', captured_at: '2026-08-30T02:00:00Z', session_id: 'device-session:physical:0001'},
    {kind: 'PHYSICAL_SESSION_VIDEO', uri: 'artifact://physical-session-video', digest: `sha256:${'3'.repeat(64)}`, bytes: 2000, media_type: 'video/mp4', captured_at: '2026-08-30T02:00:00Z', session_id: 'device-session:physical:0001'},
  ],
  attestation: {
    signed: true,
    signer_id: 'reviewer:fixture:0001',
    signed_at: '2026-08-30T02:01:00Z',
    statement: 'IN-MEMORY TEST FIXTURE ONLY',
    algorithm: 'Ed25519',
    verifier_key_id: 'portal-mobile-verifier-2026',
    attestation_id: 'attestation:mobile:0001',
    payload_digest: null,
    payload_base64url: null,
    signature_base64url: null,
    verification_state: 'MACHINE_VERIFICATION_REQUIRED',
  },
};

receipt.screen_reader_receipt = {
  state: 'VERIFIED_PASS',
  evidence_class: 'PHYSICAL_IPHONE_VOICEOVER_HUMAN_ACCEPTANCE',
  session_id: 'voiceover-session:human:0001',
  device_session_id: 'device-session:physical:0001',
  executed: true,
  screen_reader: 'VoiceOver',
  enabled: true,
  human_operated: true,
  reviewer_id: 'reviewer:fixture:0001',
  started_at: '2026-08-30T02:02:00Z',
  completed_at: '2026-08-30T02:30:00Z',
  checks: Object.fromEntries(contract.receipts.screen_reader.required_checks.map((field) => [field, 'PASS'])),
  evidence_refs: [
    {kind: 'VOICEOVER_CHECKLIST', uri: 'artifact://voiceover-checklist', digest: `sha256:${'4'.repeat(64)}`, bytes: 1000, media_type: 'application/json', captured_at: '2026-08-30T02:30:00Z', session_id: 'voiceover-session:human:0001'},
    {kind: 'VOICEOVER_AUDIO_VIDEO', uri: 'artifact://voiceover-audio-video', digest: `sha256:${'5'.repeat(64)}`, bytes: 2000, media_type: 'video/mp4', captured_at: '2026-08-30T02:30:00Z', session_id: 'voiceover-session:human:0001'},
  ],
  attestation: {
    signed: true,
    signer_id: 'reviewer:fixture:0001',
    signed_at: '2026-08-30T02:31:00Z',
    statement: 'IN-MEMORY TEST FIXTURE ONLY',
    algorithm: 'Ed25519',
    verifier_key_id: 'portal-voiceover-verifier-2026',
    attestation_id: 'attestation:voiceover:0001',
    payload_digest: null,
    payload_base64url: null,
    signature_base64url: null,
    verification_state: 'MACHINE_VERIFICATION_REQUIRED',
  },
};
receipt.decision = {
  physical_iphone_mobile_safari: 'VERIFIED_PASS',
  voiceover_screen_reader: 'VERIFIED_PASS',
  combined_acceptance: 'VERIFIED_PASS',
  promotion_authority: 'NONE',
  public: 'HOLD',
  production: 'HOLD',
  g5: 'HOLD',
};

const registry = {
  status: 'PROVISIONED_READ_ONLY',
  generated_at: '2026-08-30T00:00:00Z',
  snapshot_digest: null,
  seen_receipt_instance_ids: [],
  seen_receipt_nonces: [],
  seen_attestation_ids: [],
  seen_payload_digests: [],
  seen_device_session_ids: [],
};
function updateRegistryDigest(value) {
  const {snapshot_digest: _omitted, ...body} = value;
  value.snapshot_digest = hash(stableCanonicalize(body));
  return value;
}
updateRegistryDigest(registry);
receipt.replay_protection.replay_registry_digest = registry.snapshot_digest;

const keyPairs = {
  physical_mobile: generateKeyPairSync('ed25519'),
  screen_reader: generateKeyPairSync('ed25519'),
};
const pins = {};
for (const [scope, pair] of Object.entries(keyPairs)) {
  const raw = Buffer.from(pair.publicKey.export({format: 'jwk'}).x, 'base64url');
  const keyId = scope === 'physical_mobile'
    ? receipt.physical_mobile_receipt.attestation.verifier_key_id
    : receipt.screen_reader_receipt.attestation.verifier_key_id;
  pins[scope] = {
    status: 'PROVISIONED',
    verification_method: 'ED25519_PINNED_PUBLIC_KEY',
    algorithm: 'Ed25519',
    authority: 'INDEPENDENT_ACCEPTANCE_VERIFIER',
    environment: 'GOVERNED_STAGING',
    key_purpose: 'PORTAL_PHYSICAL_ACCEPTANCE_VERIFICATION',
    key_id: keyId,
    public_key_raw_base64url: raw.toString('base64url'),
    public_key_sha256: hash(raw),
    revoked: false,
    provisioned_by: 'TEST_FIXTURE_ONLY',
    provisioned_at: '2026-08-29T00:00:00Z',
    provisioning_receipt_digest: `sha256:${'6'.repeat(64)}`,
  };
}

function signScope(target, scope) {
  const node = scope === 'physical_mobile' ? target.physical_mobile_receipt : target.screen_reader_receipt;
  const payload = Buffer.from(canonicalAttestationPayload(target, scope), 'utf8');
  node.attestation.payload_digest = hash(payload);
  node.attestation.payload_base64url = payload.toString('base64url');
  node.attestation.signature_base64url = sign(
    null,
    Buffer.concat([Buffer.from(`${DOMAIN}\n`, 'ascii'), payload]),
    keyPairs[scope].privateKey,
  ).toString('base64url');
}
signScope(receipt, 'physical_mobile');
signScope(receipt, 'screen_reader');

assert.equal(verifyAttestationAgainstPinnedVerifier(receipt, 'physical_mobile', pins.physical_mobile).verified, true);
assert.equal(verifyAttestationAgainstPinnedVerifier(receipt, 'screen_reader', pins.screen_reader).verified, true);

const options = {
  expectedCurrentMainSha: '1'.repeat(40),
  evaluationTime: '2026-08-30T03:00:00Z',
  replayRegistry: registry,
};
const completeResult = assessAcceptanceBundle(receipt, contract, options);
assert.equal(completeResult.acceptance, 'HOLD');
assert.equal(completeResult.contractState, 'VERIFIED_FAIL');
assert.match(completeResult.findings.join(','), /independent_validator_root_not_provisioned/);
assert.equal(completeResult.promotionAuthority, 'NONE');
assert.equal(completeResult.public, 'HOLD');

function expectRejected(id, mutateReceipt, mutateOptions = () => {}) {
  const candidate = structuredClone(receipt);
  const candidateOptions = structuredClone(options);
  mutateReceipt(candidate);
  mutateOptions(candidateOptions, candidate);
  const result = assessAcceptanceBundle(candidate, contract, candidateOptions);
  assert.equal(result.acceptance, 'HOLD', id);
  assert.equal(result.contractState, 'VERIFIED_FAIL', id);
  return result.findings.join(',');
}

assert.match(expectRejected('WRONG_LIVE_MAIN', () => {}, (o) => { o.expectedCurrentMainSha = '2'.repeat(40); }), /source.current_main_sha/);
assert.match(expectRejected('STAGING_SHA_MISMATCH', (r) => { r.source_binding.governed_staging_source_sha = '2'.repeat(40); }), /source.exact_sha_mismatch/);
assert.match(expectRejected('MISSING_PARITY_RECEIPT', (r) => { r.source_binding.parity_evidence_ref = null; }), /source.parity_evidence_ref/);
assert.match(expectRejected('MISSING_EVIDENCE', (r) => { r.physical_mobile_receipt.evidence_refs.length = 1; }), /evidence_refs_min_2/);
assert.match(expectRejected('DUPLICATE_EVIDENCE', (r) => { r.screen_reader_receipt.evidence_refs[1].digest = r.screen_reader_receipt.evidence_refs[0].digest; }), /evidence_refs\[1\]\.digest/);
assert.match(expectRejected('CYCLE_29', (r) => { r.physical_mobile_receipt.history_cycles.length = 29; }), /history_cycles.count_30/);
assert.match(expectRejected('FAKE_BFCACHE_PERSISTED', (r) => { r.physical_mobile_receipt.history_cycles[0].pageshow_persisted = false; }), /truthful_classification/);
assert.match(expectRejected('SYNTHETIC_BFCACHE', (r) => { r.physical_mobile_receipt.history_cycles[0].synthetic_dispatch_used = true; }), /trusted_lifecycle/);
assert.match(expectRejected('RELOAD_IDENTITY_LIE', (r) => { r.physical_mobile_receipt.history_cycles[29].document_identity_preserved = true; }), /truthful_classification/);
assert.match(expectRejected('SIMULATOR', (r) => { r.physical_mobile_receipt.simulator = true; }), /mobile.physical_execution/);
assert.match(expectRejected('VOICEOVER_NOT_HUMAN', (r) => { r.screen_reader_receipt.human_operated = false; }), /reader.execution/);
assert.match(expectRejected('VOICEOVER_SESSION_MISMATCH', (r) => { r.screen_reader_receipt.device_session_id = 'device-session:other:0002'; }), /reader.execution/);
assert.match(expectRejected('VOICEOVER_CHECK_MISSING', (r) => { r.screen_reader_receipt.checks.error_announcement = 'NOT_EXECUTED'; }), /reader.checks.error_announcement/);
assert.match(expectRejected('SELF_PROMOTION', (r) => { r.decision.production = 'PASS'; }), /decision.authority_boundary/);
assert.match(expectRejected('REPLAY_REGISTRY_MISSING', () => {}, (o) => { o.replayRegistry = null; }), /replay.registry_missing/);
assert.match(expectRejected('REPLAYED_RECEIPT', () => {}, (o, r) => {
  o.replayRegistry.seen_receipt_instance_ids.push(r.replay_protection.receipt_instance_id);
  updateRegistryDigest(o.replayRegistry);
  r.replay_protection.replay_registry_digest = o.replayRegistry.snapshot_digest;
}), /replay.detected.seen_receipt_instance_ids/);
assert.match(expectRejected('REPLAYED_NONCE', () => {}, (o, r) => {
  o.replayRegistry.seen_receipt_nonces.push(r.replay_protection.receipt_nonce);
  updateRegistryDigest(o.replayRegistry);
  r.replay_protection.replay_registry_digest = o.replayRegistry.snapshot_digest;
}), /replay.detected.seen_receipt_nonces/);
assert.match(expectRejected('EXPIRED_RECEIPT', () => {}, (o) => { o.evaluationTime = '2026-08-31T00:00:00Z'; }), /replay.expired_or_not_yet_valid/);
assert.match(expectRejected('ATTESTATION_SCHEMA_INJECTION', (r) => { r.physical_mobile_receipt.attestation.public_key = 'self-supplied'; }), /attestation.exact_schema/);

const tampered = structuredClone(receipt);
tampered.physical_mobile_receipt.device_model = 'ALTERED_AFTER_SIGNATURE';
assert.equal(verifyAttestationAgainstPinnedVerifier(tampered, 'physical_mobile', pins.physical_mobile).verified, false);

console.log('PASS physical iPhone/Mobile Safari + truthful BFCache-or-reload + human VoiceOver contract: blank receipt HOLD; exact SHA/parity, 30/30, evidence, replay, signature and authority negative matrix enforced; verifier roots NOT_PROVISIONED; Public/Production/G5 HOLD');
