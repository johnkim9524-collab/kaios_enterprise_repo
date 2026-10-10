import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import { stagePsaPrivateEvaluation, deleteExpiredPsaEvaluations } from '../src/psa-cert-verification-adapter.mjs';

const hash = char => `sha256:${char.repeat(64)}`;
const syntheticCert = '4'.repeat(8);
const certDigest = `sha256:${createHash('sha256').update(syntheticCert).digest('hex')}`;
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
    { source_path: 'PSACert.CertNumber', canonical_field: 'certification_number', required: true },
    { source_path: 'PSACert.CardGrade', canonical_field: 'grade', required: true },
    { source_path: 'PSACert.TotalPopulation', canonical_field: 'population_total', required: false },
  ],
};

function store() {
  const calls = [];
  let completed; let claimed=false;
  return {
    beginEvaluation:async()=>{if(completed)return {state:'COMPLETED',receipt:completed};if(claimed)return {state:'RECONCILIATION_REQUIRED'};claimed=true;return {state:'CLAIMED'};},
    completeEvaluation:async({receipt})=>{completed=receipt;},
    calls, capabilities: ['ENCRYPTION_AT_REST', 'ACCESS_AUDIT', 'DELETE_BY_ENFORCEMENT'],
    put: async input => { calls.push(['put', input]); return 'private://psa/record-1'; },
    listExpired: async () => [{ handle: 'private://psa/record-1' }],
    delete: async input => { calls.push(['delete', input]); return { state: 'VERIFIED_PASS', deletion_verified: true, raw_payload_retained: false, retention_deadline_met: true }; },
  };
}

test('private PSA evaluation persists only behind verified rights and approved field map', async () => {
  const privateStore = store();
  let admitted;
  const raw = { PSACert: { CertNumber: syntheticCert, CardGrade: '10', TotalPopulation: 3 } };
  const receipt = await stagePsaPrivateEvaluation({ operationId:hash('e'), now:()=>new Date('2026-08-28T00:00:00Z'),
    rawPayload: raw, certReferenceDigest: certDigest, rightsReceipt: rights, fieldMap,
    privateStore, acquiredAt: '2026-08-27T00:00:00Z',
    admitNormalized: async input => { admitted = input; return { state: 'COMMITTED', commandId: 'command-1' }; },
  });
  assert.deepEqual(admitted.normalized, { certification_number: syntheticCert, grade: '10', population_total: 3 });
  assert.equal(receipt.delete_by, '2026-09-26T00:00:00.000Z');
  assert.equal(receipt.raw_payload_in_receipt, false);
  assert.equal(receipt.raw_payload_retained, false);
  assert.match(receipt.deletion_receipt_digest, /^sha256:[0-9a-f]{64}$/);
  assert.equal(privateStore.calls.filter(([op]) => op === 'delete').length, 1);
  assert.equal(privateStore.calls.at(-1)[1].reason, 'EVALUATION_TERMINAL');
  const serialized = JSON.stringify(receipt);
  assert(!serialized.includes(syntheticCert));
  assert(!serialized.includes('not-admitted'));
});

