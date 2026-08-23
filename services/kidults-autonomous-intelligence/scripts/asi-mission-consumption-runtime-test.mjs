#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const serviceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = resolve(serviceRoot, 'src', 'asi');
const compiledRoot = mkdtempSync(resolve(tmpdir(), 'kidults-asi-mission-consumption-'));
const inputPath = process.argv[2] || '/tmp/kidults-asi-mission-consumption-v1/mission-runtime-discovery-events-v1.json';

for (const name of ['event', 'registry', 'processors', 'alignment']) {
  const input = readFileSync(resolve(sourceRoot, `${name}.ts`), 'utf8');
  const transpiled = ts.transpileModule(input, {
    fileName: `${name}.ts`,
    reportDiagnostics: true,
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
      importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove,
    },
  });
  const errors = (transpiled.diagnostics || []).filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
  if (errors.length > 0) {
    throw new Error(`ASI_MISSION_RUNTIME_TYPESCRIPT_TRANSPILE_FAILED:${name}:${errors.map((diagnostic) => diagnostic.messageText).join('|')}`);
  }
  const output = transpiled.outputText.replace(
    /(from\s+['"]|import\s*\(\s*['"])(\.\/[a-z0-9-]+)(['"]\s*\)?)/gi,
    (_match, prefix, specifier, suffix) => `${prefix}${specifier}.mjs${suffix}`,
  );
  writeFileSync(resolve(compiledRoot, `${name}.mjs`), output, 'utf8');
}

const eventModule = await import(pathToFileURL(resolve(compiledRoot, 'event.mjs')).href);
const registry = await import(pathToFileURL(resolve(compiledRoot, 'registry.mjs')).href);
const processors = await import(pathToFileURL(resolve(compiledRoot, 'processors.mjs')).href);
const alignment = await import(pathToFileURL(resolve(compiledRoot, 'alignment.mjs')).href);

const input = JSON.parse(readFileSync(inputPath, 'utf8'));
assert.equal(input.id, 'kidults-asi-mission-runtime-discovery-events-v1');
assert.equal(input.state, 'RUNTIME_COMPATIBLE_DISCOVERY_EVENTS_MATERIALIZED');
assert.equal(input.input_event_type, 'SOURCE_DISCOVERY_REQUESTED');
assert.equal(input.target_runtime_fleet, 'DISCOVERY_APPROVED_DIRECTORY_OUTBOUND_FRONTIER');
assert.equal(input.expected_processor_output_type, 'SOURCE_DISCOVERED');
assert.equal(input.expected_processor_decision, 'HOLD');
assert.equal(input.event_count, input.events.length);
assert.ok(input.event_count > 0);

const inputIds = new Set();
const outputIds = new Set();
const receiptIds = new Set();
const missionIds = new Set();
const marketCellIds = new Set();
const sourceIds = new Set();
const runtimeReceipts = [];
const processorOutputs = [];
let alignmentAxisPasses = 0;
let zeroSideEffectProcessors = 0;
let holdOutputs = 0;
let unknownRightsOutputs = 0;

