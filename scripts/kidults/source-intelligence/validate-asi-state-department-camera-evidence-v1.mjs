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
const coverageContract = json('coordination/kidults/source-intelligence/asi-requirement-adapter-coverage-contract-v1.json');
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
assert(observation.state === 'VERIFIED_PASS' && observation.public_release === 'HOLD' && observation.production === 'HOLD' && observation.g5 === 'HOLD', 'OBSERVATION_STATE_BOUNDARY');
assert(Number.isFinite(Date.parse(observation.rights?.review_due_at)) && Date.parse(observation.rights.review_due_at) > Date.now(),
  'OBSERVATION_RIGHTS_REVIEW_EXPIRED');
assert(observation.semantic_boundary.admissible_evidence_class === 'AUCTION_RESULT_REFERENCE' &&
  observation.semantic_boundary.verified_sold_event === false && observation.semantic_boundary.hammer_price_confirmed === false &&
  observation.semantic_boundary.settlement_confirmed === false && observation.semantic_boundary.current_price === false &&
  observation.semantic_boundary.liquidity_or_time_to_sale === false, 'OBSERVATION_SEMANTIC_BOUNDARY');
assert(testReceipt.state === 'VERIFIED_PASS' &&
  testReceipt.negative_mutations_rejected === contract.required_adapter_mutation_cases.length &&
  same(testReceipt.mutation_results?.map((result) => result.name), contract.required_adapter_mutation_cases) &&
  testReceipt.source_projection_sha256 === observation.projection_sha256 &&
  testReceipt.adapter_result?.decision_state === 'NORMALIZED_REFERENCE_READY_FOR_ADMISSION_GATE' &&
  testReceipt.adapter_result?.normalized_reference?.evidence_class === 'AUCTION_RESULT_REFERENCE' &&
  testReceipt.adapter_result?.normalized_reference?.price_type === 'BID' &&
  testReceipt.adapter_result?.normalized_reference?.verified_sold_event === false &&
  testReceipt.evidence_admitted_by_parser === 0 && testReceipt.market_events_created_by_parser === 0, 'TEST_RECEIPT');

const adapterRerun = spawnSync(process.execPath, [contract.authoritative_inputs.test, observationPath, contractPath], {
  cwd: root,
  env: process.env,
  encoding: 'utf8',
});
assert(adapterRerun.status === 0, `ADAPTER_RERUN_FAILED:${adapterRerun.stderr || adapterRerun.stdout}`);
let adapterRerunReceipt;
try { adapterRerunReceipt = JSON.parse(adapterRerun.stdout); } catch { fail('ADAPTER_RERUN_RECEIPT_INVALID_JSON'); }
assert(same(adapterRerunReceipt, testReceipt), 'ADAPTER_RERUN_RECEIPT_MISMATCH');

const expectedDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-state-department-camera-evidence-expected-'));
try {
  const rebuilt = spawnSync(process.execPath, [
    'scripts/kidults/source-intelligence/build-asi-state-department-camera-evidence-v1.mjs',
    observationPath, contractPath, adapterTestReceiptPath, expectedDir,
  ], { cwd: root, encoding: 'utf8' });
  assert(rebuilt.status === 0, `EXPECTED_REBUILD_FAILED:${rebuilt.stderr || rebuilt.stdout}`);
  for (const name of required) assert(read(file(name)) === read(path.join(expectedDir, name)), `OUTPUT_REBUILD_MISMATCH:${name}`);
} finally {
  fs.rmSync(expectedDir, { recursive: true, force: true });
}

assert(evidenceLedger.id === 'kidults-state-department-camera-evidence-ledger-v1' && evidenceLedger.version === '1.0.0' &&
  evidenceLedger.state === 'VERIFIED_PASS' && same(evidenceLedger.platform_principles, principles), 'EVIDENCE_LEDGER_ID_STATE');
