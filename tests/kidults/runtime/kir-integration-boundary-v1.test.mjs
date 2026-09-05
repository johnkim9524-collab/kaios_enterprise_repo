#!/usr/bin/env node
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { PATHS, loadKirRuntime, validateKirRuntime, evaluateKirRuntime } from '../../../scripts/kidults/runtime/kir-runtime-kernel-v1.mjs';

const identity = {repository:'johnkim9524-collab/kaios_enterprise_repo',source_sha:'a'.repeat(40),run_id:1,run_attempt:1,trigger_event:'pull_request'};
const run = (loaded = loadKirRuntime(), id = identity) => evaluateKirRuntime({...loaded, identity:id});

test('exact source snapshots bind all eight stages without creating runtime or health authority', () => {
  const receipt=run();
  assert.equal(receipt.state,'CONTROL_VALIDATED_EMPIRICAL_BLOCKED');
  assert.equal(Object.keys(receipt.module_states).length,8);
  assert.equal(receipt.blockers.length,7);
  assert.equal(receipt.receipt_scope,'KIR_CONTROL_CONTRACT_ONLY_NOT_PLATFORM_HEALTH');
  assert.equal(receipt.readiness_is_live_empirical_proof,false);
  assert.equal(receipt.readiness_reference_sha,loadKirRuntime().readiness.reviewed_protected_main_sha);
  for (const key of ['promotion_eligible','runtime_activation_authorized','empirical_authority','database_authority','provider_authority']) assert.equal(receipt[key],false);
  for (const key of ['public_release','production','g5']) assert.equal(receipt[key],'HOLD');
  for (const [name,file] of Object.entries(PATHS)) {
    const expected=`sha256:${createHash('sha256').update(fs.readFileSync(file)).digest('hex')}`;
    assert.equal(receipt[`${name}_sha256`],expected);
  }
});

const structuralCases = [
  ['readiness runtime owner omitted',x=>{delete x.readiness.stages[0].runtime_owner;},/KIR_RACI_STAGE_RUNTIME_OWNER_MISSING/],
  ['registry runtime owner omitted',x=>{delete x.registry.modules[0].runtime_owner;},/KIR_RACI_RUNTIME_OWNER/],
  ['runtime owner mismatch',x=>{x.readiness.stages[0].runtime_owner='WRONG';},/KIR_RACI_STAGE_RUNTIME_OWNER_DRIFT/],
  ['duplicate appended readiness stage',x=>{x.readiness.stages.push(structuredClone(x.readiness.stages[0]));},/KIR_RACI_STAGE_CARDINALITY/],
  ['duplicate substituted readiness stage',x=>{x.readiness.stages[1]=structuredClone(x.readiness.stages[0]);},/KIR_RACI_DUPLICATE_READINESS_STAGE/],
  ['unknown substituted readiness stage',x=>{x.readiness.stages[0].stage='UNKNOWN';},/KIR_RACI_EXTRA_READINESS_STAGE/],
  ['missing readiness stage',x=>{x.readiness.stages.pop();},/KIR_RACI_STAGE_CARDINALITY/],
  ['missing module source stage',x=>{delete x.registry.modules[0].source_stage;},/KIR_RACI_SOURCE_STAGE/],
  ['duplicate module source stage',x=>{x.registry.modules[1].source_stage=x.registry.modules[0].source_stage;},/KIR_RACI_DUPLICATE_MODULE_SOURCE_STAGE/],
  ['wrong stage owner',x=>{x.readiness.stages[0].owner='WRONG';},/KIR_RACI_STAGE_OWNER_DRIFT/],
];
for (const [name, mutate, code] of structuralCases) test(`public kernel rejects ${name} without relying on workflow prechecks`,()=>{
  const loaded=loadKirRuntime(); mutate(loaded); assert.throws(()=>validateKirRuntime(loaded),code);
});

