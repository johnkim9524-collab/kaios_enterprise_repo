import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,readdir,rm,chmod} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {createProviderQuarantineFileStore} from '../src/provider-quarantine-file-store.mjs';
const scope={kmsContext:'kidults:data-class=REAL',dbNamespace:'provider_real',queueId:'provider-real-ingress'};
test('concrete quarantine encrypts, reads back and deletes expired bytes',async()=>{
 const parent=await mkdtemp(join(tmpdir(),'quarantine-store-test-'));let date=new Date('2026-10-08T00:00:00.000Z');
 try{
  const root=join(parent,'private'),forbidden=join(parent,'repository');await mkdir(root,{mode:0o700});await mkdir(forbidden);
  const store=await createProviderQuarantineFileStore({rootDir:root,forbiddenRoot:forbidden,key:randomBytes(32),now:()=>date});
  const bytes=Buffer.from('[{"id":1,"unit_only":"synthetic-secret-marker"}]');
  const ref=await store.write({...scope,bytes});assert.deepEqual(await store.read(ref),bytes);
  const names=(await readdir(root)).filter(n=>n!=='audit.jsonl');assert.equal(names.length,1);assert.doesNotMatch(await readFile(join(root,names[0]),'utf8'),/synthetic-secret-marker/);
  assert.deepEqual(await store.listExpired(),[]);
  await assert.rejects(store.deleteExpired(ref),/NOT_EXPIRED/);
  await assert.rejects(store.read('artifact:quarantine:../../escape'),/REFERENCE/);
  await assert.rejects(store.write({...scope,dbNamespace:'other',bytes}),/SCOPE/);
  date=new Date('2026-10-09T00:00:00.000Z');await assert.rejects(store.read(ref),/EXPIRED/);
  assert.deepEqual(await store.listExpired(),[ref]);
  const receipt=await store.deleteExpired(ref);assert.equal(receipt.raw_payload_retained,false);assert.equal(receipt.promotion_eligible,false);
  assert.deepEqual(await readdir(root),['audit.jsonl']);
  const audit=await readFile(join(root,'audit.jsonl'),'utf8');assert.doesNotMatch(audit,/synthetic-secret-marker/);assert.ok(audit.includes('"deletion_verified":true'));
 }finally{await rm(parent,{recursive:true,force:true});}
});
test('quarantine requires a private root outside the repository',async()=>{
 const parent=await mkdtemp(join(tmpdir(),'quarantine-store-boundary-'));
 try{
  const root=join(parent,'private'),forbidden=join(parent,'repository');await mkdir(root,{mode:0o700});await mkdir(forbidden);
  await assert.rejects(createProviderQuarantineFileStore({rootDir:forbidden,forbiddenRoot:forbidden,key:randomBytes(32)}),/ROOT_OVERLAP/);
  await chmod(root,0o755);await assert.rejects(createProviderQuarantineFileStore({rootDir:root,forbiddenRoot:forbidden,key:randomBytes(32)}),/PRIVATE_ROOT_MODE/);
 }finally{await rm(parent,{recursive:true,force:true});}
});
