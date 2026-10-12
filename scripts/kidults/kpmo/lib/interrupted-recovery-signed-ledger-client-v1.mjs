import {verifyInterruptedRecoveryNativeTrigger,consumeInterruptedRecoveryNativeTriggerToken} from './interrupted-recovery-native-trigger-v1.mjs';
// Protected workload transport only; no executable entry point or AWS retries.
// Registration in the existing writer is a separate, unactivated source step.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
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

// Retain bounded failure facts before deleting the private Lambda response.
// Never retain an error message, payload, signature, environment or stack.
const safeWriterCodes=new Set(['CONFIG','WORKLOAD_CONFIG','SIGNER_COLLISION','SIGNED_FIELDS','WORKLOAD','SIGNATURE_ENCODING','SIGNATURE','REQUEST_FIELDS','REQUEST_VERSION','REPOSITORY','QUARANTINE','SHA','ORIGINAL_RUN','ORIGINAL_KEY','HOLD','TIMESTAMP','REQUEST_EXPIRED','FAILURE_CONTEXT_ROLE','FAILURE_CONTEXT_FIELDS','FAILURE_CONTEXT_BINDING','FAILURE_TERMINAL_NULL_ONLY','FAILURE_CONTEXT_PIN','FAILURE_CONTEXT_APPROVAL','FAILURE_CONTEXT_RUN_COLLISION','FAILURE_TERMINAL_PARTIAL_WRITE','FAILURE_TERMINAL_DIGEST'].map(x=>'INTERRUPTED_RECOVERY_'+x).concat(['RECOVERY_ACTION_FORBIDDEN','EVENT_INVALID','RECOVERY_ENVELOPE_INVALID','LEDGER_CAPSULE_DIGEST']));
const safeAwsCodes=new Set(['AccessDeniedException','ValidationException','ResourceNotFoundException','ProvisionedThroughputExceededException','ThrottlingException','InternalServerError','KMSAccessDeniedException']);
export function recoveryTransportDiagnostic({metadata,output,envelope,sourceSha,role,runId}){
  const diagnostic={id:'kidults-interrupted-recovery-transport-diagnostic-v1',version:'1.0.0',
    source_sha:sourceSha,role,run_id:runId,operation:envelope.action,
    status_code:Number.isSafeInteger(metadata?.StatusCode)&&metadata.StatusCode>=100&&metadata.StatusCode<=599?metadata.StatusCode:null,
    function_error:['Handled','Unhandled'].includes(metadata?.FunctionError)?metadata.FunctionError:null,
    response_state:'UNAVAILABLE',response_sha256:null,error_type:null,writer_error_code:null,aws_error_code:null,
    retry_authorized:false,actual_authority_granted:false,promotion_eligible:false};
  try{
    const stat=fs.lstatSync(output);
    if(!stat.isFile()||stat.isSymbolicLink()||stat.size>131072){diagnostic.response_state='REJECTED_FILE';return diagnostic;}
    const bytes=fs.readFileSync(output);diagnostic.response_sha256='sha256:'+createHash('sha256').update(bytes).digest('hex');diagnostic.response_state='BOUNDED_BYTES';
    const response=JSON.parse(bytes.toString('utf8'));
    if(['ValueError','KeyError','TypeError','RuntimeError','ClientError'].includes(response?.errorType))diagnostic.error_type=response.errorType;
    if(safeWriterCodes.has(response?.errorMessage))diagnostic.writer_error_code=response.errorMessage;
    const awsCode=typeof response?.errorMessage==='string'?response.errorMessage.match(/^An error occurred \(([A-Za-z]+)\) when calling /)?.[1]:null;
    if(safeAwsCodes.has(awsCode))diagnostic.aws_error_code=awsCode;
  }catch{} // Diagnostic failure cannot replace the original no-retry rejection.
  return diagnostic;
}

