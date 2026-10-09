import {consumedRecoveryObservation} from './lib/consumed-recovery-observation-v1.mjs';
// Protected workflow entry point for one historic terminal-only incident.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {POSTMERGE_RECOVERY_INCIDENT as I,buildPostmergeRecoveryRequest} from './lib/autonomous-postmerge-recovery-v1.mjs';
import {createRecoverySignedLedgerClient} from './lib/postmerge-recovery-signed-ledger-client-v1.mjs';
import {createRecoveryGitHubObservation} from './lib/postmerge-recovery-github-observation-v1.mjs';
import {createRecoveryExactMainEvidence} from './lib/postmerge-recovery-exact-main-evidence-v1.mjs';
import {createRecoveryImmutableStore} from './lib/postmerge-recovery-immutable-store-v1.mjs';
import {createRecoveryWorkload} from './lib/postmerge-recovery-workload-v1.mjs';

const assert=(ok,code)=>{if(!ok)throw new Error(code);};
const env=process.env;
assert(env.GITHUB_ACTIONS==='true'&&env.GITHUB_EVENT_NAME==='workflow_run'&&env.GITHUB_RUN_ATTEMPT==='1','RECOVERY_RUNTIME_EVENT');
const event=JSON.parse(fs.readFileSync(env.GITHUB_EVENT_PATH,'utf8'));
const upstream=event.workflow_run;
assert(event.action==='completed'&&upstream?.name==='KPMO Continuous Assurance Success Authority Gate V1'
  &&upstream.path==='.github/workflows/kpmo-continuous-assurance-success-authority-gate-v1.yml'
  &&upstream.status==='completed'&&upstream.conclusion==='success'&&upstream.run_attempt===1
  &&upstream.head_branch==='main'&&upstream.head_sha===env.GITHUB_SHA
  &&upstream.repository?.full_name===I.repository&&String(upstream.repository?.id)===I.repository_id,'RECOVERY_RUNTIME_UPSTREAM');
assert(['production','public','g5'].every(key=>env[`KIDULTS_${key.toUpperCase()}_STATE`]==='HOLD'),'RECOVERY_RUNTIME_HOLD');
assert(execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()===env.GITHUB_SHA,'RECOVERY_RUNTIME_CHECKOUT');
const role=env.KIDULTS_RECOVERY_ROLE;
assert(['ACCOUNTABLE_TRACK_AGENT','KPMO','INDEPENDENT_VERIFIER','FINALIZER'].includes(role),'RECOVERY_RUNTIME_ROLE');
if(role==='FINALIZER')assert(env.GITHUB_WORKFLOW_REF===`${I.repository}/.github/workflows/kidults-autonomous-track-authorization-v1.yml@refs/heads/main`,'RECOVERY_RUNTIME_FINALIZER_WORKFLOW');
const ledger=await createRecoverySignedLedgerClient({role,signingKeyArn:env.KIDULTS_AUTONOMOUS_SIGNING_KEY_ARN,sourceSha:env.GITHUB_SHA});
const historical=consumedRecoveryObservation(await ledger.discoverContext());
if(historical){
  const dir='out/postmerge-terminal-recovery-v1';fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(path.join(dir,'historical-noop.json'),JSON.stringify(historical,null,2)+'\n');
  if(env.GITHUB_OUTPUT)fs.appendFileSync(env.GITHUB_OUTPUT,`approval_run_id=${env.GITHUB_RUN_ID}\nrecovery_needed=false\n`);
  console.log(JSON.stringify(historical));process.exit(0);
}
const live=JSON.parse(execFileSync('gh',['api',`repos/${I.repository}/actions/runs/${upstream.id}`],{encoding:'utf8',timeout:30000,maxBuffer:1048576}));
assert(['id','path','head_sha','head_branch','run_attempt','status','conclusion','name'].every(key=>live[key]===upstream[key])
  &&live.repository?.full_name===I.repository&&String(live.repository?.id)===I.repository_id,'RECOVERY_RUNTIME_UPSTREAM_READBACK');
const github=createRecoveryGitHubObservation({token:env.GITHUB_TOKEN});
const policy=JSON.parse(fs.readFileSync('coordination/kidults/kpmo/direct-owner-postmerge-push-suite-policy-v1.json','utf8'));
const evidence=createRecoveryExactMainEvidence({policy});
const immutable=role==='FINALIZER'?createRecoveryImmutableStore({bucket:env.KIDULTS_AUTONOMOUS_RECEIPT_BUCKET,keyArn:env.KIDULTS_AUTONOMOUS_RECEIPT_KEY_ARN}):undefined;
const workload=createRecoveryWorkload({role,ledger,github,evidence,immutable});
let result;
if(role==='FINALIZER'){
  const context=await ledger.discoverContext();
  assert(context.recovery_request,'RECOVERY_RUNTIME_PINNED_REQUEST_REQUIRED');
  result=await workload.finalizePinned({request:context.recovery_request,recoveryRunId:env.GITHUB_RUN_ID});
}else{
  // Constructing this schema has no ledger side effect. Only the first Track
  // workload may select/pin it; all successors consume the existing root.
  const issued=Date.now();
  const newRequest=role==='ACCOUNTABLE_TRACK_AGENT'?buildPostmergeRecoveryRequest({sourceSha:env.GITHUB_SHA,
    issuedAt:new Date(issued).toISOString(),expiresAt:new Date(issued+1800000).toISOString()}):undefined;
  result=await workload.resumeApproval({newRequest});
  // Parallel role runs may start before Track finishes authenticated archive
  // verification. Bounded read-only waiting does not create a request/approval.
  for(let attempt=0;result.state==='WAITING_PINNED_RECOVERY_REQUEST'&&attempt<18;attempt++){
    await new Promise(resolve=>setTimeout(resolve,5000));
    result=await workload.resumeApproval();
  }
  assert(env.GITHUB_OUTPUT,'RECOVERY_RUNTIME_OUTPUT_REQUIRED');
  const approvalId=result.approval_run_id||env.GITHUB_RUN_ID;
  assert(/^[1-9][0-9]{0,19}$/.test(approvalId),'RECOVERY_RUNTIME_APPROVAL_ID');
  fs.appendFileSync(env.GITHUB_OUTPUT,`approval_run_id=${approvalId}\nrecovery_needed=${!['RECOVERY_ALREADY_CONSUMED_NO_APPROVAL','WAITING_PINNED_RECOVERY_REQUEST'].includes(result.state)}\n`);
}
const dir='out/postmerge-terminal-recovery-v1';fs.mkdirSync(dir,{recursive:true});
fs.writeFileSync(path.join(dir,role==='FINALIZER'?'terminal.json':'approval.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({state:result.state,production:'HOLD',public:'HOLD',g5:'HOLD',promotion_eligible:false}));
