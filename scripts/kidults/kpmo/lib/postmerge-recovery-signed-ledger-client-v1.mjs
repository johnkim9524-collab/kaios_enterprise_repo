// Bounded CI workload transport. This module has no executable entry point.
// SSO/admin profiles are rejected; KMS signing occurs only after checking the
// expected protected-main workflow context and assumed workload role.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {canonicalJson,sha256} from './autonomous-internal-landing-v1.mjs';
import {POSTMERGE_RECOVERY_INCIDENT as I,validatePostmergeRecoveryRequest,validateRecoveryEvidenceSnapshot} from './autonomous-postmerge-recovery-v1.mjs';
import {recoveryImmutableAckFields} from './postmerge-recovery-immutable-store-v1.mjs';

const assert=(ok,code)=>{if(!ok)throw new Error(code);};
const definitions={
  ACCOUNTABLE_TRACK_AGENT:['track','KIDULTS-AUTONOMOUS-TRACK','kidults-accountable-track-agent-v1','kidults-autonomous-track-authorization-v1.yml'],
  KPMO:['kpmo','KIDULTS-AUTONOMOUS-KPMO','kidults-kpmo-v1','kidults-autonomous-kpmo-authorization-v1.yml'],
  INDEPENDENT_VERIFIER:['verifier','KIDULTS-AUTONOMOUS-VERIFIER','kidults-independent-verifier-v1','kidults-autonomous-independent-verification-authorization-v1.yml'],
  FINALIZER:['finalizer','KIDULTS-AUTONOMOUS-FINALIZER','kidults-finalizer-v1',null],
};
const defaultAws=args=>JSON.parse(execFileSync('aws',[...args,'--region','ap-northeast-2','--output','json'],
  {encoding:'utf8',timeout:30000,stdio:['ignore','pipe','pipe']}));

