import test from 'node:test';
import assert from 'node:assert/strict';
import {consumeGithubReadResumeCheckpoint} from '../../../scripts/kidults/kpmo/lib/github-read-resume-consumer-v1.mjs';
import {readResumeCheckpoint} from '../../../scripts/kidults/kpmo/lib/github-rate-aware-read-v1.mjs';

const sha='a'.repeat(40),digest='sha256:'+'b'.repeat(64),runId=321;
const route='/repos/johnkim9524-collab/kaios_enterprise_repo/actions/runs/987/attempts/1/jobs?per_page=100';
const checkpoint=readResumeCheckpoint({binding:{root_mission:'AUTONOMOUS_NORMAL_OPERATIONS_CLOSURE_MISSION',source_sha:sha,
 run_id:String(runId),run_attempt:2},route,diagnostic:null,resumeAt:Date.parse('2026-10-12T10:00:00.000Z'),attempts:2,reason:'HTTP_RATE_LIMIT'});
const run={id:runId,run_attempt:2,head_sha:sha,head_branch:'main',event:'repository_dispatch',path:'.github/workflows/kidults-autonomous-kpmo-authorization-v1.yml',
 repository:{full_name:'johnkim9524-collab/kaios_enterprise_repo',id:1281328888}};
const line=JSON.stringify(checkpoint),archiveBytes=Buffer.from('zip');
const artifact={id:901,name:`kidults-github-read-resume-kpmo-${runId}-2`,expired:false,digest,size_in_bytes:archiveBytes.length,expires_at:'2026-10-13T00:00:00.000Z',
 workflow_run:{id:runId,head_sha:sha,repository_id:1281328888}};
const expected={source_sha:sha,run_id:runId,run_attempt:2,workflow_path:run.path,artifact_id:artifact.id,artifact_digest:digest};
const common={checkpoint,run,artifact,archiveBytes,expected,now:()=>Date.parse('2026-10-12T10:01:00Z'),
 archiveReader:(bytes,actualDigest)=>{assert.deepEqual(bytes,archiveBytes);assert.equal(actualDigest,digest);return {members:[{encoding:'utf-8',name:'checkpoints.jsonl',text:line+'\n'}]};}};

test('verifies the exact run, artifact bytes, resume time and GET route before one read',async()=>{
 let calls=0;const result=await consumeGithubReadResumeCheckpoint({...common,read:async value=>{calls++;assert.equal(value,route);return {id:runId};}});
 assert.equal(calls,1);assert.equal(result.state,'READ_ONLY_CHECKPOINT_RESUMED');assert.equal(result.value.id,runId);
 assert.equal(result.actual_authority_granted,false);assert.equal(result.reservation_write_performed,false);
});

for(const [name,mutate,code] of [
 ['run attempt mismatch',x=>x.run={...run,run_attempt:1},'NATIVE_RUN_BINDING'],
 ['source sha mismatch',x=>x.checkpoint={...checkpoint,binding:{...checkpoint.binding,source_sha:'c'.repeat(40)}},'CHECKPOINT_EXPECTED_BINDING'],
 ['artifact digest mismatch',x=>x.artifact={...artifact,digest:'sha256:'+'c'.repeat(64)},'ARTIFACT_BINDING'],
 ['expired artifact',x=>x.artifact={...artifact,expired:true},'ARTIFACT_BINDING'],
 ['resume too early',x=>x.now=()=>Date.parse('2026-10-12T09:59:59Z'),'RESUME_NOT_DUE'],
 ['route traversal',x=>x.checkpoint={...checkpoint,unfinished_operation:{method:'GET',route:`${route}/../../contents`}},'ROUTE_NOT_ALLOWLISTED'],
 ['write operation',x=>x.checkpoint={...checkpoint,unfinished_operation:{method:'PUT',route}},'METHOD'],
 ['artifact duplicate member',x=>x.archiveReader=()=>({members:[{encoding:'utf-8',name:'checkpoints.jsonl',text:line},{encoding:'utf-8',name:'checkpoints.jsonl',text:line}]}),'CHECKPOINT_MEMBER_CARDINALITY'],
]) test(`fails closed on ${name}`,async()=>{
 const input={...common};mutate(input);let calls=0;
 if(name!=='artifact duplicate member')input.archiveReader=()=>({members:[{encoding:'utf-8',name:'checkpoints.jsonl',text:JSON.stringify(input.checkpoint)+'\n'}]});
 await assert.rejects(consumeGithubReadResumeCheckpoint({...input,read:async()=>{calls++;}}),new RegExp(`GITHUB_RESUME_${code}`));
 assert.equal(calls,0);
});
