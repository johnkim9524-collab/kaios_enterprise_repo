#!/usr/bin/env node
// One exact-source control integration run. NEVER an empirical or release gate.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync,execFileSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const REPOSITORY='johnkim9524-collab/kaios_enterprise_repo';
const SHA=/^[0-9a-f]{40}$/;
const MAX_LOG=16*1024*1024;
const TIMEOUT=120000;
const stable=x=>Array.isArray(x)?`[${x.map(stable).join(',')}]`:x&&typeof x==='object'?`{${Object.keys(x).sort().map(k=>`${JSON.stringify(k)}:${stable(x[k])}`).join(',')}}`:JSON.stringify(x);
const digest=x=>'sha256:'+crypto.createHash('sha256').update(x).digest('hex');
const fail=code=>{throw new Error(code);};
export const KIR_CORE_TEST_FILES=Object.freeze([
 'tests/kidults/runtime/kir-runtime-v1.test.mjs',
 'tests/kidults/runtime/kir-integration-boundary-v1.test.mjs',
 'tests/kidults/runtime/kir-current-sold-control-bridge-v1.test.mjs',
 'tests/kidults/runtime/kir-ledger-control-v1.test.mjs',
 'tests/kidults/market/current-sold-postgres-ledger-v1.test.mjs',
 'tests/kidults/market/current-sold-postgres-ledger-atomic-recompute-v1.test.mjs',
 'tests/kidults/runtime/kir-readiness-evidence-intake-v1.test.mjs',
 'tests/kidults/source-intelligence/global-sold-source-registry-v1.test.mjs',
 'tests/kidults/source-intelligence/source-intelligence-evidence-manifest-v1.test.mjs',
 'tests/kidults/source-intelligence/source-intelligence-writer-snapshot-v1.test.mjs',
]);
// These are fixed repository tests, never caller-selected commands or globs.
export const GATES=Object.freeze([
 {id:'CANONICAL',tests:[
  'tests/kidults/kpmo/canonical-failure-terminal-v1.test.mjs',
  'tests/kidults/kpmo/canonical-generation-refresh-v1.test.mjs',
  'tests/kidults/kpmo/canonical-same-main-refresh-v1.test.mjs',
  'tests/kidults/kpmo/canonical-write-recovery-v1.test.mjs',
  'tests/kidults/kpmo/canonical-test-preload-url-v1.test.mjs',
 ],live_exit:'CURRENT_MAIN_AUTHORIZED_CANONICAL_APPLY_AND_NATIVE_LIVE_CONTENT'},
 {id:'SEMANTIC',tests:[
  'tests/kidults/source-intelligence/semantic-chain-native-run-identity-v1.test.mjs',
  'tests/kidults/kpmo/kir-coverage-assurance-continuation-v1.test.mjs',
  'tests/kidults/kpmo/sentinel-producer-content-v1.test.mjs',
  'tests/kidults/kpmo/postmerge-content-authority-boundary-v1.test.mjs',
  'tests/kidults/kpmo/sentinel-generation-selection-v1.test.mjs',
  'tests/kidults/kpmo/sentinel-trigger-v1.test.mjs',
  'tests/kidults/kpmo/sentinel-observation-v1.test.mjs',
 ],live_exit:'EXACT_MAIN_FOUR_PRODUCER_NATURAL_CONTENT_AND_CONSUMPTION'},
 {id:'ATOMIC_NEGATIVE',tests:[
  'tests/kidults/kpmo/atomic-dispatch-terminal-receipt-v1.test.mjs',
  'tests/kidults/kpmo/atomic-dispatch-identity-v1.test.mjs',
  'tests/kidults/kpmo/atomic-event-emitting-transport-v1.test.mjs',
  'tests/kidults/kpmo/atomic-landing-one-use-preflight-v1.test.mjs',
  'tests/kidults/kpmo/atomic-landing-postmerge-transport-containment-v1.test.mjs',
 ],live_exit:'NATIVE_AUTHORIZED_NEGATIVE_DISPATCH_NO_MUTATION_AND_RETAINED_FAILURE'},
 {id:'STAGING_LEDGER',tests:[
  ...KIR_CORE_TEST_FILES.slice(2,6),
  'apps/dual-staging-http-runtime/src/server.test.mjs',
  'apps/dual-staging-http-runtime/src/postgres-runtime.test.mjs',
 ],live_exit:'LAWFUL_EXACT_PAIR_STAGING_WORKLOAD_MANAGED_POSTGRES_READBACK_AND_PITR'},
 {id:'PRODUCTION_READINESS',tests:[
  ...KIR_CORE_TEST_FILES.slice(0,2),...KIR_CORE_TEST_FILES.slice(6),
  'tests/production/production-release-evidence-gate-v1.test.mjs',
  'tests/kidults/runtime/kir-five-gate-control-suite-v1.test.mjs',
 ],live_exit:'NATIVE_PRODUCER_ATTESTATION_NATURAL_WINDOW_AND_FULL_READINESS_MEMBER_CLOSURE'},
].map(g=>Object.freeze({...g,tests:Object.freeze(g.tests)})));

