import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSyntheticCandidateControl,
  assessSyntheticTrackBControl,
  buildSyntheticProjectionControl,
  runSyntheticDownstreamControlBatch
} from '../../../scripts/kidults/runtime/synthetic-downstream-control-engine-v1.mjs';

const record = Object.freeze({
  canonical_object_id:'kir-fixture:toys-models:object-01',
  provenance_digest:`sha256:${'1'.repeat(64)}`
});

test('reusable downstream control engine deterministically executes Candidate through Projection', () => {
  const first = runSyntheticDownstreamControlBatch([record]);
  const second = runSyntheticDownstreamControlBatch([record]);
  assert.deepEqual(first, second);
  assert.equal(first[0].candidate.rankable, false);
  assert.equal(first[0].assessment.decision, 'CONTROL_PASS');
  assert.equal(first[0].projection.state, 'NO_PROJECTION');
  assert.equal(first[0].projection.customer_visible, false);
  assert.equal(Object.isFrozen(first[0].projection), true);
});

test('candidate gate rejects namespace escape, bad provenance and capability injection', () => {
  assert.throws(() => createSyntheticCandidateControl({...record, canonical_object_id:'real:object-01'}), /SMT_CANDIDATE_NAMESPACE/);
  assert.throws(() => createSyntheticCandidateControl({...record, provenance_digest:'bad'}), /SMT_CANDIDATE_PROVENANCE/);
  assert.throws(() => createSyntheticCandidateControl({...record, promotable:true}), /SMT_CANDIDATE_INPUT_SCHEMA/);
});

test('Track B rejects evidence tamper and promotion attempts', () => {
  const created = createSyntheticCandidateControl(record);
  assert.throws(() => assessSyntheticTrackBControl({
    evidence:{...created.evidence, provenance_digest:`sha256:${'2'.repeat(64)}`},
    candidate:created.candidate
  }), /SMT_TRACK_B_EVIDENCE_DIGEST/);
  assert.throws(() => assessSyntheticTrackBControl({
    evidence:created.evidence,
    candidate:{...created.candidate, promotable:true}
  }), /SMT_TRACK_B_EVIDENCE_DIGEST|SMT_TRACK_B_CANDIDATE_AUTHORITY/);
});

test('Projection rejects assessment tamper and authority escalation', () => {
  const created = createSyntheticCandidateControl(record);
  const assessment = assessSyntheticTrackBControl(created);
  assert.throws(() => buildSyntheticProjectionControl({...created, assessment:{...assessment, candidate_digest:`sha256:${'0'.repeat(64)}`}}), /SMT_PROJECTION_CANDIDATE_DIGEST/);
  assert.throws(() => buildSyntheticProjectionControl({...created, assessment:{...assessment, promotable:true}}), /SMT_PROJECTION_ASSESSMENT_AUTHORITY/);
});

test('batch gate rejects duplicate object identity', () => {
  assert.throws(() => runSyntheticDownstreamControlBatch([record, record]), /SMT_DOWNSTREAM_DUPLICATE_OBJECT/);
});
