import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {verifyTerminalRecoveryProofAdmission} from './lib/terminal-recovery-proof-admission-v1.mjs';

const env=process.env,repository=env.GITHUB_REPOSITORY,token=env.GH_TOKEN;
if(!token||repository!=='johnkim9524-collab/kaios_enterprise_repo')throw Error('TERMINAL_PROOF_ADMISSION_ENVIRONMENT');
const event=JSON.parse(fs.readFileSync(env.GITHUB_EVENT_PATH,'utf8'));
const run=event.workflow_run;
const headers={Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',
  'User-Agent':'kpmo-terminal-recovery-proof-admission-v1'};
const get=async path=>{const response=await fetch(`https://api.github.com/repos/${repository}${path}`,{headers,redirect:'error'});
  if(!response.ok)throw Error(`TERMINAL_PROOF_ADMISSION_GITHUB_API_${response.status}`);return response.json();};
const readArtifact=async(artifact)=>{
  const response=await fetch(`https://api.github.com/repos/${repository}/actions/artifacts/${artifact.id}/zip`,{headers,redirect:'follow'});
  if(!response.ok||!response.body)throw Error(`TERMINAL_PROOF_ADMISSION_ARCHIVE_HTTP_${response.status}`);
  const chunks=[];let size=0;
  for await(const chunk of response.body){size+=chunk.length;if(size>8*1024*1024)throw Error('TERMINAL_PROOF_ADMISSION_ARCHIVE_SIZE');chunks.push(chunk);}
  const parsed=spawnSync('python3',['scripts/kidults/kpmo/read-sentinel-artifact-v1.py',artifact.digest],
    {input:Buffer.concat(chunks),encoding:'utf8',timeout:30000,maxBuffer:32*1024*1024});
  if(parsed.status!==0)throw Error(`TERMINAL_PROOF_ADMISSION_ARCHIVE_${(parsed.stderr||'').trim().slice(0,120)}`);
  return JSON.parse(parsed.stdout);
};
const [jobsResponse,artifactsResponse]=await Promise.all([
  get(`/actions/runs/${run?.id}/attempts/${run?.run_attempt}/jobs?per_page=100`),
  get(`/actions/runs/${run?.id}/artifacts?per_page=100`),
]);
const matches=(artifactsResponse.artifacts||[]).filter(artifact=>artifact.name?.startsWith(`kpmo-deferred-assurance-runtime-proof-gate-${run?.head_sha}-`)
  &&artifact.expired===false&&artifact.workflow_run?.id===run?.id&&artifact.workflow_run?.head_sha===run?.head_sha);
if(matches.length!==1)throw Error('TERMINAL_PROOF_ADMISSION_PROOF_ARTIFACT');
const proofPacket=await readArtifact(matches[0]);
const receipt=verifyTerminalRecoveryProofAdmission({event,repositoryId:env.GITHUB_REPOSITORY_ID,jobsResponse,artifactsResponse,proofPacket});
const output='out/recovery-execution-admission-v1';fs.mkdirSync(output,{recursive:true});
fs.writeFileSync(`${output}/proof-handoff-admission.json`,`${JSON.stringify(receipt,null,2)}\n`);
console.log(JSON.stringify(receipt));
