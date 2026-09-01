import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { canonicalContentDigest } from '../../../scripts/kidults/market/current-sold-engine-v1.mjs';
import { canonicalJsonDigest } from '../../../scripts/kidults/market/current-sold-batch-v1.mjs';
import {
  buildCurrentSoldDryRunReceipt,
  validateCurrentSoldDryRunInputPath,
  writeCurrentSoldDryRunReceipt
} from '../../../scripts/kidults/market/current-sold-private-dry-run-v1.mjs';
import {
  NOW,
  batchEnvelope,
  rawObservation,
  receiptRegistryFor,
  sealObservation
} from './current-sold-test-helpers-v1.mjs';

function valid(overrides = {}) {
  return sealObservation(rawObservation(overrides));
}

function dynamicCandidate(overrides = {}) {
  const now = new Date(Math.floor(Date.now() / 1000) * 1000);
  const input = rawObservation({
    sold_at: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
    observed_at: new Date(now.getTime() - 60 * 60 * 1000).toISOString(),
    ...overrides
  });
  input.content_digest = canonicalContentDigest(input, { now });
  const registry = receiptRegistryFor(input);
  for (const rights of registry.rights) {
    rights.valid_from = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    rights.valid_until = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
  }
  const envelope = batchEnvelope([input], { created_at: now.toISOString() });
  return { now, input, registry, envelope };
}

test('control smoke receipt keeps synthetic, candidate, and lawful counts separate', () => {
  const input = valid();
  const registry = receiptRegistryFor(input);
  const receipt = buildCurrentSoldDryRunReceipt(batchEnvelope([input]), registry, {
    now: NOW,
    executionClass: 'CONTROL_SYNTHETIC',
    registryAuthorityClass: 'CONTROL_SYNTHETIC_GENERATOR',
    expectedReceiptRegistryDigest: canonicalJsonDigest(registry)
  });
  assert.equal(receipt.status, 'PASS');
  assert.equal(receipt.counts.admitted, 1);
  assert.equal(receipt.counts.control_synthetic_admitted, 1);
  assert.equal(receipt.counts.private_candidate_admitted, 0);
  assert.equal(receipt.counts.lawful_empirical_admitted, 0);
  assert.equal(receipt.claim_boundary.claim_ceiling, 'CONTROL_ONLY');
  assert.equal(receipt.claim_boundary.synthetic_is_empirical, false);
  assert.equal(receipt.authority.governed_registry_authority_verified, false);
  assert.equal(receipt.ledger.write_performed, false);
});

test('private candidate receipt is redacted and cannot claim lawful empirical admission', () => {
  const { input, registry, envelope } = dynamicCandidate();
  const receipt = buildCurrentSoldDryRunReceipt(envelope, registry, {
    executionClass: 'EMPIRICAL_CANDIDATE_PRIVATE',
    registryAuthorityClass: 'EXTERNAL_EXACT_DIGEST_UNVERIFIED',
    expectedReceiptRegistryDigest: canonicalJsonDigest(registry)
  });
  const serialized = JSON.stringify(receipt);
  assert.equal(receipt.status, 'PASS');
  assert.equal(receipt.counts.private_candidate_admitted, 1);
  assert.equal(receipt.counts.lawful_empirical_admitted, 0);
  assert.equal(receipt.authority.registry_digest_exact_match, true);
  assert.equal(receipt.authority.governed_registry_authority_verified, false);
  assert.equal(receipt.authority.lawful_admission_authorized, false);
  assert.equal(receipt.claim_boundary.claim_ceiling, 'PRIVATE_PIPELINE_CANDIDATE_ONLY');
  assert.equal(receipt.claim_boundary.candidate_is_lawful_empirical, false);
  assert.equal(receipt.privacy.raw_bundle_persisted, false);
  assert.equal(serialized.includes(input.source_url), false);
  assert.equal(serialized.includes(input.canonical_object_id), false);
  assert.equal(serialized.includes(String(input.realized_consideration)), false);
  assert.equal(serialized.includes(envelope.batch_id), false);
  assert.equal(serialized.includes(input.canonical_run_id), false);
});

