import {
  canonicalCurrentSoldAdmissionDigest,
  canonicalCurrentSoldBatchReceiptId,
  canonicalJsonDigest
} from './current-sold-batch-v1.mjs';
import { admitCurrentSoldBatch, verifyCanonicalCurrentSoldEvent } from './current-sold-engine-v1.mjs';
import {
  currentSoldEvidenceDigest,
  transformCurrentSoldEventsToEvidence
} from './current-sold-evidence-v1.mjs';

function fail(code) {
  throw new Error(code);
}

function object(value, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code);
  return value;
}

function rows(result) {
  return Array.isArray(result?.rows) ? result.rows : [];
}

function eventKey(event) {
  return `${event.event_id}::${event.content_digest}`;
}

function timestampMs(value, code) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) fail(code);
  return date.getTime();
}

function normalizedEventVersions(bundle) {
  if (!Array.isArray(bundle.event_versions) || bundle.event_versions.length === 0) {
    fail('CURRENT_SOLD_LEDGER_EVENT_VERSIONS_REQUIRED');
  }
  const verified = bundle.event_versions.map(event => verifyCanonicalCurrentSoldEvent(event));
  const byKey = new Map();
  for (const event of verified) {
    const key = eventKey(event);
    if (byKey.has(key)) fail('CURRENT_SOLD_LEDGER_DUPLICATE_EVENT_VERSION');
    byKey.set(key, event);
  }
  return [...byKey.values()].sort((a, b) => {
    const identity = a.event_id.localeCompare(b.event_id);
    if (identity !== 0) return identity;
    const observed = timestampMs(a.observed_at, 'CURRENT_SOLD_LEDGER_INVALID_OBSERVED_AT') - timestampMs(b.observed_at, 'CURRENT_SOLD_LEDGER_INVALID_OBSERVED_AT');
    if (observed !== 0) return observed;
    return a.content_digest.localeCompare(b.content_digest);
  });
}

function assertIncomingChain(versions) {
  if (versions.length === 0) fail('CURRENT_SOLD_LEDGER_EVENT_CHAIN_EMPTY');
  const identity = versions[0];
  for (const event of versions) {
    if (event.event_id !== identity.event_id || event.canonical_object_id !== identity.canonical_object_id) {
      fail('CURRENT_SOLD_LEDGER_INCOMING_OBJECT_IDENTITY_CONFLICT');
    }
    if (event.source_id !== identity.source_id || event.source_event_id !== identity.source_event_id) {
      fail('CURRENT_SOLD_LEDGER_INCOMING_SOURCE_IDENTITY_CONFLICT');
    }
  }
  for (let index = 1; index < versions.length; index += 1) {
    const previous = versions[index - 1];
    const current = versions[index];
    if (current.correction_state !== 'CORRECTED') fail('CURRENT_SOLD_LEDGER_UNCORRECTED_CONTENT_CONFLICT');
    if (current.supersedes_event_id !== current.event_id || current.supersedes_content_digest !== previous.content_digest) {
      fail('CURRENT_SOLD_LEDGER_CORRECTION_CHAIN_MISMATCH');
    }
    if (timestampMs(current.observed_at, 'CURRENT_SOLD_LEDGER_INVALID_OBSERVED_AT') <= timestampMs(previous.observed_at, 'CURRENT_SOLD_LEDGER_INVALID_OBSERVED_AT')) {
      fail('CURRENT_SOLD_LEDGER_CORRECTION_TIME_NOT_MONOTONIC');
    }
  }
}

function storedPayload(row) {
  const payload = typeof row.event_payload === 'string' ? JSON.parse(row.event_payload) : row.event_payload;
  const event = verifyCanonicalCurrentSoldEvent(payload);
  if (row.event_id !== event.event_id || row.content_digest !== event.content_digest) {
    fail('CURRENT_SOLD_LEDGER_STORED_EVENT_CORRUPTION');
  }
  return event;
}

