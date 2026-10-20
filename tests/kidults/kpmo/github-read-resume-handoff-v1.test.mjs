import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {canonicalJson,sha256} from '../../../scripts/kidults/kpmo/lib/canonical-json-v1.mjs';
import {consumeGithubReadResumeHandoff} from '../../../scripts/kidults/kpmo/lib/github-read-resume-handoff-v1.mjs';
import {readResumeCheckpoint} from '../../../scripts/kidults/kpmo/lib/github-rate-aware-read-v1.mjs';

const sourceSha='a'.repeat(40),runId=4321,attempt=2,artifactDigest='sha256:'+'b'.repeat(64),archiveBytes=Buffer.from('bounded-zip-fixture');
const workflowPath='.github/workflows/kidults-autonomous-kpmo-authorization-v1.yml';
const route=`/repos/johnkim9524-collab/kaios_enterprise_repo/actions/runs/${runId}/attempts/${attempt}/jobs?per_page=100`;
const checkpoint=readResumeCheckpoint({binding:{root_mission:'AUTONOMOUS_NORMAL_OPERATIONS_CLOSURE_MISSION',source_sha:sourceSha,
  run_id:String(runId),run_attempt:attempt},route,diagnostic:null,resumeAt:Date.parse('2026-10-12T10:00:00.000Z'),attempts:2,reason:'HTTP_RATE_LIMIT'});
const run={id:runId,run_attempt:attempt,head_sha:sourceSha,head_branch:'main',event:'workflow_run',path:`${workflowPath}@main`,status:'completed',conclusion:'success',
  repository:{full_name:'johnkim9524-collab/kaios_enterprise_repo',id:1281328888}};
const artifact={id:789,name:`kidults-github-read-resume-kpmo-${runId}-${attempt}`,expired:false,digest:artifactDigest,
  size_in_bytes:archiveBytes.length,expires_at:'2026-10-13T00:00:00.000Z',workflow_run:{id:runId,head_sha:sourceSha,repository_id:1281328888}};
const event={action:'completed',workflow_run:{...run}};
delete event.workflow_run.path;

function fixture({checkpointValue=checkpoint,artifactValue=artifact,trigger=run,now=()=>Date.parse('2026-10-12T10:01:00.000Z')}={}){
  const calls=[];
  const readJson=async route=>{
    calls.push(route);
    if(route===`actions/runs/${runId}`)return trigger;
    if(route===`actions/runs/${runId}/artifacts?per_page=100`)return {total_count:1,artifacts:[artifactValue]};
    if(route===`actions/artifacts/${artifact.id}`)return artifactValue;
    if(route===routeForCheckpoint(checkpointValue))return {id:runId,run_attempt:attempt};
    throw Error(`UNEXPECTED_ROUTE:${route}`);
  };
  return {calls,now,readJson};
}
function routeForCheckpoint(value){return value.unfinished_operation.route.replace('/repos/johnkim9524-collab/kaios_enterprise_repo/','');}
function packetFor(...values){return {members:[{encoding:'utf-8',name:'checkpoints.jsonl',text:values.map(value=>JSON.stringify(value)).join('\n')+'\n'}]};}

test('naturally triggered artifact is read back, bounded, digest-checked and resumed once through GET',async()=>{
  const f=fixture();let archiveReads=0;
  const result=await consumeGithubReadResumeHandoff({event,readJson:f.readJson,now:f.now,
    readArchiveBytes:async route=>{archiveReads++;assert.equal(route,`actions/artifacts/${artifact.id}/zip`);return archiveBytes;},
    archiveReader:(bytes,digest)=>{assert.deepEqual(bytes,archiveBytes);assert.equal(digest,artifactDigest);return packetFor(checkpoint);}});
  assert.equal(result.state,'READ_ONLY_CHECKPOINT_RESUMED');assert.equal(result.actual_authority_granted,false);
  assert.equal(result.method,'GET');assert.equal(result.route_count,1);assert.equal(archiveReads,1);assert.equal(f.calls.at(-1),routeForCheckpoint(checkpoint));
});

test('an artifact unrelated to the exact triggering run fails before archive access',async()=>{
  const f=fixture({trigger:{...run,head_sha:'c'.repeat(40)}});let downloads=0;
  await assert.rejects(consumeGithubReadResumeHandoff({event,readJson:f.readJson,readArchiveBytes:async()=>{downloads++;return archiveBytes;},archiveReader:()=>packetFor(checkpoint),now:f.now}),/RUN_READBACK/);
  assert.equal(downloads,0);
});

