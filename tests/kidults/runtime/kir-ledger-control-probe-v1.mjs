// Deterministic integration probe. Only the SQL transport is a test double.
import assert from 'node:assert/strict';
import { evaluateKirCurrentSoldControl } from '../../../scripts/kidults/runtime/kir-current-sold-control-bridge-v1.mjs';
import { buildAtomicCurrentSoldBatchBundle } from '../../../scripts/kidults/market/current-sold-atomic-batch-v1.mjs';
import { appendCurrentSoldBundle } from '../../../scripts/kidults/market/current-sold-postgres-ledger-v1.mjs';
import { canonicalJsonDigest } from '../../../scripts/kidults/market/current-sold-batch-v1.mjs';
import { controlFixture, rebindRegistry } from './kir-current-sold-control-fixtures-v1.mjs';
import { KirMemoryLedgerClient } from './kir-memory-ledger-client-v1.mjs';

export function buildControlLedgerBundle(input) {
  // Enforce the existing KIR synthetic-only boundary before reaching the writer.
  const control = evaluateKirCurrentSoldControl(input);
  const bundle = buildAtomicCurrentSoldBatchBundle(input.envelope, input.receiptRegistry,
    {now: input.now, expectedReceiptRegistryDigest: input.expectedReceiptRegistryDigest});
  assert.equal(bundle.receipt.status, control.engine_control_status);
  return {control, bundle};
}

function checkReadback(client, bundle) {
  assert.equal(client.events.size, bundle.admission.admitted_count);
  assert.equal(client.evidence.size, bundle.evidence.length);
  assert.equal(client.receipts.size, 1);
  for (const event of bundle.admission.admitted) {
    const stored = client.events.get(event.event_id);
    assert.equal(stored.length, 1);
    assert.deepEqual(stored[0].event_payload, event);
    assert.equal(stored[0].source_sha, bundle.envelope.source_sha);
    assert.equal(stored[0].canonical_run_id, bundle.envelope.canonical_run_id);
  }
  for (const evidence of bundle.evidence) {
    const stored = client.evidence.get(evidence.evidence_id);
    assert.deepEqual(stored.evidence_payload, evidence);
    assert.equal(stored.evidence_digest, canonicalJsonDigest(evidence));
    const events = client.events.get(evidence.lineage.current_sold_event_id);
    assert.ok(events.some(event => event.content_digest === evidence.lineage.current_sold_content_digest));
  }
  assert.deepEqual(client.receipts.get(bundle.receipt.receipt_id).receipt_payload, bundle.receipt);
}

export async function runKirLedgerControlProbe(identity) {
  const input = controlFixture(identity, 5);
  const {control, bundle} = buildControlLedgerBundle(input);
  const client = new KirMemoryLedgerClient();
  const first = await appendCurrentSoldBundle(client, bundle, {now: input.now});
  assert.equal(first.status, 'COMMITTED');
  assert.equal(first.counts.events_inserted, 5);
  assert.equal(first.counts.evidence_inserted, 5);
  assert.equal(first.counts.receipts_inserted, 1);
  checkReadback(client, bundle);
  const committed = client.state();
  const replay = await appendCurrentSoldBundle(client, structuredClone(bundle), {now: input.now});
  assert.deepEqual(replay.counts, {events_inserted: 0, events_idempotent: 5, evidence_inserted: 0,
    evidence_idempotent: 5, receipts_inserted: 0, receipts_idempotent: 1});
  assert.deepEqual(client.state(), committed);

  const mixed = controlFixture(identity, 2);
  mixed.receiptRegistry.acquisitions.pop();
  const blocked = buildControlLedgerBundle(rebindRegistry(mixed));
  const blockedClient = new KirMemoryLedgerClient();
  await assert.rejects(() => appendCurrentSoldBundle(blockedClient, blocked.bundle, {now: input.now}),
    /CURRENT_SOLD_LEDGER_ADMISSION_NOT_PASS/);
  assert.deepEqual(blockedClient.calls, []);

  const rollbacks = [];
  for (const failAt of ['evidence-insert-v1', 'receipt-insert-v1']) {
    const failureClient = new KirMemoryLedgerClient({failAt});
    const before = failureClient.state();
    await assert.rejects(() => appendCurrentSoldBundle(failureClient, bundle, {now: input.now}),
      new RegExp(`KIR_TEST_INJECTED_FAILURE:${failAt}`));
    assert.deepEqual(failureClient.state(), before);
    assert.equal(failureClient.calls.at(-1), 'ROLLBACK');
    assert.equal(failureClient.calls.includes('COMMIT'), false);
    rollbacks.push({failure_at: failAt, simulation_rollback_verified: true, simulated_residual_rows: 0});
  }
  return {
    id: 'kidults-kir-ledger-control-integration-v1', version: '1.0.0', state: 'VERIFIED_PASS',
    scope: 'SYNTHETIC_KIR_ATOMIC_EVIDENCE_LEDGER_CONTROL_ONLY',
    database_transport: 'IN_MEMORY_TEST_DOUBLE_NOT_POSTGRESQL',
    repository: control.repository, source_sha: control.source_sha, run_id: control.run_id,
    run_attempt: control.run_attempt, trigger_event: control.trigger_event,
    kir_receipt_sha256: control.kir_receipt_sha256,
    simulated_batch_receipt_sha256: canonicalJsonDigest(bundle.receipt),
    case_count: 5,
    cases: {
      write_and_readback: {simulated_events: 5, simulated_evidence: 5, simulated_receipts: 1, exact_lineage_verified: true},
      replay: {simulated_new_rows: 0, simulated_events_idempotent: 5, simulated_evidence_idempotent: 5, simulated_receipts_idempotent: 1},
      partial_batch: {sql_calls: 0, admitted: 0, evidence: 0},
      evidence_failure: rollbacks[0], receipt_failure: rollbacks[1],
    },
    empirical_current_sold_delta: 0, postgres_rows_written: 0,
    provider_authority: false, database_authority: false, empirical_authority: false,
    runtime_activation_authorized: false, producer_health_authority: false, promotion_eligible: false,
    raw_rows_emitted: false, raw_evidence_emitted: false, bundle_emitted: false,
    track_b_started: false, projection_approved: false,
    public_release: 'HOLD', production: 'HOLD', g5: 'HOLD',
  };
}
