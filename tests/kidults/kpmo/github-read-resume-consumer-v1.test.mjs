import test from 'node:test';
import assert from 'node:assert/strict';
import {consumeGithubReadResumeCheckpoint} from '../../../scripts/kidults/kpmo/lib/github-read-resume-consumer-v1.mjs';
import {readResumeCheckpoint} from '../../../scripts/kidults/kpmo/lib/github-rate-aware-read-v1.mjs';

const sha='a'.repeat(40),digest='sha256:'+'b'.repeat(64),runId=321;
const route=`/repos/johnkim9524-collab/kaios_enterprise_repo/actions/runs/${runId}/attempts/2/jobs?per_page=100`;
const checkpoint=readResumeCheckpoint({binding:{root_mission:'AUTONOMOUS_NORMAL_OPERATIONS_CLOSURE_MISSION',source_sha:sha,
 run_id:String(runId),run_attempt:2,parent_run_id:'987',parent_run_attempt:2},route,diagnostic:null,resumeAt:Date.parse('2026-10-12T10:00:00.000Z'),attempts:2,reason:'HTTP_RATE_LIMIT'});
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
 assert.equal(result.route_count,1);assert.equal(result.actual_authority_granted,false);assert.equal(result.reservation_write_performed,false);
});

test('resumes validated read routes including paginated compare continuation',async()=>{
 const sha2='c'.repeat(40);
 const routes=[
  '/repos/johnkim9524-collab/kaios_enterprise_repo/branches/main',
  '/repos/johnkim9524-collab/kaios_enterprise_repo/pulls/42',
  `/repos/johnkim9524-collab/kaios_enterprise_repo/git/commits/${sha2}`,
  `/repos/johnkim9524-collab/kaios_enterprise_repo/compare/${sha}...${sha2}`,
  `/repos/johnkim9524-collab/kaios_enterprise_repo/compare/${sha}...${sha2}?per_page=1&page=2`,
  '/repos/johnkim9524-collab/kaios_enterprise_repo/actions/workflows/kidults-autonomous-track-authorization-v1.yml/runs?branch=main&event=repository_dispatch&status=failure&per_page=100&page=2',
 ];
 for(const candidate of routes){
  const candidateCheckpoint={...checkpoint,unfinished_operation:{method:'GET',route:candidate}};
  const candidateLine=JSON.stringify(candidateCheckpoint);let calls=0;
  await consumeGithubReadResumeCheckpoint({...common,checkpoint:candidateCheckpoint,
   archiveReader:()=>({members:[{encoding:'utf-8',name:'checkpoints.jsonl',text:candidateLine+'\n'}]}),
   read:async value=>{calls++;assert.equal(value,candidate);return {ok:true};}});
  assert.equal(calls,1,candidate);
 }
});

test('resumes the bounded historical authorization and exact-SHA security run indexes',async()=>{
 const historyBinding={...checkpoint.binding,original_run_id:38132692877,original_run_attempt:1,
  original_artifact_id:11700046124,original_artifact_digest:digest};
 const historyArtifact={...artifact,expires_at:'2026-10-20T00:00:00.000Z'};
 const historyCommon={...common,artifact:historyArtifact,now:()=>Date.parse('2026-10-19T10:00:00.000Z')};
 const routes=[
  '/repos/johnkim9524-collab/kaios_enterprise_repo/actions/workflows/kidults-autonomous-track-authorization-v1.yml/runs?branch=main&created=2026-10-12T10%3A31%3A23.000Z..2026-10-13T10%3A23%3A51.000Z&per_page=25&page=35',
  '/repos/johnkim9524-collab/kaios_enterprise_repo/actions/workflows/kidults-autonomous-track-authorization-v1.yml/runs?branch=main&created=2026-10-12T10%3A31%3A23.000Z..2026-10-13T10%3A23%3A51.000Z&per_page=100&page=9',
  '/repos/johnkim9524-collab/kaios_enterprise_repo/actions/workflows/kidults-autonomous-track-authorization-v1.yml/runs?branch=main&created=2026-10-12T10%3A33%3A35.000Z..2026-10-13T10%3A28%3A15.000Z&per_page=25&page=26',
  `/repos/johnkim9524-collab/kaios_enterprise_repo/actions/workflows/kidults-security-assurance-empirical-r1.yml/runs?branch=main&head_sha=${sha}&created=2026-10-18T03%3A56%3A24.947Z..2026-10-19T09%3A56%3A24.947Z&per_page=25&page=1`,
 ];
 for(const candidate of routes){
  const candidateCheckpoint=readResumeCheckpoint({binding:historyBinding,route:candidate,diagnostic:null,
   resumeAt:Date.parse('2026-10-12T10:00:00.000Z'),attempts:2,reason:'INVOCATION_CALL_BUDGET'});
  const candidateLine=JSON.stringify(candidateCheckpoint);let calls=0;
  await consumeGithubReadResumeCheckpoint({...historyCommon,checkpoint:candidateCheckpoint,
   archiveReader:()=>({members:[{encoding:'utf-8',name:'checkpoints.jsonl',text:candidateLine+'\n'}]}),
   read:async value=>{calls++;assert.equal(value,candidate);return {ok:true};}});
  assert.equal(calls,1,candidate);
 }
});

