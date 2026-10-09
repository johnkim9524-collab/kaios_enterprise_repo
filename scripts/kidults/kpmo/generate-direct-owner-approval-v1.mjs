#!/usr/bin/env node
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';

const fail = code => { throw new Error(code); };
const arg = name => {
  const index=process.argv.indexOf('--'+name);
  return index>=0 ? process.argv[index+1] : '';
};
const pr=arg('pr');
const purpose=arg('purpose');
const lifetime=Number(arg('lifetime-minutes')||'45');
if(!/^\d+$/.test(pr)) fail('OWNER_APPROVAL_PR_INVALID');
if(!/^[A-Z0-9][A-Z0-9_.:-]{0,95}$/.test(purpose)) fail('OWNER_APPROVAL_PURPOSE_INVALID');
if(!Number.isInteger(lifetime)||lifetime<15||lifetime>55) fail('OWNER_APPROVAL_LIFETIME_INVALID');
const gh=(args)=>JSON.parse(execFileSync('gh',args,{encoding:'utf8'}));
const view=gh(['pr','view',pr,'--json','baseRefOid,headRefOid,headRepositoryOwner,headRepository']);
const repository=execFileSync('gh',['repo','view','--json','nameWithOwner','--jq','.nameWithOwner'],{encoding:'utf8'}).trim();
if(view.headRepositoryOwner?.login!==repository.split('/')[0]) fail('OWNER_APPROVAL_INTERNAL_HEAD_REQUIRED');
const tree=execFileSync('gh',['api',`repos/${repository}/git/commits/${view.headRefOid}`,'--jq','.tree.sha'],{encoding:'utf8'}).trim();
if(!/^[0-9a-f]{40}$/.test(tree)) fail('OWNER_APPROVAL_TREE_INVALID');
const authorizationId=`DIRECT-PR-${pr}-${view.headRefOid.slice(0,12)}`;
const nonce=crypto.randomBytes(16).toString('hex');
const expiresAt=new Date(Date.now()+lifetime*60_000).toISOString();
const fields={
  repository,pull_request:pr,exact_base_sha:view.baseRefOid,exact_head_sha:view.headRefOid,
  expected_head_tree_sha:tree,operation:'MERGE_PROTECTED_MAIN',transport:'DIRECT_OWNER_GITHUB_UI',
  authorization_id:authorizationId,nonce,expires_at:expiresAt,purpose,
  scope:'ONE_DIRECT_OWNER_MERGE_ONLY',approval_rebind:'FORBIDDEN',
  production:'HOLD',public:'HOLD',g5:'HOLD',
};
const order=[
  'repository','pull_request','exact_base_sha','exact_head_sha','expected_head_tree_sha',
  'operation','transport','authorization_id','nonce','expires_at','purpose','scope',
  'approval_rebind','production','public','g5',
];
const body=['KIDULTS_DIRECT_OWNER_EVENT_EMITTING_MERGE_APPROVAL_V2',
  ...order.map(key=>`${key}=${fields[key]}`)].join('\n');
const receipt={
  id:'kidults-direct-owner-approval-generator-v1',state:'GENERATED_NOT_APPROVED',
  pull_request:Number(pr),authorization_id:authorizationId,exact_head_sha:view.headRefOid,
  expected_head_tree_sha:tree,lifetime_minutes:lifetime,expires_at:expiresAt,
  raw_nonce_persisted:false,owner_action_required:true,
};
process.stdout.write(JSON.stringify({body,receipt},null,2)+'\n');