test('private PSA evaluation fails before storage when immutable rights or field map is absent', async () => {
  const privateStore = store();
  const input = { rawPayload: { PSACert: { CertNumber: syntheticCert, CardGrade: '10' } }, acquiredAt:'2026-08-27T00:00:00Z', certReferenceDigest: certDigest, rightsReceipt: rights, fieldMap, privateStore, admitNormalized: async () => ({}) };
  await assert.rejects(() => stagePsaPrivateEvaluation({ operationId:hash('e'), now:()=>new Date('2026-08-28T00:00:00Z'), ...input, rightsReceipt: { ...rights, source_message_immutability: 'PENDING' } }), /IMMUTABILITY_NOT_VERIFIED/);
  await assert.rejects(() => stagePsaPrivateEvaluation({ operationId:hash('e'), now:()=>new Date('2026-08-28T00:00:00Z'), ...input, fieldMap: { ...fieldMap, state: 'DRAFT' } }), /FIELD_MAP_NOT_APPROVED/);
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

test('mixed retention batch preserves the breach and binds all sanitized deletion results', async () => {
  const privateStore=store();
  privateStore.listExpired=async()=>[{handle:'private://psa/one'},{handle:'private://psa/two'}];
  privateStore.delete=async({handle})=>({state:handle.endsWith('one')?'VERIFIED_PASS':'VERIFIED_RETENTION_BREACH_DELETED',
    deletion_verified:true,raw_payload_retained:false,retention_deadline_met:handle.endsWith('one')});
  const result=await deleteExpiredPsaEvaluations({privateStore,now:'2026-10-08T00:00:00Z'});
  assert.equal(result.state,'VERIFIED_RETENTION_BREACH_DELETED');
  assert.equal(result.retention_deadline_met,false);
  assert.equal(result.retention_breach_count,1); assert.equal(result.deleted_count,2);
  assert.equal(result.deletion_receipt_digests.length,2);
  assert(!JSON.stringify(result).includes('private://psa/'));
});

for (const deletion of [
  {state:'VERIFIED_PASS'},
  {state:'VERIFIED_PASS',retention_deadline_met:false},
  {state:'VERIFIED_RETENTION_BREACH_DELETED',retention_deadline_met:true},
  {state:'UNKNOWN',retention_deadline_met:true},
]) {
  test(`retention aggregation rejects inconsistent result ${JSON.stringify(deletion)}`, async () => {
    const privateStore=store();
    privateStore.delete=async()=>({...deletion,deletion_verified:true,raw_payload_retained:false});
    await assert.rejects(()=>deleteExpiredPsaEvaluations({privateStore,now:'2026-10-08T00:00:00Z'}),/PSA_DELETION_RETENTION_STATE_INVALID/);
  });
}

test('evaluation rejects another certificate before store or normalized admission', async () => {
  const privateStore=store(); let admissions=0;
  await assert.rejects(()=>stagePsaPrivateEvaluation({ operationId:hash('e'), now:()=>new Date('2026-08-28T00:00:00Z'),
    rawPayload:{PSACert:{CertNumber:'1234',CardGrade:'10'}},certReferenceDigest:certDigest,
    rightsReceipt:rights,fieldMap,privateStore,acquiredAt:'2026-10-08T00:00:00Z',now:()=>new Date('2026-10-08T00:00:01Z'),
    admitNormalized:async()=>{admissions+=1;return {state:'COMMITTED',commandId:'wrong-cert'};}
  }),/PSA_PAYLOAD_CERT_IDENTITY_MISMATCH/);
  assert.equal(privateStore.calls.length,0); assert.equal(admissions,0);
});

for (const admission of [undefined, {}, {state:'FAILED'}, {state:'COMMITTED'}, {state:'COMMITTED',commandId:' '}]) {
  test(`evaluation rejects incomplete normalized admission ${JSON.stringify(admission)}`, async () => {
    const privateStore=store();
    await assert.rejects(() => stagePsaPrivateEvaluation({ operationId:hash('e'), now:()=>new Date('2026-08-28T00:00:00Z'),
      rawPayload:{PSACert:{CertNumber:syntheticCert,CardGrade:'10'}},certReferenceDigest:certDigest,
      rightsReceipt:rights,fieldMap,privateStore,acquiredAt:'2026-08-27T00:00:00Z',
      admitNormalized:async()=>admission,
    }), /PSA_NORMALIZED_ADMISSION_NOT_COMMITTED/);
  });
}

const evaluationInput = privateStore => ({
  rawPayload:{PSACert:{CertNumber:syntheticCert,CardGrade:'10'}},certReferenceDigest:certDigest,
  rightsReceipt:rights,fieldMap,privateStore,acquiredAt:'2026-10-10T00:00:00Z',
  now:()=>new Date('2026-10-10T00:00:01Z'),
});

test('ambiguous admission is called once, raw deleted, and private exception suppressed', async () => {
  const privateStore=store(); let calls=0;
  await assert.rejects(()=>stagePsaPrivateEvaluation({ operationId:hash('e'), now:()=>new Date('2026-08-28T00:00:00Z'),...evaluationInput(privateStore),
    admitNormalized:async()=>{calls++;throw new Error(`private ${syntheticCert}`);}}),
    error=>error.message==='PSA_NORMALIZED_ADMISSION_OUTCOME_UNKNOWN'&&!error.cause);
  assert.equal(calls,1);
  assert.equal(privateStore.calls.filter(([op])=>op==='delete').length,1);
});

test('uncommitted admission cleans raw exactly once before returning failure', async () => {
  const privateStore=store();
  await assert.rejects(()=>stagePsaPrivateEvaluation({ operationId:hash('e'), now:()=>new Date('2026-08-28T00:00:00Z'),...evaluationInput(privateStore),
    admitNormalized:async()=>({state:'REJECTED'})}),/PSA_NORMALIZED_ADMISSION_NOT_COMMITTED/);
  assert.equal(privateStore.calls.filter(([op])=>op==='delete').length,1);
});

for (const failure of ['throw','unverified','inconsistent']) {
  test(`committed admission cannot become PASS when cleanup is ${failure}`, async () => {
    const privateStore=store(); let admissions=0,deletions=0;
    privateStore.delete=async()=>{deletions++;if(failure==='throw')throw new Error(syntheticCert);
      return {state:'VERIFIED_PASS',deletion_verified:failure!=='unverified',raw_payload_retained:false,
        retention_deadline_met:failure!=='inconsistent'};};
    await assert.rejects(()=>stagePsaPrivateEvaluation({ operationId:hash('e'), now:()=>new Date('2026-08-28T00:00:00Z'),...evaluationInput(privateStore),
      admitNormalized:async()=>{admissions++;return {state:'COMMITTED',commandId:'one'};}}),error=>{
      assert.equal(error.message,'PSA_EVALUATION_TERMINAL_CLEANUP_UNVERIFIED');
      assert.equal(error.recovery.admission_outcome,'COMMITTED');
      assert.equal(error.recovery.automatic_admission_retry,false);
      assert(!JSON.stringify(error.recovery).includes(syntheticCert));
      assert(!JSON.stringify(error.recovery).includes('private://'));
      return true;
    });
    assert.equal(admissions,1);assert.equal(deletions,1);
  });
}

test('terminal raw deletion retains the missed deadline as a failure',async()=>{
  const privateStore=store();
  privateStore.delete=async()=>({state:'VERIFIED_RETENTION_BREACH_DELETED',deletion_verified:true,
    raw_payload_retained:false,retention_deadline_met:false});
  await assert.rejects(()=>stagePsaPrivateEvaluation({ operationId:hash('e'), now:()=>new Date('2026-08-28T00:00:00Z'),...evaluationInput(privateStore),
    admitNormalized:async()=>({state:'COMMITTED',commandId:'one'})}),/PSA_EVALUATION_RETENTION_BREACH_DELETED/);
});

test('completed evaluation replay returns existing receipt without PUT/admission/delete',async()=>{
  const privateStore=store();let calls=0;
  const input={...evaluationInput(privateStore),operationId:hash('e'),
    admitNormalized:async()=>{calls++;return {state:'COMMITTED',commandId:'one'};}};
  const first=await stagePsaPrivateEvaluation(input);
  const second=await stagePsaPrivateEvaluation(input);
  assert.deepEqual(second,first);assert.equal(calls,1);assert.equal(privateStore.calls.length,2);
});

test('timed out admission is aborted, raw cleaned, and replay blocked without retry',async()=>{
  const privateStore=store();let calls=0;let signal;
  const input={...evaluationInput(privateStore),operationId:hash('e'),admissionTimeoutMs:10,
    admitNormalized:async value=>{calls++;signal=value.signal;return new Promise(()=>{});}};
  await assert.rejects(()=>stagePsaPrivateEvaluation(input),/PSA_NORMALIZED_ADMISSION_OUTCOME_UNKNOWN/);
  assert.equal(signal.aborted,true);
  await assert.rejects(()=>stagePsaPrivateEvaluation(input),/PSA_EVALUATION_RECONCILIATION_REQUIRED/);
  assert.equal(calls,1);assert.equal(privateStore.calls.filter(([op])=>op==='delete').length,1);
});

for(const acquiredAt of ['2026-10-11T00:00:00Z','2026-08-01T00:00:00Z']) {
  test(`invalid acquisition clock stops before claim or PUT ${acquiredAt}`,async()=>{
    const privateStore=store();let claims=0;
    privateStore.beginEvaluation=async()=>{claims++;return {state:'CLAIMED'};};
    await assert.rejects(()=>stagePsaPrivateEvaluation({...evaluationInput(privateStore),operationId:hash('e'),
      acquiredAt,admitNormalized:async()=>({state:'COMMITTED',commandId:'one'})}),
      /PSA_ACQUIRED_AT_FUTURE|PSA_EVALUATION_INPUT_RETENTION_EXPIRED/);
    assert.equal(claims,0);assert.equal(privateStore.calls.length,0);
  });
}
