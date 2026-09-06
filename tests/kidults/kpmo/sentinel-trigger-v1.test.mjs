import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {PRODUCER_COMPLETIONS,readSentinelEvent,validateSentinelTrigger} from '../../../scripts/kidults/kpmo/validate-sentinel-trigger-v1.mjs';
const repo='johnkim9524-collab/kaios_enterprise_repo';
const env={GITHUB_EVENT_NAME:'workflow_run',GITHUB_REPOSITORY:repo,GITHUB_REF:'refs/heads/main',GITHUB_SHA:'a'.repeat(40)};
function event(spec=PRODUCER_COMPLETIONS[3]){return {action:'completed',repository:{id:1281328888,full_name:repo},workflow_run:{id:100,run_attempt:1,repository:{id:1281328888,full_name:repo},head_repository:{id:1281328888,full_name:repo},name:spec.name,path:spec.path,event:spec.events[0],head_branch:'main',head_sha:env.GITHUB_SHA,status:'completed',conclusion:'success'}};}
for(const spec of PRODUCER_COMPLETIONS)test(`automatic observer accepts exact same-main ${spec.name}`,()=>{
 const p=event(spec);assert.equal(validateSentinelTrigger(env,p,structuredClone(p.workflow_run)).run_id,100);
 const wf=fs.readFileSync(spec.path,'utf8');assert.ok(wf.startsWith(`name: ${spec.name}\n`));
});
for(const name of ['schedule','workflow_dispatch'])test(`existing ${name} observer remains valid`,()=>assert.equal(validateSentinelTrigger({...env,GITHUB_EVENT_NAME:name}),null));
for(const conclusion of ['failure','cancelled','timed_out','skipped'])test(`terminal ${conclusion} triggers re-evaluation rather than hiding RED`,()=>{
 const p=event();p.workflow_run.conclusion=conclusion;assert.equal(validateSentinelTrigger(env,p,p.workflow_run).conclusion,conclusion);
});
const mutations=[
 ['fork source',p=>p.workflow_run.head_repository.full_name='other/repo'],
 ['wrong repository',p=>p.workflow_run.repository.full_name='other/repo'],
 ['wrong outer repository',p=>p.repository.full_name='other/repo'],
 ['different SHA',p=>p.workflow_run.head_sha='b'.repeat(40)],
 ['nonmain branch',p=>p.workflow_run.head_branch='feature'],
 ['PR event',p=>p.workflow_run.event='pull_request'],
 ['unknown workflow',p=>p.workflow_run.path='.github/workflows/untrusted.yml'],
 ['name path mismatch',p=>p.workflow_run.name='Wrong workflow'],
 ['in-progress',p=>{p.workflow_run.status='in_progress';p.workflow_run.conclusion=null;}],
 ['queued delivery',p=>p.action='requested'],
 ['unknown conclusion',p=>p.workflow_run.conclusion='unknown'],
 ['string run ID',p=>p.workflow_run.id='100'],
 ['unsafe run ID',p=>p.workflow_run.id=Number.MAX_SAFE_INTEGER+1],
 ['attempt missing',p=>delete p.workflow_run.run_attempt],
];
for(const [name,mutate] of mutations)test(`trigger refuses ${name}`,()=>{const p=event();mutate(p);assert.throws(()=>validateSentinelTrigger(env,p));});
for(const [name,mutate] of [
 ['new attempt',r=>r.run_attempt=2],['different run',r=>r.id=101],
 ['changed conclusion',r=>r.conclusion='failure'],['different head repository ID',r=>r.head_repository.id=99],
 ['missing native repository ID',r=>delete r.repository.id],
])test(`native re-read refuses ${name}`,()=>{const p=event(),r=structuredClone(p.workflow_run);mutate(r);assert.throws(()=>validateSentinelTrigger(env,p,r));});
for(const changes of [{GITHUB_EVENT_NAME:'push'},{GITHUB_REF:'refs/heads/feature'},{GITHUB_SHA:'main'},{GITHUB_REPOSITORY:'other/repo'}])test(`observer environment remains bounded ${JSON.stringify(changes)}`,()=>assert.throws(()=>validateSentinelTrigger({...env,...changes},event())));
test('event reader rejects symlink, array, corrupt JSON and oversize input',()=>{
 const d=fs.mkdtempSync(path.join(os.tmpdir(),'sentinel-trigger-'));try{
  const p=path.join(d,'event.json');fs.writeFileSync(p,JSON.stringify(event()));assert.deepEqual(readSentinelEvent(p),event());
  const symlink=path.join(d,'link');fs.symlinkSync(p,symlink);assert.throws(()=>readSentinelEvent(symlink));
  for(const raw of ['[]','null','{broken', 'x'.repeat(4194305)]){fs.writeFileSync(p,raw);assert.throws(()=>readSentinelEvent(p));}
 }finally{fs.rmSync(d,{recursive:true,force:true});}
});
test('existing sentinel workflow wires bounded completion events and trigger regressions',()=>{
 const s=fs.readFileSync('.github/workflows/kpmo-continuous-assurance-sentinel-health-v1.yml','utf8');
 assert.match(s,/^  workflow_run:\n    workflows:/m);
 for(const x of PRODUCER_COMPLETIONS)assert.ok(s.includes(`      - '${x.name}'`));
 assert.match(s,/types: \[completed\]/);assert.match(s,/branches: \[main\]/);
 assert.ok(s.includes('tests/kidults/kpmo/sentinel-trigger-v1.test.mjs'));
 assert.match(s,/github\.event\.workflow_run\.head_sha == github\.sha/);
 assert.doesNotMatch(s,/issues: write|contents: write|secrets\./);
});

