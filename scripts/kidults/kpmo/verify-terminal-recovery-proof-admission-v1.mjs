import fs from 'node:fs';
import {verifyTerminalRecoveryProofAdmission} from './lib/terminal-recovery-proof-admission-v1.mjs';

const env=process.env,repository=env.GITHUB_REPOSITORY,token=env.GH_TOKEN;
if(!token||repository!=='johnkim9524-collab/kaios_enterprise_repo')throw Error('TERMINAL_PROOF_ADMISSION_ENVIRONMENT');
const event=JSON.parse(fs.readFileSync(env.GITHUB_EVENT_PATH,'utf8'));
const run=event.workflow_run;
const headers={Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',
  'User-Agent':'kpmo-terminal-recovery-proof-admission-v1'};
const get=async path=>{const response=await fetch(`https://api.github.com/repos/${repository}${path}`,{headers,redirect:'error'});
  if(!response.ok)throw Error(`TERMINAL_PROOF_ADMISSION_GITHUB_API_${response.status}`);return response.json();};
const [jobsResponse,artifactsResponse]=await Promise.all([
  get(`/actions/runs/${run?.id}/attempts/${run?.run_attempt}/jobs?per_page=100`),
  get(`/actions/runs/${run?.id}/artifacts?per_page=100`),
]);
const receipt=verifyTerminalRecoveryProofAdmission({event,repositoryId:env.GITHUB_REPOSITORY_ID,jobsResponse,artifactsResponse});
const output='out/recovery-execution-admission-v1';fs.mkdirSync(output,{recursive:true});
fs.writeFileSync(`${output}/proof-handoff-admission.json`,`${JSON.stringify(receipt,null,2)}\n`);
console.log(JSON.stringify(receipt));