for (const rawEvent of input.events) {
  const event = eventModule.validateAsiEvent(rawEvent);
  await eventModule.assertAsiEventPayloadHash(event);
  assert.equal(event.event_type, 'SOURCE_DISCOVERY_REQUESTED');
  assert.equal(event.decision, 'HOLD');
  assert.equal(event.rights_state, 'UNKNOWN');
  assert.equal(event.assertion_purpose, 'MISSION_BOUND_SOURCE_DISCOVERY_PREFLIGHT');
  assert.equal(event.partition.channel, 'APPROVED_DIRECTORY_ASSOCIATION_AND_OUTBOUND_LINK_FRONTIER');
  assert.equal(event.payload.content_collection_authorized, false);
  assert.equal(event.payload.external_collection_execution_authorized, false);
  assert.equal(event.payload.public_projection_authorized, false);
  assert.equal(event.payload.production_authorized, false);
  assert.equal(event.payload.discovery_seed?.discovery_rights_state, 'UNKNOWN');
  assert.ok(event.trace_refs.includes(event.payload.mission_id));
  assert.ok(event.trace_refs.includes(event.payload.market_cell_id));
  assert.ok(!inputIds.has(event.event_id), `DUPLICATE_INPUT_EVENT:${event.event_id}`);
  inputIds.add(event.event_id);
  missionIds.add(event.payload.mission_id);
  marketCellIds.add(event.payload.market_cell_id);
  sourceIds.add(event.payload.source_id);

  const targetFleets = registry.targetFleetsFor(event);
  assert.deepEqual(targetFleets, ['DISCOVERY_APPROVED_DIRECTORY_OUTBOUND_FRONTIER']);

  const preflight = await alignment.assertAsiExecutionAlignment(targetFleets[0], event);
  assert.equal(preflight.hard_floor_pass, true);
  assert.deepEqual(preflight.failure_codes, []);
  assert.deepEqual(preflight.principle_order, ['AUTONOMOUS', 'GLOBAL', 'IRREPLACEABLE_VALUE', 'TRANSPARENT']);
  for (const principle of preflight.principle_order) {
    assert.equal(preflight.principle_results[principle].state, 'PASS');
    alignmentAxisPasses += 1;
  }

  const result = await processors.processAsiFleet({ fleet_id: targetFleets[0], event });
  assert.equal(result.fleet_id, 'DISCOVERY_APPROVED_DIRECTORY_OUTBOUND_FRONTIER');
  assert.equal(result.stage, 'DISCOVERY');
  assert.equal(result.state, 'HELD_SHADOW');
  assert.equal(result.input_event_id, event.event_id);
  assert.equal(result.output_event.event_type, 'SOURCE_DISCOVERED');
  assert.equal(result.output_event.decision, 'HOLD');
  assert.equal(result.output_event.rights_state, 'UNKNOWN');
  assert.equal(result.output_event.causation_id, event.event_id);
  assert.equal(result.output_event.correlation_id, event.correlation_id);
  assert.equal(result.output_event.partition.scope_id, event.partition.scope_id);
  assert.equal(result.output_event.partition.region, event.partition.region);
  assert.equal(result.output_event.partition.source_role, event.partition.source_role);
  assert.ok(result.output_event.trace_refs.includes(event.payload.mission_id));
  assert.ok(result.output_event.trace_refs.includes(event.payload.market_cell_id));
  assert.equal(result.output_event.payload.source_id, event.payload.source_id);
  assert.equal(result.output_event.payload.discovery_seed.source_id, event.payload.source_id);
  assert.equal(result.output_event.payload.discovery_seed.discovery_rights_state, 'UNKNOWN');
  assert.equal(result.output_event.payload.discovery_metadata_only, true);
  assert.equal(result.output_event.payload.content_collection_authorized, false);
  assert.equal(result.output_event.payload.public_projection_authorized, false);
  assert.equal(result.output_event.payload.production_authorized, false);
  await eventModule.assertAsiEventPayloadHash(result.output_event);
  assert.ok(!outputIds.has(result.output_event.event_id), `DUPLICATE_OUTPUT_EVENT:${result.output_event.event_id}`);
  outputIds.add(result.output_event.event_id);

  assert.deepEqual(result.side_effect_boundary, {
    network_requests: 0,
    external_writes: 0,
    paid_actions: 0,
    collection_execution_authorized: false,
    public_projection_authorized: false,
    production_authorized: false,
  });
  zeroSideEffectProcessors += 1;
  holdOutputs += result.output_event.decision === 'HOLD' ? 1 : 0;
  unknownRightsOutputs += result.output_event.rights_state === 'UNKNOWN' ? 1 : 0;

  const receipt = await alignment.finalizeAsiEngineAlignment(preflight, result.output_event, result.processor_version);
  alignment.assertAsiEngineAlignmentReceipt(receipt);
  assert.equal(receipt.fleet_id, targetFleets[0]);
  assert.equal(receipt.input_event_id, event.event_id);
  assert.equal(receipt.output_event_id, result.output_event.event_id);
  assert.equal(receipt.provider_direct_path_allowed, false);
  assert.equal(receipt.collection_permission_created, false);
  assert.equal(receipt.public_projection_authorized, false);
  assert.equal(receipt.production, 'HOLD');
  assert.ok(!receiptIds.has(receipt.receipt_id), `DUPLICATE_ALIGNMENT_RECEIPT:${receipt.receipt_id}`);
  receiptIds.add(receipt.receipt_id);
  runtimeReceipts.push(receipt);
  processorOutputs.push({
    input_event_id: event.event_id,
    output_event_id: result.output_event.event_id,
    output_payload_hash: result.output_event.payload_hash,
    mission_id: event.payload.mission_id,
    market_cell_id: event.payload.market_cell_id,
    source_id: event.payload.source_id,
    lane_slot: event.payload.lane_slot,
    processor_state: result.state,
    decision: result.output_event.decision,
    rights_state: result.output_event.rights_state,
    alignment_receipt_id: receipt.receipt_id,
    network_requests: result.side_effect_boundary.network_requests,
    external_writes: result.side_effect_boundary.external_writes,
    collection_execution_authorized: false,
  });
}