// Execute the real resolver with a closed HTTP/Git transport. A valid trigger
// is never itself a producer PASS: missing core producers must remain HOLD.
import {spawnSync} from 'node:child_process';
function resolverCli(scenario){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sentinel-trigger-cli-'));
 const payload=event();
 if(scenario==='fork')payload.workflow_run.head_repository.full_name='other/repo';
 const eventPath=path.join(dir,'event.json'),output=path.join(dir,'receipt.json'),trace=path.join(dir,'trace.json');
 fs.writeFileSync(eventPath,scenario==='malformed-json'?'{bad':JSON.stringify(payload));
 const hook=`import fs from 'node:fs';import cp from 'node:child_process';import {syncBuiltinESMExports} from 'node:module';
const p=${JSON.stringify(event())},scenario=${JSON.stringify(scenario)},calls=[];let reads=0;
const exec=cp.execFileSync;cp.execFileSync=(f,a,o)=>f==='git'&&a.join(' ')==='rev-parse HEAD'?process.env.GITHUB_SHA+'\\n':exec(f,a,o);syncBuiltinESMExports();
process.on('exit',()=>fs.writeFileSync(process.env.TRACE,JSON.stringify(calls)));
globalThis.fetch=async(url,options)=>{
 const u=new URL(url);calls.push({path:u.pathname,method:options.method});
 if(u.origin!=='https://api.github.com'||options.method!=='GET')throw Error('OFFLINE_UNEXPECTED_REQUEST');
 if(u.pathname.endsWith('/branches/main'))return Response.json({commit:{sha:process.env.GITHUB_SHA}});
 if(u.pathname.endsWith('/actions/runs/100')){
  reads++;const r=structuredClone(p.workflow_run);
  if(scenario==='native-attempt')r.run_attempt=2;
  if(scenario==='native-repository')r.repository.id=99;
  if(scenario==='readback-drift'&&reads===2)r.conclusion='failure';
  return Response.json(r);
 }
 if(u.pathname.includes('/actions/workflows/'))return Response.json({total_count:0,workflow_runs:[]});
 throw Error('OFFLINE_UNKNOWN_ROUTE');
};`;
 try{
  const preload=path.join(dir,'hook.mjs');fs.writeFileSync(preload,hook);
  const result=spawnSync(process.execPath,['--import',preload,'scripts/kidults/kpmo/resolve-continuous-assurance-sentinel-health-v1.mjs','--output',output],{encoding:'utf8',timeout:12000,env:{PATH:process.env.PATH,...env,GITHUB_RUN_ID:'900',GITHUB_RUN_ATTEMPT:'1',GITHUB_EVENT_PATH:eventPath,GH_TOKEN:'CLOSED_TRANSPORT_TEST_ONLY',TRACE:trace}});
  assert.equal(result.error,undefined,result.stderr);
  const r=JSON.parse(fs.readFileSync(output,'utf8')),calls=JSON.parse(fs.readFileSync(trace,'utf8'));
  assert.equal(r.promotion_eligible,false);assert.equal(r.semantic_content_verified,false);
  for(const k of ['provider_authority','database_authority','whole_platform_authority'])assert.equal(r[k],false);
  for(const k of ['public','production','g5'])assert.equal(r[k],'HOLD');
  assert.ok(!JSON.stringify(r).includes('CLOSED_TRANSPORT_TEST_ONLY'));
  assert.ok(calls.every(x=>x.method==='GET'));
  return {result,receipt:r,calls};
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
}
test('actual completion observer reads native trigger twice and keeps missing producers HOLD',()=>{
 const x=resolverCli('valid');assert.equal(x.receipt.state,'VERIFIED_HOLD',x.result.stderr);
 assert.equal(x.calls.filter(v=>v.path.endsWith('/actions/runs/100')).length,2);
});
for(const scenario of ['fork','malformed-json','native-attempt','native-repository','readback-drift'])test(`actual completion observer durably rejects ${scenario}`,()=>{
 const x=resolverCli(scenario);assert.equal(x.receipt.state,'VERIFIED_FAIL');assert.notEqual(x.result.status,0);
 if(['fork','malformed-json'].includes(scenario))assert.equal(x.calls.length,0);
});
