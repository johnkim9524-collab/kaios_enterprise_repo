#!/usr/bin/env node
import fs from 'node:fs';
import crypto from 'node:crypto';
import {assertAutonomousFileScope,canonicalJson,sha256} from './lib/autonomous-internal-landing-v1.mjs';
import {CapabilityDeltaError,evaluateSemanticCapabilityDelta} from './lib/semantic-capability-delta-v1.mjs';
import {independentlyVerifyCapabilityDelta} from './lib/independent-capability-verifier-v1.mjs';
import {bindRequiredGateEvidence} from './lib/required-gate-evidence-v1.mjs';
import {analyzeCapabilityRepair} from './lib/capability-repair-analysis-v1.mjs';

export class DispatcherError extends Error { constructor(code,detail=''){ super(detail?`${code}:${detail}`:code); this.code=code; } }
export const isCandidateRejection=error=>error instanceof DispatcherError || error instanceof CapabilityDeltaError
  || /^INDEPENDENT_/.test(String(error?.code||''));
const OWNER_REVIEW_CODES=new Set([
  'CAPABILITY_GUARD_DEPENDENCY_CHANGED','CAPABILITY_GUARD_WEAKENED','CAPABILITY_GUARD_REMOVED',
  'CAPABILITY_AUTHORITY_POLICY_CHANGED','CAPABILITY_EXPANSION','CAPABILITY_PERMISSION_EXPANSION',
  'INDEPENDENT_SECURITY_CAPABILITY_CHANGED','INDEPENDENT_AUTHORITY_POLICY_CHANGED',
]);
const isOwnerReviewRequired=error=>OWNER_REVIEW_CODES.has(String(error?.code||''));
const POLICY_REPAIR_CODES=new Set([
  'CAPABILITY_DERIVED_METADATA_SCOPE_CHANGED','INDEPENDENT_DERIVED_METADATA_SCOPE_CHANGED',
  'INDEPENDENT_SECURITY_CAPABILITY_ADDED','INDEPENDENT_GUARD_DEPENDENCY_CHANGED',
]);
export function buildPolicyRepairRequired({pr,mainSha,treeSha,files,error}) {
  if(!POLICY_REPAIR_CODES.has(String(error?.code||'')))return null;
  const paths=files?.map(file=>file.filename).sort();
  if(!pr||pr.base?.sha!==mainSha||!SHA.test(String(mainSha))||!SHA.test(String(pr.head?.sha))
    ||!SHA.test(String(treeSha))||!paths?.length||paths.some(path=>typeof path!=='string'||!path)) fail('DISPATCH_POLICY_REPAIR_BINDING_INVALID');
  return {state:'POLICY_REPAIR_REQUIRED',pull_request:Number(pr.number),reason:error.code,
    classification_failure:{code:error.code,changed_path:paths.find(path=>String(error.message).startsWith(`${error.code}:${path}`))||null,
      stage:'IMMUTABLE_CAPABILITY_DELTA',authority_created:false},
    binding:{repository:pr.base.repo.full_name,repository_id:String(pr.base.repo.id),pull_request:Number(pr.number),
      base_sha:mainSha,head_sha:pr.head.sha,head_tree_sha:treeSha,changed_paths:paths,scope_digest:sha256(paths.join('\n'))},
    recovery_action:'REPAIR_CANDIDATE_OR_CLASSIFIER_THEN_FRESH_PROTECTED_MAIN_VALIDATION',
    automatic_retry_performed:false,autonomous_eligible:false,landing_authorization_created:false,merge_authorized:false,
    production:'HOLD',public:'HOLD',g5:'HOLD'};
}
const UNKNOWN_CLASSIFICATION_CODES=new Set([
  'AUTONOMOUS_OWNER_RESERVED_CLASSIFICATION_UNKNOWN','CAPABILITY_IMMUTABLE_BLOBS_REQUIRED',
  'CAPABILITY_JSON_PARSE_FAILED','CAPABILITY_SCRIPT_PARSE_FAILED','CAPABILITY_SOURCE_MISSING',
  'CAPABILITY_YAML_INDENT_UNKNOWN','CAPABILITY_YAML_UNCLASSIFIED','CAPABILITY_YAML_UNSUPPORTED_SYNTAX',
  'INDEPENDENT_SCRIPT_PARSE_FAILED','INDEPENDENT_JSON_PARSE_FAILED','INDEPENDENT_IMMUTABLE_BLOBS_REQUIRED',
]);
export const isUnknownClassification=error=>UNKNOWN_CLASSIFICATION_CODES.has(String(error?.code||''));
const fail=(code,detail='')=>{throw new DispatcherError(code,detail)};
const SHA=/^[0-9a-f]{40}$/;