assert(evidenceLedger.admitted_evidence_count === 1 && evidenceLedger.auction_result_reference_count === 1 &&
  evidenceLedger.verified_sold_event_count === 0 && evidenceLedger.records?.length === 1 &&
  evidenceLedger.top_16_evidence_admitted === 0, 'EVIDENCE_LEDGER_COUNTS');
const evidence = evidenceLedger.records[0];
assert(evidence.admission_state === 'ADMITTED_REFERENCE_ONLY_UNVERIFIED_RAW_SOURCE_SNAPSHOT' &&
  evidence.evidence_class === 'OBSERVED_PRIMARY_SOURCE_AUCTION_RESULT_REFERENCE', 'EVIDENCE_ADMISSION_CLASS');
assert(evidence.source_id === 'us-state-department-online-auction' && evidence.source_owner_id === 'us-department-of-state' &&
  evidence.source_owner_verified === true && evidence.factual_origin_id === 'us-department-of-state-online-auction' &&
  evidence.factual_origin_verified === true, 'EVIDENCE_OWNER_ORIGIN');
assert(evidence.scope_id === 'cameras_lenses' && evidence.legacy_scope_id === 'scope-cameras-lenses' &&
  evidence.domain_id === 'technology_cameras' &&
  evidence.event_state === 'SOLD' && evidence.price_observation?.price_type === 'BID' &&
  evidence.camera_quantity === 2 && evidence.lot_quantity === 1 &&
  evidence.price_observation?.amount === 2110 && evidence.price_observation?.currency === 'QAR' &&
  evidence.price_observation?.bid_count === 101, 'EVIDENCE_FACTS');
assert(evidence.rights?.collect === 'ALLOW' && evidence.rights?.store === 'ALLOW' && evidence.rights?.transform === 'ALLOW' &&
  evidence.rights?.display === 'UNKNOWN' && evidence.rights?.redistribute === 'UNKNOWN' && evidence.rights?.sell === 'UNKNOWN' &&
  evidence.rights?.legal_conclusion_asserted === false && evidence.rights?.independent_legal_review_complete === false &&
  evidence.rights?.review_due_at === observation.rights.review_due_at, 'EVIDENCE_RIGHTS');
assert(evidence.verified_sold_event === false && evidence.hammer_price_confirmed === false &&
  evidence.settlement_confirmed === false && evidence.current_price_eligible === false && evidence.liquidity_eligible === false &&
  evidence.collector_market_representativeness_verified === false && evidence.customer_claim_authorized === false, 'EVIDENCE_CLAIM_CEILING');
assert(evidence.reference_only === true && evidence.signal_eligible === false && evidence.index_eligible === false &&
  evidence.current_192_mission_id === null &&
  evidence.current_192_join_state === 'OUTSIDE_CURRENT_192_REGION_AND_EVIDENCE_CLASS_GRAIN_FALLBACK_REFERENCE_ONLY' &&
  evidence.provenance?.raw_live_source_snapshot_verified === false &&
  evidence.provenance?.lineage_digest_role === 'NORMALIZED_SOURCE_PROJECTION_DIGEST_NOT_RAW_SOURCE_PAYLOAD', 'EVIDENCE_REFERENCE_ROUTING');
assert(same(evidence.claim_ceiling, contract.claim_ceiling), 'EVIDENCE_CONTRACT_CLAIM_CEILING');
assert(protectedHold(evidenceLedger) && protectedHold(evidence), 'EVIDENCE_PROTECTED_GATES');

assert(marketEventLedger.id === 'kidults-state-department-camera-market-event-ledger-v1' &&
  marketEventLedger.state === 'VERIFIED_PASS' && marketEventLedger.admitted_market_event_references === 1 &&
  marketEventLedger.generic_market_events_admitted === 0 && marketEventLedger.reference_only === true &&
  marketEventLedger.signal_eligible === false && marketEventLedger.index_eligible === false &&
  marketEventLedger.raw_live_source_snapshot_verified === false &&
  marketEventLedger.lineage_raw_digest_role === 'NORMALIZED_SOURCE_PROJECTION_DIGEST_NOT_RAW_SOURCE_PAYLOAD' &&
  marketEventLedger.verified_sold_events === 0 && marketEventLedger.current_price_events === 0 &&
  marketEventLedger.liquidity_events === 0 && marketEventLedger.reference_events?.length === 1, 'MARKET_EVENT_LEDGER');
