import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {deflateRawSync} from 'node:zlib';
import {SPECS,CANONICAL_GENERATION_SPEC,CANONICAL_CONVERGENCE_MAX_WAIT_MS,CANONICAL_CONVERGENCE_POLL_MS,classifyCanonicalConvergence,evaluateProducer,evaluateHealth,selectProducerGeneration,validateCanonicalGenerationLineage,waitForCanonicalConvergence} from '../../../scripts/kidults/kpmo/resolve-continuous-assurance-sentinel-health-v1.mjs';
import {selectLatestNaturalSentinelRun} from '../../../scripts/kidults/kpmo/select-latest-natural-sentinel-run-v1.mjs';
import {REPOSITORY,digest,stable} from '../../../scripts/kidults/kpmo/validate-sentinel-producer-content-v1.mjs';

// Synthetic API metadata. The payload is a native tracked control snapshot;
// neither unit tests nor the offline CLI can issue GitHub/provider requests.
const sourceSha='a'.repeat(40), observed='2026-09-06T00:00:00Z', spec=SPECS[0];
function zipMember(name,raw){
 const n=Buffer.from(name),v=Buffer.from(raw),c=deflateRawSync(v);let crc=0xffffffff;
 for(const byte of v){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}crc=(crc^0xffffffff)>>>0;
 const l=Buffer.alloc(30),h=Buffer.alloc(46),e=Buffer.alloc(22);
 l.writeUInt32LE(0x04034b50);l.writeUInt16LE(20,4);l.writeUInt16LE(8,8);l.writeUInt32LE(crc,14);l.writeUInt32LE(c.length,18);l.writeUInt32LE(v.length,22);l.writeUInt16LE(n.length,26);
 h.writeUInt32LE(0x02014b50);h.writeUInt16LE(20,4);h.writeUInt16LE(20,6);h.writeUInt16LE(8,10);h.writeUInt32LE(crc,16);h.writeUInt32LE(c.length,20);h.writeUInt32LE(v.length,24);h.writeUInt16LE(n.length,28);
 e.writeUInt32LE(0x06054b50);e.writeUInt16LE(1,8);e.writeUInt16LE(1,10);e.writeUInt32LE(h.length+n.length,12);e.writeUInt32LE(l.length+n.length+c.length,16);
 return Buffer.concat([l,n,c,h,n,e]);
}
const bytes=zipMember('asi-shadow-operating-evidence-run-1.json',fs.readFileSync('artifacts/agci-os/asi-shadow-operating-evidence-v1.json'));
function run(id=10,extra={}){return {id,run_attempt:1,repository:{full_name:REPOSITORY},path:spec.path,head_branch:'main',head_sha:sourceSha,event:'push',status:'completed',conclusion:'success',created_at:'2026-09-05T10:00:00Z',run_started_at:'2026-09-05T10:00:00Z',...extra};}
const good=run();
const artifact={id:110,name:spec.artifacts[0],expired:false,digest:digest(bytes),size_in_bytes:bytes.length,created_at:'2026-09-05T10:01:00Z',expires_at:'2026-12-01T00:00:00Z',workflow_run:{id:10,head_sha:sourceSha}};
function evaluate(runs){return evaluateProducer(spec,runs,{10:[artifact]},sourceSha,observed,{110:bytes});}