for (const [field,value] of [['id','spoofed'],['version','99'],['state','VERIFIED_PASS'],['promotion_eligible',true],['producer_health_authority',true],['contract_sha256','sha256:'+'f'.repeat(64)]]) {
  test(`execution identity cannot inject ${field} into terminal receipt`,()=>{
    assert.throws(()=>run(loadKirRuntime(),{...identity,[field]:value}),/KIR_IDENTITY_FIELDS/);
  });
}

test('identity rejects missing, inherited, accessor and symbol fields',()=>{
  const missing={...identity};delete missing.run_attempt;
  assert.throws(()=>run(loadKirRuntime(),missing),/KIR_IDENTITY_FIELDS/);
  assert.throws(()=>run(loadKirRuntime(),Object.create(identity)),/KIR_IDENTITY_PLAIN_RECORD/);
  const accessor={...identity};Object.defineProperty(accessor,'source_sha',{get:()=>identity.source_sha,enumerable:true});
  assert.throws(()=>run(loadKirRuntime(),accessor),/KIR_IDENTITY_DATA_FIELDS/);
  assert.throws(()=>run(loadKirRuntime(),{...identity,[Symbol('state')]:'GREEN'}),/KIR_IDENTITY_FIELDS/);
});

for (const field of ['run_id','run_attempt']) test(`identity rejects unsafe numeric ${field}`,()=>{
  assert.throws(()=>run(loadKirRuntime(),{...identity,[field]:Number.MAX_SAFE_INTEGER+1}),/KIR_IDENTITY_RUN_/);
});

test('identity rejects string-coercible source SHA objects',()=>{
  assert.throws(()=>run(loadKirRuntime(),{...identity,source_sha:{toString:()=>identity.source_sha}}),/KIR_IDENTITY_SOURCE_SHA/);
});

for (const field of ['contract','registry','readiness']) test(`evaluated ${field} must match the byte snapshot whose digest is emitted`,()=>{
  const loaded=loadKirRuntime();loaded[field].injected='different payload';
  assert.throws(()=>run(loaded),new RegExp(`KIR_EVALUATED_INPUT_FILE_MISMATCH:${field}`));
});

test('equivalent JSON key order does not change the bound file digests',()=>{
  const loaded=loadKirRuntime();loaded.readiness=Object.fromEntries(Object.entries(loaded.readiness).reverse());
  assert.deepEqual(run(loaded),run());
});

test('library imports perform no CLI reads or output even outside a repository',()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'kir-import-'));
  try{
    for(const file of ['scripts/kidults/runtime/validate-kir-readiness-structure-v1.mjs','scripts/kidults/runtime/kir-runtime-kernel-v1.mjs']){
      const url=pathToFileURL(path.resolve(file)).href;
      const result=spawnSync(process.execPath,['--input-type=module','-e',`await import(${JSON.stringify(url)})`],{cwd:directory,encoding:'utf8'});
      assert.equal(result.status,0,result.stderr);assert.equal(result.stdout,'');
    }
  }finally{fs.rmSync(directory,{recursive:true,force:true});}
});

test('natural main push and PR verification use the same exact-source evaluator with durable failure',()=>{
  const workflow=fs.readFileSync('.github/workflows/kidults-kir-runtime-contract-v1.yml','utf8');
  assert.match(workflow,/on:\n  push:\n    branches: \[main\]/);
  assert.match(workflow,/pull_request:\n    branches: \[main\]/);
  assert.ok(workflow.includes('github.event.pull_request.head.sha || github.sha'));
  assert.ok(workflow.includes('tests/kidults/runtime/kir-integration-boundary-v1.test.mjs'));
  assert.ok(workflow.includes('persist-credentials: false'));
  assert.ok(workflow.includes('if: ${{ always() }}'));
  assert.ok(workflow.includes('if-no-files-found: error'));
  assert.ok(!workflow.includes('secrets.'));
  assert.ok(!workflow.includes('workflow_dispatch:'));
});
