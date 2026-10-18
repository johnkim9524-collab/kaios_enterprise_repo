import crypto from 'node:crypto';
const fail=(code)=>{throw new Error('ASSURANCE_COMPLETION_'+code);};
const stepSucceeded=(job,name)=>{
  const matches=Array.isArray(job?.steps)?job.steps.filter(step=>step?.name===name):[];
  return matches.length===1&&matches[0].conclusion==='success';
};
function assertExactCoverageContinuation({run,jobs,audit}){
  if(run?.event!=='workflow_dispatch')return;
  if(run?.actor?.login!=='github-actions[bot]')fail('WORKFLOW_DISPATCH_ACTOR');
  const classifiers=jobs.filter(job=>job.name==='classify-canonical-identity');
  if(classifiers.length!==1||classifiers[0].conclusion!=='success'
    ||!stepSucceeded(classifiers[0],'Validate and consume forwarded exact Coverage continuation')
    ||!stepSucceeded(classifiers[0],'Retain one-time Coverage continuation consumption receipt')){
    fail('WORKFLOW_DISPATCH_COVERAGE_CONSUMPTION');
  }
  if(!stepSucceeded(audit,'Enforce Sentinel terminal before Assurance')
    ||!stepSucceeded(audit,'Restore verified one-time Coverage continuation consumption')
    ||!stepSucceeded(audit,'Verify restored Coverage continuation consumption')){
    fail('WORKFLOW_DISPATCH_AUDIT_BINDING');
  }
}
export function classifyAssuranceCompletion({run,jobs,expected}){
  if(!expected||!/^[a-f0-9]{40}$/.test(expected.sha)||!Number.isSafeInteger(expected.run_id)||!Number.isSafeInteger(expected.run_attempt)) fail('EXPECTED_BINDING');
  if(run?.repository?.full_name!==expected.repository||run?.head_repository?.full_name!==expected.repository||run?.head_branch!=='main'||run?.name!=='KIDULTS Platform Continuous Assurance V1'||run?.path!=='.github/workflows/kidults-platform-continuous-assurance-v1.yml'||run?.head_sha!==expected.sha||run?.id!==expected.run_id||run?.run_attempt!==expected.run_attempt||run?.status!=='completed'||run?.conclusion!=='success') fail('RUN_BINDING');
  if(!Array.isArray(jobs)||!jobs.length||jobs.length>1000) fail('JOBS_SHAPE');
  if(new Set(jobs.map(j=>j.id)).size!==jobs.length) fail('DUPLICATE_JOB');
  for(const j of jobs) if(!Number.isSafeInteger(j.id)||j.run_id!==run.id||j.run_attempt!==run.run_attempt||j.head_sha!==run.head_sha||j.status!=='completed') fail('JOB_BINDING');
  const audits=jobs.filter(j=>j.name==='audit');
  if(audits.length!==1) fail('AUDIT_CARDINALITY');
  const audit=audits[0];
  if(!['workflow_run','repository_dispatch','workflow_dispatch'].includes(run.event))fail('EVENT_UNSUPPORTED');
  assertExactCoverageContinuation({run,jobs,audit});
  let disposition;
  if(audit.conclusion==='success') disposition='FULL_AUDIT_REQUIRES_AUTHORITY_GATE';
  else if(audit.conclusion==='skipped'){
    const classifiers=jobs.filter(j=>j.name==='classify-canonical-identity');
    if(classifiers.length!==1||classifiers[0].conclusion!=='success') fail('CLASSIFICATION_NOT_VERIFIED');
    if(jobs.some(j=>!['success','skipped'].includes(j.conclusion))) fail('NON_SUCCESS_JOB');
    disposition='CLASSIFICATION_ONLY_NON_AUTHORIZING';
  }else fail('AUDIT_NON_SUCCESS');
  const body={receipt_id:'kidults-assurance-completion-disposition-v1',version:'1.0.0',state:'VERIFIED_PASS',
    repository:expected.repository,source_sha:run.head_sha,run_id:run.id,run_attempt:run.run_attempt,
    event:run.event,audit_job_id:audit.id,audit_conclusion:audit.conclusion,disposition,
    eligible_full_audit:audit.conclusion==='success',authority_granted:false,whole_platform_runtime_proven:false,
    production:'HOLD',public:'HOLD',g5:'HOLD'};
  return {...body,receipt_digest:'sha256:'+crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex')};
}
