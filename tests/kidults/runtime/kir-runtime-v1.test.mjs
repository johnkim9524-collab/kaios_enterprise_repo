#!/usr/bin/env node
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKirRuntime, validateKirRuntime, evaluateKirRuntime } from '../../../scripts/kidults/runtime/kir-runtime-kernel-v1.mjs';

const clone = value => structuredClone(value);
const expectReject = fn => assert.throws(fn);
const digest = ch => `sha256:${ch.repeat(64)}`;

const identity = {
  repository:'johnkim9524-collab/kaios_enterprise_repo',
  source_sha:'a'.repeat(40),
  run_id:1,
  run_attempt:1,
  trigger_event:'pull_request'
};

function stage(readiness, name) {
  return readiness.stages.find(x => x.stage === name);
}

function module(registry, id) {
  return registry.modules.find(x => x.id === id);
}

function evidence(fields, start = 0) {
  return Object.fromEntries(fields.map((field, i) => [field, digest(String.fromCharCode(97 + ((start + i) % 26)))]));
}

function makeSyntheticReady() {
  const loaded = loadKirRuntime();
  loaded.contract = clone(loaded.contract);
  loaded.registry = clone(loaded.registry);
  loaded.readiness = clone(loaded.readiness);

  const reqs = loaded.contract.transition_evidence_requirements;
  const source = module(loaded.registry, 'SOURCE_RIGHTS');
  const authority = module(loaded.registry, 'RECEIPT_AUTHORITY');
  const admission = module(loaded.registry, 'CURRENT_SOLD_ADMISSION');
  const currentEvidence = module(loaded.registry, 'CURRENT_SOLD_EVIDENCE');
  const ledger = module(loaded.registry, 'APPEND_ONLY_LEDGER');
  const pair = module(loaded.registry, 'CANDIDATE_EVIDENCE_PAIR');
  const trackB = module(loaded.registry, 'TRACK_B_ASSESSMENT');
  const projection = module(loaded.registry, 'PROJECTION_RELEASE');

  source.state = 'READY';
  source.transition_evidence = evidence(reqs.SOURCE_RIGHTS_READY, 0);
  stage(loaded.readiness, 'TRACK_Z_SOURCE_RIGHTS_AND_ACQUISITION').state = 'READY';

  authority.state = 'READY';
  authority.transition_evidence = evidence(reqs.RECEIPT_AUTHORITY_READY, 3);
  stage(loaded.readiness, 'KPMO_GOVERNED_RECEIPT_REGISTRY_AUTHORITY').state = 'READY';

  admission.state = 'EMPIRICAL_VALIDATED';
  admission.empirical_count = 1;
  admission.transition_evidence = evidence(reqs.CURRENT_SOLD_ADMISSION_EMPIRICAL_VALIDATED, 6);
  stage(loaded.readiness, 'TRACK_A_ATOMIC_CURRENT_SOLD_ADMISSION').state = 'EMPIRICAL_VALIDATED';
  stage(loaded.readiness, 'TRACK_A_ATOMIC_CURRENT_SOLD_ADMISSION').empirical_increment = 1;

  currentEvidence.state = 'EMPIRICAL_VALIDATED';
  currentEvidence.empirical_count = 1;
  currentEvidence.transition_evidence = evidence(reqs.CURRENT_SOLD_EVIDENCE_EMPIRICAL_VALIDATED, 9);
  stage(loaded.readiness, 'TRACK_A_CURRENT_SOLD_EVENT_AND_EVIDENCE').state = 'EMPIRICAL_VALIDATED';
  stage(loaded.readiness, 'TRACK_A_CURRENT_SOLD_EVENT_AND_EVIDENCE').empirical_increment = 1;

  ledger.state = 'EMPIRICAL_VALIDATED';
  ledger.postgres_migration_applied = true;
  ledger.postgres_rows_written = 1;
  ledger.transition_evidence = evidence(reqs.APPEND_ONLY_LEDGER_EMPIRICAL_VALIDATED, 11);
  stage(loaded.readiness, 'TRACK_D_APPEND_ONLY_LEDGER').state = 'EMPIRICAL_VALIDATED';
  stage(loaded.readiness, 'TRACK_D_APPEND_ONLY_LEDGER').postgres_migration_applied = true;
  stage(loaded.readiness, 'TRACK_D_APPEND_ONLY_LEDGER').postgres_rows_written = 1;

  pair.state = 'PAIR_READY';
  pair.candidate = digest('p');
  pair.evidence_package = digest('q');
  pair.transition_evidence = evidence(reqs.CANDIDATE_EVIDENCE_PAIR_READY, 15);
  stage(loaded.readiness, 'TRACK_A_CANDIDATE_EVIDENCE_PAIR').state = 'PAIR_READY';
  stage(loaded.readiness, 'TRACK_A_CANDIDATE_EVIDENCE_PAIR').candidate = pair.candidate;
  stage(loaded.readiness, 'TRACK_A_CANDIDATE_EVIDENCE_PAIR').evidence_package = pair.evidence_package;

  trackB.state = 'COMPLETE_INDEPENDENT_ASSESSMENT';
  trackB.assessment_started = true;
  trackB.transition_evidence = evidence(reqs.TRACK_B_ASSESSMENT_COMPLETE, 18);
  stage(loaded.readiness, 'TRACK_B_INDEPENDENT_ASSESSMENT').state = 'COMPLETE_INDEPENDENT_ASSESSMENT';

  projection.state = 'APPROVED_PROJECTION_READY';
  projection.approved_projection = digest('r');
  projection.transition_evidence = evidence(reqs.PROJECTION_RELEASE_READY, 21);
  stage(loaded.readiness, 'PROJECTION_AND_PORTAL').state = 'APPROVED_PROJECTION_READY';

  loaded.readiness.truth_boundary.lawful_empirical_current_sold_admitted = 1;
  loaded.registry.truth_ceiling.lawful_empirical_current_sold_admitted = 1;
  loaded.registry.truth_ceiling.postgres_rows_written = 1;
  loaded.registry.truth_ceiling.candidate = pair.candidate;
  loaded.registry.truth_ceiling.evidence_package = pair.evidence_package;
  loaded.registry.truth_ceiling.track_b_started = true;
  loaded.registry.truth_ceiling.approved_projection = projection.approved_projection;

  return loaded;
}

