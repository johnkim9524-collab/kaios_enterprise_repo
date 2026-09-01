import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  buildCurrentSoldBatchBundle,
  canonicalCurrentSoldBatchReceiptId,
  canonicalJsonDigest
} from '../../../scripts/kidults/market/current-sold-batch-v1.mjs';
import { appendCurrentSoldBundle } from '../../../scripts/kidults/market/current-sold-postgres-ledger-v1.mjs';
import { canonicalEventId } from '../../../scripts/kidults/market/current-sold-engine-v1.mjs';
import {
  NOW,
  SOURCE_SHA,
  RUN_ID,
  batchEnvelope,
  rawObservation,
  receiptRegistryFor,
  sealObservation
} from './current-sold-test-helpers-v1.mjs';

const SOURCE_SHA_2 = '2'.repeat(40);
const RUN_ID_2 = 'current-sold-run-20260901-002';

function cloneMapOfArrays(map) {
  return new Map([...map].map(([key, value]) => [key, structuredClone(value)]));
}

class MemoryPgClient {
  constructor() {
    this.events = new Map();
    this.evidence = new Map();
    this.receipts = new Map();
    this.sequence = 0;
    this.snapshot = null;
    this.calls = [];
  }

  async query(text, params = []) {
    const sql = String(text);
    this.calls.push({ sql, params: structuredClone(params) });
    if (sql === 'BEGIN') {
      this.snapshot = {
        events: cloneMapOfArrays(this.events),
        evidence: new Map(structuredClone([...this.evidence])),
        receipts: new Map(structuredClone([...this.receipts])),
        sequence: this.sequence
      };
      return { rows: [], rowCount: 0 };
    }
    if (sql === 'COMMIT') {
      this.snapshot = null;
      return { rows: [], rowCount: 0 };
    }
    if (sql === 'ROLLBACK') {
      if (this.snapshot) {
        this.events = this.snapshot.events;
        this.evidence = this.snapshot.evidence;
        this.receipts = this.snapshot.receipts;
        this.sequence = this.snapshot.sequence;
      }
      this.snapshot = null;
      return { rows: [], rowCount: 0 };
    }
    if (sql.includes('current-sold:advisory-lock-v1')) return { rows: [{ pg_advisory_xact_lock: null }], rowCount: 1 };
    if (sql.includes('current-sold:event-history-v1')) {
      return { rows: structuredClone(this.events.get(params[0]) ?? []), rowCount: (this.events.get(params[0]) ?? []).length };
    }
    if (sql.includes('current-sold:event-insert-v1')) {
      const [eventId, contentDigest, canonicalObjectId, sourceId, sourceEventId, sourceSha, canonicalRunId, correctionState, supersedesContentDigest, soldAt, observedAt, payload, batchReceiptId] = params;
      const history = this.events.get(eventId) ?? [];
      if (history.some(row => row.content_digest === contentDigest)) throw new Error('FAKE_UNIQUE_EVENT_CONTENT');
      const row = {
        ledger_id: ++this.sequence,
        event_id: eventId,
        content_digest: contentDigest,
        canonical_object_id: canonicalObjectId,
        source_id: sourceId,
        source_event_id: sourceEventId,
        source_sha: sourceSha,
        canonical_run_id: canonicalRunId,
        correction_state: correctionState,
        supersedes_content_digest: supersedesContentDigest,
        sold_at: soldAt,
        observed_at: observedAt,
        event_payload: JSON.parse(payload),
        batch_receipt_id: batchReceiptId
      };
      history.push(row);
      this.events.set(eventId, history);
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes('current-sold:evidence-by-id-v1')) {
      const row = this.evidence.get(params[0]);
      return { rows: row ? [structuredClone(row)] : [], rowCount: row ? 1 : 0 };
    }
    if (sql.includes('current-sold:evidence-insert-v1')) {
      const [evidenceId, factId, evidenceDigest, currentSoldEventId, currentSoldContentDigest, canonicalObjectId, sourceSha, canonicalRunId, payload, batchReceiptId] = params;
      if (this.evidence.has(evidenceId)) throw new Error('FAKE_UNIQUE_EVIDENCE_ID');
      this.evidence.set(evidenceId, {
        evidence_id: evidenceId,
        fact_id: factId,
        evidence_digest: evidenceDigest,
        current_sold_event_id: currentSoldEventId,
        current_sold_content_digest: currentSoldContentDigest,
        canonical_object_id: canonicalObjectId,
        source_sha: sourceSha,
        canonical_run_id: canonicalRunId,
        evidence_payload: JSON.parse(payload),
        batch_receipt_id: batchReceiptId
      });
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes('current-sold:receipt-by-id-v1')) {
      const row = this.receipts.get(params[0]);
      return { rows: row ? [structuredClone(row)] : [], rowCount: row ? 1 : 0 };
    }
    if (sql.includes('current-sold:receipt-insert-v1')) {
      const [receiptId, receiptDigest, batchId, status, sourceSha, canonicalRunId, envelopeDigest, eventVersionsDigest, evidenceDigest, payload] = params;
      if (this.receipts.has(receiptId)) throw new Error('FAKE_UNIQUE_RECEIPT_ID');
      this.receipts.set(receiptId, {
        receipt_id: receiptId,
        receipt_digest: receiptDigest,
        batch_id: batchId,
        status,
        source_sha: sourceSha,
        canonical_run_id: canonicalRunId,
        envelope_digest: envelopeDigest,
        event_versions_digest: eventVersionsDigest,
        evidence_digest: evidenceDigest,
        receipt_payload: JSON.parse(payload)
      });
      return { rows: [], rowCount: 1 };
    }
    throw new Error(`FAKE_UNHANDLED_QUERY:${sql}`);
  }
}

