import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyTerminalRecoveryProofAdmission} from '../../../scripts/kidults/kpmo/lib/terminal-recovery-proof-admission-v1.mjs';

const repository='johnkim9524-collab/kaios_enterprise_repo',sha='a'.repeat(40),runId=90;
function fixture(){
  return {event:{action:'completed',workflow_run:{id:runId,name:'KPMO Continuous Assurance Success Authority Gate V1',
      path:'.github/workflows/kpmo-continuous-assurance-success-authority-gate-v1.yml',status:'completed',conclusion:'success',
      run_attempt:1,head_sha:sha,head_branch:'main',repository:{full_name:repository,id:1281328888},head_repository:{full_name:repository}}},
    jobsResponse:{total_count:1,jobs:[{id:91,run_id:runId,run_attempt:1,name:'deferred-runtime-proof-handoff-gate',status:'completed',conclusion:'success',
      steps:[{name:'Require exact autonomous Assurance proof closure',status:'completed',conclusion:'success'}]}]},
    artifactsResponse:{total_count:1,artifacts:[{id:92,name:`kpmo-deferred-assurance-runtime-proof-gate-${sha}-80-1`,digest:'sha256:'+'b'.repeat(64),expired:false,workflow_run:{id:runId,head_sha:sha}}]}};
}
test('admits only an exact successful proof-handoff gate before credentials',()=>{
  const r=verifyTerminalRecoveryProofAdmission(fixture());assert.equal(r.state,'PROOF_HANDOFF_ADMITTED_NOT_AUTHORITY');
  assert.equal(r.proof_handoff_job_id,91);assert.equal(r.proof_artifact_id,92);assert.equal(r.reservation_write_performed,false);
});
for(const [name,mutate,pattern] of [
  ['missing handoff',f=>{f.jobsResponse.jobs[0].conclusion='skipped';},/HANDOFF_JOB/],
  ['missing exact closure step',f=>{f.jobsResponse.jobs[0].steps[0].conclusion='failure';},/HANDOFF_CLOSURE_STEP/],
  ['missing proof artifact',f=>{f.artifactsResponse.artifacts=[];f.artifactsResponse.total_count=0;},/PROOF_ARTIFACT/],
  ['foreign proof artifact source',f=>{f.artifactsResponse.artifacts[0].workflow_run.head_sha='c'.repeat(40);},/PROOF_ARTIFACT/],
  ['wrong source workflow path',f=>{f.event.workflow_run.path='other.yml';},/UPSTREAM_BINDING/],
  ['non-success gate',f=>{f.event.workflow_run.conclusion='failure';},/UPSTREAM_BINDING/],
])test(name+' fails closed before credentials',()=>{const f=fixture();mutate(f);assert.throws(()=>verifyTerminalRecoveryProofAdmission(f),pattern);});