export function withCapabilityRepairAnalysis(record,context,policy) {
  if(!context||! /^(CAPABILITY_|INDEPENDENT_)/.test(String(record.reason||'')))return record;
  const {pr,treeSha,files}=context;
  try {
    const analysis=analyzeCapabilityRepair({repository:pr.base.repo.full_name,repositoryId:pr.base.repo.id,
      pullRequest:pr.number,baseSha:pr.base.sha,headSha:pr.head.sha,treeSha,files,policy});
    return {...record,capability_repair_analysis:analysis};
  } catch(error) {
    if(error.message!=='CAPABILITY_REPAIR_ANALYSIS_INPUT_INVALID')throw error;
    return {...record,capability_repair_analysis:{state:'DIAGNOSTIC_INPUT_UNAVAILABLE',
      code:'CAPABILITY_REPAIR_ANALYSIS_INPUT_INVALID',authority_created:false,
      landing_authorization_created:false,merge_authorized:false}};
  }
}

// Read-only uncertainty recovery. It never relaxes either classifier or turns
// definite Owner-reserved changes into UNKNOWN. Only full existing validation
// may return a candidate; an unresolved receipt grants no authority.
export async function reclassifyUnknownCandidate({context,error,approvalPolicy,readCandidate}) {
  if(!isUnknownClassification(error)) fail('DISPATCH_RECLASSIFICATION_NOT_UNKNOWN');
  const rule=approvalPolicy?.classes?.UNKNOWN;
  if(rule?.decision!=='QUARANTINE_RECLASSIFY_THEN_OWNER_IF_UNRESOLVED'
    ||rule.automatic_reclassification_required!==true||rule.automatic_reclassification_max_attempts!==2
    ||rule.repository_mutation_during_reclassification!==false
    ||rule.owner_escalation_only_after_unresolved_reclassification!==true
    ||rule.final_unresolved_decision!=='FAIL_CLOSED_OWNER_REQUIRED'
    ||typeof readCandidate!=='function') fail('DISPATCH_RECLASSIFICATION_POLICY_INVALID');
  const bind=value=>{
    const {pr,mainSha,treeSha,files}=value;
    const mode=value.classificationMode||'CURRENT_BASE';
    if(!['CURRENT_BASE','STALE_BASE'].includes(mode)||!pr||pr.state!=='open'||pr.merged===true||pr.base?.ref!=='main'
      ||!SHA.test(String(pr.base.sha))||(mode==='CURRENT_BASE'?pr.base.sha!==mainSha:pr.base.sha===mainSha)
      ||!SHA.test(String(mainSha))||!SHA.test(String(pr.head?.sha))||!SHA.test(String(treeSha))
      ||pr.head?.repo?.full_name!==pr.base?.repo?.full_name||!Number.isSafeInteger(pr.number)
      ||!Array.isArray(files)||!files.length) fail('DISPATCH_RECLASSIFICATION_BINDING_INVALID');
    return {repository:pr.base.repo.full_name,repository_id:String(pr.base.repo.id),pull_request:pr.number,
      base_sha:pr.base.sha,current_main_sha:mainSha,classification_mode:mode,
      head_sha:pr.head.sha,head_tree_sha:treeSha,draft:pr.draft===true,
      protected_ruleset_digest:value.protectedRulesetDigest||null,
      changed_paths:files.map(f=>f.filename).sort()};
  };
  const binding=bind(context),attempts=[];
  const receiptBase={id:'kidults-readonly-reclassification-receipt-v1',version:'1.0.0',
    budget_scope:'ONE_READ_ONLY_SCAN_EXACT_TUPLE',maximum_attempts:2,
    repository_mutation_performed:false,authority_created:false};
  for(let attempt=1;attempt<=2;attempt++) {
    let fresh;
    try {fresh=await readCandidate();}
    catch(readError) {
      attempts.push({attempt,result:'READ_FAILED',code:'DISPATCH_RECLASSIFICATION_READ_FAILED'});
      continue;
    }
    let freshBinding;
    try {freshBinding=bind(fresh);} catch(bindingError) {freshBinding=null;}
    if(!freshBinding||canonicalJson(freshBinding)!==canonicalJson(binding)) {
      return {error:new DispatcherError('DISPATCH_RECLASSIFICATION_SOURCE_DRIFT'),context,
        receipt:{...receiptBase,state:'HOLD_SOURCE_DRIFT',binding,attempts:[...attempts,{attempt,result:'SOURCE_DRIFT'}],
          authority_created:false,repository_mutation_performed:false}};
    }
    try {
      const candidate=fresh.classificationMode==='STALE_BASE'?classifyStaleBaseCandidate(fresh):classifyCandidate(fresh);
      attempts.push({attempt,result:'CLASSIFIED_BY_EXISTING_FULL_VALIDATION'});
      return {candidate,receipt:{...receiptBase,state:'RECLASSIFIED',binding,attempts,authority_created:false}};
    } catch(next) {
      if(!isCandidateRejection(next)) throw next;
      attempts.push({attempt,result:'REJECTED',code:next.code});
      if(!isUnknownClassification(next)) return {error:next,context:fresh,
        receipt:{...receiptBase,state:'RECLASSIFIED_REJECTED',binding,attempts,authority_created:false}};
      error=next;
    }
  }
  return {unresolved:true,error,receipt:{...receiptBase,state:'UNKNOWN_RECLASSIFICATION_UNRESOLVED',binding,attempts,
    authority_created:false,repository_mutation_performed:false}};
}

