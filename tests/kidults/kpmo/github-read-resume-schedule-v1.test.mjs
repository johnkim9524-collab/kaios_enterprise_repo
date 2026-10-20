import test from 'node:test';
import assert from 'node:assert/strict';
import {createGithubReadResumeScheduleRequest,verifyGithubReadResumeScheduleReadback} from '../../../scripts/kidults/kpmo/lib/github-read-resume-schedule-v1.mjs';

const binding={run_id:'4321',run_attempt:2,source_sha:'a'.repeat(40),artifact_id:789,artifact_digest:`sha256:${'b'.repeat(64)}`,
  producer_workflow_path:'.github/workflows/kidults-autonomous-kpmo-authorization-v1.yml',
  producer_event:'workflow_run',producer_conclusion:'failure'};
const checkpointDigests=['c'.repeat(64),'d'.repeat(64)];
const now=Date.parse('2026-10-12T10:01:00.000Z'),resumeAt=Date.parse('2026-10-12T10:20:00.100Z');

test('builds a deterministic one-time schedule bound to original run, artifact and checkpoints',()=>{
  const first=createGithubReadResumeScheduleRequest({binding,resumeAt,checkpointDigests,now});
  const second=createGithubReadResumeScheduleRequest({binding,resumeAt,checkpointDigests:[...checkpointDigests].reverse(),now});
  assert.deepEqual(first,second);
  assert.match(first.name,/^kidults-read-resume-[a-f0-9]{40}$/);
  assert.equal(first.scheduleExpression,'at(2026-10-12T10:20:01)');
  assert.equal(first.input.resume_binding.run_id,'4321');
  assert.deepEqual(first.input.checkpoint_digests,[...checkpointDigests].sort());
  assert.equal(Object.hasOwn(first.input,'nonce'),false);
  assert.equal(first.input.schedule_id,first.name);
});

test('rounds a subsecond reservation forward and requires exact physical schedule readback',()=>{
  const request=createGithubReadResumeScheduleRequest({binding,resumeAt,checkpointDigests,now});
  const actual={Name:request.name,GroupName:'default',State:'ENABLED',ScheduleExpression:request.scheduleExpression,
    ScheduleExpressionTimezone:'UTC',ActionAfterCompletion:'DELETE',FlexibleTimeWindow:{Mode:'OFF'},
    Target:{Arn:request.dispatcherArn,RoleArn:request.schedulerRoleArn,Input:JSON.stringify(request.input)}};
  const receipt=verifyGithubReadResumeScheduleReadback(request,actual);
  assert.equal(receipt.state,'RESUME_SCHEDULED');
  assert.throws(()=>verifyGithubReadResumeScheduleReadback(request,{...actual,State:'DISABLED'}),/READBACK/);
  assert.throws(()=>verifyGithubReadResumeScheduleReadback(request,{...actual,Target:{...actual.Target,Input:'{}'}}),/READBACK/);
});

test('accepts an exact push producer for the same bounded one-time schedule operation',()=>{
  const request=createGithubReadResumeScheduleRequest({binding:{...binding,producer_event:'push'},resumeAt,checkpointDigests,now});
  assert.equal(request.input.resume_binding.producer_event,'push');
  assert.equal(request.input.slot,'READ_RESUME');
  assert.equal(request.input.source,'aws.scheduler');
});

test('accepts a failed scheduled Assurance producer only under its exact workflow path',()=>{
  const assurancePath='.github/workflows/kidults-platform-continuous-assurance-v1.yml';
  const request=createGithubReadResumeScheduleRequest({binding:{...binding,producer_workflow_path:assurancePath,
    producer_event:'schedule',producer_conclusion:'failure'},resumeAt,checkpointDigests,now});
  assert.equal(request.input.resume_binding.producer_workflow_path,assurancePath);
  assert.equal(request.input.resume_binding.producer_event,'schedule');
  assert.throws(()=>createGithubReadResumeScheduleRequest({binding:{...binding,producer_event:'schedule'},resumeAt,checkpointDigests,now}),/BINDING/);
  assert.throws(()=>createGithubReadResumeScheduleRequest({binding:{...binding,producer_workflow_path:assurancePath,
    producer_event:'schedule',producer_conclusion:'success'},resumeAt,checkpointDigests,now}),/BINDING/);
});

test('rejects malformed or already-due schedule requests',()=>{
  assert.throws(()=>createGithubReadResumeScheduleRequest({binding:{...binding,source_sha:'x'},resumeAt,checkpointDigests,now}),/BINDING/);
  assert.throws(()=>createGithubReadResumeScheduleRequest({binding,resumeAt:now,checkpointDigests,now}),/TIME/);
  assert.throws(()=>createGithubReadResumeScheduleRequest({binding,resumeAt,checkpointDigests:['bad'],now}),/CHECKPOINT_DIGESTS/);
});