function assertStoredChain(dbRows) {
  const stored = dbRows.map(storedPayload);
  if (stored.length === 0) return stored;
  if (stored[0].correction_state !== 'ORIGINAL') fail('CURRENT_SOLD_LEDGER_STORED_CHAIN_MISSING_ORIGINAL');
  for (let index = 1; index < stored.length; index += 1) {
    const previous = stored[index - 1];
    const current = stored[index];
    if (current.canonical_object_id !== previous.canonical_object_id) fail('CURRENT_SOLD_LEDGER_STORED_OBJECT_IDENTITY_CONFLICT');
    if (current.correction_state !== 'CORRECTED' || current.supersedes_content_digest !== previous.content_digest) {
      fail('CURRENT_SOLD_LEDGER_STORED_CHAIN_CORRUPTION');
    }
    if (timestampMs(current.observed_at, 'CURRENT_SOLD_LEDGER_INVALID_OBSERVED_AT') <= timestampMs(previous.observed_at, 'CURRENT_SOLD_LEDGER_INVALID_OBSERVED_AT')) {
      fail('CURRENT_SOLD_LEDGER_STORED_TIME_NOT_MONOTONIC');
    }
  }
  return stored;
}

function verifyBundle(bundleInput) {
  const bundle = object(bundleInput, 'CURRENT_SOLD_LEDGER_BUNDLE_NOT_OBJECT');
  if (bundle.schema_version !== 'current-sold-batch-bundle-v1') fail('CURRENT_SOLD_LEDGER_BUNDLE_VERSION_MISMATCH');
  const envelope = object(bundle.envelope, 'CURRENT_SOLD_LEDGER_ENVELOPE_REQUIRED');
  const receiptRegistry = object(bundle.receipt_registry, 'CURRENT_SOLD_LEDGER_RECEIPT_REGISTRY_REQUIRED');
  const admission = object(bundle.admission, 'CURRENT_SOLD_LEDGER_ADMISSION_REQUIRED');
  const receipt = object(bundle.receipt, 'CURRENT_SOLD_LEDGER_RECEIPT_REQUIRED');
  if (receipt.status !== 'PASS' || admission.status !== 'PASS' || receipt.ledger?.write_eligible !== true) {
    fail('CURRENT_SOLD_LEDGER_ADMISSION_NOT_PASS');
  }
  if (admission.rejected_count !== 0 || admission.quarantined_count !== 0) {
    fail('CURRENT_SOLD_LEDGER_ISSUED_BATCH_BLOCKED');
  }
  if (receipt.source_sha !== envelope.source_sha || receipt.canonical_run_id !== envelope.canonical_run_id) {
    fail('CURRENT_SOLD_LEDGER_RECEIPT_ENVELOPE_BINDING_MISMATCH');
  }
  if (receipt.envelope_digest !== canonicalJsonDigest(envelope)) fail('CURRENT_SOLD_LEDGER_ENVELOPE_DIGEST_MISMATCH');
  if (receipt.receipt_registry_digest !== canonicalJsonDigest(receiptRegistry)) fail('CURRENT_SOLD_LEDGER_RECEIPT_REGISTRY_DIGEST_MISMATCH');
  const evaluatedAt = new Date(receipt.evaluated_at);
  if (Number.isNaN(evaluatedAt.getTime()) || receipt.evaluated_at !== evaluatedAt.toISOString()) fail('CURRENT_SOLD_LEDGER_INVALID_EVALUATED_AT');
  const recomputedAdmission = admitCurrentSoldBatch(envelope.observations, { now: evaluatedAt, receiptRegistry });
  if (canonicalCurrentSoldAdmissionDigest(recomputedAdmission) !== canonicalCurrentSoldAdmissionDigest(admission)) {
    fail('CURRENT_SOLD_LEDGER_ADMISSION_RECOMPUTE_MISMATCH');
  }
  if (receipt.admission_digest !== canonicalCurrentSoldAdmissionDigest(admission)) fail('CURRENT_SOLD_LEDGER_ADMISSION_DIGEST_MISMATCH');

  const eventVersions = normalizedEventVersions(bundle);
  if (receipt.event_versions_digest !== canonicalJsonDigest(eventVersions)) fail('CURRENT_SOLD_LEDGER_EVENT_VERSIONS_DIGEST_MISMATCH');
  for (const event of eventVersions) {
    if (event.source_sha !== envelope.source_sha || event.canonical_run_id !== envelope.canonical_run_id) {
      fail('CURRENT_SOLD_LEDGER_EVENT_ENVELOPE_BINDING_MISMATCH');
    }
  }

  const expectedKeys = new Set([...admission.superseded, ...admission.admitted].map(eventKey));
  const actualKeys = new Set(eventVersions.map(eventKey));
  if (expectedKeys.size !== actualKeys.size || [...expectedKeys].some(key => !actualKeys.has(key))) {
    fail('CURRENT_SOLD_LEDGER_EVENT_VERSION_SET_MISMATCH');
  }

  const expectedEvidence = transformCurrentSoldEventsToEvidence(admission.admitted);
  if (currentSoldEvidenceDigest(bundle.evidence) !== currentSoldEvidenceDigest(expectedEvidence)) {
    fail('CURRENT_SOLD_LEDGER_EVIDENCE_CONTENT_MISMATCH');
  }
  if (receipt.evidence_digest !== currentSoldEvidenceDigest(bundle.evidence)) fail('CURRENT_SOLD_LEDGER_EVIDENCE_DIGEST_MISMATCH');

  const receiptIdentity = {
    batch_id: receipt.batch_id,
    source_sha: receipt.source_sha,
    canonical_run_id: receipt.canonical_run_id,
    evaluated_at: receipt.evaluated_at,
    envelope_digest: receipt.envelope_digest,
    receipt_registry_digest: receipt.receipt_registry_digest,
    event_versions_digest: receipt.event_versions_digest,
    evidence_digest: receipt.evidence_digest,
    admission_digest: receipt.admission_digest
  };
  if (receipt.receipt_id !== canonicalCurrentSoldBatchReceiptId(receiptIdentity)) {
    fail('CURRENT_SOLD_LEDGER_RECEIPT_ID_MISMATCH');
  }
  if (receipt.counts.input !== envelope.observations.length ||
      receipt.counts.admitted !== admission.admitted_count ||
      receipt.counts.rejected !== admission.rejected_count ||
      receipt.counts.quarantined !== admission.quarantined_count ||
      receipt.counts.superseded !== admission.superseded_count ||
      receipt.counts.evidence !== bundle.evidence.length) {
    fail('CURRENT_SOLD_LEDGER_RECEIPT_COUNT_MISMATCH');
  }

  return { bundle, envelope, receiptRegistry, admission, receipt, eventVersions, evidence: expectedEvidence };
}

