#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {
  AutonomousLandingError,
  canonicalJson,
  sha256,
  validateWorkload,
  validateEnvelope,
  deriveApprovalDecision,
  validateQuorum,
  validateRecoveryGeneration,
  validateDraftReadyRebind,
  buildTerminalReceipt,
  collectPaginatedApiValues,
  validateLiveChangedPaths,
} from './lib/autonomous-internal-landing-v1.mjs';
import {independentlyVerifyCapabilityDelta} from './lib/independent-capability-verifier-v1.mjs';
import {bindRequiredGateEvidence,sameRequiredGateEvidenceAuthority,validateRequiredGateSemanticEvidence} from './lib/required-gate-evidence-v1.mjs';
import {validateDispatchEvent} from './lib/autonomous-dispatch-fanout-v1.mjs';
import {evaluateAutonomousPostmerge} from './lib/autonomous-postmerge-validation-v1.mjs';
import {sealAutonomousTerminal} from './lib/autonomous-terminal-immutable-v1.mjs';

const required = name => {
  const value = process.env[name];
  if (!value) throw new AutonomousLandingError('AUTONOMOUS_ENV_REQUIRED', name);
  return value;
};
const repository = required('GITHUB_REPOSITORY');
const token = required('GITHUB_TOKEN');
const eventPath = required('GITHUB_EVENT_PATH');
const eventName = required('GITHUB_EVENT_NAME');
const runAttempt = required('GITHUB_RUN_ATTEMPT');
const ledgerTable = required('KIDULTS_AUTONOMOUS_LANDING_LEDGER_TABLE');
const ledgerWriterFunction = required('KIDULTS_AUTONOMOUS_LANDING_LEDGER_WRITER_FUNCTION');
const signingKeyArn = required('KIDULTS_AUTONOMOUS_SIGNING_KEY_ARN');
const workloadEnvironment = required('KIDULTS_AUTONOMOUS_ENVIRONMENT');
const workloadId = required('KIDULTS_AUTONOMOUS_WORKLOAD_ID');
const workflowRef = required('KIDULTS_AUTONOMOUS_WORKFLOW_REF');
const repositoryId = required('KIDULTS_AUTONOMOUS_REPOSITORY_ID');
const mode = required('KIDULTS_AUTONOMOUS_MODE');
if (!['APPROVAL','FINALIZE'].includes(mode)) throw new AutonomousLandingError('AUTONOMOUS_MODE_INVALID');
// The default Actions token does not emit downstream push workflows on merge.
// Only the finalizer may request a short-lived installation token from its
// separately governed AWS broker, before reserving one-use merge authority.
const receiptPath = process.env.AUTONOMOUS_LANDING_RECEIPT_PATH || 'out/autonomous-internal-landing-v1/receipt.json';
const policy = JSON.parse(fs.readFileSync('coordination/kidults/governance/autonomous-internal-landing-policy-v1.json','utf8'));
const registry = JSON.parse(required('KIDULTS_AUTONOMOUS_WORKLOAD_REGISTRY_JSON'));
const event = JSON.parse(fs.readFileSync(eventPath,'utf8'));
const attemptNumber = Number(runAttempt);
const maximumAttempts = Number(policy.bounded_recovery?.maximum_attempts || 1);
if (!Number.isInteger(attemptNumber) || attemptNumber < 1 || attemptNumber > maximumAttempts) {
  throw new AutonomousLandingError('AUTONOMOUS_ATTEMPT_LIMIT_EXCEEDED');
}
if (eventName !== 'repository_dispatch') throw new AutonomousLandingError('AUTONOMOUS_NORMAL_EVENT_REQUIRED');

if (event.client_payload?.envelope?.workload !== undefined) throw new AutonomousLandingError('AUTONOMOUS_CALLER_WORKLOAD_FORBIDDEN');
let envelope = validateEnvelope(event.client_payload?.envelope,{policy});
const approvalRole = mode === 'APPROVAL' ? required('KIDULTS_AUTONOMOUS_APPROVAL_ROLE') : null;
const dispatchBinding = validateDispatchEvent({
  eventAction:event.action,
  envelope,
  dispatch:event.client_payload?.dispatch,
  role:approvalRole,
});
envelope={...envelope,dispatch_id:dispatchBinding.dispatch_id,dispatch_idempotency_key:dispatchBinding.idempotency_key};
const runtimeWorkload = {
  workload_id:workloadId,
  environment:workloadEnvironment,
  workflow_ref:workflowRef,
  workflow_sha:required('GITHUB_SHA'),
  repository_id:repositoryId,
  signing_key_arn:signingKeyArn,
};
const runtimeRole = mode === 'APPROVAL' ? approvalRole : 'FINALIZER';
validateWorkload(runtimeWorkload,registry,runtimeRole);
if (mode === 'FINALIZE' && workloadEnvironment !== 'KIDULTS-AUTONOMOUS-FINALIZER') {
  throw new AutonomousLandingError('AUTONOMOUS_FINALIZER_ENVIRONMENT_MISMATCH');
}
if (envelope.repository !== repository || String(envelope.repository_id) !== repositoryId) {
  throw new AutonomousLandingError('AUTONOMOUS_REPOSITORY_MISMATCH');
}
if (mode === 'APPROVAL') envelope = {...envelope,workload:runtimeWorkload};

