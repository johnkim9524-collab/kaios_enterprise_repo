import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {nativeWorkflowRunNameMatches as matches} from '../../../scripts/kidults/source-intelligence/native-workflow-run-identity-v1.mjs';
import {reconcileArlAuthoritativeGenerationPages as history,resolveCoverageAuthoritativeProducer as producer,resolveCoveragePriorSuccessExactQuery as prior} from '../../../scripts/kidults/source-intelligence/resolve-asi-orchestration-run-history-v1.mjs';
import {classifyWorkflowRunGeneration as classify} from '../../../scripts/kidults/source-intelligence/classify-workflow-run-generation-v1.mjs';
import {validateSentinelTrigger} from '../../../scripts/kidults/kpmo/validate-sentinel-trigger-v1.mjs';

const repo='johnkim9524-collab/kaios_enterprise_repo';
const arlName='KIDULTS ASI Autonomous Resolution Layer v1';
const arlPath='.github/workflows/kidults-asi-autonomous-resolution-layer-v1.yml';
const coverageName='KIDULTS ASI Requirement-to-Adapter Coverage v1';
const coveragePath='.github/workflows/kidults-asi-requirement-adapter-coverage-v1.yml';
const source='ca81969fc089c70039af2a872370faace8c4c466';
const p1=34013139877;
const repoObject={id:1281328888,full_name:repo};
// Sanitized shape of historical native run 34013158292. This is a regression
// fixture, not a new execution, source acquisition or current-main PASS receipt.
function arl(overrides={}) {return {id:34013158292,workflow_id:340654573,run_attempt:1,
  name:`KIDULTS ARL / p1-${p1}`,display_title:`KIDULTS ARL / p1-${p1}`,
  path:arlPath,event:'workflow_run',head_sha:source,head_branch:'main',
  repository:structuredClone(repoObject),head_repository:structuredClone(repoObject),
  created_at:'2026-09-06T05:06:36Z',status:'completed',conclusion:'success',...overrides};}
function coverage(overrides={}) {return {...arl(),id:34013514936,path:coveragePath,
  name:`KIDULTS Coverage / source-${source}`,display_title:`KIDULTS Coverage / source-${source}`,...overrides};}
function arlReceipt(){return {source_sha:source,p1_source_sha:source,producer_workflow_run_id:34013158292,
  producer_display_title:`KIDULTS ARL / p1-${p1}`,p1_workflow_run_id:p1,authoritative_producer:true,
  downstream_consumable:true,exact_generation_bound:true,exact_triggering_run_bound:true};}
const options={sourceSha:source,headBranch:'main',expectedDisplayTitle:`KIDULTS ARL / p1-${p1}`,
  currentRunId:34013158292,createdSince:'2026-09-06T05:06:08Z',createdThrough:'2026-09-06T05:06:36Z'};
function historical(run=arl()){return history({...options,pages:[{total_count:1,workflow_runs:[run]}]});}

for(const [label,run,name,p] of [['ARL static',arl({name:arlName}),arlName,arlPath],['ARL dynamic',arl(),arlName,arlPath],
  ['Coverage static',coverage({name:coverageName}),coverageName,coveragePath],['Coverage dynamic',coverage(),coverageName,coveragePath]])
  test(`closed native-name contract: ${label}`,()=>assert.equal(matches(run,name,p),true));
for(const [label,change] of [
  ['arbitrary name',{name:'anything'}],['prefix suffix',{name:`KIDULTS ARL / p1-${p1}-suffix`,display_title:`KIDULTS ARL / p1-${p1}-suffix`}],
  ['different name/title',{name:'KIDULTS ARL / p1-1'}],['recovery title',{name:`KIDULTS ARL / recovery-${source}`,display_title:`KIDULTS ARL / recovery-${source}`}],
  ['unsafe P1 id',{name:'KIDULTS ARL / p1-9007199254740992',display_title:'KIDULTS ARL / p1-9007199254740992'}],
  ['wrong path',{path:coveragePath}],['missing title',{display_title:undefined}],['empty name',{name:''}],
])test(`native-name rejects ${label}`,()=>assert.equal(matches(arl(change),arlName,arlPath),false));
test('Coverage source title must bind its own head SHA',()=>assert.equal(matches(coverage({head_sha:'b'.repeat(40)}),coverageName,coveragePath),false));
test('path/name contract cannot be expanded by arbitrary workflow labels',()=>assert.equal(matches(arl(),'unregistered name',arlPath),false));

