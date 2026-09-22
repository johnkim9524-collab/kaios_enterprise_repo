#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {
  AutonomousLandingError,
  canonicalJson,
  sha256,
  validateActor,
  validateEnvelope,
  validateQuorum,
  buildTerminalReceipt,
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
const receiptPath = process.env.AUTONOMOUS_LANDING_RECEIPT_PATH || 'out/autonomous-internal-landing-v1/receipt.json';
const policy = JSON.parse(fs.readFileSync('coordination/kidults/governance/autonomous-internal-landing-policy-v1.json','utf8'));
const registry = JSON.parse(required('KIDULTS_AUTONOMOUS_ACTOR_REGISTRY_JSON'));
const event = JSON.parse(fs.readFileSync(eventPath,'utf8'));
if (runAttempt !== '1') throw new AutonomousLandingError('AUTONOMOUS_RERUN_FORBIDDEN');
if (eventName !== 'repository_dispatch') throw new AutonomousLandingError('AUTONOMOUS_NORMAL_EVENT_REQUIRED');

const eventRole = new Map([
  ['kidults.track.authorization.v1','ACCOUNTABLE_TRACK_AGENT'],
  ['kidults.kpmo.authorization.v1','KPMO'],
  ['kidults.independent.verification.v1','INDEPENDENT_VERIFIER'],
]);
const role = eventRole.get(event.action);
if (!role) throw new AutonomousLandingError('AUTONOMOUS_EVENT_NOT_ALLOWED');
const envelope = validateEnvelope(event.client_payload?.envelope,{policy});
validateActor(envelope.actor,registry,role);
if (String(event.sender?.id) !== String(envelope.actor.actor_id)) throw new AutonomousLandingError('AUTONOMOUS_EVENT_SENDER_ID_MISMATCH');
if (envelope.repository !== repository) throw new AutonomousLandingError('AUTONOMOUS_REPOSITORY_MISMATCH');

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
const awsJson = args => JSON.parse(execFileSync('aws',args,{encoding:'utf8',timeout:30000,env:process.env,stdio:['ignore','pipe','pipe']}));
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
const putApproval = () => {
  try {
    invokeLedgerWriter({
      action:'CREATE_APPROVAL',
      authorization_generation:envelope.authorization_generation,
      role,
      envelope_b64:Buffer.from(canonicalJson(envelope)).toString('base64'),
      envelope_digest:sha256(canonicalJson(envelope)),
      expires_at_epoch:String(Math.floor(Date.parse(envelope.expires_at)/1000)),
    });
  } catch (error) {
    throw new AutonomousLandingError('AUTONOMOUS_APPROVAL_DUPLICATE_OR_LEDGER_FAILURE',role);
  }
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
const writeReceipt = receipt => {
  fs.mkdirSync(path.dirname(receiptPath),{recursive:true,mode:0o700});
  fs.writeFileSync(receiptPath,`${JSON.stringify(receipt,null,2)}\n`,{encoding:'utf8',mode:0o600});
  fs.chmodSync(receiptPath,0o600);
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

try {
  putApproval();
  const approvals=readApprovals();
  const missing=['ACCOUNTABLE_TRACK_AGENT','KPMO','INDEPENDENT_VERIFIER'].filter(value=>!approvals[value]);
  if (missing.length) {
    writeReceipt({id:'kidults-autonomous-internal-landing-terminal-receipt-v1',version:'1.0.0',state:'AWAITING_QUORUM',
      authorization_generation:envelope.authorization_generation,received_role:role,missing_roles:missing,production:'HOLD',public:'HOLD',g5:'HOLD'});
    process.exit(0);
  }
  const quorum=validateQuorum({track:approvals.ACCOUNTABLE_TRACK_AGENT,kpmo:approvals.KPMO,verifier:approvals.INDEPENDENT_VERIFIER,registry,policy});
  const pr=await api(`/pulls/${envelope.pull_request}`);
  if (pr.state!=='open'||pr.draft===true||pr.base?.sha!==envelope.base_sha||pr.head?.sha!==envelope.head_sha) throw new AutonomousLandingError('AUTONOMOUS_PR_DRIFT');
  const commit=await api(`/git/commits/${envelope.head_sha}`);
  if (commit.tree?.sha!==envelope.head_tree_sha) throw new AutonomousLandingError('AUTONOMOUS_TREE_DRIFT');
  const files=await api(`/pulls/${envelope.pull_request}/files?per_page=100`);
  if (!Array.isArray(files)||files.length!==envelope.changed_paths.length) throw new AutonomousLandingError('AUTONOMOUS_CHANGED_FILE_COUNT_DRIFT');
  const liveScope=sha256(files.map(value=>value.filename).sort().join('\n'));
  if (liveScope!==envelope.scope_digest) throw new AutonomousLandingError('AUTONOMOUS_LIVE_SCOPE_DRIFT');
  for (const prefix of policy.owner_reserved_path_prefixes) if (files.some(value=>value.filename.startsWith(prefix))) throw new AutonomousLandingError('AUTONOMOUS_OWNER_RESERVED_PATH',prefix);
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
  await publishLandingStatus('pending','AI-020 quorum verified; reserving durable single-use authority');
  invokeLedgerWriter({
    action:'CREATE_RESERVATION',
    authorization_generation:envelope.authorization_generation,
    nonce_digest:envelope.nonce_digest,
    run_id:required('GITHUB_RUN_ID'),
    head_sha:envelope.head_sha,
  });
  await publishLandingStatus('success','AI-020 exact-head internal reversible landing authorized');
  const merge=await api(`/pulls/${envelope.pull_request}/merge`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({sha:envelope.head_sha,merge_method:'merge',commit_title:`Autonomous internal landing PR #${envelope.pull_request}`})});
  if (merge?.merged!==true||!/^[0-9a-f]{40}$/.test(merge.sha||'')) throw new AutonomousLandingError('AUTONOMOUS_MERGE_REJECTED');
  mergePerformed=true;
  mergeSha=merge.sha;
  const [mergedPr,main,mergeCommit]=await Promise.all([api(`/pulls/${envelope.pull_request}`),api('/branches/main'),api(`/git/commits/${merge.sha}`)]);
  if (mergedPr.merged!==true||main.commit?.sha!==merge.sha||mergeCommit.tree?.sha!==envelope.head_tree_sha) throw new AutonomousLandingError('AUTONOMOUS_POSTMERGE_BINDING_FAILED');
  const postmerge=await waitForExactMergeShaValidation(merge.sha);
  invokeLedgerWriter({
    action:'CONSUME_RESERVATION',
    authorization_generation:envelope.authorization_generation,
    nonce_digest:envelope.nonce_digest,
    run_id:required('GITHUB_RUN_ID'),
    head_sha:envelope.head_sha,
    merge_sha:merge.sha,
  });
  const terminal=buildTerminalReceipt({quorum,reservation:{state:'CONSUMED',conditional_write:true,backend:'AWS_DYNAMODB'},
    merge:{merge_sha:merge.sha,main_sha:main.commit.sha,head_sha:envelope.head_sha,tree_sha:mergeCommit.tree.sha},postmerge});
  await api('/dispatches',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({event_type:policy.merge.explicit_completion_event,client_payload:{pull_request:Number(envelope.pull_request),merge_sha:merge.sha,receipt_digest:terminal.receipt_digest}})});
  writeReceipt(terminal);
  console.log(JSON.stringify({state:terminal.state,merge_sha:merge.sha,receipt_digest:terminal.receipt_digest,production:'HOLD',public:'HOLD',g5:'HOLD'}));
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
