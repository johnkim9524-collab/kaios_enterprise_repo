#!/usr/bin/env node
import fs from 'node:fs';
import crypto from 'node:crypto';
import {canonicalJson,sha256} from './lib/autonomous-internal-landing-v1.mjs';

export class DispatcherError extends Error { constructor(code,detail=''){ super(detail?`${code}:${detail}`:code); this.code=code; } }
const fail=(code,detail='')=>{throw new DispatcherError(code,detail)};
const SHA=/^[0-9a-f]{40}$/;

export function assertDelegatedPathScope(changedPaths,policy){
  const exceptions=new Set(policy.delegated_internal_exact_path_exceptions||[]);
  for(const path of changedPaths){
    for(const prefix of policy.owner_reserved_path_prefixes||[]){
      if(path.startsWith(prefix)&&!exceptions.has(path)) fail('DISPATCH_OWNER_RESERVED_PATH',path);
    }
  }
  return [...changedPaths];
}

export function classifyCandidate({pr,mainSha,treeSha,files,statuses=[],checks=[],requiredContexts=[],policy,now=new Date()}) {
  if (!pr || pr.state!=='open' || pr.merged===true || pr.draft!==false) fail('DISPATCH_PR_NOT_READY');
  if (pr.base?.ref!=='main' || pr.base?.sha!==mainSha || !SHA.test(String(mainSha))) fail('DISPATCH_BASE_STALE');
  if (pr.head?.repo?.full_name!==pr.base?.repo?.full_name || !SHA.test(String(pr.head?.sha)) || !SHA.test(String(treeSha))) fail('DISPATCH_REPOSITORY_SCOPE_INVALID');
  const changedPaths=[...files].map(x=>x.filename).sort();
  if (!changedPaths.length || changedPaths.some(x=>typeof x!=='string'||!x||x.startsWith('/')||x.includes('..'))) fail('DISPATCH_PATH_INVALID');
  assertDelegatedPathScope(changedPaths,policy);
  const required=[...new Set(requiredContexts.map(String))].sort();
  if (!required.length) fail('DISPATCH_REQUIRED_CONTEXT_SET_EMPTY');
  const cleanStatuses=statuses.map(x=>({id:Number(x.id),context:String(x.context),state:String(x.state),sha:String(x.sha||'')})).sort((a,b)=>a.context.localeCompare(b.context)||a.id-b.id);
  const cleanChecks=checks.map(x=>({id:Number(x.id),name:String(x.name),head_sha:String(x.head_sha||''),status:String(x.status),conclusion:String(x.conclusion),external_id:x.external_id==null?null:String(x.external_id)})).sort((a,b)=>a.name.localeCompare(b.name)||a.id-b.id);
  if (!cleanStatuses.length&&!cleanChecks.length) fail('DISPATCH_EVIDENCE_MISSING');
  if (cleanStatuses.some(x=>x.state!=='success')||cleanChecks.some(x=>x.status!=='completed'||x.conclusion!=='success')) fail('DISPATCH_CHECKS_NOT_GREEN');
  const boundRequired=required.map(context=>{
    const matches=cleanChecks.filter(x=>x.name===context&&x.head_sha===pr.head.sha&&Number.isSafeInteger(x.id)&&x.id>0);
    if (matches.length!==1) fail(matches.length?'DISPATCH_REQUIRED_CONTEXT_AMBIGUOUS':'DISPATCH_REQUIRED_CONTEXT_MISSING',context);
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

export async function discover({repository,token,prNumber,policy}){
  const [owner,repo]=repository.split('/'); if(!owner||!repo||!token)fail('DISPATCH_CONFIGURATION_INVALID');
  const [branch,rulesets]=await Promise.all([api(`/repos/${repository}/branches/main`,token),api(`/repos/${repository}/rulesets`,token)]); const mainSha=branch.commit?.sha;
  const solo=(rulesets||[]).find(x=>x.name==='KAIOS Solo Owner Preflight'&&x.enforcement==='active');
  if(!solo) fail('DISPATCH_REQUIRED_RULESET_MISSING');
  const soloDetail=await api(`/repos/${repository}/rulesets/${solo.id}`,token);
  if((soloDetail.bypass_actors||[]).length) fail('DISPATCH_RULESET_BYPASS_FORBIDDEN');
  const statusRule=(soloDetail.rules||[]).find(x=>x.type==='required_status_checks');
  if(!statusRule?.parameters?.strict_required_status_checks_policy) fail('DISPATCH_STRICT_REQUIRED_STATUS_POLICY_REQUIRED');
  const requiredContexts=(statusRule.parameters.required_status_checks||[]).map(x=>x.context);
  if(!requiredContexts.length) fail('DISPATCH_REQUIRED_CONTEXT_SET_EMPTY');
  const prs=prNumber?[await api(`/repos/${repository}/pulls/${prNumber}`,token)]:await pages(`/repos/${repository}/pulls?state=open`,token);
  const results=[];
  for(const pr of prs){try{
    const [commit,files,status,checkData]=await Promise.all([api(`/repos/${repository}/git/commits/${pr.head.sha}`,token),pages(`/repos/${repository}/pulls/${pr.number}/files`,token),api(`/repos/${repository}/commits/${pr.head.sha}/status`,token),api(`/repos/${repository}/commits/${pr.head.sha}/check-runs?per_page=100`,token)]);
    results.push({state:'ELIGIBLE',envelope:classifyCandidate({pr,mainSha,treeSha:commit.tree?.sha,files,statuses:status.statuses||[],checks:checkData.check_runs||[],requiredContexts,policy})});
  }catch(error){if(!(error instanceof DispatcherError))throw error;results.push({state:'SKIPPED',pull_request:pr.number,reason:error.code});}}
  return results;
}

if(import.meta.url===`file://${process.argv[1]}`){
  const policy=JSON.parse(fs.readFileSync(process.env.KIDULTS_AUTONOMOUS_POLICY_PATH||'coordination/kidults/governance/autonomous-internal-landing-policy-v1.json','utf8'));
  const results=await discover({repository:process.env.GITHUB_REPOSITORY,token:process.env.GITHUB_TOKEN,prNumber:process.env.KIDULTS_PR_NUMBER?Number(process.env.KIDULTS_PR_NUMBER):null,policy});
  fs.mkdirSync('out/autonomous-dispatcher-v1',{recursive:true});fs.writeFileSync('out/autonomous-dispatcher-v1/results.json',JSON.stringify(results,null,2));
  console.log(JSON.stringify({state:'DISPATCH_SCAN_COMPLETE',eligible:results.filter(x=>x.state==='ELIGIBLE').length,skipped:results.filter(x=>x.state==='SKIPPED').length}));
}