export function controlChildEnvironment(home){
 return {PATH:path.dirname(process.execPath)+':/usr/bin:/bin',HOME:home,LANG:'C.UTF-8',TZ:'UTC',
  GIT_TERMINAL_PROMPT:'0',GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null'};
}
function git(args){return execFileSync('/usr/bin/git',['--no-replace-objects','-c','core.fsmonitor=false',...args],{
 cwd:ROOT,encoding:'utf8',timeout:10000,env:controlChildEnvironment('/tmp'),stdio:['ignore','pipe','pipe']}).trim();}
function snapshot(expected){
 if(!SHA.test(expected||''))fail('KIR_INTEGRATION_EXPECTED_SHA');
 if(git(['remote','get-url','origin'])!=='https://github.com/'+REPOSITORY+'.git'&&git(['remote','get-url','origin'])!=='https://github.com/'+REPOSITORY)fail('KIR_INTEGRATION_ORIGIN');
 if(git(['rev-parse','HEAD'])!==expected)fail('KIR_INTEGRATION_CHECKOUT_MISMATCH');
 if(git(['status','--porcelain=v1','--untracked-files=all'])!=='')fail('KIR_INTEGRATION_DIRTY_SOURCE');
 return {source_sha:expected,tree_sha:git(['rev-parse','HEAD^{tree}'])};
}
export function parseTapSummary(text){
 if(typeof text!=='string'||!/^TAP version 13\r?$/m.test(text))fail('KIR_INTEGRATION_TAP_MISSING');
 const result={};
 for(const k of ['tests','pass','fail','cancelled','skipped','todo']){
  const rows=[...text.matchAll(new RegExp(`^# ${k} ([0-9]+)\\r?$`,'gm'))];
  if(rows.length!==1)fail('KIR_INTEGRATION_TAP_CARDINALITY');
  result[k]=Number(rows[0][1]);if(!Number.isSafeInteger(result[k]))fail('KIR_INTEGRATION_TAP_COUNT');
 }
 if(result.tests<1||result.pass!==result.tests||['fail','cancelled','skipped','todo'].some(k=>result[k]!==0))fail('KIR_INTEGRATION_TESTS_NOT_ALL_PASS');
 return result;
}
export function classifyTestProcess(result){
 if(result.error||result.signal||result.status!==0)return {state:'VERIFIED_FAIL',failure_code:result.error?.code==='ETIMEDOUT'?'KIR_INTEGRATION_TEST_TIMEOUT':'KIR_INTEGRATION_PROCESS_FAILED',counts:null};
 try{return {state:'VERIFIED_PASS',failure_code:null,counts:parseTapSummary(result.stdout)};}
 catch(error){return {state:'VERIFIED_FAIL',failure_code:error.message,counts:null};}
}
function seal(value){return {...value,receipt_digest:digest(stable(value))};}
function atomicJson(file,value){
 const temp=file+'.tmp-'+crypto.randomBytes(8).toString('hex');let fd;
 try{fd=fs.openSync(temp,'wx',0o600);fs.writeFileSync(fd,JSON.stringify(value,null,2)+'\n');fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;fs.renameSync(temp,file);}
 finally{if(fd!==undefined)fs.closeSync(fd);if(fs.existsSync(temp))fs.unlinkSync(temp);}
}
function safeDirectory(directory,{empty=false}={}){
 if(typeof directory!=='string'||!path.isAbsolute(directory))fail('KIR_INTEGRATION_OUTPUT_ABSOLUTE');
 const resolved=path.resolve(directory),relative=path.relative(ROOT,resolved);
 if(relative===''||(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative)))fail('KIR_INTEGRATION_OUTPUT_INSIDE_SOURCE');
 const st=fs.lstatSync(resolved);
 if(!st.isDirectory()||st.isSymbolicLink()||fs.realpathSync(resolved)!==resolved||(st.mode&0o777)!==0o700||st.uid!==process.getuid())fail('KIR_INTEGRATION_OUTPUT_PRIVATE_DIRECTORY');
 if(empty&&fs.readdirSync(resolved).length)fail('KIR_INTEGRATION_OUTPUT_NOT_EMPTY');
 return resolved;
}
function boundary(){return {scope:'KIR_FIVE_GATE_CODE_CONTROL_ONLY_NOT_OPERATIONAL_READINESS',
 synthetic_or_loopback_tests:true,producer_execution_attested:false,staging_business_workload_verified:false,
 managed_postgres_verified:false,pitr_verified:false,production_readiness_verified:false,
 empirical_current_sold_delta:0,postgres_rows_written:0,provider_authority:false,database_authority:false,
 runtime_activation_authorized:false,promotion_eligible:false,production:'HOLD',public:'HOLD',g5:'HOLD'};}

