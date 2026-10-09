import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalCurrentSoldEvidenceId,
  currentSoldEventToEvidence,
  currentSoldEvidenceDigest,
  transformCurrentSoldEventsToEvidence
} from '../../../scripts/kidults/market/current-sold-evidence-v1.mjs';
import { admittedFixture } from './current-sold-test-helpers-v1.mjs';

test('converts an admitted CurrentSoldEvent into canonical Evidence', () => {
  const { event } = admittedFixture();
  const evidence = currentSoldEventToEvidence(event);
  assert.match(evidence.evidence_id, /^ev_cs_[a-f0-9]{24}$/);
  assert.equal(evidence.canonical_object_id, event.canonical_object_id);
  assert.equal(evidence.assertion.realized_consideration, event.realized_consideration);
  assert.equal(evidence.lineage.current_sold_event_id, event.event_id);
  assert.equal(evidence.lineage.current_sold_content_digest, event.content_digest);
  assert.equal(evidence.admission.claim_ceiling, 'PRIVATE_INTERNAL_CURRENT_SOLD');
  assert.equal(evidence.admission.public, 'HOLD');
  assert.equal(evidence.admission.production, 'HOLD');
  assert.equal(evidence.admission.g5, 'HOLD');
});

test('evidence identity and batch digest are deterministic', () => {
  const { event } = admittedFixture();
  const first = currentSoldEventToEvidence(event);
  const second = currentSoldEventToEvidence(structuredClone(event));
  assert.equal(canonicalCurrentSoldEvidenceId(event), first.evidence_id);
  assert.deepEqual(first, second);
  assert.equal(currentSoldEvidenceDigest([first]), currentSoldEvidenceDigest([second]));
});

test('rejects a tampered canonical event before Evidence creation', () => {
  const { event } = admittedFixture();
  const tampered = structuredClone(event);
  tampered.realized_consideration += 1;
  assert.throws(
    () => currentSoldEventToEvidence(tampered),
    /CURRENT_SOLD_EVIDENCE_CONTENT_DIGEST_MISMATCH/
  );
});

test('rejects non-SOLD or rights-disallowed input', () => {
  const { event } = admittedFixture();
  assert.throws(
    () => currentSoldEventToEvidence({ ...event, transaction_status: 'ASKING' }),
    /CURRENT_SOLD_EVIDENCE_NOT_TERMINAL_SOLD/
  );
  assert.throws(
    () => currentSoldEventToEvidence({ ...event, rights_decision: 'HOLD' }),
    /CURRENT_SOLD_EVIDENCE_RIGHTS_NOT_ALLOWED/
  );
});

test('deduplicates byte-equivalent Evidence and preserves canonical order', () => {
  const first = admittedFixture({ source_event_id: 'lot-42', acquisition_receipt_id: 'acq-42' }).event;
  const second = admittedFixture({ source_event_id: 'lot-43', acquisition_receipt_id: 'acq-43' }).event;
  const evidence = transformCurrentSoldEventsToEvidence([second, first, structuredClone(first)]);
  assert.equal(evidence.length, 2);
  assert.deepEqual([...evidence].sort((a, b) => a.evidence_id.localeCompare(b.evidence_id)), evidence);
});
