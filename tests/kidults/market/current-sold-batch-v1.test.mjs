import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  buildCurrentSoldBatchBundle,
  validateCurrentSoldBatchEnvelope
} from '../../../scripts/kidults/market/current-sold-batch-v1.mjs';
import {
  NOW,
  batchEnvelope,
  rawObservation,
  receiptRegistryFor,
  sealObservation
} from './current-sold-test-helpers-v1.mjs';

function validBatch() {
  const input = sealObservation(rawObservation());
  return {
    input,
    envelope: batchEnvelope([input]),
    registry: receiptRegistryFor(input)
  };
}

test('builds deterministic PASS bundle, canonical Evidence, and admission receipt', () => {
  const { envelope, registry } = validBatch();
  const first = buildCurrentSoldBatchBundle(envelope, registry, { now: NOW });
  const second = buildCurrentSoldBatchBundle(structuredClone(envelope), structuredClone(registry), { now: NOW });
  assert.equal(first.receipt.status, 'PASS');
  assert.equal(first.receipt.receipt_id, second.receipt.receipt_id);
  assert.equal(first.receipt_registry.schema_version, 'current-sold-receipt-registry-v1');
  assert.equal(first.receipt.evaluated_at, NOW.toISOString());
  assert.equal(first.event_versions.length, 1);
  assert.equal(first.evidence.length, 1);
  assert.equal(first.receipt.counts.admitted, 1);
  assert.equal(first.receipt.counts.evidence, 1);
  assert.equal(first.receipt.ledger.write_eligible, true);
  assert.equal(first.admission.atomic_batch, true);
  assert.equal(first.receipt.claim_boundary.empirical_global_current_sold_claim, 'UNSET');
});

test('fails before admission when envelope source or run binding drifts', () => {
  const { envelope } = validBatch();
  const sourceDrift = structuredClone(envelope);
  sourceDrift.observations[0].source_sha = '2'.repeat(40);
  assert.throws(
    () => validateCurrentSoldBatchEnvelope(sourceDrift),
    /CURRENT_SOLD_BATCH_SOURCE_SHA_BINDING_MISMATCH_AT_0/
  );
  const runDrift = structuredClone(envelope);
  runDrift.observations[0].canonical_run_id = 'other-run-001';
  assert.throws(
    () => validateCurrentSoldBatchEnvelope(runDrift),
    /CURRENT_SOLD_BATCH_RUN_BINDING_MISMATCH_AT_0/
  );
});

test('rejects ambiguous duplicate receipt ids in the registry', () => {
  const { envelope, registry } = validBatch();
  registry.rights[0].receipt_id = registry.acquisitions[0].receipt_id;
  assert.throws(
    () => buildCurrentSoldBatchBundle(envelope, registry, { now: NOW }),
    /CURRENT_SOLD_BATCH_DUPLICATE_RECEIPT_ID/
  );
});

test('rejects malformed unused registry entries instead of ignoring them', () => {
  const { envelope, registry } = validBatch();
  registry.acquisitions.push({
    receipt_id: 'unused-acq',
    receipt_type: 'ACQUISITION',
    status: 'PASS',
    source_id: 'auction_house_a',
    source_event_id: 'unused-lot',
    source_url: 'https://example.com/results/unused-lot',
    provenance_digest: 'not-a-digest',
    content_digest: `sha256:${'b'.repeat(64)}`,
    source_sha: registry.acquisitions[0].source_sha,
    canonical_run_id: registry.acquisitions[0].canonical_run_id
  });
  assert.throws(
    () => buildCurrentSoldBatchBundle(envelope, registry, { now: NOW }),
    /CURRENT_SOLD_BATCH_INVALID_ACQUISITION_PROVENANCE_DIGEST/
  );
});

test('emits FAIL_CLOSED receipt and blocks ledger eligibility for unregistered receipt', () => {
  const { envelope, registry } = validBatch();
  envelope.observations[0].acquisition_receipt_id = 'acq-not-registered';
  const bundle = buildCurrentSoldBatchBundle(envelope, registry, { now: NOW });
  assert.equal(bundle.receipt.status, 'FAIL_CLOSED');
  assert.equal(bundle.receipt.counts.admitted, 0);
  assert.equal(bundle.receipt.counts.rejected, 1);
  assert.equal(bundle.evidence.length, 0);
  assert.equal(bundle.receipt.ledger.write_eligible, false);
  assert.equal(bundle.receipt.ledger.state, 'BLOCKED_BY_ADMISSION');
});

test('mixed partial batch withholds all event versions and Evidence', () => {
  const good = sealObservation(rawObservation({
    source_event_id: 'batch-good',
    lot_or_listing_id: 'batch-good',
    source_url: 'https://example.com/results/batch-good',
    acquisition_receipt_id: 'batch-good-acq',
    rights_receipt_id: 'batch-good-rights'
  }));
  const bad = sealObservation(rawObservation({
    source_event_id: 'batch-bad',
    lot_or_listing_id: 'batch-bad',
    source_url: 'https://example.com/results/batch-bad',
    acquisition_receipt_id: 'batch-missing-acq',
    rights_receipt_id: 'batch-good-rights'
  }));
  const registry = receiptRegistryFor(good);
  const bundle = buildCurrentSoldBatchBundle(batchEnvelope([good, bad]), registry, { now: NOW });
  assert.equal(bundle.receipt.status, 'PARTIAL_FAIL_CLOSED');
  assert.equal(bundle.admission.validated_candidate_count, 1);
  assert.equal(bundle.receipt.counts.admitted, 0);
  assert.equal(bundle.receipt.counts.evidence, 0);
  assert.deepEqual(bundle.event_versions, []);
  assert.deepEqual(bundle.evidence, []);
  assert.equal(bundle.receipt.ledger.write_eligible, false);
});

test('legacy raw full-bundle CLI is disabled', () => {
  const scriptPath = fileURLToPath(new URL('../../../scripts/kidults/market/current-sold-batch-v1.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [scriptPath], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /CURRENT_SOLD_BATCH_LEGACY_CLI_DISABLED_USE_PRIVATE_DRY_RUN/);
});