export function runControlIntegration({expectedSourceSha,outputDirectory}){
 const out=safeDirectory(outputDirectory,{empty:true});
 let report={id:'kidults-kir-five-gate-control-suite-v1',version:'1.0.0',repository:REPOSITORY,
  source_sha:SHA.test(expectedSourceSha||'')?expectedSourceSha:null,tree_sha:null,
  state:'VERIFIED_FAIL',failure_code:'KIR_INTEGRATION_NOT_COMPLETED',
  started_at:new Date().toISOString(),finished_at:null,...boundary(),
  operational_exit_criteria:GATES.map(g=>({id:g.id,state:'NOT_OBSERVED_BY_CONTROL_SUITE',required:g.live_exit})),
  groups:GATES.map(g=>({id:g.id,state:'NOT_RUN',test_files:[...g.tests]}))};
 const save=()=>atomicJson(path.join(out,'receipt.json'),seal(report));save();
 try{
  const before=snapshot(expectedSourceSha);report.tree_sha=before.tree_sha;save();
  for(const [i,g] of GATES.entries()){
   // Serial execution avoids fanout amplification; every gate runs even after another gate is RED.
   snapshot(expectedSourceSha);
   const home=fs.mkdtempSync(path.join(out,'.home-'));
   let p;
   try{p=spawnSync(process.execPath,['--test','--test-reporter=tap','--test-concurrency=1',...g.tests],{
    cwd:ROOT,encoding:'utf8',env:controlChildEnvironment(home),timeout:TIMEOUT,maxBuffer:MAX_LOG,killSignal:'SIGKILL'});}
   finally{fs.rmSync(home,{recursive:true,force:true});}
   const verdict=classifyTestProcess(p),logs={};
   for(const stream of ['stdout','stderr']){
    const bytes=Buffer.from(p[stream]||'');if(bytes.length>MAX_LOG)fail('KIR_INTEGRATION_LOG_LIMIT');
    const member=`${g.id}.${stream}.log`;fs.writeFileSync(path.join(out,member),bytes,{flag:'wx',mode:0o600});
    logs[stream]={member,sha256:digest(bytes),bytes:bytes.length};
   }
   report.groups[i]={id:g.id,...verdict,test_files:[...g.tests],exit_code:p.status,
    signal:p.signal||null,logs};save();
  }
  const after=snapshot(expectedSourceSha);if(stable(after)!==stable(before))fail('KIR_INTEGRATION_SOURCE_CHANGED');
  report.state=report.groups.every(g=>g.state==='VERIFIED_PASS')?'VERIFIED_PASS':'VERIFIED_FAIL';
  report.failure_code=report.state==='VERIFIED_PASS'?null:'KIR_INTEGRATION_GATE_FAILED';
 }catch(error){report.state='VERIFIED_FAIL';report.failure_code=/^KIR_INTEGRATION_[A-Z_]+$/.test(error.message)?error.message:'KIR_INTEGRATION_INTERNAL_ERROR';}
 report.finished_at=new Date().toISOString();save();
 return seal(report);
}