const first = eventModule.validateAsiEvent(input.events[0]);
const firstFleet = registry.targetFleetsFor(first)[0];
const firstPreflightA = await alignment.assertAsiExecutionAlignment(firstFleet, first);
const firstPreflightB = await alignment.assertAsiExecutionAlignment(firstFleet, first);
assert.deepEqual(firstPreflightA, firstPreflightB, 'PREFLIGHT_REPLAY_NOT_DETERMINISTIC');
const firstResultA = await processors.processAsiFleet({ fleet_id: firstFleet, event: first });
const firstResultB = await processors.processAsiFleet({ fleet_id: firstFleet, event: first });
assert.deepEqual(firstResultA, firstResultB, 'PROCESSOR_REPLAY_NOT_DETERMINISTIC');
const firstReceiptA = await alignment.finalizeAsiEngineAlignment(firstPreflightA, firstResultA.output_event, firstResultA.processor_version);
const firstReceiptB = await alignment.finalizeAsiEngineAlignment(firstPreflightB, firstResultB.output_event, firstResultB.processor_version);
assert.deepEqual(firstReceiptA, firstReceiptB, 'ALIGNMENT_RECEIPT_REPLAY_NOT_DETERMINISTIC');

const report = {
  id: 'kidults-asi-mission-consumption-runtime-test-v1',
  version: '1.0.0',
  state: 'VERIFIED_PASS',
  input_events_validated: inputIds.size,
  input_payload_hashes_verified: inputIds.size,
  canonical_runtime_routes_verified: inputIds.size,
  target_fleet: 'DISCOVERY_APPROVED_DIRECTORY_OUTBOUND_FRONTIER',
  four_principle_axis_passes: alignmentAxisPasses,
  processor_outputs: processorOutputs.length,
  unique_output_events: outputIds.size,
  held_shadow_outputs: holdOutputs,
  unknown_rights_outputs: unknownRightsOutputs,
  zero_side_effect_processors: zeroSideEffectProcessors,
  alignment_receipts: runtimeReceipts.length,
  missions_with_runtime_events: missionIds.size,
  market_cells_with_runtime_events: marketCellIds.size,
  registered_sources_exercised: sourceIds.size,
  deterministic_replay: 'PASS',
  external_network_requests: 0,
  external_writes: 0,
  paid_actions: 0,
  collection_execution_authorized: false,
  market_event_admitted: false,
  graph_fact_created: false,
  snapshot_candidate_created: false,
  public_release: 'HOLD',
  production: 'HOLD',
  runtime_receipts: runtimeReceipts,
  processor_output_receipts: processorOutputs,
};
console.log(JSON.stringify(report, null, 2));