export function buildOwnerReviewRequired({pr,mainSha,treeSha,files,error}) {
  const changedPaths=files.map(file=>file.filename).sort();
  if(!pr||pr.base?.sha!==mainSha||!SHA.test(String(mainSha))||!SHA.test(String(pr.head?.sha))
    ||!SHA.test(String(treeSha))||!changedPaths.length||!isOwnerReviewRequired(error)) fail('DISPATCH_OWNER_REVIEW_BINDING_INVALID');
  const scopeDigest=sha256(changedPaths.join('\n'));
  return {
    state:'OWNER_REVIEW_REQUIRED',pull_request:Number(pr.number),reason:error.code,
    classification_failure:{code:error.code,
      changed_path:changedPaths.find(path=>String(error.message).startsWith(`${error.code}:${path}`))||null,
      stage:'IMMUTABLE_CAPABILITY_DELTA',authority_created:false},
    binding:{repository:pr.base.repo.full_name,repository_id:String(pr.base.repo.id),pull_request:Number(pr.number),
      base_sha:mainSha,head_sha:pr.head.sha,head_tree_sha:treeSha,changed_paths:changedPaths,scope_digest:scopeDigest},
    autonomous_eligible:false,landing_authorization_created:false,merge_authorized:false,
    production:'HOLD',public:'HOLD',g5:'HOLD',
  };
}

export function assertDelegatedPathScope(changedPaths,policy){
  try { return assertAutonomousFileScope({files:changedPaths,policy,errorCode:'DISPATCH_OWNER_RESERVED_ACTION'}); }
  catch(error){ if(error?.code) throw new DispatcherError(error.code,error.message.split(':').slice(1).join(':')); throw error; }
}

