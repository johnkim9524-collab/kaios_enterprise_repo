import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { evaluateKirCurrentSoldControl as evaluate } from '../../../scripts/kidults/runtime/kir-current-sold-control-bridge-v1.mjs';
import { controlFixture, rebindRegistry, reseal } from './kir-current-sold-control-fixtures-v1.mjs';

function boundary(receipt) {
  for (const key of ['raw_rows_emitted','raw_evidence_emitted','bundle_emitted','ledger_write_eligible','runtime_activation_authorized','provider_authority','database_authority','empirical_authority','producer_health_authority','promotion_eligible','track_b_started','projection_approved']) assert.equal(receipt[key], false, key);
  for (const key of ['public_release','production','g5']) assert.equal(receipt[key], 'HOLD', key);
  assert.equal(receipt.empirical_current_sold_delta, 0);
  assert.equal(receipt.postgres_rows_written, 0);
  assert.equal(receipt.blockers.length, 7);
  for (const key of ['envelope','admission','event_versions','evidence','receipt_registry','ledger']) assert.equal(Object.hasOwn(receipt, key), false, key);
}
for (const count of [1,5]) test(`real KIR -> atomic Current-SOLD -> Evidence processes ${count} synthetic rows without authority`, () => {
  const result = evaluate(controlFixture(undefined, count));
  assert.equal(result.state, 'CONTROL_CHAIN_VALIDATED_EMPIRICAL_BLOCKED');
  assert.equal(result.engine_control_status, 'PASS');
  assert.equal(result.control_counts.admitted, count);
  assert.equal(result.control_counts.evidence, count);
  boundary(result);
});
test('missing rights are rejected by the actual engine', () => {
  const input = controlFixture(); input.receiptRegistry.rights = [];
  const result = evaluate(rebindRegistry(input));
  assert.equal(result.state, 'CONTROL_INPUT_REJECTED');
  assert.equal(result.control_counts.admitted, 0); assert.equal(result.control_counts.evidence, 0);
  boundary(result);
});
test('one missing acquisition makes the whole two-row batch fail closed', () => {
  const input = controlFixture(undefined, 2); input.receiptRegistry.acquisitions.pop();
  const result = evaluate(rebindRegistry(input));
  assert.equal(result.engine_control_status, 'PARTIAL_FAIL_CLOSED');
  assert.equal(result.control_counts.admitted, 0); assert.equal(result.control_counts.evidence, 0);
  boundary(result);
});
test('stale sale cannot cross the atomic freshness gate', () => {
  const input = controlFixture(); input.envelope.observations[0].sold_at = '2026-08-10T00:00:00.000Z';
  const result = evaluate(reseal(input));
  assert.equal(result.state, 'CONTROL_INPUT_REJECTED'); boundary(result);
});
test('same source transaction mapped to another object is quarantined', () => {
  const input = controlFixture(undefined, 2);
  input.envelope.observations[1].source_event_id = input.envelope.observations[0].source_event_id;
  input.envelope.observations[1].source_url = input.envelope.observations[0].source_url;
  const result = evaluate(reseal(input));
  assert.equal(result.state, 'CONTROL_INPUT_REJECTED');
  assert.ok(result.control_counts.quarantined > 0); boundary(result);
});
const bad = [
  ['live mode', x => {x.mode = 'LIVE';}, /KIR_BRIDGE_CONTROL_MODE_REQUIRED/],
  ['extra capability', x => {x.database_authority = true;}, /KIR_BRIDGE_OPTIONS/],
  ['detached KIR receipt', x => {x.kirReceipt = {state:'PASS'};}, /KIR_BRIDGE_OPTIONS/],
  ['predecessor envelope SHA', x => {x.envelope.source_sha = '2'.repeat(40);}, /KIR_BRIDGE_SOURCE_SHA_MISMATCH/],
  ['predecessor observation SHA', x => {x.envelope.observations[0].source_sha = '2'.repeat(40);}, /KIR_BRIDGE_OBSERVATION_SHA/],
  ['wrong envelope run', x => {x.envelope.canonical_run_id = 'kir-fixture-102-1';}, /KIR_BRIDGE_RUN_MISMATCH/],
  ['wrong observation run', x => {x.envelope.observations[0].canonical_run_id = 'kir-fixture-102-1';}, /KIR_BRIDGE_OBSERVATION_RUN/],
  ['wrong receipt generation', x => {x.receiptRegistry.rights[0].source_sha = '2'.repeat(40);}, /KIR_BRIDGE_RECEIPT_BINDING/],
  ['missing digest', x => {x.expectedReceiptRegistryDigest = '';}, /KIR_BRIDGE_EXPECTED_DIGEST_REQUIRED/],
  ['registry tamper', x => {x.receiptRegistry.rights = [];}, /KIR_BRIDGE_REGISTRY_DIGEST_MISMATCH/],
  ['real source URL', x => {x.envelope.observations[0].source_url = 'https://example.com/real';}, /KIR_BRIDGE_SYNTHETIC_URL_REQUIRED/],
  ['URL credentials', x => {x.envelope.observations[0].source_url = 'https://name:pass@kir-fixture.invalid/';}, /KIR_BRIDGE_SYNTHETIC_URL_REQUIRED/],
  ['non-synthetic object', x => {x.envelope.observations[0].canonical_object_id = 'vehicle:real';}, /KIR_BRIDGE_SYNTHETIC_OBJECT_REQUIRED/],
  ['non-synthetic receipt', x => {x.receiptRegistry.rights[0].receipt_id = 'real-rights';}, /KIR_BRIDGE_SYNTHETIC_RECEIPT_REQUIRED/],
  ['empty batch', x => {x.envelope.observations = [];}, /KIR_BRIDGE_BATCH_SIZE/],
  ['invalid clock', x => {x.now = new Date('invalid');}, /KIR_BRIDGE_TEST_CLOCK/],
  ['different test clock', x => {x.now = new Date('2026-09-02T00:00:00.000Z');}, /KIR_BRIDGE_TEST_CLOCK_MISMATCH/],
  ['identity state injection', x => {x.identity.state = 'VERIFIED_PASS';}, /KIR_IDENTITY_FIELDS/],
  ['identity unsafe number', x => {x.identity.run_id = Number.MAX_SAFE_INTEGER+1;}, /KIR_IDENTITY_RUN_ID/],
  ['envelope hidden field', x => {Object.defineProperty(x.envelope,'hidden',{value:1});}, /KIR_BRIDGE_JSON_DESCRIPTOR/],
  ['cyclic input', x => {x.envelope.loop = x.envelope;}, /KIR_BRIDGE_JSON_DATA/],
  ['sparse rows', x => {delete x.envelope.observations[0];}, /KIR_BRIDGE_JSON_ARRAY/],
];
for (const [name, mutate, code] of bad) test(`control bridge rejects ${name}`, () => {
  const input = controlFixture(); mutate(input); assert.throws(() => evaluate(input), code);
});
test('input accessors are rejected without invoking them', () => {
  const input = controlFixture(); let calls = 0;
  Object.defineProperty(input.envelope, 'source_sha', {get() {calls++;return input.identity.source_sha;}, enumerable:true});
  assert.throws(() => evaluate(input), /KIR_BRIDGE_JSON_DESCRIPTOR/); assert.equal(calls,0);
});
test('evaluation is deterministic and does not mutate caller inputs', () => {
  const input = controlFixture(); const before = structuredClone(input);
  assert.deepEqual(evaluate(input), evaluate(input)); assert.deepEqual(input,before);
});
test('workflow watches actual engine dependencies and reconciles bridge proof before upload', () => {
  const workflow = fs.readFileSync('.github/workflows/kidults-kir-runtime-contract-v1.yml','utf8');
  assert.equal(workflow.split("- 'scripts/kidults/market/current-sold-*.mjs'").length-1,2);
  assert.ok(workflow.includes('kir-current-sold-control-bridge-v1.test.mjs'));
  assert.ok(workflow.includes('BRIDGE_OUTCOME: ${{ steps.bridge.outcome }}'));
  assert.ok(workflow.includes("('BRIDGE',os.environ.get('BRIDGE_OUTCOME',''))"));
  assert.ok(workflow.includes('bridge_receipt_file_sha256'));
  assert.ok(workflow.includes('/tmp/kidults-kir-current-sold-control-receipt-v1.json'));
  assert.ok(!workflow.includes('secrets.'));
});
