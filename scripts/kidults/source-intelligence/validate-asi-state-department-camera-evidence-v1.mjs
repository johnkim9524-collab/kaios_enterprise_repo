#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import {
  canonicalizeMarketEvent,
  computeMarketSignals,
  marketAdmissionErrors,
} from '../intelligence/provider-independent-layers-v1.mjs';

const moduleSpecifier = (environmentName, packageSpecifier) => process.env[environmentName]
  ? pathToFileURL(path.resolve(process.env[environmentName])).href
  : packageSpecifier;
const Ajv2020 = (await import(moduleSpecifier('KIDULTS_AJV_2020_MODULE', 'ajv/dist/2020.js'))).default;
const addFormats = (await import(moduleSpecifier('KIDULTS_AJV_FORMATS_MODULE', 'ajv-formats'))).default;

const [outputDir, observationPath, contractPath, adapterTestReceiptPath] = process.argv.slice(2);
if (![outputDir, observationPath, contractPath, adapterTestReceiptPath].every(Boolean)) {
  throw new Error('STATE_DEPARTMENT_CAMERA_EVIDENCE_VALIDATION_ARGUMENTS_REQUIRED');
}

const root = process.cwd();
const fail = (message) => { throw new Error(message); };
const assert = (condition, message) => { if (!condition) fail(message); };
const read = (file) => fs.readFileSync(file, 'utf8');
const json = (file) => JSON.parse(read(file));
const stable = (value) => Array.isArray(value)
  ? value.map(stable)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]))
    : value;
