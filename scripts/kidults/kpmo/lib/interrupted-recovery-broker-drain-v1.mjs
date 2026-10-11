// Only the existing broker's authenticated read-only reconciliation endpoint.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createInterruptedRecoveryAwsTransport} from './interrupted-recovery-signed-ledger-client-v1.mjs';
const check=(ok,code)=>{if(!ok)throw Error('INTERRUPTED_DRAIN_'+code);};
export function createInterruptedRecoveryBrokerDrain({env=process.env,fetchImpl=globalThis.fetch,now=()=>Date.now(),transportFactory=createInterruptedRecoveryAwsTransport}){
  env={...env};
  check(env.KIDULTS_AUTONOMOUS_EVENT_TOKEN_BROKER_FUNCTION==='kidults-autonomous-event-token-broker-staging'
    &&/^arn:aws:iam::528314240275:role\/kidults-autonomous-event-broker-invoker-staging-role$/.test(env.KIDULTS_AUTONOMOUS_EVENT_BROKER_ROLE_ARN||''),'CONFIG');
  return async request=>{
    check(request.pull_request!==1677&&request.original_run_id!==env.GITHUB_RUN_ID,'QUARANTINE_OWNER');
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'kpmo-recovery-drain-'));fs.chmodSync(dir,0o700);
    try{
      const response=await fetchImpl(`${env.ACTIONS_ID_TOKEN_REQUEST_URL}&audience=sts.amazonaws.com`,{
        headers:{Authorization:`Bearer ${env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}`},redirect:'error',signal:AbortSignal.timeout(10000)});
      check(response.ok&&!response.redirected,'OIDC');const identity=(await response.json()).value;
      check(typeof identity==='string'&&identity.length>=100&&identity.length<=16384,'OIDC');
      const tokenFile=path.join(dir,'identity.jwt'),output=path.join(dir,'context.json');fs.writeFileSync(tokenFile,identity,{mode:0o600,flag:'wx'});
      const isolated={...env,AWS_ROLE_ARN:env.KIDULTS_AUTONOMOUS_EVENT_BROKER_ROLE_ARN,AWS_WEB_IDENTITY_TOKEN_FILE:tokenFile,
        AWS_ROLE_SESSION_NAME:`kidults-recovery-drain-${env.GITHUB_RUN_ID}`};
      for(const key of ['AWS_ACCESS_KEY_ID','AWS_SECRET_ACCESS_KEY','AWS_SESSION_TOKEN','AWS_PROFILE','AWS_DEFAULT_PROFILE'])delete isolated[key];
      const aws=transportFactory({env:isolated});
      const result=await aws(['lambda','invoke','--function-name',env.KIDULTS_AUTONOMOUS_EVENT_TOKEN_BROKER_FUNCTION,
        '--cli-binary-format','raw-in-base64-out','--payload',JSON.stringify({action:'READ_FINALIZER_RECOVERY_CONTEXT',repository:request.repository,
          repository_id:request.repository_id,pull_request:request.pull_request,base_sha:env.GITHUB_SHA,head_sha:request.head_sha,
          run_id:env.GITHUB_RUN_ID,run_attempt:1,caller_oidc_token:identity}),output]);
      check(result.StatusCode===200&&!result.FunctionError,'TRANSPORT_UNKNOWN_NO_RETRY');
      const stat=fs.lstatSync(output);check(stat.isFile()&&!stat.isSymbolicLink()&&stat.size<=131072,'OUTPUT');
      const packet=JSON.parse(fs.readFileSync(output,'utf8')),r=packet.receipt,o=r?.original_execution;
      check(packet.ok===true&&r?.state==='POSTMERGE_RECONCILIATION_CONTEXT_ONLY'&&r.token_drain==='TOKEN_DRAIN_VERIFIED_NOT_RECOVERY_AUTHORITY'
        &&r.repository===request.repository&&r.repository_id===request.repository_id&&r.pull_request===request.pull_request&&r.source_sha===env.GITHUB_SHA
        &&r.head_sha===request.head_sha&&r.head_tree_sha===request.head_tree_sha&&r.merge?.merge_sha===request.merge_sha
        &&JSON.stringify(r.merge?.ordered_parents)===JSON.stringify([request.base_sha,request.head_sha])
        &&o?.run_id===request.original_run_id&&o.run_attempt===1&&o.source_sha===request.base_sha
        &&o.authorization_generation===request.original_generation&&o.nonce_digest===request.nonce_digest
        &&r.mutation_attempted===false&&r.recovery_authority===false&&typeof r.signature==='string'&&r.signature.length>0
        &&['production','public','g5'].every(k=>r[k]==='HOLD')
        &&Date.parse(r.observed_at)<=now()&&now()<Date.parse(r.expires_at)&&Date.parse(r.expires_at)-Date.parse(r.observed_at)<=300000,'BINDING');
      return r;
    }finally{fs.rmSync(dir,{recursive:true,force:true});}
  };
}
