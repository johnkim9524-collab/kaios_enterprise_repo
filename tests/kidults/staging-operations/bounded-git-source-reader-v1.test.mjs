import test from 'node:test';
import assert from 'node:assert/strict';
import {assertBoundedGitSourceReader,createBoundedGitSourceReader,gitObjectId} from '../../../scripts/kidults/kpmo/lib/bounded-git-source-reader-v1.mjs';

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


test('only branded verified readers can enter the adapter',()=>{
  const f=fixture(),r=f.reader();assert.equal(assertBoundedGitSourceReader(r),r);
  for(const fake of [null,{},Object.assign({},r),Object.create(r)])assert.throws(()=>assertBoundedGitSourceReader(fake),/READER_UNVERIFIED/);
});
test('verified absence is distinct from missing object and does not poison valid reads',async()=>{
  const f=fixture(),r=f.reader();assert.equal(await r.fileOrNull(f.source,'absent.mjs'),null);
  assert.equal((await r.file(f.source,'file.mjs')).sha,f.blob);assert.equal(r.receipt().state,'SOURCE_READER_OPEN');
  const missing=fixture();missing.objects.delete(missing.tree);const broken=missing.reader();
  await assert.rejects(broken.fileOrNull(missing.source,'absent.mjs'),/OBJECT_MISSING/);
  await assert.rejects(broken.fileOrNull(missing.source,'file.mjs'),/OBJECT_MISSING/);
});
test('absence cannot hide an unregistered source or reset a poisoned reader',async()=>{
  const f=fixture(),r=f.reader();await assert.rejects(r.fileOrNull('a'.repeat(40),'absent.mjs'),/SOURCE_NOT_REGISTERED/);
  await assert.rejects(r.fileOrNull(f.source,'absent.mjs'),/SOURCE_NOT_REGISTERED/);
});
test('invalid UTF-8 cannot silently replace source bytes',async()=>{
  const f=fixture('100644',Buffer.from([0xff]));await assert.rejects(f.reader().file(f.source,'file.mjs'),/TEXT_INVALID/);
});

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {discover,recordDispatcherScan} from '../../../scripts/kidults/kpmo/run-autonomous-dispatcher-v1.mjs';
const dispatchPolicy=JSON.parse(fs.readFileSync('coordination/kidults/governance/autonomous-internal-landing-policy-v1.json'));
function scanFixture() {
  const f=fixture(),mainBody=Buffer.from(`tree ${f.tree}\nauthor main <main@example.invalid> 0 +0000\ncommitter main <main@example.invalid> 0 +0000\n\nmain\n`);
  const main=gitObjectId('commit',mainBody);f.objects.set(main,{type:'commit',bytes:mainBody});
  const repo='owner/repo',pr={number:42,base:{ref:'main',sha:'a'.repeat(40),repo:{full_name:repo}},head:{sha:f.source,repo:{full_name:repo}}};
  const trace=[];
  const fetchImpl=async url=>{
    const p=new URL(url).pathname;trace.push(p);let body;
    if(p.endsWith('/branches/main'))body={commit:{sha:main}};
    else if(p.endsWith('/rulesets'))body=[{id:1,name:'KAIOS Solo Owner Preflight',enforcement:'active'}];
    else if(p.endsWith('/rulesets/1'))body={bypass_actors:[],rules:[{type:'required_status_checks',parameters:{strict_required_status_checks_policy:true,required_status_checks:[{context:'unit',integration_id:7}]}}]};
    else if(p.endsWith('/pulls'))body=[pr,{...pr,number:43}];
    else if(p.endsWith('/files'))body=[{filename:'file.mjs',status:'modified',patch:'@@ -1 +1 @@\n-old\n+same immutable bytes'}];
    else if(p.includes('/git/commits/'))body={sha:f.source,tree:{sha:f.tree}};
    else if(p.includes('/contents/'))body={type:'file',encoding:'base64',sha:f.blob,content:f.objects.get(f.blob).bytes.toString('base64')};
    else throw Error('unexpected request');
    return {ok:true,status:200,headers:{get:()=>null},json:async()=>body};
  };
  return {f,main,trace,args:{repository:repo,token:'offline',policy:dispatchPolicy,generationSeed:'1',fetchImpl},reader:()=>f.reader({sourceShas:[main,f.source]})};
}
test('full discovery produces identical stale redundancy binding from verified objects and REST',async()=>{
  const a=scanFixture(),b=scanFixture(),reader=b.reader();await reader.file(b.f.source,'file.mjs');await reader.file(b.main,'file.mjs');reader.seal();
  const expected=await discover(a.args),actual=await discover({...b.args,sourceReader:reader});
  assert.deepEqual(actual,expected);assert.equal(actual.length,2);assert.ok(actual.every(x=>x.state==='STALE_REDUNDANT'));
  assert.ok(!b.trace.some(x=>x.includes('/contents/')||x.includes('/git/commits/')));
});
test('source failure inside discovery invalidates prior results and stops later candidates',async()=>{
  const s=scanFixture();s.f.objects.delete(s.f.tree);const reader=s.reader();await reader.commit(s.f.source);reader.seal();const directory=fs.mkdtempSync(path.join(os.tmpdir(),'source-abort-'));
  try {
    fs.writeFileSync(path.join(directory,'results.json'),'[{"state":"ELIGIBLE"}]');
    await assert.rejects(recordDispatcherScan({outputDirectory:directory,scan:()=>discover({...s.args,sourceReader:reader})}),/SEALED_OBJECT_MISSING/);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(directory,'results.json'))),[]);
    assert.ok(!s.trace.some(x=>x.includes('/pulls/43/')));
    assert.equal(JSON.parse(fs.readFileSync(path.join(directory,'failure.json'))).fanout_authorized,false);
  }finally{fs.rmSync(directory,{recursive:true,force:true});}
});