export function classifyStaleBaseCandidate({pr,mainSha,files,policy}) {
  if (!pr || pr.state!=='open' || pr.merged===true) fail('DISPATCH_PR_NOT_OPEN');
  if (pr.base?.ref!=='main' || pr.base?.sha===mainSha || !SHA.test(String(pr.base?.sha)) || !SHA.test(String(mainSha))) fail('DISPATCH_STALE_BASE_BINDING_INVALID');
  if (pr.head?.repo?.full_name!==pr.base?.repo?.full_name || !SHA.test(String(pr.head?.sha))) fail('DISPATCH_REPOSITORY_SCOPE_INVALID');
  assertDelegatedPathScope(files,policy);
  evaluateSemanticCapabilityDelta({files,policy});
  independentlyVerifyCapabilityDelta({files,policy});
  const convergence=policy.merge?.autonomous_stale_base_convergence;
  if(convergence?.enabled!==true || convergence.executor!=='DISPATCHER_BROKERED_GITHUB_APP_ONLY'
    || convergence.method!=='GITHUB_UPDATE_BRANCH_EXPECTED_HEAD_SHA'
    || convergence.preclassification_against_original_base_required!==true
    || convergence.same_repository_head_required!==true
    || convergence.primary_and_independent_semantic_verifiers_required!==true
    || convergence.owner_reserved_action_forbidden!==true
    || convergence.post_update_full_ci_and_fresh_authorization_generation_required!==true
    || convergence.force_push_forbidden!==true) fail('DISPATCH_STALE_BASE_POLICY_INVALID');
  return {pull_request:Number(pr.number),old_base_sha:pr.base.sha,current_main_sha:mainSha,expected_head_sha:pr.head.sha,
    changed_paths:files.map(x=>x.filename).sort(),state:'STALE_RECOVERABLE'};
}

