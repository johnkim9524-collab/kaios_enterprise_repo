import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';
import {assertAutonomousFileScope,assertExactScopeOwnerDecision,selectExactScopeOwnerDecision} from '../../../scripts/kidults/kpmo/lib/autonomous-internal-landing-v1.mjs';
import {evaluateSemanticCapabilityDelta} from '../../../scripts/kidults/kpmo/lib/semantic-capability-delta-v1.mjs';
import {independentlyVerifyCapabilityDelta} from '../../../scripts/kidults/kpmo/lib/independent-capability-verifier-v1.mjs';
import policy from '../../../coordination/kidults/governance/autonomous-internal-landing-policy-v1.json' with {type:'json'};

const sha=char=>char.repeat(40);
const paths=['.github/workflows/kidults-autonomous-track-authorization-v1.yml','scripts/kidults/kpmo/run-autonomous-dispatcher-v1.mjs'];
const scopeDigest='sha256:'+createHash('sha256').update([...paths].sort().join('\n')).digest('hex');
const body=`AI-020 Program Owner 결정 — PR #2669

Owner: John
GitHub 로그인: johnkim9524-collab
저장소 ID: 1281328888
PR: 2669

Base SHA: ${sha('a')}
Head SHA: ${sha('b')}
Head tree SHA: ${sha('c')}
변경 경로 수: ${paths.length}
변경 경로 SHA-256: ${scopeDigest}

결정: APPROVE_EXACT_SCOPE

결정 범위: 이 exact PR head의 PR 범위에 한함. 해당 head의 필수 검증과 Track Agent, KPMO, Independent Verifier의 exact-head quorum이 모두 성공하면 Ready 전환 및 병합을 허용합니다.

Production: HOLD
Public: HOLD
G5: HOLD
Provider 활성화: HOLD
배포: HOLD`;
const comment={id:9001,body,created_at:'2026-10-15T10:00:00Z',updated_at:'2026-10-15T10:00:00Z',author_association:'OWNER',
  performed_via_github_app:{id:1144995,slug:'chatgpt-codex-connector'},
  user:{login:'johnkim9524-collab',id:297161720}};
const input={comments:[comment],repository:'johnkim9524-collab/kaios_enterprise_repo',repositoryId:'1281328888',
  repositoryOwner:'johnkim9524-collab',repositoryOwnerId:'297161720',pullRequest:2669,baseSha:sha('a'),headSha:sha('b'),treeSha:sha('c'),changedPaths:paths};

test('exact current Owner decision creates quorum-only proof bound to complete scope',()=>{
  const proof=selectExactScopeOwnerDecision(input);
  assert.equal(proof.state,'OWNER_APPROVED_QUORUM_ONLY');
  assert.deepEqual(proof.changed_paths,[...paths].sort());
  assert.deepEqual(proof.quorum_roles,['ACCOUNTABLE_TRACK_AGENT','KPMO','INDEPENDENT_VERIFIER']);
  assert.equal(proof.authority_created,false);assert.equal(proof.landing_authorization_created,false);
  assert.equal(proof.merge_authorized,false);assert.equal(proof.deployment,'HOLD');
  assert.equal(assertExactScopeOwnerDecision(proof,input),proof);
  assert.ok(selectExactScopeOwnerDecision({...input,comments:[{...comment,performed_via_github_app:null}]}));
});

test('stale head, scope, actor, edited comment, missing quorum terms, or missing holds do not authorize quorum routing',()=>{
  assert.equal(selectExactScopeOwnerDecision({...input,headSha:sha('d')}),null);
  assert.equal(selectExactScopeOwnerDecision({...input,changedPaths:[...paths,'new.yml']}),null);
  assert.equal(selectExactScopeOwnerDecision({...input,comments:[{...comment,user:{...comment.user,login:'not-owner'}}]}),null);
  assert.equal(selectExactScopeOwnerDecision({...input,comments:[{...comment,author_association:'CONTRIBUTOR'}]}),null);
  assert.equal(selectExactScopeOwnerDecision({...input,comments:[{...comment,updated_at:'2026-10-15T10:01:00Z'}]}),null);
  assert.equal(selectExactScopeOwnerDecision({...input,comments:[{...comment,body:body.replace('Independent Verifier','Reviewer')}]}),null);
  assert.equal(selectExactScopeOwnerDecision({...input,comments:[{...comment,body:body.replace('Production: HOLD','Production: ENABLED')}]}),null);
});

test('proof cannot be rebound or mutated to grant landing, merge, or deployment authority',()=>{
  const proof=selectExactScopeOwnerDecision(input);
  assert.throws(()=>assertExactScopeOwnerDecision({...proof,merge_authorized:true},input),/OWNER_DECISION_PROOF_INVALID/);
  assert.throws(()=>assertExactScopeOwnerDecision(proof,{...input,baseSha:sha('d')}),/OWNER_DECISION_PROOF_INVALID/);
  assert.throws(()=>assertExactScopeOwnerDecision({...proof,production:'ON'},input),/OWNER_DECISION_PROOF_INVALID/);
});

test('exact Owner scope enters both independent role classifiers while retaining quorum-only HOLDs',()=>{
  const proof=selectExactScopeOwnerDecision(input);
  const files=paths.map(filename=>({filename,base_content:'name: workflow\npermissions:\n  contents: read\n',
    head_content:'name: workflow\npermissions:\n  contents: read\n  id-token: write\n',patch:'+  id-token: write\n'}));
  const primary=evaluateSemanticCapabilityDelta({files,policy,ownerDecision:proof});
  const independent=independentlyVerifyCapabilityDelta({files,policy,ownerDecision:proof});
  assert.equal(primary.state,'SEMANTIC_CAPABILITY_DELTA_OWNER_SCOPE_PENDING_QUORUM');
  assert.equal(independent.state,'INDEPENDENT_OWNER_SCOPE_PENDING_QUORUM');
  assert.throws(()=>assertAutonomousFileScope({files,policy}),/OWNER_RESERVED_ACTION/);
  assert.deepEqual(assertAutonomousFileScope({files,policy,ownerDecision:proof}),[...paths].sort());
  assert.ok(primary.evidence.every(value=>value.authority_created===false&&value.merge_authorized===false));
  assert.ok(independent.receipts.every(value=>value.authority_created===false&&value.merge_authorized===false));
  assert.throws(()=>evaluateSemanticCapabilityDelta({files,policy,ownerDecision:{...proof,changed_paths:[paths[0]]}}),/OWNER_DECISION_BINDING_INVALID/);
  assert.throws(()=>independentlyVerifyCapabilityDelta({files,policy,ownerDecision:{...proof,deployment:'ON'}}),/OWNER_DECISION_BINDING_INVALID/);
});
