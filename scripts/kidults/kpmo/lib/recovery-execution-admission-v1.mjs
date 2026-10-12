// Cost admission only: a positive result grants no recovery or consumption authority.
const repository='johnkim9524-collab/kaios_enterprise_repo';
const gate='KPMO Continuous Assurance Success Authority Gate V1';
const assurance='KIDULTS Platform Continuous Assurance V1';
const paths={ [gate]:'.github/workflows/kpmo-continuous-assurance-success-authority-gate-v1.yml',
  [assurance]:'.github/workflows/kidults-platform-continuous-assurance-v1.yml' };
const check=(ok,code)=>{if(!ok)throw Error('RECOVERY_ADMISSION_'+code);};
export async function recoveryExecutionAdmission({env,event,get}){
  check(env.GITHUB_ACTIONS==='true'&&env.GITHUB_EVENT_NAME==='workflow_run'
    &&/^[1-9][0-9]{0,2}$/.test(env.GITHUB_RUN_ATTEMPT||'')
    &&env.GITHUB_REF==='refs/heads/main'&&env.GITHUB_REPOSITORY===repository
    &&env.GITHUB_REPOSITORY_ID==='1281328888'&&/^[a-f0-9]{40}$/.test(env.GITHUB_SHA||'')
    &&env.GITHUB_WORKFLOW_SHA===env.GITHUB_SHA&&event.action==='completed','CONTEXT');
  const run=event.workflow_run;
  check(Number.isSafeInteger(run?.id)&&run.id>0&&[gate,assurance].includes(run.name)&&paths[run.name]===run.path
    &&run.status==='completed'&&run.run_attempt===1&&run.head_sha===env.GITHUB_SHA&&run.head_branch==='main'
    &&run.repository?.full_name===repository&&String(run.repository?.id)==='1281328888'
    &&run.head_repository?.full_name===repository,'UPSTREAM');
  // Push audits cannot satisfy the existing failure-parent proof contract.
  if(run.name===assurance){
    check(run.conclusion==='failure','FAILURE_CONCLUSION');
    if(!['workflow_run','repository_dispatch'].includes(run.event))return result(false,'UNSUPPORTED_FAILURE_PARENT_EVENT');
    return result(true,'FAILURE_PARENT_REQUIRES_FULL_NATIVE_VERIFICATION');
  }
  check(run.event==='workflow_run'&&run.conclusion==='success','GATE');
  const live=await get(`actions/runs/${run.id}`);
  check(['id','name','path','status','conclusion','run_attempt','head_sha','head_branch','event'].every(k=>live[k]===run[k])
    &&live.repository?.full_name===repository&&String(live.repository?.id)==='1281328888'
    &&live.head_repository?.full_name===repository,'READBACK');
  const listing=await get(`actions/runs/${run.id}/attempts/1/jobs?per_page=100`);
  check(Array.isArray(listing.jobs)&&Number.isSafeInteger(listing.total_count)&&listing.total_count===listing.jobs.length
    &&listing.total_count<=100&&listing.incomplete_results!==true&&new Set(listing.jobs.map(j=>j.id)).size===listing.jobs.length
    &&listing.jobs.every(j=>Number.isSafeInteger(j.id)&&j.id>0&&j.run_id===run.id
      &&(j.run_attempt===undefined||j.run_attempt===1)&&j.status==='completed'),'JOBS');
  const authority=listing.jobs.filter(j=>j.name==='success-authority-gate');
  check(authority.length===1,'AUTHORITY_CARDINALITY');
  if(authority[0].conclusion==='skipped')return result(false,'ACTUAL_AUTHORITY_JOB_SKIPPED');
  check(authority[0].conclusion==='success','AUTHORITY_FAILURE');
  return result(true,'ACTUAL_AUTHORITY_REQUIRES_FULL_NATIVE_VERIFICATION');
}
function result(admitted,reason){return {state:admitted?'EXECUTION_ADMITTED_NOT_AUTHORITY':'NON_AUTHORIZING_NOOP',admitted,reason,
  actual_authority_granted:false,write_performed:false,promotion_eligible:false,retry_authorized:false};}