const api = async (endpoint, options={}) => {
  const response = await fetch(`https://api.github.com/repos/${repository}${endpoint}`,{
    ...options,
    redirect:'error',
    headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'kidults-autonomous-internal-landing-v1',...(options.headers||{})},
  });
  const payload = response.status===204 ? null : await response.json().catch(()=>null);
  if (!response.ok) throw new AutonomousLandingError(`AUTONOMOUS_GITHUB_API_${response.status}`,endpoint);
  return payload;
};
const encodePath=value=>value.split('/').map(encodeURIComponent).join('/');
const immutableContent=async (filename,ref) => {
  const payload=await api(`/contents/${encodePath(filename)}?ref=${ref}`);
  if(payload?.type!=='file'||payload.encoding!=='base64'||typeof payload.content!=='string') throw new AutonomousLandingError('AUTONOMOUS_IMMUTABLE_BLOB_INVALID',filename);
  return Buffer.from(payload.content.replace(/\n/g,''),'base64').toString('utf8');
};
const attachImmutableContents=async files=>Promise.all(files.map(async file=>{
  if(file.status==='removed'||file.status==='renamed') throw new AutonomousLandingError('AUTONOMOUS_OWNER_RESERVED_ACTION',`${file.filename}:${String(file.status).toUpperCase()}`);
  return {...file,
    base_content:file.status==='added'?'':await immutableContent(file.filename,envelope.base_sha),
    head_content:await immutableContent(file.filename,envelope.head_sha),
  };
}));
const graphql = async (query, variables, mutationToken) => {
  if(mode!=='FINALIZE'||typeof mutationToken!=='string'||!mutationToken||mutationToken===token) {
    throw new AutonomousLandingError('AUTONOMOUS_READY_EVENT_TOKEN_REQUIRED');
  }
  const response = await fetch('https://api.github.com/graphql',{
    method:'POST',redirect:'error',
    headers:{Authorization:`Bearer ${mutationToken}`,Accept:'application/vnd.github+json','Content-Type':'application/json','User-Agent':'kidults-autonomous-internal-landing-v1'},
    body:JSON.stringify({query,variables}),
  });
  const payload=await response.json().catch(()=>null);
  if (!response.ok || !payload || (Array.isArray(payload.errors)&&payload.errors.length)) {
    throw new AutonomousLandingError(`AUTONOMOUS_GITHUB_GRAPHQL_${response.status}`,'markPullRequestReadyForReview');
  }
  return payload.data;
};
const awsJson = (args,env=process.env) => JSON.parse(execFileSync('aws',args,{encoding:'utf8',timeout:30000,env,stdio:['ignore','pipe','pipe']}));
const awsText = args => execFileSync('aws',args,{encoding:'utf8',timeout:30000,env:process.env,stdio:['ignore','pipe','pipe']}).trim();
let ledgerWriterInvocation = 0;
const invokeLedgerWriter = payload => {
  const runnerTemp = required('RUNNER_TEMP');
  const outputPath = path.join(runnerTemp, `kidults-ledger-writer-${process.pid}-${++ledgerWriterInvocation}.json`);
  try {
    const metadata = awsJson([
      'lambda','invoke','--region','ap-northeast-2','--function-name',ledgerWriterFunction,
      '--cli-binary-format','raw-in-base64-out','--payload',JSON.stringify(payload),
      '--output','json',outputPath,
    ]);
    if (metadata.FunctionError) throw new AutonomousLandingError('AUTONOMOUS_LEDGER_WRITER_FUNCTION_ERROR',metadata.FunctionError);
    const response = JSON.parse(fs.readFileSync(outputPath,'utf8'));
    if (response?.ok !== true) throw new AutonomousLandingError('AUTONOMOUS_LEDGER_WRITER_REJECTED',payload.action);
    return response;
  } catch (error) {
    if (error instanceof AutonomousLandingError) throw error;
    throw new AutonomousLandingError('AUTONOMOUS_LEDGER_WRITER_FAILURE',payload.action);
  } finally {
    try { fs.unlinkSync(outputPath); } catch {}
  }
};
const acquireEventToken = async () => {
  const broker = required('KIDULTS_AUTONOMOUS_EVENT_TOKEN_BROKER_FUNCTION');
  const brokerRole = required('KIDULTS_AUTONOMOUS_EVENT_BROKER_ROLE_ARN');
  const privateDir = fs.mkdtempSync(path.join(required('RUNNER_TEMP'),'kidults-event-broker-'));
  const outputPath = path.join(privateDir,'response.json');
  const identityPath = path.join(privateDir,'identity.jwt');
  try {
    const fd=fs.openSync(outputPath,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600);
    const outputIdentity=fs.fstatSync(fd);
    fs.closeSync(fd);
    if (!outputIdentity.isFile() || (outputIdentity.mode&0o777)!==0o600) throw new AutonomousLandingError('AUTONOMOUS_EVENT_TOKEN_FILE_UNSAFE');
    const identityResponse=await fetch(`${required('ACTIONS_ID_TOKEN_REQUEST_URL')}&audience=sts.amazonaws.com`,{
      headers:{Authorization:`Bearer ${required('ACTIONS_ID_TOKEN_REQUEST_TOKEN')}`},redirect:'error',signal:AbortSignal.timeout(10000)});
    if (!identityResponse.ok) throw new AutonomousLandingError('AUTONOMOUS_EVENT_BROKER_IDENTITY_UNAVAILABLE');
    const identity=(await identityResponse.json()).value;
    if(typeof identity!=='string'||identity.length<100) throw new AutonomousLandingError('AUTONOMOUS_EVENT_BROKER_IDENTITY_INVALID');
    fs.writeFileSync(identityPath,identity,{flag:'wx',mode:0o600});
    const isolatedEnv={...process.env,AWS_ROLE_ARN:brokerRole,AWS_WEB_IDENTITY_TOKEN_FILE:identityPath,
      AWS_ROLE_SESSION_NAME:`kidults-event-broker-${required('GITHUB_RUN_ID')}`};
    for(const name of ['AWS_ACCESS_KEY_ID','AWS_SECRET_ACCESS_KEY','AWS_SESSION_TOKEN','AWS_PROFILE']) delete isolatedEnv[name];
    const metadata = awsJson([
      'lambda','invoke','--region','ap-northeast-2','--function-name',broker,
      '--cli-binary-format','raw-in-base64-out',
      '--payload',JSON.stringify({action:'MINT_INSTALLATION_TOKEN',repository,repository_id:repositoryId,
        pull_request:envelope.pull_request,base_sha:envelope.base_sha,head_sha:envelope.head_sha,
        authorization_generation:envelope.authorization_generation}),
      '--output','json',outputPath,
    ],isolatedEnv);
    if (metadata.FunctionError) throw new AutonomousLandingError('AUTONOMOUS_EVENT_TOKEN_BROKER_ERROR');
    const actualOutput=fs.lstatSync(outputPath);
    if (!actualOutput.isFile() || actualOutput.isSymbolicLink() || actualOutput.ino!==outputIdentity.ino
      || actualOutput.dev!==outputIdentity.dev || (actualOutput.mode&0o777)!==0o600)
      throw new AutonomousLandingError('AUTONOMOUS_EVENT_TOKEN_FILE_UNSAFE');
    const responseBytes=fs.readFileSync(outputPath,'utf8');
    fs.unlinkSync(outputPath);
    const response=JSON.parse(responseBytes);
    const expiresAt=Date.parse(response.expires_at);
    if (response.ok!==true || response.token_type!=='GITHUB_APP_INSTALLATION'
      || response.repository!==repository || String(response.repository_id)!==repositoryId
      || !Array.isArray(response.permissions)
      || !['contents:write','pull_requests:write','metadata:read'].every(x=>response.permissions.includes(x))
      || typeof response.token!=='string' || response.token.length<20 || response.token===token
      || !Number.isFinite(expiresAt) || expiresAt<Date.now()+10*60*1000)
      throw new AutonomousLandingError('AUTONOMOUS_EVENT_TOKEN_INVALID');
    return response.token;
  } catch(error) {
    if (error instanceof AutonomousLandingError) throw error;
    throw new AutonomousLandingError('AUTONOMOUS_EVENT_TOKEN_BROKER_UNAVAILABLE');
  } finally {
    try {fs.unlinkSync(outputPath);} catch {}
    try {fs.unlinkSync(identityPath);} catch {}
    try {fs.rmdirSync(privateDir);} catch {}
  }
};
const kmsSignCanonical = (value, failureCode) => {
  const runnerTemp = required('RUNNER_TEMP');
  const digestPath = path.join(runnerTemp, `kidults-autonomous-signing-digest-${process.pid}-${Date.now()}.bin`);
  try {
    const payload = canonicalJson(value);
    fs.writeFileSync(digestPath,Buffer.from(sha256(payload).slice(7),'hex'),{mode:0o600});
    const signatureB64 = awsText([
      'kms','sign','--region','ap-northeast-2','--key-id',signingKeyArn,
      '--message',`fileb://${digestPath}`,'--message-type','DIGEST',
      '--signing-algorithm','ECDSA_SHA_256','--query','Signature','--output','text',
    ]);
    if (!/^[A-Za-z0-9+/=]+$/.test(signatureB64)) throw new AutonomousLandingError(failureCode);
    return signatureB64;
  } finally {
    try { fs.unlinkSync(digestPath); } catch {}
  }
};
const putApproval = () => {
  const envelopeJson = canonicalJson(envelope);
  const exactExisting = () => {
    const existing=readApprovals()[approvalRole];
    if (!existing) return false;
    if (canonicalJson(existing)!==envelopeJson) throw new AutonomousLandingError('AUTONOMOUS_APPROVAL_REPLAY_BINDING_MISMATCH',approvalRole);
    return true;
  };
  if (exactExisting()) return 'APPROVAL_ALREADY_RECORDED';
  try {
    invokeLedgerWriter({
      action:'CREATE_APPROVAL',
      authorization_generation:envelope.authorization_generation,
      role:approvalRole,
      workload_id:envelope.workload.workload_id,
      signing_key_arn:signingKeyArn,
      signature_b64:kmsSignCanonical(envelope,'AUTONOMOUS_APPROVAL_SIGNATURE_INVALID'),
      envelope_b64:Buffer.from(envelopeJson).toString('base64'),
      envelope_digest:sha256(envelopeJson),
      expires_at_epoch:String(Math.floor(Date.parse(envelope.expires_at)/1000)),
    });
    return 'APPROVAL_RECORDED';
  } catch (error) {
    if (exactExisting()) return 'APPROVAL_ALREADY_RECORDED';
    if (error instanceof AutonomousLandingError) throw error;
    throw new AutonomousLandingError('AUTONOMOUS_APPROVAL_DUPLICATE_OR_LEDGER_FAILURE',approvalRole);
  }
};
const invokeFinalizerWriter = payload => {
  const signedPayload = {
    ...payload,
    finalizer_workload_id:runtimeWorkload.workload_id,
    finalizer_environment:runtimeWorkload.environment,
    signing_key_arn:signingKeyArn,
  };
  return invokeLedgerWriter({
    ...signedPayload,
    signature_b64:kmsSignCanonical(signedPayload,'AUTONOMOUS_FINALIZER_SIGNATURE_INVALID'),
  });
};
const readApprovals = () => {
  const response=awsJson(['dynamodb','query','--region','ap-northeast-2','--table-name',ledgerTable,
    '--key-condition-expression','pk = :pk','--expression-attribute-values',JSON.stringify({':pk':{S:`AUTH#${envelope.authorization_generation}`}}),'--consistent-read','--output','json']);
  const values={};
  for (const item of response.Items||[]) {
    const itemRole=String(item.sk?.S||'').replace(/^ROLE#/,'');
    if (item.envelope?.S) values[itemRole]=JSON.parse(Buffer.from(item.envelope.S,'base64').toString('utf8'));
  }
  return values;
};
const readGenerationApprovals = generation => {
  const response=awsJson(['dynamodb','query','--region','ap-northeast-2','--table-name',ledgerTable,
    '--key-condition-expression','pk = :pk','--expression-attribute-values',JSON.stringify({':pk':{S:`AUTH#${generation}`}}),'--consistent-read','--output','json']);
  const values={};
  for (const item of response.Items||[]) {
    const itemRole=String(item.sk?.S||'').replace(/^ROLE#/,'');
    if (item.envelope?.S) values[itemRole]=JSON.parse(Buffer.from(item.envelope.S,'base64').toString('utf8'));
  }
  return values;
};
const writeReceipt = receipt => {
  fs.mkdirSync(path.dirname(receiptPath),{recursive:true,mode:0o700});
  fs.writeFileSync(receiptPath,`${JSON.stringify(receipt,null,2)}\n`,{encoding:'utf8',mode:0o600});
  fs.chmodSync(receiptPath,0o600);
};
const sealImmutableReceipt = receipt => {
  if (mode !== 'FINALIZE') throw new AutonomousLandingError('AUTONOMOUS_IMMUTABLE_RECEIPT_FINALIZER_ONLY');
  return sealAutonomousTerminal({receipt,bucket:required('KIDULTS_AUTONOMOUS_RECEIPT_BUCKET'),
    keyArn:required('KIDULTS_AUTONOMOUS_RECEIPT_KEY_ARN'),aws:awsJson,tempRoot:required('RUNNER_TEMP')});
};
let terminalEvidence=null;

let statusTouched=false;
let mergePerformed=false;
let mergeSha=null;
const publishLandingStatus = async (state, description) => {
  await api(`/statuses/${envelope.head_sha}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
    state,context:'KIDULTS Governed Landing Authorization V1',description:String(description).slice(0,140),
    target_url:`https://github.com/${repository}/actions/runs/${required('GITHUB_RUN_ID')}`,
  })});
  statusTouched=true;
};
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const waitForExactMergeShaValidation = async (mergeSha, mergedAt) => {
  const suitePolicy = JSON.parse(fs.readFileSync(policy.merge.postmerge_push_suite_policy, 'utf8'));
  const timeoutSeconds=Number(policy.merge.postmerge_validation_timeout_seconds||420);
  const deadline=Date.now()+timeoutSeconds*1000;
  while (Date.now()<deadline) {
    const runs = [];
    let exhausted = false;
    for (let page = 1; page <= suitePolicy.max_pages; page += 1) {
      const payload = await api(`/actions/runs?branch=main&head_sha=${mergeSha}&per_page=100&page=${page}`);
      if (!Array.isArray(payload.workflow_runs)) throw new AutonomousLandingError('AUTONOMOUS_POSTMERGE_RUNS_INVALID');
      runs.push(...payload.workflow_runs);
      if (payload.workflow_runs.length < 100) { exhausted = true; break; }
    }
    if (!exhausted) throw new AutonomousLandingError('AUTONOMOUS_POSTMERGE_PAGINATION_LIMIT');
    const result = evaluateAutonomousPostmerge(runs, suitePolicy, mergeSha, mergedAt);
    if (result.state === 'VERIFIED_FAIL') throw new AutonomousLandingError('AUTONOMOUS_POSTMERGE_CHECK_FAILED');
    if (result.state === 'VERIFIED_PASS') return result;
    await sleep(5000);
  }
  throw new AutonomousLandingError('AUTONOMOUS_POSTMERGE_CHECK_TIMEOUT');
};
const openAutomaticRollback = async failureCode => {
  const liveMain=await api('/branches/main');
  if (!mergePerformed||!mergeSha||liveMain.commit?.sha!==mergeSha) {
    return {state:'OWNER_HOLD',reason:'MAIN_ADVANCED_OR_MERGE_NOT_BOUND'};
  }
  const baseCommit=await api(`/git/commits/${envelope.base_sha}`);
  const rollback=await api('/git/commits',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
    message:`revert: quarantine autonomous landing PR #${envelope.pull_request}\n\nFailure: ${failureCode}`,
    tree:baseCommit.tree.sha,
    parents:[mergeSha],
  })});
  const branch=`kidults-autorevert/pr-${envelope.pull_request}-${required('GITHUB_RUN_ID')}`;
  await api('/git/refs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ref:`refs/heads/${branch}`,sha:rollback.sha})});
  const rollbackPr=await api('/pulls',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
    title:`[AUTO-QUARANTINE] Revert PR #${envelope.pull_request}`,
    head:branch,
    base:'main',
    draft:false,
    body:`Automated fail-closed rollback.\n\nOriginal PR: #${envelope.pull_request}\nMerge: ${mergeSha}\nFailure: ${failureCode}\nProduction/Public/G5: HOLD`,
  })});
  return {state:'ROLLBACK_PR_OPENED',pull_request:rollbackPr.number,url:rollbackPr.html_url,rollback_sha:rollback.sha};
};
const collectCheckRuns = async sha => {
  const values=[];
  for(let page=1;page<=30;page++){
    const payload=await api(`/commits/${sha}/check-runs?filter=all&per_page=100&page=${page}`);
    const batch=payload?.check_runs;
    if(!Array.isArray(batch)) throw new AutonomousLandingError('AUTONOMOUS_CHECK_PAGINATION_INVALID');
    values.push(...batch);
    if(batch.length<100) return values;
  }
  throw new AutonomousLandingError('AUTONOMOUS_CHECK_PAGINATION_LIMIT');
};
const liveRequiredChecks = async ({includeLandingStatus=true,draftDevelopment=false}={}) => {
  const rulesets=await api('/rulesets');
  const solo=(rulesets||[]).find(value=>value.name==='KAIOS Solo Owner Preflight'&&value.enforcement==='active');
  if(!solo) throw new AutonomousLandingError('AUTONOMOUS_REQUIRED_RULESET_MISSING');
  const detail=await api(`/rulesets/${solo.id}`);
  if((detail.bypass_actors||[]).length) throw new AutonomousLandingError('AUTONOMOUS_RULESET_BYPASS_FORBIDDEN');
  const rule=(detail.rules||[]).find(value=>value.type==='required_status_checks');
  if(!rule?.parameters?.strict_required_status_checks_policy) throw new AutonomousLandingError('AUTONOMOUS_STRICT_REQUIRED_STATUS_POLICY_REQUIRED');
  let all=(rule.parameters.required_status_checks||[]).map(value=>({context:String(value.context),integration_id:Number(value.integration_id||value.app_id||0)}))
    .sort((a,b)=>a.context.localeCompare(b.context)||a.integration_id-b.integration_id);
  if(!includeLandingStatus) all=all.filter(value=>value.context!=='KIDULTS Governed Landing Authorization V1');
  if(draftDevelopment) all=all.map(value=>value.context==='KIDULTS Scope-Aware Authoritative Status V1'
    ? {context:'KIDULTS Draft Development Validation V1',integration_id:value.integration_id}
    : value);
  return all;
};