export function classifyCandidate({pr,mainSha,treeSha,files,statuses=[],checks=[],requiredChecks=[],requiredContexts=[],policy,generationSeed,now=new Date()}) {
  if (!pr || pr.state!=='open' || pr.merged===true) fail('DISPATCH_PR_NOT_OPEN');
  if (pr.base?.ref!=='main' || pr.base?.sha!==mainSha || !SHA.test(String(mainSha))) fail('DISPATCH_BASE_STALE');
  if (pr.head?.repo?.full_name!==pr.base?.repo?.full_name || !SHA.test(String(pr.head?.sha)) || !SHA.test(String(treeSha))) fail('DISPATCH_REPOSITORY_SCOPE_INVALID');
  const changedPaths=[...files].map(x=>x.filename).sort();
  if (!changedPaths.length || changedPaths.some(x=>typeof x!=='string'||!x||x.startsWith('/')||x.includes('..'))) fail('DISPATCH_PATH_INVALID');
  assertDelegatedPathScope(files,policy);
  evaluateSemanticCapabilityDelta({files,policy});
  independentlyVerifyCapabilityDelta({files,policy});
  const required=(requiredChecks.length?requiredChecks:requiredContexts.map(context=>({context,integration_id:0})))
    .map(value=>({context:String(value.context),integration_id:Number(value.integration_id||0)}))
    .sort((a,b)=>a.context.localeCompare(b.context)||a.integration_id-b.integration_id);
  if(new Set(required.map(value=>`${value.context}:${value.integration_id}`)).size!==required.length) fail('DISPATCH_REQUIRED_CONTEXT_SET_AMBIGUOUS');
  if (!required.length) fail('DISPATCH_REQUIRED_CONTEXT_SET_EMPTY');
  const cleanStatuses=statuses.map(x=>({id:Number(x.id),context:String(x.context),state:String(x.state),sha:String(x.sha||pr.head.sha),app_id:Number(x.app?.id||x.app_id||String(x.avatar_url||'').match(/^https:\/\/avatars\.githubusercontent\.com\/in\/(\d+)(?:\?|$)/)?.[1]||0),avatar_url:String(x.avatar_url||'')})).sort((a,b)=>a.context.localeCompare(b.context)||a.id-b.id);
  const cleanChecks=checks.map(x=>({id:Number(x.id),name:String(x.name),head_sha:String(x.head_sha||''),app_id:Number(x.app?.id||x.app_id||0),status:String(x.status),conclusion:String(x.conclusion),external_id:x.external_id==null?null:String(x.external_id),semantic_evidence:[x.output?.title,x.output?.summary,x.output?.text].filter(Boolean).join('\n')})).sort((a,b)=>a.name.localeCompare(b.name)||a.app_id-b.app_id||a.id-b.id);
  if (!cleanStatuses.length&&!cleanChecks.length) fail('DISPATCH_EVIDENCE_MISSING');
  const boundRequired=bindRequiredGateEvidence({required,checks:cleanChecks,statuses:cleanStatuses,headSha:pr.head.sha,
    fail:(code,context)=>fail(code==='REQUIRED_CONTEXT_MISSING'?'DISPATCH_REQUIRED_CONTEXT_MISSING':
      code==='REQUIRED_CONTEXT_AMBIGUOUS'?'DISPATCH_REQUIRED_CONTEXT_AMBIGUOUS':
      code==='REQUIRED_STATUS_NOT_GREEN'?'DISPATCH_CHECKS_NOT_GREEN':`DISPATCH_${code}`,context)});
  for (const binding of boundRequired) if(binding.context==='KPMO Live Canonical Issue Truth V1') {
    const check=cleanChecks.find(value=>value.id===binding.id);
    if(!check||/IMPLEMENTED_NOT_VERIFIED/.test(check.semantic_evidence)||!/\bVERIFIED_PASS\b/.test(check.semantic_evidence)) fail('DISPATCH_CANONICAL_SEMANTIC_STATE_NOT_VERIFIED');
  }
  const testEvidence={source:'GITHUB_LIVE_PROTECTED_MAIN_REQUIRED_CHECKS',result:'PASS',required_contexts:required,required_check_runs:boundRequired,statuses:cleanStatuses,checks:cleanChecks};
  testEvidence.artifact_digest=sha256(canonicalJson({statuses:cleanStatuses,checks:cleanChecks}));
  const rollbackPlan={source:'GITHUB_LIVE_EXACT_BINDING',strategy:'REVERT_MERGE_COMMIT',verified:true,base_sha:mainSha,head_tree_sha:treeSha};
  const issuedAt=new Date(now); const expiresAt=new Date(issuedAt.getTime()+Number(policy.durable_single_use.maximum_ttl_seconds)*1000);
  const scopeDigest=sha256(changedPaths.join('\n'));
  const seed=String(generationSeed||'');
  if (!/^[1-9][0-9]{0,19}$/.test(seed)) fail('DISPATCH_GENERATION_SEED_INVALID');
  const dispatchGenerationDigest=crypto.createHash('sha256').update(`${pr.base.repo.id}:${pr.number}:${mainSha}:${pr.head.sha}:${treeSha}:${scopeDigest}:${seed}`).digest('hex');
  const generation=`pr-${pr.number}-${pr.head.sha.slice(0,20)}-${dispatchGenerationDigest.slice(0,16)}`;
  const nonce=crypto.createHash('sha256').update(`${pr.base.repo.id}:${pr.number}:${mainSha}:${pr.head.sha}:${treeSha}:${scopeDigest}:${seed}`).digest('hex');
  return {repository_id:String(pr.base.repo.id),repository:pr.base.repo.full_name,pull_request:Number(pr.number),base_sha:mainSha,
    head_sha:pr.head.sha,head_tree_sha:treeSha,scope_digest:scopeDigest,test_evidence:testEvidence,
    test_evidence_digest:sha256(canonicalJson(testEvidence)),rollback_plan:rollbackPlan,rollback_digest:sha256(canonicalJson(rollbackPlan)),
    authorization_generation:generation,nonce_digest:`sha256:${nonce}`,issued_at:issuedAt.toISOString(),expires_at:expiresAt.toISOString(),
    operation:policy.delegated_operation,changed_paths:changedPaths,production:'HOLD',public:'HOLD',g5:'HOLD'};
}