test('current KIR runtime truth validates without empirical promotion', () => {
  const loaded=loadKirRuntime();
  const result=validateKirRuntime(loaded);
  assert.equal(result.state,'VERIFIED_PASS');
  assert.equal(result.empirical_current_sold,0);
  assert.equal(result.postgres_rows,0);
  assert.equal(result.track_b_complete,false);
  assert.equal(result.projection_ready,false);
  assert.equal(result.production,'HOLD');
  const receipt=evaluateKirRuntime({...loaded,identity});
  assert.equal(receipt.state,'CONTROL_VALIDATED_EMPIRICAL_BLOCKED');
  assert.equal(receipt.promotion_eligible,false);
  assert.equal(receipt.runtime_activation_authorized,false);
  assert.equal(receipt.empirical_authority,false);
  assert.equal(receipt.database_authority,false);
  assert.equal(receipt.provider_authority,false);
  assert.equal(receipt.production,'HOLD');
  assert.ok(receipt.blockers.includes('LAWFUL_EMPIRICAL_CURRENT_SOLD_ZERO'));
  assert.ok(receipt.blockers.includes('POSTGRES_FIRST_WRITE_NOT_PROVEN'));
  assert.ok(receipt.blockers.includes('CANDIDATE_EVIDENCE_PAIR_ABSENT'));
  assert.ok(receipt.blockers.includes('TRACK_B_NOT_COMPLETE'));
  assert.ok(receipt.blockers.includes('APPROVED_PROJECTION_ABSENT'));
});

