import test from 'node:test';
import assert from 'node:assert/strict';
import {createBoundedGitSourceReader,gitObjectId} from '../../../scripts/kidults/kpmo/lib/bounded-git-source-reader-v1.mjs';

function fixture(mode='100644',content='same immutable bytes\n') {
  const objects=new Map();
  const put=(type,bytes)=>{const body=Buffer.from(bytes),sha=gitObjectId(type,body);objects.set(sha,{type,bytes:body});return sha;};
  const blob=put('blob',content);
  const tree=put('tree',Buffer.concat([Buffer.from(`${mode} file.mjs\0`),Buffer.from(blob,'hex')]));
  const source=put('commit',`tree ${tree}\nauthor fixture <fixture@example.invalid> 0 +0000\ncommitter fixture <fixture@example.invalid> 0 +0000\n\nfixture\n`);
  let reads=0;
  const readObject=async sha=>{reads++;if(!objects.has(sha))throw Error('missing');return objects.get(sha);};
  return {objects,blob,tree,source,readObject,reads:()=>reads,reader:options=>createBoundedGitSourceReader({sourceShas:[source],readObject,...options})};
}
test('exact commit/tree/blob binding and immutable cache preserve the same bytes',async()=>{
  const f=fixture(),r=f.reader();assert.equal((await r.commit(f.source)).tree.sha,f.tree);
  const first=await r.file(f.source,'file.mjs');assert.equal(first.content,'same immutable bytes\n');
  f.objects.get(f.blob).bytes.fill(0);assert.deepEqual(await r.file(f.source,'file.mjs'),first);
  assert.equal(f.reads(),3);assert.equal(r.receipt().authorization_created,false);assert.equal(r.receipt().transport_verified,false);
});
test('concurrent requests share one verified object read',async()=>{
  const f=fixture(),r=f.reader();await Promise.all([r.file(f.source,'file.mjs'),r.file(f.source,'file.mjs')]);assert.equal(f.reads(),3);
});
test('unregistered source and revision expressions abort the whole reader',async()=>{
  const f=fixture(),r=f.reader();await assert.rejects(r.file(f.source+'^','file.mjs'),/SOURCE_NOT_REGISTERED/);
  await assert.rejects(r.file(f.source,'file.mjs'),/SOURCE_NOT_REGISTERED/);assert.equal(f.reads(),0);
});
test('source substitution fails exact object hash and poisons later reads',async()=>{
  const f=fixture();f.objects.get(f.blob).bytes[0]^=1;const r=f.reader();await assert.rejects(r.file(f.source,'file.mjs'),/DIGEST_MISMATCH/);
  await assert.rejects(r.commit(f.source),/DIGEST_MISMATCH/);assert.equal(r.receipt().state,'GLOBAL_ABORT');
});
test('missing source bytes fail closed',async()=>{
  const f=fixture();f.objects.delete(f.blob);await assert.rejects(f.reader().file(f.source,'file.mjs'),/OBJECT_MISSING/);
});
test('object type substitution fails before parsing',async()=>{
  const f=fixture();f.objects.get(f.tree).type='blob';await assert.rejects(f.reader().file(f.source,'file.mjs'),/OBJECT_TYPE_INVALID/);
});
for(const mode of ['120000','160000'])test(`special Git mode ${mode} cannot become regular source`,async()=>{
  const f=fixture(mode);await assert.rejects(f.reader().file(f.source,'file.mjs'),/SPECIAL_FILE_FORBIDDEN/);
});
for(const path of ['../file.mjs','/file.mjs','a//file.mjs','file.mjs\0','a\\file.mjs'])test(`unsafe path ${JSON.stringify(path)} is rejected`,async()=>{
  const f=fixture();await assert.rejects(f.reader().file(f.source,path),/PATH_INVALID/);assert.equal(f.reads(),0);
});
test('object budget cannot be reset by another read or a cache hit',async()=>{
  const f=fixture(),r=f.reader({limits:{objects:2}});await assert.rejects(r.file(f.source,'file.mjs'),/OBJECT_BUDGET_EXHAUSTED/);
  await assert.rejects(r.commit(f.source),/OBJECT_BUDGET_EXHAUSTED/);
});
test('byte budget aborts without admitting a file',async()=>{
  const f=fixture();await assert.rejects(f.reader({limits:{bytes:10}}).file(f.source,'file.mjs'),/BYTE_BUDGET_EXHAUSTED/);
});
test('time budget is checked after the producer returns',async()=>{
  const f=fixture();let now=0;const r=f.reader({limits:{milliseconds:1},clock:()=>now,readObject:async sha=>{now=2;return f.objects.get(sha);}});
  await assert.rejects(r.commit(f.source),/TIME_EXHAUSTED/);
});
test('limit expansion, extra fields, duplicate sources, and arbitrary refs are denied',()=>{
  const f=fixture();for(const options of [{limits:{bytes:128*1024*1024+1}},{limits:{retry:1}},
    {sourceShas:[f.source,f.source]},{sourceShas:['main']}])assert.throws(()=>f.reader(options),/CONFIGURATION_INVALID|LIMIT_INVALID/);
});
test('missing path aborts and cannot be treated as partial scan success',async()=>{
  const f=fixture(),r=f.reader();await assert.rejects(r.file(f.source,'absent.mjs'),/FILE_MISSING/);assert.equal(r.receipt().state,'GLOBAL_ABORT');
});

test('invalid or reversing clock cannot bypass timeout checks',async()=>{
  const f=fixture();assert.throws(()=>f.reader({clock:()=>NaN}),/CONFIGURATION_INVALID/);
  let now=2;const r=f.reader({clock:()=>now});now=1;await assert.rejects(r.commit(f.source),/TIME_EXHAUSTED/);
});

test('UTF-8 BOM is preserved as the exact accepted bytes',async()=>{const f=fixture('100644','\ufeffimmutable\n');const value=await f.reader().file(f.source,'file.mjs');assert.equal(value.content,'\ufeffimmutable\n');assert.equal(gitObjectId('blob',Buffer.from(value.content)),f.blob);});