test('self-declared lawful empirical execution class is unavailable', () => {
  const input = valid();
  const registry = receiptRegistryFor(input);
  assert.throws(
    () => buildCurrentSoldDryRunReceipt(batchEnvelope([input]), registry, {
      executionClass: 'LAWFUL_EMPIRICAL_PRIVATE',
      registryAuthorityClass: 'GOVERNED_LEDGER_DIGEST',
      expectedReceiptRegistryDigest: canonicalJsonDigest(registry)
    }),
    /CURRENT_SOLD_DRY_RUN_EXECUTION_CLASS_INVALID/
  );
});

test('private candidate evaluation time cannot be caller-backdated', () => {
  const { registry, envelope } = dynamicCandidate();
  assert.throws(
    () => buildCurrentSoldDryRunReceipt(envelope, registry, {
      now: NOW,
      executionClass: 'EMPIRICAL_CANDIDATE_PRIVATE',
      registryAuthorityClass: 'EXTERNAL_EXACT_DIGEST_UNVERIFIED',
      expectedReceiptRegistryDigest: canonicalJsonDigest(registry)
    }),
    /CURRENT_SOLD_DRY_RUN_EMPIRICAL_TIME_OVERRIDE_FORBIDDEN/
  );
});

test('control receipt file is created exclusively with mode 0600', async () => {
  const input = valid();
  const registry = receiptRegistryFor(input);
  const receipt = buildCurrentSoldDryRunReceipt(batchEnvelope([input]), registry, {
    now: NOW,
    executionClass: 'CONTROL_SYNTHETIC',
    registryAuthorityClass: 'CONTROL_SYNTHETIC_GENERATOR',
    expectedReceiptRegistryDigest: canonicalJsonDigest(registry)
  });
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'current-sold-dry-run-receipt-'));
  const output = path.join(temp, 'private', 'receipt.json');
  await writeCurrentSoldDryRunReceipt(output, receipt, { executionClass: 'CONTROL_SYNTHETIC' });
  assert.equal(fs.statSync(output).mode & 0o777, 0o600);
  await assert.rejects(
    () => writeCurrentSoldDryRunReceipt(output, receipt, { executionClass: 'CONTROL_SYNTHETIC' }),
    /EEXIST/
  );
});

test('private candidate input must remain inside a 0700 mount as an exact 0600 file', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'current-sold-private-root-'));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'current-sold-outside-'));
  const insideFile = path.join(root, 'input.json');
  const outsideFile = path.join(outside, 'input.json');
  fs.writeFileSync(insideFile, '{}', { mode: 0o600 });
  fs.writeFileSync(outsideFile, '{}', { mode: 0o600 });

  await assert.rejects(
    () => validateCurrentSoldDryRunInputPath(outsideFile, {
      executionClass: 'EMPIRICAL_CANDIDATE_PRIVATE',
      privateMountRoot: root
    }),
    /CURRENT_SOLD_DRY_RUN_INPUT_OUTSIDE_PRIVATE_MOUNT/
  );

  fs.chmodSync(insideFile, 0o640);
  await assert.rejects(
    () => validateCurrentSoldDryRunInputPath(insideFile, {
      executionClass: 'EMPIRICAL_CANDIDATE_PRIVATE',
      privateMountRoot: root
    }),
    /CURRENT_SOLD_DRY_RUN_INPUT_MODE_INVALID/
  );

  fs.chmodSync(insideFile, 0o600);
  assert.equal(
    await validateCurrentSoldDryRunInputPath(insideFile, {
      executionClass: 'EMPIRICAL_CANDIDATE_PRIVATE',
      privateMountRoot: root
    }),
    fs.realpathSync(insideFile)
  );
});

