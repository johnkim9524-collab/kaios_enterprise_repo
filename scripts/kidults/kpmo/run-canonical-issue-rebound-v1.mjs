#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import {
  canonicalIssues,
  buildLiveMaterialRegistry,
  githubJson,
  validateCanonicalBlock
} from './validate-canonical-material-registry-binding-v1.mjs';

const baselineTrustRootDefects=[1330,1412,1416,1419,1420,1421,1423,1427];
const correctionPrNumber=1431;
const MAX_BODY_BYTES=65536;
const sha256Text=value=>`sha256:${crypto.createHash('sha256').update(String(value ?? '')).digest('hex')}`;
const exactSha=value=>/^[0-9a-f]{40}$/.test(String(value||''));
const exactDigest=value=>/^sha256:[0-9a-f]{64}$/.test(String(value||''));
const stableJson=value=>Array.isArray(value)?`[${value.map(stableJson).join(',')}]`:value&&typeof value==='object'?`{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${stableJson(value[k])}`).join(',')}}`:JSON.stringify(value);
const digestObject=value=>`sha256:${crypto.createHash('sha256').update(stableJson(value)).digest('hex')}`;
const req=(value,code)=>{if(!value)throw new Error(code);};

function arg(flag){const i=process.argv.indexOf(flag);return i>=0?process.argv[i+1]:null;}
function expectedAuthorization(mainSha){return `CANONICAL-REBOUND-${mainSha.slice(0,12)}`;}
function ownerOf(repository){return String(repository||'').split('/')[0];}
function membersText(summary){return summary.members.length?summary.members.map(n=>`#${n}`).join(','):'NONE';}

export function buildCanonicalBlock({mainSha,authorizationId,correctionHead,activeBaselineDefects,material}){
  return `<!-- KPMO_CANONICAL_TRUTH_V2_START -->\n### KPMO Canonical Truth v2 — governed 25-board rebound\n- protected main: \`${mainSha}\`\n- canonical correction PR: #${correctionPrNumber} exact head \`${correctionHead}\`\n- active baseline trust-root defects: ${activeBaselineDefects.length?activeBaselineDefects.map(n=>`#${n}`).join(', '):'NONE'}\n- material defect registry count: \`${material.count}\`\n- material defect registry binding sha256: \`${material.digest}\`\n- material defect registry members: \`${membersText(material)}\`\n- rebound authorization: \`${authorizationId}\`\n- empirical promotion: **false**\n- whole-platform closure: **false**\n- transaction semantics: **REVERSIBLE_FAIL_CLOSED_NOT_GITHUB_ATOMIC**\n- Production/Public/G5: **HOLD**\n<!-- KPMO_CANONICAL_TRUTH_V2_END -->`;
}
export function appendCanonicalBlock(body,block){
  const prefix=String(body||'').replace(/\s+$/,'');
  return `${prefix}${prefix?'\n\n':''}${block}\n`;
}
function planCore(plan){const copy=structuredClone(plan);delete copy.plan_digest;return copy;}
export function validatePlan(plan){
  req(plan?.id==='kidults-canonical-issue-rebound-plan-v1','PLAN_ID');
  req(plan?.version==='1.0.0','PLAN_VERSION');
  req(plan?.transaction_semantics==='REVERSIBLE_FAIL_CLOSED_NOT_GITHUB_ATOMIC','PLAN_SEMANTICS');
  req(exactSha(plan.expected_main_sha)&&plan.observed_main_sha===plan.expected_main_sha,'PLAN_MAIN');
  req(plan.authorization_id===expectedAuthorization(plan.expected_main_sha),'PLAN_AUTHORIZATION');
  req(Number(plan.correction_pr)===correctionPrNumber&&exactSha(plan.correction_head),'PLAN_CORRECTION');
  req(Array.isArray(plan.active_baseline_trust_root_defects),'PLAN_BASELINE');
  req(Number.isInteger(plan.material_defect_count)&&plan.material_defect_count>=0,'PLAN_MATERIAL_COUNT');
  req(exactDigest(plan.material_defect_registry_binding_sha256),'PLAN_MATERIAL_DIGEST');
  req(Array.isArray(plan.material_defect_registry_members),'PLAN_MATERIAL_MEMBERS');
  req(Array.isArray(plan.issues)&&plan.issues.length===canonicalIssues.length,'PLAN_ISSUE_COUNT');
  const numbers=plan.issues.map(x=>x.issue_number);
  req(JSON.stringify(numbers)===JSON.stringify(canonicalIssues),'PLAN_ISSUE_ORDER');
  req(typeof plan.canonical_block==='string'&&plan.canonical_block.includes('KPMO_CANONICAL_TRUTH_V2_START'),'PLAN_BLOCK');
  for(const item of plan.issues){
    req(exactDigest(item.pre_body_sha256)&&sha256Text(item.original_body)===item.pre_body_sha256,`PLAN_PRE_DIGEST:${item.issue_number}`);
    req(exactDigest(item.desired_body_sha256)&&sha256Text(item.desired_body)===item.desired_body_sha256,`PLAN_DESIRED_DIGEST:${item.issue_number}`);
    req(item.desired_body===appendCanonicalBlock(item.original_body,plan.canonical_block),`PLAN_APPEND_ONLY:${item.issue_number}`);
    req(Buffer.byteLength(item.desired_body,'utf8')<=MAX_BODY_BYTES,`PLAN_BODY_TOO_LARGE:${item.issue_number}`);
  }
  req(exactDigest(plan.plan_digest)&&digestObject(planCore(plan))===plan.plan_digest,'PLAN_DIGEST');
  return true;
}