const event = marketEventLedger.reference_events[0];
const ajv = new Ajv2020({ allErrors: true, strict: true, strictTypes: false, strictRequired: false });
addFormats(ajv);
const validateMarketEvent = ajv.compile(marketEventSchema);
assert(validateMarketEvent(event), `MARKET_EVENT_SCHEMA:${ajv.errorsText(validateMarketEvent.errors)}`);
assert(event.evidence_class === 'AUCTION_RESULT_REFERENCE' && event.event_state === 'SOLD' &&
  event.quantity === 1 && event.price?.price_type === 'BID' && event.price?.amount === 2110 && event.price?.currency === 'QAR', 'MARKET_EVENT_CLASS_PRICE');
assert(event.lineage?.evidence_id === evidence.evidence_id && event.lineage?.raw_digest === observation.projection_sha256 &&
  /^sha256:[a-f0-9]{64}$/.test(event.lineage?.normalized_digest || ''), 'MARKET_EVENT_LINEAGE');
assert(event.rights?.collect === 'ALLOW' && event.rights?.store === 'ALLOW' && event.rights?.transform === 'ALLOW' &&
  event.rights?.field_bindings?.every((binding) => binding.output_class === 'INTERNAL_ANALYSIS' && binding.admission_state === 'ALLOW'), 'MARKET_EVENT_RIGHTS');
assert(event.source_updated_at === null && event.freshness?.state === 'NOT_VERIFIED' && event.freshness?.ttl_seconds === null &&
  event.freshness?.stale_reason === 'HISTORICAL_EVENT_OBSERVED_LATER_WITHOUT_VERIFIED_SOURCE_UPDATE_TIMESTAMP_OR_IMMUTABLE_RAW_CAPTURE' &&
  event.missingness?.imputation_policy === 'NONE', 'MARKET_EVENT_FRESHNESS_MISSINGNESS');
const genericAdmissionErrors = marketAdmissionErrors(event);
const genericCanonicalization = canonicalizeMarketEvent(event);
const genericSignals = computeMarketSignals([genericCanonicalization]);
const forgedGenericWrapperSignals = computeMarketSignals([{...genericCanonicalization, admitted: true, admission_errors: []}]);
assert(genericAdmissionErrors.includes('REFERENCE_ONLY_EVIDENCE_CLASS_NOT_GENERIC_ADMISSIBLE') &&
  genericCanonicalization.admitted === false &&
  genericCanonicalization.admission_errors.includes('REFERENCE_ONLY_EVIDENCE_CLASS_NOT_GENERIC_ADMISSIBLE') &&
  genericSignals.unique_event_count === 0 && genericSignals.sold_event_count === 0 &&
  genericSignals.transaction_activity_observed === 0 && forgedGenericWrapperSignals.unique_event_count === 0 &&
  forgedGenericWrapperSignals.sold_event_count === 0 && forgedGenericWrapperSignals.transaction_activity_observed === 0,
  'REFERENCE_ONLY_EVENT_GENERIC_ROUTER_REJECTION');
assert(protectedHold(marketEventLedger), 'MARKET_EVENT_LEDGER_PROTECTED_GATES');

assert(claimCeiling.id === 'kidults-state-department-camera-claim-ceiling-receipt-v1' && claimCeiling.state === 'VERIFIED_PASS', 'CLAIM_CEILING_ID_STATE');
assert(claimCeiling.evidence_id === evidence.evidence_id && claimCeiling.market_event_id === event.market_event_id &&
  claimCeiling.evidence_class === 'AUCTION_RESULT_REFERENCE' && claimCeiling.price_type === 'BID', 'CLAIM_CEILING_BINDING');