test('an Assurance producer checkpoint is admitted under its exact workflow identity',async()=>{
  const assurancePath='.github/workflows/kidults-platform-continuous-assurance-v1.yml';
  const assuranceRun={...run,path:`${assurancePath}@refs/heads/main`};
  const assuranceArtifact={...artifact,name:`kidults-github-read-resume-assurance-${runId}-${attempt}`,
    workflow_run:{...artifact.workflow_run}};
  const assuranceEvent={action:'completed',workflow_run:{...run,path:undefined}};
  delete assuranceEvent.workflow_run.path;
  const readJson=async value=>value===`actions/runs/${runId}`?assuranceRun:
    value===`actions/runs/${runId}/artifacts?per_page=100`?{total_count:1,artifacts:[assuranceArtifact]}:
    value===`actions/artifacts/${artifact.id}`?assuranceArtifact:
    value===routeForCheckpoint(checkpoint)?{id:runId,run_attempt:attempt}:null;
  const result=await consumeGithubReadResumeHandoff({event:assuranceEvent,readJson,now:()=>Date.parse('2026-10-12T10:01:00.000Z'),
    readArchiveBytes:async()=>archiveBytes,archiveReader:()=>packetFor(checkpoint)});
  assert.equal(result.state,'READ_ONLY_CHECKPOINT_RESUMED');
});

test('a failed scheduled Assurance checkpoint is admitted under its exact workflow identity',async()=>{
  const assurancePath='.github/workflows/kidults-platform-continuous-assurance-v1.yml';
  const assuranceRun={...run,event:'schedule',conclusion:'failure',path:`${assurancePath}@refs/heads/main`};
  const assuranceArtifact={...artifact,name:`kidults-github-read-resume-assurance-${runId}-${attempt}`,
    workflow_run:{...artifact.workflow_run}};
  const assuranceEvent={action:'completed',workflow_run:{...run,event:'schedule',conclusion:'failure'}};
  delete assuranceEvent.workflow_run.path;
  const readJson=async value=>value===`actions/runs/${runId}`?assuranceRun:
    value===`actions/runs/${runId}/artifacts?per_page=100`?{total_count:1,artifacts:[assuranceArtifact]}:
    value===`actions/artifacts/${artifact.id}`?assuranceArtifact:
    value===routeForCheckpoint(checkpoint)?{id:runId,run_attempt:attempt}:null;
  const result=await consumeGithubReadResumeHandoff({event:assuranceEvent,readJson,now:()=>Date.parse('2026-10-12T10:01:00.000Z'),
    readArchiveBytes:async()=>archiveBytes,archiveReader:()=>packetFor(checkpoint)});
  assert.equal(result.state,'READ_ONLY_CHECKPOINT_RESUMED');
  assert.equal(result.actual_authority_granted,false);
});

test('an exact protected-main push producer is admitted for read-only checkpoint recovery',async()=>{
  const pushRun={...run,event:'push'};
  const pushEvent={action:'completed',workflow_run:{...pushRun}};
  delete pushEvent.workflow_run.path;
  const f=fixture({trigger:pushRun});
  const result=await consumeGithubReadResumeHandoff({event:pushEvent,readJson:f.readJson,readArchiveBytes:async()=>archiveBytes,
    archiveReader:(bytes,digest)=>{assert.equal(digest,artifactDigest);return packetFor(checkpoint);},now:f.now});
  assert.equal(result.state,'READ_ONLY_CHECKPOINT_RESUMED');
  assert.equal(result.actual_authority_granted,false);
});

test('a scheduled non-Assurance producer is rejected before archive download',async()=>{
  const scheduledRun={...run,event:'schedule'};
  const scheduledEvent={action:'completed',workflow_run:{...scheduledRun}};
  delete scheduledEvent.workflow_run.path;
  const f=fixture({trigger:scheduledRun});
  let downloads=0;
  await assert.rejects(consumeGithubReadResumeHandoff({event:scheduledEvent,readJson:f.readJson,
    readArchiveBytes:async()=>{downloads++;return archiveBytes;},archiveReader:()=>packetFor(checkpoint),now:f.now}),/RUN_READBACK/);
  assert.equal(f.calls.length,1);
  assert.equal(downloads,0);
});

