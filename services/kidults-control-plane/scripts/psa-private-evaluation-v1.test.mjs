import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import { stagePsaPrivateEvaluation, deleteExpiredPsaEvaluations } from '../src/psa-private-evaluation.mjs';

const hash = char => `sha256:${char.repeat(64)}`;
const referenceKey = Buffer.alloc(32, 9);
const syntheticCertNumber = '4'.repeat(8);
const differentSyntheticCertNumber = '8'.repeat(8);
const certReference = certNumber => `hmac-sha256:v1:${createHmac('sha256', referenceKey)
  .update(`KIDULTS_PSA_CERT_REFERENCE_V1\0${certNumber}`)
  .digest('hex')}`;
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
  const raw = { cert: { number: syntheticCertNumber, grade: '10' }, population: { total: 3 }, secretExtra: 'not-admitted' };
  const receipt = await stagePsaPrivateEvaluation({
    rawPayload: raw, certReferenceDigest: certReference(raw.cert.number), certReferenceKey: referenceKey,
    rightsReceipt: rights, fieldMap,
    privateStore, acquiredAt: '2026-08-27T00:00:00Z',
    admitNormalized: async input => { admitted = input; return { state: 'COMMITTED', commandId: 'command-1' }; },
  });
  assert.deepEqual(admitted.normalized, { certification_number: syntheticCertNumber, grade: '10', population_total: 3 });
  assert.equal(receipt.delete_by, '2026-09-26T00:00:00.000Z');
  assert.equal(receipt.raw_payload_in_receipt, false);
  const serialized = JSON.stringify(receipt);
  assert(!serialized.includes(syntheticCertNumber));
  assert(!serialized.includes('not-admitted'));
});

test('new private PSA staging requires a payload-bound HMAC cert reference and rejects legacy or malformed references', async () => {
  const privateStore = store();
  const certNumber = syntheticCertNumber;
  const input = {
    rawPayload: { cert: { number: certNumber, grade: '10' } }, rightsReceipt: rights, fieldMap, privateStore,
    certReferenceKey: referenceKey,
    admitNormalized: async () => ({ state: 'COMMITTED' }),
  };
  await stagePsaPrivateEvaluation({ ...input, certReferenceDigest: certReference(certNumber) });
  await assert.rejects(
    () => stagePsaPrivateEvaluation({ ...input, certReferenceDigest: hash('c') }),
    /PSA_HMAC_CERT_REFERENCE_REQUIRED/,
  );
  await assert.rejects(
    () => stagePsaPrivateEvaluation({ ...input, certReferenceDigest: `hmac-sha256:v2:${'e'.repeat(64)}` }),
    /PSA_CERT_REFERENCE_DIGEST_INVALID/,
  );
  assert.equal(privateStore.calls.filter(([operation]) => operation === 'put').length, 1);
});

test('private PSA staging rejects a validly formatted HMAC that does not authenticate the payload cert', async () => {
  const privateStore = store();
  await assert.rejects(() => stagePsaPrivateEvaluation({
    rawPayload: { cert: { number: syntheticCertNumber, grade: '10' } },
    certReferenceDigest: certReference(differentSyntheticCertNumber), certReferenceKey: referenceKey,
    rightsReceipt: rights, fieldMap, privateStore,
    admitNormalized: async () => ({ state: 'COMMITTED' }),
  }), /PSA_CERT_REFERENCE_PAYLOAD_MISMATCH/);
  await assert.rejects(() => stagePsaPrivateEvaluation({
    rawPayload: { cert: { number: syntheticCertNumber, grade: '10' } },
    certReferenceDigest: certReference(syntheticCertNumber),
    rightsReceipt: rights, fieldMap, privateStore,
    admitNormalized: async () => ({ state: 'COMMITTED' }),
  }), /PSA_CERT_REFERENCE_KEY_REQUIRED/);
  await assert.rejects(() => stagePsaPrivateEvaluation({
    rawPayload: {
      cert: { number: syntheticCertNumber, grade: '10' },
      PSACert: { CertNumber: differentSyntheticCertNumber },
    },
    certReferenceDigest: certReference(syntheticCertNumber), certReferenceKey: referenceKey,
    rightsReceipt: rights, fieldMap, privateStore,
    admitNormalized: async () => ({ state: 'COMMITTED' }),
  }), /PSA_PAYLOAD_CERT_NUMBER_CONFLICT/);
  const fieldMapWithoutCert = {
    ...fieldMap,
    mappings: [{ source_path: 'cert.grade', canonical_field: 'grade', required: true }],
  };
  await assert.rejects(() => stagePsaPrivateEvaluation({
    rawPayload: { cert: { grade: '10' } },
    certReferenceDigest: certReference(syntheticCertNumber), certReferenceKey: referenceKey,
    rightsReceipt: rights, fieldMap: fieldMapWithoutCert, privateStore,
    admitNormalized: async () => ({ state: 'COMMITTED' }),
  }), /PSA_PAYLOAD_CERT_NUMBER_REQUIRED/);
  assert.equal(privateStore.calls.length, 0);
});