// Offline verification proves content integrity only, not execution provenance.
export function verifyControlBundle(directory,expectedSourceSha){
 const dir=safeDirectory(directory),read=name=>{
  const file=path.join(dir,name),s=fs.lstatSync(file);
  if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1||s.size>MAX_LOG||fs.realpathSync(file)!==file)fail('KIR_INTEGRATION_MEMBER_UNSAFE');
  const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
  try{const a=fs.fstatSync(fd),bytes=fs.readFileSync(fd),b=fs.fstatSync(fd);
   if(a.ino!==s.ino||a.dev!==s.dev||bytes.length!==s.size||a.size!==b.size||a.mtimeMs!==b.mtimeMs)fail('KIR_INTEGRATION_MEMBER_CHANGED');return bytes;
  }finally{fs.closeSync(fd);}
 };
 const r=JSON.parse(read('receipt.json')), {receipt_digest,...body}=r;
 const fields=['id','version','repository','source_sha','tree_sha','state','failure_code','started_at','finished_at','groups','operational_exit_criteria','receipt_digest',...Object.keys(boundary())].sort();
 if(stable(Object.keys(r).sort())!==stable(fields))fail('KIR_INTEGRATION_RECEIPT_FIELDS');
 if(!Number.isFinite(Date.parse(r.started_at))||!Number.isFinite(Date.parse(r.finished_at))||Date.parse(r.finished_at)<Date.parse(r.started_at))fail('KIR_INTEGRATION_RECEIPT_TIME');
 if(receipt_digest!==digest(stable(body)))fail('KIR_INTEGRATION_RECEIPT_DIGEST');
 if(r.id!=='kidults-kir-five-gate-control-suite-v1'||r.version!=='1.0.0'||r.repository!==REPOSITORY||!SHA.test(expectedSourceSha||'')||r.source_sha!==expectedSourceSha||!SHA.test(r.tree_sha||''))fail('KIR_INTEGRATION_RECEIPT_IDENTITY');
 for(const [key,value] of Object.entries(boundary()))if(r[key]!==value)fail('KIR_INTEGRATION_AUTHORITY_BOUNDARY');
 if(stable(r.operational_exit_criteria)!==stable(GATES.map(g=>({id:g.id,state:'NOT_OBSERVED_BY_CONTROL_SUITE',required:g.live_exit}))))fail('KIR_INTEGRATION_OPERATIONAL_CLAIM');
 if(!Array.isArray(r.groups)||r.groups.length!==GATES.length)fail('KIR_INTEGRATION_GATE_SET');
 const members=['receipt.json'];
 for(const [i,g] of GATES.entries()){
  const v=r.groups[i];if(v.id!==g.id||stable(v.test_files)!==stable(g.tests)||v.state!=='VERIFIED_PASS'||v.exit_code!==0||v.signal!==null)fail('KIR_INTEGRATION_GATE_FAILED');
  for(const stream of ['stdout','stderr']){
   const member=`${g.id}.${stream}.log`,decl=v.logs?.[stream];
   if(decl?.member!==member)fail('KIR_INTEGRATION_MEMBER_NAME');
   const bytes=read(member);if(decl.sha256!==digest(bytes)||decl.bytes!==bytes.length)fail('KIR_INTEGRATION_LOG_DIGEST');
   if(stream==='stdout'&&stable(parseTapSummary(bytes.toString('utf8')))!==stable(v.counts))fail('KIR_INTEGRATION_COUNTS_MISMATCH');
   members.push(member);
  }
 }
 if(stable(fs.readdirSync(dir).sort())!==stable(members.sort()))fail('KIR_INTEGRATION_MEMBER_SET');
 if(r.state!=='VERIFIED_PASS'||r.failure_code!==null)fail('KIR_INTEGRATION_NOT_PASS');
 return {state:'CONTROL_BUNDLE_CONTENT_VERIFIED_EXECUTION_UNATTESTED',source_sha:r.source_sha,
  groups:r.groups.map(g=>({id:g.id,tests:g.counts.tests})),...boundary()};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  const args=process.argv.slice(2);if(args.length!==5||!['run','verify'].includes(args[0])||args[1]!=='--expected-sha'||args[3]!=='--output-dir')fail('KIR_INTEGRATION_ARGUMENTS');
  const result=args[0]==='run'?runControlIntegration({expectedSourceSha:args[2],outputDirectory:args[4]}):verifyControlBundle(args[4],args[2]);
  console.log(JSON.stringify(result,null,2));if(result.state==='VERIFIED_FAIL')process.exitCode=1;
 }catch(error){console.error(JSON.stringify({state:'VERIFIED_FAIL',failure_code:/^KIR_INTEGRATION_[A-Z_]+$/.test(error.message)?error.message:'KIR_INTEGRATION_REJECTED',...boundary()}));process.exitCode=1;}
}
