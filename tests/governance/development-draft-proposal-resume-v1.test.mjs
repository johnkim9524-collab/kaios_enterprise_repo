import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {canonicalDraftProposalPayload,draftProposalOperationKey,validateDevelopmentDraftProposalResume,
  verifyDevelopmentDraftProposalReadback} from '../../scripts/governance/lib/development-draft-proposal-resume-v1.mjs';
const hash=value=>'sha256:'+createHash('sha256').update(value).digest('hex');
const canonical=value=>JSON.stringify(Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b))));
function fixture(){
  const payload={repository:'johnkim9524-collab/kaios_enterprise_repo',base:'main',head:'codex/bounded-draft',draft:true,title:'Bounded internal correction',body:'Review the exact-source reversible correction. No landing authority.'};
  const digest=hash(canonicalDraftProposalPayload(payload));
  const intent={id:'kidults-development-draft-proposal-intent-v1',version:'1.0.0',repository:payload.repository,
    root_mission_id:'AUTONOMOUS_NORMAL_OPERATIONS_CLOSURE_MISSION',operation:'CREATE_DRAFT_PR',base_branch:'main',base_sha:'a'.repeat(40),
    head_branch:payload.head,source_head_sha:'b'.repeat(40),source_head_tree_sha:'c'.repeat(40),payload_digest:digest,
    scope:'AUTHORIZED_REVERSIBLE_DEVELOPMENT_PROPOSAL',authority_granted:false};
  return {policy:JSON.parse(fs.readFileSync('coordination/kidults/governance/resume-contract-v1.json','utf8')),
    authorized:true,bootstrapVerified:true,bootstrapSha:'d'.repeat(40),intent,intentDigest:hash(canonical(intent)),
    intentCommitSha:'e'.repeat(40),intentSourceTreeSha:intent.source_head_tree_sha,intentSourceIsAncestor:true,
    onlyDerivedMetadataSinceIntent:true,payload,payloadDigest:digest,expectedHeadSha:'d'.repeat(40),
    liveRepository:payload.repository,liveBaseSha:intent.base_sha,liveHeadSha:'d'.repeat(40),liveHeadTreeSha:'f'.repeat(40),
    existingPullRequests:[],pullRequestIndexComplete:true,sameWriterControlContextVerified:true,githubDuplicateConstraintAvailable:true};
}
const pr=f=>({number:27,state:'open',draft:true,merged:false,repository:f.payload.repository,
  base_repository:f.payload.repository,head_repository:f.payload.repository,base_branch:f.payload.base,
  head_branch:f.payload.head,base_sha:f.liveBaseSha,head_sha:f.liveHeadSha,title:f.payload.title,body:f.payload.body});
