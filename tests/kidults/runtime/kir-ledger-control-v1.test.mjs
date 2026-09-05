import test from 'node:test';
import assert from 'node:assert/strict';
import { appendCurrentSoldBundle } from '../../../scripts/kidults/market/current-sold-postgres-ledger-v1.mjs';
import { canonicalJsonDigest, canonicalCurrentSoldBatchReceiptId } from '../../../scripts/kidults/market/current-sold-batch-v1.mjs';
import { controlFixture, rebindRegistry, TEST_IDENTITY } from './kir-current-sold-control-fixtures-v1.mjs';
import { KirMemoryLedgerClient } from './kir-memory-ledger-client-v1.mjs';
import { buildControlLedgerBundle, runKirLedgerControlProbe } from './kir-ledger-control-probe-v1.mjs';

for (const count of [1, 5]) test(`KIR actual writer stores ${count} synthetic events/Evidence with exact readback in test transport`, async () => {
  const input = controlFixture(TEST_IDENTITY, count);
  const {control, bundle} = buildControlLedgerBundle(input);
  const client = new KirMemoryLedgerClient();
  const result = await appendCurrentSoldBundle(client, bundle, {now: input.now});
  assert.equal(control.ledger_write_eligible, false); // Test harness does not create a live capability.
  assert.equal(result.counts.events_inserted, count);
  assert.equal(result.counts.evidence_inserted, count);
  assert.equal(result.source_sha, TEST_IDENTITY.source_sha);
  assert.equal(result.canonical_run_id, `kir-fixture-${TEST_IDENTITY.run_id}-${TEST_IDENTITY.run_attempt}`);
  assert.equal(client.calls[0], 'BEGIN'); assert.equal(client.calls.at(-1), 'COMMIT');
  for (const event of bundle.admission.admitted) assert.deepEqual(client.events.get(event.event_id)[0].event_payload, event);
  for (const evidence of bundle.evidence) assert.deepEqual(client.evidence.get(evidence.evidence_id).evidence_payload, evidence);
  assert.deepEqual(result.claim_boundary, {public: 'HOLD', production: 'HOLD', g5: 'HOLD'});
});

test('integrated ledger probe verifies write/readback/replay/partial rejection/rollback without live authority', async () => {
  const packet = await runKirLedgerControlProbe(TEST_IDENTITY);
  assert.equal(packet.case_count, 5);
  assert.equal(packet.database_transport, 'IN_MEMORY_TEST_DOUBLE_NOT_POSTGRESQL');
  assert.equal(packet.postgres_rows_written, 0);
  assert.equal(packet.empirical_current_sold_delta, 0);
  for (const key of ['provider_authority','database_authority','empirical_authority','runtime_activation_authorized','producer_health_authority','promotion_eligible','raw_rows_emitted','raw_evidence_emitted','bundle_emitted','track_b_started','projection_approved']) assert.equal(packet[key], false);
  for (const key of ['public_release','production','g5']) assert.equal(packet[key], 'HOLD');
});

test('same synthetic generation replay never duplicates event, Evidence, or batch receipt', async () => {
  const input = controlFixture(); const {bundle} = buildControlLedgerBundle(input);
  const client = new KirMemoryLedgerClient();
  await appendCurrentSoldBundle(client, bundle, {now: input.now}); const before = client.state();
  const replay = await appendCurrentSoldBundle(client, structuredClone(bundle), {now: input.now});
  assert.deepEqual(client.state(), before);
  assert.deepEqual(replay.counts, {events_inserted:0, events_idempotent:1,evidence_inserted:0,evidence_idempotent:1,receipts_inserted:0,receipts_idempotent:1});
});

for (const collection of ['acquisitions','rights']) test(`missing ${collection} cannot issue any SQL`, async () => {
  const input = controlFixture(TEST_IDENTITY, 2); input.receiptRegistry[collection].pop();
  const {bundle} = buildControlLedgerBundle(rebindRegistry(input)); const client = new KirMemoryLedgerClient();
  await assert.rejects(() => appendCurrentSoldBundle(client, bundle, {now: input.now}), /CURRENT_SOLD_LEDGER_ADMISSION_NOT_PASS/);
  assert.equal(client.calls.length, 0);
});