test('keeps historical run-index resumes bounded to exact source and safe page windows',async()=>{
 const historyBinding={...checkpoint.binding,original_run_id:38132692877,original_run_attempt:1,
  original_artifact_id:11700046124,original_artifact_digest:digest};
 const historyArtifact={...artifact,expires_at:'2026-10-20T00:00:00.000Z'};
 const historyCommon={...common,artifact:historyArtifact,now:()=>Date.parse('2026-10-19T10:00:00.000Z')};
 const safeSecurity='/repos/johnkim9524-collab/kaios_enterprise_repo/actions/workflows/kidults-security-assurance-empirical-r1.yml/runs?branch=main&head_sha='+sha+'&created=2026-10-18T03%3A38%3A47.015Z..2026-10-19T09%3A38%3A47.015Z&per_page=25&page=1';
 const badRoutes=[
  safeSecurity.replace(`head_sha=${sha}`,`head_sha=${'c'.repeat(40)}`),
  safeSecurity.replace('page=1','page=101'),
  safeSecurity.replace('2026-10-18T03%3A38%3A47.015Z..2026-10-19T09%3A38%3A47.015Z','2026-09-01T00%3A00%3A00.000Z..2026-10-19T09%3A38%3A47.015Z'),
 ];
 for(const candidate of badRoutes){
  const candidateCheckpoint=readResumeCheckpoint({binding:historyBinding,route:candidate,diagnostic:null,
   resumeAt:Date.parse('2026-10-12T10:00:00.000Z'),attempts:2,reason:'INVOCATION_CALL_BUDGET'});
  const candidateLine=JSON.stringify(candidateCheckpoint);let calls=0;
  await assert.rejects(consumeGithubReadResumeCheckpoint({...historyCommon,checkpoint:candidateCheckpoint,
   archiveReader:()=>({members:[{encoding:'utf-8',name:'checkpoints.jsonl',text:candidateLine+'\n'}]}),
   read:async()=>{calls++;return {ok:true};}}),/GITHUB_RESUME_ROUTE_NOT_ALLOWLISTED/);
  assert.equal(calls,0,candidate);
 }
});

test('allows the checkpoint exact direct GET target while keeping it read-only',async()=>{
 const targetRoute='/repos/johnkim9524-collab/kaios_enterprise_repo/actions/runs/988';
 const targetCheckpoint={...checkpoint,unfinished_operation:{method:'GET',route:targetRoute}};
 const targetLine=JSON.stringify(targetCheckpoint);let calls=0;
 await consumeGithubReadResumeCheckpoint({...common,checkpoint:targetCheckpoint,
  archiveReader:()=>({members:[{encoding:'utf-8',name:'checkpoints.jsonl',text:targetLine+'\n'}]}),
  read:async value=>{calls++;assert.equal(value,targetRoute);return {id:988};}});
 assert.equal(calls,1);
});

test('allows a deferred artifact-list GET only after binding its exact run target',async()=>{
 const targetRoute='/repos/johnkim9524-collab/kaios_enterprise_repo/actions/runs/988/artifacts?per_page=100';
 const targetCheckpoint={...checkpoint,unfinished_operation:{method:'GET',route:targetRoute}};
 const targetLine=JSON.stringify(targetCheckpoint);let calls=0;
 await consumeGithubReadResumeCheckpoint({...common,checkpoint:targetCheckpoint,
  archiveReader:()=>({members:[{encoding:'utf-8',name:'checkpoints.jsonl',text:targetLine+'\n'}]}),
  read:async value=>{calls++;assert.equal(value,targetRoute);return {total_count:0,artifacts:[]};}});
 assert.equal(calls,1);
});

test('binds a distinct parent route to its recorded attempt',async()=>{
 const parentRoute='/repos/johnkim9524-collab/kaios_enterprise_repo/actions/runs/987/attempts/2/jobs?per_page=100';
 const parentCheckpoint={...checkpoint,unfinished_operation:{method:'GET',route:parentRoute}};
 const parentLine=JSON.stringify(parentCheckpoint);
 let calls=0;
 await consumeGithubReadResumeCheckpoint({...common,checkpoint:parentCheckpoint,
  archiveReader:()=>({members:[{encoding:'utf-8',name:'checkpoints.jsonl',text:parentLine+'\n'}]}),
  read:async value=>{calls++;assert.equal(value,parentRoute);return {id:987};}});
 assert.equal(calls,1);
});

