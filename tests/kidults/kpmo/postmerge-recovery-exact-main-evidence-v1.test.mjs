import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {POSTMERGE_RECOVERY_INCIDENT as I,buildPostmergeRecoveryRequest} from '../../../scripts/kidults/kpmo/lib/autonomous-postmerge-recovery-v1.mjs';
import {createRecoveryExactMainEvidence} from '../../../scripts/kidults/kpmo/lib/postmerge-recovery-exact-main-evidence-v1.mjs';
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