function bundleFor(input, envelopeOverrides = {}) {
  const envelope = batchEnvelope([input], {
    source_sha: input.source_sha,
    canonical_run_id: input.canonical_run_id,
    ...envelopeOverrides
  });
  return buildCurrentSoldBatchBundle(envelope, receiptRegistryFor(input), { now: NOW });
}

function originalBundle() {
  const input = sealObservation(rawObservation());
  return bundleFor(input);
}

test('atomically appends event, canonical Evidence, and PASS receipt', async () => {
  const client = new MemoryPgClient();
  const bundle = originalBundle();
  const result = await appendCurrentSoldBundle(client, bundle, { now: NOW });
  assert.equal(result.status, 'COMMITTED');
  assert.deepEqual(result.counts, {
    events_inserted: 1,
    events_idempotent: 0,
    evidence_inserted: 1,
    evidence_idempotent: 0,
    receipts_inserted: 1,
    receipts_idempotent: 0
  });
  assert.equal(client.events.size, 1);
  assert.equal(client.evidence.size, 1);
  assert.equal(client.receipts.size, 1);
  assert.equal(result.claim_boundary.public, 'HOLD');
  assert.equal(result.claim_boundary.production, 'HOLD');
  assert.equal(result.claim_boundary.g5, 'HOLD');
});

test('replays the same bundle idempotently without duplicate rows', async () => {
  const client = new MemoryPgClient();
  const bundle = originalBundle();
  await appendCurrentSoldBundle(client, bundle, { now: NOW });
  const replay = await appendCurrentSoldBundle(client, structuredClone(bundle), { now: NOW });
  assert.deepEqual(replay.counts, {
    events_inserted: 0,
    events_idempotent: 1,
    evidence_inserted: 0,
    evidence_idempotent: 1,
    receipts_inserted: 0,
    receipts_idempotent: 1
  });
  assert.equal([...client.events.values()][0].length, 1);
  assert.equal(client.evidence.size, 1);
  assert.equal(client.receipts.size, 1);
});

test('blocks uncorrected cross-run content drift and rolls back the whole transaction', async () => {
  const client = new MemoryPgClient();
  await appendCurrentSoldBundle(client, originalBundle(), { now: NOW });
  const drift = sealObservation(rawObservation({
    realized_consideration: 1900000,
    acquisition_receipt_id: 'acq-run-2',
    rights_receipt_id: 'rights-run-2',
    source_sha: SOURCE_SHA_2,
    canonical_run_id: RUN_ID_2
  }));
  const driftBundle = bundleFor(drift, {
    batch_id: 'current-sold-batch-20260901-002',
    source_sha: SOURCE_SHA_2,
    canonical_run_id: RUN_ID_2
  });
  await assert.rejects(
    () => appendCurrentSoldBundle(client, driftBundle, { now: NOW }),
    /CURRENT_SOLD_LEDGER_CROSS_RUN_CONTENT_CONFLICT/
  );
  assert.equal([...client.events.values()][0].length, 1);
  assert.equal(client.evidence.size, 1);
  assert.equal(client.receipts.size, 1);
  assert.equal(client.calls.at(-1).sql, 'ROLLBACK');
});

test('accepts a correction only when it supersedes the exact persisted head', async () => {
  const client = new MemoryPgClient();
  const base = originalBundle();
  await appendCurrentSoldBundle(client, base, { now: NOW });
  const original = base.admission.admitted[0];
  const correction = sealObservation(rawObservation({
    realized_consideration: 1900000,
    observed_at: '2026-09-01T01:00:00.000Z',
    acquisition_receipt_id: 'acq-correction',
    rights_receipt_id: 'rights-correction',
    source_sha: SOURCE_SHA_2,
    canonical_run_id: RUN_ID_2,
    correction_state: 'CORRECTED',
    supersedes_event_id: canonicalEventId(original),
    supersedes_content_digest: original.content_digest
  }));
  const correctionBundle = bundleFor(correction, {
    batch_id: 'current-sold-batch-20260901-correction',
    source_sha: SOURCE_SHA_2,
    canonical_run_id: RUN_ID_2
  });
  const result = await appendCurrentSoldBundle(client, correctionBundle, { now: NOW });
  assert.equal(result.counts.events_inserted, 1);
  assert.equal(result.counts.evidence_inserted, 1);
  const history = [...client.events.values()][0];
  assert.equal(history.length, 2);
  assert.equal(history[1].correction_state, 'CORRECTED');
  assert.equal(history[1].supersedes_content_digest, history[0].content_digest);
});