async function lockEvent(client, eventId) {
  await client.query(
    '/* current-sold:advisory-lock-v1 */ SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
    [eventId]
  );
}

async function fetchEventHistory(client, eventId) {
  return rows(await client.query(
    `/* current-sold:event-history-v1 */
     SELECT ledger_id, event_id, content_digest, canonical_object_id, source_id, source_event_id,
            correction_state, supersedes_content_digest, observed_at, event_payload
       FROM kidults_private.current_sold_event_ledger
      WHERE event_id = $1
      ORDER BY ledger_id ASC`,
    [eventId]
  ));
}

async function insertEvent(client, event, batchReceiptId) {
  await client.query(
    `/* current-sold:event-insert-v1 */
     INSERT INTO kidults_private.current_sold_event_ledger (
       event_id, content_digest, canonical_object_id, source_id, source_event_id,
       source_sha, canonical_run_id, correction_state, supersedes_content_digest,
       sold_at, observed_at, event_payload, batch_receipt_id
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13)`,
    [
      event.event_id,
      event.content_digest,
      event.canonical_object_id,
      event.source_id,
      event.source_event_id,
      event.source_sha,
      event.canonical_run_id,
      event.correction_state,
      event.supersedes_content_digest,
      event.sold_at,
      event.observed_at,
      JSON.stringify(event),
      batchReceiptId
    ]
  );
}

