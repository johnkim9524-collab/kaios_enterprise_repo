import assert from 'node:assert/strict';
import test from 'node:test';
import { stagePsaPrivateEvaluation, deleteExpiredPsaEvaluations } from '../src/psa-private-evaluation.mjs';

const hash = char => `sha256:${char.repeat(64)}`;
const rights = {
  provider_id: 'psa-public-api', source_message_immutability: 'VERIFIED',
  collect: 'ALLOW', store_private: 'ALLOW', derive_internal_er_calibration: 'ALLOW',
  internal_human_qa: 'ALLOW', public_display: 'BLOCK', redistribute: 'BLOCK',
  retention_days: 30, evidence_ref: 'github:#1251/original-message-digest',
};
const fieldMap = {
  provider_id: 'psa-public-api', field_map_id: 'psa-cert-field-map-v1',
  state: 'APPROVED_FOR_BOUNDED_PRIVATE_EVALUATION', observed_schema_digest: hash('a'),
  mappings: [
    { source_path: 'cert.number', canonical_field: 'certification_number', required: true },
    { source_path: 'cert.grade', canonical_field: 'grade', required: true },
    { source_path: 'population.total', canonical_field: 'population_total', required: false },
  ],
};

function store() {
  const calls = [];
  return {
    calls, capabilities: ['ENCRYPTION_AT_REST', 'ACCESS_AUDIT', 'DELETE_BY_ENFORCEMENT'],
    put: async input => { calls.push(['put', input]); return 'private://psa/record-1'; },
    listExpired: async () => [{ handle: 'private://psa/record-1' }],
    delete: async input => { calls.push(['delete', input]); return { deletion_verified: true, raw_payload_retained: false }; },
  };
}

test('private PSA evaluation persists only behind verified rights and approved field map', async () => {
  const privateStore = store();
  let admitted;
  const raw = { cert: { number: '40413252', grade: '10' }, population: { total: 3 }, secretExtra: 'not-admitted' };
  const receipt = await stagePsaPrivateEvaluation({
    rawPayload: raw, certReferenceDigest: hash('c'), rightsReceipt: rights, fieldMap,
    privateStore, acquiredAt: '2026-08-27T00:00:00Z',
    admitNormalized: async input => { admitted = input; return { state: 'COMMITTED', commandId: 'command-1' }; },
  });
  assert.deepEqual(admitted.normalized, { certification_number: '40413252', grade: '10', population_total: 3 });
  assert.equal(receipt.delete_by, '2026-09-26T00:00:00.000Z');
  assert.equal(receipt.raw_payload_in_receipt, false);
  const serialized = JSON.stringify(receipt);
  assert(!serialized.includes('40413252'));
  assert(!serialized.includes('not-admitted'));
});

test('private PSA evaluation fails before storage when immutable rights or field map is absent', async () => {
  const privateStore = store();
  const input = { rawPayload: { cert: { number: '1', grade: '10' } }, certReferenceDigest: hash('c'), rightsReceipt: rights, fieldMap, privateStore, admitNormalized: async () => ({}) };
  await assert.rejects(() => stagePsaPrivateEvaluation({ ...input, rightsReceipt: { ...rights, source_message_immutability: 'PENDING' } }), /IMMUTABILITY_NOT_VERIFIED/);
  await assert.rejects(() => stagePsaPrivateEvaluation({ ...input, fieldMap: { ...fieldMap, state: 'DRAFT' } }), /FIELD_MAP_NOT_APPROVED/);
  assert.equal(privateStore.calls.length, 0);
});

test('expired PSA private records are deleted with a non-secret receipt', async () => {
  const privateStore = store();
  const receipt = await deleteExpiredPsaEvaluations({ privateStore, now: '2026-09-26T00:00:00Z' });
  assert.equal(receipt.deleted_count, 1);
  assert.equal(receipt.raw_payload_in_receipt, false);
  assert(privateStore.calls.some(([operation]) => operation === 'delete'));
  assert(!JSON.stringify(receipt).includes('private://psa/record-1'));
});

test('expired PSA deletion fails closed when store cannot verify deletion', async () => {
  const privateStore = store();
  privateStore.delete = async input => { privateStore.calls.push(['delete', input]); return { deletion_verified: false, raw_payload_retained: false }; };
  await assert.rejects(() => deleteExpiredPsaEvaluations({ privateStore, now: '2026-09-26T00:00:00Z' }), /DELETION_RECEIPT_NOT_VERIFIED/);
});