test('binds an original run route to its recorded attempt',async()=>{
 const originalRoute='/repos/johnkim9524-collab/kaios_enterprise_repo/actions/runs/654/attempts/1/jobs?per_page=100';
 const originalCheckpoint={...checkpoint,binding:{...checkpoint.binding,original_run_id:'654',original_run_attempt:1},
  unfinished_operation:{method:'GET',route:originalRoute}};
 const originalLine=JSON.stringify(originalCheckpoint);let calls=0;
 await consumeGithubReadResumeCheckpoint({...common,checkpoint:originalCheckpoint,
  archiveReader:()=>({members:[{encoding:'utf-8',name:'checkpoints.jsonl',text:originalLine+'\n'}]}),
  read:async value=>{calls++;assert.equal(value,originalRoute);return {id:654};}});
 assert.equal(calls,1);
});

test('requires an explicit safe parent attempt in the checkpoint',()=>{
 assert.throws(()=>readResumeCheckpoint({binding:{root_mission:'AUTONOMOUS_NORMAL_OPERATIONS_CLOSURE_MISSION',source_sha:sha,
  run_id:String(runId),run_attempt:2,parent_run_id:'987'},route,diagnostic:null,resumeAt:Date.parse('2026-10-12T10:00:00.000Z'),
  attempts:2,reason:'HTTP_RATE_LIMIT'}),/RESUME_BINDING/);
});

test('requires an explicit original attempt in the checkpoint',()=>{
 assert.throws(()=>readResumeCheckpoint({binding:{root_mission:'AUTONOMOUS_NORMAL_OPERATIONS_CLOSURE_MISSION',source_sha:sha,
  run_id:String(runId),run_attempt:2,original_run_id:'654'},route,diagnostic:null,resumeAt:Date.parse('2026-10-12T10:00:00.000Z'),
  attempts:2,reason:'HTTP_RATE_LIMIT'}),/RESUME_BINDING/);
});

for(const [name,mutate,code] of [
 ['run attempt mismatch',x=>x.run={...run,run_attempt:1},'NATIVE_RUN_BINDING'],
 ['route attempt mismatch',x=>x.checkpoint={...checkpoint,unfinished_operation:{method:'GET',route:route.replace('/attempts/2/','/attempts/1/')}},'ROUTE_TARGET_ATTEMPT'],
 ['parent route attempt mismatch',x=>x.checkpoint={...checkpoint,unfinished_operation:{method:'GET',route:route.replace(`/runs/${runId}/`,`/runs/987/`).replace('/attempts/2/','/attempts/1/')}},'ROUTE_TARGET_ATTEMPT'],
 ['checkpoint scope drift',x=>x.checkpoint={...checkpoint,reservation_write_performed:true},'CHECKPOINT_SCOPE'],
 ['parent attempt zero',x=>x.checkpoint={...checkpoint,binding:{...checkpoint.binding,parent_run_attempt:0}},'CHECKPOINT_PARENT_ATTEMPT'],
 ['parent attempt above maximum',x=>x.checkpoint={...checkpoint,binding:{...checkpoint.binding,parent_run_attempt:101}},'CHECKPOINT_PARENT_ATTEMPT'],
 ['parent attempt 999 route',x=>x.checkpoint={...checkpoint,binding:{...checkpoint.binding,parent_run_attempt:999},unfinished_operation:{method:'GET',route:route.replace(`/runs/${runId}/`,`/runs/987/`).replace('/attempts/2/','/attempts/999/')}},'CHECKPOINT_PARENT_ATTEMPT'],
 ['original attempt above maximum',x=>x.checkpoint={...checkpoint,binding:{...checkpoint.binding,original_run_id:'654',original_run_attempt:101}},'CHECKPOINT_ORIGINAL_ATTEMPT'],
 ['original route attempt mismatch',x=>x.checkpoint={...checkpoint,binding:{...checkpoint.binding,original_run_id:'654',original_run_attempt:1},unfinished_operation:{method:'GET',route:route.replace(`/runs/${runId}/`,`/runs/654/`)}},'ROUTE_TARGET_ATTEMPT'],
 ['route attempt above maximum',x=>x.checkpoint={...checkpoint,unfinished_operation:{method:'GET',route:route.replace('/attempts/2/','/attempts/101/')}},'ROUTE_NOT_ALLOWLISTED'],
 ['original attempt zero',x=>x.checkpoint={...checkpoint,binding:{...checkpoint.binding,original_run_id:'654',original_run_attempt:0}},'CHECKPOINT_ORIGINAL_ATTEMPT'],
 ['source sha mismatch',x=>x.checkpoint={...checkpoint,binding:{...checkpoint.binding,source_sha:'c'.repeat(40)}},'CHECKPOINT_EXPECTED_BINDING'],
 ['artifact digest mismatch',x=>x.artifact={...artifact,digest:'sha256:'+'c'.repeat(64)},'ARTIFACT_BINDING'],
 ['unbound route run target',x=>x.checkpoint={...checkpoint,unfinished_operation:{method:'GET',route:route.replace(`/runs/${runId}/`,`/runs/988/`)},binding:{...checkpoint.binding,parent_run_id:'987'}},'ROUTE_TARGET_RUN'],
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
