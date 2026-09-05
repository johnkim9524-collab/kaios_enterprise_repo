import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {deflateRawSync} from 'node:zlib';
import {SPECS,evaluateProducer,evaluateHealth} from '../../../scripts/kidults/kpmo/resolve-continuous-assurance-sentinel-health-v1.mjs';
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

test('generation index: one exact native SHADOW control payload remains reachable',()=>{
 const result=evaluate([good]);assert.equal(result.state,'VERIFIED_PASS');assert.equal(result.selected_run_id,10);assert.equal(result.artifact_content_validated,true);
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
  const result=spawnSync(process.execPath,['--import',path.join(dir,'hook.mjs'),'scripts/kidults/kpmo/resolve-continuous-assurance-sentinel-health-v1.mjs','--output',out],{encoding:'utf8',timeout:15000,env:{PATH:process.env.PATH,LANG:'C.UTF-8',GITHUB_REPOSITORY:REPOSITORY,GITHUB_SHA:sourceSha,GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'schedule',GITHUB_RUN_ID:'900',GITHUB_RUN_ATTEMPT:'1',GH_TOKEN:'SYNTHETIC_NEVER_TRANSMITTED',FIXTURE_INPUT:path.join(dir,'input.json'),TRACE:trace}});
  assert.equal(result.error,undefined);assert.ok(fs.existsSync(out),result.stderr);
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