async function api(path,token){const r=await fetch(`https://api.github.com${path}`,{headers:{Accept:'application/vnd.github+json',Authorization:`Bearer ${token}`,'X-GitHub-Api-Version':'2022-11-28','User-Agent':'kidults-autonomous-dispatcher-v1'}});if(!r.ok)fail('DISPATCH_GITHUB_API',`${r.status}:${path}`);return r.json()}
async function pages(path,token){const out=[];for(let page=1;page<=30;page++){const batch=await api(`${path}${path.includes('?')?'&':'?'}per_page=100&page=${page}`,token);if(!Array.isArray(batch))fail('DISPATCH_PAGINATION_INVALID');out.push(...batch);if(batch.length<100)return out}fail('DISPATCH_PAGINATION_LIMIT')}
async function checkPages(repository,sha,token){const out=[];for(let page=1;page<=30;page++){const payload=await api(`/repos/${repository}/commits/${sha}/check-runs?filter=all&per_page=100&page=${page}`,token);const batch=payload?.check_runs;if(!Array.isArray(batch))fail('DISPATCH_PAGINATION_INVALID');out.push(...batch);if(batch.length<100)return out}fail('DISPATCH_PAGINATION_LIMIT')}
const encodePath=path=>path.split('/').map(encodeURIComponent).join('/');
async function immutableContent(repository,path,ref,token){
  const payload=await api(`/repos/${repository}/contents/${encodePath(path)}?ref=${ref}`,token);
  if(payload?.type!=='file'||payload.encoding!=='base64'||typeof payload.content!=='string') fail('DISPATCH_IMMUTABLE_BLOB_INVALID',path);
  return Buffer.from(payload.content.replace(/\n/g,''),'base64').toString('utf8');
}
async function contentBlobShaOrNull(repository,path,ref,token){
  const response=await fetch(`https://api.github.com/repos/${repository}/contents/${encodePath(path)}?ref=${ref}`,{headers:{Accept:'application/vnd.github+json',Authorization:`Bearer ${token}`,'X-GitHub-Api-Version':'2022-11-28','User-Agent':'kidults-autonomous-dispatcher-v1'}});
  if(response.status===404) return null;
  if(!response.ok) fail('DISPATCH_GITHUB_API',`${response.status}:content-blob`);
  const payload=await response.json();
  return payload?.type==='file'&&/^[0-9a-f]{40}$/.test(String(payload.sha))?payload.sha:null;
}
async function staleFilesRedundantAgainstMain({repository,mainSha,headSha,files,token}){
  if(!files.length||files.some(file=>['removed','renamed'].includes(file.status))) return false;
  const comparisons=await Promise.all(files.map(async file=>{
    const [head,main]=await Promise.all([contentBlobShaOrNull(repository,file.filename,headSha,token),contentBlobShaOrNull(repository,file.filename,mainSha,token)]);
    return head!==null&&head===main;
  }));
  return comparisons.every(Boolean);
}
async function attachImmutableContents({repository,baseSha,headSha,files,token}){
  return Promise.all(files.map(async file=>{
    if(file.status==='removed'||file.status==='renamed') fail('DISPATCH_OWNER_RESERVED_ACTION',`${file.filename}:${file.status.toUpperCase()}`);
    const head_content=await immutableContent(repository,file.filename,headSha,token);
    const base_content=file.status==='added'?'':await immutableContent(repository,file.filename,baseSha,token);
    return {...file,base_content,head_content};
  }));
}