test('a future checkpoint outside the single bounded runner window is left deferred without route execution',async()=>{
  const future=readResumeCheckpoint({binding:{root_mission:'AUTONOMOUS_NORMAL_OPERATIONS_CLOSURE_MISSION',source_sha:sourceSha,
    run_id:String(runId),run_attempt:attempt},route,diagnostic:null,resumeAt:Date.parse('2026-10-12T10:20:00.000Z'),attempts:2,reason:'HTTP_RATE_LIMIT'});
  const f=fixture({checkpointValue:future,now:()=>Date.parse('2026-10-12T10:01:00.000Z')});
  const result=await consumeGithubReadResumeHandoff({event,readJson:f.readJson,readArchiveBytes:async()=>archiveBytes,
    archiveReader:(bytes,digest)=>{assert.equal(digest,artifactDigest);return packetFor(future);},now:f.now});
  assert.equal(result.state,'RESUME_DEFERRED_WINDOW');assert.equal(result.actual_authority_granted,false);
  assert.equal(f.calls.some(value=>value===routeForCheckpoint(future)),false);
});

test('a future checkpoint outside the runner window creates a bound wake-up and still performs no early GET',async()=>{
  const future=readResumeCheckpoint({binding:{root_mission:'AUTONOMOUS_NORMAL_OPERATIONS_CLOSURE_MISSION',source_sha:sourceSha,
    run_id:String(runId),run_attempt:attempt},route,diagnostic:null,resumeAt:Date.parse('2026-10-12T10:20:00.000Z'),attempts:2,reason:'HTTP_RATE_LIMIT'});
  const f=fixture({checkpointValue:future,now:()=>Date.parse('2026-10-12T10:01:00.000Z')});let scheduled;
  const result=await consumeGithubReadResumeHandoff({event,readJson:f.readJson,readArchiveBytes:async()=>archiveBytes,
    archiveReader:(bytes,digest)=>{assert.equal(digest,artifactDigest);return packetFor(future);},now:f.now,
    scheduleResume:async value=>{scheduled=value;return {state:'RESUME_SCHEDULED',schedule_name:'kidults-read-resume-'+ 'f'.repeat(40)};}});
  assert.equal(result.state,'RESUME_SCHEDULED');
  assert.equal(scheduled.binding.run_id,String(runId));assert.equal(scheduled.binding.artifact_id,artifact.id);
  assert.equal(scheduled.originalResumeAt,Date.parse(future.resume_at));
  assert.equal(scheduled.checkpointDigests.length,1);assert.match(scheduled.checkpointDigests[0],/^sha256:[a-f0-9]{64}$/);
  assert.equal(f.calls.some(value=>value===routeForCheckpoint(future)),false);
});

test('scheduled discovery only validates the checkpoint and enqueues one wake-up without consuming its GET',async()=>{
  const f=fixture({now:()=>Date.parse('2026-10-12T10:01:00.000Z')});let scheduled=null;
  const result=await consumeGithubReadResumeHandoff({event,readJson:f.readJson,readArchiveBytes:async()=>archiveBytes,
    archiveReader:(bytes,digest)=>{assert.equal(digest,artifactDigest);return packetFor(checkpoint);},now:f.now,scheduleOnly:true,
    scheduleResume:async request=>{scheduled=request;return {state:'RESUME_SCHEDULED',schedule_name:'kidults-read-resume-'+ 'f'.repeat(40)};}});
  assert.equal(result.state,'RESUME_SCHEDULED');assert.equal(result.reason,'SWEEP_HANDOFF');
  assert.equal(scheduled.binding.producer_workflow_path,workflowPath);
  assert.ok(scheduled.resumeAt>Date.parse('2026-10-12T10:01:00.000Z'));
  assert.equal(f.calls.some(value=>value===routeForCheckpoint(checkpoint)),false);
});