async function appendEventChain(client, versions, batchReceiptId, counts) {
  assertIncomingChain(versions);
  const eventId = versions[0].event_id;
  await lockEvent(client, eventId);
  const existingRows = await fetchEventHistory(client, eventId);
  const existing = assertStoredChain(existingRows);
  const existingByDigest = new Map(existing.map(event => [event.content_digest, event]));
  let head = existing.at(-1) ?? null;

  if (head && versions[0].canonical_object_id !== head.canonical_object_id) {
    fail('CURRENT_SOLD_LEDGER_CROSS_RUN_OBJECT_CONFLICT');
  }

  let start = 0;
  if (head) {
    const headIndex = versions.findIndex(event => event.content_digest === head.content_digest);
    if (headIndex >= 0) {
      for (let index = 0; index <= headIndex; index += 1) {
        if (!existingByDigest.has(versions[index].content_digest)) {
          fail('CURRENT_SOLD_LEDGER_CROSS_RUN_CHAIN_DIVERGENCE');
        }
        counts.events_idempotent += 1;
      }
      start = headIndex + 1;
    } else if (existingByDigest.has(versions[0].content_digest)) {
      fail('CURRENT_SOLD_LEDGER_STALE_CONTENT_REPLAY');
    }
  }

  for (let index = start; index < versions.length; index += 1) {
    const event = versions[index];
    const known = existingByDigest.get(event.content_digest);
    if (known) {
      if (!head || known.content_digest !== head.content_digest) fail('CURRENT_SOLD_LEDGER_STALE_CONTENT_REPLAY');
      counts.events_idempotent += 1;
      continue;
    }

    if (!head) {
      if (event.correction_state !== 'ORIGINAL') fail('CURRENT_SOLD_LEDGER_CORRECTION_BASE_MISSING');
    } else {
      if (event.canonical_object_id !== head.canonical_object_id) fail('CURRENT_SOLD_LEDGER_CROSS_RUN_OBJECT_CONFLICT');
      if (event.correction_state !== 'CORRECTED') fail('CURRENT_SOLD_LEDGER_CROSS_RUN_CONTENT_CONFLICT');
      if (event.supersedes_event_id !== event.event_id || event.supersedes_content_digest !== head.content_digest) {
        fail('CURRENT_SOLD_LEDGER_CROSS_RUN_CORRECTION_MISMATCH');
      }
      if (timestampMs(event.observed_at, 'CURRENT_SOLD_LEDGER_INVALID_OBSERVED_AT') <= timestampMs(head.observed_at, 'CURRENT_SOLD_LEDGER_INVALID_OBSERVED_AT')) {
        fail('CURRENT_SOLD_LEDGER_CROSS_RUN_CORRECTION_TIME_NOT_MONOTONIC');
      }
    }

    await insertEvent(client, event, batchReceiptId);
    existingByDigest.set(event.content_digest, event);
    head = event;
    counts.events_inserted += 1;
  }
}

async function appendEvidence(client, evidence, batchReceiptId, counts) {
  const evidenceDigest = canonicalJsonDigest(evidence);
  const existing = rows(await client.query(
    `/* current-sold:evidence-by-id-v1 */
     SELECT evidence_id, evidence_digest
       FROM kidults_private.current_sold_evidence_ledger
      WHERE evidence_id = $1`,
    [evidence.evidence_id]
  ))[0];
  if (existing) {
    if (existing.evidence_digest !== evidenceDigest) fail('CURRENT_SOLD_LEDGER_EVIDENCE_ID_COLLISION');
    counts.evidence_idempotent += 1;
    return;
  }
  await client.query(
    `/* current-sold:evidence-insert-v1 */
     INSERT INTO kidults_private.current_sold_evidence_ledger (
       evidence_id, fact_id, evidence_digest, current_sold_event_id, current_sold_content_digest,
       canonical_object_id, source_sha, canonical_run_id, evidence_payload, batch_receipt_id
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10)`,
    [
      evidence.evidence_id,
      evidence.fact_id,
      evidenceDigest,
      evidence.lineage.current_sold_event_id,
      evidence.lineage.current_sold_content_digest,
      evidence.canonical_object_id,
      evidence.lineage.source_sha,
      evidence.lineage.canonical_run_id,
      JSON.stringify(evidence),
      batchReceiptId
    ]
  );
  counts.evidence_inserted += 1;
}

