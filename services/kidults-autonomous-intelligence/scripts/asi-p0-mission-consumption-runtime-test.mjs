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
const compiledRoot = mkdtempSync(resolve(tmpdir(), 'kidults-asi-p0-mission-runtime-'));
const taskQueuePath = process.argv[2] || '/tmp/kidults-asi-p0-mission-consumption-v1/p0-source-discovery-task-queue-v1.json';
const outputPath = process.argv[3] || '/tmp/kidults-asi-p0-mission-runtime-receipts-v1.json';

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
  if (errors.length > 0) {
    throw new Error(`ASI_P0_RUNTIME_TYPESCRIPT_TRANSPILE_FAILED:${errors.map((item) => item.messageText).join('|')}`);
  }
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

assert.equal(queue.id, 'kidults-asi-p0-source-discovery-task-queue-v1');
assert.equal(queue.state, 'READY_FOR_SHADOW_QUEUE_RUNTIME_PREFLIGHT');
assert.equal(queue.task_count, 576);
assert.equal(queue.tasks.length, 576);
assert.equal(registryModule.ASI_FLEETS.length, 25);
assert.equal(registryModule.ASI_LOGICAL_ENGINES.length, 11);
assert.deepEqual(registryModule.ASI_PLATFORM_PRINCIPLES, principles);
assert.equal(typeof alignmentModule.assertAsiExecutionAlignment, 'function');
assert.equal(typeof eventModule.validateAsiEvent, 'function');
assert.equal(typeof eventModule.assertAsiEventPayloadHash, 'function');
assert.equal(typeof registryModule.asiLogicalEngineForFleet, 'function');

const receipts = [];
for (const task of queue.tasks) {
  const fleet = registryModule.ASI_FLEET_BY_ID.get(task.target_fleet);
  assert.ok(fleet, `ASI_P0_RUNTIME_FLEET_MISSING:${task.target_fleet}`);
  assert.equal(fleet.stage, 'DISCOVERY');
  assert.equal(registryModule.asiLogicalEngineForFleet(task.target_fleet), 'SOURCE_DISCOVERY_ENGINE');
  const event = eventModule.validateAsiEvent(task.event);
  await eventModule.assertAsiEventPayloadHash(event);
  assert.match(event.payload.discovery_seed?.source_id || '', /^discovery-frontier:v1:sha256:[a-f0-9]{64}$/);
  assert.equal(event.payload.discovery_seed?.discovery_frontier_only, true);
  assert.equal(event.payload.discovery_seed?.external_source_observed, false);
  assert.equal(event.payload.discovery_seed?.source_candidate_created, false);
  const receipt = await alignmentModule.assertAsiExecutionAlignment(task.target_fleet, event);
  assert.ok(receipt && typeof receipt === 'object', `ASI_P0_RUNTIME_RECEIPT_MISSING:${task.task_id}`);
  const serialized = JSON.stringify(receipt);
  for (const principle of principles) {
    assert.ok(serialized.includes(principle), `ASI_P0_RUNTIME_RECEIPT_PRINCIPLE_MISSING:${task.task_id}:${principle}`);
  }
  assert.ok(!serialized.includes('"state":"FAIL"'), `ASI_P0_RUNTIME_RECEIPT_FAIL:${task.task_id}`);
  assert.ok(!serialized.includes('"hard_floor_pass":false'), `ASI_P0_RUNTIME_HARD_FLOOR_FAIL:${task.task_id}`);
  receipts.push({
    task_id: task.task_id,
    mission_id: task.mission_id,
    lane_slot: task.lane_slot,
    target_fleet: task.target_fleet,
    event_id: event.event_id,
    alignment_receipt: receipt,
    processor_execution_state: 'NOT_EXECUTED_DISCOVERY_TASK_PREFLIGHT_ONLY',
    external_network_call_executed: false,
    source_candidate_created: false
  });
}

assert.equal(receipts.length, 576);
assert.equal(new Set(receipts.map((item) => item.task_id)).size, 576);
assert.equal(new Set(receipts.map((item) => item.mission_id)).size, 192);
assert.equal(new Set(receipts.map((item) => item.target_fleet)).size, 11);
for (const laneSlot of ['PRIMARY_CANDIDATE_LANE', 'INDEPENDENT_FALLBACK_LANE', 'FACTUAL_ORIGIN_REPLACEMENT_LANE']) {
  assert.equal(receipts.filter((item) => item.lane_slot === laneSlot).length, 192);
}

const report = {
  id: 'kidults-asi-p0-mission-consumption-runtime-receipts-v1',
  version: '1.0.0',
  state: 'VERIFIED_PASS_RUNTIME_ALIGNMENT_PREFLIGHT',
  platform_principles: principles,
  missions_runtime_preflighted: 192,
  discovery_tasks_runtime_preflighted: 576,
  runtime_registered_discovery_fleets_exercised: 11,
  alignment_receipts: receipts.length,
  processor_execution_state: 'NOT_EXECUTED_DISCOVERY_TASK_PREFLIGHT_ONLY',
  external_network_calls_executed: 0,
  source_candidates_created: 0,
  evidence_admitted: 0,
  market_claims_created: 0,
  receipts,
  public_release: 'HOLD',
  production: 'HOLD'
};
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  state: report.state,
  missions_runtime_preflighted: report.missions_runtime_preflighted,
  discovery_tasks_runtime_preflighted: report.discovery_tasks_runtime_preflighted,
  runtime_registered_discovery_fleets_exercised: report.runtime_registered_discovery_fleets_exercised,
  alignment_receipts: report.alignment_receipts,
  external_network_calls_executed: 0,
  source_candidates_created: 0,
  public_release: 'HOLD',
  production: 'HOLD'
}, null, 2));