function headersFor(token){return {Accept:'application/vnd.github+json',Authorization:`Bearer ${token}`,'X-GitHub-Api-Version':'2022-11-28'};}
async function requestJson(url,{headers,method='GET',body}={}){
  const response=await fetch(url,{headers,method,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
  const text=await response.text();
  if(!response.ok)throw new Error(`GITHUB_HTTP_${response.status}:${text.slice(0,300)}`);
  return text?JSON.parse(text):{};
}
async function issueJson(repository,number,headers){return requestJson(`https://api.github.com/repos/${repository}/issues/${number}`,{headers});}
async function patchIssueBody(repository,number,body,headers){return requestJson(`https://api.github.com/repos/${repository}/issues/${number}`,{headers:{...headers,'Content-Type':'application/json'},method:'PATCH',body:{body}});}

async function controlState({repository,token,expectedMainSha}){
  const {headers,summary}=await buildLiveMaterialRegistry({repository,token});
  const main=await githubJson(`https://api.github.com/repos/${repository}/branches/main`,headers);
  const observedMainSha=String(main?.commit?.sha||'');
  req(exactSha(observedMainSha),'LIVE_MAIN_INVALID');
  req(observedMainSha===expectedMainSha,`MAIN_MOVED:${observedMainSha}:${expectedMainSha}`);
  const correction=await githubJson(`https://api.github.com/repos/${repository}/pulls/${correctionPrNumber}`,headers);
  const correctionHead=String(correction?.head?.sha||'');
  req(exactSha(correctionHead)&&correction?.base?.ref==='main','CORRECTION_PR_INVALID');
  const baseline=[];
  for(const number of baselineTrustRootDefects){const issue=await issueJson(repository,number,headers);if(issue.state==='open')baseline.push(number);}
  return {headers,observedMainSha,correctionHead,activeBaselineDefects:baseline,material:summary};
}

export async function createPlan({repository,token,expectedMainSha,authorizationId,actor}){
  req(repository==='johnkim9524-collab/kaios_enterprise_repo','REPOSITORY_SCOPE');
  req(exactSha(expectedMainSha),'EXPECTED_MAIN_INVALID');
  req(actor===ownerOf(repository),'OWNER_ACTOR_REQUIRED');
  req(authorizationId===expectedAuthorization(expectedMainSha),'AUTHORIZATION_ID_INVALID');
  const state=await controlState({repository,token,expectedMainSha});
  const block=buildCanonicalBlock({mainSha:expectedMainSha,authorizationId,correctionHead:state.correctionHead,activeBaselineDefects:state.activeBaselineDefects,material:state.material});
  const issues=[];
  for(const number of canonicalIssues){
    const issue=await issueJson(repository,number,state.headers);
    const originalBody=String(issue.body||'');
    const desiredBody=appendCanonicalBlock(originalBody,block);
    req(Buffer.byteLength(desiredBody,'utf8')<=MAX_BODY_BYTES,`ISSUE_BODY_LIMIT:${number}`);
    issues.push({issue_number:number,pre_updated_at:issue.updated_at||null,pre_body_sha256:sha256Text(originalBody),desired_body_sha256:sha256Text(desiredBody),original_body:originalBody,desired_body:desiredBody});
  }
  const plan={
    id:'kidults-canonical-issue-rebound-plan-v1',version:'1.0.0',created_at:new Date().toISOString(),repository,
    transaction_semantics:'REVERSIBLE_FAIL_CLOSED_NOT_GITHUB_ATOMIC',expected_main_sha:expectedMainSha,observed_main_sha:state.observedMainSha,
    authorization_id:authorizationId,actor,correction_pr:correctionPrNumber,correction_head:state.correctionHead,
    active_baseline_trust_root_defects:state.activeBaselineDefects,
    material_defect_count:state.material.count,material_defect_registry_binding_sha256:state.material.digest,
    material_defect_registry_digest_scope:state.material.digest_scope,material_defect_registry_members:state.material.members,
    canonical_block:block,issues,authority_boundary:{issue_body_append_planned:true,issue_write_performed:false,empirical_promotion:false,public:'HOLD',production:'HOLD',g5:'HOLD'},
    residual_risk:['GITHUB_REST_HAS_NO_MULTI_ISSUE_ATOMIC_TRANSACTION','READ_THEN_PATCH_RACE_WINDOW_NONZERO','ROLLBACK_CAN_FAIL_IF_CONCURRENT_EXTERNAL_EDIT_OCCURS']
  };
  plan.plan_digest=digestObject(planCore(plan));validatePlan(plan);return plan;
}

async function assertLiveMatchesPlan(plan,token){
  const state=await controlState({repository:plan.repository,token,expectedMainSha:plan.expected_main_sha});
  req(state.correctionHead===plan.correction_head,'CORRECTION_HEAD_MOVED');
  req(JSON.stringify(state.activeBaselineDefects)===JSON.stringify(plan.active_baseline_trust_root_defects),'BASELINE_SET_MOVED');
  req(state.material.count===plan.material_defect_count,'MATERIAL_COUNT_MOVED');
  req(state.material.digest===plan.material_defect_registry_binding_sha256,'MATERIAL_DIGEST_MOVED');
  req(JSON.stringify(state.material.members)===JSON.stringify(plan.material_defect_registry_members),'MATERIAL_MEMBERS_MOVED');
  return state;
}
async function preflightPreimages(plan,headers){
  for(const item of plan.issues){
    const issue=await issueJson(plan.repository,item.issue_number,headers);
    req(sha256Text(issue.body||'')===item.pre_body_sha256,`PREIMAGE_BODY_MOVED:${item.issue_number}`);
    req((issue.updated_at||null)===item.pre_updated_at,`PREIMAGE_UPDATED_AT_MOVED:${item.issue_number}`);
  }
}
async function rollbackChanged(plan,headers){
  const results=[];
  for(const item of [...plan.issues].reverse()){
    try{
      const current=await issueJson(plan.repository,item.issue_number,headers);
      const digest=sha256Text(current.body||'');
      if(digest===item.pre_body_sha256){results.push({issue_number:item.issue_number,state:'ALREADY_ORIGINAL'});continue;}
      if(digest!==item.desired_body_sha256){results.push({issue_number:item.issue_number,state:'MANUAL_RECOVERY_REQUIRED',observed_body_sha256:digest});continue;}
      const patched=await patchIssueBody(plan.repository,item.issue_number,item.original_body,headers);
      req(sha256Text(patched.body||'')===item.pre_body_sha256,`ROLLBACK_PATCH_RESPONSE:${item.issue_number}`);
      const readback=await issueJson(plan.repository,item.issue_number,headers);
      req(sha256Text(readback.body||'')===item.pre_body_sha256,`ROLLBACK_READBACK:${item.issue_number}`);
      results.push({issue_number:item.issue_number,state:'ROLLED_BACK'});
    }catch(error){results.push({issue_number:item.issue_number,state:'ROLLBACK_FAILED',message:error instanceof Error?error.message:String(error)});}
  }
  return results;
}

export async function applyPlan({plan,token,actor,confirmApply,receiptPath}){
  validatePlan(plan);
  req(actor===ownerOf(plan.repository)&&actor===plan.actor,'APPLY_OWNER_ACTOR_REQUIRED');
  req(plan.authorization_id===expectedAuthorization(plan.expected_main_sha),'APPLY_AUTHORIZATION_INVALID');
  req(confirmApply==='APPLY_25_CANONICAL_ISSUE_BODY_APPEND_ONLY','APPLY_CONFIRMATION_INVALID');
  const receipt={id:'kidults-canonical-issue-rebound-terminal-v1',version:'1.0.0',started_at:new Date().toISOString(),repository:plan.repository,plan_digest:plan.plan_digest,expected_main_sha:plan.expected_main_sha,authorization_id:plan.authorization_id,transaction_semantics:plan.transaction_semantics,state:'VERIFIED_FAIL_UNRECONCILED',applied_issue_numbers:[],postread_issue_numbers:[],rollback:[],promotion_eligible:false,public:'HOLD',production:'HOLD',g5:'HOLD',residual_risk:plan.residual_risk};
  let headers=null;
  try{
    const state=await assertLiveMatchesPlan(plan,token);headers=state.headers;
    await preflightPreimages(plan,headers);
    for(const item of plan.issues){
      const immediatelyBefore=await issueJson(plan.repository,item.issue_number,headers);
      req(sha256Text(immediatelyBefore.body||'')===item.pre_body_sha256,`PRE_PATCH_BODY_MOVED:${item.issue_number}`);
      req((immediatelyBefore.updated_at||null)===item.pre_updated_at,`PRE_PATCH_UPDATED_AT_MOVED:${item.issue_number}`);
      const patched=await patchIssueBody(plan.repository,item.issue_number,item.desired_body,headers);
      req(sha256Text(patched.body||'')===item.desired_body_sha256,`PATCH_RESPONSE_DIGEST:${item.issue_number}`);
      receipt.applied_issue_numbers.push(item.issue_number);
      const readback=await issueJson(plan.repository,item.issue_number,headers);
      req(sha256Text(readback.body||'')===item.desired_body_sha256,`PATCH_READBACK_DIGEST:${item.issue_number}`);
    }
    const postState=await assertLiveMatchesPlan(plan,token);
    for(const item of plan.issues){
      const issue=await issueJson(plan.repository,item.issue_number,postState.headers);
      req(sha256Text(issue.body||'')===item.desired_body_sha256,`POSTREAD_DIGEST:${item.issue_number}`);
      const blockFailures=validateCanonicalBlock(issue.body||'',plan.expected_main_sha,{count:plan.material_defect_count,digest:plan.material_defect_registry_binding_sha256,members:plan.material_defect_registry_members});
      req(blockFailures.length===0,`POSTREAD_CANONICAL_BINDING:${item.issue_number}:${blockFailures.join('|')}`);
      receipt.postread_issue_numbers.push(item.issue_number);
    }
    req(receipt.postread_issue_numbers.length===canonicalIssues.length,'POSTREAD_BOARD_INCOMPLETE');
    receipt.state='VERIFIED_PASS_25_OF_25_APPEND_AND_READBACK';receipt.completed_at=new Date().toISOString();
    receipt.issue_write_performed=true;receipt.rollback_required=false;
    fs.writeFileSync(receiptPath,`${JSON.stringify(receipt,null,2)}\n`);return receipt;
  }catch(error){
    receipt.failure=error instanceof Error?error.message:String(error);
    if(headers){receipt.rollback=await rollbackChanged(plan,headers);}
    const manual=receipt.rollback.some(x=>['MANUAL_RECOVERY_REQUIRED','ROLLBACK_FAILED'].includes(x.state));
    receipt.state=manual?'VERIFIED_FAIL_MANUAL_RECOVERY_REQUIRED':'VERIFIED_FAIL_ROLLBACK_RECONCILED';
    receipt.completed_at=new Date().toISOString();receipt.rollback_required=true;receipt.manual_recovery_required=manual;
    fs.writeFileSync(receiptPath,`${JSON.stringify(receipt,null,2)}\n`);throw error;
  }
}

function selfTest(){
  const main='a'.repeat(40),authorizationId=expectedAuthorization(main),correctionHead='b'.repeat(40);
  const material={count:2,digest:`sha256:${'c'.repeat(64)}`,members:[10,11],digest_scope:'STABLE_MATERIAL_FIELDS_EXCLUDING_UPDATED_AT'};
  const block=buildCanonicalBlock({mainSha:main,authorizationId,correctionHead,activeBaselineDefects:[1330,1412],material});
  req(validateCanonicalBlock(block,main,material).length===0,'SELF_BLOCK_INVALID');
  const original='legacy history\n';const desired=appendCanonicalBlock(original,block);req(desired.startsWith('legacy history'),'SELF_HISTORY_LOST');
  const item={issue_number:canonicalIssues[0],pre_updated_at:'2026-01-01T00:00:00Z',pre_body_sha256:sha256Text(original),desired_body_sha256:sha256Text(desired),original_body:original,desired_body:desired};
  const issues=canonicalIssues.map((n,i)=>i===0?item:{...item,issue_number:n});
  const plan={id:'kidults-canonical-issue-rebound-plan-v1',version:'1.0.0',transaction_semantics:'REVERSIBLE_FAIL_CLOSED_NOT_GITHUB_ATOMIC',expected_main_sha:main,observed_main_sha:main,authorization_id:authorizationId,actor:'johnkim9524-collab',correction_pr:1431,correction_head:correctionHead,active_baseline_trust_root_defects:[1330,1412],material_defect_count:2,material_defect_registry_binding_sha256:material.digest,material_defect_registry_members:[10,11],canonical_block:block,issues};
  plan.plan_digest=digestObject(planCore(plan));validatePlan(plan);
  const bad=structuredClone(plan);bad.issues[0].desired_body='rewritten';bad.plan_digest=digestObject(planCore(bad));let rejected=false;try{validatePlan(bad);}catch{rejected=true;}req(rejected,'SELF_NON_APPEND_PLAN_ACCEPTED');
  process.stdout.write(`${JSON.stringify({test:'CANONICAL_ISSUE_REBOUND_V1',state:'VERIFIED_PASS',append_only:true,preimage_digest:true,plan_digest:true,rollback_packet_required_before_apply:true,github_atomicity_claimed:false})}\n`);
}

if(process.argv.includes('--self-test')){selfTest();process.exit(0);}
const repository=process.env.GITHUB_REPOSITORY;const token=process.env.GITHUB_TOKEN||process.env.GH_TOKEN;const actor=process.env.GITHUB_ACTOR||'';
try{
  const planPath=arg('--plan');const applyPath=arg('--apply');
  if(planPath){
    const expectedMainSha=process.env.EXPECTED_MAIN_SHA||'';const authorizationId=process.env.AUTHORIZATION_ID||'';
    const plan=await createPlan({repository,token,expectedMainSha,authorizationId,actor});fs.writeFileSync(planPath,`${JSON.stringify(plan,null,2)}\n`);
    process.stdout.write(`${JSON.stringify({state:'PLAN_VERIFIED',plan_digest:plan.plan_digest,expected_main_sha:plan.expected_main_sha,issue_count:plan.issues.length,material_defect_count:plan.material_defect_count,material_defect_registry_binding_sha256:plan.material_defect_registry_binding_sha256,promotion_eligible:false,production:'HOLD',public:'HOLD',g5:'HOLD'})}\n`);
  }else if(applyPath){
    const receiptPath=arg('--receipt');req(receiptPath,'RECEIPT_PATH_REQUIRED');const plan=JSON.parse(fs.readFileSync(applyPath,'utf8'));
    const receipt=await applyPlan({plan,token,actor,confirmApply:process.env.CONFIRM_APPLY||'',receiptPath});process.stdout.write(`${JSON.stringify(receipt,null,2)}\n`);
  }else throw new Error('USAGE: --self-test | --plan <path> | --apply <plan> --receipt <path>');
}catch(error){console.error(error instanceof Error?error.stack:String(error));process.exit(1);}