test('one-way seal freezes completed read costs and allows only verified cached bytes',async()=>{
  const f=fixture();let now=0;const r=f.reader({clock:()=>now});const expected=await r.file(f.source,'file.mjs');r.seal();const before=r.receipt();now=999999;
  assert.deepEqual(await r.file(f.source,'file.mjs'),expected);assert.equal(await r.fileOrNull(f.source,'absent.mjs'),null);r.seal();
  assert.deepEqual(r.receipt(),before);assert.equal(f.reads(),3);assert.equal(before.sealed,true);
});
test('sealed source cannot fetch missing objects or reopen after abort',async()=>{
  const f=fixture(),r=f.reader();await r.commit(f.source);r.seal();
  await assert.rejects(r.file(f.source,'file.mjs'),/SEALED_OBJECT_MISSING/);assert.equal(f.reads(),1);
  assert.throws(()=>r.seal(),/SEALED_OBJECT_MISSING/);await assert.rejects(r.commit(f.source),/SEALED_OBJECT_MISSING/);
});
test('sealing with unfinished verification aborts globally',async()=>{
  const f=fixture();let release;const wait=new Promise(resolve=>{release=resolve;});
  const r=f.reader({readObject:async sha=>{await wait;return f.objects.get(sha);}});const pending=r.commit(f.source);
  assert.throws(()=>r.seal(),/SEAL_PENDING_READS/);release();await assert.rejects(pending,/SEAL_PENDING_READS/);assert.equal(r.receipt().state,'GLOBAL_ABORT');
});

test('discovery refuses a reader before acquisition has been sealed',async()=>{
  const s=scanFixture();await assert.rejects(discover({...s.args,sourceReader:s.reader()}),/SOURCE_SNAPSHOT_NOT_SEALED/);assert.equal(s.trace.length,0);
});

test('discovery rejects a previously aborted sealed reader even before path-only classification',async()=>{
  const s=scanFixture(),reader=s.reader();await reader.commit(s.f.source);reader.seal();
  await assert.rejects(reader.file(s.f.source,'file.mjs'),/SEALED_OBJECT_MISSING/);
  await assert.rejects(discover({...s.args,sourceReader:reader}),/SEALED_OBJECT_MISSING/);assert.equal(s.trace.length,0);
});
