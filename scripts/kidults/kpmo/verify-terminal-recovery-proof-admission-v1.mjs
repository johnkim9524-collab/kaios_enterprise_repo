import fs from 'node:fs';
import {runDeferredAssuranceProofGate} from './run-deferred-assurance-proof-gate-v1.mjs';
import {verifyTerminalRecoveryProducerProofAdmission} from './lib/terminal-recovery-proof-admission-v1.mjs';

const env=process.env,repository=env.GITHUB_REPOSITORY,token=env.GH_TOKEN;
if(!token||repository!=='johnkim9524-collab/kaios_enterprise_repo')throw Error('TERMINAL_PROOF_ADMISSION_ENVIRONMENT');
const event=JSON.parse(fs.readFileSync(env.GITHUB_EVENT_PATH,'utf8'));
const run=event.workflow_run;
const output='out/recovery-execution-admission-v1';fs.mkdirSync(output,{recursive:true});
const proofReceipt=runDeferredAssuranceProofGate({producerRunId:run?.id,
  producerRunAttempt:run?.run_attempt,sourceSha:run?.head_sha,
  outputPath:`${output}/verified-runtime-proof.json`});
const receipt=verifyTerminalRecoveryProducerProofAdmission({event,repositoryId:env.GITHUB_REPOSITORY_ID,proofReceipt});
fs.writeFileSync(`${output}/proof-handoff-admission.json`,`${JSON.stringify(receipt,null,2)}\n`);
if(!env.GITHUB_OUTPUT)throw Error('TERMINAL_PROOF_ADMISSION_OUTPUT_REQUIRED');
fs.appendFileSync(env.GITHUB_OUTPUT,`proof_verified=${receipt.verified_proof_receipt_state==='VERIFIED_PASS'}\n`);
console.log(JSON.stringify(receipt));
