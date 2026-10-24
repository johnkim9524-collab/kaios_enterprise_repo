import fs from 'node:fs';
import {verifyTerminalRecoveryProducerAdmissionArtifact} from './lib/terminal-recovery-proof-admission-v1.mjs';

const env=process.env;
if(env.GITHUB_REPOSITORY!=='johnkim9524-collab/kaios_enterprise_repo'
  ||env.GITHUB_REF!=='refs/heads/main'||env.GITHUB_RUN_ATTEMPT!=='1'
  ||env.GITHUB_WORKFLOW_REF!=='johnkim9524-collab/kaios_enterprise_repo/.github/workflows/kpmo-continuous-assurance-terminal-recovery-v1.yml@refs/heads/main'
  ||!/^[a-f0-9]{40}$/.test(env.GITHUB_SHA||''))throw Error('RECOVERY_PROOF_ADMISSION_ENVIRONMENT');
const event=JSON.parse(fs.readFileSync(env.GITHUB_EVENT_PATH,'utf8'));
const admission=JSON.parse(fs.readFileSync('out/recovery-execution-admission-v1/proof-handoff-admission.json','utf8'));
const result=verifyTerminalRecoveryProducerAdmissionArtifact({event,sourceSha:env.GITHUB_SHA,admission});
process.stdout.write(`${JSON.stringify(result)}\n`);
