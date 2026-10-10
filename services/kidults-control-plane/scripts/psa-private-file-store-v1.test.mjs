import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import { access, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPsaPrivateFileStore, resolvePsaPrivateStoreRoot, deleteExpiredPsaEvaluations, buildPrivatePsaRecord, buildPrivatePsaRecordFromDigest } from '../src/psa-cert-verification-adapter.mjs';

const hash = char => `sha256:${char.repeat(64)}`;
const syntheticCert = '9'.repeat(8);
const certDigest = `sha256:${createHash('sha256').update(syntheticCert).digest('hex')}`;

test('resealed future expiry still requires the original keyed authentication tag', async () => {
  const root=await mkdtemp(join(tmpdir(),'kidults-psa-expiry-reseal-'));
  const stable=value=>Array.isArray(value)?`[${value.map(stable).join(',')}]`
    :value&&typeof value==='object'?`{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${stable(value[k])}`).join(',')}}`
    :JSON.stringify(value);
  const digest=value=>`sha256:${createHash('sha256').update(value).digest('hex')}`;
  try {
    const store=createPsaPrivateFileStore({rootDir:root,key:Buffer.alloc(32,9)});
    const handle=await store.put({providerId:'psa-public-api',certReferenceDigest:certDigest,
      payload:{PSACert:{CertNumber:syntheticCert}},acquiredAt:'2026-10-01T00:00:00Z',
      deleteBy:'2026-10-02T00:00:00Z',rawDigest:hash('d')});
    const path=join(root,handle.slice('psa-private-file:'.length));
    const record=JSON.parse(await readFile(path,'utf8'));
    record.delete_at='2026-10-30T00:00:00.000Z';
    const aadKeys=['record_version','provider_id','classification','cert_reference_digest',
      'observed_at','delete_at','encryption','plaintext_persisted','public_release','production'];
    record.aad_digest=digest(stable(Object.fromEntries(aadKeys.map(k=>[k,record[k]]))));
    const {record_digest,...body}=record;
    record.record_digest=digest(stable(body));
    await writeFile(path,JSON.stringify(record),{mode:0o600});
    await assert.rejects(()=>deleteExpiredPsaEvaluations({privateStore:store,now:'2026-10-08T00:00:00Z'}),
      /PSA_PRIVATE_RECORD_TYPE_INVALID_OR_INTEGRITY_INVALID/);
    await access(path);
  } finally { await rm(root,{recursive:true,force:true}); }
});

test('deletion CLI preserves a breach receipt and returns a failing process result', async () => {
  const root=await mkdtemp(join(tmpdir(),'kidults-psa-deletion-cli-'));
  const key=Buffer.alloc(32,8);
  try {
    const store=createPsaPrivateFileStore({rootDir:root,key});
    const observed=new Date(Date.now()-2*86400000),deadline=new Date(Date.now()-86400000);
    await store.put({providerId:'psa-public-api',certReferenceDigest:certDigest,
      payload:{PSACert:{CertNumber:syntheticCert}},acquiredAt:observed.toISOString(),
      deleteBy:deadline.toISOString(),rawDigest:hash('d')});
    const script=fileURLToPath(new URL('../../../scripts/kidults/provider/run-psa-private-retention-deletion-v1.mjs',import.meta.url));
    const processResult=spawnSync(process.execPath,[script],{encoding:'utf8',timeout:10000,
      env:{...process.env,PSA_PRIVATE_STORE_ROOT:root,PSA_PRIVATE_STORE_KEY_B64:key.toString('base64')}});
    assert.equal(processResult.status,1);
    const receipt=JSON.parse(processResult.stdout);
    assert.equal(receipt.state,'VERIFIED_RETENTION_BREACH_DELETED');
    assert.equal(receipt.deleted_count,1); assert.equal(receipt.retention_breach_count,1);
    assert(!processResult.stdout.includes(syntheticCert)); assert(!processResult.stdout.includes(root));
  } finally { key.fill(0);await rm(root,{recursive:true,force:true}); }
});

for (const mutation of ['invalid', 'missing', 'future']) {
  test(`expiry selection rejects ${mutation} retention metadata instead of empty PASS`, async () => {
    const root = await mkdtemp(join(tmpdir(), 'kidults-psa-expiry-integrity-'));
    try {
      const store = createPsaPrivateFileStore({ rootDir: root, key: Buffer.alloc(32, 9) });
      const handle = await store.put({providerId:'psa-public-api',certReferenceDigest:certDigest,
        payload:{PSACert:{CertNumber:syntheticCert}},acquiredAt:'2026-10-01T00:00:00Z',
        deleteBy:'2026-10-02T00:00:00Z',rawDigest:hash('d')});
      const path = join(root, handle.slice('psa-private-file:'.length));
      const record = JSON.parse(await readFile(path, 'utf8'));
      if (mutation === 'missing') delete record.delete_at;
      else record.delete_at = mutation === 'invalid' ? 'not-a-date' : '2026-10-30T00:00:00Z';
      await writeFile(path, JSON.stringify(record), {mode:0o600});
      await assert.rejects(() => deleteExpiredPsaEvaluations({privateStore:store,now:'2026-10-08T00:00:00Z'}),
        /PSA_PRIVATE_RECORD_TYPE_INVALID_OR_INTEGRITY_INVALID/);
      await access(path);
      const audit = await readFile(join(root, 'audit.jsonl'), 'utf8');
      assert(!audit.includes('"operation":"DELETE"'));
    } finally { await rm(root,{recursive:true,force:true}); }
  });
}

test('expiry selection rejects a record symlink rather than certifying no records', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kidults-psa-expiry-link-'));
  try {
    const store = createPsaPrivateFileStore({rootDir:root,key:Buffer.alloc(32,9)});
    const handle=await store.put({providerId:'psa-public-api',certReferenceDigest:certDigest,
      payload:{PSACert:{CertNumber:syntheticCert}},acquiredAt:'2026-10-01T00:00:00Z',
      deleteBy:'2026-10-02T00:00:00Z',rawDigest:hash('d')});
    const path=join(root,handle.slice('psa-private-file:'.length));
    const backup=join(root,'retained-ciphertext.backup');
    await writeFile(backup,await readFile(path)); await rm(path); await symlink(backup,path);
    await assert.rejects(()=>deleteExpiredPsaEvaluations({privateStore:store,now:'2026-10-08T00:00:00Z'}),/PSA_PRIVATE_RECORD_TYPE_INVALID/);
    await access(backup);
  } finally { await rm(root,{recursive:true,force:true}); }
});

for (const cert of ['1234', undefined, {}, 123.4, Number.MAX_SAFE_INTEGER + 1]) {
  test(`store rejects unbound payload certificate ${String(cert)}`, () => {
    const payload={PSACert:{CertNumber:cert}};
    assert.throws(()=>buildPrivatePsaRecord({certNumber:syntheticCert,payload,key:Buffer.alloc(32,7)}),
      /PSA_PAYLOAD_CERT_IDENTITY_MISMATCH|PSA_PAYLOAD_CERT_NUMBER_INVALID/);
    assert.throws(()=>buildPrivatePsaRecordFromDigest({certReferenceDigest:certDigest,payload,key:Buffer.alloc(32,7),
      observedAt:'2026-10-01T00:00:00Z',deleteAt:'2026-10-02T00:00:00Z'}),
      /PSA_PAYLOAD_CERT_IDENTITY_MISMATCH|PSA_PAYLOAD_CERT_NUMBER_INVALID/);
  });
}

test('file store encrypts raw PSA payload and emits verified deletion audit', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kidults-psa-private-'));
  try {
    const store = createPsaPrivateFileStore({ rootDir: root, key: Buffer.alloc(32, 7), now: () => new Date('2026-08-28T00:00:00Z') });
    const handle = await store.put({
      providerId: 'psa-public-api', certReferenceDigest: certDigest, payload: { PSACert: { CertNumber: syntheticCert, CardGrade: '10' } },
      acquiredAt: '2026-08-28T00:00:00Z', deleteBy: '2026-09-27T00:00:00Z', rawDigest: hash('d')
    });
    const recordText = await readFile(join(root, handle.slice('psa-private-file:'.length)), 'utf8');
    assert(!recordText.includes(syntheticCert));
    assert(!recordText.includes('CardGrade'));
    const receipt = await deleteExpiredPsaEvaluations({ privateStore: store, now: '2026-09-27T00:00:00Z' });
    assert.equal(receipt.deleted_count, 1);
    const audit = await readFile(join(root, 'audit.jsonl'), 'utf8');
    assert(audit.includes('"deletion_verified":true'));
    assert(!audit.includes(syntheticCert));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('file store rejects retention beyond thirty days before write', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kidults-psa-private-negative-'));
  try {
    const store = createPsaPrivateFileStore({ rootDir: root, key: Buffer.alloc(32, 3) });
    await assert.rejects(() => store.put({
      providerId: 'psa-public-api', certReferenceDigest: certDigest, payload: { PSACert: {CertNumber: syntheticCert} },
      acquiredAt: '2026-08-28T00:00:00Z', deleteBy: '2026-09-28T00:00:01Z', rawDigest: hash('d')
    }), /DELETE_AT_OUT_OF_BOUNDS/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('file store rejects tampered deletion metadata and preserves the record', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kidults-psa-private-tamper-'));
  try {
    const store = createPsaPrivateFileStore({ rootDir: root, key: Buffer.alloc(32, 5) });
    const handle = await store.put({
      providerId: 'psa-public-api', certReferenceDigest: certDigest, payload: { PSACert: { CertNumber: syntheticCert } },
      acquiredAt: '2026-08-28T00:00:00Z', deleteBy: '2026-09-27T00:00:00Z', rawDigest: hash('d')
    });
    const path = join(root, handle.slice('psa-private-file:'.length));
    const record = JSON.parse(await readFile(path, 'utf8'));
    record.delete_at = '2026-08-29T00:00:00.000Z';
    await writeFile(path, `${JSON.stringify(record)}\n`, { mode: 0o600 });
    await assert.rejects(() => deleteExpiredPsaEvaluations({ privateStore: store, now: '2026-08-29T00:00:00Z' }));
    await access(path);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('runtime root validation rejects a symlink into the forbidden repository tree', async t => {
  const base = await mkdtemp(join(tmpdir(), 'kidults-psa-private-root-'));
  try {
    const repository = join(base, 'repository');
    const link = join(base, 'private-link');
    await mkdir(repository);
    try { await symlink(repository, link, 'dir'); }
    catch (error) {
      if (error?.code === 'EPERM' && process.platform === 'win32') {
        t.skip('Windows symlink privilege unavailable');
        return;
      }
      throw error;
    }
    await assert.rejects(() => resolvePsaPrivateStoreRoot({ rootDir: link, forbiddenRoot: repository }), /ROOT_OVERLAP_FORBIDDEN/);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('late retention run deletes overdue raw data and records the deadline breach', async () => {
  const root = await mkdtemp(join(tmpdir(), 'kidults-psa-private-late-'));
  try {
    const store = createPsaPrivateFileStore({ rootDir: root, key: Buffer.alloc(32, 6) });
    const handle = await store.put({
      providerId: 'psa-public-api', certReferenceDigest: certDigest, payload: { PSACert: { CertNumber: syntheticCert } },
      acquiredAt: '2026-08-28T00:00:00Z', deleteBy: '2026-09-27T00:00:00Z', rawDigest: hash('d')
    });
    const path = join(root, handle.slice('psa-private-file:'.length));
    const batchReceipt = await deleteExpiredPsaEvaluations({ privateStore: store, now: '2026-09-28T00:00:00Z' });
    assert.equal(batchReceipt.deleted_count, 1);
    assert.equal(batchReceipt.state, 'VERIFIED_RETENTION_BREACH_DELETED');
    assert.equal(batchReceipt.retention_breach_count, 1);
    assert.equal(batchReceipt.retention_deadline_met, false);
    assert.equal(batchReceipt.deletion_receipt_digests.length, 1);
    await assert.rejects(() => access(path), error => error?.code === 'ENOENT');
    const audit = await readFile(join(root, 'audit.jsonl'), 'utf8');
    assert(audit.includes('"retention_deadline_met":false'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('PUT audit failure removes encrypted record before rejecting',async()=>{
  const root=await mkdtemp(join(tmpdir(),'kidults-psa-put-audit-'));
  try {
    await mkdir(join(root,'audit.jsonl'));
    const store=createPsaPrivateFileStore({rootDir:root,key:Buffer.alloc(32,7)});
    await assert.rejects(()=>store.put({providerId:'psa-public-api',certReferenceDigest:certDigest,
      payload:{PSACert:{CertNumber:syntheticCert}},acquiredAt:'2026-10-10T00:00:00Z',
      deleteBy:'2026-10-11T00:00:00Z',rawDigest:hash('d')}),/PSA_PRIVATE_PUT_FAILED_RAW_DELETED/);
    assert.deepEqual(await readdir(root),['audit.jsonl']);
  } finally {await rm(root,{recursive:true,force:true});}
});

for (const deletedAt of ['bad-time','2026-10-09T00:00:00Z']) {
  test(`invalid delete clock preserves authenticated record: ${deletedAt}`,async()=>{
    const root=await mkdtemp(join(tmpdir(),'kidults-psa-delete-clock-'));
    try {
      const store=createPsaPrivateFileStore({rootDir:root,key:Buffer.alloc(32,7)});
      const handle=await store.put({providerId:'psa-public-api',certReferenceDigest:certDigest,
        payload:{PSACert:{CertNumber:syntheticCert}},acquiredAt:'2026-10-10T00:00:00Z',
        deleteBy:'2026-10-11T00:00:00Z',rawDigest:hash('d')});
      await assert.rejects(()=>store.delete({handle,reason:'EVALUATION_TERMINAL',deletedAt}),
        /PSA_DELETED_AT_INVALID|PSA_DELETION_BEFORE_OBSERVATION/);
      await access(join(root,handle.slice('psa-private-file:'.length)));
      assert(!(await readFile(join(root,'audit.jsonl'),'utf8')).includes('"operation":"DELETE"'));
    } finally {await rm(root,{recursive:true,force:true});}
  });
}

test('restart retains the evaluation fence and cleans an interrupted private PUT without admission retry',async()=>{
  const root=await mkdtemp(join(tmpdir(),'kidults-psa-interrupted-'));
  const key=Buffer.alloc(32,7),operationId=hash('e'),bindingDigest=hash('f');
  const moduleUrl=new URL('../src/psa-cert-verification-adapter.mjs',import.meta.url).href;
  try {
    const child=spawnSync(process.execPath,['--input-type=module','-e',`
      import {createPsaPrivateFileStore} from ${JSON.stringify(moduleUrl)};
      const store=createPsaPrivateFileStore({rootDir:process.env.TEST_PRIVATE_ROOT,key:Buffer.alloc(32,7),now:()=>new Date('2026-10-10T00:00:00Z')});
      await store.beginEvaluation({operationId:${JSON.stringify(operationId)},bindingDigest:${JSON.stringify(bindingDigest)}});
      await store.put({providerId:'psa-public-api',certReferenceDigest:${JSON.stringify(certDigest)},
        payload:{PSACert:{CertNumber:${JSON.stringify(syntheticCert)}}},acquiredAt:'2026-10-10T00:00:00Z',
        deleteBy:'2026-10-11T00:00:00Z',rawDigest:${JSON.stringify(hash('d'))},evaluationOperationId:${JSON.stringify(operationId)}});
      process.kill(process.pid,'SIGKILL');
    `],{encoding:'utf8',timeout:10000,env:{...process.env,TEST_PRIVATE_ROOT:root}});
    assert.equal(child.signal,'SIGKILL');assert.equal(child.stdout,'');
    const reopened=createPsaPrivateFileStore({rootDir:root,key});
    assert.equal((await reopened.beginEvaluation({operationId,bindingDigest})).state,'RECONCILIATION_REQUIRED');
    const recovered=await reopened.recoverPendingEvaluations({deletedAt:'2026-10-10T00:05:01Z'});
    assert.equal(recovered.deleted_count,1);assert.equal(recovered.admission_retry_authority,false);
    assert.equal((await reopened.recoverPendingEvaluations({deletedAt:'2026-10-10T00:05:02Z'})).deleted_count,0);
    assert.equal((await reopened.beginEvaluation({operationId,bindingDigest})).state,'RECONCILIATION_REQUIRED');
    assert(!JSON.stringify(recovered).includes(syntheticCert));
    await assert.rejects(()=>reopened.beginEvaluation({operationId,bindingDigest:hash('a')}),/OPERATION_BINDING_MISMATCH/);
  } finally {key.fill(0);await rm(root,{recursive:true,force:true});}
});

test('authenticated terminal receipt survives reopen and rejects resealed tampering',async()=>{
  const root=await mkdtemp(join(tmpdir(),'kidults-psa-terminal-'));
  const key=Buffer.alloc(32,7),operationId=hash('e'),bindingDigest=hash('f');
  try {
    const store=createPsaPrivateFileStore({rootDir:root,key});
    assert.equal((await store.beginEvaluation({operationId,bindingDigest})).state,'CLAIMED');
    const receipt={operation_id:operationId,state:'VERIFIED_PASS',raw_payload_retained:false};
    await store.completeEvaluation({operationId,bindingDigest,receipt});
    const reopened=createPsaPrivateFileStore({rootDir:root,key});
    assert.deepEqual(await reopened.beginEvaluation({operationId,bindingDigest}),{state:'COMPLETED',receipt});
    const path=join(root,`evaluation-${operationId.slice(7)}.terminal.json`);
    const terminal=JSON.parse(await readFile(path,'utf8'));
    terminal.receipt.unverified_claim='modified';
    await writeFile(path,JSON.stringify(terminal),{mode:0o600});
    await assert.rejects(()=>reopened.beginEvaluation({operationId,bindingDigest}),/TERMINAL_BINDING_INVALID/);
  } finally {key.fill(0);await rm(root,{recursive:true,force:true});}
});

test('corrupt record preserves a failure while other expired raw data is deleted',async()=>{
  const root=await mkdtemp(join(tmpdir(),'kidults-psa-corrupt-isolation-'));
  try {
    const store=createPsaPrivateFileStore({rootDir:root,key:Buffer.alloc(32,7)});
    const input={providerId:'psa-public-api',certReferenceDigest:certDigest,
      payload:{PSACert:{CertNumber:syntheticCert}},acquiredAt:'2026-10-01T00:00:00Z',
      deleteBy:'2026-10-02T00:00:00Z',rawDigest:hash('d')};
    const bad=await store.put(input),good=await store.put(input);
    await writeFile(join(root,bad.slice('psa-private-file:'.length)),'corrupt',{mode:0o600});
    await assert.rejects(()=>deleteExpiredPsaEvaluations({privateStore:store,now:'2026-10-10T00:00:00Z'}),error=>{
      assert.equal(error.receipt.state,'VERIFIED_FAIL_INVALID_PRIVATE_RECORD');
      assert.equal(error.receipt.invalid_record_count,1);assert.equal(error.receipt.deleted_count,1);
      assert(!JSON.stringify(error.receipt).includes(syntheticCert));return true;
    });
    await access(join(root,bad.slice('psa-private-file:'.length)));
    await assert.rejects(()=>access(join(root,good.slice('psa-private-file:'.length))),error=>error.code==='ENOENT');
  } finally {await rm(root,{recursive:true,force:true});}
});

test('janitor skips a live lease and isolates a truncated pending claim',async()=>{
  const root=await mkdtemp(join(tmpdir(),'kidults-psa-lease-'));
  const key=Buffer.alloc(32,7),operationId=hash('e'),bindingDigest=hash('f');
  try {
    let clock=new Date('2026-10-10T00:00:00Z');
    const store=createPsaPrivateFileStore({rootDir:root,key,now:()=>clock});
    await store.beginEvaluation({operationId,bindingDigest});
    const handle=await store.put({providerId:'psa-public-api',certReferenceDigest:certDigest,
      payload:{PSACert:{CertNumber:syntheticCert}},acquiredAt:clock.toISOString(),
      deleteBy:'2026-10-11T00:00:00Z',rawDigest:hash('d'),evaluationOperationId:operationId});
    await writeFile(join(root,`evaluation-${hash('a').slice(7)}.json`),'truncated',{mode:0o600});
    let result=await store.recoverPendingEvaluations({deletedAt:clock});
    assert.equal(result.state,'VERIFIED_FAIL_PENDING_RAW_RECOVERY');
    assert.equal(result.active_operation_count,1);assert.equal(result.failed_operation_count,1);
    assert.equal(result.deleted_count,0);await access(join(root,handle.slice('psa-private-file:'.length)));
    clock=new Date('2026-10-10T00:05:01Z');
    result=await store.recoverPendingEvaluations({deletedAt:clock});
    assert.equal(result.deleted_count,1);assert.equal(result.failed_operation_count,1);
    await assert.rejects(()=>store.completeEvaluation({operationId,bindingDigest,
      receipt:{operation_id:operationId,state:'VERIFIED_PASS',raw_payload_retained:false}}),/LEASE_EXPIRED/);
    await assert.rejects(()=>store.put({providerId:'psa-public-api',certReferenceDigest:certDigest,
      payload:{PSACert:{CertNumber:syntheticCert}},acquiredAt:clock.toISOString(),
      deleteBy:'2026-10-11T00:00:00Z',rawDigest:hash('d'),evaluationOperationId:operationId}),/LEASE_EXPIRED/);
  } finally {key.fill(0);await rm(root,{recursive:true,force:true});}
});
