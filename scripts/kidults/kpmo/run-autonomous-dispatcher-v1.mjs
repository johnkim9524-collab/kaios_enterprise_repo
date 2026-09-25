#!/usr/bin/env node
import fs from 'node:fs';
import crypto from 'node:crypto';
import {assertAutonomousFileScope,canonicalJson,sha256} from './lib/autonomous-internal-landing-v1.mjs';
import {evaluateSemanticCapabilityDelta} from './lib/semantic-capability-delta-v1.mjs';

export class DispatcherError extends Error { constructor(code,detail=''){ super(detail?`${code}:${detail}`:code); this.code=code; } }
const fail=(code,detail='')=>{throw new DispatcherError(code,detail)};
const SHA=/^[0-9a-f]{40}$/;

export function assertDelegatedPathScope(changedPaths,policy){
  try { return assertAutonomousFileScope({files:changedPaths,policy,errorCode:'DISPATCH_OWNER_RESERVED_ACTION'}); }
  catch(error){ if(error?.code) throw new DispatcherError(error.code,error.message.split(':').slice(1).join(':')); throw error; }
}

export function classifyCandidate({pr,mainSha,treeSha,files,statuses=[],checks=[],requiredChecks=[],requiredContexts=[],policy,now=new Date()}) {
  if (!pr || pr.state!=='open' || pr.merged===true || pr.draft!==false) fail('DISPATCH_PR_NOT_READY');
  if (pr.base?.ref!=='main' || pr.base?.sha!==mainSha || !SHA.test(String(mainSha))) fail('DISPATCH_BASE_STALE');
  if (pr.head?.repo?.full_name!==pr.base?.repo?.full_name || !SHA.test(String(pr.head?.sha)) || !SHA.test(String(treeSha))) fail('DISPATCH_REPOSITORY_SCOPE_INVALID');
  const changedPaths=[...files].map(x=>x.filename).sort();
  if (!changedPaths.length || changedPaths.some(x=>typeof x!=='string'||!x||x.startsWith('/')||x.includes('..'))) fail('DISPATCH_PATH_INVALID');
  assertDelegatedPathScope(files,policy);
  evaluateSemanticCapabilityDelta({files,policy});
  const required=(requiredChecks.length?requiredChecks:requiredContexts.map(context=>({context,integration_id:0})))
    .map(value=>({context:String(value.context),integration_id:Number(value.integration_id||0)}))
    .sort((a,b)=>a.context.localeCompare(b.context)||a.integration_id-b.integration_id);
  if(new Set(required.map(value=>`${value.context}:${value.integration_id}`)).size!==required.length) fail('DISPATCH_REQUIRED_CONTEXT_SET_AMBIGUOUS');
  if (!required.length) fail('DISPATCH_REQUIRED_CONTEXT_SET_EMPTY');
  const cleanStatuses=statuses.map(x=>({id:Number(x.id),context:String(x.context),state:String(x.state),sha:String(x.sha||'')})).sort((a,b)=>a.context.localeCompare(b.context)||a.id-b.id);
  const cleanChecks=checks.map(x=>({id:Number(x.id),name:String(x.name),head_sha:String(x.head_sha||''),app_id:Number(x.app?.id||x.app_id||0),status:String(x.status),conclusion:String(x.conclusion),external_id:x.external_id==null?null:String(x.external_id),semantic_evidence:[x.output?.title,x.output?.summary,x.output?.text].filter(Boolean).join('\n')})).sort((a,b)=>a.name.localeCompare(b.name)||a.app_id-b.app_id||a.id-b.id);
  if (!cleanStatuses.length&&!cleanChecks.length) fail('DISPATCH_EVIDENCE_MISSING');
  const boundRequired=required.map(binding=>{
    const matches=cleanChecks.filter(x=>x.name===binding.context&&(!binding.integration_id||x.app_id===binding.integration_id)&&x.head_sha===pr.head.sha&&Number.isSafeInteger(x.id)&&x.id>0);
    if (matches.length!==1) fail(matches.length?'DISPATCH_REQUIRED_CONTEXT_AMBIGUOUS':'DISPATCH_REQUIRED_CONTEXT_MISSING',binding.context);
    if(matches[0].status!=='completed'||matches[0].conclusion!=='success') fail('DISPATCH_CHECKS_NOT_GREEN',binding.context);
    if(binding.context==='KPMO Live Canonical Issue Truth V1'){
      if(/IMPLEMENTED_NOT_VERIFIED/.test(matches[0].semantic_evidence)||!/\bVERIFIED_PASS\b/.test(matches[0].semantic_evidence)) fail('DISPATCH_CANONICAL_SEMANTIC_STATE_NOT_VERIFIED');
    }
    return matches[0];
  });
  const testEvidence={source:'GITHUB_LIVE_PROTECTED_MAIN_REQUIRED_CHECKS',result:'PASS',required_contexts:required,required_check_runs:boundRequired,statuses:cleanStatuses,checks:cleanChecks};
  testEvidence.artifact_digest=sha256(canonicalJson({statuses:cleanStatuses,checks:cleanChecks}));
  const rollbackPlan={source:'GITHUB_LIVE_EXACT_BINDING',strategy:'REVERT_MERGE_COMMIT',verified:true,base_sha:mainSha,head_tree_sha:treeSha};
  const issuedAt=new Date(now); const expiresAt=new Date(issuedAt.getTime()+Number(policy.durable_single_use.maximum_ttl_seconds)*1000);
  const scopeDigest=sha256(changedPaths.join('\n'));
  const generation=`pr-${pr.number}-${pr.head.sha.slice(0,20)}`;
  const nonce=crypto.createHash('sha256').update(`${pr.base.repo.id}:${pr.number}:${mainSha}:${pr.head.sha}:${treeSha}:${scopeDigest}`).digest('hex');
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
async function attachImmutableContents({repository,baseSha,headSha,files,token}){
  return Promise.all(files.map(async file=>{
    if(file.status==='removed'||file.status==='renamed') fail('DISPATCH_OWNER_RESERVED_ACTION',`${file.filename}:${file.status.toUpperCase()}`);
    const head_content=await immutableContent(repository,file.filename,headSha,token);
    const base_content=file.status==='added'?'':await immutableContent(repository,file.filename,baseSha,token);
    return {...file,base_content,head_content};
  }));
}

export async function discover({repository,token,prNumber,policy}){
  const [owner,repo]=repository.split('/'); if(!owner||!repo||!token)fail('DISPATCH_CONFIGURATION_INVALID');
  const [branch,rulesets]=await Promise.all([api(`/repos/${repository}/branches/main`,token),api(`/repos/${repository}/rulesets`,token)]); const mainSha=branch.commit?.sha;
  const solo=(rulesets||[]).find(x=>x.name==='KAIOS Solo Owner Preflight'&&x.enforcement==='active');
  if(!solo) fail('DISPATCH_REQUIRED_RULESET_MISSING');
  const soloDetail=await api(`/repos/${repository}/rulesets/${solo.id}`,token);
  if((soloDetail.bypass_actors||[]).length) fail('DISPATCH_RULESET_BYPASS_FORBIDDEN');
  const statusRule=(soloDetail.rules||[]).find(x=>x.type==='required_status_checks');
  if(!statusRule?.parameters?.strict_required_status_checks_policy) fail('DISPATCH_STRICT_REQUIRED_STATUS_POLICY_REQUIRED');
  const requiredChecks=(statusRule.parameters.required_status_checks||[]).map(x=>({context:x.context,integration_id:Number(x.integration_id||0)}));
  if(!requiredChecks.length) fail('DISPATCH_REQUIRED_CONTEXT_SET_EMPTY');
  const prs=prNumber?[await api(`/repos/${repository}/pulls/${prNumber}`,token)]:await pages(`/repos/${repository}/pulls?state=open`,token);
  const results=[];
  for(const pr of prs){try{
    const [commit,fileRecords,status,checks]=await Promise.all([api(`/repos/${repository}/git/commits/${pr.head.sha}`,token),pages(`/repos/${repository}/pulls/${pr.number}/files`,token),api(`/repos/${repository}/commits/${pr.head.sha}/status`,token),checkPages(repository,pr.head.sha,token)]);
    const files=await attachImmutableContents({repository,baseSha:mainSha,headSha:pr.head.sha,files:fileRecords,token});
    results.push({state:'ELIGIBLE',envelope:classifyCandidate({pr,mainSha,treeSha:commit.tree?.sha,files,statuses:status.statuses||[],checks,requiredChecks,policy})});
  }catch(error){if(!(error instanceof DispatcherError))throw error;results.push({state:'SKIPPED',pull_request:pr.number,reason:error.code});}}
  return results;
}

if(import.meta.url===`file://${process.argv[1]}`){
  const policy=JSON.parse(fs.readFileSync(process.env.KIDULTS_AUTONOMOUS_POLICY_PATH||'coordination/kidults/governance/autonomous-internal-landing-policy-v1.json','utf8'));
  const results=await discover({repository:process.env.GITHUB_REPOSITORY,token:process.env.GITHUB_TOKEN,prNumber:process.env.KIDULTS_PR_NUMBER?Number(process.env.KIDULTS_PR_NUMBER):null,policy});
  fs.mkdirSync('out/autonomous-dispatcher-v1',{recursive:true});fs.writeFileSync('out/autonomous-dispatcher-v1/results.json',JSON.stringify(results,null,2));
  console.log(JSON.stringify({state:'DISPATCH_SCAN_COMPLETE',eligible:results.filter(x=>x.state==='ELIGIBLE').length,skipped:results.filter(x=>x.state==='SKIPPED').length}));
}