export async function discover({repository,token,prNumber,policy,generationSeed,approvalPolicy}){
  const [owner,repo]=repository.split('/'); if(!owner||!repo||!token)fail('DISPATCH_CONFIGURATION_INVALID');
  const [branch,rulesets]=await Promise.all([api(`/repos/${repository}/branches/main`,token),api(`/repos/${repository}/rulesets`,token)]); const mainSha=branch.commit?.sha;
  const solo=(rulesets||[]).find(x=>x.name==='KAIOS Solo Owner Preflight'&&x.enforcement==='active');
  if(!solo) fail('DISPATCH_REQUIRED_RULESET_MISSING');
  const soloDetail=await api(`/repos/${repository}/rulesets/${solo.id}`,token);
  if((soloDetail.bypass_actors||[]).length) fail('DISPATCH_RULESET_BYPASS_FORBIDDEN');
  const statusRule=(soloDetail.rules||[]).find(x=>x.type==='required_status_checks');
  if(!statusRule?.parameters?.strict_required_status_checks_policy) fail('DISPATCH_STRICT_REQUIRED_STATUS_POLICY_REQUIRED');
  const baseRequiredChecks=(statusRule.parameters.required_status_checks||[])
    .map(x=>({context:x.context,integration_id:Number(x.integration_id||0)}))
    .filter(x=>x.context!=='KIDULTS Governed Landing Authorization V1');
  if(!baseRequiredChecks.length) fail('DISPATCH_REQUIRED_CONTEXT_SET_EMPTY');
  const prs=prNumber?[await api(`/repos/${repository}/pulls/${prNumber}`,token)]:await pages(`/repos/${repository}/pulls?state=open`,token);
  const results=[];
  for(const pr of prs){let candidateContext=null;try{
    if(pr.head?.repo?.full_name!==pr.base?.repo?.full_name){results.push({state:'SKIPPED',pull_request:pr.number,reason:'DISPATCH_REPOSITORY_SCOPE_INVALID'});continue;}
    if(pr.base?.ref!=='main' || pr.base?.sha!==mainSha){
      if(pr.base?.ref!=='main' || !SHA.test(String(pr.base?.sha)) || !SHA.test(String(pr.head?.sha))) {results.push({state:'SKIPPED',pull_request:pr.number,reason:'DISPATCH_BASE_STALE'});continue;}
      const [fileRecords,commit]=await Promise.all([pages(`/repos/${repository}/pulls/${pr.number}/files`,token),api(`/repos/${repository}/git/commits/${pr.head.sha}`,token)]);
      if(await staleFilesRedundantAgainstMain({repository,mainSha,headSha:pr.head.sha,files:fileRecords,token})) {
        results.push({state:'STALE_REDUNDANT',pull_request:pr.number,binding:{pull_request:Number(pr.number),old_base_sha:pr.base.sha,current_main_sha:mainSha,expected_head_sha:pr.head.sha,changed_paths:fileRecords.map(x=>x.filename).sort()}});
        continue;
      }
      const files=await attachImmutableContents({repository,baseSha:pr.base.sha,headSha:pr.head.sha,files:fileRecords,token});
      candidateContext={pr,mainSha,treeSha:commit.tree?.sha,files,classificationMode:'STALE_BASE',protectedRulesetDigest:sha256(canonicalJson(soloDetail))};
      const binding=classifyStaleBaseCandidate({pr,mainSha,files,policy});
      results.push({state:'STALE_RECOVERABLE',pull_request:pr.number,binding});
      continue;
    }
    const requiredChecks=pr.draft===true
      ? baseRequiredChecks.map(x=>x.context==='KIDULTS Scope-Aware Authoritative Status V1'
        ? {context:'KIDULTS Draft Development Validation V1',integration_id:x.integration_id}
        : x)
      : baseRequiredChecks;
    const [commit,fileRecords,status,checks]=await Promise.all([api(`/repos/${repository}/git/commits/${pr.head.sha}`,token),pages(`/repos/${repository}/pulls/${pr.number}/files`,token),api(`/repos/${repository}/commits/${pr.head.sha}/status`,token),checkPages(repository,pr.head.sha,token)]);
    const files=await attachImmutableContents({repository,baseSha:mainSha,headSha:pr.head.sha,files:fileRecords,token});
    candidateContext={pr,mainSha,treeSha:commit.tree?.sha,files,protectedRulesetDigest:sha256(canonicalJson(soloDetail))};
    const candidate=classifyCandidate({pr,mainSha,treeSha:commit.tree?.sha,files,statuses:status.statuses||[],checks,requiredChecks,policy,generationSeed});
    results.push({state:'ELIGIBLE',envelope:candidate});
  }catch(error){if(!isCandidateRejection(error))throw error;
    if(candidateContext&&isUnknownClassification(error)) {
      const recovered=await reclassifyUnknownCandidate({context:candidateContext,error,approvalPolicy,
        readCandidate:async()=>{
          const [freshPr,freshMain,freshRuleset]=await Promise.all([api(`/repos/${repository}/pulls/${pr.number}`,token),api(`/repos/${repository}/branches/main`,token),api(`/repos/${repository}/rulesets/${solo.id}`,token)]);
          const [commit,records,status,checks]=await Promise.all([api(`/repos/${repository}/git/commits/${freshPr.head.sha}`,token),pages(`/repos/${repository}/pulls/${pr.number}/files`,token),api(`/repos/${repository}/commits/${freshPr.head.sha}/status`,token),checkPages(repository,freshPr.head.sha,token)]);
          const files=await attachImmutableContents({repository,baseSha:freshPr.base.sha,headSha:freshPr.head.sha,files:records,token});
          const requiredChecks=freshPr.draft===true?baseRequiredChecks.map(x=>x.context==='KIDULTS Scope-Aware Authoritative Status V1'?{context:'KIDULTS Draft Development Validation V1',integration_id:x.integration_id}:x):baseRequiredChecks;
          return {pr:freshPr,mainSha:freshMain.commit.sha,treeSha:commit.tree?.sha,files,statuses:status.statuses||[],checks,requiredChecks,policy,generationSeed,classificationMode:candidateContext.classificationMode,protectedRulesetDigest:sha256(canonicalJson(freshRuleset))};
        }});
      if(recovered.candidate) {results.push(candidateContext.classificationMode==='STALE_BASE'
        ?{state:'STALE_RECOVERABLE',pull_request:pr.number,binding:recovered.candidate,reclassification:recovered.receipt}
        :{state:'ELIGIBLE',envelope:recovered.candidate,reclassification:recovered.receipt});continue;}
      if(recovered.unresolved) {results.push({state:'OWNER_REVIEW_REQUIRED',pull_request:pr.number,
        reason:'UNKNOWN_RECLASSIFICATION_UNRESOLVED',reclassification:recovered.receipt,
        autonomous_eligible:false,landing_authorization_created:false,merge_authorized:false,
        production:'HOLD',public:'HOLD',g5:'HOLD'});continue;}
      if(!isOwnerReviewRequired(recovered.error)) {
        const repair=recovered.context?.pr.base.sha===mainSha?buildPolicyRepairRequired({...recovered.context,error:recovered.error}):null;
        results.push(withCapabilityRepairAnalysis(repair?{...repair,reclassification:recovered.receipt}:{state:'SKIPPED',pull_request:pr.number,
          reason:recovered.error.code,reclassification:recovered.receipt},recovered.context,policy));continue;}
      error=recovered.error;candidateContext=recovered.context;
    }
    if(candidateContext&&candidateContext.pr.base.sha===mainSha&&isOwnerReviewRequired(error)) results.push(withCapabilityRepairAnalysis(buildOwnerReviewRequired({...candidateContext,error}),candidateContext,policy));
    else results.push(withCapabilityRepairAnalysis(candidateContext?.pr.base.sha===mainSha
      ?buildPolicyRepairRequired({...candidateContext,error})||{state:'SKIPPED',pull_request:pr.number,reason:error.code}
      :{state:'SKIPPED',pull_request:pr.number,reason:error.code},candidateContext,policy));}}
  return results;
}

