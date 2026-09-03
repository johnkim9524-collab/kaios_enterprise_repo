import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  canonicalAuthorityDigest,
  canonicalAuthorityPayloadBytes,
  consumeGovernedReceiptRegistryAuthority,
  verifyGovernedReceiptRegistryAuthority,
} from '../../../scripts/kidults/market/current-sold-governed-receipt-authority-adapter-v1.mjs';

const NOW = new Date('2026-09-03T03:00:00.000Z');
const REPOSITORY = 'johnkim9524-collab/kaios_enterprise_repo';
const SOURCE_SHA = 'a'.repeat(40);
const RUN_ID = 'track-a-current-sold-run-001';

function fixture() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const registry = {
    schema_version: 'current-sold-receipt-registry-v1',
    acquisitions: [{
      receipt_id: 'acq-1', receipt_type: 'ACQUISITION', status: 'PASS',
      source_id: 'source-one', source_event_id: 'lot-1',
      source_url: 'https://example.com/sold/lot-1',
      provenance_digest: `sha256:${'1'.repeat(64)}`,
      content_digest: `sha256:${'2'.repeat(64)}`,
      source_sha: SOURCE_SHA, canonical_run_id: RUN_ID,
    }],
    rights: [{
      receipt_id: 'rights-1', receipt_type: 'RIGHTS', status: 'PASS',
      source_id: 'source-one', decision: 'ALLOW_PRIVATE_CURRENT_SOLD',
      purpose: 'PRIVATE_CURRENT_SOLD', source_sha: SOURCE_SHA,
      canonical_run_id: RUN_ID,
      valid_from: '2026-09-01T00:00:00.000Z',
      valid_until: '2026-09-10T00:00:00.000Z',
    }],
  };
  const keyring = {
    schema_version: 'current-sold-governed-receipt-trusted-keyring-v1',
    authority_class: 'GOVERNED_EXTERNAL_ED25519_KEYRING',
    keys: [{
      key_id: 'key-001', issuer_id: 'rights-authority-001',
      algorithm: 'Ed25519', status: 'ACTIVE',
      public_key_pem: publicKey.export({ type: 'spki', format: 'pem' }),
      valid_from: '2026-01-01T00:00:00.000Z',
      valid_until: '2027-01-01T00:00:00.000Z',
    }],
  };
  const payload = {
    schema_version: 'current-sold-governed-receipt-authority-payload-v1',
    authority_class: 'GOVERNED_EXTERNAL_ED25519_KEYRING',
    authorization_id: 'CSRA-track-a-current-sold-001',
    issuer_id: 'rights-authority-001', key_id: 'key-001',
    repository: REPOSITORY, source_sha: SOURCE_SHA,
    canonical_run_id: RUN_ID, purpose: 'PRIVATE_CURRENT_SOLD',
    receipt_registry_digest: canonicalAuthorityDigest(registry),
    acquisition_receipt_set_digest: canonicalAuthorityDigest(registry.acquisitions),
    rights_receipt_set_digest: canonicalAuthorityDigest(registry.rights),
    authorized_record_count: 1,
    issued_at: '2026-09-03T02:50:00.000Z',
    not_before: '2026-09-03T02:55:00.000Z',
    expires_at: '2026-09-03T03:30:00.000Z',
    nonce: '0123456789abcdef0123456789abcdef',
  };
  const envelope = {
    schema_version: 'current-sold-governed-receipt-authority-envelope-v1',
    algorithm: 'Ed25519', payload, signature: '',
  };
  const resign = () => {
    envelope.signature = crypto.sign(null, canonicalAuthorityPayloadBytes(payload), privateKey).toString('base64');
  };
  resign();
  const inputs = () => ({
    authorityEnvelope: envelope, receiptRegistry: registry, trustedKeyring: keyring,
    expectedTrustedKeyringDigest: canonicalAuthorityDigest(keyring),
    expectedReceiptRegistryDigest: canonicalAuthorityDigest(registry),
    expectedRepository: REPOSITORY, expectedSourceSha: SOURCE_SHA,
    expectedCanonicalRunId: RUN_ID, expectedPurpose: 'PRIVATE_CURRENT_SOLD', now: NOW,
  });
  return { registry, keyring, payload, envelope, resign, inputs };
}

function verify(fx) { return verifyGovernedReceiptRegistryAuthority(fx.inputs()); }
function bindRegistry(fx) {
  fx.payload.receipt_registry_digest = canonicalAuthorityDigest(fx.registry);
  fx.payload.acquisition_receipt_set_digest = canonicalAuthorityDigest(fx.registry.acquisitions);
  fx.payload.rights_receipt_set_digest = canonicalAuthorityDigest(fx.registry.rights);
  fx.resign();
}

test('valid external Ed25519 authority verifies but grants no empirical or release authority', () => {
  const fx = fixture();
  const receipt = verify(fx);
  const text = JSON.stringify(receipt);
  assert.equal(receipt.status, 'PASS');
  assert.equal(receipt.authority.signature_verified, true);
  assert.equal(receipt.authority.lawful_empirical_admission_authorized_by_this_receipt_alone, false);
  assert.deepEqual([receipt.claim_boundary.public, receipt.claim_boundary.production, receipt.claim_boundary.g5], ['HOLD','HOLD','HOLD']);
  assert.equal(text.includes(fx.payload.nonce), false);
  assert.equal(text.includes(fx.envelope.signature), false);
  assert.equal(text.includes(fx.keyring.keys[0].public_key_pem), false);
});