for (const failAt of ['event-insert-v1','evidence-insert-v1','receipt-insert-v1','COMMIT']) test(`injected ${failAt} failure rolls back all simulated writes and preserves root error`, async () => {
  const input = controlFixture(TEST_IDENTITY, 2); const {bundle} = buildControlLedgerBundle(input);
  const client = new KirMemoryLedgerClient({failAt, failOccurrence: failAt === 'event-insert-v1' ? 2 : 1});
  const before = client.state();
  await assert.rejects(() => appendCurrentSoldBundle(client, bundle, {now: input.now}), new RegExp(`KIR_TEST_INJECTED_FAILURE:${failAt}`));
  assert.deepEqual(client.state(), before); assert.equal(client.calls.at(-1), 'ROLLBACK');
});

function rebindReceipt(bundle) {
  const r = bundle.receipt;
  r.receipt_id = canonicalCurrentSoldBatchReceiptId(Object.fromEntries([
    'batch_id','source_sha','canonical_run_id','evaluated_at','envelope_digest','receipt_registry_digest','event_versions_digest','evidence_digest','admission_digest'
  ].map(key => [key, r[key]])));
}
const mutations = [
  ['Evidence payload', x => { x.evidence[0].assertion.realized_consideration += 1; x.receipt.evidence_digest = canonicalJsonDigest(x.evidence); rebindReceipt(x); }, /CURRENT_SOLD_LEDGER_EVIDENCE_CONTENT_MISMATCH/],
  ['receipt counts', x => { x.receipt.counts.evidence = 999; }, /CURRENT_SOLD_LEDGER_RECEIPT_COUNT_MISMATCH/],
  ['registry payload', x => { x.receipt_registry.acquisitions[0].status = 'FAIL'; }, /CURRENT_SOLD_LEDGER_RECEIPT_REGISTRY_DIGEST_MISMATCH/],
  ['event version omission', x => { x.event_versions = []; }, /CURRENT_SOLD_LEDGER_EVENT_VERSIONS_REQUIRED/],
  ['false admission status', x => { x.admission.status = 'PARTIAL_FAIL_CLOSED'; }, /CURRENT_SOLD_LEDGER_ADMISSION_NOT_PASS/],
];
for (const [name, mutate, error] of mutations) test(`writer independently rejects tampered ${name} before BEGIN`, async () => {
  const input = controlFixture(); const {bundle} = buildControlLedgerBundle(input); mutate(bundle);
  const client = new KirMemoryLedgerClient();
  await assert.rejects(() => appendCurrentSoldBundle(client, bundle, {now: input.now}), error);
  assert.equal(client.calls.length, 0);
});

test('newer KIR run/attempt is not recorded using predecessor generation identity', async () => {
  const identity = {...TEST_IDENTITY, source_sha:'2'.repeat(40), run_id:102, run_attempt:2};
  const packet = await runKirLedgerControlProbe(identity);
  for (const key of Object.keys(identity)) assert.equal(packet[key], identity[key]);
});

test('control bridge still rejects non-synthetic input before writer test transport', () => {
  const input = controlFixture(); input.envelope.observations[0].source_url = 'https://real-provider.example/result';
  assert.throws(() => buildControlLedgerBundle(input));
});

test('test SQL client is fail-closed on unknown statements and transactions', async () => {
  const client = new KirMemoryLedgerClient();
  await assert.rejects(() => client.query('DELETE FROM anything'), /KIR_TEST_SQL_OPERATION_UNKNOWN/);
  await assert.rejects(() => client.query('COMMIT'), /KIR_TEST_QUERY_OUTSIDE_TRANSACTION/);
  assert.equal(client.snapshot, null);
});

test('workflow requires ledger proof before terminal success and preserves failure artifact', async () => {
  const {readFileSync} = await import('node:fs');
  const workflow = readFileSync('.github/workflows/kidults-kir-runtime-contract-v1.yml','utf8');
  for (const marker of ['steps.ledger_bridge.outcome', "('LEDGER',os.environ.get('LEDGER_OUTCOME',''))", 'kidults-kir-ledger-control-receipt-v1.json', 'IN_MEMORY_TEST_DOUBLE_NOT_POSTGRESQL', 'ledger_receipt_file_sha256', 'current-sold-postgres-ledger-atomic-recompute-v1.test.mjs']) assert.ok(workflow.includes(marker), marker);
  assert.ok(workflow.indexOf('id: ledger_bridge') < workflow.indexOf('id: reconcile'));
  assert.ok(workflow.indexOf('id: reconcile') < workflow.indexOf('Upload exact-head KIR terminal packet'));
  assert.ok(workflow.includes('if: ${{ always() }}'));
  assert.ok(!workflow.includes('secrets.'));
});
