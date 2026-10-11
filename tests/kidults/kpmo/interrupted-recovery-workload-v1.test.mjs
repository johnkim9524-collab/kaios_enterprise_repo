import {test} from 'node:test';
import assert from 'node:assert/strict';
import {canonicalJson,sha256} from '../../../scripts/kidults/kpmo/lib/canonical-json-v1.mjs';
import {runInterruptedRecoveryWorkload} from '../../../scripts/kidults/kpmo/lib/interrupted-recovery-workload-v1.mjs';
import {observeInterruptedRecoveryNative,resumeInterruptedPostmerge,validateInterruptedRecoveryRequest,supersedeExpiredInterruptedPostmerge} from '../../../scripts/kidults/kpmo/lib/interrupted-reservation-recovery-v1.mjs';
const HOLD={production:'HOLD',public:'HOLD',g5:'HOLD',provider_activation:'HOLD'};
const repository='johnkim9524-collab/kaios_enterprise_repo',sha=c=>c.repeat(40),time=Date.parse('2026-10-11T00:00:00Z');
function setup(){
 let clock=time,claims=0,consumes=0,seals=0,acks=0,nativeReads=0,proofs=0;
 const request={id:'kidults-interrupted-reservation-postmerge-request-v1',version:'1.0.0',repository,repository_id:'1281328888',pull_request:42,
   base_sha:sha('a'),head_sha:sha('b'),head_tree_sha:sha('c'),merge_sha:sha('d'),source_sha:sha('e'),original_run_id:'100',original_run_attempt:1,
   original_generation:'pr-42-original-generation',nonce_digest:'sha256:'+'f'.repeat(64),issued_at:new Date(time).toISOString(),expires_at:new Date(time+1200000).toISOString(),...HOLD};
 const context={state:'RESERVED',request_digest:sha256(canonicalJson(request)),original_run_id:'100',revision:0,terminal:null};
 const rows={main:{name:'main',protected:true,commit:{sha:sha('e')}},pr:{number:42,state:'closed',merged:true,merge_commit_sha:sha('d'),merged_at:'2026-10-10T23:59:00Z',head:{sha:sha('b'),repo:{full_name:repository}},base:{ref:'main',repo:{full_name:repository}}},
   original:{id:100,run_attempt:1,head_sha:sha('a'),head_branch:'main',repository:{full_name:repository,id:1281328888},path:'.github/workflows/kidults-autonomous-kpmo-authorization-v1.yml',event:'repository_dispatch',status:'completed',conclusion:'cancelled'},
   commit:{sha:sha('d'),tree:{sha:sha('c')},parents:[{sha:sha('a')},{sha:sha('b')}]},comparison:{base_commit:{sha:sha('d')},merge_base_commit:{sha:sha('d')},behind_by:0,status:'ahead'}};
 const get=async route=>{nativeReads++;return structuredClone(route==='branches/main'?rows.main:route==='pulls/42'?rows.pr:route==='actions/runs/100'?rows.original:route.startsWith('git/')?rows.commit:rows.comparison);};
 const ledger={read:async()=>structuredClone(context),claim:async({expected_revision})=>{
   claims++;assert.equal(expected_revision,context.revision);context.revision++;
   return {state:'TERMINAL_RECOVERY_LEASE_ONLY',revision:context.revision,original_run_id:'100',lease_until:clock/1000+120};
 },consume:async({terminal})=>{consumes++;context.state='CONSUMED';context.terminal=structuredClone(terminal);return {state:'CONSUMED',terminal_digest:sha256(canonicalJson(terminal))};},
 acknowledge:async()=>{acks++;return {state:'IMMUTABLE_ACKNOWLEDGED'};}};
 const immutable={seal:async({key,terminal,if_none_match})=>{seals++;assert.equal(if_none_match,'*');return {bucket:'immutable',key,version_id:'native-version',sha256:sha256(canonicalJson(terminal)),retention_mode:'COMPLIANCE',retain_until:'2036-10-11T00:00:00Z',encryption_key_arn:'arn:aws:kms:ap-northeast-2:528314240275:key/receipt-key'};}};
 const verifyEvidence=async({native})=>{proofs++;return {...native,checks:['REQUIRED_PUSH_SUITE','CANONICAL_TRUTH','SENTINEL','SUCCESS_AUTHORITY_GATE'].map((kind,i)=>({kind,run_id:String(300+i),run_attempt:1,source_sha:sha('e'),conclusion:'success',artifact_id:500+i,archive_digest:'sha256:'+'1'.repeat(64),receipt_digest:'sha256:'+'2'.repeat(64)}))};};
 const input={request,recoveryRunId:'400',ledger,get,verifyEvidence,immutable,now:()=>clock};
 return {input,rows,context,setClock:x=>clock=x,counts:()=>({claims,consumes,seals,acks,nativeReads,proofs}),call:()=>resumeInterruptedPostmerge(input)};
}

