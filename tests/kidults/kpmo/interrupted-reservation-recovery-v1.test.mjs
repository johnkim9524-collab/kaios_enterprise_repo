import {test} from 'node:test';
import assert from 'node:assert/strict';
import {canonicalJson,sha256} from '../../../scripts/kidults/kpmo/lib/canonical-json-v1.mjs';
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
test('generic merged-only recovery preserves original owner and conditionally seals one bound body',async()=>{
 const s=setup();const result=await s.call();assert.equal(result.state,'ORIGINAL_POSTMERGE_TERMINAL_RECOVERED_NOT_PLATFORM_CLOSURE');
 assert.equal(result.original_run_id,'100');assert.equal(result.merge_performed,false);assert.equal(result.authority_renewed,false);
 assert.equal(s.context.original_run_id,'100');assert.equal(s.counts().claims,1);assert.equal(s.counts().consumes,1);assert.equal(s.counts().proofs,1);
});
test('consumption response loss is reconciled by readback without a second consume',async()=>{
 const s=setup(),consume=s.input.ledger.consume;s.input.ledger.consume=async input=>{await consume(input);throw Error('transport reply lost');};
 assert.equal((await s.call()).state,'ORIGINAL_POSTMERGE_TERMINAL_RECOVERED_NOT_PLATFORM_CLOSURE');assert.equal(s.counts().consumes,1);
});
test('unsettled consumption refuses reissue and never seals',async()=>{
 const s=setup();s.input.ledger.consume=async()=>{throw Error('timeout unknown');};
 await assert.rejects(s.call(),/CONSUME_UNKNOWN_NO_RETRY/);assert.equal(s.counts().seals,0);
});
test('archive interruption resumes persisted terminal after expiry with no new quorum/lease/consume',async()=>{
 const s=setup(),seal=s.input.immutable.seal;s.input.immutable.seal=async()=>{throw Error('archive unavailable');};
 await assert.rejects(s.call(),/archive unavailable/);s.input.immutable.seal=seal;s.setClock(time+1800000);
 assert.equal((await s.call()).state,'ORIGINAL_POSTMERGE_TERMINAL_RECOVERED_NOT_PLATFORM_CLOSURE');
 assert.equal(s.counts().claims,1);assert.equal(s.counts().consumes,1);assert.equal(s.counts().proofs,1);
});
for(const corrupt of [s=>s.rows.original.run_attempt=2,s=>s.rows.original.event='workflow_dispatch',s=>s.rows.original.status='in_progress',
 s=>s.rows.pr.merged=false,s=>s.rows.commit.parents.reverse(),s=>s.rows.commit.tree.sha=sha('f'),s=>s.rows.main.commit.sha=sha('f'),s=>s.rows.comparison.behind_by=1])
test('native drift is rejected before lease/consumption',async()=>{
 const s=setup();corrupt(s);await assert.rejects(s.call(),/INTERRUPTED_RECOVERY/);assert.equal(s.counts().claims,0);assert.equal(s.counts().consumes,0);
});
test('main changes during native readback fail closed',async()=>{
 const s=setup(),get=s.input.get;let reads=0;s.input.get=async route=>{const result=await get(route);if(route==='branches/main'&&++reads===2)result.commit.sha=sha('f');return result;};
 await assert.rejects(s.call(),/MAIN_CHANGED/);assert.equal(s.counts().claims,0);
});
test('stored consumed terminal cannot change head or expand HOLD',async()=>{
 const s=setup();await s.call();s.context.terminal.public='PASS';s.setClock(time+1800000);
 await assert.rejects(s.call(),/STORED_TERMINAL/);assert.equal(s.counts().consumes,1);
});
test('UNKNOWN state and quarantined operation never claim or issue merge',async()=>{
 const s=setup();s.context.state='UNKNOWN';await assert.rejects(s.call(),/RESERVATION_STATE/);
 s.input.request.pull_request=1677;assert.throws(()=>validateInterruptedRecoveryRequest(s.input.request),/QUARANTINE/);
 assert.equal(s.counts().claims,0);assert.equal(s.counts().consumes,0);
});
test('native observer uses only fixed GET routes and requires protected current main',async()=>{
 const s=setup();s.rows.main.protected=false;
 await assert.rejects(observeInterruptedRecoveryNative({request:s.input.request,get:s.input.get,now:time}),/CURRENT_MAIN/);
});

function supersessionSetup(){
 const s=setup();s.setClock(time+1260000);s.context.supersessions=0;
 const oldRequest=s.input.request,request={...oldRequest,issued_at:new Date(time+1260000).toISOString(),expires_at:new Date(time+2460000).toISOString()};
 let writes=0;
 s.input.ledger.supersede=async({expected_old_request_digest,evidence_digest})=>{
   assert.equal(expected_old_request_digest,s.context.request_digest);writes++;
   s.context.request_digest=sha256(canonicalJson(request));s.context.evidence_digest=evidence_digest;s.context.supersessions++;
   return {state:'POSTMERGE_RECOVERY_REQUEST_SUPERSEDED_NOT_LANDING_AUTHORITY',request_digest:s.context.request_digest,evidence_digest,
     original_run_id:'100',supersessions:s.context.supersessions};
 };
 const input={...s.input,oldRequest,request};return {...s,request,input,writes:()=>writes,call:()=>supersedeExpiredInterruptedPostmerge(input)};
}
test('expired merged request supersession preserves original identity and only changes an authenticated pin',async()=>{
 const s=supersessionSetup(),before=structuredClone(s.input.oldRequest),result=await s.call();
 assert.deepEqual(s.input.oldRequest,before);assert.equal(result.original_run_id,'100');assert.equal(result.original_landing_authority_renewed,false);
 assert.equal(result.merge_performed,false);assert.equal(s.writes(),1);assert.equal(s.counts().consumes,0);
});
test('supersession response loss reconciles the new exact pin without reissuing CAS',async()=>{
 const s=supersessionSetup(),supersede=s.input.ledger.supersede;s.input.ledger.supersede=async input=>{await supersede(input);throw Error('lost CAS reply');};
 assert.equal((await s.call()).supersessions,1);assert.equal(s.writes(),1);
});
test('supersession unknown with no exact new pin is held without retry',async()=>{
 const s=supersessionSetup();s.input.ledger.supersede=async()=>{throw Error('unknown');};
 await assert.rejects(s.call(),/SUPERSESSION_UNKNOWN_NO_RETRY/);assert.equal(s.writes(),0);
});
for(const corrupt of [s=>s.request.original_run_id='999',s=>s.request.pull_request=1677,s=>s.context.state='UNKNOWN',
 s=>s.context.state='CONSUMED',s=>s.context.supersessions=2,s=>s.context.terminal={state:'already terminal'},s=>s.setClock(time+1000)])
test('identity drift, UNKNOWN, consumed history and exhausted budget cannot supersede',async()=>{
 const s=supersessionSetup();corrupt(s);await assert.rejects(s.call(),/INTERRUPTED_RECOVERY/);assert.equal(s.writes(),0);
});