test('private PSA evaluation fails before storage when immutable rights or field map is absent', async () => {
  const privateStore = store();
  const certNumber = syntheticCertNumber;
  const input = {
    rawPayload: { cert: { number: certNumber, grade: '10' } },
    certReferenceDigest: certReference(certNumber), certReferenceKey: referenceKey,
    rightsReceipt: rights, fieldMap, privateStore, admitNormalized: async () => ({}),
  };
  await assert.rejects(() => stagePsaPrivateEvaluation({ ...input, rightsReceipt: { ...rights, source_message_immutability: 'PENDING' } }), /IMMUTABILITY_NOT_VERIFIED/);
  await assert.rejects(() => stagePsaPrivateEvaluation({ ...input, fieldMap: { ...fieldMap, state: 'DRAFT' } }), /FIELD_MAP_NOT_APPROVED/);
  assert.equal(privateStore.calls.length, 0);
});

test('private PSA staging compensates the encrypted raw write when normalized admission fails', async () => {
  const privateStore = store();
  const certNumber = syntheticCertNumber;
  await assert.rejects(() => stagePsaPrivateEvaluation({
    rawPayload: { cert: { number: certNumber, grade: '10' } },
    certReferenceDigest: certReference(certNumber), certReferenceKey: referenceKey,
    rightsReceipt: rights, fieldMap, privateStore, acquiredAt: '2026-08-28T00:00:00Z',
    admitNormalized: async () => { throw new Error('NORMALIZED_ADMISSION_FAILED'); },
  }), /NORMALIZED_ADMISSION_FAILED/);
  assert.deepEqual(privateStore.calls.map(([operation]) => operation), ['put', 'delete']);
  assert.equal(privateStore.calls[1][1].reason, 'ADMISSION_FAILED_COMPENSATION');
  assert(Date.parse(privateStore.calls[1][1].deletedAt) >= Date.parse('2026-08-28T00:00:00Z'));
});

test('private PSA staging surfaces an explicit aggregate failure if admission and compensation both fail', async () => {
  const privateStore = store();
  privateStore.delete = async input => {
    privateStore.calls.push(['delete', input]);
    throw new Error('PRIVATE_DELETE_FAILED');
  };
  const certNumber = syntheticCertNumber;
  await assert.rejects(() => stagePsaPrivateEvaluation({
    rawPayload: { cert: { number: certNumber, grade: '10' } },
    certReferenceDigest: certReference(certNumber), certReferenceKey: referenceKey,
    rightsReceipt: rights, fieldMap, privateStore,
    admitNormalized: async () => { throw new Error('NORMALIZED_ADMISSION_FAILED'); },
  }), error => error instanceof AggregateError && error.message === 'PSA_ADMISSION_FAILED_COMPENSATION_FAILED');
});

test('expired PSA private records are deleted with a non-secret receipt', async () => {
  const privateStore = store();
  const receipt = await deleteExpiredPsaEvaluations({ privateStore, now: '2026-09-26T00:00:00Z' });
  assert.equal(receipt.deleted_count, 1);
  assert.equal(receipt.state, 'VERIFIED_PASS');
  assert.equal(receipt.retention_breach_count, 0);
  assert.equal(receipt.raw_payload_in_receipt, false);
  assert(privateStore.calls.some(([operation]) => operation === 'delete'));
  assert(!JSON.stringify(receipt).includes('private://psa/record-1'));
});

test('expired PSA deletion batch surfaces any per-record retention breach using digest-only evidence', async () => {
  const privateStore = store();
  privateStore.listExpired = async () => [
    { handle: 'private://psa/on-time-record' },
    { handle: 'private://psa/late-record' },
  ];
  privateStore.delete = async input => {
    privateStore.calls.push(['delete', input]);
    if (input.handle.endsWith('late-record')) {
      return {
        state: 'VERIFIED_RETENTION_BREACH_DELETED', deletion_verified: true,
        retention_deadline_met: false, raw_payload_retained: false,
        record_digest: hash('b'), raw_payload: 'must-not-enter-batch-receipt',
      };
    }
    return {
      state: 'VERIFIED_PASS', deletion_verified: true, retention_deadline_met: true,
      raw_payload_retained: false, record_digest: hash('a'),
    };
  };
  const receipt = await deleteExpiredPsaEvaluations({ privateStore, now: '2026-09-26T00:00:00Z' });
  assert.equal(receipt.state, 'VERIFIED_RETENTION_BREACH_DELETED');
  assert.equal(receipt.deleted_count, 2);
  assert.equal(receipt.retention_breach_count, 1);
  assert.equal(receipt.retention_breach_digests.length, 1);
  assert.equal(receipt.retention_breach_handle_digests.length, 1);
  assert.deepEqual(receipt.retention_breach_record_digests, [hash('b')]);
  const serialized = JSON.stringify(receipt);
  assert(!serialized.includes('private://psa/'));
  assert(!serialized.includes('must-not-enter-batch-receipt'));
});

test('expired PSA deletion fails closed when store cannot verify deletion', async () => {
  const privateStore = store();
  privateStore.delete = async input => { privateStore.calls.push(['delete', input]); return { deletion_verified: false, raw_payload_retained: false }; };
  await assert.rejects(() => deleteExpiredPsaEvaluations({ privateStore, now: '2026-09-26T00:00:00Z' }), /DELETION_RECEIPT_NOT_VERIFIED/);
});
