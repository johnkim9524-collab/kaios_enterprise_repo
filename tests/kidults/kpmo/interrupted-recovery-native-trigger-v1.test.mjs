import {test} from 'node:test';
import assert from 'node:assert/strict';
import {verifyInterruptedRecoveryNativeTrigger} from '../../../scripts/kidults/kpmo/lib/interrupted-recovery-native-trigger-v1.mjs';
const repo='johnkim9524-collab/kaios_enterprise_repo',sha='a'.repeat(40);
function fixture(){
 const upstream={id:100,name:'KPMO Continuous Assurance Success Authority Gate V1',path:'.github/workflows/kpmo-continuous-assurance-success-authority-gate-v1.yml',event:'workflow_run',status:'completed',conclusion:'success',run_attempt:1,head_sha:sha,head_branch:'main',repository:{full_name:repo,id:1281328888}};
 const env={GITHUB_EVENT_NAME:'workflow_run',GITHUB_RUN_ATTEMPT:'1',GITHUB_REF:'refs/heads/main',GITHUB_REPOSITORY:repo,GITHUB_REPOSITORY_ID:'1281328888',GITHUB_SHA:sha,GITHUB_WORKFLOW_SHA:sha};
 const f={env,event:{action:'completed',workflow_run:upstream},live:structuredClone(upstream),jobs:{total_count:1,jobs:[{id:200,run_id:100,run_attempt:1,name:'success-authority-gate',status:'completed',conclusion:'success'}]},main:{name:'main',protected:true,commit:{sha}},calls:[]};
 f.get=async route=>{f.calls.push(route);return route==='branches/main'?f.main:route.includes('/jobs')?f.jobs:f.live;};return f;
}
test('existing natural Gate trigger requires actual authority success at exact attempt',async()=>{const f=fixture();assert.equal((await verifyInterruptedRecoveryNativeTrigger(f)).id,100);assert.deepEqual(f.calls,['actions/runs/100','actions/runs/100/attempts/1/jobs?per_page=100','branches/main']);});
for(const [name,mutate] of [
 ['manual',f=>f.env.GITHUB_EVENT_NAME='workflow_dispatch'],['rerun',f=>f.env.GITHUB_RUN_ATTEMPT='2'],
 ['upstream replay',f=>f.event.workflow_run.run_attempt=2],['borrowed source',f=>f.live.head_sha='b'.repeat(40)],
 ['skipped authority',f=>f.jobs.jobs[0].conclusion='skipped'],['missing authority',f=>{f.jobs.jobs=[];f.jobs.total_count=0;}],
 ['duplicate authority',f=>{f.jobs.jobs.push({...f.jobs.jobs[0],id:201});f.jobs.total_count=2;}],
 ['incomplete job pagination',f=>f.jobs.total_count=101],['unprotected main',f=>f.main.protected=false],['advanced main',f=>f.main.commit.sha='b'.repeat(40)]
])test('deny '+name,async()=>{const f=fixture();mutate(f);await assert.rejects(verifyInterruptedRecoveryNativeTrigger(f));});
test('Verifier completion starts a separate fourth run bound back to the same authenticated Gate',async()=>{
 const {execFileSync}=await import('node:child_process'),{createHash}=await import('node:crypto');
 const f=fixture(),gate=f.live,role={...gate,id:300,name:'KIDULTS Autonomous Independent Verification V1',path:'.github/workflows/kidults-autonomous-independent-verification-authorization-v1.yml',created_at:'2026-10-11T00:00:00Z',run_started_at:'2026-10-11T00:00:00Z'};
 f.event.workflow_run=role;
 const receipt={source_sha:sha,gate_run_id:100,role_run_id:'300',actual_candidates:1};
 const bytes=execFileSync('python3',['-c',"import io,sys,zipfile; b=io.BytesIO(); z=zipfile.ZipFile(b,'w',zipfile.ZIP_DEFLATED); z.writestr('interrupted-INDEPENDENT_VERIFIER.json',sys.stdin.read()); z.close(); sys.stdout.buffer.write(b.getvalue())"],{input:JSON.stringify(receipt)});
 const artifact={id:500,name:'kidults-postmerge-terminal-recovery-independent_verifier-300-1',expired:false,digest:'sha256:'+createHash('sha256').update(bytes).digest('hex'),size_in_bytes:bytes.length,workflow_run:{id:300,head_sha:sha},created_at:'2026-10-11T00:01:00Z',expires_at:'2027-01-01T00:00:00Z'};
 f.get=async route=>route==='actions/runs/300'?role:route==='actions/runs/300/attempts/1/jobs?per_page=100'?{total_count:1,jobs:[{id:301,run_id:300,run_attempt:1,name:'Bounded original reservation terminal recovery INDEPENDENT_VERIFIER',status:'completed',conclusion:'success',steps:[{name:'Run bounded signed terminal recovery workload',status:'completed',conclusion:'success'}]}]}:route==='actions/runs/300/artifacts?per_page=100'?{total_count:1,artifacts:[artifact]}:route==='actions/runs/100'?gate:route.includes('/jobs')?f.jobs:f.main;
 f.readBytes=async()=>bytes;
 assert.equal((await verifyInterruptedRecoveryNativeTrigger(f)).id,100);
 artifact.workflow_run.id=301;await assert.rejects(verifyInterruptedRecoveryNativeTrigger(f));
});
