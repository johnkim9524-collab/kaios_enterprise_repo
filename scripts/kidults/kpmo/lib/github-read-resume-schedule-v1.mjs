// Schedule requests are constrained to one-time, deterministic read-resume wakes.
import {createHash} from 'node:crypto';
import {canonicalJson} from './canonical-json-v1.mjs';

const check=(ok,code)=>{if(!ok)throw Error(`GITHUB_RESUME_SCHEDULE_${code}`);};
const REPO='johnkim9524-collab/kaios_enterprise_repo';
const DISPATCHER_ARN='arn:aws:lambda:ap-northeast-2:528314240275:function:kidults-natural-clock-dispatcher-staging-v1';
const SCHEDULER_ROLE_ARN='arn:aws:iam::528314240275:role/kidults-natural-clock-scheduler-staging-v1';

export function createGithubReadResumeScheduleRequest({binding,resumeAt,checkpointDigests,now=Date.now(),
  dispatcherArn=DISPATCHER_ARN,schedulerRoleArn=SCHEDULER_ROLE_ARN}){
  check(binding&&/^[1-9][0-9]{0,19}$/.test(String(binding.run_id))&&Number.isSafeInteger(binding.run_attempt)
    &&binding.run_attempt>=1&&binding.run_attempt<=100&&/^[a-f0-9]{40}$/.test(binding.source_sha||'')
    &&Number.isSafeInteger(binding.artifact_id)&&binding.artifact_id>0&&/^sha256:[a-f0-9]{64}$/.test(binding.artifact_digest||'')
    &&['workflow_run','repository_dispatch'].includes(binding.producer_event)
    &&['failure','success'].includes(binding.producer_conclusion),'BINDING');
  check(Number.isSafeInteger(resumeAt)&&resumeAt>now&&Number.isSafeInteger(now),'TIME');
  check(Array.isArray(checkpointDigests)&&checkpointDigests.length>=1&&checkpointDigests.length<=8
    &&checkpointDigests.every(value=>/^(?:sha256:)?[a-f0-9]{64}$/.test(value)),'CHECKPOINT_DIGESTS');
  check(dispatcherArn===DISPATCHER_ARN&&schedulerRoleArn===SCHEDULER_ROLE_ARN,'TARGET');
  const scheduledAt=Math.ceil(resumeAt/1000)*1000;
  const exactBinding={run_id:String(binding.run_id),run_attempt:binding.run_attempt,source_sha:binding.source_sha,
    artifact_id:binding.artifact_id,artifact_digest:binding.artifact_digest,producer_event:binding.producer_event,
    producer_conclusion:binding.producer_conclusion};
  const checkpoint_digests=[...new Set(checkpointDigests.map(value=>value.replace(/^sha256:/,'')))].sort();
  const identityHex=createHash('sha256').update(canonicalJson({repo:REPO,binding:exactBinding,
    checkpoint_digests,scheduled_at:scheduledAt})).digest('hex');
  const identity=`sha256:${identityHex}`;
  const name=`kidults-read-resume-${identityHex.slice(0,40)}`;
  const clientToken=createHash('sha256').update(`scheduler-client:${identityHex}`).digest('hex').slice(0,64);
  const input={source:'aws.scheduler',slot:'READ_RESUME',resume_binding:exactBinding,checkpoint_digests,
    resume_at:new Date(scheduledAt).toISOString(),schedule_id:name};
  const scheduleExpression=`at(${new Date(scheduledAt).toISOString().replace(/\.\d{3}Z$/,'')})`;
  return {name,clientToken,scheduleExpression,scheduledAt,input,dispatcherArn,schedulerRoleArn,
    scheduleArn:`arn:aws:scheduler:ap-northeast-2:528314240275:schedule/default/${name}`,
    identity_digest:identity};
}

export function verifyGithubReadResumeScheduleReadback(request,actual){
  check(actual&&actual.Name===request.name&&actual.GroupName==='default'&&actual.State==='ENABLED'
    &&actual.ScheduleExpression===request.scheduleExpression&&actual.ScheduleExpressionTimezone==='UTC'
    &&actual.ActionAfterCompletion==='DELETE'&&actual.FlexibleTimeWindow?.Mode==='OFF'
    &&actual.Target?.Arn===request.dispatcherArn&&actual.Target?.RoleArn===request.schedulerRoleArn
    &&actual.Target?.Input===JSON.stringify(request.input),'READBACK');
  return {state:'RESUME_SCHEDULED',schedule_name:request.name,schedule_arn:request.scheduleArn,
    resume_at:new Date(request.scheduledAt).toISOString(),identity_digest:request.identity_digest,
    read_only:true,actual_authority_granted:false};
}