test('historical native dynamic ARL shape passes exact complete history',()=>{
 const result=historical();assert.equal(result.state,'VERIFIED_PASS_BOUNDED_COMPLETE');assert.equal(result.current_run_in_complete_query,true);
 assert.equal(result.production,'HOLD');
});
for(const [label,change] of [['wrong name',{name:'other'}],['wrong path',{path:coveragePath}],['prior SHA',{head_sha:'b'.repeat(40)}],
 ['manual event',{event:'workflow_dispatch'}],['branch mismatch',{head_branch:'feature'}],['missing current run',{id:34013158293}],
 ['different P1 title',{name:'KIDULTS ARL / p1-1',display_title:'KIDULTS ARL / p1-1'}]])
 test(`history retains fail-closed ${label}`,()=>assert.throws(()=>historical(arl(change))));
test('complete dynamic 101-run history rejects a prior same-generation success',()=>{
 const runs=Array.from({length:101},(_,i)=>arl({id:1000+i,name:`KIDULTS ARL / p1-${1000+i}`,display_title:`KIDULTS ARL / p1-${1000+i}`}));
 runs[100]=arl();const input={...options,pages:[{total_count:101,workflow_runs:runs.slice(0,100)},{total_count:101,workflow_runs:runs.slice(100)}]};
 assert.equal(history(input).returned_count,101);
 assert.throws(()=>history({...input,pages:input.pages.slice(0,1)}),/PAGINATION_INCOMPLETE/);
 runs[0]=arl({id:1000});input.pages[0].workflow_runs[0]=runs[0];assert.throws(()=>history(input),/ARL_AUTHORITATIVE_PRODUCER_DUPLICATE/);
});
test('exact Coverage consumption accepts native dynamic ARL and keeps receipt generation bound',()=>{
 const result=producer({run:arl(),receipt:arlReceipt(),sourceSha:source});assert.equal(result.authoritative_producer_cardinality,1);
 assert.equal(result.global_same_head_history_scan_performed,false);assert.equal(result.production,'HOLD');
});
for(const [label,change] of [['receipt run',{producer_workflow_run_id:99}],['P1 id',{p1_workflow_run_id:99}],
 ['receipt SHA',{source_sha:'b'.repeat(40)}],['nonconsumable',{downstream_consumable:false}],['non-authoritative',{authoritative_producer:false}],
 ['unbound source',{exact_generation_bound:false}],['unbound trigger',{exact_triggering_run_bound:false}]])
 test(`Coverage producer rejects ${label}`,()=>assert.throws(()=>producer({run:arl(),receipt:{...arlReceipt(),...change},sourceSha:source})));
test('dynamic Coverage history retains exact server-filtered cardinality contract',()=>{
 const rows=Array.from({length:100},(_,i)=>coverage({id:1000+i}));
 assert.equal(prior({payload:{total_count:2001,workflow_runs:rows},sourceSha:source,createdSince:options.createdSince}).prior_success_count,2001);
 rows[0].name='KIDULTS Coverage / manual-1000';assert.throws(()=>prior({payload:{total_count:2001,workflow_runs:rows},sourceSha:source,createdSince:options.createdSince}));
});

function classification(overrides={},extra={}){return classify({event:{workflow_run:arl({...overrides})},currentMainSha:source,
 executionSha:source,repository:repo,expectedWorkflowPath:arlPath,...extra});}