assert(same(claimCeiling.allowed_claims, contract.claim_ceiling.allowed) &&
  same(claimCeiling.forbidden_claims, contract.claim_ceiling.forbidden), 'CLAIM_CEILING_CONTRACT');
assert(claimCeiling.verified_sold_event === false && claimCeiling.hammer_price_confirmed === false &&
  claimCeiling.settlement_confirmed === false && claimCeiling.current_price_eligible === false &&
  claimCeiling.liquidity_eligible === false && claimCeiling.collector_market_representativeness_verified === false, 'CLAIM_CEILING_PROMOTION');
assert(protectedHold(claimCeiling), 'CLAIM_CEILING_PROTECTED_GATES');

assert(outputManifest.id === 'kidults-state-department-camera-evidence-manifest-v1' && outputManifest.state === 'VERIFIED_PASS' &&
  same(outputManifest.platform_principles, principles), 'MANIFEST_ID_STATE');
assert(outputManifest.source_binding?.source_projection_sha256 === observation.projection_sha256 &&
  outputManifest.source_binding?.source_owner_id === 'us-department-of-state' &&
  outputManifest.source_binding?.factual_origin_id === 'us-department-of-state-online-auction', 'MANIFEST_SOURCE_BINDING');
const results = outputManifest.results;
assert(results?.bounded_primary_source_fact_projections_validated === 1 && results?.exact_projection_reference_validators_active === 1 &&
  results?.fallback_live_adapters_activated === 0 &&
  results?.field_purpose_rights_preflight_pass_sources === 1 && results?.auction_result_reference_evidence_admitted === 1 &&
  results?.market_event_references_created === 1 && results?.generic_market_events_admitted === 0 &&
  results?.generic_market_router_rejection_verified === true &&
  results?.generic_admitted_wrapper_bypass_rejection_verified === true &&
  results?.reference_signal_eligible === false && results?.reference_index_eligible === false &&
  results?.raw_live_source_snapshot_verified === false && results?.source_updated_at_verified === false &&
  results?.historical_event_freshness_state === 'NOT_VERIFIED', 'MANIFEST_POSITIVE_COUNTS');
for (const key of ['verified_sold_events_created', 'top_16_source_adapters_activated', 'top_16_evidence_admitted',
  'current_192_missions_closed', 'confirmed_hammer_prices_created', 'current_prices_created', 'liquidity_measures_created', 'snapshot_candidates_created',
  'track_b_input_pairs_created']) assert(results?.[key] === 0, `MANIFEST_FALSE_PROMOTION:${key}`);
assert(outputManifest.output_files?.length === 3, 'MANIFEST_OUTPUT_FILE_COUNT');
for (const output of outputManifest.output_files) {
  const content = read(file(output.name));
  assert(required.includes(output.name) && output.name !== required[3] && output.sha256 === hash(content) &&
    output.bytes === Buffer.byteLength(content), `MANIFEST_OUTPUT_DIGEST:${output.name}`);
}
for (const effect of ['autonomous_effect', 'global_effect', 'irreplaceable_value_effect', 'transparency_effect']) {
  assert(['POSITIVE', 'NEUTRAL_WITH_EVIDENCE', 'NEGATIVE_WITH_APPROVED_EXCEPTION', 'UNKNOWN'].includes(outputManifest[effect]),
    `MANIFEST_EFFECT_STATE:${effect}`);
}
assert(outputManifest.global_effect === 'NEUTRAL_WITH_EVIDENCE' && protectedHold(outputManifest), 'MANIFEST_EFFECT_AND_PROTECTED_GATES');

assert(top16.implementation_state?.portfolio_source_specific_adapters_implemented === 16 &&
  top16.implementation_state?.portfolio_source_specific_adapters_pending === 0 &&
  top16.implementation_state?.source_specific_adapters_activated === 0 &&
  top16.implementation_state?.empirical_market_events_admitted === 0 &&
  top16.truth_boundary?.evidence_admitted === 0 && top16.truth_boundary?.market_events_created === 0, 'TOP16_PORTFOLIO_BOUNDARY');
