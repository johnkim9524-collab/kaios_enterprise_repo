#!/usr/bin/env node
// Branch-only recovery: native GitHub Environment review is mandatory for status writes.
// It does not pretend to be a main-ref Handoff or supply synthetic native run IDs.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
export const TARGET = Object.freeze({
 repository:'johnkim9524-collab/kaios_enterprise_repo',repository_id:1281328888,owner:'johnkim9524-collab',pull_request:2576,
 base_sha:'f816cd23948f4a95ad91614a5dd56c5eeb40580b',head_sha:'286d5bbd86f4b8a515f92a134417841be5bdcebd',head_tree_sha:'f936ae7d115fb92ef536d0b314e4c062daa8ef94',
 launcher_branch:'bootstrap/preflight-2576-286d5bbd86f4',workflow_path:'.github/workflows/kidults-direct-owner-landing-handoff-v1.yml',
 title:'KIDULTS Owner Pinned Bootstrap PR #2576 @ 286d5bbd86f4b8a515f92a134417841be5bdcebd',
 operation:'ONE_GITHUB_ENVIRONMENT_GATED_RECOVERY_AND_OWNER_MERGE',scope:'PR_2576_ONLY_NO_MAIN_RULESET_OR_PERMISSION_CHANGE',
 source:'GITHUB_NATIVE_ENVIRONMENT_REQUIRED_REVIEW',
});
export const MARKER='KIDULTS_OWNER_PINNED_BOOTSTRAP_APPROVAL_V1';
const CONTEXT='KIDULTS Governed Landing Authorization V1';
const SHA=/^[a-f0-9]{40}$/;
const canonical=x=>JSON.stringify(x,(_k,v)=>v&&!Array.isArray(v)&&typeof v==='object'?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
const digest=x=>'sha256:'+crypto.createHash('sha256').update(typeof x==='string'?x:canonical(x)).digest('hex');
function need(x,code){if(!x){const e=new Error(code);e.code=code;throw e;}}
const same=(a,b)=>canonical(a)===canonical(b);
const time=v=>{const n=Date.parse(v);need(Number.isFinite(n),'BOOTSTRAP_TIME_INVALID');return n;};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
export function validateRun(run,{runId,attempt,launcherSha,ref}){
 need(SHA.test(launcherSha)&&ref===`refs/heads/${TARGET.launcher_branch}`,'BOOTSTRAP_LAUNCHER_REF');
 need(Number.isSafeInteger(Number(runId))&&Number(runId)>0&&Number(attempt)===1,'BOOTSTRAP_ATTEMPT');
 need(run?.id===Number(runId)&&run.run_attempt===1,'BOOTSTRAP_NATIVE_RUN_IDENTITY');
 need(run.event==='workflow_dispatch'&&run.head_branch===TARGET.launcher_branch&&run.head_sha===launcherSha&&run.path===TARGET.workflow_path&&run.display_title===TARGET.title,'BOOTSTRAP_NATIVE_RUN_TUPLE');
 need(run.actor?.login===TARGET.owner&&run.triggering_actor?.login===TARGET.owner,'BOOTSTRAP_NATIVE_ACTOR');
 need(run.repository?.id===TARGET.repository_id&&run.repository.full_name===TARGET.repository&&run.head_repository?.id===TARGET.repository_id,'BOOTSTRAP_NATIVE_REPOSITORY');
 need(Number.isSafeInteger(run.workflow_id)&&run.workflow_id>0,'BOOTSTRAP_WORKFLOW_ID');return run;
}
export function reconcileRuns(index,current,expected){
 validateRun(current,expected);need(Array.isArray(index),'BOOTSTRAP_INDEX_SHAPE');
 const rows=index.filter(x=>x.id===current.id);need(rows.length<=1,'BOOTSTRAP_CURRENT_RUN_DUPLICATE');
 if(rows.length)for(const f of ['id','run_attempt','workflow_id','event','head_branch','head_sha','path','display_title'])need(rows[0][f]===current[f],`BOOTSTRAP_INDEX_CONFLICT:${f}`);
 const runs=rows.length?[...index]:[...index,current];
 need(runs.every(x=>x.head_branch===TARGET.launcher_branch&&x.workflow_id===current.workflow_id),'BOOTSTRAP_INDEX_FILTER');
 need(runs.length===1&&runs[0].id===current.id,'BOOTSTRAP_ALREADY_DISPATCHED');
 return {matching_run_count:1,current_supplemented:rows.length===0,native_run_id:current.id};
}
export function validateApproval(comment,{launcherSha,runStartedAt,readyAt,headCommittedAt,now=Date.now()}){
 need(comment?.user?.login===TARGET.owner&&comment.user.type==='User'&&comment.author_association==='OWNER'&&comment.performed_via_github_app==null,'BOOTSTRAP_APPROVAL_ACTOR');
 need(comment.created_at===comment.updated_at,'BOOTSTRAP_APPROVAL_EDITED');
 const text=String(comment.body||'');need(text.startsWith(MARKER+'\n'),'BOOTSTRAP_APPROVAL_MARKER');
 let a;try{a=JSON.parse(text.slice(MARKER.length+1));}catch{need(false,'BOOTSTRAP_APPROVAL_JSON');}
 const fixed={...TARGET,launcher_sha:launcherSha,production:'HOLD',public:'HOLD',g5:'HOLD',approval_rebind:'FORBIDDEN'};
 need(same(Object.keys(a).sort(),[...Object.keys(fixed),'expires_at','nonce'].sort()),'BOOTSTRAP_APPROVAL_FIELDS');
 for(const [k,v]of Object.entries(fixed))need(a[k]===v,`BOOTSTRAP_APPROVAL_BINDING:${k}`);
 need(/^[a-f0-9]{32}$/.test(a.nonce),'BOOTSTRAP_APPROVAL_NONCE');
 const approved=time(comment.created_at),expires=time(a.expires_at);
 need(approved>time(readyAt)&&approved>=time(headCommittedAt),'BOOTSTRAP_APPROVAL_ORDER');
 need(approved<time(runStartedAt),'BOOTSTRAP_APPROVAL_AFTER_RUN');
 need(expires>now&&now>=approved&&expires-approved<=3600000,'BOOTSTRAP_APPROVAL_EXPIRY');
 return {comment_id:comment.id,comment_created_at:comment.created_at,body_sha256:digest(text),expires_at:a.expires_at,nonce_sha256:digest(a.nonce),launcher_sha:launcherSha,authorization_source:TARGET.source};
}
export function validateRules(solo,protect){
 need(solo.id===20985805&&protect.id===19862431&&solo.enforcement==='active'&&protect.enforcement==='active','BOOTSTRAP_RULESETS');
 for(const r of [solo,protect])need((r.bypass_actors||[]).length===0&&same(r.conditions?.ref_name,{exclude:[],include:['~DEFAULT_BRANCH']}),'BOOTSTRAP_RULESET_BOUNDARY');
 const status=solo.rules.find(r=>r.type==='required_status_checks')?.parameters;
 const required=['KAIOS Solo Owner Preflight','Validate KAIOS Foundation','Validate Production Container','KIDULTS Scope-Aware Authoritative Status V1',CONTEXT].sort();
 need(status?.strict_required_status_checks_policy===true&&same(status.required_status_checks.map(x=>x.context).sort(),required)&&status.required_status_checks.every(x=>x.integration_id===15368),'BOOTSTRAP_STATUS_ISSUER_OR_REQUIRED_SET');
 const p=protect.rules.find(r=>r.type==='pull_request')?.parameters;
 need(p?.required_approving_review_count===0&&p.dismiss_stale_reviews_on_push===true&&p.require_code_owner_review===false&&p.require_last_push_approval===false&&p.required_review_thread_resolution===true&&p.require_extra_approval_for_unattributed_changes===true,'BOOTSTRAP_PR_POLICY');
 return digest([solo,protect].map(({id,name,enforcement,conditions,rules,bypass_actors})=>({id,name,enforcement,conditions,rules,bypass_actors})));
}
export function validateMerge(pr,commit,{openedAt,expiresAt,windowSeconds}){
 need(pr.merged===true&&pr.head.sha===TARGET.head_sha&&pr.merged_by?.login===TARGET.owner,'BOOTSTRAP_MERGE_ACTOR_OR_HEAD');
 need(commit.sha===pr.merge_commit_sha&&commit.commit?.tree?.sha===TARGET.head_tree_sha,'BOOTSTRAP_MERGE_TREE');
 need(same(commit.parents?.map(x=>x.sha),[TARGET.base_sha,TARGET.head_sha]),'BOOTSTRAP_MERGE_PARENTS');
 const t=time(pr.merged_at);need(t>=time(openedAt)&&t<=time(openedAt)+windowSeconds*1000&&t<=time(expiresAt),'BOOTSTRAP_MERGE_WINDOW');
 return {merge_sha:commit.sha,tree_sha:commit.commit.tree.sha,parents:commit.parents.map(x=>x.sha),merged_by:pr.merged_by.login,merged_at:pr.merged_at};
}

export const ENVIRONMENT = Object.freeze({name:'KIDULTS-OWNER-RECOVERY-2576',id:23510350407,reviewer_id:297161720,branch_policy_id:62050354});
export function validateEnvironment(environment, branches) {
 need(environment?.id===ENVIRONMENT.id&&environment.name===ENVIRONMENT.name,'GITHUB_ENVIRONMENT_IDENTITY');
 need(environment.can_admins_bypass===false,'GITHUB_ENVIRONMENT_ADMIN_BYPASS');
 need(same(environment.deployment_branch_policy,{protected_branches:false,custom_branch_policies:true}),'GITHUB_ENVIRONMENT_BRANCH_MODE');
 const reviewers=(environment.protection_rules||[]).filter(x=>x.type==='required_reviewers');
 need(reviewers.length===1&&reviewers[0].prevent_self_review===false,'GITHUB_ENVIRONMENT_REVIEW_RULE');
 const people=reviewers[0].reviewers;
 need(people?.length===1&&people[0].type==='User'&&people[0].reviewer?.id===ENVIRONMENT.reviewer_id&&people[0].reviewer.login===TARGET.owner,'GITHUB_ENVIRONMENT_REVIEWER');
 need((environment.protection_rules||[]).some(x=>x.type==='branch_policy'),'GITHUB_ENVIRONMENT_BRANCH_RULE');
 need(branches?.total_count===1&&branches.branch_policies?.length===1,'GITHUB_ENVIRONMENT_BRANCH_CARDINALITY');
 const branch=branches.branch_policies[0];
 need(branch.id===ENVIRONMENT.branch_policy_id&&branch.type==='branch'&&branch.name===TARGET.launcher_branch,'GITHUB_ENVIRONMENT_EXACT_BRANCH');
 return digest({id:environment.id,name:environment.name,can_admins_bypass:environment.can_admins_bypass,reviewers:people.map(x=>({type:x.type,id:x.reviewer.id,login:x.reviewer.login})),prevent_self_review:reviewers[0].prevent_self_review,branch});
}
export function requireNativeReview(history) {
 need(Array.isArray(history),'GITHUB_REVIEW_HISTORY_SHAPE');
 const relevant=history.filter(x=>x.environments?.some(e=>e.id===ENVIRONMENT.id));
 need(relevant.length===1,'GITHUB_NATIVE_REVIEW_CARDINALITY');
 const review=relevant[0];
 need(review.state==='approved'&&review.user?.id===ENVIRONMENT.reviewer_id&&review.user.login===TARGET.owner&&review.user.type==='User','GITHUB_NATIVE_OWNER_REVIEW_REQUIRED');
 need(review.environments.filter(x=>x.id===ENVIRONMENT.id).length===1&&review.environments.find(x=>x.id===ENVIRONMENT.id).name===ENVIRONMENT.name,'GITHUB_REVIEW_ENVIRONMENT_BINDING');
 return {source:'GITHUB_NATIVE_RUN_APPROVAL_HISTORY',reviewer:review.user.login,reviewer_id:review.user.id,environment_id:ENVIRONMENT.id,state:review.state,review_digest:digest(review)};
}
export function validatePreflight(previous,{runId,launcherSha,environmentDigest,rulesDigest}) {
 need(previous&&typeof previous==='object','GITHUB_PREFLIGHT_MISSING');
 const {receipt_sha256,...core}=previous;
 need(receipt_sha256===digest(core),'GITHUB_PREFLIGHT_DIGEST');
 need(core.state==='READ_ONLY_PREFLIGHT_VERIFIED'&&core.native_run_id===Number(runId)&&core.native_run_attempt===1&&core.launcher_sha===launcherSha,'GITHUB_PREFLIGHT_EXECUTION_BINDING');
 need(same(core.target,TARGET)&&core.source_sha===TARGET.head_sha&&core.source_tree===TARGET.head_tree_sha,'GITHUB_PREFLIGHT_TARGET_BINDING');
 need(core.environment_digest===environmentDigest&&core.ruleset_digest===rulesDigest,'GITHUB_PREFLIGHT_PROTECTION_DRIFT');
 need(core.status_write_performed===false&&core.merge_performed_by_workflow===false,'GITHUB_PREFLIGHT_AUTHORITY_BOUNDARY');
 return core;
}
async function main(){
 const mode=process.argv[2];need(['preflight','authorize'].includes(mode),'BOOTSTRAP_MODE');
 const privileged=mode==='authorize';
 need(process.env.GITHUB_JOB===(privileged?'github-approved-recovery':'read-only-verification'),'GITHUB_JOB_SEPARATION');
 const source=path.resolve(process.env.SOURCE_ROOT||'.'),trusted=path.resolve(process.env.TRUSTED_ROOT||'../trusted');
 const output=path.resolve(process.env.BOOTSTRAP_OUTPUT||'../out/bootstrap2576');fs.mkdirSync(output,{recursive:true,mode:0o700});
 const receiptPath=path.join(output,mode+'.json');
 const binding={runId:process.env.GITHUB_RUN_ID,attempt:process.env.GITHUB_RUN_ATTEMPT,launcherSha:process.env.GITHUB_SHA,ref:process.env.GITHUB_REF};
 need(process.env.GH_TOKEN&&binding.launcherSha===process.env.EXPECTED_LAUNCHER_SHA,'BOOTSTRAP_ENV_BINDING');
 let wrote=false,receipt={id:'kidults-github-protected-recovery-2576-v1',version:'2.0.0',state:'VALIDATION_PENDING',mode,target:TARGET,native_run_id:Number(binding.runId),native_run_attempt:Number(binding.attempt),launcher_sha:binding.launcherSha,source_sha:TARGET.head_sha,source_tree:TARGET.head_tree_sha,status_write_performed:false,merge_performed_by_workflow:false,natural_operation_proof:false,production:'HOLD',public:'HOLD',g5:'HOLD'};
 const save=()=>fs.writeFileSync(receiptPath,JSON.stringify({...receipt,receipt_sha256:digest(receipt)},null,2)+'\n',{mode:0o600});save();
 const request=async(route,method='GET',body=null)=>{
  need(route.startsWith('/'),'BOOTSTRAP_API_PATH');
  if(method!=='GET')need(privileged&&receipt.native_environment_review?.state==='approved'&&method==='POST'&&route===`/statuses/${TARGET.head_sha}`,'GITHUB_WRITE_WITHOUT_NATIVE_APPROVAL');
  const response=await fetch(`https://api.github.com/repos/${TARGET.repository}${route}`,{method,headers:{Authorization:`Bearer ${process.env.GH_TOKEN}`,Accept:'application/vnd.github+json','Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'kidults-github-environment-recovery-2576'},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(20000)});
  need(response.ok,`BOOTSTRAP_GITHUB_API:${response.status}:${route.split('?')[0]}`);return response.json();
 };
 const pages=async(route,key=null)=>{const out=[];for(let page=1;page<=10;page++){const data=await request(`${route}${route.includes('?')?'&':'?'}per_page=100&page=${page}`);const rows=key?data[key]:data;need(Array.isArray(rows),'BOOTSTRAP_PAGINATION_SHAPE');out.push(...rows);if(rows.length<100)return out;}need(false,'BOOTSTRAP_PAGINATION_INCOMPLETE');};
 const publish=(state,description)=>request(`/statuses/${TARGET.head_sha}`,'POST',{state,context:CONTEXT,description,target_url:`https://github.com/${TARGET.repository}/actions/runs/${binding.runId}`});
 try{
  const git=(dir,...args)=>execFileSync('git',['-C',dir,...args],{encoding:'utf8'}).trim();
  need(git(source,'rev-parse','HEAD')===TARGET.head_sha&&git(source,'rev-parse','HEAD^{tree}')===TARGET.head_tree_sha&&!git(source,'status','--porcelain'),'BOOTSTRAP_SOURCE_CHECKOUT');
  need(git(trusted,'rev-parse','HEAD')===TARGET.base_sha&&!git(trusted,'status','--porcelain'),'BOOTSTRAP_TRUSTED_BASE');
  // Privileged validation executes only pre-existing protected-base libraries, never candidate code.
  const gates=await import(pathToFileURL(path.join(trusted,'scripts/kidults/kpmo/lib/governed-landing-native-gates-v1.mjs')));
  const readyLib=await import(pathToFileURL(path.join(trusted,'scripts/kidults/kpmo/lib/direct-owner-ready-event-v1.mjs')));
  const policy=JSON.parse(fs.readFileSync(path.join(trusted,'coordination/kidults/kpmo/governed-landing-authorization-policy-v1.json')));
  const scope=JSON.parse(fs.readFileSync(path.join(trusted,'coordination/kidults/kpmo/scope-aware-required-status-policy-v1.json')));
  const envRoute=`/environments/${ENVIRONMENT.name}`;
  const collect=async()=>{
   const [pr,mainRef,head,run,environment,branches,checks,statuses,solo,protect,branch,files,timeline,reviews,ci]=await Promise.all([
    request('/pulls/2576'),request('/git/ref/heads/main'),request(`/commits/${TARGET.head_sha}`),request(`/actions/runs/${binding.runId}`),request(envRoute),request(`${envRoute}/deployment-branch-policies?per_page=100`),pages(`/commits/${TARGET.head_sha}/check-runs?filter=latest`,'check_runs'),request(`/commits/${TARGET.head_sha}/status`),request('/rulesets/20985805'),request('/rulesets/19862431'),request(`/git/ref/heads/${TARGET.launcher_branch}`),pages('/pulls/2576/files'),pages('/issues/2576/timeline'),pages('/pulls/2576/reviews'),request('/actions/runs/37334773778')]);
   gates.assertPromotablePullRequest(pr,{repository:TARGET.repository,expectedHeadSha:TARGET.head_sha,expectedBase:'main',noMergePolicy:policy.no_merge_policy});
   need(pr.base.sha===TARGET.base_sha&&mainRef.object.sha===TARGET.base_sha,'BOOTSTRAP_MAIN_DRIFT');
   need(pr.mergeable===true&&head.sha===TARGET.head_sha&&head.commit.tree.sha===TARGET.head_tree_sha,'BOOTSTRAP_TARGET_TREE');
   need(branch.object.sha===binding.launcherSha,'BOOTSTRAP_LAUNCHER_BRANCH_MOVED');validateRun(run,binding);
   const environmentDigest=validateEnvironment(environment,branches),rulesDigest=validateRules(solo,protect);
   const ready=readyLib.selectLatestLifecycleReadyEvent({timeline,repositoryOwner:TARGET.owner,pullRequest:pr});
   const index=await pages(`/actions/workflows/${run.workflow_id}/runs?event=workflow_dispatch&branch=${encodeURIComponent(TARGET.launcher_branch)}`,'workflow_runs');
   const cardinality=reconcileRuns(index,run,binding);
   const technical=checks.filter(x=>scope.technical_base_contexts.includes(x.name));
   need(technical.every(x=>x.app?.id===15368&&x.head_sha===TARGET.head_sha),'BOOTSTRAP_CHECK_ISSUER');gates.evaluateRequiredCheckRuns(checks,scope.technical_base_contexts);
   const aggregate=statuses.statuses.find(x=>x.context===scope.required_status_context);
   need(aggregate?.state==='success'&&(aggregate.creator?.login==='github-actions[bot]'||/\/in\/15368(?:\?|$)/.test(aggregate.avatar_url||'')),'BOOTSTRAP_SCOPE_STATUS');
   const reviewMap=new Map();for(const r of reviews)if(r.commit_id===TARGET.head_sha&&r.state!=='COMMENTED')reviewMap.set(r.user.login,r);
   need(![...reviewMap.values()].some(x=>x.state==='CHANGES_REQUESTED'),'BOOTSTRAP_CHANGES_REQUESTED');
   const allowed=['coordination/kidults/governance/approval-policy-file-manifest-v1.json','coordination/kidults/governance/approval-policy-inventory-v1.json','scripts/kidults/kpmo/run-atomic-governed-landing-v1.mjs','scripts/kidults/kpmo/run-atomic-landing-one-use-preflight-v1.mjs','scripts/kidults/kpmo/run-direct-owner-landing-handoff-v1.mjs','tests/kidults/kpmo/atomic-landing-one-use-preflight-v1.test.mjs','tests/kidults/kpmo/direct-owner-landing-handoff-v1.test.mjs'];
   need(files.length===7&&pr.changed_files===7&&same(files.map(x=>x.filename).sort(),allowed.sort()),'BOOTSTRAP_CHANGED_FILES');
   need(ci.id===37334773778&&ci.head_sha===TARGET.head_sha&&ci.run_attempt===1&&ci.event==='pull_request'&&ci.status==='completed'&&ci.conclusion==='success','BOOTSTRAP_EXISTING_CI_PROOF');
   return {environmentDigest,rulesDigest,cardinality,ready,ci_run_id:ci.id,technical_checks:technical.map(x=>({id:x.id,name:x.name,conclusion:x.conclusion,app_id:x.app.id,head_sha:x.head_sha})),scope_status_id:aggregate.id};
  };
  const state=await collect();
  receipt={...receipt,environment_digest:state.environmentDigest,ruleset_digest:state.rulesDigest,cardinality:state.cardinality,ready_event:state.ready,technical_checks:state.technical_checks,scope_status_id:state.scope_status_id,reused_ci_run_id:state.ci_run_id,evaluated_at:new Date().toISOString()};
  if(!privileged){receipt.state='READ_ONLY_PREFLIGHT_VERIFIED';save();console.log(JSON.stringify(receipt));return;}
  const previous=JSON.parse(fs.readFileSync(path.join(output,'preflight.json')));
  validatePreflight(previous,{runId:binding.runId,launcherSha:binding.launcherSha,environmentDigest:state.environmentDigest,rulesDigest:state.rulesDigest});
  const nativeReview=requireNativeReview(await request(`/actions/runs/${binding.runId}/approvals`));
  const jobs=await pages(`/actions/runs/${binding.runId}/jobs?filter=latest`,'jobs');
  need(jobs.filter(x=>x.name==='Read-only verification for PR 2576'&&x.status==='completed'&&x.conclusion==='success').length===1,'GITHUB_READ_ONLY_JOB_NOT_SUCCESS');
  need(jobs.filter(x=>x.name==='GitHub Owner approval and bounded recovery for PR 2576'&&x.status==='in_progress').length===1,'GITHUB_APPROVED_JOB_NOT_ACTIVE');
  const artifactId=Number(process.env.PREFLIGHT_ARTIFACT_ID);need(Number.isSafeInteger(artifactId)&&artifactId>0,'GITHUB_PREFLIGHT_ARTIFACT_ID');
  const artifact=await request(`/actions/artifacts/${artifactId}`);
  need(artifact.id===artifactId&&artifact.expired===false&&artifact.name===`github-protected-preflight-2576-${binding.runId}-1`&&artifact.workflow_run?.id===Number(binding.runId)&&artifact.workflow_run.head_sha===binding.launcherSha,'GITHUB_PREFLIGHT_ARTIFACT_BINDING');
  const fresh=await collect();need(fresh.rulesDigest===state.rulesDigest&&fresh.environmentDigest===state.environmentDigest&&same(fresh.ready,state.ready),'GITHUB_PREWINDOW_DRIFT');
  receipt.native_environment_review=nativeReview;
  const openedAt=new Date().toISOString(),windowSeconds=600,expiresAt=new Date(Date.parse(openedAt)+windowSeconds*1000).toISOString();
  receipt={...receipt,state:'NATIVE_OWNER_APPROVED_WINDOW_OPEN',window_opened_at:openedAt,window_expires_at:expiresAt,window_seconds:windowSeconds,preflight_artifact_id:artifactId,status_write_performed:true};save();wrote=true;
  await publish('success','GitHub Environment Owner review and exact PR2576 checks verified; 600s merge window');
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,`## PR #2576 recovery\nNative Owner environment review verified. Exact head: ${TARGET.head_sha}. Window expires ${expiresAt}. No production deployment.\n`);
  console.log(JSON.stringify({state:receipt.state,expires_at:expiresAt}));
  while(Date.now()<Date.parse(expiresAt)){
   await pause(3000);
   const [pr,mainRef,environment,branches,solo,protect,history]=await Promise.all([request('/pulls/2576'),request('/git/ref/heads/main'),request(envRoute),request(`${envRoute}/deployment-branch-policies?per_page=100`),request('/rulesets/20985805'),request('/rulesets/19862431'),request(`/actions/runs/${binding.runId}/approvals`)]);
   need(validateEnvironment(environment,branches)===state.environmentDigest&&validateRules(solo,protect)===state.rulesDigest,'GITHUB_PROTECTION_CHANGED_DURING_WINDOW');
   need(same(requireNativeReview(history),nativeReview),'GITHUB_REVIEW_CHANGED_DURING_WINDOW');
   if(pr.merged){const commit=await request(`/commits/${pr.merge_commit_sha}`);const merge=validateMerge(pr,commit,{openedAt,expiresAt,windowSeconds});need(mainRef.object.sha===merge.merge_sha,'BOOTSTRAP_MERGE_NOT_CURRENT_MAIN');receipt={...receipt,state:'GITHUB_PROTECTED_RECOVERY_MERGE_VERIFIED',merge,finished_at:new Date().toISOString(),postmerge_natural_chain_verified:false,whole_mission_complete:false};save();fs.appendFileSync(process.env.GITHUB_OUTPUT,`merge_sha=${merge.merge_sha}\n`);return;}
   need(pr.state==='open'&&pr.head.sha===TARGET.head_sha&&mainRef.object.sha===TARGET.base_sha,'BOOTSTRAP_TARGET_DRIFT_DURING_WINDOW');
  }
  await publish('pending','GitHub-approved recovery window expired unconsumed; no automatic retry');wrote=false;need(false,'GITHUB_RECOVERY_WINDOW_EXPIRED');
 }catch(error){receipt={...receipt,state:'VERIFIED_FAIL',failure_code:String(error.code||error.message).slice(0,160),finished_at:new Date().toISOString()};save();if(wrote){try{await publish('failure',receipt.failure_code.slice(0,140));}catch{}}console.error(JSON.stringify(receipt));process.exitCode=1;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await main();