for(const event of ['schedule','workflow_dispatch','push','pull_request'])test(`known ${event} producer is explicit nonauthority`,()=>{
 const r=classification({event});assert.equal(r.state,'VERIFIED_SKIP');assert.equal(r.reason,'PRODUCER_EVENT_MISMATCH');assert.equal(r.current_main_authority,false);
});
for(const [label,change,reason] of [['unknown event',{event:'bogus'},'PRODUCER_EVENT_INVALID'],['missing event',{event:undefined},'PRODUCER_EVENT_INVALID'],
 ['bad event format',{event:'bad-event'},'PRODUCER_EVENT_INVALID'],['nonterminal',{status:'in_progress',conclusion:null},'PRODUCER_LIFECYCLE_INVALID'],
 ['missing lifecycle',{status:undefined},'PRODUCER_LIFECYCLE_INVALID'],['unsafe run ID',{id:Number.MAX_SAFE_INTEGER+1},'WORKFLOW_RUN_EVENT_MISSING'],
 ['negative run ID',{id:-1},'WORKFLOW_RUN_EVENT_MISSING'],['string run ID',{id:'1'},'WORKFLOW_RUN_EVENT_MISSING'],
 ['missing attempt',{run_attempt:undefined},'PRODUCER_RUN_ATTEMPT_INVALID'],['zero attempt',{run_attempt:0},'PRODUCER_RUN_ATTEMPT_INVALID'],
 ['malformed ignored-source SHA',{event:'schedule',head_sha:'bad'},'PRODUCER_HEAD_SHA_INVALID']])
 test(`classifier invalidity cannot hide behind SKIP: ${label}`,()=>{const r=classification(change);assert.equal(r.state,'VERIFIED_FAIL');assert.equal(r.reason,reason);assert.equal(r.current_main_authority,false);});
test('unknown expected producer event cannot authorize itself',()=>assert.equal(classification({event:'bogus'},{expectedProducerEvent:'bogus'}).reason,'EXPECTED_PRODUCER_EVENT_INVALID'));

function tempRun(run,fn){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kir-native-shape-'));try{
 const file=path.join(dir,'run.json');fs.writeFileSync(file,JSON.stringify(run));return fn(file);
}finally{fs.rmSync(dir,{recursive:true,force:true});}}
const workflow=fs.readFileSync(arlPath,'utf8');
const jqCommand=workflow.match(/CURRENT_ARL_CREATED_AT=\$\((jq[\s\S]*?\/tmp\/arl-current-run\.json)\)/)?.[1];
assert.ok(jqCommand,'native ARL jq guard must be present');
function arlGuard(run){return tempRun(run,file=>spawnSync('bash',['-c',jqCommand.replace('/tmp/arl-current-run.json',JSON.stringify(file))],{
 encoding:'utf8',timeout:5000,env:{PATH:process.env.PATH,GITHUB_RUN_ID:String(34013158292),GITHUB_RUN_ATTEMPT:'1',GITHUB_REPOSITORY:repo,GITHUB_SHA:source,P1_RUN_ID:String(p1)}}));}
test('real workflow jq regression: old static-name predicate rejects native fixture; corrected exact predicate succeeds',()=>{
 tempRun(arl(),file=>assert.equal(spawnSync('jq',['-er',`select(.name==${JSON.stringify(arlName)}) | .created_at`,file]).status,4));
 const r=arlGuard(arl());assert.equal(r.status,0,r.stderr);assert.equal(r.stdout.trim(),'2026-09-06T05:06:36Z');
});
for(const [label,change] of [['wrong run',{id:1}],['wrong attempt',{run_attempt:2}],['wrong source',{head_sha:'b'.repeat(40)}],
 ['wrong repo',{repository:{full_name:'fork/repo'}}],['fork head',{head_repository:{full_name:'fork/repo'}}],['wrong path',{path:coveragePath}],
 ['manual event',{event:'workflow_dispatch'}],['unbound title',{display_title:'KIDULTS ARL / p1-9'}],['arbitrary name',{name:'untrusted'}]])
 test(`real ARL jq preserves ${label} rejection`,()=>assert.notEqual(arlGuard(arl(change)).status,0));