async function appendReceipt(client, receipt, counts) {
  const receiptDigest = canonicalJsonDigest(receipt);
  const existing = rows(await client.query(
    `/* current-sold:receipt-by-id-v1 */
     SELECT receipt_id, receipt_digest
       FROM kidults_private.current_sold_batch_receipt_ledger
      WHERE receipt_id = $1`,
    [receipt.receipt_id]
  ))[0];
  if (existing) {
    if (existing.receipt_digest !== receiptDigest) fail('CURRENT_SOLD_LEDGER_RECEIPT_ID_COLLISION');
    counts.receipts_idempotent += 1;
    return receiptDigest;
  }
  await client.query(
    `/* current-sold:receipt-insert-v1 */
     INSERT INTO kidults_private.current_sold_batch_receipt_ledger (
       receipt_id, receipt_digest, batch_id, status, source_sha, canonical_run_id,
       envelope_digest, event_versions_digest, evidence_digest, receipt_payload
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)`,
    [
      receipt.receipt_id,
      receiptDigest,
      receipt.batch_id,
      receipt.status,
      receipt.source_sha,
      receipt.canonical_run_id,
      receipt.envelope_digest,
      receipt.event_versions_digest,
      receipt.evidence_digest,
      JSON.stringify(receipt)
    ]
  );
  counts.receipts_inserted += 1;
  return receiptDigest;
}

export async function appendCurrentSoldBundle(client, bundleInput, { now = new Date() } = {}) {
  if (!client || typeof client.query !== 'function') fail('CURRENT_SOLD_LEDGER_CLIENT_REQUIRED');
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) fail('CURRENT_SOLD_LEDGER_INVALID_NOW');
  const { receipt, eventVersions, evidence } = verifyBundle(bundleInput);
  const groups = new Map();
  for (const event of eventVersions) {
    const group = groups.get(event.event_id) ?? [];
    group.push(event);
    groups.set(event.event_id, group);
  }
  const counts = {
    events_inserted: 0,
    events_idempotent: 0,
    evidence_inserted: 0,
    evidence_idempotent: 0,
    receipts_inserted: 0,
    receipts_idempotent: 0
  };

  let began = false;
  try {
    await client.query('BEGIN');
    began = true;
    for (const eventId of [...groups.keys()].sort()) {
      await appendEventChain(client, groups.get(eventId), receipt.receipt_id, counts);
    }
    for (const item of [...evidence].sort((a, b) => a.evidence_id.localeCompare(b.evidence_id))) {
      await appendEvidence(client, item, receipt.receipt_id, counts);
    }
    const batchReceiptDigest = await appendReceipt(client, receipt, counts);
    await client.query('COMMIT');
    const identity = {
      batch_receipt_id: receipt.receipt_id,
      batch_receipt_digest: batchReceiptDigest,
      counts
    };
    return {
      schema_version: 'current-sold-ledger-write-receipt-v1',
      ledger_receipt_id: `cslw_${canonicalJsonDigest(identity).slice(7, 31)}`,
      status: 'COMMITTED',
      committed_at: now.toISOString(),
      batch_receipt_id: receipt.receipt_id,
      batch_receipt_digest: batchReceiptDigest,
      source_sha: receipt.source_sha,
      canonical_run_id: receipt.canonical_run_id,
      counts,
      claim_boundary: {
        public: 'HOLD',
        production: 'HOLD',
        g5: 'HOLD'
      }
    };
  } catch (error) {
    if (began) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Preserve the root failure; the caller must discard the connection after rollback failure.
      }
    }
    throw error;
  }
}
