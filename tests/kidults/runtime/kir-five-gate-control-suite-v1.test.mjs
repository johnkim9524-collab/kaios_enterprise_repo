import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {GATES,KIR_CORE_TEST_FILES,parseTapSummary,classifyTestProcess,controlChildEnvironment,verifyControlBundle} from '../../../scripts/kidults/runtime/run-kir-five-gate-control-suite-v1.mjs';
const sha='a'.repeat(40);
const tap='TAP version 13\n1..1\n# tests 1\n# suites 0\n# pass 1\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n';
const stable=x=>Array.isArray(x)?`[${x.map(stable).join(',')}]`:x&&typeof x==='object'?`{${Object.keys(x).sort().map(k=>`${JSON.stringify(k)}:${stable(x[k])}`).join(',')}}`:JSON.stringify(x);
const digest=x=>'sha256:'+crypto.createHash('sha256').update(x).digest('hex');
const sealed=r=>({...r,receipt_digest:digest(stable(r))});
function packet(dir){
 const groups=GATES.map(g=>{
  const logs={};for(const stream of ['stdout','stderr']){const text=stream==='stdout'?tap:'',member=`${g.id}.${stream}.log`;
   fs.writeFileSync(path.join(dir,member),text,{mode:0o600});logs[stream]={member,sha256:digest(text),bytes:Buffer.byteLength(text)};}
  return {id:g.id,state:'VERIFIED_PASS',failure_code:null,counts:parseTapSummary(tap),test_files:[...g.tests],exit_code:0,signal:null,logs};
 });
 return {id:'kidults-kir-five-gate-control-suite-v1',version:'1.0.0',repository:'johnkim9524-collab/kaios_enterprise_repo',source_sha:sha,tree_sha:sha,
  state:'VERIFIED_PASS',failure_code:null,started_at:'2026-09-06T11:00:00Z',finished_at:'2026-09-06T11:01:00Z',
  scope:'KIR_FIVE_GATE_CODE_CONTROL_ONLY_NOT_OPERATIONAL_READINESS',synthetic_or_loopback_tests:true,
  producer_execution_attested:false,staging_business_workload_verified:false,managed_postgres_verified:false,pitr_verified:false,production_readiness_verified:false,
  empirical_current_sold_delta:0,postgres_rows_written:0,provider_authority:false,database_authority:false,runtime_activation_authorized:false,promotion_eligible:false,
  production:'HOLD',public:'HOLD',g5:'HOLD',groups,operational_exit_criteria:GATES.map(g=>({id:g.id,state:'NOT_OBSERVED_BY_CONTROL_SUITE',required:g.live_exit}))};
}
function bundle(fn){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kir-five-control-'));try{fs.chmodSync(dir,0o700);const r=packet(dir);
 const save=()=>fs.writeFileSync(path.join(dir,'receipt.json'),JSON.stringify(sealed(r)),{mode:0o600});save();return fn(dir,r,save);
}finally{fs.rmSync(dir,{recursive:true,force:true});}}
test('all five gates and every original KIR file are mandatory, unique and present',()=>{
 assert.deepEqual(GATES.map(g=>g.id),['CANONICAL','SEMANTIC','ATOMIC_NEGATIVE','STAGING_LEDGER','PRODUCTION_READINESS']);
 const files=GATES.flatMap(g=>g.tests);assert.equal(new Set(files).size,files.length);
 assert.equal(KIR_CORE_TEST_FILES.length,10);for(const f of KIR_CORE_TEST_FILES)assert.ok(files.includes(f),f);
 for(const f of files)assert.ok(fs.statSync(f).isFile(),f);
 assert.ok(Object.isFrozen(GATES));assert.ok(GATES.every(g=>Object.isFrozen(g)&&Object.isFrozen(g.tests)));
});
test('full unfiltered successful TAP is required',()=>assert.deepEqual(parseTapSummary(tap),{tests:1,pass:1,fail:0,cancelled:0,skipped:0,todo:0}));
for(const [name,text] of [['empty',''],['no TAP header',tap.replace('TAP version 13','')],['no counters','TAP version 13\n'],['duplicate counters',tap+'# tests 1\n'],
 ['zero tests',tap.replace('# tests 1','# tests 0').replace('# pass 1','# pass 0')],['failed tests',tap.replace('# fail 0','# fail 1')],
 ['cancelled tests',tap.replace('# cancelled 0','# cancelled 1')],['skipped tests',tap.replace('# skipped 0','# skipped 1')],['todo tests',tap.replace('# todo 0','# todo 1')],['missing pass',tap.replace('# pass 1\n','')]])
 test(`reject partial/false-positive TAP: ${name}`,()=>assert.throws(()=>parseTapSummary(text)));
for(const result of [{status:1,stdout:tap},{status:null,signal:'SIGKILL',stdout:tap},{status:0,stdout:tap,error:{code:'ETIMEDOUT'}},{status:0,stdout:''}])
 test(`old PASS output cannot mask process failure ${JSON.stringify(result).slice(0,45)}`,()=>assert.equal(classifyTestProcess(result).state,'VERIFIED_FAIL'));