const validateLiveCandidate = async ({allowDraft=false,includeLandingStatus=true,requireEnvelopeBinding=true}={}) => {
  const pr=await api(`/pulls/${envelope.pull_request}`);
  if (pr.state!=='open'||pr.merged===true||(!allowDraft&&pr.draft===true)||pr.base?.sha!==envelope.base_sha||pr.head?.sha!==envelope.head_sha) throw new AutonomousLandingError('AUTONOMOUS_PR_DRIFT');
  const commit=await api(`/git/commits/${envelope.head_sha}`);
  if (commit.tree?.sha!==envelope.head_tree_sha) throw new AutonomousLandingError('AUTONOMOUS_TREE_DRIFT');
  const fileRecords=await collectPaginatedApiValues({request:api,endpoint:`/pulls/${envelope.pull_request}/files`});
  const files=await attachImmutableContents(fileRecords);
  validateLiveChangedPaths({files,expectedPaths:envelope.changed_paths,expectedScopeDigest:envelope.scope_digest,policy,scopeDriftCode:'AUTONOMOUS_LIVE_SCOPE_DRIFT'});
  const envelopeRequiredSource=envelope.test_evidence?.required_contexts||envelope.test_evidence?.required_evidence||[];
  const envelopeRequiresDraftDevelopment=envelopeRequiredSource.some(value=>(typeof value==='string'?value:String(value?.context||''))==='KIDULTS Draft Development Validation V1');
  const [status,checks,requiredChecks]=await Promise.all([
    api(`/commits/${envelope.head_sha}/status`),
    collectCheckRuns(envelope.head_sha),
    liveRequiredChecks({includeLandingStatus,draftDevelopment:requireEnvelopeBinding?envelopeRequiresDraftDevelopment:pr.draft===true}),
  ]);
  const authoritativeStatuses=(status.statuses||[]).map(value=>({...value,sha:value.sha||envelope.head_sha}));
  const authoritativeChecks=checks;
  if (!authoritativeStatuses.length&&!authoritativeChecks.length) throw new AutonomousLandingError('AUTONOMOUS_REQUIRED_STATUS_MISSING');
 const envelopeRequired=envelopeRequiredSource.map(value=>typeof value==='string'?{context:value,integration_id:0}:{context:String(value.context),integration_id:Number(value.integration_id||value.app_id||0)})
    .sort((a,b)=>a.context.localeCompare(b.context)||a.integration_id-b.integration_id);
  if(requireEnvelopeBinding) {
    const liveByContext=new Map(requiredChecks.map(value=>[value.context,value]));
    const envelopeByContext=new Map(envelopeRequired.map(value=>[value.context,value]));
    if(liveByContext.size!==requiredChecks.length || envelopeByContext.size!==envelopeRequired.length
      || canonicalJson([...liveByContext.keys()].sort())!==canonicalJson([...envelopeByContext.keys()].sort())) {
      throw new AutonomousLandingError('AUTONOMOUS_REQUIRED_SET_DRIFT');
    }
    for (const [context,live] of liveByContext) {
      const dispatched=envelopeByContext.get(context);
      if (!dispatched || (live.integration_id>0 && live.integration_id!==dispatched.integration_id)) {
        throw new AutonomousLandingError('AUTONOMOUS_REQUIRED_SET_DRIFT',context);
      }
    }
  }
  const bindingRequired=requireEnvelopeBinding?envelopeRequired:requiredChecks;
  const bound=bindRequiredGateEvidence({required:bindingRequired,checks:authoritativeChecks,statuses:authoritativeStatuses,headSha:envelope.head_sha,
    fail:(code,context)=>{throw new AutonomousLandingError(code==='REQUIRED_CONTEXT_MISSING'?'AUTONOMOUS_REQUIRED_STATUS_MISSING':
      code==='REQUIRED_CONTEXT_AMBIGUOUS'?'AUTONOMOUS_REQUIRED_CHECK_AMBIGUOUS':
      code==='REQUIRED_STATUS_NOT_GREEN'?'AUTONOMOUS_REQUIRED_STATUS_NOT_GREEN':`AUTONOMOUS_${code}`,context);}});
  if(requireEnvelopeBinding) {
    const dispatched=envelope.test_evidence?.required_check_runs||envelope.test_evidence?.required_evidence||[];
    if(bound.length!==dispatched.length || bound.some((value,index)=>!sameRequiredGateEvidenceAuthority(value,dispatched[index]))) throw new AutonomousLandingError('AUTONOMOUS_REQUIRED_CHECK_IDENTITY_DRIFT');
  }
  validateRequiredGateSemanticEvidence({bindings:bound,checks:authoritativeChecks,fail:()=>{throw new AutonomousLandingError('AUTONOMOUS_CANONICAL_SEMANTIC_STATE_NOT_VERIFIED');}});
  return {pr,commit,files,statuses:authoritativeStatuses,checks:authoritativeChecks,required_contexts:requiredChecks.map(value=>value.context),required_bindings:requiredChecks};
};
const waitForReadyCandidate = async () => {
  const timeoutSeconds=Number(policy.bounded_recovery?.draft_ready_validation_timeout_seconds||420);
  const deadline=Date.now()+timeoutSeconds*1000;
  while (Date.now()<deadline) {
    try { return await validateLiveCandidate({includeLandingStatus:false,requireEnvelopeBinding:false}); }
    catch (error) {
      if (!(error instanceof AutonomousLandingError)||!['AUTONOMOUS_REQUIRED_STATUS_MISSING','AUTONOMOUS_REQUIRED_STATUS_NOT_GREEN'].includes(error.code)) throw error;
    }
    await sleep(5000);
  }
  throw new AutonomousLandingError('AUTONOMOUS_DRAFT_READY_CHECK_TIMEOUT');
};
const mergeReadinessReadyStates = new Set(['clean','unstable']);
const waitForGovernedLandingMergeReadiness = async () => {
  const timeoutSeconds=Number(policy.bounded_recovery?.normal_ops_finalizer?.merge_readiness_timeout_seconds||180);
  const pollMs=Number(policy.bounded_recovery?.normal_ops_finalizer?.merge_readiness_poll_ms||5000);
  const deadline=Date.now()+timeoutSeconds*1000;
  let last={state:'NOT_CHECKED'};
  while (Date.now()<deadline) {
    const candidate=await validateLiveCandidate({allowDraft:true,includeLandingStatus:true,requireEnvelopeBinding:false});
    const mergeableState=String(candidate.pr.mergeable_state||'unknown').toLowerCase();
    last={state:'WAITING',mergeable:Object.hasOwn(candidate.pr,'mergeable')?candidate.pr.mergeable:null,mergeable_state:mergeableState,draft:candidate.pr.draft===true,pr_state:candidate.pr.state};
    if(candidate.pr.state==='open'&&candidate.pr.draft!==true&&candidate.pr.mergeable===true&&mergeReadinessReadyStates.has(mergeableState)) {
      return {state:'MERGE_READY',mergeable_state:mergeableState};
    }
    await sleep(pollMs);
  }
  throw new AutonomousLandingError('AUTONOMOUS_MERGE_READINESS_TIMEOUT',canonicalJson(last).slice(0,500));
};
const rebindDraftReady = async (before, mutationToken) => {
  if (before.draft!==true) return {state:'ALREADY_READY',head_sha:envelope.head_sha};
  await graphql('mutation($pullRequestId:ID!){markPullRequestReadyForReview(input:{pullRequestId:$pullRequestId}){pullRequest{id number isDraft state headRefOid baseRefOid}}}',{pullRequestId:before.node_id},mutationToken);
  const after=await api(`/pulls/${envelope.pull_request}`);
  return validateDraftReadyRebind({before,after,envelope,policy});
};