const covSource=fs.readFileSync(coveragePath,'utf8');
const nativeStart=covSource.indexOf("          import fs from 'node:fs';");
const nativeGuard=covSource.slice(nativeStart,covSource.indexOf('\n          NODE',nativeStart)).split('\n').map(s=>s.slice(10)).join('\n');
function coverageGuard(run){return tempRun(run,file=>spawnSync(process.execPath,['--input-type=module','-'],{
 input:nativeGuard.replace('/tmp/arl-run.json',file),encoding:'utf8',timeout:5000,
 env:{PATH:process.env.PATH,GITHUB_REPOSITORY:repo,EVENT_ARL_RUN_ID:'34013158292',EVENT_ARL_RUN_ATTEMPT:'1',EVENT_ARL_EVENT:'workflow_run',TARGET_SOURCE_SHA:source,EXPECTED_HEAD_BRANCH:'main'}}));}
test('real Coverage inline native guard accepts dynamic ARL',()=>{const p=coverageGuard(arl());assert.equal(p.status,0,p.stderr);});
for(const [label,change] of [['attempt drift',{run_attempt:2}],['run drift',{id:1}],['wrong repository',{repository:{full_name:'fork/repo'}}],
 ['fork head',{head_repository:{full_name:'fork/repo'}}],['nonterminal',{status:'in_progress',conclusion:null}],['wrong name',{name:'unknown'}],
 ['wrong event',{event:'schedule'}],['different source',{head_sha:'b'.repeat(40)}]])
 test(`real Coverage inline guard rejects ${label}`,()=>assert.notEqual(coverageGuard(arl(change)).status,0));

const env={GITHUB_REPOSITORY:repo,GITHUB_REF:'refs/heads/main',GITHUB_SHA:source,GITHUB_EVENT_NAME:'workflow_run'};
for(const conclusion of ['success','failure','cancelled','skipped'])test(`sentinel accepts dynamic Coverage ${conclusion} for observation, not PASS`,()=>{
 const run=coverage({conclusion});const result=validateSentinelTrigger(env,{action:'completed',repository:repoObject,workflow_run:run},structuredClone(run));
 assert.equal(result.conclusion,conclusion);assert.equal(Object.hasOwn(result,'state'),false);
});
test('sentinel rejects native title drift on readback',()=>{
 const run=coverage();assert.throws(()=>validateSentinelTrigger(env,{action:'completed',repository:repoObject,workflow_run:run},{...run,display_title:'different'}));
});

test('wiring preserves canonical schema name, exact raw identity checks and bounded observer paths',()=>{
 assert.ok(covSource.includes("workflow_name:'KIDULTS ASI Autonomous Resolution Layer v1',workflow_path:run.path"));
 assert.ok(!covSource.includes('workflow_name:run.name'));
 assert.ok(workflow.includes('node --test tests/kidults/source-intelligence/semantic-chain-native-run-identity-v1.test.mjs'));
 const assurance=fs.readFileSync('.github/workflows/kidults-platform-continuous-assurance-v1.yml','utf8');
 assert.ok(assurance.includes(`github.event.workflow_run.path == '${coveragePath}'`));
 assert.ok(assurance.includes("'), github.event.workflow_run.path)"));
 const strict=fs.readFileSync('.github/workflows/kpmo-continuous-assurance-sentinel-health-v1.yml','utf8');
 assert.ok(strict.includes('.state=="VERIFIED_PASS"'));assert.ok(strict.includes('.semantic_content_verified==true'));
 assert.ok(!/^  workflow_run:/m.test(strict));
});