test('fully evidenced synthetic future chain can reach activation review without granting authority', () => {
  const loaded=makeSyntheticReady();
  const result=validateKirRuntime(loaded);
  assert.equal(result.state,'VERIFIED_PASS');
  assert.equal(result.empirical_current_sold,1);
  assert.equal(result.postgres_rows,1);
  assert.equal(result.pair_ready,true);
  assert.equal(result.track_b_complete,true);
  assert.equal(result.projection_ready,true);
  const receipt=evaluateKirRuntime({...loaded,identity});
  assert.equal(receipt.state,'READY_FOR_SEPARATELY_GATED_ACTIVATION_REVIEW');
  assert.deepEqual(receipt.blockers,[]);
  assert.equal(receipt.runtime_activation_authorized,false);
  assert.equal(receipt.promotion_eligible,false);
  assert.equal(receipt.empirical_authority,false);
  assert.equal(receipt.database_authority,false);
  assert.equal(receipt.provider_authority,false);
  assert.equal(receipt.public_release,'HOLD');
  assert.equal(receipt.production,'HOLD');
  assert.equal(receipt.g5,'HOLD');
});

test('kernel rejects runtime activation authority fabricated in contract', () => {
  const loaded=loadKirRuntime();
  loaded.contract=clone(loaded.contract);
  loaded.contract.runtime_activation_authorized=true;
  expectReject(()=>validateKirRuntime(loaded));
});

test('kernel rejects empirical Current-SOLD fabricated only in module registry', () => {
  const loaded=loadKirRuntime();
  loaded.registry=clone(loaded.registry);
  module(loaded.registry,'CURRENT_SOLD_ADMISSION').empirical_count=1;
  expectReject(()=>validateKirRuntime(loaded));
});

test('kernel rejects apparent empirical chain when transition receipts are absent', () => {
  const loaded=makeSyntheticReady();
  delete module(loaded.registry,'SOURCE_RIGHTS').transition_evidence.rights_receipt_set_sha256;
  expectReject(()=>validateKirRuntime(loaded));
});

test('kernel rejects undeclared transition evidence fields', () => {
  const loaded=makeSyntheticReady();
  module(loaded.registry,'RECEIPT_AUTHORITY').transition_evidence.uncontracted_sha256=digest('z');
  expectReject(()=>validateKirRuntime(loaded));
});

test('kernel rejects dependency removal even when graph remains acyclic', () => {
  const loaded=loadKirRuntime();
  loaded.registry=clone(loaded.registry);
  module(loaded.registry,'CURRENT_SOLD_ADMISSION').dependencies=['SOURCE_RIGHTS'];
  expectReject(()=>validateKirRuntime(loaded));
});

test('kernel rejects dependency cycles', () => {
  const loaded=loadKirRuntime();
  loaded.registry=clone(loaded.registry);
  module(loaded.registry,'SOURCE_RIGHTS').dependencies=['PROJECTION_RELEASE'];
  expectReject(()=>validateKirRuntime(loaded));
});

test('kernel rejects forward module when dependency has not advanced', () => {
  const loaded=makeSyntheticReady();
  module(loaded.registry,'RECEIPT_AUTHORITY').state='CONTROL_IMPLEMENTATION_ADDED_PENDING_PROTECTED_MAIN_AND_EXTERNAL_TRUST_ROOT';
  stage(loaded.readiness,'KPMO_GOVERNED_RECEIPT_REGISTRY_AUTHORITY').state='CONTROL_IMPLEMENTATION_ADDED_PENDING_PROTECTED_MAIN_AND_EXTERNAL_TRUST_ROOT';
  delete module(loaded.registry,'RECEIPT_AUTHORITY').transition_evidence;
  expectReject(()=>validateKirRuntime(loaded));
});