function sentinelRun(id,{event='repository_dispatch',status='completed',conclusion='success',createdAt='2026-09-05T10:00:00Z',path='.github/workflows/kpmo-continuous-assurance-sentinel-health-v1.yml'}={}){
 return {id,run_attempt:1,repository:{full_name:REPOSITORY},path,head_branch:'main',head_sha:sourceSha,event,status,conclusion,created_at:createdAt};
}
test('Assurance selects its exact causal Sentinel despite a newer successful or pending generation',()=>{
 const parent=sentinelRun(38032507316);
 const causalParent={run_id:String(parent.id),run_attempt:'1',repository:REPOSITORY,head_branch:'main',workflow_path:parent.path,
  workflow_name:'KPMO Continuous Assurance Exact-SHA Producer Health Sentinel V1',workflow_event:parent.event,conclusion:'success'};
 const options={sourceSha,repository:REPOSITORY,observedAt:'2026-09-05T12:00:00Z',causalParent};
 for(const newer of [sentinelRun(38033069829,{createdAt:'2026-09-05T11:00:00Z'}),
  sentinelRun(38033069829,{status:'in_progress',conclusion:null,createdAt:'2026-09-05T11:00:00Z'})]){
  const result=selectLatestNaturalSentinelRun([parent,newer],options);
  assert.equal(result.state,'VERIFIED_PASS');assert.equal(result.latest.id,parent.id);
 }
 assert.throws(()=>selectLatestNaturalSentinelRun([],options),/CAUSAL_PARENT_CARDINALITY/);
 assert.throws(()=>selectLatestNaturalSentinelRun([parent,parent],options),/CAUSAL_PARENT_CARDINALITY/);
 for(const change of [{run_attempt:2},{repository:'other/repo'},{workflow_event:'push'},{workflow_path:'other.yml'},
  {head_branch:'dev'},{conclusion:'failure'}])assert.throws(()=>selectLatestNaturalSentinelRun([parent],{...options,causalParent:{...causalParent,...change}}),/CAUSAL_PARENT/);
 for(const change of [{head_sha:'b'.repeat(40)},{event:'schedule'},{status:'in_progress',conclusion:null}])
  assert.throws(()=>selectLatestNaturalSentinelRun([{...parent,...change}],options),/CAUSAL_PARENT_DRIFT/);
});
test('terminal sentinel selector refuses to fall back from a newer natural failure to an older PASS',()=>{
 const result=selectLatestNaturalSentinelRun([
  sentinelRun(36478860735,{createdAt:'2026-09-05T09:00:00Z'}),
  sentinelRun(36492105402,{conclusion:'failure',createdAt:'2026-09-05T11:00:00Z'})
 ],{sourceSha,repository:REPOSITORY,observedAt:'2026-09-05T12:00:00Z'});
 assert.equal(result.state,'VERIFIED_FAIL');assert.equal(result.latest.id,36492105402);
});
test('terminal sentinel selector excludes workflow_dispatch from natural freshness',()=>{
 const result=selectLatestNaturalSentinelRun([
  sentinelRun(30),sentinelRun(31,{event:'workflow_dispatch',conclusion:'failure',createdAt:'2026-09-05T11:00:00Z'})
 ],{sourceSha,repository:REPOSITORY,observedAt:'2026-09-05T12:00:00Z'});
 assert.equal(result.state,'VERIFIED_PASS');assert.equal(result.latest.id,30);
});
test('terminal sentinel selector treats the successful Reserve completion edge as natural',()=>{
 const result=selectLatestNaturalSentinelRun([
  sentinelRun(32,{event:'workflow_run',createdAt:'2026-09-05T11:00:00Z'})
 ],{sourceSha,repository:REPOSITORY,observedAt:'2026-09-05T12:00:00Z'});
 assert.equal(result.state,'VERIFIED_PASS');assert.equal(result.latest.id,32);
});
test('terminal sentinel selector rejects an exact-SHA run from a substituted workflow path',()=>{
 assert.throws(()=>selectLatestNaturalSentinelRun([sentinelRun(50,{path:'.github/workflows/other.yml'})],{sourceSha,repository:REPOSITORY,observedAt:'2026-09-05T12:00:00Z'}),/WORKFLOW_PATH_INVALID/);
});
test('terminal sentinel selector keeps a newer in-progress natural run on HOLD',()=>{
 const result=selectLatestNaturalSentinelRun([
  sentinelRun(40),sentinelRun(41,{status:'in_progress',conclusion:null,createdAt:'2026-09-05T11:00:00Z'})
 ],{sourceSha,repository:REPOSITORY,observedAt:'2026-09-05T12:00:00Z'});
 assert.equal(result.state,'VERIFIED_HOLD');assert.equal(result.latest.id,41);
});
test('terminal sentinel selector ignores a newer administrative skip and retains the last authoritative PASS',()=>{
 const result=selectLatestNaturalSentinelRun([
  sentinelRun(42),sentinelRun(43,{conclusion:'skipped',createdAt:'2026-09-05T11:00:00Z'})
 ],{sourceSha,repository:REPOSITORY,observedAt:'2026-09-05T12:00:00Z'});
 assert.equal(result.state,'VERIFIED_PASS');assert.equal(result.latest.id,42);
 assert.equal(result.candidate_count,2);assert.equal(result.eligible_terminal_count,1);
});
test('terminal sentinel selector keeps a newer pending run ahead of an older authoritative PASS',()=>{
 const result=selectLatestNaturalSentinelRun([
  sentinelRun(44),sentinelRun(45,{status:'queued',conclusion:null,createdAt:'2026-09-05T11:00:00Z'}),
  sentinelRun(46,{conclusion:'neutral',createdAt:'2026-09-05T11:30:00Z'})
 ],{sourceSha,repository:REPOSITORY,observedAt:'2026-09-05T12:00:00Z'});
 assert.equal(result.state,'VERIFIED_HOLD');assert.equal(result.latest.id,45);
 assert.equal(result.candidate_count,3);assert.equal(result.eligible_terminal_count,1);
});
test('terminal sentinel selector reports the latest administrative observation when no authoritative terminal exists',()=>{
 const result=selectLatestNaturalSentinelRun([
  sentinelRun(47,{conclusion:'skipped'}),sentinelRun(48,{conclusion:'action_required',createdAt:'2026-09-05T11:00:00Z'})
 ],{sourceSha,repository:REPOSITORY,observedAt:'2026-09-05T12:00:00Z'});
 assert.equal(result.state,'VERIFIED_HOLD');assert.equal(result.latest,null);
 assert.equal(result.failure_class,'NATURAL_SENTINEL_SUCCESS_NOT_READY');
 assert.equal(result.latest_observed.id,48);assert.equal(result.eligible_terminal_count,0);
});
test('terminal sentinel selector CLI consumes the real GitHub workflow-runs envelope',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sentinel-selector-'));
 const input=path.join(dir,'runs.json');
 fs.writeFileSync(input,JSON.stringify({total_count:2,workflow_runs:[
  sentinelRun(60,{createdAt:'2026-09-05T09:00:00Z'}),
  sentinelRun(61,{conclusion:'failure',createdAt:'2026-09-05T11:00:00Z'})
 ]}));
 const child=spawnSync(process.execPath,['scripts/kidults/kpmo/select-latest-natural-sentinel-run-v1.mjs',input,sourceSha,'2026-09-05T12:00:00Z',REPOSITORY],{encoding:'utf8'});
 assert.equal(child.status,0,child.stderr);
 const result=JSON.parse(child.stdout);assert.equal(result.state,'VERIFIED_FAIL');assert.equal(result.latest.id,61);
});