export async function createRecoverySignedLedgerClient({role,signingKeyArn,sourceSha,env=process.env,aws=defaultAws,tempRoot=os.tmpdir(),now=()=>Date.now()}){
  const definition=definitions[role];assert(definition,'RECOVERY_CLIENT_ROLE');
  assert(typeof sourceSha==='string'&&/^[0-9a-f]{40}$/.test(sourceSha),'RECOVERY_CLIENT_SOURCE_SHA');
  assert(/^arn:aws:kms:ap-northeast-2:528314240275:key\/[A-Za-z0-9-]+$/.test(signingKeyArn),'RECOVERY_CLIENT_SIGNING_KEY');
  assert(env.GITHUB_ACTIONS==='true'&&env.GITHUB_REPOSITORY===I.repository&&env.GITHUB_REPOSITORY_ID===I.repository_id
    &&env.GITHUB_REF==='refs/heads/main'&&env.GITHUB_SHA===sourceSha&&env.GITHUB_WORKFLOW_SHA===sourceSha
    &&env.GITHUB_RUN_ATTEMPT==='1'&&/^[1-9][0-9]{0,19}$/.test(env.GITHUB_RUN_ID||''),'RECOVERY_CLIENT_WORKFLOW_CONTEXT');
  assert(!env.AWS_PROFILE&&!env.AWS_DEFAULT_PROFILE,'RECOVERY_CLIENT_ADMIN_PROFILE_FORBIDDEN');
  const approvedRefs=(role==='FINALIZER'?Object.values(definitions).filter(d=>d[3]).map(d=>d[3]):[definition[3]])
    .map(file=>`${I.repository}/.github/workflows/${file}@refs/heads/main`);
  assert(approvedRefs.includes(env.GITHUB_WORKFLOW_REF),'RECOVERY_CLIENT_WORKFLOW_REF');
  const identity=await aws(['sts','get-caller-identity']);
  assert(identity.Account==='528314240275'&&typeof identity.Arn==='string'
    &&new RegExp(`^arn:aws:sts::528314240275:assumed-role/kidults-autonomous-${definition[0]}-staging-role/[^/]+$`).test(identity.Arn),
    'RECOVERY_CLIENT_WORKLOAD_ROLE');
  const workload={workload_id:definition[2],environment:definition[1],signing_key_arn:signingKeyArn};
  const privateOperation=async operation=>{
    const dir=fs.mkdtempSync(path.join(tempRoot,'kpmo-recovery-ledger-'));fs.chmodSync(dir,0o700);
    try{return await operation(dir);}finally{fs.rmSync(dir,{recursive:true,force:true});}
  };
  const invoke=async envelope=>privateOperation(async dir=>{
    const digestPath=path.join(dir,'digest.bin');
    fs.writeFileSync(digestPath,Buffer.from(sha256(canonicalJson(envelope)).slice(7),'hex'),{mode:0o600,flag:'wx'});
    const signature=await aws(['kms','sign','--key-id',signingKeyArn,'--message',`fileb://${digestPath}`,
      '--message-type','DIGEST','--signing-algorithm','ECDSA_SHA_256']);
    assert(signature.KeyId===signingKeyArn&&signature.SigningAlgorithm==='ECDSA_SHA_256'
      &&typeof signature.Signature==='string'&&/^[A-Za-z0-9+/]+={0,2}$/.test(signature.Signature)
      &&Buffer.from(signature.Signature,'base64').length>0,'RECOVERY_CLIENT_SIGNATURE');
    const outputPath=path.join(dir,'response.json');
    const metadata=await aws(['lambda','invoke','--function-name','kidults-autonomous-ledger-writer-staging',
      '--cli-binary-format','raw-in-base64-out','--payload',canonicalJson({envelope,signature_b64:signature.Signature}),outputPath]);
    assert(metadata.StatusCode===200&&!metadata.FunctionError,'RECOVERY_CLIENT_LEDGER_TRANSPORT');
    const stat=fs.lstatSync(outputPath);assert(stat.isFile()&&!stat.isSymbolicLink()&&stat.size<=131072,'RECOVERY_CLIENT_LEDGER_OUTPUT');
    const result=JSON.parse(fs.readFileSync(outputPath,'utf8'));assert(result?.ok===true,'RECOVERY_CLIENT_LEDGER_REJECTED');return result;
  });
  const requestBinding=(request,fresh)=>{
    const {request_digest}=validatePostmergeRecoveryRequest(request,{now:now(),requireFresh:fresh});
    if(fresh)assert(request.source_sha===sourceSha,'RECOVERY_CLIENT_SOURCE_BINDING');
    return {request,request_digest};
  };
  const finalizer=(action,request,extra={},fresh=true)=>{
    assert(role==='FINALIZER','RECOVERY_CLIENT_FINALIZER_REQUIRED');
    return invoke({id:'kidults-postmerge-recovery-finalizer-v1',action,...requestBinding(request,fresh),
      run_id:env.GITHUB_RUN_ID,workload,...extra});
  };
  const parseContext=response=>{
    assert(response.state==='SIGNED_RECOVERY_CONTEXT_READ','RECOVERY_CLIENT_CONTEXT_RESPONSE');
    const item=response.reservation;
    assert(item?.pk?.S===`RESERVE#${I.original_generation}`&&item.sk?.S===`NONCE#${I.original_nonce_digest}`,'RECOVERY_CLIENT_RESERVATION_KEY');
    return {authorization_generation:I.original_generation,nonce_digest:I.original_nonce_digest,
      run_id:item.run_id?.S,head_sha:item.head_sha?.S,state:item.state?.S,
      ...(item.recovery_run_id?{recovery_run_id:item.recovery_run_id.S}:{}),
      ...(item.recovery_request_json?{recovery_request:JSON.parse(item.recovery_request_json.S)}:{}),
      ...(item.recovery_evidence_snapshot_json?{recovery_snapshot:JSON.parse(item.recovery_evidence_snapshot_json.S)}:{}),
      ...(item.recovery_terminal_json?{recovery_terminal:JSON.parse(item.recovery_terminal_json.S)}:{}),
      ...(item.recovery_immutable_json?{recovery_immutable:JSON.parse(item.recovery_immutable_json.S)}:{}),
      ...(response.role_approval?{role_approval:response.role_approval}:{})};
  };
  const readContext=async request=>parseContext(await invoke({id:'kidults-postmerge-recovery-context-v1',action:'READ_POSTMERGE_RECOVERY_CONTEXT',
    ...requestBinding(request,false),run_id:env.GITHUB_RUN_ID,workload,...(role==='FINALIZER'?{}:{role})}));
  const discoverContext=async()=>parseContext(await invoke({id:'kidults-postmerge-recovery-context-v1',action:'READ_POSTMERGE_RECOVERY_CONTEXT',
    mode:'DISCOVER_PINNED_CONTEXT_ONLY',source_sha:sourceSha,run_id:env.GITHUB_RUN_ID,workload,...(role==='FINALIZER'?{}:{role})}));
  const createApproval=async({request,snapshot})=>{
    assert(role!=='FINALIZER','RECOVERY_CLIENT_APPROVAL_ROLE_REQUIRED');
    requestBinding(request,true);
    validateRecoveryEvidenceSnapshot(snapshot,request,{now:now()});
    return invoke({id:'kidults-postmerge-recovery-approval-v1',action:'CREATE_RECOVERY_APPROVAL',
      ...requestBinding(request,true),role,decision:'APPROVED',approval_run_id:env.GITHUB_RUN_ID,
      approval_run_attempt:1,workload,evidence_digest:sha256(canonicalJson(snapshot.evidence)),evidence_snapshot:snapshot});
  };
  const consumeOnce=async input=>{
    assert(input.expected_original_run_id===I.original_run_id&&input.expected_original_head_sha===I.original_head_sha
      &&input.expected_state==='RESERVED'&&input.preserve_original_owner===true
      &&input.recoveryRunId===env.GITHUB_RUN_ID,'RECOVERY_CLIENT_CONSUME_FENCE');
    return finalizer('CONSUME_RECOVERY_RESERVATION',input.request,{terminal:input.terminal});
  };
  return {readContext,discoverContext,createApproval,consumeOnce,
    readAuthority:request=>finalizer('READ_RECOVERY_AUTHORITY',request),
    acknowledgeImmutable:({request,terminal,immutable})=>finalizer('ACK_RECOVERY_IMMUTABLE_RECEIPT',request,
      {terminal_digest:terminal.receipt_digest,immutable:recoveryImmutableAckFields(immutable)},false)};
}
