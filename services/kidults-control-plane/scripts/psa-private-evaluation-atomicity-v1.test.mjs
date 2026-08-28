import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stagePsaPrivateEvaluation, deleteExpiredPsaEvaluations } from '../src/psa-private-evaluation.mjs';
import { createPsaPrivateFileStore } from '../src/psa-private-evaluation-store.mjs';

const certDigest = value => `sha256:${createHash('sha256').update(String(value), 'utf8').digest('hex')}`;
const rights = {
  provider_id: 'psa-public-api', source_message_immutability: 'VERIFIED',
  collect: 'ALLOW', store_private: 'ALLOW', derive_internal_er_calibration: 'ALLOW', internal_human_qa: 'ALLOW',
  public_display: 'BLOCK', redistribute: 'BLOCK', retention_days: 30, evidence_ref: 'github:#1251/original-message-digest',
};
const fieldMap = {
  provider_id: 'psa-public-api', field_map_id: 'psa-cert-field-map-v1', state: 'APPROVED_FOR_BOUNDED_PRIVATE_EVALUATION',
  observed_schema_digest: `sha256:${'a'.repeat(64)}`,
  mappings: [
    { source_path: 'PSACert.CertNumber', canonical_field: 'certification_number', required: true },
    { source_path: 'PSACert.CardGrade', canonical_field: 'grade', required: false },
  ],
};
const rawPayload = { PSACert: { CertNumber: '08178895', CardGrade: '10' } };

function mockStore({ cleanupVerified = true, cleanupThrows = false } = {}) {
  const calls = [];
  return {
    calls,
    capabilities: ['ENCRYPTION_AT_REST', 'ACCESS_AUDIT', 'DELETE_BY_ENFORCEMENT'],
    put: async input => { calls.push(['put', input]); return 'private://psa/record-atomic'; },
    listExpired: async () => [],
    delete: async input => {
      calls.push(['delete', input]);
      if (cleanupThrows) throw new Error('MOCK_DELETE_FAILED');
      return { deletion_verified: cleanupVerified, raw_payload_retained: false };
    },
  };
}

test('normalized admission failure triggers verified compensating deletion before the failure escapes', async () => {
  const privateStore = mockStore();
  await assert.rejects(() => stagePsaPrivateEvaluation({
    rawPayload, certReferenceDigest: certDigest('08178895'), rightsReceipt: rights, fieldMap, privateStore,
    acquiredAt: '2026-08-28T00:00:00Z', admitNormalized: async () => { throw new Error('ADMISSION_REJECTED'); },
  }), /ADMISSION_REJECTED/);
  assert.deepEqual(privateStore.calls.map(([name]) => name), ['put', 'delete']);
  assert.equal(privateStore.calls[1][1].reason, 'STAGE_ABORT');
});

test('non-committed admission receipt is rejected and raw private write is compensated', async () => {
  const privateStore = mockStore();
  await assert.rejects(() => stagePsaPrivateEvaluation({
    rawPayload, certReferenceDigest: certDigest('08178895'), rightsReceipt: rights, fieldMap, privateStore,
    acquiredAt: '2026-08-28T00:00:00Z', admitNormalized: async () => ({ state: 'PENDING' }),
  }), /PSA_NORMALIZED_ADMISSION_NOT_COMMITTED/);
  assert.equal(privateStore.calls.at(-1)[0], 'delete');
  assert.equal(privateStore.calls.at(-1)[1].reason, 'STAGE_ABORT');
});

test('failed compensating deletion fails closed with both admission and cleanup errors retained', async () => {
  const privateStore = mockStore({ cleanupThrows: true });
  await assert.rejects(() => stagePsaPrivateEvaluation({
    rawPayload, certReferenceDigest: certDigest('08178895'), rightsReceipt: rights, fieldMap, privateStore,
    acquiredAt: '2026-08-28T00:00:00Z', admitNormalized: async () => { throw new Error('ADMISSION_REJECTED'); },
  }), error => error instanceof AggregateError && error.message === 'PSA_STAGE_ADMISSION_FAILED_AND_COMPENSATION_FAILED' && error.errors.length === 2);
});

test('real file store removes encrypted raw record when normalized admission fails', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kidults-psa-stage-atomic-'));
  try {
    const privateStore = createPsaPrivateFileStore({ rootDir: root, key: Buffer.alloc(32, 11), now: () => new Date('2026-08-28T00:00:00Z') });
    await assert.rejects(() => stagePsaPrivateEvaluation({
      rawPayload, certReferenceDigest: certDigest('08178895'), rightsReceipt: rights, fieldMap, privateStore,
      acquiredAt: '2026-08-28T00:00:00Z', admitNormalized: async () => { throw new Error('ADMISSION_REJECTED'); },
    }), /ADMISSION_REJECTED/);
    const recordFiles = (await readdir(root)).filter(name => /^[0-9a-f-]{36}\.json$/.test(name));
    assert.deepEqual(recordFiles, []);
    const audit = await readFile(join(root, 'audit.jsonl'), 'utf8');
    assert(audit.includes('"reason":"STAGE_ABORT"'));
    assert(audit.includes('"deletion_verified":true'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('expiry classification authenticates the record before trusting a moved-forward delete_at', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kidults-psa-expiry-integrity-'));
  try {
    const privateStore = createPsaPrivateFileStore({ rootDir: root, key: Buffer.alloc(32, 12), now: () => new Date('2026-08-28T00:00:00Z') });
    const handle = await privateStore.put({
      providerId: 'psa-public-api', certReferenceDigest: certDigest('08178895'), payload: rawPayload,
      acquiredAt: '2026-08-28T00:00:00Z', deleteBy: '2026-09-27T00:00:00Z', rawDigest: `sha256:${'d'.repeat(64)}`,
    });
    const path = join(root, handle.slice('psa-private-file:'.length));
    const record = JSON.parse(await readFile(path, 'utf8'));
    record.delete_at = '2026-10-27T00:00:00.000Z';
    await writeFile(path, `${JSON.stringify(record)}\n`, { mode: 0o600 });
    await assert.rejects(() => deleteExpiredPsaEvaluations({ privateStore, now: '2026-09-28T00:00:00Z' }), /PSA_RECORD_DIGEST_INVALID|PSA_RETENTION_WINDOW_INVALID/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