test('child environment carries no token, DSN, loader, proxy or inherited options',()=>{
 const e=controlChildEnvironment('/tmp/private');assert.deepEqual(Object.keys(e).sort(),['GIT_CONFIG_GLOBAL','GIT_CONFIG_NOSYSTEM','GIT_TERMINAL_PROMPT','HOME','LANG','PATH','TZ'].sort());
 assert.ok(!('NODE_OPTIONS' in e));assert.ok(!('GH_TOKEN' in e));assert.ok(!('DATABASE_URL' in e));
});
test('offline content success never attests runtime, DB, PITR or release',()=>bundle(dir=>{
 const r=verifyControlBundle(dir,sha);assert.equal(r.state,'CONTROL_BUNDLE_CONTENT_VERIFIED_EXECUTION_UNATTESTED');
 for(const k of ['producer_execution_attested','staging_business_workload_verified','managed_postgres_verified','pitr_verified','production_readiness_verified','promotion_eligible'])assert.equal(r[k],false);
 assert.equal(r.production,'HOLD');assert.equal(r.empirical_current_sold_delta,0);
}));
for(const [label,change] of [
 ['wrong source',r=>r.source_sha='b'.repeat(40)],['old tree',r=>r.tree_sha='bad'],['wrong repo',r=>r.repository='other/repo'],
 ['missing gate',r=>r.groups.pop()],['duplicate gate',r=>r.groups[0]=r.groups[1]],['missing test',r=>r.groups[0].test_files.pop()],
 ['fake pass count',r=>r.groups[0].counts.pass=2],['fake execution',r=>r.producer_execution_attested=true],
 ['fake staging',r=>r.staging_business_workload_verified=true],['fake DB',r=>r.managed_postgres_verified=true],['fake PITR',r=>r.pitr_verified=true],
 ['fake readiness',r=>r.production_readiness_verified=true],['fake promotion',r=>r.promotion_eligible=true],['fake empirical',r=>r.empirical_current_sold_delta=1],
 ['extra authority',r=>r.production_authorized=true],['wrong live exit',r=>r.operational_exit_criteria[0].state='VERIFIED_PASS'],
 ['forged success after failure',r=>r.groups[0].exit_code=1],['future-first time',r=>r.started_at='2026-09-07T00:00:00Z'],
 ['traversal log name',r=>r.groups[0].logs.stdout.member='../external.log'],
])test(`rehashed forged packet rejected: ${label}`,()=>bundle((dir,r,save)=>{change(r);save();assert.throws(()=>verifyControlBundle(dir,sha));}));
test('raw log change is detected without trusting the declared PASS',()=>bundle(dir=>{
 fs.appendFileSync(path.join(dir,'CANONICAL.stdout.log'),'x');assert.throws(()=>verifyControlBundle(dir,sha),/LOG_DIGEST/);
}));
test('extra files are not silently omitted',()=>bundle(dir=>{fs.writeFileSync(path.join(dir,'unexpected.json'),'{}');assert.throws(()=>verifyControlBundle(dir,sha),/MEMBER_SET/);}));
test('symlink and hard-linked members are rejected',()=>bundle(dir=>{
 const p=path.join(dir,'CANONICAL.stdout.log');fs.renameSync(p,p+'.orig');fs.symlinkSync(p+'.orig',p);assert.throws(()=>verifyControlBundle(dir,sha),/MEMBER_UNSAFE/);
 fs.unlinkSync(p);fs.linkSync(p+'.orig',p);assert.throws(()=>verifyControlBundle(dir,sha),/MEMBER_UNSAFE/);
}));
test('wrong directory mode and reused output do not overwrite evidence',()=>bundle(dir=>{
 fs.chmodSync(dir,0o755);assert.throws(()=>verifyControlBundle(dir,sha),/PRIVATE_DIRECTORY/);fs.chmodSync(dir,0o700);
 const before=fs.readFileSync(path.join(dir,'receipt.json'));
 const p=spawnSync(process.execPath,['scripts/kidults/runtime/run-kir-five-gate-control-suite-v1.mjs','run','--expected-sha',sha,'--output-dir',dir],{encoding:'utf8',timeout:5000});
 assert.equal(p.status,1);assert.deepEqual(fs.readFileSync(path.join(dir,'receipt.json')),before);
}));
test('invalid source still leaves a durable fail-closed CLI receipt, not a PASS',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kir-five-invalid-'));try{
  const p=spawnSync(process.execPath,['scripts/kidults/runtime/run-kir-five-gate-control-suite-v1.mjs','run','--expected-sha','bad','--output-dir',dir],{encoding:'utf8',timeout:5000});
  assert.equal(p.status,1);const r=JSON.parse(fs.readFileSync(path.join(dir,'receipt.json')));assert.equal(r.state,'VERIFIED_FAIL');assert.equal(r.source_sha,null);assert.ok(r.groups.every(g=>g.state==='NOT_RUN'));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('existing KIR must fail when integrated gate fails; all logs are retained without extra authority',()=>{
 const w=fs.readFileSync('.github/workflows/kidults-kir-runtime-contract-v1.yml','utf8');
 for(const x of ['id: five_gate_regression','FIVE_GATE_OUTCOME: ${{ steps.five_gate_regression.outcome }}',"('FIVE_GATE',os.environ.get('FIVE_GATE_OUTCOME',''))",'run-kir-five-gate-control-suite-v1.mjs run','run-kir-five-gate-control-suite-v1.mjs verify','kidults-kir-five-gate-controls-'])assert.ok(w.includes(x),x);
 assert.ok(w.includes('node --test tests/kidults/source-intelligence/semantic-chain-native-run-identity-v1.test.mjs tests/kidults/kpmo/kir-coverage-assurance-continuation-v1.test.mjs tests/kidults/runtime/kir-runtime-v1.test.mjs'));
 assert.ok(!w.includes('secrets.'));assert.ok(!w.includes('contents: write'));assert.ok(!/^  workflow_run:/m.test(w));
});
