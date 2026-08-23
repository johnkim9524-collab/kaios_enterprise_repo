#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const serviceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = resolve(serviceRoot, 'src', 'asi');
const compiledRoot = mkdtempSync(resolve(tmpdir(), 'kidults-asi-p1-source-preflight-'));
const taskQueuePath = process.argv[2] || '/tmp/kidults-asi-p1-source-preflight-v1/p1-source-preflight-task-queue-v1.json';
const outputPath = process.argv[3] || '/tmp/kidults-asi-p1-source-preflight-runtime-receipts-v1.json';

for (const name of ['event', 'registry', 'alignment']) {
  const input = readFileSync(resolve(sourceRoot, `${name}.ts`), 'utf8');
  const transpiled = ts.transpileModule(input, {
    fileName: `${name}.ts`,
    reportDiagnostics: true,
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
      importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove
    }
  });
  const errors = (transpiled.diagnostics || []).filter((item) => item.category === ts.DiagnosticCategory.Error);
  if (errors.length > 0) throw new Error(`ASI_P1_RUNTIME_TYPESCRIPT_TRANSPILE_FAILED:${errors.map((item) => item.messageText).join('|')}`);
  const output = transpiled.outputText.replace(
    /(from\s+['"]|import\s*\(\s*['"])(\.\/[a-z0-9-]+)(['"]\s*\)?)/gi,
    (_match, prefix, specifier, suffix) => `${prefix}${specifier}.mjs${suffix}`
  );
  writeFileSync(resolve(compiledRoot, `${name}.mjs`), output, 'utf8');
}

const eventModule = await import(pathToFileURL(resolve(compiledRoot, 'event.mjs')).href);
const registryModule = await import(pathToFileURL(resolve(compiledRoot, 'registry.mjs')).href);
const alignmentModule = await import(pathToFileURL(resolve(compiledRoot, 'alignment.mjs')).href);
const queue = JSON.parse(readFileSync(taskQueuePath, 'utf8'));
const principles = ['AUTONOMOUS', 'GLOBAL', 'IRREPLACEABLE_VALUE', 'TRANSPARENT'];
const classificationFleets = new Set([
  'SOURCE_SITE_IDENTITY_OWNER_LINEAGE',
  'SOURCE_SCOPE_ROLE_CLASSIFICATION',
  'SOURCE_REGION_LANGUAGE_CLASSIFICATION',
  'SOURCE_MARKET_SEMANTICS_CLASSIFICATION'
]);
const qualificationFleets = new Set([
  'SOURCE_UTILITY_VALUE_ANALYSIS',
  'SOURCE_RIGHTS_COMPLIANCE_ANALYSIS',
  'SOURCE_TECHNICAL_ACCESS_SCHEMA_ANALYSIS',
  'SOURCE_COVERAGE_BIAS_ANALYSIS',
  'SOURCE_INDEPENDENCE_REDUNDANCY_ANALYSIS',
  'SOURCE_FRESHNESS_STABILITY_ANALYSIS',
  'SOURCE_COST_ROI_ANALYSIS'
]);

assert.equal(queue.id, 'kidults-asi-p1-source-preflight-task-queue-v1');
assert.equal(queue.state, 'READY_FOR_SHADOW_RUNTIME_ALIGNMENT_PREFLIGHT');
assert.ok(queue.grain_count > 0);
assert.equal(queue.task_count, queue.grain_count * 11);
assert.equal(queue.tasks.length, queue.task_count);
assert.equal(registryModule.ASI_FLEETS.length, 25);
assert.equal(registryModule.ASI_LOGICAL_ENGINES.length, 11);
assert.deepEqual(registryModule.ASI_PLATFORM_PRINCIPLES, principles);
assert.equal(typeof alignmentModule.assertAsiExecutionAlignment, 'function');
assert.equal(typeof eventModule.validateAsiEvent, 'function');
assert.equal(typeof eventModule.assertAsiEventPayloadHash, 'function');