test('generation index: one exact native SHADOW control payload remains reachable',()=>{
 const result=evaluate([good]);assert.equal(result.state,'VERIFIED_PASS');assert.equal(result.selected_run_id,10);assert.equal(result.artifact_content_validated,true);
});
test('generation index: Canonical V3 workflow_run supersedes the startup-race push failure',()=>{
 const canonical=SPECS.find(candidate=>candidate.id==='CANONICAL_TRUTH');
 assert.ok(canonical.events.includes('workflow_run'));
 const base={run_attempt:1,repository:{full_name:REPOSITORY},path:canonical.path,head_branch:'main',head_sha:sourceSha,status:'completed'};
 const pushFailure={...base,id:20,event:'push',conclusion:'failure',created_at:'2026-09-05T10:00:00Z'};
 const regenerated={...base,id:21,event:'workflow_run',conclusion:'success',created_at:'2026-09-05T10:01:00Z'};
 const selection=selectProducerGeneration([pushFailure,regenerated],canonical,sourceSha,observed);
 assert.equal(selection.latest.id,21);
});
test('generation index: Reserve recovery dispatch and completion edges supersede stale natural evidence',()=>{
 const reserve=SPECS.find(candidate=>candidate.id==='RESERVE');
 const base={run_attempt:1,repository:{full_name:REPOSITORY},path:reserve.path,head_branch:'main',head_sha:sourceSha,status:'completed'};
 const natural={...base,id:30,event:'repository_dispatch',conclusion:'success',created_at:'2026-09-05T10:00:00Z'};
 const manualFailure={...base,id:31,event:'workflow_dispatch',conclusion:'failure',created_at:'2026-09-05T10:01:00Z'};
 const workflowRunFailure={...base,id:32,event:'workflow_run',conclusion:'failure',created_at:'2026-09-05T10:02:00Z'};
 const selection=selectProducerGeneration([natural,manualFailure,workflowRunFailure],reserve,sourceSha,observed);
 assert.deepEqual(selection.candidates.map(candidate=>candidate.id),[30,31,32]);
 assert.equal(selection.latest.id,32);
});
test('generation index: core producers admit exact-SHA workflow_dispatch recovery roots',()=>{
 for(const producer of SPECS){
  const expected=['SHADOW','REQUIREMENT','RESERVE'].includes(producer.id);
  assert.equal(producer.events.includes('workflow_dispatch'),expected,producer.id);
 }
});
test('generation index: exact Requirement workflow_dispatch can supersede a non-authoritative workflow_run failure',()=>{
 const requirement=SPECS.find(candidate=>candidate.id==='REQUIREMENT');
 const base={run_attempt:1,repository:{full_name:REPOSITORY},path:requirement.path,head_branch:'main',head_sha:sourceSha,status:'completed'};
 const workflowRunFailure={...base,id:40,event:'workflow_run',conclusion:'failure',created_at:'2026-09-05T10:00:00Z'};
 const recoveryDispatch={...base,id:41,event:'workflow_dispatch',conclusion:'success',created_at:'2026-09-05T10:01:00Z'};
 const selection=selectProducerGeneration([workflowRunFailure,recoveryDispatch],requirement,sourceSha,observed);
 assert.deepEqual(selection.candidates.map(candidate=>candidate.id),[40,41]);
 assert.equal(selection.latest.id,41);
});
for(const [label,rows] of [
 ['duplicate newer pending attempt before old PASS',[run(10,{run_attempt:2,status:'in_progress',conclusion:null}),good]],
 ['duplicate newer failure attempt before old PASS',[run(10,{run_attempt:2,conclusion:'failure'}),good]],
 ['duplicate identical IDs',[good,structuredClone(good)]],
 ['invalid creation time hides RED',[run(5,{created_at:'not-a-date',conclusion:'failure'}),good]],
 ['unsafe numeric ID hides RED',[run(Number.MAX_SAFE_INTEGER+1,{conclusion:'failure'}),good]],
 ['string ID hides RED',[run('5',{conclusion:'failure'}),good]],
 ['missing attempt in older RED',[run(5,{run_attempt:undefined,conclusion:'failure'}),good]],
 ['wrong repository in older RED',[run(5,{repository:{full_name:'other/repo'},conclusion:'failure'}),good]],
 ['null row',[null,good]],
 ['unknown older terminal result',[run(5,{conclusion:'unknown'}),good]],
 ['nonterminal old row with SUCCESS',[run(5,{status:'queued',conclusion:'success'}),good]],
 ['malformed source SHA',[run(5,{head_sha:'bad',conclusion:'failure'}),good]],
])test(`generation index rejects ${label}`,()=>{
 assert.equal(evaluate(rows).state,'VERIFIED_FAIL');
});
test('generation index: distinct prior RED is superseded only by later verified content',()=>{
 const result=evaluate([run(5,{created_at:'2026-09-05T09:00:00Z',conclusion:'failure'}),good]);
 assert.equal(result.state,'VERIFIED_PASS');assert.deepEqual(result.superseded_red_run_ids,[5]);
});
test('generation index: valid unrelated SHA is not treated as an exact-source failure',()=>{
 assert.equal(evaluate([run(5,{head_sha:'b'.repeat(40),conclusion:'failure'}),good]).state,'VERIFIED_PASS');
});
test('generation index: genuinely newer pending run remains HOLD',()=>{
 assert.equal(evaluate([good,run(11,{created_at:'2026-09-05T11:00:00Z',status:'in_progress',conclusion:null})]).state,'VERIFIED_HOLD');
});
test('generation index: malformed metadata-only index fails before contents can be called verified',()=>{
 const r=evaluateProducer(spec,[run(10,{run_attempt:'1'})],{10:[artifact]},sourceSha,observed);
 assert.equal(r.state,'VERIFIED_FAIL');assert.notEqual(r.artifact_transport_verified,true);
});
for(const [label,mutation] of [
 ['missing observer run',x=>{delete x.observer_run_id;}],
 ['missing observer attempt',x=>{delete x.observer_run_attempt;}],
 ['string observer run',x=>{x.observer_run_id='900';}],
 ['unsafe observer attempt',x=>{x.observer_run_attempt=Number.MAX_SAFE_INTEGER+1;}],
])test(`terminal identity rejects ${label}`,()=>{
 const input={repository:REPOSITORY,source_sha:sourceSha,observed_at:observed,observer_run_id:900,observer_run_attempt:1,runs:{SHADOW:[good]}};
 mutation(input);assert.throws(()=>evaluateHealth(input),/SENTINEL_OBSERVER_IDENTITY_INVALID/);
});

