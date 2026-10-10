import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {canonicalJson,sha256} from './canonical-json-v1.mjs';

const repository='johnkim9524-collab/kaios_enterprise_repo';
const workflowPath='.github/workflows/kidults-platform-continuous-assurance-v1.yml';
const fail=()=>{throw new Error('ASSURANCE_SENTINEL_OBSERVATION_ROUTE_INVALID');};

// Clock authentication is native classify-job evidence, never a receipt label alone.
export function assuranceSentinelObservationRoute({audit,sourceSha,assuranceRun,jobs,proof,sentinelRun}){
  if(audit?.source?.sha!==sourceSha)fail();
  if(audit?.execution?.trigger==='workflow_run'){
    if(!audit.execution.upstream)fail();
    return {mode:'CAUSAL_SENTINEL',causalParent:audit.execution.upstream,sentinelRunId:Number(audit.execution.upstream.run_id)};
  }
  const identity=audit?.execution?.canonical_identity;
  const body=Object.fromEntries(Object.entries(audit||{}).filter(([key])=>!['receipt_digest','observed_at'].includes(key)));
  const prefix=`assurance-external-clock:kidults-natural-clock-v1:ASSURANCE:${sourceSha}:`;
  const suffix=identity?.generation_discriminator?.startsWith(prefix)?identity.generation_discriminator.slice(prefix.length):'';
  if(!/^[a-f0-9]{40}$/.test(sourceSha)||audit?.execution?.trigger!=='repository_dispatch'
    ||audit.execution.upstream!==null||audit.source.kind!=='PROTECTED_MAIN_EXTERNAL_NATURAL_CLOCK'
    ||audit.source.actual_sha!==sourceSha||audit.source.expected_sha!==sourceSha||audit.source.match!==true
    ||audit.receipt_digest!==sha256(canonicalJson(body))
    ||identity?.alias!==false||String(identity?.canonical_run_id)!==String(assuranceRun?.id)
    ||String(identity?.canonical_run_attempt)!=='1'||identity?.source_sha!==sourceSha||identity.upstream_class!=='ASSURANCE_EXTERNAL_NATURAL_CLOCK'
    ||! /^[A-Za-z0-9_-]{32,128}:slot:\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(suffix)
    ||assuranceRun?.event!=='repository_dispatch'||assuranceRun.path!==workflowPath
    ||assuranceRun.head_sha!==sourceSha||assuranceRun.head_branch!=='main'
    ||assuranceRun.repository?.full_name!==repository||assuranceRun.status!=='completed'||assuranceRun.conclusion!=='success'
    ||assuranceRun.run_attempt!==1||String(audit.execution.workflow_run_id)!==String(assuranceRun.id)
    ||String(audit.execution.workflow_run_attempt)!=='1'
    ||!Array.isArray(jobs?.jobs)||jobs.total_count!==jobs.jobs.length
    ||new Set(jobs.jobs.map(job=>job.id)).size!==jobs.jobs.length)fail();
  const classify=jobs.jobs.filter(job=>job.name==='classify-canonical-identity');
  if(classify.length!==1||String(classify[0].run_id)!==String(assuranceRun.id)
    ||classify[0].run_attempt!==assuranceRun.run_attempt
    ||classify[0].status!=='completed'||classify[0].conclusion!=='success')fail();
  const intake=classify[0].steps?.filter(step=>step.name==='Verify independent natural-clock receipt');
  if(intake?.length!==1||intake[0].status!=='completed'||intake[0].conclusion!=='success')fail();
  const proofBody=Object.fromEntries(Object.entries(proof||{}).filter(([key])=>key!=='receipt_digest'));
  const sentinelPath='.github/workflows/kpmo-continuous-assurance-sentinel-health-v1.yml';
  if(proof?.source_sha!==sourceSha||proof.repository!==repository
    ||proof.receipt_digest!==sha256(canonicalJson(proofBody))||!Array.isArray(proof.protected_evidence))fail();
  const bindings=proof.protected_evidence.filter(row=>row.workflow_path===sentinelPath);
  if(bindings.length!==1||bindings[0].source_sha!==sourceSha||Number(bindings[0].run_attempt)!==1
    ||!Number.isSafeInteger(Number(bindings[0].run_id))||Number(bindings[0].run_id)<1
    ||!Number.isSafeInteger(Number(bindings[0].artifact_id))||Number(bindings[0].artifact_id)<1
    ||!/^sha256:[a-f0-9]{64}$/.test(bindings[0].artifact_digest||''))fail();
  const binding=bindings[0];
  if(sentinelRun){
    if(Number(sentinelRun.id)!==Number(binding.run_id)||sentinelRun.run_attempt!==1
      ||sentinelRun.path!==sentinelPath||sentinelRun.head_sha!==sourceSha||sentinelRun.head_branch!=='main'
      ||sentinelRun.repository?.full_name!==repository
      ||!['workflow_run','repository_dispatch','schedule','workflow_dispatch'].includes(sentinelRun.event)
      ||sentinelRun.status!=='completed'||sentinelRun.conclusion!=='success')fail();

  }
  return {mode:'EXTERNAL_CLOCK_PROOF_BOUND',causalParent:null,sentinelRunId:Number(binding.run_id),sentinelBinding:binding};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const [auditPath,sourceSha,runPath,jobsPath,proofPath]=process.argv.slice(2);
  const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
  process.stdout.write(JSON.stringify(assuranceSentinelObservationRoute({audit:read(auditPath),sourceSha,
    assuranceRun:read(runPath),jobs:read(jobsPath),proof:read(proofPath)}))+'\n');
}