test('scheduled duplicate delivery revalidates original run and schedule binding before the resumed GET',async()=>{
  let current=Date.parse('2026-10-12T10:01:00.000Z');const f=fixture({now:()=>current});let reads=0;
  const digest=sha256(canonicalJson(checkpoint)).replace(/^sha256:/,'');
  const scheduleId=`kidults-read-resume-${'e'.repeat(40)}`;
  const scheduledEvent={action:'completed',workflow_run:{...run},resume_schedule:{source:'AWS_EVENTBRIDGE_SCHEDULER',slot:'READ_RESUME',
    dispatch_id:scheduleId,schedule_id:scheduleId,resume_binding:{run_id:String(runId),run_attempt:attempt,source_sha:sourceSha,
      artifact_id:artifact.id,artifact_digest:artifactDigest,producer_workflow_path:workflowPath,
      producer_event:'workflow_run',producer_conclusion:'success'},
    checkpoint_digests:[digest],resume_at:'2026-10-12T10:01:30.000Z'}};
  const result=await consumeGithubReadResumeHandoff({event:scheduledEvent,readJson:async value=>{
    if(value===routeForCheckpoint(checkpoint))assert.equal(current,Date.parse('2026-10-12T10:01:30.000Z'));
    const output=await f.readJson(value);if(value===routeForCheckpoint(checkpoint))reads++;return output;
  },readArchiveBytes:async()=>archiveBytes,archiveReader:()=>packetFor(checkpoint),now:()=>current,
  wait:async ms=>{current+=ms;}});
  assert.equal(result.state,'READ_ONLY_CHECKPOINT_RESUMED');assert.equal(reads,1);
});

test('a checkpoint inside the nominal wait window stays deferred when the workflow deadline is sooner',async()=>{
  const future=readResumeCheckpoint({binding:{root_mission:'AUTONOMOUS_NORMAL_OPERATIONS_CLOSURE_MISSION',source_sha:sourceSha,
    run_id:String(runId),run_attempt:attempt},route,diagnostic:null,resumeAt:Date.parse('2026-10-12T10:08:00.000Z'),attempts:2,reason:'HTTP_RATE_LIMIT'});
  const f=fixture({checkpointValue:future,now:()=>Date.parse('2026-10-12T10:01:00.000Z')});let waits=0;
  const result=await consumeGithubReadResumeHandoff({event,readJson:f.readJson,readArchiveBytes:async()=>archiveBytes,
    archiveReader:(bytes,digest)=>{assert.equal(digest,artifactDigest);return packetFor(future);},now:f.now,
    deadline:Date.parse('2026-10-12T10:04:00.000Z'),wait:async()=>{waits++;}});
  assert.equal(result.state,'RESUME_DEFERRED_WINDOW');assert.equal(result.actual_authority_granted,false);
  assert.equal(waits,0);assert.equal(f.calls.some(value=>value===routeForCheckpoint(future)),false);
});

test('scheduler oversleep cannot cross the absolute workflow deadline into another GET',async()=>{
  const due=Date.parse('2026-10-12T10:02:00.000Z');let current=Date.parse('2026-10-12T10:01:00.000Z');
  const lateCheckpoint=readResumeCheckpoint({binding:{root_mission:'AUTONOMOUS_NORMAL_OPERATIONS_CLOSURE_MISSION',source_sha:sourceSha,
    run_id:String(runId),run_attempt:attempt},route,diagnostic:null,resumeAt:due,attempts:1,reason:'HTTP_RATE_LIMIT'});
  const f=fixture({checkpointValue:lateCheckpoint,now:()=>current});
  const result=await consumeGithubReadResumeHandoff({event,readJson:f.readJson,readArchiveBytes:async()=>archiveBytes,
    archiveReader:(bytes,digest)=>{assert.equal(digest,artifactDigest);return packetFor(lateCheckpoint);},now:()=>current,
    deadline:Date.parse('2026-10-12T10:04:00.000Z'),wait:async()=>{current=Date.parse('2026-10-12T10:05:00.000Z');}});
  assert.equal(result.state,'RESUME_DEFERRED_WINDOW');
  assert.equal(f.calls.some(value=>value===routeForCheckpoint(lateCheckpoint)),false);
});

test('malformed scope is rejected before waiting or returning a deferred receipt',async()=>{
  const invalid={...checkpoint,actual_authority_granted:true};
  const f=fixture({checkpointValue:invalid});let waits=0;
  await assert.rejects(consumeGithubReadResumeHandoff({event,readJson:f.readJson,readArchiveBytes:async()=>archiveBytes,
    archiveReader:(bytes,digest)=>{assert.equal(digest,artifactDigest);return packetFor(invalid);},now:f.now,wait:async()=>{waits++;}}),/CHECKPOINT_SCOPE/);
  assert.equal(waits,0);assert.equal(f.calls.some(value=>value===routeForCheckpoint(checkpoint)),false);
});