test('blocks correction with a non-head predecessor digest', async () => {
  const client = new MemoryPgClient();
  const base = originalBundle();
  await appendCurrentSoldBundle(client, base, { now: NOW });
  const badCorrection = sealObservation(rawObservation({
    realized_consideration: 1900000,
    observed_at: '2026-09-01T01:00:00.000Z',
    acquisition_receipt_id: 'acq-bad-correction',
    rights_receipt_id: 'rights-bad-correction',
    source_sha: SOURCE_SHA_2,
    canonical_run_id: RUN_ID_2,
    correction_state: 'CORRECTED',
    supersedes_event_id: base.admission.admitted[0].event_id,
    supersedes_content_digest: `sha256:${'f'.repeat(64)}`
  }));
  const badBundle = bundleFor(badCorrection, {
    batch_id: 'current-sold-batch-20260901-bad-correction',
    source_sha: SOURCE_SHA_2,
    canonical_run_id: RUN_ID_2
  });
  await assert.rejects(
    () => appendCurrentSoldBundle(client, badBundle, { now: NOW }),
    /CURRENT_SOLD_LEDGER_CROSS_RUN_CORRECTION_MISMATCH/
  );
  assert.equal([...client.events.values()][0].length, 1);
});


test('recomputes admission against the bound receipt-registry snapshot before any SQL', async () => {
  const client = new MemoryPgClient();
  const bundle = originalBundle();
  bundle.receipt_registry.acquisitions[0].source_event_id = 'forged-lot';
  bundle.receipt.receipt_registry_digest = canonicalJsonDigest(bundle.receipt_registry);
  bundle.receipt.receipt_id = canonicalCurrentSoldBatchReceiptId({
    batch_id: bundle.receipt.batch_id,
    source_sha: bundle.receipt.source_sha,
    canonical_run_id: bundle.receipt.canonical_run_id,
    evaluated_at: bundle.receipt.evaluated_at,
    envelope_digest: bundle.receipt.envelope_digest,
    receipt_registry_digest: bundle.receipt.receipt_registry_digest,
    event_versions_digest: bundle.receipt.event_versions_digest,
    evidence_digest: bundle.receipt.evidence_digest,
    admission_digest: bundle.receipt.admission_digest
  });
  await assert.rejects(
    () => appendCurrentSoldBundle(client, bundle, { now: NOW }),
    /CURRENT_SOLD_LEDGER_ADMISSION_RECOMPUTE_MISMATCH/
  );
  assert.equal(client.calls.length, 0);
});

test('never writes a failed or partially failed batch', async () => {
  const client = new MemoryPgClient();
  const bundle = originalBundle();
  bundle.admission.status = 'FAIL_CLOSED';
  bundle.receipt.status = 'FAIL_CLOSED';
  bundle.receipt.ledger.write_eligible = false;
  await assert.rejects(
    () => appendCurrentSoldBundle(client, bundle, { now: NOW }),
    /CURRENT_SOLD_LEDGER_ADMISSION_NOT_PASS/
  );
  assert.equal(client.calls.length, 0);
});

test('migration enforces append-only tables and contains no update upsert path', () => {
  const migrationPath = fileURLToPath(new URL('../../../infrastructure/postgres/current-sold/0001_current_sold_append_only_ledger_v1.sql', import.meta.url));
  const sql = fs.readFileSync(migrationPath, 'utf8');
  assert.match(sql, /BEFORE UPDATE OR DELETE ON kidults_private\.current_sold_event_ledger/);
  assert.match(sql, /BEFORE TRUNCATE ON kidults_private\.current_sold_event_ledger/);
  assert.match(sql, /REVOKE UPDATE, DELETE, TRUNCATE/);
  assert.match(sql, /BEFORE INSERT ON kidults_private\.current_sold_event_ledger/);
  assert.match(sql, /CURRENT_SOLD_LEDGER_CROSS_RUN_CORRECTION_MISMATCH/);
  assert.match(sql, /current_sold_event_batch_receipt_fk/);
  assert.match(sql, /current_sold_evidence_batch_receipt_fk/);
  assert.doesNotMatch(sql, /ON CONFLICT[\s\S]*DO UPDATE/i);
  assert.doesNotMatch(sql, /\bUPDATE\s+kidults_private\.current_sold_/i);
  assert.doesNotMatch(sql, /\bDELETE\s+FROM\s+kidults_private\.current_sold_/i);
});
