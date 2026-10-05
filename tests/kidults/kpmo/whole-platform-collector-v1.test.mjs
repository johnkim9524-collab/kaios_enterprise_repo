import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {collectWholePlatform} from '../../../scripts/kidults/kpmo/collect-whole-platform-operating-proof-v1.mjs';
const contract=JSON.parse(fs.readFileSync('coordination/kidults/kpmo/whole-platform-operating-proof-v1.json'));
const scorecard=JSON.parse(fs.readFileSync(contract.value_chain_source));
const repository=contract.repository,source='a'.repeat(40),base='b'.repeat(40);
function fixture({active=false,foreign=false,duplicate=false,mainDrift=false}={}){
  let branches=0,downloads=0,reads=[];
  const latest={id:10,run_attempt:1,repository:{full_name:foreign?'foreign/repo':repository},
    path:'.github/workflows/kpmo-continuous-assurance-sentinel-health-v1.yml',head_sha:source,head_branch:'main',event:'repository_dispatch',
    status:active?'in_progress':'completed',conclusion:active?null:'success',created_at:'2026-10-04T12:00:00Z'};
  const artifact={id:100,name:`kpmo-continuous-assurance-sentinel-health-v1-${source}-10-1`,expired:false,
    workflow_run:{id:10,head_sha:source},expires_at:'2026-11-01T00:00:00Z',digest:'sha256:'+'0'.repeat(64)};
  const read=async url=>{
    reads.push(url);assert.ok(url.startsWith(`https://api.github.com/repos/${repository}/`));
    if(url.endsWith('/branches/main'))return {commit:{sha:mainDrift&&++branches>1?'c'.repeat(40):source}};
    if(url.endsWith(`/git/commits/${source}`))return {sha:source,tree:{sha:'d'.repeat(40)},parents:[{sha:base},{sha:'e'.repeat(40)}]};
    if(url.includes('/pulls?'))return [];
    if(url.includes('/artifacts?'))return {total_count:duplicate?2:1,artifacts:duplicate?[artifact,artifact]:[artifact]};
    throw Error('unexpected GET');
  };
  return {run:()=>collectWholePlatform({sourceSha:source,contract,scorecard,observedAt:'2026-10-04T12:30:00Z',read,
    listRuns:async(_,s)=>s.id==='SENTINEL'?[latest]:[],download:async()=>{downloads++;return Buffer.from('invalid archive');}}),
    counts:()=>({downloads,reads})};
}
test('latest in-flight generation holds instead of choosing an older green or causing a dispatch',async()=>{
  const f=fixture({active:true}),r=await f.run();assert.equal(r.state,'VERIFIED_INCOMPLETE');
  assert.equal(r.operating_checks.find(c=>c.id==='CORE_FOUR_CONTENT').state,'VERIFIED_HOLD');
  assert.equal(f.counts().downloads,0);assert.equal(r.whole_platform_runtime_proven,false);
  assert.ok(r.operating_checks.every(c=>c.retry_authorized===false));assert.equal(r.value_chain.length,14);
});
test('foreign producer metadata and duplicate artifacts never become partial PASS',async()=>{
  for(const options of [{foreign:true},{duplicate:true}]){
    const f=fixture(options),r=await f.run();assert.equal(r.state,'VERIFIED_FAIL');assert.equal(f.counts().downloads,0);
  }
});
test('artifact bytes must match the protected GitHub digest',async()=>{
  const f=fixture(),r=await f.run();assert.equal(r.state,'VERIFIED_FAIL');
  assert.match(r.operating_checks.find(c=>c.id==='CORE_FOUR_CONTENT').reason,/ARCHIVE_DIGEST/);assert.equal(f.counts().downloads,1);
});
test('main drift during collection prevents publication of an older certificate',async()=>{
  await assert.rejects(fixture({active:true,mainDrift:true}).run(),/MAIN_CHANGED/);
});
test('default observer queries bounded exact-SHA time windows and never dispatches',async()=>{
  const queries=[];
  const read=async url=>{
    if(url.endsWith('/branches/main'))return {commit:{sha:source}};
    if(url.endsWith(`/git/commits/${source}`))return {sha:source,tree:{sha:'d'.repeat(40)},parents:[{sha:base},{sha:'e'.repeat(40)}],committer:{date:'2026-10-04T11:28:35Z'}};
    if(url.includes('/pulls?'))return [];
    if(url.includes('/runs?')){const query=new URL(url).searchParams;queries.push(query);return {total_count:0,workflow_runs:[]};}
    throw Error('unexpected GET');
  };
  const result=await collectWholePlatform({sourceSha:source,contract,scorecard,read,observedAt:'2026-10-04T12:30:00Z'});
  assert.equal(result.state,'VERIFIED_INCOMPLETE');assert.equal(queries.length,6);
  for(const q of queries){assert.equal(q.get('branch'),'main');assert.equal(q.get('per_page'),'100');assert.equal(q.get('page'),'1');
    const [after,before]=q.get('created').split('..');const duration=Date.parse(before)-Date.parse(after);
    assert.equal(duration,q.get('head_sha')===source?contract.maximum_evidence_age_seconds*1000:7200000);
    assert.ok([source,base].includes(q.get('head_sha')));
  }
});
