#!/usr/bin/env node
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKirRuntime, validateKirRuntime, evaluateKirRuntime } from '../../../scripts/kidults/runtime/kir-runtime-kernel-v1.mjs';

const clone = value => structuredClone(value);
const expectReject = fn => assert.throws(fn);

const identity = {
  repository:'johnkim9524-collab/kaios_enterprise_repo',
  source_sha:'a'.repeat(40),
  run_id:1,
  run_attempt:1,
  trigger_event:'pull_request'
};

test('current KIR runtime truth validates without empirical promotion', () => {
  const loaded=loadKirRuntime();
  const result=validateKirRuntime(loaded);
  assert.equal(result.state,'VERIFIED_PASS');
  assert.equal(result.empirical_current_sold,0);
  assert.equal(result.postgres_rows,0);
  assert.equal(result.track_b_started,false);
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

test('kernel rejects runtime activation authority fabricated in contract', () => {
  const loaded=loadKirRuntime();
  loaded.contract=clone(loaded.contract);
  loaded.contract.runtime_activation_authorized=true;
  expectReject(()=>validateKirRuntime(loaded));
});

test('kernel rejects empirical Current-SOLD fabricated in module registry', () => {
  const loaded=loadKirRuntime();
  loaded.registry=clone(loaded.registry);
  loaded.registry.modules.find(x=>x.id==='CURRENT_SOLD_ADMISSION').empirical_count=1;
  expectReject(()=>validateKirRuntime(loaded));
});

test('kernel rejects PostgreSQL activation fabricated before proof', () => {
  const loaded=loadKirRuntime();
  loaded.registry=clone(loaded.registry);
  const ledger=loaded.registry.modules.find(x=>x.id==='APPEND_ONLY_LEDGER');
  ledger.postgres_migration_applied=true;
  ledger.postgres_rows_written=1;
  expectReject(()=>validateKirRuntime(loaded));
});

test('kernel rejects fabricated Candidate/Evidence pair', () => {
  const loaded=loadKirRuntime();
  loaded.registry=clone(loaded.registry);
  const pair=loaded.registry.modules.find(x=>x.id==='CANDIDATE_EVIDENCE_PAIR');
  pair.candidate='fabricated';
  pair.evidence_package='fabricated';
  expectReject(()=>validateKirRuntime(loaded));
});

test('kernel rejects fabricated Track B start', () => {
  const loaded=loadKirRuntime();
  loaded.registry=clone(loaded.registry);
  loaded.registry.modules.find(x=>x.id==='TRACK_B_ASSESSMENT').assessment_started=true;
  expectReject(()=>validateKirRuntime(loaded));
});

test('kernel rejects fabricated approved Projection', () => {
  const loaded=loadKirRuntime();
  loaded.registry=clone(loaded.registry);
  loaded.registry.modules.find(x=>x.id==='PROJECTION_RELEASE').approved_projection='fabricated';
  expectReject(()=>validateKirRuntime(loaded));
});

test('kernel rejects source-stage state drift', () => {
  const loaded=loadKirRuntime();
  loaded.registry=clone(loaded.registry);
  loaded.registry.modules.find(x=>x.id==='CURRENT_SOLD_ADMISSION').state='BLOCKED_EXTERNAL_AUTHORITY';
  expectReject(()=>validateKirRuntime(loaded));
});

test('kernel rejects dependency cycles', () => {
  const loaded=loadKirRuntime();
  loaded.registry=clone(loaded.registry);
  loaded.registry.modules.find(x=>x.id==='SOURCE_RIGHTS').dependencies=['PROJECTION_RELEASE'];
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
