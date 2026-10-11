// Protected workload transport only; no executable entry point or AWS retries.
// Registration in the existing writer is a separate, unactivated source step.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {canonicalJson,sha256} from './canonical-json-v1.mjs';
import {validateInterruptedRecoveryRequest} from './interrupted-reservation-recovery-v1.mjs';

const repo='johnkim9524-collab/kaios_enterprise_repo';
const roles={
  ACCOUNTABLE_TRACK_AGENT:['track','TRACK','kidults-accountable-track-agent-v1'],
  KPMO:['kpmo','KPMO','kidults-kpmo-v1'],
  INDEPENDENT_VERIFIER:['verifier','VERIFIER','kidults-independent-verifier-v1'],
  FINALIZER:['finalizer','FINALIZER','kidults-finalizer-v1'],
};
const workflows=['track','kpmo','independent-verification'].map(x=>`${repo}/.github/workflows/kidults-autonomous-${x}-authorization-v1.yml@refs/heads/main`);
const check=(ok,code)=>{if(!ok)throw new Error('INTERRUPTED_CLIENT_'+code);};
export function createInterruptedRecoveryAwsTransport({execute=execFileSync,env=process.env}={}){
  const subprocessEnv={...env,AWS_MAX_ATTEMPTS:'1',AWS_RETRY_MODE:'standard'};
  return args=>JSON.parse(execute('aws',[...args,'--region','ap-northeast-2','--output','json','--cli-connect-timeout','5','--cli-read-timeout','20'],
    {encoding:'utf8',timeout:30000,stdio:['ignore','pipe','pipe'],env:subprocessEnv}));
}
const defaultAws=createInterruptedRecoveryAwsTransport();

export async function createInterruptedRecoverySignedLedgerClient({role,signingKeyArn,sourceSha,env=process.env,aws=defaultAws,tempRoot=os.tmpdir(),now=()=>Date.now()}){
  env={...env}; // Preserve the authenticated context across asynchronous RPCs.
  const def=roles[role];check(def,'ROLE');
  check(/^[a-f0-9]{40}$/.test(sourceSha||''),'SOURCE');
  check(/^arn:aws:kms:ap-northeast-2:528314240275:key\/[A-Za-z0-9-]+$/.test(signingKeyArn||'')&&signingKeyArn===env.KIDULTS_AUTONOMOUS_SIGNING_KEY_ARN,'KEY');
  check(!env.AWS_PROFILE&&!env.AWS_DEFAULT_PROFILE,'ADMIN_PROFILE');
  check(env.GITHUB_ACTIONS==='true'&&env.GITHUB_REPOSITORY===repo&&env.GITHUB_REPOSITORY_ID==='1281328888'
    &&env.GITHUB_REF==='refs/heads/main'&&env.GITHUB_SHA===sourceSha&&env.GITHUB_WORKFLOW_SHA===sourceSha
    &&env.GITHUB_RUN_ATTEMPT==='1'&&/^[1-9][0-9]{0,15}$/.test(env.GITHUB_RUN_ID||'')&&env.GITHUB_EVENT_NAME==='repository_dispatch','CONTEXT');
  const index={ACCOUNTABLE_TRACK_AGENT:0,KPMO:1,INDEPENDENT_VERIFIER:2}[role];
  check(role==='FINALIZER'?workflows.includes(env.GITHUB_WORKFLOW_REF):env.GITHUB_WORKFLOW_REF===workflows[index],'WORKFLOW');
  const identity=await aws(['sts','get-caller-identity']);
  check(identity.Account==='528314240275'&&new RegExp(`^arn:aws:sts::528314240275:assumed-role/kidults-autonomous-${def[0]}-staging-role/[^/]+$`).test(identity.Arn||''),'IDENTITY');
  const workload={workload_id:def[2],environment:'KIDULTS-AUTONOMOUS-'+def[1],signing_key_arn:signingKeyArn};
  const invoke=async envelope=>{
    envelope=JSON.parse(canonicalJson(envelope));
    const dir=fs.mkdtempSync(path.join(tempRoot,'kpmo-interrupted-ledger-'));fs.chmodSync(dir,0o700);
    try{
      const message=path.join(dir,'digest.bin'),output=path.join(dir,'response.json');
      fs.writeFileSync(message,Buffer.from(sha256(canonicalJson(envelope)).slice(7),'hex'),{mode:0o600,flag:'wx'});
      const sig=await aws(['kms','sign','--key-id',signingKeyArn,'--message',`fileb://${message}`,'--message-type','DIGEST','--signing-algorithm','ECDSA_SHA_256']);
      check(sig.KeyId===signingKeyArn&&sig.SigningAlgorithm==='ECDSA_SHA_256'&&typeof sig.Signature==='string'
        &&/^[A-Za-z0-9+/]+={0,2}$/.test(sig.Signature)&&Buffer.from(sig.Signature,'base64').length>0,'SIGNATURE');
      const metadata=await aws(['lambda','invoke','--function-name','kidults-autonomous-ledger-writer-staging','--cli-binary-format','raw-in-base64-out',
        '--payload',canonicalJson({envelope,signature_b64:sig.Signature}),output]);
      check(metadata.StatusCode===200&&!metadata.FunctionError,'TRANSPORT_UNKNOWN_NO_RETRY');
      const stat=fs.lstatSync(output);check(stat.isFile()&&!stat.isSymbolicLink()&&stat.size<=131072,'OUTPUT');
      const result=JSON.parse(fs.readFileSync(output,'utf8'));check(result?.ok===true,'REJECTED');return result;
    }finally{fs.rmSync(dir,{recursive:true,force:true});}
  };
  const binding=(request,fresh)=>{
    const request_digest=validateInterruptedRecoveryRequest(request,{now:now(),fresh});
    if(fresh)check(request.source_sha===sourceSha,'SOURCE_BINDING');
    check(request.original_run_id!==env.GITHUB_RUN_ID,'ORIGINAL_OWNER');return {request,request_digest};
  };
  const final=async(action,input,extra={},fresh=true)=>{
    check(role==='FINALIZER','FINALIZER_REQUIRED');check(input.run_id===env.GITHUB_RUN_ID,'EXECUTION_BINDING');
    return invoke({action,...binding(input.request,fresh),run_id:env.GITHUB_RUN_ID,run_attempt:1,workload,...extra});
  };
  return {
    // Native evidence is verified by each protected role before reaching this
    // transport. The writer independently validates schema, digest and quorum.
    createApproval:async({request,evidence})=>{
      check(role!=='FINALIZER','APPROVAL_ROLE');check(evidence&&evidence.source_sha===sourceSha,'EVIDENCE');
      return invoke({action:'APPROVE_MERGED_RESERVATION_RECOVERY',...binding(request,true),evidence,evidence_digest:sha256(canonicalJson(evidence)),
        role,approval_run_id:env.GITHUB_RUN_ID,approval_run_attempt:1,workload});
    },
    read:input=>final('READ_MERGED_RECOVERY',input,{},false),
    claim:input=>final('CLAIM_MERGED_RECOVERY',input,{expected_revision:input.expected_revision,lease_seconds:input.lease_seconds}),
    consume:input=>final('CONSUME_MERGED_RECOVERY',input,{revision:input.revision,terminal:input.terminal},false),
    acknowledge:input=>final('ACK_MERGED_RECOVERY_IMMUTABLE',input,{object:input.object},false),
    supersede:input=>final('SUPERSEDE_EXPIRED_MERGED_RECOVERY',input,{expected_old_request_digest:input.expected_old_request_digest,evidence_digest:input.evidence_digest}),
  };
}