test('registry and trusted-keyring digests are exact', () => {
  const fx = fixture();
  assert.throws(() => verifyGovernedReceiptRegistryAuthority({ ...fx.inputs(), expectedReceiptRegistryDigest: `sha256:${'f'.repeat(64)}` }), /CSRA_REGISTRY_DIGEST_MISMATCH/);
  assert.throws(() => verifyGovernedReceiptRegistryAuthority({ ...fx.inputs(), expectedTrustedKeyringDigest: `sha256:${'e'.repeat(64)}` }), /CSRA_KEYRING_DIGEST_MISMATCH/);
});

test('signed payload mutation and runtime binding drift fail closed', () => {
  const fx = fixture();
  fx.payload.nonce = 'abcdefabcdefabcdefabcdefabcdefab';
  assert.throws(() => verify(fx), /CSRA_SIGNATURE_INVALID/);
  const clean = fixture();
  assert.throws(() => verifyGovernedReceiptRegistryAuthority({ ...clean.inputs(), expectedRepository: 'other/repository' }), /CSRA_EXACT_BINDING/);
  assert.throws(() => verifyGovernedReceiptRegistryAuthority({ ...clean.inputs(), expectedSourceSha: 'b'.repeat(40) }), /CSRA_EXACT_BINDING/);
  assert.throws(() => verifyGovernedReceiptRegistryAuthority({ ...clean.inputs(), expectedCanonicalRunId: 'other-run-001' }), /CSRA_EXACT_BINDING/);
});

test('not-yet-valid, expired and overlong authority windows fail closed', () => {
  for (const mutate of [
    fx => { fx.payload.not_before = '2026-09-03T03:05:00.000Z'; },
    fx => { fx.payload.expires_at = '2026-09-03T02:59:59.000Z'; },
    fx => { fx.payload.expires_at = '2026-09-04T02:50:01.000Z'; },
  ]) {
    const fx = fixture(); mutate(fx); fx.resign();
    assert.throws(() => verify(fx), /CSRA_AUTHORITY_(NOT_ACTIVE|WINDOW)/);
  }
});

test('duplicate receipt ids, rights-source mismatch and expired rights fail closed', () => {
  const duplicate = fixture(); duplicate.registry.rights[0].receipt_id = 'acq-1'; bindRegistry(duplicate);
  assert.throws(() => verify(duplicate), /CSRA_DUPLICATE_RECEIPT_ID/);
  const mismatch = fixture(); mismatch.registry.rights[0].source_id = 'source-two'; bindRegistry(mismatch);
  assert.throws(() => verify(mismatch), /CSRA_RIGHTS_SOURCE_SET/);
  const expired = fixture(); expired.registry.rights[0].valid_until = '2026-09-03T02:59:59.000Z'; bindRegistry(expired);
  assert.throws(() => verify(expired), /CSRA_RIGHTS_WINDOW/);
});

test('receipt source/run binding and signed record count are exact', () => {
  const source = fixture(); source.registry.acquisitions[0].source_sha = 'b'.repeat(40); bindRegistry(source);
  assert.throws(() => verify(source), /CSRA_ACQUISITION_SOURCE_SHA/);
  const count = fixture(); count.payload.authorized_record_count = 2; count.resign();
  assert.throws(() => verify(count), /CSRA_RECORD_COUNT/);
  const set = fixture(); set.payload.acquisition_receipt_set_digest = `sha256:${'d'.repeat(64)}`; set.resign();
  assert.throws(() => verify(set), /CSRA_ACQUISITION_SET_DIGEST/);
});

test('inactive, wrong-issuer and non-Ed25519 trust material fail closed', () => {
  for (const mutate of [
    fx => { fx.keyring.keys[0].status = 'REVOKED'; },
    fx => { fx.keyring.keys[0].issuer_id = 'other-authority'; },
    fx => { fx.keyring.keys[0].algorithm = 'RSA'; },
  ]) {
    const fx = fixture(); mutate(fx);
    assert.throws(() => verify(fx), /CSRA_KEY_(AUTHORITY|RING_DIGEST_MISMATCH)|CSRA_KEYRING_DIGEST_MISMATCH/);
  }
});

test('nonce consumption is 0600, sanitized and replay-safe', async () => {
  const fx = fixture(); const receipt = verify(fx);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'csra-nonce-')); fs.chmodSync(directory, 0o700);
  const consumed = await consumeGovernedReceiptRegistryAuthority(receipt, { nonceDirectory: directory, now: NOW });
  assert.equal(consumed.status, 'CONSUMED');
  assert.equal(fs.statSync(consumed.receipt_path).mode & 0o777, 0o600);
  assert.equal(fs.readFileSync(consumed.receipt_path, 'utf8').includes(fx.payload.nonce), false);
  await assert.rejects(() => consumeGovernedReceiptRegistryAuthority(receipt, { nonceDirectory: directory, now: NOW }), /CSRA_NONCE_REPLAY/);
});

test('nonce consumption rejects insecure directories and expired authority', async () => {
  const fx = fixture(); const receipt = verify(fx);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'csra-mode-')); fs.chmodSync(directory, 0o755);
  await assert.rejects(() => consumeGovernedReceiptRegistryAuthority(receipt, { nonceDirectory: directory, now: NOW }), /CSRA_NONCE_DIRECTORY_INVALID/);
  fs.chmodSync(directory, 0o700);
  await assert.rejects(() => consumeGovernedReceiptRegistryAuthority(receipt, { nonceDirectory: directory, now: new Date('2026-09-03T03:31:00.000Z') }), /CSRA_CONSUME_EXPIRED/);
});
