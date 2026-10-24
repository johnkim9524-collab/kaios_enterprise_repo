// Cost admission only: a positive result grants no recovery or consumption authority.
const repository='johnkim9524-collab/kaios_enterprise_repo';
const gate='KPMO Continuous Assurance Success Authority Gate V1';
const producer='KIDULTS Autonomous KPMO Authorization V1 completed';
const assurance='KIDULTS Platform Continuous Assurance V1';
const paths={ [gate]:'.github/workflows/kpmo-continuous-assurance-success-authority-gate-v1.yml',
  [producer]:'.github/workflows/kidults-autonomous-kpmo-authorization-v1.yml',
  [assurance]:'.github/workflows/kidults-platform-continuous-assurance-v1.yml' };
const check=(ok,code)=>{if(!ok)throw Error('RECOVERY_ADMISSION_'+code);};
export function recoveryExecutionAdmission({env,event}){
  check(env.GITHUB_ACTIONS==='true'&&env.GITHUB_EVENT_NAME==='workflow_run'
    &&/^[1-9][0-9]{0,2}$/.test(env.GITHUB_RUN_ATTEMPT||'')
    &&env.GITHUB_REF==='refs/heads/main'&&env.GITHUB_REPOSITORY===repository
    &&env.GITHUB_REPOSITORY_ID==='1281328888'&&/^[a-f0-9]{40}$/.test(env.GITHUB_SHA||'')
    &&env.GITHUB_WORKFLOW_SHA===env.GITHUB_SHA&&event.action==='completed','CONTEXT');
  const run=event.workflow_run;
  check(Number.isSafeInteger(run?.id)&&run.id>0&&[gate,producer,assurance].includes(run.name)&&paths[run.name]===run.path
    &&run.status==='completed'&&run.run_attempt===1&&run.head_sha===env.GITHUB_SHA&&run.head_branch==='main'
    &&run.repository?.full_name===repository&&String(run.repository?.id)==='1281328888'
    &&run.head_repository?.full_name===repository,'UPSTREAM');
  // Push audits cannot satisfy the existing failure-parent proof contract.
  if(run.name===assurance){
    check(run.conclusion==='failure','FAILURE_CONCLUSION');
    if(!['workflow_run','repository_dispatch'].includes(run.event)){
      if(run.event!=='workflow_dispatch'||run.actor?.login!=='github-actions[bot]')
        return result(false,'UNSUPPORTED_FAILURE_PARENT_EVENT');
      return result(true,'BOT_COVERAGE_CONTINUATION_REQUIRES_FULL_NATIVE_VERIFICATION');
    }
    return result(true,'FAILURE_PARENT_REQUIRES_FULL_NATIVE_VERIFICATION');
  }
  if(run.name===producer){
    check(run.event==='workflow_run'&&run.conclusion==='success','PRODUCER');
    return result(true,'PRODUCER_REQUIRES_FULL_NATIVE_PROOF_VERIFICATION');
  }
  check(run.event==='workflow_run'&&run.conclusion==='success','GATE');
  return result(true,'ACTUAL_AUTHORITY_REQUIRES_FULL_NATIVE_VERIFICATION');
}
function result(admitted,reason){return {state:admitted?'EXECUTION_ADMITTED_NOT_AUTHORITY':'NON_AUTHORIZING_NOOP',admitted,reason,
  actual_authority_granted:false,write_performed:false,promotion_eligible:false,retry_authorized:false};}
