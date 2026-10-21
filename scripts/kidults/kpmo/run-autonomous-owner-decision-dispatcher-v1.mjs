#!/usr/bin/env node
import fs from 'node:fs';
import {discover,recordDispatcherScan} from './run-autonomous-dispatcher-v1.mjs';
import {isBoundedGitSourceProfileEnabled} from './lib/bounded-git-source-profile-v1.mjs';

const OWNER='johnkim9524-collab';
const REPOSITORY='johnkim9524-collab/kaios_enterprise_repo';
const REPOSITORY_ID='1281328888';
const SHA=/^[0-9a-f]{40}$/;
const POSITIVE=/^[1-9][0-9]{0,19}$/;
const fail=()=>{throw Object.assign(new Error('OWNER_DECISION_TRIGGER_INVALID'),{code:'OWNER_DECISION_TRIGGER_INVALID'});};

// A comment is only a wake-up signal. The existing Dispatcher re-reads the
// live PR, complete changed-file set and all comments before deciding anything.
export function validateOwnerDecisionTrigger({eventName,event={},repository,repositoryId,sourceSha,ref,runAttempt}){
  const issue=event.issue, comment=event.comment;
  const decisionLine=typeof comment?.body==='string'
    && /^\s*(?:Decision|결정):\s*APPROVE_EXACT_SCOPE\s*$/m.test(comment.body);
  const prUrl=`https://api.github.com/repos/${REPOSITORY}/pulls/${issue?.number}`;
  if(eventName!=='issue_comment'||event.action!=='created'||ref!=='refs/heads/main'||Number(runAttempt)!==1
    ||repository!==REPOSITORY||String(repositoryId)!==REPOSITORY_ID||!SHA.test(String(sourceSha))
    ||!Number.isSafeInteger(issue?.number)||issue.number<1||issue.pull_request?.url!==prUrl
    ||comment?.author_association!=='OWNER'||comment.user?.login!==OWNER
    ||!comment.created_at||comment.updated_at!==comment.created_at||!decisionLine) fail();
  return {state:'OWNER_DECISION_TRIGGER_VERIFIED_NOT_AUTHORIZATION',event:'issue_comment',repository,
    repository_id:REPOSITORY_ID,pull_request:issue.number,comment_id:comment.id,
    source_sha:sourceSha,authority_created:false,landing_authorization_created:false,
    merge_authorized:false,production:'HOLD',public:'HOLD',g5:'HOLD'};
}

export async function scanOwnerDecisionTarget({event,repository=REPOSITORY,repositoryId=REPOSITORY_ID,
  sourceSha,ref='refs/heads/main',runAttempt=1,token,policy,approvalPolicy,operationQuarantine,
  fetchImpl=fetch,maxRequests=256,sourceReader,sourceTransport}){
  const trigger=validateOwnerDecisionTrigger({eventName:'issue_comment',event,repository,repositoryId,sourceSha,ref,runAttempt});
  if(!token||!policy||!approvalPolicy||!operationQuarantine) fail();
  const isSourceTransport=sourceTransport??isBoundedGitSourceProfileEnabled(policy,path=>fs.readFileSync(path));
  return recordDispatcherScan({repository,sourceSha,runId:process.env.GITHUB_RUN_ID,
    scan:()=>discover({repository,token,prNumber:trigger.pull_request,policy,approvalPolicy,
      generationSeed:process.env.GITHUB_RUN_ID,fetchImpl,maxRequests,sourceReader,
      sourceTransport:isSourceTransport,operationQuarantine})});
}

if(import.meta.url===`file://${process.argv[1]}`){
  const event=JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH,'utf8'));
  const trigger=validateOwnerDecisionTrigger({eventName:process.env.GITHUB_EVENT_NAME,event,
    repository:process.env.GITHUB_REPOSITORY,repositoryId:process.env.GITHUB_REPOSITORY_ID,
    sourceSha:process.env.GITHUB_SHA,ref:process.env.GITHUB_REF,runAttempt:process.env.GITHUB_RUN_ATTEMPT});
  fs.mkdirSync('out/autonomous-dispatcher-v1',{recursive:true});
  fs.writeFileSync('out/autonomous-dispatcher-v1/trigger-identity.json',`${JSON.stringify(trigger,null,2)}\n`);
  if(process.argv.includes('--validate-trigger-only')) process.exit(0);
  const policy=JSON.parse(fs.readFileSync('coordination/kidults/governance/autonomous-internal-landing-policy-v1.json','utf8'));
  const approvalPolicy=JSON.parse(fs.readFileSync('coordination/kidults/governance/autonomous-approval-policy-envelope-v1.json','utf8'));
  const operationQuarantine=JSON.parse(fs.readFileSync('coordination/kidults/kpmo/autonomous-operation-quarantine-v1.json','utf8'));
  const results=await scanOwnerDecisionTarget({event,repository:process.env.GITHUB_REPOSITORY,
    repositoryId:process.env.GITHUB_REPOSITORY_ID,sourceSha:process.env.GITHUB_SHA,
    ref:process.env.GITHUB_REF,runAttempt:process.env.GITHUB_RUN_ATTEMPT,
    token:process.env.GITHUB_TOKEN,policy,approvalPolicy,operationQuarantine});
  console.log(JSON.stringify({state:'OWNER_DECISION_TARGETED_SCAN_COMPLETE',pull_request:trigger.pull_request,
    eligible:results.filter(x=>x.state==='ELIGIBLE').length,
    owner_review_required:results.filter(x=>x.state==='OWNER_REVIEW_REQUIRED').length,
    policy_repair_required:results.filter(x=>x.state==='POLICY_REPAIR_REQUIRED').length,
    skipped:results.filter(x=>x.state==='SKIPPED').length,authority_created:false}));
}
