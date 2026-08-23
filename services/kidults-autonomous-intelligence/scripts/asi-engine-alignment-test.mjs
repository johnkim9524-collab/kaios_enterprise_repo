import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const serviceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = resolve(serviceRoot, 'src', 'asi');
const compiledRoot = mkdtempSync(resolve(tmpdir(), 'kidults-asi-alignment-'));

for (const name of ['event','registry','alignment']) {
  const input = readFileSync(resolve(sourceRoot,`${name}.ts`),'utf8');
  const transpiled = ts.transpileModule(input,{
    fileName:`${name}.ts`,
    reportDiagnostics:true,
    compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022,importsNotUsedAsValues:ts.ImportsNotUsedAsValues.Remove},
  });
  const errors = (transpiled.diagnostics || []).filter((item) => item.category === ts.DiagnosticCategory.Error);
  if (errors.length) throw new Error(`ASI_ALIGNMENT_TYPESCRIPT_TRANSPILE_FAILED:${errors.map((item) => item.messageText).join('|')}`);
  const output = transpiled.outputText.replace(
    /(from\s+['"]|import\s*\(\s*['"])(\.\/[a-z0-9-]+)(['"]\s*\)?)/gi,
    (_match,prefix,specifier,suffix) => `${prefix}${specifier}.mjs${suffix}`,
  );
  writeFileSync(resolve(compiledRoot,`${name}.mjs`),output,'utf8');
}

const registry = await import(pathToFileURL(resolve(compiledRoot,'registry.mjs')).href);
const alignment = await import(pathToFileURL(resolve(compiledRoot,'alignment.mjs')).href);
const sha = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;

function event(overrides = {}) {
  const payload = {
    source_id:'source-alignment-test',
    discovery_seed:{source_id:'source-alignment-test',canonical_host:'alignment.example',seed_ref:'fixture:alignment'},
    ...overrides.payload,
  };
  return {
    event_id:'evt_alignment_input',
    event_type:'SOURCE_DISCOVERY_REQUESTED',
    event_version:'1.0.0',
    occurred_at:'2026-08-23T00:00:00.000Z',
    observed_at:'2026-08-23T00:00:00.000Z',
    producer_engine:'ALIGNMENT_TEST_PRODUCER',
    producer_version:'1.0.0',
    correlation_id:'corr_alignment_test',
    causation_id:null,
    idempotency_key:'alignment-test-input',
    partition:{
      channel:'COMMON_CRAWL_AND_WEB_DATA_COMMONS_STRUCTURED_WEB_INDEX',
      region:'GLOBAL',
      language:'en',
      scope_id:'SCOPE_TEST',
      source_role:'SOLD_TRANSACTION',
      canonical_host_hash:sha('alignment.example'),
      ...overrides.partition,
    },
    input_snapshot_ref:'snapshot:alignment:test',
    payload_hash:sha(JSON.stringify(payload)),
    rights_state:'ALLOW',
    freshness_state:'CURRENT',
    assertion_purpose:'BOUNDED_SHADOW_ACQUISITION',
    decision:'PASS',
    reason_codes:[],
    trace_refs:['fixture:alignment'],
    payload,
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => key !== 'payload' && key !== 'partition')),
  };
}

assert.deepEqual(registry.ASI_PLATFORM_PRINCIPLES,[
  'AUTONOMOUS','GLOBAL','IRREPLACEABLE_VALUE','TRANSPARENT',
]);
assert.equal(registry.ASI_FLEETS.length,25);
assert.equal(new Set(registry.ASI_FLEETS.map((fleet) => fleet.id)).size,25);
assert.equal(registry.ASI_LOGICAL_ENGINES.length,11);
assert.deepEqual(
  [...new Set(registry.ASI_FLEETS.map((fleet) => fleet.logicalEngine))].sort(),
  [...registry.ASI_LOGICAL_ENGINES].sort(),
);
assert.ok(registry.ASI_FLEETS.every((fleet) =>
  fleet.alignmentProfile === 'FOUR_PRINCIPLE_HARD_FLOOR_V2' && fleet.alignmentState === 'ENFORCED'));

const receipts = [];
for (const fleet of registry.ASI_FLEETS) {
  const first = await alignment.assertAsiExecutionAlignment(fleet.id,event());
  const second = await alignment.assertAsiExecutionAlignment(fleet.id,event());
  assert.equal(first.receipt_id,second.receipt_id);
  assert.equal(first.logical_engine_id,fleet.logicalEngine);
  assert.equal(first.hard_floor_pass,true);
  assert.equal(first.failure_codes.length,0);
  assert.deepEqual(first.principle_order,registry.ASI_PLATFORM_PRINCIPLES);
  for (const principle of registry.ASI_PLATFORM_PRINCIPLES) {
    assert.equal(first.principle_results[principle].state,'PASS');
  }
  assert.equal(first.provider_direct_path_allowed,false);
  assert.equal(first.collection_permission_created,false);
  assert.equal(first.public_projection_authorized,false);
  assert.equal(first.production,'HOLD');
  receipts.push(first);
}
assert.equal(new Set(receipts.map((receipt) => receipt.receipt_id)).size,25);

async function expectReject(name, fleetId, mutated, pattern) {
  await assert.rejects(
    () => alignment.assertAsiExecutionAlignment(fleetId,mutated),
    (error) => {
      assert.match(String(error?.message || error),pattern,name);
      return true;
    },
  );
}

const fleetId = registry.ASI_FLEETS[0].id;
await expectReject('Autonomous explicit routing',fleetId,event({payload:{target_fleet:fleetId}}),/AUTONOMOUS_EXPLICIT_TARGET_ROUTING_ABSENT/);
await expectReject('Autonomous Production request',fleetId,event({payload:{production_authorized:true}}),/AUTONOMOUS_PRODUCTION_SIDE_EFFECT_NOT_REQUESTED/);
await expectReject('Global region omission',fleetId,event({partition:{region:''}}),/GLOBAL_REGION_EXPLICIT/);
await expectReject('Irreplaceable provider bypass',fleetId,event({payload:{provider_direct_to_projection:true}}),/IRREPLACEABLE_PROVIDER_DIRECT_PATH_FORBIDDEN/);
await expectReject('Transparent payload hash',fleetId,event({payload_hash:'sha256:bad'}),/TRANSPARENT_PAYLOAD_HASH_VALID/);
await expectReject('Transparent snapshot',fleetId,event({input_snapshot_ref:''}),/TRANSPARENT_INPUT_SNAPSHOT_PRESENT/);

const outputEvent = {...event(),event_id:'evt_alignment_output',payload_hash:sha('alignment-output')};
const finalReceipt = await alignment.finalizeAsiEngineAlignment(receipts[0],outputEvent,'shadow-processor-test');
alignment.assertAsiEngineAlignmentReceipt(finalReceipt);
assert.equal(finalReceipt.output_event_id,'evt_alignment_output');
assert.equal(finalReceipt.output_payload_hash,outputEvent.payload_hash);

const summary = {
  id:'kidults-asi-engine-alignment-runtime-test-v2',
  status:'VERIFIED_PASS',
  platform_principles:registry.ASI_PLATFORM_PRINCIPLES,
  logical_asi_engines_aligned:registry.ASI_LOGICAL_ENGINES.length,
  execution_fleets_enforced:registry.ASI_FLEETS.length,
  valid_runtime_receipts:receipts.length,
  mutation_rejections:6,
  full_52_engine_runtime_implementation_claimed:false,
  durable_remote_runtime_deployed:false,
  production:'HOLD',
};
console.log(JSON.stringify(summary,null,2));