function workloadSetup(role='FINALIZER'){
 const s=setup(),request=s.input.request;let approvals=0,drains=0;
 const evidence={verifyEvidence:s.input.verifyEvidence};
 s.input.ledger.readContext=async()=>({state:s.context.state,request,evidence:null,candidate_approvals:[{role:'ACCOUNTABLE_TRACK_AGENT'},{role:'KPMO'},{role:'INDEPENDENT_VERIFIER'}]});
 s.input.ledger.createApproval=async()=>{approvals++;return {state:'APPROVAL_STORED'};};
 const input={role,candidates:[{request}],ledger:s.input.ledger,get:s.input.get,evidence,immutable:s.input.immutable,verifyDrain:async()=>{drains++;},runId:'400',now:()=>time,wait:async()=>{}};
 return {...s,input,call:()=>runInterruptedRecoveryWorkload(input),extra:()=>({approvals,drains})};
}
test('automatic generic finalizer binds native proof, broker drain, original CAS and immutable ACK',async()=>{
 const s=workloadSetup();const result=await s.call();assert.equal(result.state,'BOUNDED_RECOVERY_TERMINAL_VERIFIED');
 assert.equal(s.counts().consumes,1);assert.equal(s.counts().seals,1);assert.equal(s.extra().drains,1);
 assert.equal(result.results[0].original_run_id,'100');assert.equal(result.promotion_eligible,false);
});
test('automatic accountable role records only its separate approval',async()=>{const s=workloadSetup('ACCOUNTABLE_TRACK_AGENT');await s.call();assert.equal(s.extra().approvals,1);assert.equal(s.counts().claims,0);assert.equal(s.extra().drains,0);});
test('existing signed role approval is reused rather than reissued',async()=>{
 const s=workloadSetup('KPMO'),native=await observeInterruptedRecoveryNative({request:s.input.candidates[0].request,get:s.input.get,now:time}),proof=await s.input.evidence.verifyEvidence({native});
 const read=s.input.ledger.readContext;s.input.ledger.readContext=async()=>({...await read(),approval:{request_digest:sha256(canonicalJson(s.input.candidates[0].request)),evidence_digest:sha256(canonicalJson(proof))}});
 await s.call();assert.equal(s.extra().approvals,0);
});
test('UNKNOWN and missing original reservations never approve or consume',async()=>{
 for(const state of ['UNKNOWN','ORIGINAL_RESERVATION_MISSING']){const s=workloadSetup('ACCOUNTABLE_TRACK_AGENT');s.input.ledger.readContext=async()=>({state});
 if(state==='UNKNOWN')await assert.rejects(s.call(),/STATE/);else await s.call();assert.equal(s.extra().approvals,0);assert.equal(s.counts().consumes,0);}
});
test('undrained broker tokens stop finalizer before lease or consume',async()=>{const s=workloadSetup();s.input.verifyDrain=async()=>{throw Error('TOKEN_NOT_DRAINED');};await assert.rejects(s.call(),/TOKEN_NOT_DRAINED/);assert.equal(s.counts().claims,0);assert.equal(s.counts().seals,0);});
test('already acknowledged terminal creates no approvals, leases, consumption or S3 request',async()=>{const s=workloadSetup();s.input.ledger.readContext=async()=>({state:'CONSUMED',request:s.input.candidates[0].request,immutable_ack:{version_id:'original'}});await s.call();assert.equal(s.extra().approvals,0);assert.equal(s.extra().drains,0);assert.equal(s.counts().seals,0);});
test('incomplete independent quorum exhausts bounded GET wait without consumption',async()=>{const s=workloadSetup();let reads=0;s.input.ledger.readContext=async()=>{reads++;return {state:'RESERVED',request:s.input.candidates[0].request,candidate_approvals:[]};};await assert.rejects(s.call(),/INDEPENDENT_QUORUM_PENDING/);assert.equal(reads,19);assert.equal(s.counts().claims,0);});
