import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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

test('control smoke receipt keeps synthetic and empirical counts separate', () => {
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
  assert.equal(receipt.counts.empirical_admitted, 0);
  assert.equal(receipt.claim_boundary.claim_ceiling, 'CONTROL_ONLY');
  assert.equal(receipt.claim_boundary.synthetic_is_empirical, false);
  assert.equal(receipt.ledger.write_performed, false);
});

test('dry-run receipt contains no raw source URL, object identity, or price', () => {
  const input = valid();
  const registry = receiptRegistryFor(input);
  const receipt = buildCurrentSoldDryRunReceipt(batchEnvelope([input]), registry, {
    now: NOW,
    executionClass: 'LAWFUL_EMPIRICAL_PRIVATE',
    registryAuthorityClass: 'GOVERNED_LEDGER_DIGEST',
    expectedReceiptRegistryDigest: canonicalJsonDigest(registry)
  });
  const serialized = JSON.stringify(receipt);
  assert.equal(receipt.counts.empirical_admitted, 1);
  assert.equal(receipt.claim_boundary.claim_ceiling, 'PIPELINE_FUNCTIONAL_ONLY');
  assert.equal(receipt.privacy.raw_bundle_persisted, false);
  assert.equal(serialized.includes(input.source_url), false);
  assert.equal(serialized.includes(input.canonical_object_id), false);
  assert.equal(serialized.includes(String(input.realized_consideration)), false);
});

test('dry-run receipt file is created exclusively with mode 0600', async () => {
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
  await writeCurrentSoldDryRunReceipt(output, receipt);
  assert.equal(fs.statSync(output).mode & 0o777, 0o600);
  await assert.rejects(
    () => writeCurrentSoldDryRunReceipt(output, receipt),
    /EEXIST/
  );
});

test('empirical input must remain inside the private mount and deny open permissions', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'current-sold-private-root-'));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'current-sold-outside-'));
  const insideFile = path.join(root, 'input.json');
  const outsideFile = path.join(outside, 'input.json');
  fs.writeFileSync(insideFile, '{}', { mode: 0o600 });
  fs.writeFileSync(outsideFile, '{}', { mode: 0o600 });

  await assert.rejects(
    () => validateCurrentSoldDryRunInputPath(outsideFile, {
      executionClass: 'LAWFUL_EMPIRICAL_PRIVATE',
      privateMountRoot: root
    }),
    /CURRENT_SOLD_DRY_RUN_INPUT_OUTSIDE_PRIVATE_MOUNT/
  );

  fs.chmodSync(insideFile, 0o644);
  await assert.rejects(
    () => validateCurrentSoldDryRunInputPath(insideFile, {
      executionClass: 'LAWFUL_EMPIRICAL_PRIVATE',
      privateMountRoot: root
    }),
    /CURRENT_SOLD_DRY_RUN_INPUT_PERMISSIONS_TOO_OPEN/
  );

  fs.chmodSync(insideFile, 0o600);
  assert.equal(
    await validateCurrentSoldDryRunInputPath(insideFile, {
      executionClass: 'LAWFUL_EMPIRICAL_PRIVATE',
      privateMountRoot: root
    }),
    path.resolve(insideFile)
  );
});

test('partial dry-run withholds all canonical output while preserving diagnostics counts', () => {
  const good = valid({
    source_event_id: 'dry-good',
    lot_or_listing_id: 'dry-good',
    source_url: 'https://example.com/results/dry-good',
    acquisition_receipt_id: 'dry-acq-good',
    rights_receipt_id: 'dry-rights-good'
  });
  const bad = valid({
    source_event_id: 'dry-bad',
    lot_or_listing_id: 'dry-bad',
    source_url: 'https://example.com/results/dry-bad',
    acquisition_receipt_id: 'dry-acq-missing',
    rights_receipt_id: 'dry-rights-good'
  });
  const registry = receiptRegistryFor(good);
  const receipt = buildCurrentSoldDryRunReceipt(batchEnvelope([good, bad]), registry, {
    now: NOW,
    executionClass: 'LAWFUL_EMPIRICAL_PRIVATE',
    registryAuthorityClass: 'GOVERNED_LEDGER_DIGEST',
    expectedReceiptRegistryDigest: canonicalJsonDigest(registry)
  });
  assert.equal(receipt.status, 'PARTIAL_FAIL_CLOSED');
  assert.equal(receipt.counts.validated_candidates, 1);
  assert.equal(receipt.counts.admitted, 0);
  assert.equal(receipt.counts.evidence, 0);
  assert.equal(receipt.counts.empirical_admitted, 0);
  assert.equal(receipt.atomicity.non_pass_admission_withheld, true);
  assert.equal(receipt.ledger.pass_bundle_eligible, false);
});