assert(coverageContract.expected_current_main_baseline?.source_specific_adapters_activated === 0 &&
  coverageContract.expected_current_main_baseline?.evidence_admitted === 0 &&
  coverageContract.expected_current_main_baseline?.market_events_created === 0, 'COVERAGE_BASELINE_BOUNDARY');

assert(registry.id === 'kidults-asi-state-department-camera-evidence-registry-v1' && registry.status === 'VERIFIED_PASS' &&
  same(registry.platform_principles, principles), 'REGISTRY_ID_STATE');
assert(registry.implementation_state?.fallback_source_adapters_implemented === 1 &&
  registry.implementation_state?.bounded_primary_source_fact_projections_validated === 1 &&
  registry.implementation_state?.exact_projection_reference_validators_active === 1 &&
  registry.implementation_state?.fallback_live_adapters_activated === 0 &&
  registry.implementation_state?.auction_result_reference_evidence_admitted === 1 &&
  registry.implementation_state?.market_event_references_created === 1 &&
  registry.implementation_state?.verified_sold_events_created === 0 &&
  registry.implementation_state?.top_16_source_adapters_activated === 0 &&
  registry.implementation_state?.top_16_evidence_admitted === 0 &&
  registry.implementation_state?.current_192_missions_closed === 0, 'REGISTRY_COUNTS');
assert(registry.automatic_execution?.workflow_dispatch === true && registry.automatic_execution?.main_push === true &&
  registry.automatic_execution?.pull_request === true && registry.automatic_execution?.schedule === '23 */4 * * *' &&
  registry.automatic_execution?.manual_only_normal_activation === false, 'REGISTRY_AUTOMATIC_EXECUTION');
assert(registry.truth_boundary?.registered_top_16_source_profile === false &&
  registry.truth_boundary?.raw_live_source_snapshot_verified === false &&
  registry.truth_boundary?.generic_market_event_admitted === false &&
  registry.truth_boundary?.generic_market_router_rejection_verified === true &&
  registry.truth_boundary?.generic_admitted_wrapper_bypass_rejection_verified === true && registry.truth_boundary?.signal_eligible === false &&
  registry.truth_boundary?.index_eligible === false && registry.truth_boundary?.source_updated_at_verified === false &&
  registry.truth_boundary?.historical_event_freshness_state === 'NOT_VERIFIED' &&
  registry.truth_boundary?.current_192_mission_id === null &&
  registry.truth_boundary?.current_192_join_state === 'OUTSIDE_CURRENT_192_REGION_AND_EVIDENCE_CLASS_GRAIN_FALLBACK_REFERENCE_ONLY' &&
  registry.truth_boundary?.verified_sold_event_created === false && registry.truth_boundary?.current_price_created === false &&
  registry.truth_boundary?.liquidity_created === false && registry.truth_boundary?.public_release === 'HOLD' &&
  registry.truth_boundary?.production === 'HOLD' && registry.truth_boundary?.g5 === 'HOLD', 'REGISTRY_TRUTH_BOUNDARY');
for (const effect of ['autonomous_effect', 'global_effect', 'irreplaceable_value_effect', 'transparency_effect']) {
  assert(['POSITIVE', 'NEUTRAL_WITH_EVIDENCE', 'NEGATIVE_WITH_APPROVED_EXCEPTION', 'UNKNOWN'].includes(registry.effects?.[effect]),
    `REGISTRY_EFFECT_STATE:${effect}`);
}
for (const asset of Object.values(registry.registered_assets)) assert(fs.existsSync(asset), `REGISTRY_ASSET_MISSING:${asset}`);

