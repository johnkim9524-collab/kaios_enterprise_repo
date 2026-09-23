#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {canonicalJson, sha256, validateWorkload, validateEnvelope, validateQuorum, buildTerminalReceipt} from './lib/autonomous-internal-landing-v1.mjs';

const policy = JSON.parse(fs.readFileSync('coordination/kidults/governance/autonomous-internal-landing-policy-v1.json','utf8'));
const sha = char => char.repeat(40);
const workloadSpec = {
  ACCOUNTABLE_TRACK_AGENT: { id:'kidults-accountable-track-agent-v1', environment:'KIDULTS-AUTONOMOUS-TRACK', workflow:'kidults-autonomous-track-authorization-v1.yml' },
  KPMO: { id:'kidults-kpmo-v1', environment:'KIDULTS-AUTONOMOUS-KPMO', workflow:'kidults-autonomous-kpmo-authorization-v1.yml' },
  INDEPENDENT_VERIFIER: { id:'kidults-independent-verifier-v1', environment:'KIDULTS-AUTONOMOUS-VERIFIER', workflow:'kidults-autonomous-independent-verification-authorization-v1.yml' },
  FINALIZER: { id:'kidults-finalizer-v1', environment:'KIDULTS-AUTONOMOUS-FINALIZER', workflow:'kidults-autonomous-track-authorization-v1.yml' },
};
const workload = (role, id, workflowOverride = null) => {
  const spec = workloadSpec[role];
  return {
    workload_id:spec.id,
    environment:spec.environment,
    workflow_ref:`johnkim9524-collab/kaios_enterprise_repo/.github/workflows/${workflowOverride || spec.workflow}@refs/heads/main`,
    workflow_sha:sha('f'),
    repository_id:'1281328888',
    signing_key_arn:`arn:aws:kms:ap-northeast-2:111122223333:key/00000000-0000-0000-0000-00000000000${id}`,
  };
};
const registry = {workloads:[
  ['ACCOUNTABLE_TRACK_AGENT',1,null],
  ['KPMO',2,null],
  ['INDEPENDENT_VERIFIER',3,null],
  ['FINALIZER',4,'kidults-autonomous-track-authorization-v1.yml'],
  ['FINALIZER',4,'kidults-autonomous-kpmo-authorization-v1.yml'],
  ['FINALIZER',4,'kidults-autonomous-independent-verification-authorization-v1.yml'],
].map(([role,id,wf])=>({role,...workload(role,id,wf)}))};
const paths = ['src/internal-a.js','tests/internal-a.test.js'];
const testEvidence = {suite:'internal-unit',result:'PASS',artifact_digest:sha256('artifact')};
const rollbackPlan = {strategy:'REVERT_MERGE_COMMIT',verified:true};
const base = {
  repository_id:'1281328888',repository:'johnkim9524-collab/kaios_enterprise_repo',pull_request:42,
  base_sha:sha('a'),head_sha:sha('b'),head_tree_sha:sha('c'),scope_digest:sha256([...paths].sort().join('\n')),
  test_evidence:testEvidence,test_evidence_digest:sha256(canonicalJson(testEvidence)),
  rollback_plan:rollbackPlan,rollback_digest:sha256(canonicalJson(rollbackPlan)),authorization_generation:'gen-1',
  nonce_digest:sha256('nonce'),issued_at:'2026-09-21T12:00:00Z',expires_at:'2026-09-21T12:30:00Z',
  operation:'INTERNAL_REVERSIBLE_LANDING',changed_paths:paths,production:'HOLD',public:'HOLD',g5:'HOLD'
};
const track={...base,workload:workload('ACCOUNTABLE_TRACK_AGENT',1)};
const kpmo={...base,workload:workload('KPMO',2)};
const verifier={...base,workload:workload('INDEPENDENT_VERIFIER',3),verification_state:'VERIFIED_PASS'};
const now=Date.parse('2026-09-21T12:10:00Z');
assert.equal(validateEnvelope(track,{policy,now}).operation,'INTERNAL_REVERSIBLE_LANDING');
const quorum=validateQuorum({track,kpmo,verifier,registry,policy,now});
assert.equal(quorum.state,'INDEPENDENT_VERIFIED');
const finalizerIdentity=validateWorkload(workload('FINALIZER',4),registry,'FINALIZER');
assert.equal(finalizerIdentity.role,'FINALIZER');
assert.notEqual(finalizerIdentity.stable_id,quorum.workloads[0].stable_id);
assert.notEqual(finalizerIdentity.signing_key_arn,quorum.workloads[0].signing_key_arn);
const receipt=buildTerminalReceipt({quorum,reservation:{state:'CONSUMED',conditional_write:true},merge:{merge_sha:sha('d'),main_sha:sha('d'),head_sha:sha('b'),tree_sha:sha('c')},postmerge:{state:'VERIFIED_PASS'}});
assert.equal(receipt.state,'RECEIPT_SEALED');
const rejects = mutator => assert.throws(()=>validateQuorum({track:mutator({...track}),kpmo,verifier,registry,policy,now}));
rejects(value=>({...value,production:'ALLOW'}));
rejects(value=>({...value,changed_paths:['production/release.yml'],scope_digest:sha256('production/release.yml')}));
rejects(value=>({...value,head_sha:sha('e')}));
rejects(value=>({...value,workload:{...value.workload,workload_id:'unknown-workload'}}));
rejects(value=>({...value,test_evidence:{...value.test_evidence,result:'FAIL'}}));
const rehashedFailedEvidence={...track,test_evidence:{...track.test_evidence,result:'FAIL'}};
rehashedFailedEvidence.test_evidence_digest=sha256(canonicalJson(rehashedFailedEvidence.test_evidence));
assert.throws(()=>validateQuorum({track:rehashedFailedEvidence,kpmo,verifier,registry,policy,now}));
rejects(value=>({...value,rollback_plan:{...value.rollback_plan,verified:false}}));
const rehashedUnverifiedRollback={...track,rollback_plan:{...track.rollback_plan,verified:false}};
rehashedUnverifiedRollback.rollback_digest=sha256(canonicalJson(rehashedUnverifiedRollback.rollback_plan));
assert.throws(()=>validateQuorum({track:rehashedUnverifiedRollback,kpmo,verifier,registry,policy,now}));
const generationDrift={...kpmo,workload:{...kpmo.workload,workflow_sha:sha('9')}};
assert.throws(()=>validateQuorum({track,kpmo:generationDrift,verifier,registry,policy,now}));
const sharedWorkload={...kpmo,workload:{...kpmo.workload,workload_id:track.workload.workload_id}};
assert.throws(()=>validateQuorum({track,kpmo:sharedWorkload,verifier,registry:{workloads:[...registry.workloads,{role:'KPMO',...sharedWorkload.workload}]},policy,now}));
const sharedSigningKey={...kpmo,workload:{...kpmo.workload,signing_key_arn:track.workload.signing_key_arn}};
assert.throws(()=>validateQuorum({track,kpmo:sharedSigningKey,verifier,registry:{workloads:[...registry.workloads,{role:'KPMO',...sharedSigningKey.workload}]},policy,now}));
const sharedWorkflowRef={...kpmo,workload:{...kpmo.workload,workflow_ref:track.workload.workflow_ref}};
assert.throws(()=>validateQuorum({track,kpmo:sharedWorkflowRef,verifier,registry:{workloads:[...registry.workloads,{role:'KPMO',...sharedWorkflowRef.workload}]},policy,now}));
const sharedEnvironment={...kpmo,workload:{...kpmo.workload,environment:track.workload.environment}};
assert.throws(()=>validateQuorum({track,kpmo:sharedEnvironment,verifier,registry:{workloads:[...registry.workloads,{role:'KPMO',...sharedEnvironment.workload}]},policy,now}));
assert.throws(()=>validateQuorum({track,kpmo,verifier:{...verifier,verification_state:'FAILED'},registry,policy,now}));
assert.throws(()=>buildTerminalReceipt({quorum,reservation:{state:'RESERVED',conditional_write:true},merge:{},postmerge:{}}));
assert.throws(()=>validateWorkload({...workload('FINALIZER',4),signing_key_arn:track.workload.signing_key_arn},registry,'FINALIZER'));
assert.equal(policy.approval_quorum.approval_workloads_may_finalize,false);
assert.equal(policy.workload_identity.finalizer.only_stage_allowed_github_write,true);
assert.equal(policy.bounded_recovery.maximum_attempts,3);
assert.equal(policy.bounded_recovery.pre_reservation_failure_consumes_authority,false);
assert.equal(policy.durable_single_use.maximum_ttl_seconds,7200);
console.log(JSON.stringify({state:'VERIFIED_PASS',positive:7,negative:16,bounded_attempts:3,production:'HOLD',public:'HOLD',g5:'HOLD'}));
