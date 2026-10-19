import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {POSTMERGE_RECOVERY_INCIDENT as I,buildPostmergeRecoveryRequest} from '../../../scripts/kidults/kpmo/lib/autonomous-postmerge-recovery-v1.mjs';
import {canonicalJson,sha256} from '../../../scripts/kidults/kpmo/lib/autonomous-internal-landing-v1.mjs';
import {createRecoveryExactMainEvidence,validateFailureOperatingProofBinding} from '../../../scripts/kidults/kpmo/lib/postmerge-recovery-exact-main-evidence-v1.mjs';
const SHA='1d7981f6c09e2b7ad52fe5a819c59a54ea01525c',NOW=Date.parse('2026-10-03T23:00:00Z');
const policy=JSON.parse(fs.readFileSync('coordination/kidults/kpmo/direct-owner-postmerge-push-suite-policy-v1.json'));
function fixture(){
 const request=buildPostmergeRecoveryRequest({sourceSha:SHA,issuedAt:'2026-10-03T22:59:00Z',expiresAt:'2026-10-03T23:19:00Z'});
 const repo={full_name:I.repository,id:Number(I.repository_id)};
 const runs=policy.required_workflows.map((s,i)=>({id:10+i,run_attempt:1,path:s.path,name:s.name,head_sha:SHA,head_branch:'main',event:'push',status:'completed',conclusion:'success',repository:repo,created_at:'2026-10-03T14:31:00Z'}));
 const sentinel={id:100,run_attempt:1,path:'.github/workflows/kpmo-continuous-assurance-sentinel-health-v1.yml',head_sha:SHA,head_branch:'main',event:'repository_dispatch',status:'completed',conclusion:'failure',repository:repo,created_at:'2026-10-03T22:58:00Z'};
 const f={request,runs,sentinel,branch:{name:'main',protected:true,commit:{sha:SHA}},calls:[],archives:0,pages:null};
 const readJson=async route=>{
  f.calls.push(route);
  if(route==='branches/main')return f.branch;
  if(route===`commits/${SHA}`)return {sha:SHA,commit:{committer:{date:'2026-10-03T14:30:00Z'}}};
  if(route.includes('kpmo-continuous-assurance-sentinel-health-v1.yml/runs'))return {total_count:1,workflow_runs:[f.sentinel]};
  const file=route.split('/')[2];const matching=f.runs.filter(r=>r.path.endsWith('/'+file));
  return f.pages||{total_count:matching.length,workflow_runs:matching};
 };
 f.collect=()=>createRecoveryExactMainEvidence({policy,readJson,readBytes:async()=>{f.archives++;throw new Error('must not read archives');},now:()=>NOW}).selectSnapshot(request);return f;
}
for(const [name,mutate,code] of [
 ['main source mismatch',f=>f.branch.commit.sha='b'.repeat(40),'RECOVERY_EVIDENCE_MAIN'],
 ['main unprotected',f=>f.branch.protected=false,'RECOVERY_EVIDENCE_MAIN'],
 ['one required suite failed',f=>f.runs[0].conclusion='failure','RECOVERY_EVIDENCE_PUSH_SUITE'],
 ['one required suite absent',f=>f.runs.pop(),'RECOVERY_EVIDENCE_PUSH_SUITE'],
 ['required suite replay attempt',f=>f.runs[0].run_attempt=2,'RECOVERY_EVIDENCE_PUSH_IDENTITY'],
 ['duplicate push run',f=>f.runs.push({...f.runs[0],id:90}),'RECOVERY_EVIDENCE_PUSH_SUITE'],
 ['source repository mismatch',f=>f.runs[0].repository={full_name:'foreign/repo',id:1},'RECOVERY_EVIDENCE_PUSH_IDENTITY'],
 ['latest natural failure',f=>{},'RECOVERY_LATEST_SENTINEL_NOT_SUCCESS'],
 ['latest natural queued',f=>{f.sentinel.status='queued';f.sentinel.conclusion=null;},'RECOVERY_LATEST_SENTINEL_NOT_SUCCESS'],
 ['pagination exceeds budget',f=>f.pages={total_count:1001,workflow_runs:[]},'RECOVERY_EVIDENCE_PAGINATION_DRIFT'],
 ['pagination omits page',f=>f.pages={total_count:101,workflow_runs:[]},'RECOVERY_EVIDENCE_PAGINATION_INCOMPLETE'],
])test(`reject ${name} before accepting an older receipt`,async()=>{const f=fixture();mutate(f);await assert.rejects(f.collect(),new RegExp(code));assert.equal(f.archives,0);});

function failureProofFixture(recovered=true){
 const refs=['800',801,'sha256:'+'c'.repeat(64)];
 const parent={source_sha:SHA,terminal_check_id:'FINALIZER_RESERVATION_AND_IMMUTABLE_TERMINAL',
  terminal_check_reason:'ORIGINAL_RESERVATION_AND_IMMUTABLE_TERMINAL_UNAVAILABLE',terminal_check_evidence_refs:refs};
 const request={original_run_id:800},originalArchive={artifact_id:801,archive_digest:refs[2]};
 const core={id:'kidults-whole-platform-operating-proof-v1',repository:I.repository,source_sha:SHA,state:'VERIFIED_FAIL',
  whole_platform_runtime_proven:false,operating_checks:[{id:parent.terminal_check_id,state:'VERIFIED_FAIL',
   reason:recovered?'WHOLE_RUNTIME_RECOVERY_HISTORY_CARDINALITY':parent.terminal_check_reason,
   ...(recovered?{}:{evidence_refs:refs})}],
  ...(recovered?{original_terminal_null_observation:{state:'VERIFIED_FAIL',reason:parent.terminal_check_reason,
   evidence_refs:refs,actual_authority_granted:false,retry_without_reconciliation:false},
   protected_evidence:[{workflow_path:'.github/workflows/kidults-autonomous-track-authorization-v1.yml',run_id:800,
    run_attempt:1,source_sha:'a'.repeat(40),artifact_id:801,artifact_digest:refs[2]}]}:{})};
 return {parent,request,originalArchive,operatingProof:{...core,receipt_digest:sha256(canonicalJson(core))}};
}
test('accepts normalized cardinality failure only when preserved terminal-null evidence is bound',()=>{
 const f=failureProofFixture();assert.doesNotThrow(()=>validateFailureOperatingProofBinding(f));
});
test('keeps direct terminal-null proof compatibility',()=>{
 const f=failureProofFixture(false);assert.doesNotThrow(()=>validateFailureOperatingProofBinding(f));
});
for(const [name,mutate] of [
 ['different original artifact',f=>f.operatingProof.original_terminal_null_observation.evidence_refs[1]++],
 ['unbound protected evidence',f=>f.operatingProof.protected_evidence[0].artifact_digest='sha256:'+'d'.repeat(64)],
 ['authority claim',f=>f.operatingProof.original_terminal_null_observation.actual_authority_granted=true],
 ['terminal check carries unrelated refs',f=>f.operatingProof.operating_checks[0].evidence_refs=['999',998,'sha256:'+'e'.repeat(64)]]
])test(`rejects preserved terminal-null evidence with ${name}`,()=>{
 const f=failureProofFixture();mutate(f);const {receipt_digest,...body}=f.operatingProof;
 f.operatingProof.receipt_digest=sha256(canonicalJson(body));
 assert.throws(()=>validateFailureOperatingProofBinding(f),/RECOVERY_FAILURE_TERMINAL_NULL_ONLY/);
});