test('kernel rejects PostgreSQL activation fabricated before Current-SOLD evidence', () => {
  const loaded=loadKirRuntime();
  loaded.registry=clone(loaded.registry);
  loaded.readiness=clone(loaded.readiness);
  const ledger=module(loaded.registry,'APPEND_ONLY_LEDGER');
  ledger.state='EMPIRICAL_VALIDATED';
  ledger.postgres_migration_applied=true;
  ledger.postgres_rows_written=1;
  ledger.transition_evidence=evidence(loaded.contract.transition_evidence_requirements.APPEND_ONLY_LEDGER_EMPIRICAL_VALIDATED,11);
  stage(loaded.readiness,'TRACK_D_APPEND_ONLY_LEDGER').state='EMPIRICAL_VALIDATED';
  stage(loaded.readiness,'TRACK_D_APPEND_ONLY_LEDGER').postgres_migration_applied=true;
  stage(loaded.readiness,'TRACK_D_APPEND_ONLY_LEDGER').postgres_rows_written=1;
  loaded.registry.truth_ceiling.postgres_rows_written=1;
  expectReject(()=>validateKirRuntime(loaded));
});

test('kernel rejects partial or fabricated Candidate/Evidence pair', () => {
  const loaded=loadKirRuntime();
  loaded.registry=clone(loaded.registry);
  const pair=module(loaded.registry,'CANDIDATE_EVIDENCE_PAIR');
  pair.candidate=digest('p');
  expectReject(()=>validateKirRuntime(loaded));
});

test('kernel rejects fabricated Track B completion without pair', () => {
  const loaded=loadKirRuntime();
  loaded.registry=clone(loaded.registry);
  loaded.readiness=clone(loaded.readiness);
  const trackB=module(loaded.registry,'TRACK_B_ASSESSMENT');
  trackB.state='COMPLETE_INDEPENDENT_ASSESSMENT';
  trackB.assessment_started=true;
  trackB.transition_evidence=evidence(loaded.contract.transition_evidence_requirements.TRACK_B_ASSESSMENT_COMPLETE,18);
  stage(loaded.readiness,'TRACK_B_INDEPENDENT_ASSESSMENT').state='COMPLETE_INDEPENDENT_ASSESSMENT';
  loaded.registry.truth_ceiling.track_b_started=true;
  expectReject(()=>validateKirRuntime(loaded));
});

test('kernel rejects approved Projection without Track B completion', () => {
  const loaded=loadKirRuntime();
  loaded.registry=clone(loaded.registry);
  loaded.readiness=clone(loaded.readiness);
  const projection=module(loaded.registry,'PROJECTION_RELEASE');
  projection.state='APPROVED_PROJECTION_READY';
  projection.approved_projection=digest('r');
  projection.transition_evidence=evidence(loaded.contract.transition_evidence_requirements.PROJECTION_RELEASE_READY,21);
  stage(loaded.readiness,'PROJECTION_AND_PORTAL').state='APPROVED_PROJECTION_READY';
  loaded.registry.truth_ceiling.approved_projection=projection.approved_projection;
  expectReject(()=>validateKirRuntime(loaded));
});

test('kernel rejects source-stage state drift', () => {
  const loaded=loadKirRuntime();
  loaded.registry=clone(loaded.registry);
  module(loaded.registry,'CURRENT_SOLD_ADMISSION').state='BLOCKED_EXTERNAL_AUTHORITY';
  expectReject(()=>validateKirRuntime(loaded));
});

test('kernel rejects release HOLD mutation', () => {
  const loaded=loadKirRuntime();
  loaded.registry=clone(loaded.registry);
  loaded.registry.truth_ceiling.production='READY';
  expectReject(()=>validateKirRuntime(loaded));
});

test('kernel rejects malformed execution identity', () => {
  const loaded=loadKirRuntime();
  for (const bad of [
    {...identity,repository:'wrong/repo'},
    {...identity,source_sha:'bad'},
    {...identity,run_id:0},
    {...identity,run_attempt:0},
    {...identity,trigger_event:''}
  ]) expectReject(()=>evaluateKirRuntime({...loaded,identity:bad}));
});
