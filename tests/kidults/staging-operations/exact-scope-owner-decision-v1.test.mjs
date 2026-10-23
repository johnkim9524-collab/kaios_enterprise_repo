import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import test from 'node:test';
import {assertAutonomousFileScope,assertExactScopeOwnerDecision,assertIndependentVerificationDecisionBasis,bindLiveOwnerDecision,deriveApprovalDecision,independentlyVerifyLiveCandidate,independentVerificationBasis,selectExactScopeOwnerDecision,sha256,validateLiveChangedPaths} from '../../../scripts/kidults/kpmo/lib/autonomous-internal-landing-v1.mjs';
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

Decision scope: KPMO approval and separate automated machine verifier quorum required for Ready and merge.

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
  assert.deepEqual(proof.quorum_roles,['KPMO','INDEPENDENT_VERIFIER']);
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
  assert.equal(selectExactScopeOwnerDecision({...input,comments:[{...comment,body:body.replace('automated machine verifier','manual Reviewer')}]}),null);
  assert.equal(selectExactScopeOwnerDecision({...input,comments:[{...comment,body:body.replace('KPMO approval and separate automated machine verifier','Track approval')}]}),null);
  assert.equal(selectExactScopeOwnerDecision({...input,comments:[{...comment,body:body.replace('Production: HOLD','Production: ENABLED')}]}),null);
});

test('proof cannot be rebound or mutated to grant landing, merge, or deployment authority',()=>{
  const proof=selectExactScopeOwnerDecision(input);
  assert.throws(()=>assertExactScopeOwnerDecision({...proof,merge_authorized:true},input),/OWNER_DECISION_PROOF_INVALID/);
  assert.throws(()=>assertExactScopeOwnerDecision(proof,{...input,baseSha:sha('d')}),/OWNER_DECISION_PROOF_INVALID/);
  assert.throws(()=>assertExactScopeOwnerDecision({...proof,production:'ON'},input),/OWNER_DECISION_PROOF_INVALID/);
});

test('duplicate live paths fail before scope, Owner, or capability classification',()=>{
  const file={filename:'scripts/kidults/kpmo/internal-normalizer.mjs',patch:'@@ -1 +1 @@\n-a\n+b',
    base_content:'a\n',head_content:'b\n'};
  assert.throws(()=>assertAutonomousFileScope({files:[file,file],policy}),/AUTONOMOUS_CHANGED_FILE_SET_DUPLICATE/);
  assert.throws(()=>validateLiveChangedPaths({files:[file,file],expectedPaths:[file.filename],
    expectedScopeDigest:sha256(file.filename),policy}),/AUTONOMOUS_CHANGED_FILE_SET_DUPLICATE/);
  assert.throws(()=>validateLiveChangedPaths({files:[file],expectedPaths:[file.filename,file.filename],
    expectedScopeDigest:sha256(`${file.filename}\n${file.filename}`),policy}),/AUTONOMOUS_EXPECTED_FILE_SET_INVALID/);
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

test('APPROVAL-mode Independent Verifier receives the live-bound Owner proof',()=>{
  const source=fs.readFileSync('scripts/kidults/kpmo/run-autonomous-internal-landing-v1.mjs','utf8');
  assert.match(source,/owner_decision:liveOwnerDecision/);
  assert.match(source,/bindLiveOwnerDecision\(\{expectedProof:envelope\.owner_decision/);
  assert.match(source,/independentlyVerifyLiveCandidate\(\{candidate,policy\}\)/);
  const files=paths.map(filename=>({filename,base_content:'name: workflow\npermissions:\n  contents: read\n',
    head_content:'name: workflow\npermissions:\n  contents: read\n  id-token: write\n',patch:'+  id-token: write\n'}));
  const expectedProof=selectExactScopeOwnerDecision(input);
  const candidate={files,owner_decision:bindLiveOwnerDecision({...input,expectedProof})};
  const receipt=independentlyVerifyLiveCandidate({candidate,policy});
  assert.equal(receipt.state,'INDEPENDENT_OWNER_SCOPE_PENDING_QUORUM');
  assert.equal(independentVerificationBasis({verification:receipt,candidate}),'OWNER_APPROVED_EXACT_SCOPE_AND_LIVE_REQUIRED_CHECKS');
  assert.ok(receipt.receipts.every(value=>value.authority_created===false&&value.merge_authorized===false));
  assert.throws(()=>independentVerificationBasis({verification:receipt,candidate:{files}}),/AUTONOMOUS_INDEPENDENT_VERIFICATION_NOT_PASSED/);
  assert.equal(independentVerificationBasis({verification:{state:'INDEPENDENT_CAPABILITY_VERIFIED'},candidate:{files}}),'FULL_INDEPENDENT_CAPABILITY_CLASSIFICATION');
  assert.equal(assertIndependentVerificationDecisionBasis({envelope:candidate,verifier:{decision:{verification_basis:'OWNER_APPROVED_EXACT_SCOPE_AND_LIVE_REQUIRED_CHECKS'}}}),true);
  assert.throws(()=>assertIndependentVerificationDecisionBasis({envelope:candidate,verifier:{decision:{verification_basis:'FULL_INDEPENDENT_CAPABILITY_CLASSIFICATION'}}}),/AUTONOMOUS_OWNER_SCOPE_VERIFICATION_BASIS_REQUIRED/);
  const approvalEnvelope={...candidate,repository:'johnkim9524-collab/kaios_enterprise_repo',pull_request:2669,
    base_sha:sha('a'),head_sha:sha('b'),head_tree_sha:sha('c'),scope_digest:scopeDigest};
  const checks=[{id:1,name:'unit',head_sha:sha('b'),app:{id:7},status:'completed',conclusion:'success'}];
  assert.equal(deriveApprovalDecision({envelope:approvalEnvelope,role:'INDEPENDENT_VERIFIER',checks,
    requiredContexts:[{context:'unit',integration_id:7}],verificationBasis:'OWNER_APPROVED_EXACT_SCOPE_AND_LIVE_REQUIRED_CHECKS'}).decision.verification_basis,
    'OWNER_APPROVED_EXACT_SCOPE_AND_LIVE_REQUIRED_CHECKS');
  assert.throws(()=>deriveApprovalDecision({envelope:approvalEnvelope,role:'INDEPENDENT_VERIFIER',checks,
    requiredContexts:[{context:'unit',integration_id:7}]}),/AUTONOMOUS_OWNER_SCOPE_VERIFICATION_BASIS_REQUIRED/);
  assert.throws(()=>independentlyVerifyLiveCandidate({candidate:{files},policy}),/INDEPENDENT_SECURITY_CAPABILITY_ADDED/);
  for(const comments of [[],[{...comment,body:body.replace('Head SHA:','Old Head SHA:')}],
    [{...comment,updated_at:'2026-10-15T10:01:00Z'}]]) {
    assert.throws(()=>bindLiveOwnerDecision({...input,comments,expectedProof}),/AUTONOMOUS_OWNER_DECISION_LIVE_BINDING_DRIFT/);
  }
});