test('exact authorized immutable proposal admits only one Draft creation, without landing authority',()=>{
  const f=fixture(),result=validateDevelopmentDraftProposalResume(f);
  assert.equal(result.state,'DRAFT_PROPOSAL_PRECONDITIONS_VERIFIED');assert.equal(result.create_allowed,true);
  for(const k of ['protected_landing_authority','ready_allowed','approval_allowed','dispatch_allowed','cross_system_exactly_once_claimed'])assert.equal(result[k],false);
  assert.equal(verifyDevelopmentDraftProposalReadback({preflight:result,pullRequest:pr(f)}).state,'DRAFT_PROPOSAL_READBACK_VERIFIED');
});
test('matching existing open Draft reuses the exact readback instead of creating',()=>{
  const f=fixture();f.existingPullRequests=[pr(f)];f.outcome='UNKNOWN';
  const result=validateDevelopmentDraftProposalResume(f);assert.equal(result.state,'REUSED_EXISTING_DRAFT');assert.equal(result.create_allowed,false);
});
test('closed, merged, fork, non-Draft, wrong payload and multiple proposals hold without mutation',()=>{
  for(const mutate of [p=>{p.state='closed';},p=>{p.merged=true;},p=>{p.head_repository='fork/repo';},p=>{p.draft=false;},p=>{p.body='changed';},p=>{p.head_sha='0'.repeat(40);}]){
    const f=fixture(),p=pr(f);mutate(p);f.existingPullRequests=[p];
    const r=validateDevelopmentDraftProposalResume(f);assert.equal(r.state,'HOLD_EXISTING_PROPOSAL');assert.equal(r.create_allowed,false);
  }
  const f=fixture();f.existingPullRequests=[pr(f),{...pr(f),number:28}];assert.equal(validateDevelopmentDraftProposalResume(f).state,'HOLD_EXISTING_PROPOSAL');
});
test('rejected, ambiguous or already issued create is never blindly repeated',()=>{
  for(const outcome of ['UNKNOWN','REJECTED','CREATED']){
    const r=validateDevelopmentDraftProposalResume({...fixture(),outcome});assert.equal(r.state,'HOLD_RECONCILE_NO_REISSUE');assert.equal(r.create_allowed,false);
  }
  assert.throws(()=>validateDevelopmentDraftProposalResume({...fixture(),attempt:2}),/OPERATION_OR_ATTEMPT/);
});
test('missing authority, source bootstrap, immutable intent or reconciliation evidence fails closed',()=>{
  for(const key of ['authorized','bootstrapVerified','intentSourceIsAncestor','onlyDerivedMetadataSinceIntent',
    'pullRequestIndexComplete','sameWriterControlContextVerified','githubDuplicateConstraintAvailable']){
    assert.throws(()=>validateDevelopmentDraftProposalResume({...fixture(),[key]:false}));
  }
  for(const key of ['intentDigest','intentCommitSha','intentSourceTreeSha','payloadDigest','bootstrapSha']){
    assert.throws(()=>validateDevelopmentDraftProposalResume({...fixture(),[key]:'invalid'}));
  }
});
test('base/head drift, fork repository, payload mutation and protected operations are rejected',()=>{
  for(const key of ['liveBaseSha','liveHeadSha','expectedHeadSha'])assert.throws(()=>validateDevelopmentDraftProposalResume({...fixture(),[key]:'0'.repeat(40)}));
  assert.throws(()=>validateDevelopmentDraftProposalResume({...fixture(),liveRepository:'fork/repo'}),/LIVE_REF_DRIFT/);
  for(const operation of ['READY','MERGE','APPROVAL','DISPATCH','DEPLOY','SECRET_READ'])assert.throws(()=>validateDevelopmentDraftProposalResume({...fixture(),operation}),/OPERATION_OR_ATTEMPT/);
  const f=fixture();f.payload.body+=' changed';assert.throws(()=>validateDevelopmentDraftProposalResume(f),/PAYLOAD_BINDING/);
});
test('non-Draft and mismatched creation readbacks never gain authority',()=>{
  const f=fixture(),preflight=validateDevelopmentDraftProposalResume(f);
  for(const mutate of [p=>{p.draft=false},p=>{p.state='closed'},p=>{p.head_sha='0'.repeat(40)},p=>{p.base_sha='0'.repeat(40)},p=>{p.title='changed'},p=>{p.repository='fork/repo'}]){
    const p=pr(f);mutate(p);assert.throws(()=>verifyDevelopmentDraftProposalReadback({preflight,pullRequest:p}),/READBACK_BINDING/);
  }
});
test('operation identity is stable across derived metadata descendants and cannot include retry/session fields',()=>{
  const f=fixture(),key=draftProposalOperationKey(f.intent);
  const g={...f,bootstrapSha:'1'.repeat(40),expectedHeadSha:'1'.repeat(40),liveHeadSha:'1'.repeat(40),liveHeadTreeSha:'2'.repeat(40)};
  assert.equal(validateDevelopmentDraftProposalResume(g).binding.operation_key,key);
  assert.throws(()=>draftProposalOperationKey({...f.intent,session_id:'replacement'}),/INTENT/);
  assert.throws(()=>canonicalDraftProposalPayload({...f.payload,draft:false}),/PAYLOAD/);
  assert.throws(()=>canonicalDraftProposalPayload({...f.payload,head:'main'}),/PAYLOAD/);
});