const same = (left, right) => JSON.stringify(stable(left)) === JSON.stringify(stable(right));
const hash = (value) => `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
const protectedHold = (value) => value?.public_release === 'HOLD' && value?.production === 'HOLD' && value?.g5 === 'HOLD';
const file = (name) => path.join(outputDir, name);
const principles = ['AUTONOMOUS', 'GLOBAL', 'IRREPLACEABLE_VALUE', 'TRANSPARENT'];
const required = [
  'state-department-camera-evidence-ledger-v1.json',
  'state-department-camera-market-event-ledger-v1.json',
  'state-department-camera-claim-ceiling-receipt-v1.json',
  'state-department-camera-evidence-manifest-v1.json',
];
for (const name of required) assert(fs.existsSync(file(name)), `OUTPUT_FILE_MISSING:${name}`);
assert(same(fs.readdirSync(outputDir).filter((name) => name.endsWith('.json')).sort(), [...required].sort()), 'OUTPUT_FILE_SET_INVALID');

const observation = json(observationPath);
const contract = json(contractPath);
const testReceipt = json(adapterTestReceiptPath);
const registry = json('coordination/kidults/source-intelligence/asi-state-department-camera-evidence-registry-v1.json');
const top16 = json('coordination/kidults/source-intelligence/asi-source-adapter-wave4-registry-v1.json');
const marketEventSchema = json('coordination/kidults/schemas/market-event-v1.schema.json');
const evidenceLedger = json(file(required[0]));
const marketEventLedger = json(file(required[1]));
const claimCeiling = json(file(required[2]));
const outputManifest = json(file(required[3]));

assert(contract.id === 'kidults-asi-state-department-camera-evidence-contract-v1' && contract.version === '1.0.0', 'CONTRACT_ID_VERSION');
assert(contract.status === 'VERIFIED_PASS' && same(contract.platform_principles, principles), 'CONTRACT_STATUS_PRINCIPLES');
assert(same(contract.required_outputs, required), 'CONTRACT_OUTPUTS');
assert(contract.authoritative_inputs.observation_projection_sha256 === observation.projection_sha256, 'CONTRACT_OBSERVATION_DIGEST');
assert(hash(JSON.stringify(stable(observation.source_projection))) === observation.projection_sha256, 'OBSERVATION_PROJECTION_DIGEST');
assert(contract.admission_target.maximum_retained_reference_records === 1 &&
  contract.admission_target.maximum_admitted_evidence_records === 0 &&
  contract.admission_target.maximum_market_event_references === 0 &&
  contract.admission_target.machine_proven_acquisition_receipt_required_for_empirical_admission === true &&
  contract.admission_target.verified_sold_event_allowed === false &&
  contract.admission_target.current_price_allowed === false &&
  contract.admission_target.liquidity_or_time_to_sale_allowed === false, 'CONTRACT_REFERENCE_REPLAY_CEILING');
assert(contract.truth_boundary.committed_official_source_reference_projections_verified === 1 &&
  contract.truth_boundary.reference_projection_records_retained === 1 &&
  contract.truth_boundary.machine_proven_acquisition_receipts === 0 &&
  contract.truth_boundary.auction_result_reference_evidence_admitted === 0 &&
  contract.truth_boundary.market_event_references_created === 0 &&
  contract.truth_boundary.empirical_evidence_admitted === 0 &&
  contract.truth_boundary.empirical_market_events_created === 0 &&
  contract.truth_boundary.promotable === false && protectedHold(contract.truth_boundary), 'CONTRACT_EMPIRICAL_ZERO');
assert(observation.state === 'VERIFIED_PASS' && protectedHold(observation), 'OBSERVATION_STATE_BOUNDARY');
assert(Number.isFinite(Date.parse(observation.rights?.review_due_at)) && Date.parse(observation.rights.review_due_at) > Date.now(), 'OBSERVATION_RIGHTS_REVIEW_EXPIRED');
assert(testReceipt.state === 'VERIFIED_PASS' &&
  testReceipt.source_projection_sha256 === observation.projection_sha256 &&
  testReceipt.network_requests_executed_by_test === 0 &&
  testReceipt.evidence_admitted_by_parser === 0 && testReceipt.market_events_created_by_parser === 0 &&
  testReceipt.adapter_result?.raw_live_source_snapshot_verified === false &&
  testReceipt.adapter_result?.evidence_admitted === false && testReceipt.adapter_result?.market_event_created === false, 'TEST_RECEIPT_EMPIRICAL_ZERO');

const adapterRerun = spawnSync(process.execPath, [contract.authoritative_inputs.test, observationPath, contractPath], {
  cwd: root, env: process.env, encoding: 'utf8',
});
assert(adapterRerun.status === 0, `ADAPTER_RERUN_FAILED:${adapterRerun.stderr || adapterRerun.stdout}`);
let adapterRerunReceipt;
try { adapterRerunReceipt = JSON.parse(adapterRerun.stdout); } catch { fail('ADAPTER_RERUN_RECEIPT_INVALID_JSON'); }
assert(same(adapterRerunReceipt, testReceipt), 'ADAPTER_RERUN_RECEIPT_MISMATCH');

const expectedDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-state-department-camera-reference-expected-'));
try {
  const rebuilt = spawnSync(process.execPath, [contract.authoritative_inputs.builder, observationPath, contractPath, adapterTestReceiptPath, expectedDir], {
    cwd: root, env: process.env, encoding: 'utf8',
  });
  assert(rebuilt.status === 0, `EXPECTED_REBUILD_FAILED:${rebuilt.stderr || rebuilt.stdout}`);
  for (const name of required) assert(read(file(name)) === read(path.join(expectedDir, name)), `OUTPUT_REBUILD_MISMATCH:${name}`);
} finally {
  fs.rmSync(expectedDir, { recursive: true, force: true });
}

assert(evidenceLedger.id === 'kidults-state-department-camera-evidence-ledger-v1' &&
  evidenceLedger.version === '1.0.0' && evidenceLedger.state === 'CONTROL_ONLY_REFERENCE_REPLAY' &&
  same(evidenceLedger.platform_principles, principles), 'REFERENCE_LEDGER_ID_STATE');
assert(evidenceLedger.admitted_evidence_count === 0 &&
  evidenceLedger.retained_reference_record_count === 1 &&
  evidenceLedger.auction_result_reference_count === 1 &&
  evidenceLedger.empirical_evidence_admitted === 0 &&
  evidenceLedger.machine_proven_acquisition_receipts === 0 &&
  evidenceLedger.verified_sold_event_count === 0 &&
  evidenceLedger.records?.length === 1 && evidenceLedger.top_16_evidence_admitted === 0 &&
  evidenceLedger.promotable === false, 'REFERENCE_LEDGER_COUNTS');
const reference = evidenceLedger.records[0];
assert(reference.admission_state === 'COMMITTED_REFERENCE_REPLAY_NOT_EMPIRICALLY_ADMITTED' &&
  reference.reference_only === true && reference.empirical_evidence_admitted === false &&
  reference.empirical_market_event_created === false && reference.promotable === false, 'REFERENCE_RECORD_ADMISSION_STATE');
assert(reference.provenance?.committed_reference_projection_verified === true &&
  reference.provenance?.raw_live_source_snapshot_verified === false &&
  reference.provenance?.machine_proven_acquisition_receipt === false &&
  reference.provenance?.lineage_digest_role === 'NORMALIZED_COMMITTED_REFERENCE_PROJECTION_NOT_ACQUISITION_RECEIPT', 'REFERENCE_RECORD_PROVENANCE');
assert(reference.event_state === 'SOLD' && reference.price_observation?.price_type === 'BID' &&
  reference.price_observation?.amount === 2110 && reference.price_observation?.currency === 'QAR' &&
  reference.price_observation?.bid_count === 101 && reference.verified_sold_event === false &&
  reference.hammer_price_confirmed === false && reference.current_price_eligible === false &&
  reference.liquidity_eligible === false && reference.signal_eligible === false && reference.index_eligible === false, 'REFERENCE_RECORD_CLAIM_CEILING');
assert(protectedHold(evidenceLedger) && protectedHold(reference), 'REFERENCE_LEDGER_PROTECTED_GATES');

assert(marketEventLedger.id === 'kidults-state-department-camera-market-event-ledger-v1' &&
  marketEventLedger.state === 'CONTROL_ONLY_REFERENCE_REPLAY' &&
  marketEventLedger.admitted_market_event_references === 0 &&
  marketEventLedger.retained_reference_event_count === 1 &&
  marketEventLedger.empirical_market_events_created === 0 &&
  marketEventLedger.machine_proven_acquisition_receipts === 0 &&
  marketEventLedger.generic_market_events_admitted === 0 &&
  marketEventLedger.verified_sold_events === 0 && marketEventLedger.current_price_events === 0 && marketEventLedger.liquidity_events === 0 &&
  marketEventLedger.reference_only === true && marketEventLedger.promotable === false &&
  marketEventLedger.reference_events?.length === 1, 'REFERENCE_EVENT_LEDGER');
const event = marketEventLedger.reference_events[0];
const ajv = new Ajv2020({ allErrors: true, strict: true, strictTypes: false, strictRequired: false });
addFormats(ajv);
const validateMarketEvent = ajv.compile(marketEventSchema);
assert(validateMarketEvent(event), `MARKET_EVENT_SCHEMA:${ajv.errorsText(validateMarketEvent.errors)}`);
assert(event.evidence_class === 'AUCTION_RESULT_REFERENCE' && event.event_state === 'SOLD' &&
  event.price?.price_type === 'BID' && event.price?.amount === 2110 && event.price?.currency === 'QAR', 'REFERENCE_EVENT_FACTS');
assert(event.lineage?.evidence_id === reference.evidence_id && event.lineage?.raw_digest === observation.projection_sha256 &&
  /^sha256:[a-f0-9]{64}$/.test(event.lineage?.normalized_digest || ''), 'REFERENCE_EVENT_LINEAGE');
const genericAdmissionErrors = marketAdmissionErrors(event);
const genericCanonicalization = canonicalizeMarketEvent(event);
const genericSignals = computeMarketSignals([genericCanonicalization]);
const forgedSignals = computeMarketSignals([{ ...genericCanonicalization, admitted: true, admission_errors: [] }]);
assert(genericAdmissionErrors.includes('REFERENCE_ONLY_EVIDENCE_CLASS_NOT_GENERIC_ADMISSIBLE') &&
  genericCanonicalization.admitted === false &&
  genericSignals.unique_event_count === 0 && genericSignals.sold_event_count === 0 &&
  forgedSignals.unique_event_count === 0 && forgedSignals.sold_event_count === 0, 'REFERENCE_GENERIC_ROUTER_REJECTION');
assert(protectedHold(marketEventLedger), 'REFERENCE_EVENT_LEDGER_PROTECTED_GATES');

assert(claimCeiling.id === 'kidults-state-department-camera-claim-ceiling-receipt-v1' &&
  claimCeiling.state === 'CONTROL_ONLY_REFERENCE_REPLAY' &&
  claimCeiling.machine_proven_acquisition_receipt === false &&
  claimCeiling.empirical_evidence_admitted === false && claimCeiling.empirical_market_event_created === false &&
  claimCeiling.promotable === false && claimCeiling.verified_sold_event === false &&
  claimCeiling.hammer_price_confirmed === false && claimCeiling.current_price_eligible === false &&
  claimCeiling.liquidity_eligible === false && protectedHold(claimCeiling), 'CLAIM_CEILING_REFERENCE_ONLY');
assert(same(claimCeiling.allowed_claims, contract.claim_ceiling.allowed) && same(claimCeiling.forbidden_claims, contract.claim_ceiling.forbidden), 'CLAIM_CEILING_CONTRACT');

assert(outputManifest.id === 'kidults-state-department-camera-evidence-manifest-v1' &&
  outputManifest.state === 'CONTROL_ONLY_REFERENCE_REPLAY' && same(outputManifest.platform_principles, principles), 'MANIFEST_ID_STATE');
assert(outputManifest.source_binding?.source_projection_sha256 === observation.projection_sha256, 'MANIFEST_SOURCE_BINDING');
const results = outputManifest.results;
assert(results?.bounded_primary_source_fact_projections_validated === 1 &&
  results?.committed_official_source_reference_projections_verified === 1 &&
  results?.reference_projection_records_retained === 1 &&
  results?.machine_proven_acquisition_receipts === 0 &&
  results?.auction_result_reference_evidence_admitted === 0 &&
  results?.market_event_references_created === 0 &&
  results?.empirical_evidence_admitted === 0 && results?.empirical_market_events_created === 0 &&
  results?.promotable === false && results?.generic_market_events_admitted === 0 &&
  results?.generic_market_router_rejection_verified === true && results?.generic_admitted_wrapper_bypass_rejection_verified === true &&
  results?.raw_live_source_snapshot_verified === false, 'MANIFEST_REFERENCE_REPLAY_TRUTH');
for (const key of ['verified_sold_events_created','top_16_source_adapters_activated','top_16_evidence_admitted','current_192_missions_closed','confirmed_hammer_prices_created','current_prices_created','liquidity_measures_created','snapshot_candidates_created','track_b_input_pairs_created']) {
  assert(results?.[key] === 0, `MANIFEST_PROTECTED_ZERO:${key}`);
}
assert(protectedHold(outputManifest), 'MANIFEST_PROTECTED_GATES');

assert(registry.status === 'VERIFIED_PASS' && registry.implementation_state?.committed_official_source_reference_projections_verified === 1 &&
  registry.implementation_state?.reference_projection_records_retained === 1 &&
  registry.implementation_state?.machine_proven_acquisition_receipts === 0 &&
  registry.implementation_state?.auction_result_reference_evidence_admitted === 0 &&
  registry.implementation_state?.market_event_references_created === 0 &&
  registry.implementation_state?.empirical_evidence_admitted === 0 &&
  registry.implementation_state?.empirical_market_events_created === 0 &&
  registry.implementation_state?.promotable === false, 'REGISTRY_REFERENCE_REPLAY_TRUTH');
assert(registry.truth_boundary?.machine_proven_acquisition_receipts === 0 &&
  registry.truth_boundary?.empirical_evidence_admitted === 0 &&
  registry.truth_boundary?.empirical_market_events_created === 0 && registry.truth_boundary?.promotable === false &&
  registry.truth_boundary?.raw_live_source_snapshot_verified === false && protectedHold(registry.truth_boundary), 'REGISTRY_TRUTH_BOUNDARY');
assert(top16.implementation_state?.source_specific_adapters_activated === 0 &&
  top16.implementation_state?.empirical_market_events_admitted === 0, 'TOP16_ACTIVATION_INHERITANCE');

const workflow = read(contract.authoritative_inputs.workflow);
for (const marker of [
  'workflow_dispatch:', 'schedule:', 'push:', 'pull_request:', "cron: '23 */4 * * *'",
  'group: kidults-asi-state-department-camera-evidence-v1-${{ github.event_name }}-${{ github.sha }}',
  'contents: read', 'persist-credentials: false',
  'scripts/kidults/source-intelligence/build-asi-state-department-camera-evidence-v1.mjs',
  'scripts/kidults/source-intelligence/validate-asi-state-department-camera-evidence-v1.mjs',
]) assert(workflow.includes(marker), `WORKFLOW_MARKER:${marker}`);
assert(!/curl\s|wget\s|gh api|online-auction\.state\.gov\/en-US\/Auction\/Lot/.test(workflow), 'WORKFLOW_TARGET_NETWORK_ACCESS_FORBIDDEN');
for (const step of contract.required_workflow_mutation_steps) assert(workflow.includes(`- name: ${step}`), `WORKFLOW_MUTATION_STEP:${step}`);

function truthErrors(bundle) {
  const errors = [];
  if (bundle.evidence.admitted_evidence_count !== 0 || bundle.evidence.empirical_evidence_admitted !== 0) errors.push('COMMITTED_REFERENCE_FALSE_EVIDENCE_ADMISSION');
  if (bundle.market.admitted_market_event_references !== 0 || bundle.market.empirical_market_events_created !== 0) errors.push('COMMITTED_REFERENCE_FALSE_MARKET_EVENT_ADMISSION');
  if (bundle.manifest.results.machine_proven_acquisition_receipts !== 0) errors.push('FABRICATED_ACQUISITION_RECEIPT');
  if (bundle.manifest.results.promotable !== false || bundle.evidence.promotable !== false || bundle.market.promotable !== false) errors.push('COMMITTED_REFERENCE_FALSE_PROMOTION');
  if (bundle.evidence.retained_reference_record_count !== 1 || bundle.market.retained_reference_event_count !== 1) errors.push('REFERENCE_RETENTION_CARDINALITY');
  return errors;
}
const pristineBundle = { evidence: evidenceLedger, market: marketEventLedger, manifest: outputManifest };
assert(truthErrors(pristineBundle).length === 0, 'REFERENCE_TRUTH_PRISTINE');
const mutations = [
  ['false-evidence-admission', (b) => { b.evidence.admitted_evidence_count = 1; }, 'COMMITTED_REFERENCE_FALSE_EVIDENCE_ADMISSION'],
  ['false-market-event-admission', (b) => { b.market.admitted_market_event_references = 1; }, 'COMMITTED_REFERENCE_FALSE_MARKET_EVENT_ADMISSION'],
  ['fabricated-acquisition-receipt', (b) => { b.manifest.results.machine_proven_acquisition_receipts = 1; }, 'FABRICATED_ACQUISITION_RECEIPT'],
  ['false-promotable', (b) => { b.manifest.results.promotable = true; }, 'COMMITTED_REFERENCE_FALSE_PROMOTION'],
];
for (const [name, mutate, expected] of mutations) {
  const copy = structuredClone(pristineBundle);
  mutate(copy);
  assert(truthErrors(copy).includes(expected), `REFERENCE_TRUTH_MUTATION_ESCAPED:${name}`);
}

console.log(JSON.stringify({
  id: 'kidults-state-department-camera-evidence-validation-v1', version: '1.0.0',
  state: 'CONTROL_ONLY_REFERENCE_REPLAY',
  source_id: reference.source_id,
  source_projection_sha256: observation.projection_sha256,
  reference_record_id: reference.reference_record_id,
  reference_event_id: event.market_event_id,
  deterministic_rebuild_verified: 1,
  adapter_mutations_rejected: testReceipt.negative_mutations_rejected,
  reference_truth_mutations_rejected: mutations.length,
  market_event_schema_validated: 1,
  committed_official_source_reference_projections_verified: 1,
  reference_projection_records_retained: 1,
  machine_proven_acquisition_receipts: 0,
  auction_result_reference_evidence_admitted: 0,
  market_event_references_created: 0,
  empirical_evidence_admitted: 0,
  empirical_market_events_created: 0,
  generic_market_events_admitted: 0,
  generic_market_event_rejection_verified: 1,
  generic_admitted_wrapper_bypass_rejection_verified: 1,
  verified_sold_events_created: 0,
  current_192_missions_closed: 0,
  top_16_source_adapters_activated: 0,
  top_16_evidence_admitted: 0,
  current_prices_created: 0,
  liquidity_measures_created: 0,
  promotable: false,
  public_release: 'HOLD', production: 'HOLD', g5: 'HOLD'
}, null, 2));
