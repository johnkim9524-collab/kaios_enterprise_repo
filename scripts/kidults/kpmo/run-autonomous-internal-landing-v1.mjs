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

const eventRole = new Map([
  ['kidults.track.authorization.v1','ACCOUNTABLE_TRACK_AGENT'],
  ['kidults.kpmo.authorization.v1','KPMO'],
  ['kidults.independent.verification.v1','INDEPENDENT_VERIFIER'],
]);
const approvalRole = eventRole.get(event.action);
if (!approvalRole) throw new AutonomousLandingError('AUTONOMOUS_EVENT_NOT_ALLOWED');
if (event.client_payload?.envelope?.workload !== undefined) throw new AutonomousLandingError('AUTONOMOUS_CALLER_WORKLOAD_FORBIDDEN');
let envelope = validateEnvelope(event.client_payload?.envelope,{policy});
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
const graphql = async (query, variables) => {
  const response = await fetch('https://api.github.com/graphql',{
    method:'POST',redirect:'error',
    headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','Content-Type':'application/json','User-Agent':'kidults-autonomous-internal-landing-v1'},
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
        authorization_generation:envelope.authorization_generation,
        allow_draft_recovery:Boolean(envelope.recovery)}),
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
  } catch (error) {
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
  const bucket = required('KIDULTS_AUTONOMOUS_RECEIPT_BUCKET');
  const receiptKeyArn = required('KIDULTS_AUTONOMOUS_RECEIPT_KEY_ARN');
  const envelope = {
    id:'kidults-autonomous-internal-landing-immutable-envelope-v1',
    version:'1.0.0',
    receipt,
    receipt_sha256:sha256(canonicalJson(receipt)),
    production:'HOLD',public:'HOLD',g5:'HOLD',
  };
  const bytes = Buffer.from(`${JSON.stringify(envelope,null,2)}\n`,'utf8');
  const checksumSha256 = Buffer.from(sha256(bytes).slice(7),'hex').toString('base64');
  const retainUntil = new Date();
  retainUntil.setUTCFullYear(retainUntil.getUTCFullYear()+10);
  const objectKey = `receipts/${envelope.receipt.authorization_generation}/${envelope.receipt.merge?.merge_sha || 'terminal'}/${envelope.receipt_sha256.slice(7)}.json`;
  const tempPath = path.join(required('RUNNER_TEMP'),`kidults-immutable-receipt-${process.pid}-${Date.now()}.json`);
  try {
    fs.writeFileSync(tempPath,bytes,{mode:0o600});
    const put = awsJson([
      's3api','put-object','--region','ap-northeast-2','--bucket',bucket,'--key',objectKey,
      '--body',tempPath,'--content-type','application/json',
      '--server-side-encryption','aws:kms','--ssekms-key-id',receiptKeyArn,
      '--checksum-algorithm','SHA256','--checksum-sha256',checksumSha256,
      '--object-lock-mode','COMPLIANCE','--object-lock-retain-until-date',retainUntil.toISOString(),
      '--metadata',`receipt-sha256=${envelope.receipt_sha256.slice(7)},exact-head-sha=${envelope.receipt.binding?.head_sha || ''}`,
      '--output','json',
    ]);
    if (!put.VersionId) throw new AutonomousLandingError('AUTONOMOUS_IMMUTABLE_RECEIPT_VERSION_MISSING');
    const head = awsJson([
      's3api','head-object','--region','ap-northeast-2','--bucket',bucket,'--key',objectKey,
      '--version-id',put.VersionId,'--checksum-mode','ENABLED','--output','json',
    ]);
    if (head.ObjectLockMode !== 'COMPLIANCE') throw new AutonomousLandingError('AUTONOMOUS_IMMUTABLE_RECEIPT_MODE_INVALID');
    if (Date.parse(head.ObjectLockRetainUntilDate) < retainUntil.getTime()-1000) throw new AutonomousLandingError('AUTONOMOUS_IMMUTABLE_RECEIPT_RETENTION_INVALID');
    if (head.ServerSideEncryption !== 'aws:kms' || head.SSEKMSKeyId !== receiptKeyArn) throw new AutonomousLandingError('AUTONOMOUS_IMMUTABLE_RECEIPT_ENCRYPTION_INVALID');
    if (head.ChecksumSHA256 !== checksumSha256) throw new AutonomousLandingError('AUTONOMOUS_IMMUTABLE_RECEIPT_CHECKSUM_INVALID');
    return {
      state:'OBJECT_LOCK_COMPLIANCE_VERIFIED',
      bucket,
      key:objectKey,
      version_id:put.VersionId,
      checksum_sha256:checksumSha256,
      receipt_sha256:envelope.receipt_sha256,
      kms_key_arn:receiptKeyArn,
      retain_until:head.ObjectLockRetainUntilDate,
    };
  } catch (error) {
    if (error instanceof AutonomousLandingError) throw error;
    throw new AutonomousLandingError('AUTONOMOUS_IMMUTABLE_RECEIPT_WRITE_FAILED');
  } finally {
    try { fs.unlinkSync(tempPath); } catch {}
  }
};
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
const waitForExactMergeShaValidation = async mergeSha => {
  const timeoutSeconds=Number(policy.merge.postmerge_validation_timeout_seconds||420);
  const deadline=Date.now()+timeoutSeconds*1000;
  while (Date.now()<deadline) {
    const checks=await api(`/commits/${mergeSha}/check-runs?filter=latest&per_page=100`);
    const runs=(checks.check_runs||[]).filter(value=>value.name!=='KIDULTS Autonomous Internal Landing V1');
    const hasNaturalGeneration=runs.some(value=>value.head_sha===mergeSha);
    const pending=runs.some(value=>value.status!=='completed');
    const failed=runs.some(value=>value.status==='completed'&&!['success','neutral','skipped'].includes(value.conclusion));
    if (failed) throw new AutonomousLandingError('AUTONOMOUS_POSTMERGE_CHECK_FAILED');
    if (hasNaturalGeneration&&runs.length>0&&!pending) {
      return {state:'VERIFIED_PASS',merge_sha:mergeSha,check_run_ids:runs.map(value=>value.id).sort((a,b)=>a-b)};
    }
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

const validateLiveCandidate = async ({allowDraft=false}={}) => {
  const pr=await api(`/pulls/${envelope.pull_request}`);
  if (pr.state!=='open'||pr.merged===true||(!allowDraft&&pr.draft===true)||pr.base?.sha!==envelope.base_sha||pr.head?.sha!==envelope.head_sha) throw new AutonomousLandingError('AUTONOMOUS_PR_DRIFT');
  const commit=await api(`/git/commits/${envelope.head_sha}`);
  if (commit.tree?.sha!==envelope.head_tree_sha) throw new AutonomousLandingError('AUTONOMOUS_TREE_DRIFT');
  const files=await collectPaginatedApiValues({request:api,endpoint:`/pulls/${envelope.pull_request}/files`});
  validateLiveChangedPaths({files,expectedPaths:envelope.changed_paths,expectedScopeDigest:envelope.scope_digest,ownerReservedPathPrefixes:policy.owner_reserved_path_prefixes,delegatedInternalExactPathExceptions:policy.delegated_internal_exact_path_exceptions,scopeDriftCode:'AUTONOMOUS_LIVE_SCOPE_DRIFT'});
  const [status,checks]=await Promise.all([
    api(`/commits/${envelope.head_sha}/status`),
    api(`/commits/${envelope.head_sha}/check-runs?filter=latest&per_page=100`),
  ]);
  const landingContexts=new Set(['KIDULTS Governed Landing Authorization V1','KIDULTS Atomic Landing Terminal V2','KIDULTS Autonomous Internal Landing V1']);
  const authoritativeStatuses=(status.statuses||[]).filter(value=>!landingContexts.has(value.context));
  const authoritativeChecks=(checks.check_runs||[]).filter(value=>!landingContexts.has(value.name));
  if (!authoritativeStatuses.length&&!authoritativeChecks.length) throw new AutonomousLandingError('AUTONOMOUS_REQUIRED_STATUS_MISSING');
  if (authoritativeStatuses.some(value=>value.state!=='success')||authoritativeChecks.some(value=>value.status!=='completed'||value.conclusion!=='success')) {
    throw new AutonomousLandingError('AUTONOMOUS_REQUIRED_STATUS_NOT_GREEN');
  }
  return {pr,commit,files,statuses:authoritativeStatuses,checks:authoritativeChecks};
};
const waitForReadyCandidate = async () => {
  const timeoutSeconds=Number(policy.bounded_recovery?.draft_ready_validation_timeout_seconds||420);
  const deadline=Date.now()+timeoutSeconds*1000;
  while (Date.now()<deadline) {
    try { return await validateLiveCandidate(); }
    catch (error) {
      if (!(error instanceof AutonomousLandingError)||!['AUTONOMOUS_REQUIRED_STATUS_MISSING','AUTONOMOUS_REQUIRED_STATUS_NOT_GREEN'].includes(error.code)) throw error;
    }
    await sleep(5000);
  }
  throw new AutonomousLandingError('AUTONOMOUS_DRAFT_READY_CHECK_TIMEOUT');
};
const rebindDraftReady = async before => {
  if (before.draft!==true) return {state:'ALREADY_READY',head_sha:envelope.head_sha};
  if (!envelope.recovery) throw new AutonomousLandingError('AUTONOMOUS_DRAFT_READY_RECOVERY_REQUIRED');
  await graphql('mutation($pullRequestId:ID!){markPullRequestReadyForReview(input:{pullRequestId:$pullRequestId}){pullRequest{id number isDraft state headRefOid baseRefOid}}}',{pullRequestId:before.node_id});
  const after=await api(`/pulls/${envelope.pull_request}`);
  return validateDraftReadyRebind({before,after,envelope,policy});
};

try {
  if (mode === 'APPROVAL') {
    const candidate=await validateLiveCandidate({allowDraft:Boolean(envelope.recovery)});
    envelope=deriveApprovalDecision({envelope,role:approvalRole,statuses:candidate.statuses,checks:candidate.checks});
    if (envelope.recovery) {
      const priorApprovals=readGenerationApprovals(envelope.recovery.prior_authorization_generation);
      const prior=priorApprovals.KPMO || priorApprovals.ACCOUNTABLE_TRACK_AGENT || priorApprovals.INDEPENDENT_VERIFIER;
      validateRecoveryGeneration({prior,current:envelope,history:Object.values(priorApprovals).map(value=>({authorization_generation:value.authorization_generation,state:value.ledger_state||'APPROVAL_RECORDED'})),policy});
    }
    putApproval();
    const approvalReceipt = {
      id:'kidults-autonomous-internal-landing-approval-receipt-v1',
      version:'1.0.0',
      state:'APPROVAL_RECORDED',
      authorization_generation:envelope.authorization_generation,
      received_role:approvalRole,
      workload_id:runtimeWorkload.workload_id,
      signing_key_arn:runtimeWorkload.signing_key_arn,
      production:'HOLD',public:'HOLD',g5:'HOLD',
    };
    writeReceipt(approvalReceipt);
    console.log(JSON.stringify(approvalReceipt));
  } else {
    const approvals=readApprovals();
    const missing=['ACCOUNTABLE_TRACK_AGENT','KPMO','INDEPENDENT_VERIFIER'].filter(value=>!approvals[value]);
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
      const candidate=await validateLiveCandidate({allowDraft:Boolean(envelope.recovery)});
      const eventToken=await acquireEventToken();
      invokeFinalizerWriter({
        action:'CREATE_RESERVATION',
        authorization_generation:envelope.authorization_generation,
        nonce_digest:envelope.nonce_digest,
        run_id:required('GITHUB_RUN_ID'),
        head_sha:envelope.head_sha,
      });
      await publishLandingStatus('pending','AI-020 quorum verified; durable authority reserved');
      const lifecycle=await rebindDraftReady(candidate.pr);
      await waitForReadyCandidate();
      await publishLandingStatus('success','AI-020 exact-head internal reversible landing authorized');
      const merge=await api(`/pulls/${envelope.pull_request}/merge`,{method:'PUT',headers:{'Content-Type':'application/json',Authorization:`Bearer ${eventToken}`},body:JSON.stringify({sha:envelope.head_sha,merge_method:'merge',commit_title:`Autonomous internal landing PR #${envelope.pull_request}`})});
      if (merge?.merged!==true||!/^[0-9a-f]{40}$/.test(merge.sha||'')) throw new AutonomousLandingError('AUTONOMOUS_MERGE_REJECTED');
      mergePerformed=true;
      mergeSha=merge.sha;
      const [mergedPr,main,mergeCommit]=await Promise.all([api(`/pulls/${envelope.pull_request}`),api('/branches/main'),api(`/git/commits/${merge.sha}`)]);
      if (mergedPr.merged!==true||main.commit?.sha!==merge.sha||mergeCommit.tree?.sha!==envelope.head_tree_sha) throw new AutonomousLandingError('AUTONOMOUS_POSTMERGE_BINDING_FAILED');
      const postmerge=await waitForExactMergeShaValidation(merge.sha);
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
      const immutableCopy=sealImmutableReceipt(terminal);
      const sealedTerminal={...terminal,immutable_copy:immutableCopy};
      await api('/dispatches',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${eventToken}`},body:JSON.stringify({event_type:policy.merge.explicit_completion_event,client_payload:{pull_request:Number(envelope.pull_request),merge_sha:merge.sha,receipt_digest:terminal.receipt_digest,immutable_receipt_version_id:immutableCopy.version_id}})});
      writeReceipt(sealedTerminal);
      console.log(JSON.stringify({state:terminal.state,merge_sha:merge.sha,receipt_digest:terminal.receipt_digest,immutable_copy:immutableCopy,production:'HOLD',public:'HOLD',g5:'HOLD'}));
    }
  }
} catch (error) {
  if (statusTouched) {
    try { await publishLandingStatus('failure',error.code||error.message||'autonomous landing failed'); } catch {}
  }
  let rollback={state:'NOT_REQUIRED'};
  if (mergePerformed) {
    try { rollback=await openAutomaticRollback(error.code||error.message||'UNKNOWN'); }
    catch (rollbackError) { rollback={state:'OWNER_HOLD',reason:rollbackError.code||rollbackError.message}; }
  }
  const failure={id:'kidults-autonomous-internal-landing-terminal-receipt-v1',version:'1.0.0',state:'QUARANTINED',failure_code:error.code||error.message,
    authorization_generation:envelope.authorization_generation,merge_performed:mergePerformed,merge_sha:mergeSha,rollback,
    production:'HOLD',public:'HOLD',g5:'HOLD',created_at:new Date().toISOString()};
  writeReceipt(failure);
  throw error;
}