const receipts = [];
for (const task of queue.tasks) {
  const fleet = registryModule.ASI_FLEET_BY_ID.get(task.target_fleet);
  assert.ok(fleet, `ASI_P1_RUNTIME_FLEET_MISSING:${task.target_fleet}`);
  if (task.stage === 'CLASSIFICATION') {
    assert.ok(classificationFleets.has(task.target_fleet), `ASI_P1_RUNTIME_CLASSIFICATION_FLEET:${task.target_fleet}`);
    assert.equal(fleet.stage, 'CLASSIFICATION');
    assert.equal(fleet.logicalEngine, 'SOURCE_CLASSIFICATION_ENGINE');
  } else {
    assert.equal(task.stage, 'QUALIFICATION');
    assert.ok(qualificationFleets.has(task.target_fleet), `ASI_P1_RUNTIME_QUALIFICATION_FLEET:${task.target_fleet}`);
    assert.equal(fleet.stage, 'QUALIFICATION');
  }
  const event = eventModule.validateAsiEvent(task.event);
  await eventModule.assertAsiEventPayloadHash(event);
  const receipt = await alignmentModule.assertAsiExecutionAlignment(task.target_fleet, event);
  assert.ok(receipt && typeof receipt === 'object', `ASI_P1_RUNTIME_RECEIPT_MISSING:${task.task_id}`);
  const serialized = JSON.stringify(receipt);
  for (const principle of principles) assert.ok(serialized.includes(principle), `ASI_P1_RUNTIME_RECEIPT_PRINCIPLE_MISSING:${task.task_id}:${principle}`);
  assert.ok(!serialized.includes('"state":"FAIL"'), `ASI_P1_RUNTIME_RECEIPT_FAIL:${task.task_id}`);
  assert.ok(!serialized.includes('"hard_floor_pass":false'), `ASI_P1_RUNTIME_HARD_FLOOR_FAIL:${task.task_id}`);
  receipts.push({
    task_id: task.task_id,
    grain_id: task.grain_id,
    candidate_id: task.candidate_id,
    mission_id: task.mission_id,
    stage: task.stage,
    target_fleet: task.target_fleet,
    event_id: event.event_id,
    alignment_receipt: receipt,
    processor_execution_state: 'NOT_EXECUTED_PRELIMINARY_PREFLIGHT_ONLY',
    target_site_probe_executed: false,
    collection_rights_created: false,
    evidence_admitted: false
  });
}

assert.equal(receipts.length, queue.task_count);
assert.equal(new Set(receipts.map((item) => item.task_id)).size, queue.task_count);
assert.equal(new Set(receipts.map((item) => item.grain_id)).size, queue.grain_count);
assert.equal(new Set(receipts.map((item) => item.target_fleet)).size, 11);
assert.equal(receipts.filter((item) => item.stage === 'CLASSIFICATION').length, queue.grain_count * 4);
assert.equal(receipts.filter((item) => item.stage === 'QUALIFICATION').length, queue.grain_count * 7);
for (const grainId of new Set(receipts.map((item) => item.grain_id))) {
  const grainReceipts = receipts.filter((item) => item.grain_id === grainId);
  assert.equal(grainReceipts.length, 11);
  assert.equal(new Set(grainReceipts.map((item) => item.target_fleet)).size, 11);
}

const report = {
  id: 'kidults-asi-p1-source-preflight-runtime-receipts-v1',
  version: '1.0.0',
  state: 'VERIFIED_PASS_RUNTIME_ALIGNMENT_PREFLIGHT',
  platform_principles: principles,
  candidate_mission_grains_runtime_preflighted: queue.grain_count,
  source_preflight_tasks_runtime_preflighted: receipts.length,
  classification_tasks_runtime_preflighted: receipts.filter((item) => item.stage === 'CLASSIFICATION').length,
  qualification_tasks_runtime_preflighted: receipts.filter((item) => item.stage === 'QUALIFICATION').length,
  runtime_registered_fleets_exercised: 11,
  alignment_receipts: receipts.length,
  processor_execution_state: 'NOT_EXECUTED_PRELIMINARY_PREFLIGHT_ONLY',
  target_site_probes_executed: 0,
  collection_rights_created: 0,
  evidence_admitted: 0,
  market_claims_created: 0,
  receipts,
  public_release: 'HOLD',
  production: 'HOLD'
};
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  state: report.state,
  candidate_mission_grains_runtime_preflighted: report.candidate_mission_grains_runtime_preflighted,
  source_preflight_tasks_runtime_preflighted: report.source_preflight_tasks_runtime_preflighted,
  classification_tasks_runtime_preflighted: report.classification_tasks_runtime_preflighted,
  qualification_tasks_runtime_preflighted: report.qualification_tasks_runtime_preflighted,
  runtime_registered_fleets_exercised: report.runtime_registered_fleets_exercised,
  alignment_receipts: report.alignment_receipts,
  target_site_probes_executed: 0,
  evidence_admitted: 0,
  public_release: 'HOLD',
  production: 'HOLD'
}, null, 2));
