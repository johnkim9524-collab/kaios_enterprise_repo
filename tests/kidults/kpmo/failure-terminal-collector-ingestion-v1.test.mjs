import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {collectWholePlatform} from '../../../scripts/kidults/kpmo/collect-whole-platform-operating-proof-v1.mjs';
import {failureTerminalFixture} from './failure-terminal-reconciliation-fixture-v1.mjs';
const contract=JSON.parse(fs.readFileSync('coordination/kidults/kpmo/whole-platform-operating-proof-v1.json'));
const scorecard=JSON.parse(fs.readFileSync(contract.value_chain_source));
function fixture(mutate=()=>{}){
 const f=failureTerminalFixture(),request=f.result.request,source=request.source_sha,repository=request.repository;
 const original={id:38132692877,run_attempt:1,event:'repository_dispatch',head_sha:request.base_sha,
   head_branch:'main',repository:{full_name:repository,id:1281328888},status:'completed',conclusion:'failure',path:'.github/workflows/kidults-autonomous-track-authorization-v1.yml'};
 const recovery={...original,id:500,event:'workflow_run',head_sha:source,conclusion:'success'};
 const oldReceipt={id:'kidults-autonomous-internal-landing-terminal-receipt-v1',state:'QUARANTINED',merge_performed:true,terminal_evidence:null,retry_without_reconciliation:false,original_reservation:f.options.original,production:'HOLD',public:'HOLD',g5:'HOLD'};
 const result={source_sha:source,role_run_id:'500',results:[f.result]};
 const oldArtifact={id:11700046124,name:'kidults-autonomous-internal-landing-finalizer-38132692877-1',digest:'sha256:b29d657aabd33895864a838dd84b836579a3febd9a4bd1299437580578f07ab4',expired:false,expires_at:'2027-01-01T00:00:00Z',workflow_run:{id:original.id,head_sha:original.head_sha}};
 const newArtifact={...oldArtifact,id:999,name:'kidults-postmerge-terminal-recovery-finalizer-500-1',digest:'sha256:'+'1'.repeat(64),workflow_run:{id:500,head_sha:source}};
 const jobs={total_count:1,jobs:[{id:700,run_id:500,run_attempt:1,name:'Bounded original reservation terminal recovery FINALIZER',status:'completed',conclusion:'success',steps:[{name:'Run bounded signed terminal recovery workload',status:'completed',conclusion:'success'}]}]};
 const state={f,request,source,original,recovery,result,newArtifact,jobs,oldReceipt,currentSource:source};mutate(state);
 const commit={sha:request.merge_sha,tree:{sha:request.head_tree_sha},parents:[{sha:request.base_sha},{sha:request.head_sha}]};
 const reads=[];const read=async url=>{
  const route=new URL(url).pathname.split(`/repos/${repository}/`)[1];reads.push(route);
  if(route==='branches/main')return {name:'main',protected:true,commit:{sha:state.currentSource}};
  if(route===`git/commits/${state.currentSource}`)return {sha:state.currentSource,tree:{sha:request.head_tree_sha},parents:[{sha:request.base_sha},{sha:request.head_sha}],committer:{date:request.issued_at}};
  if(route===`git/commits/${request.merge_sha}`)return commit;
  if(route===`pulls/2655`)return {number:2655,state:'closed',merged:true,merge_commit_sha:request.merge_sha,merged_at:'2026-10-11T00:00:00Z',head:{sha:request.head_sha,repo:{full_name:repository}},base:{ref:'main',repo:{full_name:repository}}};
  if(route.startsWith('compare/')){const base=route.slice(8).split('...')[0];return {base_commit:{sha:base},merge_base_commit:{sha:base},status:'ahead',behind_by:0};}
  if(route==='actions/runs/38132692877')return original;
  if(route==='actions/runs/500')return recovery;
  if(route==='actions/runs/38132692877/artifacts')return {total_count:1,artifacts:[oldArtifact]};
  if(route==='actions/runs/500/artifacts')return {total_count:1,artifacts:[newArtifact]};
  if(route==='actions/runs/500/attempts/1/jobs')return jobs;
  if(route.endsWith('/pulls'))return [];
  throw Error('unexpected read '+route);
 };
 // Native archive decoding is isolated here; production defaults to the real
 // ZIP byte/digest verifier, whose corruption tests run in the collector suite.
 const archiveReader=(bytes,digest)=>{const historical=bytes.toString()==='historic';assert.equal(digest,historical?oldArtifact.digest:newArtifact.digest);
  return {archive_digest:digest,members:[{name:historical?'receipt.json':'interrupted-FINALIZER.json',encoding:'utf-8',text:JSON.stringify(historical?oldReceipt:result)}]};};
 return {reads,run:()=>collectWholePlatform({sourceSha:state.currentSource,contract,scorecard,observedAt:'2026-10-12T00:30:00Z',read,
  listRuns:async(_,spec)=>spec.id==='FINALIZER_track'?[recovery]:[],download:async(_,a)=>Buffer.from(a.id===oldArtifact.id?'historic':'recovery'),archiveReader})};
}
test('collector ingests authenticated finalizer readback and explicitly supersedes only historic debt',async()=>{
 const f=fixture(),proof=await f.run(),check=proof.operating_checks.find(c=>c.id==='FINALIZER_RESERVATION_AND_IMMUTABLE_TERMINAL');
 assert.equal(check.state,'VERIFIED_PASS',JSON.stringify(check));assert.equal(proof.original_terminal_reconciliation.scope,'ORIGINAL_TERMINAL_DEBT_ONLY');
 assert.equal(proof.original_terminal_reconciliation.supersedes[0],38132692877);
 assert.equal(proof.autonomous_operating_proven,false);assert.equal(proof.whole_platform_runtime_proven,false);
 assert.ok(f.reads.includes('actions/runs/500/attempts/1/jobs'));
});
test('collector reuses historical protected recovery after main advances with source ancestry',async()=>{
 const f=fixture(s=>s.currentSource='f'.repeat(40)),proof=await f.run();assert.equal(proof.original_terminal_reconciliation.recovery_run_id,500);
 assert.ok(f.reads.includes('compare/'+'e'.repeat(40)+'...'+'f'.repeat(40)));assert.equal(proof.whole_platform_runtime_proven,false);
});
for(const [name,mutate] of [
 ['skipped actual finalizer',s=>s.jobs.jobs[0].conclusion='skipped'],
 ['skipped signed workload',s=>s.jobs.jobs[0].steps[0].conclusion='skipped'],
 ['foreign archive run',s=>s.newArtifact.workflow_run.id=501],
 ['expired archive',s=>s.newArtifact.expired=true],
 ['missing ACK',s=>s.result.results[0].consistent_read.immutable_ack=null],
 ['other original nonce',s=>s.oldReceipt.original_reservation.nonce_digest='sha256:'+'0'.repeat(64)],
 ['duplicate recovered result',s=>s.result.results.push(structuredClone(s.result.results[0]))],
])test('collector rejects '+name+' without claiming terminal or authority',async()=>{
 const proof=await fixture(mutate).run();assert.equal(proof.operating_checks.find(c=>c.id==='FINALIZER_RESERVATION_AND_IMMUTABLE_TERMINAL').state,'VERIFIED_FAIL');
 assert.equal(proof.original_terminal_reconciliation,undefined);assert.equal(proof.whole_platform_runtime_proven,false);
});
