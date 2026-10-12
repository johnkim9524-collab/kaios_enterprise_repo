// Existing natural Gate workflow_run only. No dispatch, rerun, merge or deploy.
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {verifyInterruptedRecoveryNativeTriggerOnce,recoveryNativeGet} from './lib/interrupted-recovery-native-trigger-v1.mjs';
import {discoverInterruptedRecoveryCandidates} from './lib/interrupted-recovery-discovery-v1.mjs';
import {runInterruptedRecoveryWorkload} from './lib/interrupted-recovery-workload-v1.mjs';
import {createInterruptedRecoverySignedLedgerClient} from './lib/interrupted-recovery-signed-ledger-client-v1.mjs';
import {createInterruptedRecoveryNativeEvidence} from './lib/postmerge-recovery-exact-main-evidence-v1.mjs';
import {createInterruptedRecoveryImmutableStore} from './lib/interrupted-recovery-immutable-store-v1.mjs';
import {createInterruptedRecoveryBrokerDrain} from './lib/interrupted-recovery-broker-drain-v1.mjs';
async function runNativeInterruptedRecoveryInternal(){
  const env=process.env;
  if(execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()!==env.GITHUB_SHA)throw Error('INTERRUPTED_RUNTIME_CHECKOUT');
  const {upstream,token:nativeVerificationToken}=await verifyInterruptedRecoveryNativeTriggerOnce({env});
  const readBytes=route=>execFileSync('gh',['api',`repos/${env.GITHUB_REPOSITORY}/${route}`],{timeout:30000,maxBuffer:8*1024*1024,stdio:['ignore','pipe','pipe']});
  const discovery=await discoverInterruptedRecoveryCandidates({sourceSha:env.GITHUB_SHA,upstream,get:recoveryNativeGet,readBytes});
  const role=env.KIDULTS_RECOVERY_ROLE;
  const failureParent=upstream.recovery_parent?.kind==='TERMINAL_NULL_ASSURANCE_FAILURE_V1'?upstream.recovery_parent:null;
  if(!discovery.candidates.length){
    const result={state:'NO_RECOVERABLE_NATIVE_CANDIDATE_NOT_CLOSURE',actual_candidates:0,unrecoverable_legacy_or_missing_artifacts:discovery.unrecoverable_legacy_or_missing_artifacts,unresolved:discovery.unresolved,write_performed:false,promotion_eligible:false};
    fs.mkdirSync('out/postmerge-terminal-recovery-v1',{recursive:true});
    fs.writeFileSync(`out/postmerge-terminal-recovery-v1/interrupted-${role}.json`,JSON.stringify(result,null,2)+'\n');
    if(env.GITHUB_OUTPUT)fs.appendFileSync(env.GITHUB_OUTPUT,`generic_recovery_needed=false\n${failureParent?'recovery_needed=false\n':''}`);
    return result;
  }
  const ledger=await createInterruptedRecoverySignedLedgerClient({role,signingKeyArn:env.KIDULTS_AUTONOMOUS_SIGNING_KEY_ARN,sourceSha:env.GITHUB_SHA,nativeVerificationToken});
  const policy=JSON.parse(fs.readFileSync('coordination/kidults/kpmo/direct-owner-postmerge-push-suite-policy-v1.json','utf8'));
  const evidence=createInterruptedRecoveryNativeEvidence({policy,readJson:recoveryNativeGet,readBytes});
  const immutable=role==='FINALIZER'?await createInterruptedRecoveryImmutableStore({bucket:env.KIDULTS_AUTONOMOUS_RECEIPT_BUCKET,
    keyArn:env.KIDULTS_AUTONOMOUS_RECEIPT_KEY_ARN,sourceSha:env.GITHUB_SHA,ledger}):undefined;
  const verifyDrain=role==='FINALIZER'?createInterruptedRecoveryBrokerDrain({env}):undefined;
  const result=await runInterruptedRecoveryWorkload({role,candidates:discovery.candidates,ledger,get:recoveryNativeGet,evidence,immutable,verifyDrain,runId:env.GITHUB_RUN_ID});
  result.unrecoverable_legacy_or_missing_artifacts=discovery.unrecoverable_legacy_or_missing_artifacts;
  result.unresolved=discovery.unresolved;
  result.actual_candidates=discovery.candidates.length;
  result.source_sha=env.GITHUB_SHA;result.role_run_id=env.GITHUB_RUN_ID;
  if(failureParent)result.recovery_parent=failureParent;else result.gate_run_id=upstream.id;
  fs.mkdirSync('out/postmerge-terminal-recovery-v1',{recursive:true});
  fs.writeFileSync(`out/postmerge-terminal-recovery-v1/interrupted-${role}.json`,JSON.stringify(result,null,2)+'\n');
  if(env.GITHUB_OUTPUT)fs.appendFileSync(env.GITHUB_OUTPUT,`generic_recovery_needed=${failureParent?'false':discovery.candidates.length>0}\n${failureParent?`recovery_needed=${discovery.candidates.length>0}\n`:''}`);
  return result;
}

export async function runNativeInterruptedRecovery(){
  try{return await runNativeInterruptedRecoveryInternal();}
  catch(error){
    fs.mkdirSync('out/postmerge-terminal-recovery-v1',{recursive:true});
    fs.writeFileSync('out/postmerge-terminal-recovery-v1/interrupted-hold.json',JSON.stringify({state:'HOLD',failure_code:error.message,
      ...(error.recovery_transport_diagnostic?{transport_diagnostic:error.recovery_transport_diagnostic}:{}),
      ...(error.recovery_reconciliation?{read_only_reconciliation:error.recovery_reconciliation}:{}),promotion_eligible:false})+'\n');
    throw error;
  }
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  console.log(JSON.stringify(await runNativeInterruptedRecovery()));
}