if(import.meta.url===`file://${process.argv[1]}`){
  const policy=JSON.parse(fs.readFileSync(process.env.KIDULTS_AUTONOMOUS_POLICY_PATH||'coordination/kidults/governance/autonomous-internal-landing-policy-v1.json','utf8'));
  const approvalPolicy=JSON.parse(fs.readFileSync('coordination/kidults/governance/autonomous-approval-policy-envelope-v1.json','utf8'));
  const results=await discover({repository:process.env.GITHUB_REPOSITORY,token:process.env.GITHUB_TOKEN,prNumber:process.env.KIDULTS_PR_NUMBER?Number(process.env.KIDULTS_PR_NUMBER):null,policy,approvalPolicy,generationSeed:process.env.GITHUB_RUN_ID});
  fs.mkdirSync('out/autonomous-dispatcher-v1',{recursive:true});fs.writeFileSync('out/autonomous-dispatcher-v1/results.json',JSON.stringify(results,null,2));
  console.log(JSON.stringify({state:'DISPATCH_SCAN_COMPLETE',eligible:results.filter(x=>x.state==='ELIGIBLE').length,
    owner_review_required:results.filter(x=>x.state==='OWNER_REVIEW_REQUIRED').length,
    policy_repair_required:results.filter(x=>x.state==='POLICY_REPAIR_REQUIRED').length,
    skipped:results.filter(x=>x.state==='SKIPPED').length,
    blocked_candidates:results.filter(x=>['OWNER_REVIEW_REQUIRED','POLICY_REPAIR_REQUIRED','SKIPPED'].includes(x.state))
      .map(x=>({pull_request:x.pull_request,state:x.state,reason:x.reason,
        classification_failure:x.classification_failure||null,reclassification:x.reclassification||null,
        capability_repair_analysis:x.capability_repair_analysis?{
          state:x.capability_repair_analysis.state,blocked_path_count:x.capability_repair_analysis.blocked_path_count,
          activation_constraint:x.capability_repair_analysis.activation_constraint,
          receipt_digest:x.capability_repair_analysis.receipt_digest}:null}))}));
}
