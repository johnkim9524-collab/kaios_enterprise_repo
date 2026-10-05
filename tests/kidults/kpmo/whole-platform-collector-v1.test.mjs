import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {canonicalJson,sha256} from '../../../scripts/kidults/kpmo/lib/canonical-json-v1.mjs';
import {digest} from '../../../scripts/kidults/kpmo/validate-sentinel-producer-content-v1.mjs';
import {SPECS} from '../../../scripts/kidults/kpmo/resolve-continuous-assurance-sentinel-health-v1.mjs';
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

function completeChainFixture({missingGate=false,manual=false}={}){
  const native=new Map(),artifacts=new Map(),archives=new Map(),healths=[],gates=[];
  const seal=b=>({...b,receipt_digest:sha256(canonicalJson(b))});
  const run=(id,path,event,time)=>({id,run_attempt:1,path,event,created_at:time,head_sha:source,head_branch:'main',repository:{full_name:repository},status:'completed',conclusion:'success'});
  const attach=(r,name,basename,body)=>{
    const bytes=execFileSync('python3',['-c','import io,json,sys,zipfile; b=io.BytesIO(); z=zipfile.ZipFile(b,"w"); z.writestr(sys.argv[1],sys.stdin.read()); z.close(); sys.stdout.buffer.write(b.getvalue())',basename],{input:JSON.stringify(body)});
    const a={id:r.id+10000,name,digest:digest(bytes),expired:false,expires_at:'2026-11-01T00:00:00Z',workflow_run:{id:r.id,head_sha:source}};
    artifacts.set(r.id,[a]);archives.set(a.id,bytes);native.set(r.id,r);return a;
  };
  for(let generation=0;generation<2;generation++){
    const observer=run(10+generation*10,'.github/workflows/kpmo-continuous-assurance-sentinel-health-v1.yml','repository_dispatch',generation?'2026-10-04T12:20:00Z':'2026-10-04T12:00:00Z');
    const producers=SPECS.map((spec,i)=>{
      const r=run(200+generation*100+i,spec.path,spec.id==='SHADOW'?'push':spec.id==='RESERVE'?'repository_dispatch':'workflow_run',generation?'2026-10-04T11:55:00Z':'2026-10-04T11:00:00Z');
      const a=attach(r,'producer','producer.json',{});
      return {id:spec.id,state:'VERIFIED_PASS',artifact_content_validated:true,artifact_transport_verified:true,selected_run_id:r.id,selected_run_attempt:1,selected_event:r.event,selected_created_at:r.created_at,artifact_id:a.id,artifact_digest:a.digest};
    });
    const health=seal({receipt_id:'kpmo-continuous-assurance-sentinel-health-v1',source_sha:source,repository,observer_run_id:observer.id,observer_run_attempt:1,state:'VERIFIED_PASS',semantic_content_verified:true,coverage_scope:'CORE_FOUR_ONLY_NOT_WHOLE_PLATFORM',producers,production:'HOLD',public:'HOLD',g5:'HOLD',promotion_eligible:false});
    attach(observer,`kpmo-continuous-assurance-sentinel-health-v1-${source}-${observer.id}-1`,'kpmo-continuous-assurance-sentinel-health-v1.json',health);healths.push(observer);
    const assurance=run(400+generation*100,'.github/workflows/kidults-platform-continuous-assurance-v1.yml',manual?'workflow_dispatch':'workflow_run',observer.created_at);
    const audit=seal({source:{sha:source,match:true},states:{internal_control_state:'VERIFIED_PASS'},execution:{workflow_run_id:String(assurance.id),workflow_run_attempt:'1',upstream:{run_id:String(observer.id),run_attempt:'1',workflow_path:observer.path,repository,conclusion:'success'}}});
    attach(assurance,`kidults-continuous-assurance-${source}-${assurance.id}-1`,'audit-receipt.json',audit);
    const gateRun=run(assurance.id+1,'.github/workflows/kpmo-continuous-assurance-success-authority-gate-v1.yml','workflow_run',observer.created_at);
    const gate=seal({receipt_id:'kpmo-continuous-assurance-success-authority-gate-v1',state:'VERIFIED_PASS',repository,current_protected_main_sha:source,upstream_assurance:{run_id:assurance.id,run_attempt:1,head_sha:source,event:assurance.event,conclusion:'success'},producer_health_run_id:observer.id,producer_health_run_attempt:1,producer_health_receipt_digest:health.receipt_digest,producer_health_state:'VERIFIED_PASS',producer_health_conclusion:'success',coverage_scope:health.coverage_scope,whole_platform_authority:false,promotion_eligible:false,empirical_authority:false,provider_authority:false,database_authority:false,empirical_delta:0,production:'HOLD',public:'HOLD',g5:'HOLD'});
    attach(gateRun,`kpmo-continuous-assurance-success-authority-gate-${source}-${assurance.id}-1`,'kpmo-continuous-assurance-success-authority-gate-v1.json',gate);
    if(!missingGate||generation===1)gates.push(gateRun);
  }
  const read=async url=>{
    const route=new URL(url).pathname;
    if(route.endsWith('/branches/main'))return {commit:{sha:source}};
    if(route.endsWith(`/git/commits/${source}`))return {sha:source,tree:{sha:'d'.repeat(40)},parents:[{sha:base},{sha:'e'.repeat(40)}]};
    if(route.endsWith('/pulls'))return [];
    const runMatch=route.match(/\/actions\/runs\/(\d+)(\/artifacts)?$/);
    if(runMatch){const id=Number(runMatch[1]);return runMatch[2]?{total_count:(artifacts.get(id)||[]).length,artifacts:artifacts.get(id)||[]}:native.get(id);}
    const artifactMatch=route.match(/\/actions\/artifacts\/(\d+)$/);
    if(artifactMatch)return [...artifacts.values()].flat().find(a=>a.id===Number(artifactMatch[1]));
    throw new Error(`unexpected GET ${route}`);
  };
  return collectWholePlatform({sourceSha:source,contract,scorecard,observedAt:'2026-10-04T12:30:00Z',read,
    listRuns:async(_,s)=>s.id==='SENTINEL'?healths:s.id==='SUCCESS_GATE'?gates:[],download:async(_,a)=>archives.get(a.id)});
}
test('overlapping genuine generations retain older evidence and require both downstream terminals',async()=>{
  const r=await completeChainFixture();
  for(const id of ['CORE_FOUR_CONTENT','DISTINCT_NATURAL_GENERATIONS','NATURAL_CHAIN_TERMINALS'])assert.equal(r.operating_checks.find(c=>c.id===id).state,'VERIFIED_PASS',JSON.stringify(r.operating_checks));
  assert.equal(r.natural_chain_terminals.length,2);assert.equal(r.state,'VERIFIED_INCOMPLETE');assert.equal(r.whole_platform_runtime_proven,false);
});
test('missing Gate or manual Assurance cannot complete natural terminal proof',async()=>{
  for(const options of [{missingGate:true},{manual:true}]){
    const r=await completeChainFixture(options);
    assert.notEqual(r.operating_checks.find(c=>c.id==='NATURAL_CHAIN_TERMINALS').state,'VERIFIED_PASS');
    assert.equal(r.operating_checks.find(c=>c.id==='CORE_FOUR_CONTENT').state,'VERIFIED_PASS');
  }
});