export async function createInterruptedRecoverySignedLedgerClient({role,signingKeyArn,sourceSha,env=process.env,aws=defaultAws,tempRoot=os.tmpdir(),now=()=>Date.now(),nativeVerificationToken}){
  env={...env}; // Preserve the authenticated context across asynchronous RPCs.
  const def=roles[role];check(def,'ROLE');
  check(/^[a-f0-9]{40}$/.test(sourceSha||''),'SOURCE');
  check(/^arn:aws:kms:ap-northeast-2:528314240275:key\/[A-Za-z0-9-]+$/.test(signingKeyArn||'')&&signingKeyArn===env.KIDULTS_AUTONOMOUS_SIGNING_KEY_ARN,'KEY');
  check(!env.AWS_PROFILE&&!env.AWS_DEFAULT_PROFILE,'ADMIN_PROFILE');
  check(env.GITHUB_ACTIONS==='true'&&env.GITHUB_REPOSITORY===repo&&env.GITHUB_REPOSITORY_ID==='1281328888'
    &&env.GITHUB_REF==='refs/heads/main'&&env.GITHUB_SHA===sourceSha&&env.GITHUB_WORKFLOW_SHA===sourceSha
    &&env.GITHUB_RUN_ATTEMPT==='1'&&/^[1-9][0-9]{0,15}$/.test(env.GITHUB_RUN_ID||'')&&['repository_dispatch','workflow_run'].includes(env.GITHUB_EVENT_NAME),'CONTEXT');
  const index={ACCOUNTABLE_TRACK_AGENT:0,KPMO:1,INDEPENDENT_VERIFIER:2}[role];
  check(role==='FINALIZER'?workflows.includes(env.GITHUB_WORKFLOW_REF):env.GITHUB_WORKFLOW_REF===workflows[index],'WORKFLOW');
  if(nativeVerificationToken!==undefined){
    check(env.GITHUB_EVENT_NAME==='workflow_run','TOKEN_EVENT');
    await consumeInterruptedRecoveryNativeTriggerToken({token:nativeVerificationToken,env});
  }else if(env.GITHUB_EVENT_NAME==='workflow_run')await verifyInterruptedRecoveryNativeTrigger({env});
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
      let metadata;
      const rejectTransport=()=>{
        const error=new Error('INTERRUPTED_CLIENT_TRANSPORT_UNKNOWN_NO_RETRY');
        error.recovery_transport_diagnostic=recoveryTransportDiagnostic({metadata,output,envelope,sourceSha,role,runId:env.GITHUB_RUN_ID});
        throw error;
      };
      try{metadata=await aws(['lambda','invoke','--function-name','kidults-autonomous-ledger-writer-staging','--cli-binary-format','raw-in-base64-out',
        '--payload',canonicalJson({envelope,signature_b64:sig.Signature}),output]);}
      catch{rejectTransport();}
      if(metadata?.StatusCode!==200||metadata.FunctionError)rejectTransport();
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
    readContext:async({request})=>invoke({action:'READ_MERGED_RECOVERY_CONTEXT',...binding(request,false),role,run_id:env.GITHUB_RUN_ID,run_attempt:1,workload}),
    // Native evidence is verified by each protected role before reaching this
    // transport. The writer independently validates schema, digest and quorum.
    createApproval:async({request,evidence})=>{
      check(role!=='FINALIZER','APPROVAL_ROLE');check(evidence&&evidence.source_sha===sourceSha,'EVIDENCE');
      return invoke({action:'APPROVE_MERGED_RESERVATION_RECOVERY',...binding(request,true),evidence,evidence_digest:sha256(canonicalJson(evidence)),
        role,approval_run_id:env.GITHUB_RUN_ID,approval_run_attempt:1,workload});
    },
    readFailureContext:async({request})=>{
      const bound=binding(request,false);
      try{return await invoke({action:'READ_FAILED_ASSURANCE_TERMINAL_CONTEXT',...bound,role,run_id:env.GITHUB_RUN_ID,run_attempt:1,workload});}
      catch(error){
        const first=error.recovery_transport_diagnostic;
        // This is one distinct existing read, never a retry of the rejected
        // failure-context operation or a route to approval/consume authority.
        if(first?.operation==='READ_FAILED_ASSURANCE_TERMINAL_CONTEXT'&&first.status_code===200
          &&first.function_error==='Unhandled'&&first.error_type==='ValueError'
          &&first.writer_error_code==='INTERRUPTED_RECOVERY_FAILURE_TERMINAL_NULL_ONLY'){
          const observation={id:'kidults-original-reservation-read-only-reconciliation-v1',
            source_sha:sourceSha,role,run_id:env.GITHUB_RUN_ID,original_run_id:bound.request.original_run_id,
            action:'READ_MERGED_RECOVERY_CONTEXT',state:'READBACK_UNVERIFIED',writer_context_state:null,
            write_performed:null,write_authorized:false,original_consumption_reissued:false,retry_authorized:false,
            actual_authority_granted:false,promotion_eligible:false};
          try{
            const context=await invoke({action:'READ_MERGED_RECOVERY_CONTEXT',...bound,role,run_id:env.GITHUB_RUN_ID,run_attempt:1,workload});
            const states=['ORIGINAL_RESERVATION_MISSING','ORIGINAL_CONSUMED_TERMINAL_ARCHIVE_PENDING',
              'ORIGINAL_CORE_CONSUMED_ARCHIVE_RECONCILIATION_REQUIRED','RESERVED','CONSUMED'];
            if(states.includes(context?.state)&&context.write_performed===false){
              observation.state='READ_ONLY_CONTEXT_OBSERVED_NOT_TERMINAL_VERIFIED';
              observation.writer_context_state=context.state;
              observation.write_performed=false;
            }
          }catch(readError){
            observation.state='READBACK_FAILED';
            if(readError.recovery_transport_diagnostic)observation.transport_diagnostic=readError.recovery_transport_diagnostic;
          }
          error.recovery_reconciliation=observation;
        }
        throw error; // Preserve the first failure even when readback succeeds.
      }
    },
    createFailureApproval:async({request,evidence})=>{
      check(role!=='FINALIZER','APPROVAL_ROLE');check(evidence?.source_sha===sourceSha
        &&evidence?.evidence_profile==='TERMINAL_NULL_ASSURANCE_FAILURE_V1','FAILURE_EVIDENCE');
      return invoke({action:'APPROVE_FAILED_ASSURANCE_TERMINAL_RECOVERY',...binding(request,true),evidence,evidence_digest:sha256(canonicalJson(evidence)),
        role,approval_run_id:env.GITHUB_RUN_ID,approval_run_attempt:1,workload});
    },
    createOriginalTerminalRepairApproval:async({request,evidence})=>{
      check(role!=='FINALIZER','APPROVAL_ROLE');check(evidence?.source_sha===sourceSha
        &&evidence?.evidence_profile==='TERMINAL_NULL_ASSURANCE_FAILURE_V1','ORIGINAL_REPAIR_EVIDENCE');
      return invoke({action:'APPROVE_RESERVED_ORIGINAL_TERMINAL_REPAIR',...binding(request,true),evidence,
        evidence_digest:sha256(canonicalJson(evidence)),role,approval_run_id:env.GITHUB_RUN_ID,
        approval_run_attempt:1,workload});
    },
    readOriginalTerminalRepairContext:async({request})=>invoke({action:'READ_RESERVED_ORIGINAL_TERMINAL_REPAIR_CONTEXT',
      ...binding(request,false),role,run_id:env.GITHUB_RUN_ID,run_attempt:1,workload}),
    finalizeOriginalTerminalRepair:async({request,terminal,evidence_digest,run_id=env.GITHUB_RUN_ID})=>{
      check(role==='FINALIZER'&&run_id===env.GITHUB_RUN_ID,'FINALIZER_REQUIRED');
      return invoke({action:'FINALIZE_RESERVED_ORIGINAL_TERMINAL_REPAIR',...binding(request,false),run_id,run_attempt:1,
        terminal,evidence_digest,workload});
    },
    acknowledgeOriginalTerminalRepair:input=>final('ACK_ORIGINAL_TERMINAL_REPAIR_IMMUTABLE',input,{object:input.object,evidence_digest:input.evidence_digest},false),
    finalizeFailureTerminal:async({request,terminal,evidence_digest,run_id=env.GITHUB_RUN_ID})=>{
      check(role==='FINALIZER'&&run_id===env.GITHUB_RUN_ID,'FINALIZER_REQUIRED');
      return invoke({action:'FINALIZE_FAILED_ASSURANCE_TERMINAL_RECOVERY',...binding(request,false),run_id,run_attempt:1,terminal,evidence_digest,workload});
    },
    acknowledgeFailureTerminal:input=>final('ACK_FAILED_ASSURANCE_TERMINAL_IMMUTABLE',input,{object:input.object},false),
    read:input=>final('READ_MERGED_RECOVERY',input,{},false),
    claim:input=>final('CLAIM_MERGED_RECOVERY',input,{expected_revision:input.expected_revision,lease_seconds:input.lease_seconds}),
    consume:input=>final('CONSUME_MERGED_RECOVERY',input,{revision:input.revision,terminal:input.terminal},false),
    acknowledge:input=>final('ACK_MERGED_RECOVERY_IMMUTABLE',input,{object:input.object},false),
    acknowledgeOriginal:input=>final('ACK_ORIGINAL_TERMINAL_IMMUTABLE',input,{object:input.object},false),
    supersede:input=>final('SUPERSEDE_EXPIRED_MERGED_RECOVERY',input,{expected_old_request_digest:input.expected_old_request_digest,evidence_digest:input.evidence_digest}),
  };
}