test('no matching artifact returns a read-only no-checkpoint result',async()=>{
  const f=fixture();f.readJson=async route=>route===`actions/runs/${runId}`?run:
    route===`actions/runs/${runId}/artifacts?per_page=100`?{total_count:0,artifacts:[]}:null;
  const result=await consumeGithubReadResumeHandoff({event,readJson:f.readJson,readArchiveBytes:async()=>{throw Error('must-not-download');},now:f.now});
  assert.equal(result.state,'NO_CHECKPOINT_ARTIFACT');assert.equal(result.actual_authority_granted,false);
});

test('multiple distinct deferred routes are all validated before sequential bounded GETs; exact duplicate rows coalesce',async()=>{
  const secondRoute=`/repos/johnkim9524-collab/kaios_enterprise_repo/branches/main`;
  const second=readResumeCheckpoint({binding:{root_mission:'AUTONOMOUS_NORMAL_OPERATIONS_CLOSURE_MISSION',source_sha:sourceSha,
    run_id:String(runId),run_attempt:attempt},route:secondRoute,diagnostic:null,resumeAt:Date.parse('2026-10-12T10:00:00.000Z'),attempts:1,reason:'HTTP_RATE_LIMIT'});
  const f=fixture();let reads=0;
  const readJson=async value=>{
    if(value==='branches/main'){reads++;return {name:'main'};}
    return f.readJson(value);
  };
  const result=await consumeGithubReadResumeHandoff({event,readJson,readArchiveBytes:async()=>archiveBytes,
    archiveReader:(bytes,digest)=>{assert.equal(digest,artifactDigest);return packetFor(checkpoint,second,second);},now:f.now});
  assert.equal(result.state,'READ_ONLY_CHECKPOINTS_RESUMED');assert.equal(result.route_count,2);assert.equal(result.results.length,2);
  assert.equal(reads,1);assert.equal(result.actual_authority_granted,false);
});

test('same bound route with different checkpoint metadata coalesces to one GET at the latest resume time',async()=>{
  const later=readResumeCheckpoint({binding:{root_mission:'AUTONOMOUS_NORMAL_OPERATIONS_CLOSURE_MISSION',source_sha:sourceSha,
    run_id:String(runId),run_attempt:attempt},route,diagnostic:{status:403},resumeAt:Date.parse('2026-10-12T10:00:30.000Z'),attempts:3,reason:'HTTP_RATE_LIMIT'});
  let current=Date.parse('2026-10-12T10:00:00.000Z');let reads=0,waited=0;
  const f=fixture({now:()=>current});
  const readJson=async value=>{
    if(value===routeForCheckpoint(checkpoint)){reads++;return {id:runId,run_attempt:attempt};}
    return f.readJson(value);
  };
  const result=await consumeGithubReadResumeHandoff({event,readJson,readArchiveBytes:async()=>archiveBytes,
    archiveReader:()=>packetFor(checkpoint,later),now:f.now,wait:async ms=>{waited=ms;current+=ms;}});
  assert.equal(reads,1);assert.equal(waited,30000);
  assert.equal(result.state,'READ_ONLY_CHECKPOINT_RESUMED');
  assert.equal(result.coalesced_checkpoint_count,2);
  assert.equal(result.checkpoint_digest,sha256(canonicalJson(later)));
});

test('an explicitly bound artifact ZIP checkpoint resumes through bounded byte mode and verifies the pinned digest',async()=>{
  const zipBytes=Buffer.from('second bounded archive');
  const zipDigest=`sha256:${createHash('sha256').update(zipBytes).digest('hex')}`;
  const zipRoute='/repos/johnkim9524-collab/kaios_enterprise_repo/actions/artifacts/11700046124/zip';
  const zipCheckpoint=readResumeCheckpoint({binding:{root_mission:'AUTONOMOUS_NORMAL_OPERATIONS_CLOSURE_MISSION',source_sha:sourceSha,
    run_id:String(runId),run_attempt:attempt,original_artifact_id:11700046124,original_artifact_digest:zipDigest},
    route:zipRoute,diagnostic:null,resumeAt:Date.parse('2026-10-12T10:00:00.000Z'),attempts:1,reason:'HTTP_RATE_LIMIT'});
  const f=fixture();const archiveRoutes=[];
  const result=await consumeGithubReadResumeHandoff({event,readJson:f.readJson,readArchiveBytes:async route=>{
      archiveRoutes.push(route);return route==='actions/artifacts/789/zip'?archiveBytes:zipBytes;
    },archiveReader:(bytes,digest)=>{assert.equal(digest,artifactDigest);return packetFor(zipCheckpoint);},now:f.now});
  assert.equal(result.state,'READ_ONLY_CHECKPOINT_RESUMED');
  assert.deepEqual(archiveRoutes,['actions/artifacts/789/zip','actions/artifacts/11700046124/zip']);
  assert.deepEqual(result.value,{kind:'ARCHIVE_BYTES',size_bytes:zipBytes.length,digest:zipDigest});
});