try {
  if (mode === 'APPROVAL') {
    const candidate=await validateLiveCandidate({allowDraft:true,includeLandingStatus:false});
    if (approvalRole==='INDEPENDENT_VERIFIER') independentlyVerifyCapabilityDelta({files:candidate.files,policy});
    envelope=deriveApprovalDecision({envelope,role:approvalRole,statuses:candidate.statuses,checks:candidate.checks,requiredContexts:candidate.required_bindings,headSha:envelope.head_sha});
    if (envelope.recovery) {
      const priorApprovals=readGenerationApprovals(envelope.recovery.prior_authorization_generation);
      const prior=priorApprovals.KPMO || priorApprovals.ACCOUNTABLE_TRACK_AGENT || priorApprovals.INDEPENDENT_VERIFIER;
      validateRecoveryGeneration({prior,current:envelope,history:Object.values(priorApprovals).map(value=>({authorization_generation:value.authorization_generation,state:value.ledger_state||'APPROVAL_RECORDED'})),policy});
    }
    const approvalState=putApproval();
    const approvalReceipt = {
      id:'kidults-autonomous-internal-landing-approval-receipt-v1',
      version:'1.0.0',
      state:approvalState,
      authorization_generation:envelope.authorization_generation,
      dispatch_id:envelope.dispatch_id,
      dispatcher_run_id:event.client_payload.dispatch.transport.github_run_id,
      dispatcher_run_attempt:event.client_payload.dispatch.transport.github_run_attempt,
      received_role:approvalRole,
      workload_id:runtimeWorkload.workload_id,
      signing_key_arn:runtimeWorkload.signing_key_arn,
      production:'HOLD',public:'HOLD',g5:'HOLD',
    };
    writeReceipt(approvalReceipt);
    console.log(JSON.stringify(approvalReceipt));
  } else {
    const quorumDeadline=Date.now()+Number(policy.bounded_recovery?.finalizer_quorum_wait_seconds||90)*1000;
    let approvals=readApprovals();
    let missing=['ACCOUNTABLE_TRACK_AGENT','KPMO','INDEPENDENT_VERIFIER'].filter(value=>!approvals[value]);
    while(missing.length && Date.now()<quorumDeadline){
      await sleep(3000);
      approvals=readApprovals();
      missing=['ACCOUNTABLE_TRACK_AGENT','KPMO','INDEPENDENT_VERIFIER'].filter(value=>!approvals[value]);
    }
    if (missing.length) {
      const waiting = {
        id:'kidults-autonomous-internal-landing-terminal-receipt-v1',
        version:'1.0.0',
        state:'AWAITING_QUORUM',
        authorization_generation:envelope.authorization_generation,
        finalizer_workload_id:runtimeWorkload.workload_id,
        missing_roles:missing,
        production:'HOLD',public:'HOLD',g5:'HOLD',
      };
      writeReceipt(waiting);
      console.log(JSON.stringify(waiting));
    } else {
      const quorum=validateQuorum({track:approvals.ACCOUNTABLE_TRACK_AGENT,kpmo:approvals.KPMO,verifier:approvals.INDEPENDENT_VERIFIER,registry,policy});
      envelope=approvals.KPMO;
      const finalizerRunId=required('GITHUB_RUN_ID');
      const electedWorkflow=policy.bounded_recovery?.normal_ops_finalizer?.elected_workflow;
      if(required('GITHUB_WORKFLOW')!==electedWorkflow){
        const follower={id:'kidults-autonomous-internal-landing-terminal-receipt-v1',version:'1.0.0',state:'FINALIZER_ROLE_FOLLOWER',authorization_generation:envelope.authorization_generation,finalizer_run_id:finalizerRunId,elected_workflow:electedWorkflow,merge_performed:false,production:'HOLD',public:'HOLD',g5:'HOLD'};
        writeReceipt(follower);
        console.log(JSON.stringify(follower));
        process.exit(0);
      }
      const candidate=await validateLiveCandidate({allowDraft:true,includeLandingStatus:false});
      const eventToken=await acquireEventToken();
      await validateLiveCandidate({allowDraft:true,includeLandingStatus:false});
      let reservation;
      const writerAttempts=Number(policy.bounded_recovery?.normal_ops_finalizer?.writer_retry_attempts||3);
      for(let attempt=1;attempt<=writerAttempts;attempt+=1){
        try {
          reservation=invokeFinalizerWriter({
            action:'CREATE_RESERVATION',
            authorization_generation:envelope.authorization_generation,
            nonce_digest:envelope.nonce_digest,
            run_id:finalizerRunId,
            head_sha:envelope.head_sha,
          });
          break;
        } catch(error) {
          if(!(error instanceof AutonomousLandingError) || error.code!=='AUTONOMOUS_LEDGER_WRITER_FAILURE' || attempt===writerAttempts) throw error;
          await sleep(Number(policy.bounded_recovery?.normal_ops_finalizer?.writer_retry_delay_seconds||5)*1000);
        }
      }
      if(reservation?.state==='ALREADY_RESERVED' && String(reservation.owner_run_id)!==finalizerRunId){
        const follower={id:'kidults-autonomous-internal-landing-terminal-receipt-v1',version:'1.0.0',state:'FINALIZER_FOLLOWER',authorization_generation:envelope.authorization_generation,reservation_owner_run_id:String(reservation.owner_run_id),finalizer_run_id:finalizerRunId,merge_performed:false,production:'HOLD',public:'HOLD',g5:'HOLD'};
        writeReceipt(follower);
        console.log(JSON.stringify(follower));
        process.exit(0);
      }
      if(!['RESERVED','ALREADY_RESERVED'].includes(reservation?.state)) throw new AutonomousLandingError('AUTONOMOUS_RESERVATION_STATE_INVALID');
      await publishLandingStatus('pending','AI-020 quorum verified; durable authority reserved');
      const lifecycle=await rebindDraftReady(candidate.pr,eventToken);
      await waitForReadyCandidate();
      await publishLandingStatus('success','AI-020 exact-head internal reversible landing authorized');
      await waitForGovernedLandingMergeReadiness();
      const merge=await api(`/pulls/${envelope.pull_request}/merge`,{method:'PUT',headers:{'Content-Type':'application/json',Authorization:`Bearer ${eventToken}`},body:JSON.stringify({sha:envelope.head_sha,merge_method:'merge',commit_title:`Autonomous internal landing PR #${envelope.pull_request}`})});
      if (merge?.merged!==true||!/^[0-9a-f]{40}$/.test(merge.sha||'')) throw new AutonomousLandingError('AUTONOMOUS_MERGE_REJECTED');
      mergePerformed=true;
      mergeSha=merge.sha;
      const [mergedPr,main,mergeCommit]=await Promise.all([api(`/pulls/${envelope.pull_request}`),api('/branches/main'),api(`/git/commits/${merge.sha}`)]);
      if (mergedPr.merged!==true||main.commit?.sha!==merge.sha||mergeCommit.tree?.sha!==envelope.head_tree_sha) throw new AutonomousLandingError('AUTONOMOUS_POSTMERGE_BINDING_FAILED');
      const postmerge=await waitForExactMergeShaValidation(merge.sha, mergedPr.merged_at);
      invokeFinalizerWriter({
        action:'CONSUME_RESERVATION',
        authorization_generation:envelope.authorization_generation,
        nonce_digest:envelope.nonce_digest,
        run_id:required('GITHUB_RUN_ID'),
        head_sha:envelope.head_sha,
        merge_sha:merge.sha,
      });
      const terminal=buildTerminalReceipt({quorum:{...quorum,lifecycle},reservation:{state:'CONSUMED',conditional_write:true,backend:'AWS_DYNAMODB'},
        merge:{merge_sha:merge.sha,main_sha:main.commit.sha,head_sha:envelope.head_sha,tree_sha:mergeCommit.tree.sha},postmerge});
      terminalEvidence=terminal;
      writeReceipt({...terminal,immutable_copy:{state:'PENDING_RECONCILIATION'}});
      const immutableCopy=sealImmutableReceipt(terminal);
      const sealedTerminal={...terminal,immutable_copy:immutableCopy};
      terminalEvidence=sealedTerminal;
      writeReceipt(sealedTerminal);
      await api('/dispatches',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${eventToken}`},body:JSON.stringify({event_type:policy.merge.explicit_completion_event,client_payload:{pull_request:Number(envelope.pull_request),merge_sha:merge.sha,receipt_digest:terminal.receipt_digest,immutable_receipt_version_id:immutableCopy.version_id}})});
      writeReceipt(sealedTerminal);
      console.log(JSON.stringify({state:terminal.state,merge_sha:merge.sha,receipt_digest:terminal.receipt_digest,immutable_copy:immutableCopy,production:'HOLD',public:'HOLD',g5:'HOLD'}));
    }
  }
} catch (error) {
  if (statusTouched && !terminalEvidence) {
    try { await publishLandingStatus('failure',error.code||error.message||'autonomous landing failed'); } catch {}
  }
  let rollback={state:'NOT_REQUIRED'};
  if (mergePerformed && !terminalEvidence) {
    try { rollback=await openAutomaticRollback(error.code||error.message||'UNKNOWN'); }
    catch (rollbackError) { rollback={state:'OWNER_HOLD',reason:rollbackError.code||rollbackError.message}; }
  }
  const failure={id:'kidults-autonomous-internal-landing-terminal-receipt-v1',version:'1.0.0',state:'QUARANTINED',failure_code:error.code||error.message,
    authorization_generation:envelope.authorization_generation,merge_performed:mergePerformed,merge_sha:mergeSha,rollback,
    terminal_evidence:terminalEvidence,retry_without_reconciliation:false,
    production:'HOLD',public:'HOLD',g5:'HOLD',created_at:new Date().toISOString()};
  writeReceipt(failure);
  throw error;
}