function embeddedPython(marker){
 const s=workflow.split(`<<'${marker}'\n`)[1]?.split(`\n          ${marker}`)[0];assert.ok(s,marker);
 return s.split('\n').map(x=>x.startsWith('          ')?x.slice(10):x).join('\n');
}
const initPython=embeddedPython('PY_ARL_INITIAL'),finalPython=embeddedPython('PY_ARL_FINAL');
function terminalObservation(overrides={},tamper=false){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'arl-terminal-test-'));
 try{
  const env={PATH:process.env.PATH,RUNNER_TEMP:dir,GITHUB_REPOSITORY:repo,GITHUB_SHA:source,GITHUB_RUN_ID:'34013158292',GITHUB_RUN_ATTEMPT:'1',ARL_JOB_STATUS:'success',...Object.fromEntries(['RESTORE','BUILD','VALIDATE','CLAIM','RECEIPT','ARCHIVE'].map(k=>['ARL_'+k,'success'])),...overrides,GH_TOKEN:'SECRET_NOT_ALLOWED_IN_TERMINAL'};
  const init=spawnSync('python3',['-I','-c',initPython],{env,encoding:'utf8',timeout:5000});assert.equal(init.status,0,init.stderr);
  const file=path.join(dir,'kir-arl-producer-terminal-v1.json');
  const before=JSON.parse(fs.readFileSync(file));assert.equal(before.state,'VERIFIED_FAIL');assert.equal(before.downstream_consumable,false);
  if(tamper){before.source_sha='b'.repeat(40);fs.writeFileSync(file,JSON.stringify(before));}
  const final=spawnSync('python3',['-I','-c',finalPython],{env,encoding:'utf8',timeout:5000});
  const bytes=fs.readFileSync(file,'utf8'),receipt=JSON.parse(bytes);
  assert.ok(!bytes.includes(env.GH_TOKEN));assert.equal(receipt.downstream_consumable,false);assert.equal(receipt.authoritative_producer,false);
  for(const key of ['production','public','g5'])assert.equal(receipt[key],'HOLD');
  return {final,receipt};
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
}
test('ARL terminal bootstrap and successful final observation never create consumer authority',()=>{
 const {final,receipt}=terminalObservation();assert.equal(final.status,0,final.stderr);assert.equal(receipt.state,'VERIFIED_PASS');assert.equal(receipt.artifact_role,'TERMINAL_NON_CONSUMABLE');
});
for(const [key,value] of [['ARL_RESTORE','failure'],['ARL_BUILD','cancelled'],['ARL_VALIDATE','failure'],['ARL_CLAIM','failure'],['ARL_RECEIPT','skipped'],['ARL_ARCHIVE','failure'],['ARL_JOB_STATUS','failure'],['ARL_CLAIM','']])
 test(`real terminal Python preserves RED for ${key}=${value}`,()=>{const r=terminalObservation({[key]:value});assert.equal(r.final.status,0,r.final.stderr);assert.equal(r.receipt.state,'VERIFIED_FAIL');});
test('terminal identity drift is rejected rather than resealed',()=>assert.notEqual(terminalObservation({},true).final.status,0));
test('dynamic name with trailing newline is not accepted',()=>assert.equal(matches(arl({name:'KIDULTS ARL / p1-1\n',display_title:'KIDULTS ARL / p1-1\n'}),arlName,arlPath),false));

for (const conclusion of [null, 'bogus', '', 0]) test(`malformed terminal conclusion ${JSON.stringify(conclusion)} cannot hide behind SKIP`, () => {
 const r = classification({event:'schedule', conclusion});
 assert.equal(r.state, 'VERIFIED_FAIL'); assert.equal(r.reason, 'PRODUCER_LIFECYCLE_INVALID');
});
test('expected event cannot widen canonical producer authority', () => {
 assert.equal(classification({event:'schedule'}, {expectedProducerEvent:'schedule'}).reason, 'EXPECTED_PRODUCER_EVENT_INVALID');
});
test('KIR regression includes the real semantic-chain regression without dropping existing tests', () => {
 const text = fs.readFileSync('.github/workflows/kidults-kir-runtime-contract-v1.yml', 'utf8');
 assert.ok(text.includes('node --test tests/kidults/source-intelligence/semantic-chain-native-run-identity-v1.test.mjs tests/kidults/runtime/kir-runtime-v1.test.mjs'));
 for (const file of ['kir-readiness-evidence-intake-v1.test.mjs', 'current-sold-postgres-ledger-atomic-recompute-v1.test.mjs', 'source-intelligence-writer-snapshot-v1.test.mjs']) assert.ok(text.includes(file));
});
