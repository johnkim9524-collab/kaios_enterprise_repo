const repository='johnkim9524-collab/kaios_enterprise_repo';
const gatePath='.github/workflows/kpmo-continuous-assurance-success-authority-gate-v1.yml';
const proofPrefix='kpmo-deferred-assurance-runtime-proof-gate-';
const check=(ok,code)=>{if(!ok)throw Error(`TERMINAL_PROOF_ADMISSION_${code}`);};

export function verifyTerminalRecoveryProofAdmission({event,repositoryId='1281328888',jobsResponse,artifactsResponse}){
  const run=event?.workflow_run;
  check(event?.action==='completed'&&run?.id>0&&run?.name==='KPMO Continuous Assurance Success Authority Gate V1'
    &&run?.path===gatePath&&run?.status==='completed'&&run?.conclusion==='success'
    &&run?.run_attempt===1&&run?.head_branch==='main'&&/^[a-f0-9]{40}$/.test(run?.head_sha||'')
    &&run?.repository?.full_name===repository&&String(run?.repository?.id)===repositoryId
    &&run?.head_repository?.full_name===repository,'UPSTREAM_BINDING');
  const jobs=jobsResponse?.jobs;
  check(Array.isArray(jobs)&&jobsResponse.total_count===jobs.length&&jobs.length<=100
    &&new Set(jobs.map(job=>job.id)).size===jobs.length,'JOB_PAGE');
  const handoffs=jobs.filter(job=>job.name==='deferred-runtime-proof-handoff-gate'
    &&job.run_id===run.id&&(job.run_attempt===undefined||job.run_attempt===run.run_attempt)
    &&job.status==='completed'&&job.conclusion==='success');
  check(handoffs.length===1,'HANDOFF_JOB');
  const closureSteps=handoffs[0].steps?.filter(step=>step.name==='Require exact autonomous Assurance proof closure'
    &&step.status==='completed'&&step.conclusion==='success');
  check(closureSteps?.length===1,'HANDOFF_CLOSURE_STEP');
  const artifacts=artifactsResponse?.artifacts;
  check(Array.isArray(artifacts)&&artifactsResponse.total_count===artifacts.length&&artifacts.length<=100,'ARTIFACT_PAGE');
  const proofArtifacts=artifacts.filter(artifact=>artifact.name?.startsWith(`${proofPrefix}${run.head_sha}-`)
    &&artifact.expired===false&&/^sha256:[a-f0-9]{64}$/.test(artifact.digest||'')
    &&artifact.workflow_run?.id===run.id&&artifact.workflow_run?.head_sha===run.head_sha);
  check(proofArtifacts.length===1,'PROOF_ARTIFACT');
  return {state:'PROOF_HANDOFF_ADMITTED_NOT_AUTHORITY',gate_run_id:run.id,gate_run_attempt:run.run_attempt,
    source_sha:run.head_sha,proof_handoff_job_id:handoffs[0].id,proof_artifact_id:proofArtifacts[0].id,
    proof_artifact_digest:proofArtifacts[0].digest,reservation_write_performed:false,actual_authority_granted:false,
    promotion_eligible:false,production:'HOLD',public:'HOLD',g5:'HOLD'};
}