const adapterSource = read(contract.authoritative_inputs.adapter);
for (const marker of [
  "admissible_evidence_class !== 'AUCTION_RESULT_REFERENCE'",
  "price_type: 'BID'",
  'verified_sold_event: false',
  'current_price_eligible: false',
  'liquidity_eligible: false',
  'PROJECTION_HASH_MISMATCH',
  'SOURCE_OWNER_OR_FACTUAL_ORIGIN_INVALID',
  'RIGHTS_REVIEW_EXPIRED',
  'OBSERVATION_EVIDENCE_REFS_INVALID',
]) assert(adapterSource.includes(marker), `ADAPTER_MARKER:${marker}`);
const genericMarketRouter = read(contract.authoritative_inputs.generic_market_router);
const genericMarketRouterValidator = read(contract.authoritative_inputs.generic_market_router_validator);
assert(genericMarketRouter.includes("event.evidence_class==='AUCTION_RESULT_REFERENCE'") &&
  genericMarketRouter.includes('REFERENCE_ONLY_EVIDENCE_CLASS_NOT_GENERIC_ADMISSIBLE'),
  'GENERIC_MARKET_ROUTER_REFERENCE_REJECTION_MARKER');
assert(genericMarketRouterValidator.includes('reference_only_evidence_generic_admission_rejected') &&
  genericMarketRouterValidator.includes('forged_admitted_wrapper_revalidated_and_rejected') &&
  genericMarketRouterValidator.includes('REFERENCE_ONLY_EVIDENCE_CLASS_NOT_GENERIC_ADMISSIBLE'),
  'GENERIC_MARKET_ROUTER_REGRESSION_MARKER');
const workflow = read(contract.authoritative_inputs.workflow);
for (const marker of [
  'workflow_dispatch:', 'schedule:', 'push:', 'pull_request:', "cron: '23 */4 * * *'",
  'group: kidults-asi-state-department-camera-evidence-v1-${{ github.event_name }}-${{ github.sha }}',
  'contents: read', 'persist-credentials: false', 'validate-ai-agent-operating-rules-v1.mjs --receipt',
  'actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02',
]) assert(workflow.includes(marker), `WORKFLOW_MARKER:${marker}`);
assert(!workflow.includes('workflow_run:'), 'WORKFLOW_STATIC_VALIDATOR_MUST_NOT_CONSUME_UPSTREAM_ARTIFACT');
for (const step of contract.required_workflow_mutation_steps) {
  assert(workflow.includes(`- name: ${step}`), `WORKFLOW_MUTATION_STEP:${step}`);
}
assert(!/curl\s|wget\s|gh api|online-auction\.state\.gov\/en-US\/Auction\/Lot/.test(workflow), 'WORKFLOW_TARGET_NETWORK_ACCESS_FORBIDDEN');
const documentation = read(contract.authoritative_inputs.documentation);
for (const marker of ['Auction Result Reference', 'Verified Sold Event = 0', 'Top 16', 'Public / Production / G5 = HOLD']) {
  assert(documentation.includes(marker), `DOCUMENTATION_MARKER:${marker}`);
}

console.log(JSON.stringify({
  id: 'kidults-state-department-camera-evidence-validation-v1',
  version: '1.0.0',
  state: 'VERIFIED_PASS',
  source_id: evidence.source_id,
  source_projection_sha256: observation.projection_sha256,
  evidence_id: evidence.evidence_id,
  market_event_id: event.market_event_id,
  deterministic_rebuild_verified: 1,
  adapter_mutations_rejected: testReceipt.negative_mutations_rejected,
  market_event_schema_validated: 1,
  reference_admission_gate_pass: 1,
  generic_market_event_admission_gate_pass: genericCanonicalization.admitted ? 1 : 0,
  generic_market_event_rejection_verified: 1,
  generic_admitted_wrapper_bypass_rejection_verified: 1,
  generic_market_event_admission_errors: genericCanonicalization.admission_errors,
  auction_result_reference_evidence_admitted: 1,
  market_event_references_created: 1,
  generic_market_events_admitted: 0,
  verified_sold_events_created: 0,
  current_192_missions_closed: 0,
  top_16_source_adapters_activated: 0,
  top_16_evidence_admitted: 0,
  current_prices_created: 0,
  liquidity_measures_created: 0,
  public_release: 'HOLD',
  production: 'HOLD',
  g5: 'HOLD'
}, null, 2));
