import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  PIPELINE_STAGES,
  SYNTHETIC_NOTICE,
  SyntheticReplayLedger,
  assertEmpiricalAdmission,
  buildPortalProjection,
  buildSyntheticDataset,
  digest,
  executeSyntheticDataset,
  renderSyntheticPortal,
  runNegativeIsolationTests,
  validateProviderAdapterManifest,
} from '../../../scripts/kidults/synthetic/synthetic-platform-validation-v1-lib.mjs';

const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const verticals = read('coordination/kidults/registry/core-verticals.json');
const providers = read('coordination/kidults/synthetic/launch-cohort-provider-adapters-v1.json');

test('generates 120 deterministic records across all eight verticals', () => {
  const first = buildSyntheticDataset(verticals);
  const second = buildSyntheticDataset(verticals);
  assert.equal(first.record_count, 120);
  assert.equal(first.vertical_count, 8);
  assert.equal(new Set(first.records.map((record) => record.vertical_id)).size, 8);
  assert.equal(digest(first), digest(second));
  assert.equal(first.dataset_digest, second.dataset_digest);
});

test('executes every record through the exact non-promotable pipeline', () => {
  const pipeline = executeSyntheticDataset(buildSyntheticDataset(verticals));
  assert.equal(pipeline.record_count, 120);
  assert.equal(pipeline.stage_count_per_record, 12);
  assert.equal(pipeline.total_stage_receipt_count, 1440);
  assert.deepEqual(pipeline.stage_order, PIPELINE_STAGES);
  assert.ok(pipeline.results.every((result) => result.stage_receipts
    .every((receipt) => receipt.empirical === false && receipt.promotion_eligible === false)));
  assert.equal(pipeline.provider_activation_count, 0);
  assert.equal(pipeline.rights_promotion_count, 0);
  assert.equal(pipeline.production_eligible_count, 0);
  assert.equal(pipeline.public_eligible_count, 0);
});

test('rejects synthetic-to-empirical confusion and exact-ID lineage mutation', () => {
  const dataset = buildSyntheticDataset(verticals);
  const portal = buildPortalProjection(dataset);
  validateProviderAdapterManifest(providers);
  const result = runNegativeIsolationTests(dataset, portal, providers);
  assert.equal(result.result, 'VERIFIED_PASS');
  assert.equal(result.mutation_rejections, 13);
  assert.equal(result.exact_replay_idempotent, true);
  assert.equal(result.changed_replay_rejected, true);
  assert.equal(result.empirical_admission_rejected, true);
});

test('permits exact replay idempotently but rejects changed payload under the same immutable ID', () => {
  const record = buildSyntheticDataset(verticals).records[0];
  const ledger = new SyntheticReplayLedger();
  assert.equal(ledger.admit(record).decision, 'ADMITTED_ONCE');
  assert.equal(ledger.admit(record).decision, 'IDEMPOTENT_REPLAY');
  const changed = structuredClone(record);
  changed.observation.observed_at = '2026-09-08T00:00:00.000Z';
  assert.throws(() => ledger.admit(changed), /SPV_REPLAY_LINEAGE_MUTATION_REJECTED/);
  assert.throws(() => assertEmpiricalAdmission(record), /SPV_SYNTHETIC_TO_EMPIRICAL_ADMISSION_FORBIDDEN/);
});

test('renders every synthetic card with a persistent internal-only notice', () => {
  const dataset = buildSyntheticDataset(verticals);
  const portal = buildPortalProjection(dataset);
  const html = renderSyntheticPortal(portal);
  assert.equal(portal.cards.length, 120);
  assert.equal((html.match(new RegExp(SYNTHETIC_NOTICE, 'g')) ?? []).length, 122);
  assert.match(html, /data-environment="SYNTHETIC"/);
  assert.doesNotMatch(html, /environment="PRODUCTION"/);
});

test('keeps all launch-cohort adapter foundations disconnected and credential-free', () => {
  validateProviderAdapterManifest(providers);
  assert.equal(providers.adapters.length, 6);
  assert.ok(providers.adapters.every((adapter) => adapter.rights_receipt_slot.value === 'NONE'));
  assert.ok(providers.adapters.every((adapter) => adapter.credential_slot.value === 'NONE'));
  assert.ok(providers.adapters.every((adapter) => adapter.capability_manifest.live_capabilities_verified === false));
  assert.equal(providers.activation_policy.live_connections_allowed, false);
  assert.equal(providers.production, 'HOLD');
  assert.equal(providers.public, 'HOLD');
  assert.equal(providers.g5, 'HOLD');
});