function offlineCli(scenario){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kir-sentinel-offline-'));
 const out=path.join(dir,'receipt.json'),trace=path.join(dir,'trace.jsonl');
 const hook=`import fs from 'node:fs';import cp from 'node:child_process';import {syncBuiltinESMExports} from 'node:module';
const data=JSON.parse(fs.readFileSync(process.env.FIXTURE_INPUT,'utf8'));let mainReads=0,shadowPages=0;
const original=cp.execFileSync;cp.execFileSync=(f,a,o)=>f==='git'&&a.join(' ')==='rev-parse HEAD'?data.sha+'\\n':original(f,a,o);syncBuiltinESMExports();
globalThis.fetch=async(value,options={})=>{
 const u=new URL(value);fs.appendFileSync(process.env.TRACE,JSON.stringify({url:u.pathname,method:options.method})+'\\n');
 if(u.origin!=='https://api.github.com'||options.method!=='GET')throw Error('UNEXPECTED_NETWORK');
 if(u.pathname.endsWith('/branches/main')){mainReads++;return Response.json({commit:{sha:mainReads>1&&data.scenario==='main-drift'?'b'.repeat(40):data.sha}});}
 if(u.pathname.includes('/actions/workflows/')){
  if(!u.pathname.includes('kidults-asi-shadow-operating-evidence-v1.yml'))return Response.json({total_count:0,workflow_runs:[]});
  shadowPages++;
  if(['valid-paginated','duplicate-page','page-count-drift'].includes(data.scenario)){
    const page=Number(u.searchParams.get('page'));
    const all=[data.run,...Array.from({length:100},(_,i)=>({...data.run,id:i+1000,created_at:'2026-09-05T09:00:00Z',conclusion:'failure'}))];
    if(data.scenario==='duplicate-page')all[100]=all[1];
    const total=data.scenario==='page-count-drift'&&page===2?102:101;
    return Response.json({total_count:total,workflow_runs:all.slice((page-1)*100,page*100)});
  }
  if(data.scenario==='oversized-index')return Response.json({total_count:1001,workflow_runs:[data.run]});
  let rows=[data.run];
  if(data.scenario==='duplicate-index')rows=[{...data.run,run_attempt:2,status:'in_progress',conclusion:null},data.run];
  if(data.scenario==='metadata-drift'&&shadowPages>1)rows=[{...data.run,created_at:'2026-09-05T09:59:00Z'}];
  if(data.scenario==='attempt-drift'&&shadowPages>1)rows=[{...data.run,run_attempt:2}];
  if(data.scenario==='truncated-index')return Response.json({total_count:2,workflow_runs:rows});
  return Response.json({total_count:rows.length,workflow_runs:rows});
 }
 if(u.pathname.endsWith('/artifacts'))return Response.json({total_count:1,artifacts:[data.artifact]});
 if(u.pathname.endsWith('/zip'))return new Response(Buffer.from(data.bytes,'base64'));
 throw Error('UNEXPECTED_NETWORK_ROUTE');
};`;
 try{
  fs.writeFileSync(path.join(dir,'hook.mjs'),hook);fs.writeFileSync(path.join(dir,'input.json'),JSON.stringify({scenario,sha:sourceSha,run:good,artifact,bytes:bytes.toString('base64')}));
  const result=spawnSync(process.execPath,['--import',pathToFileURL(path.join(dir,'hook.mjs')).href,'scripts/kidults/kpmo/resolve-continuous-assurance-sentinel-health-v1.mjs','--output',out],{encoding:'utf8',timeout:15000,env:{PATH:process.env.PATH,LANG:'C.UTF-8',GITHUB_REPOSITORY:REPOSITORY,GITHUB_SHA:sourceSha,GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'schedule',GITHUB_RUN_ID:'900',GITHUB_RUN_ATTEMPT:'1',GH_TOKEN:'SYNTHETIC_NEVER_TRANSMITTED',FIXTURE_INPUT:path.join(dir,'input.json'),TRACE:trace}});
  assert.equal(result.error,undefined,result.error?.stack);
  assert.ok(fs.existsSync(out),JSON.stringify({status:result.status,signal:result.signal,stdout:result.stdout,stderr:result.stderr}));
  const receipt=JSON.parse(fs.readFileSync(out));const calls=fs.readFileSync(trace,'utf8').trim().split('\n').filter(Boolean).map(line=>JSON.parse(line));
  assert.ok(calls.length>0&&calls.every(call=>call.method==='GET'));
  assert.ok(!JSON.stringify(receipt).includes('SYNTHETIC_NEVER_TRANSMITTED'));
  for(const k of ['promotion_eligible','provider_authority','database_authority','whole_platform_authority'])assert.equal(receipt[k],false);
  assert.equal(receipt.production,'HOLD');assert.equal(receipt.public,'HOLD');assert.equal(receipt.g5,'HOLD');
  const unsigned={...receipt};delete unsigned.receipt_digest;
  assert.equal(receipt.receipt_digest,digest(stable(unsigned)));
  return {result,receipt,calls};
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
}
for(const scenario of ['duplicate-index','metadata-drift','truncated-index','duplicate-page','page-count-drift','oversized-index'])test(`offline actual CLI rejects ${scenario} with a durable RED terminal`,()=>{
 const {result,receipt}=offlineCli(scenario);assert.notEqual(result.status,0);assert.equal(receipt.state,'VERIFIED_FAIL');
});
for(const scenario of ['main-drift','attempt-drift'])test(`offline actual CLI preserves existing ${scenario} rejection`,()=>{
 const {receipt}=offlineCli(scenario);assert.equal(receipt.state,'VERIFIED_FAIL');
});
test('offline actual CLI with one verified producer and three missing remains HOLD',()=>{
 const {result,receipt}=offlineCli('valid');assert.notEqual(result.status,0);assert.equal(receipt.state,'VERIFIED_HOLD');
 assert.equal(receipt.producers.find(x=>x.id==='SHADOW').state,'VERIFIED_PASS');assert.equal(receipt.semantic_content_verified,false);
});

test('offline actual CLI consumes complete bounded pagination without losing prior RED history',()=>{
 const {receipt}=offlineCli('valid-paginated');assert.equal(receipt.state,'VERIFIED_HOLD');
 const producer=receipt.producers.find(x=>x.id==='SHADOW');assert.equal(producer.state,'VERIFIED_PASS');assert.equal(producer.superseded_red_run_ids.length,100);
});

const canonicalSpec=SPECS.find(candidate=>candidate.id==='CANONICAL_TRUTH');
function canonicalRun(id,{event='workflow_run',status='completed',conclusion='success',created='2026-09-05T10:01:00Z',sha=sourceSha,attempt=1}={}){
 return {id,run_attempt:attempt,repository:{full_name:REPOSITORY},path:canonicalSpec.path,head_branch:'main',head_sha:sha,event,status,conclusion,created_at:created,run_started_at:created};
}
function generationRun(id,{event='push',status='completed',conclusion='success',created='2026-09-05T10:00:00Z',sha=sourceSha,attempt=1}={}){
 return {id,run_attempt:attempt,repository:{full_name:REPOSITORY},path:CANONICAL_GENERATION_SPEC.path,head_branch:'main',head_sha:sha,event,status,conclusion,created_at:created,run_started_at:created};
}

test('canonical convergence: push Truth failure waits while exact generation is running',()=>{
 const truth=[canonicalRun(20,{event:'push',conclusion:'failure',created:'2026-09-05T10:00:00Z'})];
 const generation=[generationRun(30,{status:'in_progress',conclusion:null})];
 const x=classifyCanonicalConvergence(generation,truth,sourceSha,observed);
 assert.equal(x.state,'VERIFIED_HOLD');assert.equal(x.failure_class,'WAITING_FOR_CANONICAL_GENERATION');
});
test('canonical convergence: successful generation waits for its workflow_run consumer',()=>{
 const x=classifyCanonicalConvergence([generationRun(30)],[],sourceSha,observed);
 assert.equal(x.state,'VERIFIED_HOLD');assert.equal(x.failure_class,'WAITING_FOR_CANONICAL_CONSUMER');
});
test('canonical convergence: exact generation then workflow_run Truth becomes content-validation ready',()=>{
 const truth=[
  canonicalRun(20,{event:'push',conclusion:'failure',created:'2026-09-05T10:00:00Z'}),
  canonicalRun(31),
  canonicalRun(40,{event:'workflow_dispatch',created:'2026-09-05T10:02:00Z'}),
 ];
 const x=classifyCanonicalConvergence([generationRun(30)],truth,sourceSha,observed);
 assert.equal(x.state,'READY_FOR_CONTENT_VALIDATION');assert.equal(x.generation.id,30);assert.equal(x.consumer.id,31);
 assert.deepEqual(x.evaluation_truth_runs.map(run=>run.id),[31]);
});

test('canonical convergence: terminal generation failure is preserved as fail-closed',()=>{
 const x=classifyCanonicalConvergence([generationRun(30,{conclusion:'failure'})],[],sourceSha,observed);
 assert.equal(x.state,'VERIFIED_FAIL');assert.equal(x.failure_class,'CANONICAL_GENERATION_FAILURE');
});
test('canonical convergence: exact content lineage rejects wrong run, attempt, or SHA binding',()=>{
 const gen=generationRun(30);
 const good=`kpmo-canonical-v3-${sourceSha.slice(0,12)}-30-1`;
 assert.equal(validateCanonicalGenerationLineage(good,gen,sourceSha),true);
 for(const bad of [
  `kpmo-canonical-v3-${sourceSha.slice(0,12)}-29-1`,
  `kpmo-canonical-v3-${sourceSha.slice(0,12)}-30-2`,
  `kpmo-canonical-v3-${'b'.repeat(12)}-30-1`,
 ])assert.throws(()=>validateCanonicalGenerationLineage(bad,gen,sourceSha),/CANONICAL_GENERATION_LINEAGE_MISMATCH/);
});
test('canonical convergence: unrelated later Truth success cannot substitute for workflow_run consumer',()=>{
 const truth=[
  canonicalRun(20,{event:'push',conclusion:'failure',created:'2026-09-05T10:00:00Z'}),
  canonicalRun(40,{event:'workflow_dispatch',conclusion:'success',created:'2026-09-05T10:02:00Z'}),
 ];
 const x=classifyCanonicalConvergence([generationRun(30)],truth,sourceSha,observed);
 assert.equal(x.state,'VERIFIED_HOLD');assert.equal(x.failure_class,'WAITING_FOR_CANONICAL_CONSUMER');
});

test('canonical convergence: bounded wait times out instead of hanging or promoting an older result',async()=>{
 let clock=Date.parse('2026-09-05T10:00:00Z');
 const generation=[generationRun(30,{status:'in_progress',conclusion:null})];
 const truth=[canonicalRun(20,{event:'push',conclusion:'failure',created:'2026-09-05T10:00:00Z'})];
 const loadRuns=async(_repo,spec)=>spec.id==='CANONICAL_GENERATION'?generation:truth;
 await assert.rejects(
  waitForCanonicalConvergence(REPOSITORY,sourceSha,'SYNTHETIC_NEVER_TRANSMITTED',{
   maxWaitMs:50,pollMs:1,loadRuns,now:()=>clock,sleep:async()=>{clock+=51;},
  }),
  /CANONICAL_CONVERGENCE_TIMEOUT/,
 );
});

test('canonical convergence: PR 2290 natural race fixture selects the converged consumer, never the startup failure',()=>{
 const incidentSha='820a226abd28c662f211c87dc9e48f350f6bbe03';
 const generation=[generationRun(35668619197,{sha:incidentSha,created:'2026-09-21T23:40:18Z'})];
 const truth=[
  canonicalRun(35668619160,{sha:incidentSha,event:'push',conclusion:'failure',created:'2026-09-21T23:40:18Z'}),
  canonicalRun(35668695381,{sha:incidentSha,event:'workflow_run',created:'2026-09-21T23:41:18Z'}),
 ];
 const x=classifyCanonicalConvergence(generation,truth,incidentSha,'2026-09-21T23:42:00Z');
 assert.equal(x.state,'READY_FOR_CONTENT_VALIDATION');assert.equal(x.generation.id,35668619197);assert.equal(x.consumer.id,35668695381);
 assert.deepEqual(x.evaluation_truth_runs.map(run=>run.id),[35668695381]);
});
test('canonical convergence: runtime wait budget stays bound to the post-merge policy',()=>{
 const policy=JSON.parse(fs.readFileSync('coordination/kidults/kpmo/direct-owner-postmerge-push-suite-policy-v1.json'));
 assert.equal(CANONICAL_CONVERGENCE_MAX_WAIT_MS,policy.max_wait_seconds*1000);
 assert.equal(CANONICAL_CONVERGENCE_POLL_MS,policy.poll_interval_seconds*1000);
});

test('Gate cutoff remains strict when an unbounded API response includes a natural success one second later',()=>{
 const cutoff='2026-10-03T23:45:00Z';
 const prior=sentinelRun(37162202754,{createdAt:'2026-10-03T23:30:00Z'});
 const later=sentinelRun(37162751746,{event:'workflow_run',createdAt:'2026-10-03T23:45:01Z'});
 assert.throws(()=>selectLatestNaturalSentinelRun([prior,later],{sourceSha,repository:REPOSITORY,observedAt:cutoff}),/SENTINEL_SELECTION_TIME_INVALID/);
 const result=selectLatestNaturalSentinelRun([prior],{sourceSha,repository:REPOSITORY,observedAt:cutoff});
 assert.equal(result.state,'VERIFIED_PASS');assert.equal(result.latest.id,prior.id);
});