test('private candidate input rejects a symlinked parent escape', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'current-sold-private-link-root-'));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'current-sold-private-link-outside-'));
  const outsideFile = path.join(outside, 'input.json');
  fs.writeFileSync(outsideFile, '{}', { mode: 0o600 });
  fs.symlinkSync(outside, path.join(root, 'escape'));
  await assert.rejects(
    () => validateCurrentSoldDryRunInputPath(path.join(root, 'escape', 'input.json'), {
      executionClass: 'EMPIRICAL_CANDIDATE_PRIVATE',
      privateMountRoot: root
    }),
    /CURRENT_SOLD_DRY_RUN_SYMLINK_COMPONENT_FORBIDDEN/
  );
});

test('private candidate output requires an existing 0700 directory inside the private mount', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'current-sold-private-output-root-'));
  const receipts = path.join(root, 'receipts');
  fs.mkdirSync(receipts, { mode: 0o700 });
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'current-sold-private-output-outside-'));

  await assert.rejects(
    () => writeCurrentSoldDryRunReceipt(path.join(outside, 'receipt.json'), {}, {
      executionClass: 'EMPIRICAL_CANDIDATE_PRIVATE',
      privateMountRoot: root
    }),
    /CURRENT_SOLD_DRY_RUN_OUTPUT_OUTSIDE_PRIVATE_MOUNT/
  );

  const output = path.join(receipts, 'receipt.json');
  await writeCurrentSoldDryRunReceipt(output, {}, {
    executionClass: 'EMPIRICAL_CANDIDATE_PRIVATE',
    privateMountRoot: root
  });
  assert.equal(fs.statSync(output).mode & 0o777, 0o600);
});

test('partial private candidate dry-run withholds all canonical output', () => {
  const now = new Date(Math.floor(Date.now() / 1000) * 1000);
  const good = rawObservation({
    source_event_id: 'dry-good',
    lot_or_listing_id: 'dry-good',
    source_url: 'https://example.com/results/dry-good',
    acquisition_receipt_id: 'dry-acq-good',
    rights_receipt_id: 'dry-rights-good',
    sold_at: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
    observed_at: new Date(now.getTime() - 60 * 60 * 1000).toISOString()
  });
  good.content_digest = canonicalContentDigest(good, { now });
  const bad = rawObservation({
    source_event_id: 'dry-bad',
    lot_or_listing_id: 'dry-bad',
    source_url: 'https://example.com/results/dry-bad',
    acquisition_receipt_id: 'dry-acq-missing',
    rights_receipt_id: 'dry-rights-good',
    sold_at: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
    observed_at: new Date(now.getTime() - 60 * 60 * 1000).toISOString()
  });
  bad.content_digest = canonicalContentDigest(bad, { now });
  const registry = receiptRegistryFor(good);
  for (const rights of registry.rights) {
    rights.valid_from = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    rights.valid_until = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
  }
  const receipt = buildCurrentSoldDryRunReceipt(
    batchEnvelope([good, bad], { created_at: now.toISOString() }),
    registry,
    {
      executionClass: 'EMPIRICAL_CANDIDATE_PRIVATE',
      registryAuthorityClass: 'EXTERNAL_EXACT_DIGEST_UNVERIFIED',
      expectedReceiptRegistryDigest: canonicalJsonDigest(registry)
    }
  );
  assert.equal(receipt.status, 'PARTIAL_FAIL_CLOSED');
  assert.equal(receipt.counts.validated_candidates, 1);
  assert.equal(receipt.counts.admitted, 0);
  assert.equal(receipt.counts.evidence, 0);
  assert.equal(receipt.counts.private_candidate_admitted, 0);
  assert.equal(receipt.counts.lawful_empirical_admitted, 0);
  assert.equal(receipt.atomicity.non_pass_admission_withheld, true);
  assert.equal(receipt.ledger.pass_bundle_eligible, false);
});