test('real bounded ZIP bytes pass the canonical archive parser before the checkpoint GET',{
  skip:process.env.KIDULTS_ALLOW_ARCHIVE_SUBPROCESS_TESTS!=='1'?'sandbox blocks the parser child process; CI sets the opt-in':''
},async()=>{
  const bytes=Buffer.from('UEsDBBQAAAAAAFg4TV0etFEN0QIAANECAAARAAAAY2hlY2twb2ludHMuanNvbmx7ImlkIjoia2lkdWx0cy1naXRodWItcmVhZC1yZXN1bWUtY2hlY2twb2ludC12MSIsInZlcnNpb24iOiIxLjAuMCIsInN0YXRlIjoiUkVBRF9ERUZFUlJFRF9OT1RfQVVUSE9SSVRZIiwiYmluZGluZyI6eyJyb290X21pc3Npb24iOiJBVVRPTk9NT1VTX05PUk1BTF9PUEVSQVRJT05TX0NMT1NVUkVfTUlTU0lPTiIsInNvdXJjZV9zaGEiOiJhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhIiwicnVuX2lkIjoiNDMyMSIsInJ1bl9hdHRlbXB0IjoyfSwidW5maW5pc2hlZF9vcGVyYXRpb24iOnsibWV0aG9kIjoiR0VUIiwicm91dGUiOiIvcmVwb3Mvam9obmtpbTk1MjQtY29sbGFiL2thaW9zX2VudGVycHJpc2VfcmVwby9hY3Rpb25zL3J1bnMvNDMyMS9hdHRlbXB0cy8yL2pvYnM/cGVyX3BhZ2U9MTAwIn0sInJlYXNvbiI6IkhUVFBfUkFURV9MSU1JVCIsInJlc3VtZV9hdCI6IjIwMjYtMTAtMTJUMTA6MDA6MDAuMDAwWiIsImF0dGVtcHRzX3VzZWQiOjIsImh0dHBfZGlhZ25vc3RpYyI6bnVsbCwib3JpZ2luYWxfcmVzZXJ2YXRpb25fcHJlc2VydmVkIjp0cnVlLCJyZXNlcnZhdGlvbl93cml0ZV9wZXJmb3JtZWQiOmZhbHNlLCJwcm9kdWNlcl9mYWlsdXJlX2NsYWltZWQiOmZhbHNlLCJhY3R1YWxfYXV0aG9yaXR5X2dyYW50ZWQiOmZhbHNlLCJwcm9tb3Rpb25fZWxpZ2libGUiOmZhbHNlLCJtdXRhdGlvbl9yZXRyeV9hdXRob3JpemVkIjpmYWxzZX0KUEsBAhQDFAAAAAAAWDhNXR60UQ3RAgAA0QIAABEAAAAAAAAAAAAAAIABAAAAAGNoZWNrcG9pbnRzLmpzb25sUEsFBgAAAAABAAEAPwAAAAADAAAAAA==','base64');
  const digest='sha256:127a7c750a0e77f28cf1267660b6c5bb4aa2969656e170526c04418c86e7895b',realArtifact={...artifact,digest,size_in_bytes:bytes.length};
  const readJson=async route=>route===`actions/runs/${runId}`?run:
    route===`actions/runs/${runId}/artifacts?per_page=100`?{total_count:1,artifacts:[realArtifact]}:
    route===`actions/artifacts/${artifact.id}`?realArtifact:
    route===routeForCheckpoint(checkpoint)?{id:runId,run_attempt:attempt}:null;
  const result=await consumeGithubReadResumeHandoff({event,readJson,readArchiveBytes:async()=>bytes,now:()=>Date.parse('2026-10-12T10:01:00Z')});
  assert.equal(result.state,'READ_ONLY_CHECKPOINT_RESUMED');assert.equal(result.artifact_digest,digest);assert.equal(result.actual_authority_granted,false);
});
