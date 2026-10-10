import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {canonicalJson,sha256} from './canonical-json-v1.mjs';

// The producer collects after queue/producer waits, not at workflow creation.
// Use its archive-authenticated, sealed snapshot time within the native run.
export function assuranceClockObservationBoundary({proof,assuranceRun,sourceSha}){
  const {receipt_digest,...body}=proof||{};
  const value=proof?.observed_at;
  const canonicalTime=typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)
    &&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value.replace(/(?<=:\d{2})Z$/,'.000Z');
  const observed=Date.parse(proof?.observed_at),start=Date.parse(assuranceRun?.created_at),end=Date.parse(assuranceRun?.updated_at);
  if(proof?.repository!=='johnkim9524-collab/kaios_enterprise_repo'||proof.source_sha!==sourceSha
    ||receipt_digest!==sha256(canonicalJson(body))
    ||assuranceRun?.repository?.full_name!==proof.repository||assuranceRun.head_sha!==sourceSha
    ||assuranceRun.path!=='.github/workflows/kidults-platform-continuous-assurance-v1.yml'
    ||assuranceRun.head_branch!=='main'||assuranceRun.event!=='repository_dispatch'
    ||assuranceRun.run_attempt!==1||assuranceRun.status!=='completed'||assuranceRun.conclusion!=='success'
    ||!canonicalTime||![observed,start,end].every(Number.isFinite)||observed<start||observed>end)
    throw new Error('ASSURANCE_CLOCK_OBSERVATION_BOUNDARY_INVALID');
  return proof.observed_at;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const [proofPath,runPath,sourceSha]=process.argv.slice(2);
  process.stdout.write(assuranceClockObservationBoundary({proof:JSON.parse(fs.readFileSync(proofPath,'utf8')),assuranceRun:JSON.parse(fs.readFileSync(runPath,'utf8')),sourceSha})+'\n');
}
