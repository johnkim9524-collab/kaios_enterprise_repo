#!/usr/bin/env node
import crypto from 'node:crypto';
import {
  fs,
  path,
  readJson,
  stableJson,
  hash,
  uniq,
  countBy,
  parsePsv,
  makeWriter,
} from './lib/asi-autonomous-resolution-common-v1.mjs';
import { buildPurposeRightsIndex, RIGHTS_CLEAR } from './lib/source-purpose-rights-gate-v1.mjs';

const [queuePath, manifestPath, receiptPath, artifactBindingPath, contractPath, purposeRightsPreflightPath, outputDir] = process.argv.slice(2);
if (![queuePath, manifestPath, receiptPath, artifactBindingPath, contractPath, purposeRightsPreflightPath, outputDir].every(Boolean)) {
  throw new Error('REQUIREMENT_ADAPTER_COVERAGE_ARGUMENTS_REQUIRED');
}

const fail = (message) => { throw new Error(message); };
const assert = (condition, message) => { if (!condition) fail(message); };
const rightsGateRule = 'RIGHTS_CLEAR_FOR_PURPOSE_REQUIRED_BEFORE_ADAPTER_BACKLOG_OR_REPLACEMENT_PROFILE_SELECTION';
// The first rights-gated consumer must still be able to audit the last
// successful main ARL artifact. That artifact predates the purpose-rights
// fields, so its contract digest is accepted only together with its explicit
// legacy queue state below; arbitrary contract drift remains fail-closed.
const legacyResolutionContractDigest = 'sha256:cd0b8f3538d7476c3bba15092caa2bd23c5178b93e136bdadbfe4d41dfd71912';
const same = (left, right) => stableJson(left) === stableJson(right);
const sorted = (values) => [...values].sort((a, b) => String(a).localeCompare(String(b)));
const setEqual = (left, right) => same(uniq(left), uniq(right));
const shaId = (prefix, value) => `${prefix}::${crypto.createHash('sha256').update(stableJson(value)).digest('hex')}`;
const shaPattern = /^[a-f0-9]{40}$/;
const sha256Pattern = /^sha256:[a-f0-9]{64}$/;
const principles = ['AUTONOMOUS', 'GLOBAL', 'IRREPLACEABLE_VALUE', 'TRANSPARENT'];

const [queueText, manifestText, receiptText, artifactBindingText, contractText] = await Promise.all([
  fs.readFile(queuePath, 'utf8'),
  fs.readFile(manifestPath, 'utf8'),
  fs.readFile(receiptPath, 'utf8'),
  fs.readFile(artifactBindingPath, 'utf8'),
  fs.readFile(contractPath, 'utf8'),
]);
const queue = JSON.parse(queueText);
const resolutionManifest = JSON.parse(manifestText);
const resolutionReceipt = JSON.parse(receiptText);
const artifactBinding = JSON.parse(artifactBindingText);
const contract = JSON.parse(contractText);

assert(contract.id === 'kidults-asi-requirement-adapter-coverage-contract-v1' && contract.version === '1.0.0', 'COVERAGE_CONTRACT_ID_VERSION');
assert(contract.status === 'ACTIVE_MANDATORY_FAIL_CLOSED_AFTER_MAIN_MERGE', 'COVERAGE_CONTRACT_STATUS');
assert(same(contract.platform_principles, principles), 'COVERAGE_CONTRACT_PRINCIPLES');
assert(contract.canonical_grain?.unmerged_v2_adapter_requirement_id_is_authoritative === false, 'UNMERGED_V2_ID_AUTHORITY_FORBIDDEN');
assert(contract.canonical_grain?.unmerged_v2_adapter_requirement_id_may_be_synthesized === false, 'UNMERGED_V2_ID_SYNTHESIS_FORBIDDEN');
assert(contract.coverage_policy?.registered_claim_is_implemented_claim === false, 'REGISTERED_CLAIM_INHERITANCE_FORBIDDEN');
assert(contract.coverage_policy?.context_classifier_is_claim_parser === false, 'CONTEXT_AS_PARSER_FORBIDDEN');
assert(contract.truth_boundary?.software_lineage_only === true, 'SOFTWARE_LINEAGE_BOUNDARY_REQUIRED');
assert(contract.truth_boundary?.live_source_request_executed === false && contract.truth_boundary?.provider_contact_executed === false, 'LIVE_OR_PROVIDER_ACTION_FORBIDDEN');
assert(contract.truth_boundary?.evidence_admitted === 0 && contract.truth_boundary?.market_events_created === 0, 'EMPIRICAL_PROMOTION_FORBIDDEN');
assert(contract.truth_boundary?.public_release === 'HOLD' && contract.truth_boundary?.production === 'HOLD' && contract.truth_boundary?.g5 === 'HOLD', 'RELEASE_BOUNDARY_INVALID');

const input = contract.authoritative_inputs;
const staticEntries = [
  ['resolutionContract', input.resolution_contract],
  ['runtimeContract', input.runtime_contract],
  ['frontier', input.source_frontier],
  ['crosswalk', input.scope_crosswalk],
  ['bonhamsContract', input.bonhams_contract],
  ['bonhamsRegistry', input.bonhams_registry],
  ['wave2Contract', input.wave2_contract],
  ['wave2Registry', input.wave2_registry],
  ['wave3Contract', input.wave3_contract],
  ['wave3Registry', input.wave3_registry],
  ['wave4Contract', input.wave4_contract],
  ['wave4Registry', input.wave4_registry],
  ['purposeRightsPreflight', input.purpose_rights_preflight],
];
for (const [name, file] of staticEntries) {
  assert(typeof file === 'string' && file.length > 0, `STATIC_INPUT_PATH_MISSING:${name}`);
}
const staticTexts = Object.fromEntries(await Promise.all(staticEntries.map(async ([name, file]) => [name, await fs.readFile(file, 'utf8')])));
const resolutionContract = JSON.parse(staticTexts.resolutionContract);
const runtimeContract = JSON.parse(staticTexts.runtimeContract);
const frontier = parsePsv(staticTexts.frontier);
const crosswalk = JSON.parse(staticTexts.crosswalk);
const bonhamsContract = JSON.parse(staticTexts.bonhamsContract);
const bonhamsRegistry = JSON.parse(staticTexts.bonhamsRegistry);
const wave2Contract = JSON.parse(staticTexts.wave2Contract);
const wave2Registry = JSON.parse(staticTexts.wave2Registry);
const wave3Contract = JSON.parse(staticTexts.wave3Contract);
const wave3Registry = JSON.parse(staticTexts.wave3Registry);
const wave4Contract = JSON.parse(staticTexts.wave4Contract);
const wave4Registry = JSON.parse(staticTexts.wave4Registry);
const purposeRightsPreflight = JSON.parse(staticTexts.purposeRightsPreflight);
const explicitPurposeRightsPreflight = JSON.parse(await fs.readFile(purposeRightsPreflightPath, 'utf8'));
assert(same(purposeRightsPreflight, explicitPurposeRightsPreflight), 'PURPOSE_RIGHTS_PREFLIGHT_BINDING_DRIFT');

assert(artifactBinding.id === 'kidults-asi-autonomous-resolution-artifact-binding-v1' && artifactBinding.version === '1.1.0', 'ARTIFACT_BINDING_ID_VERSION');
const artifactProducingEvents = new Set(['workflow_run', 'schedule', 'workflow_dispatch', 'pull_request']);
assert(artifactProducingEvents.has(artifactBinding.workflow_event), 'ARTIFACT_BINDING_WORKFLOW_EVENT');
assert(typeof artifactBinding.exact_triggering_run_bound === 'boolean', 'ARTIFACT_BINDING_EXACT_TRIGGER_TYPE');
assert(artifactBinding.exact_triggering_run_bound === (artifactBinding.workflow_event === 'workflow_run'), 'ARTIFACT_BINDING_EXACT_TRIGGER_SEMANTICS');
assert(artifactBinding.artifact_name === input.upstream_artifact_name, 'ARTIFACT_NAME_MISMATCH');
assert(Number.isInteger(artifactBinding.artifact_id) && artifactBinding.artifact_id > 0, 'ARTIFACT_ID_INVALID');
assert(artifactBinding.expired === false, 'ARTIFACT_EXPIRED');
assert(Number.isInteger(artifactBinding.workflow_run_id) && artifactBinding.workflow_run_id > 0, 'WORKFLOW_RUN_ID_INVALID');
assert(artifactBinding.workflow_name === input.upstream_workflow_name, 'WORKFLOW_NAME_MISMATCH');
assert(artifactBinding.workflow_path === input.upstream_workflow_path, 'WORKFLOW_PATH_MISMATCH');
assert(artifactBinding.expected_source_sha === artifactBinding.head_sha, 'ARTIFACT_EXPECTED_SOURCE_SHA_MISMATCH');
assert(artifactBinding.expected_head_branch === artifactBinding.head_branch, 'ARTIFACT_EXPECTED_HEAD_BRANCH_MISMATCH');
assert(shaPattern.test(artifactBinding.execution_sha), 'ARTIFACT_EXECUTION_SHA_INVALID');
const trustedMainArtifact = artifactBinding.validation_scope === 'MAIN' &&
  artifactBinding.head_branch === 'main' && artifactBinding.production_eligible === true;
const trustedPullRequestArtifact = artifactBinding.validation_scope === 'PULL_REQUEST_HEAD' &&
  artifactBinding.head_branch !== 'main' && artifactBinding.production_eligible === false &&
  artifactBinding.head_sha !== artifactBinding.consumer_sha &&
  artifactBinding.execution_sha === artifactBinding.consumer_sha;
assert(trustedMainArtifact || trustedPullRequestArtifact, 'ARTIFACT_PROVENANCE_SCOPE_INVALID');
assert(artifactBinding.status === 'completed' && artifactBinding.conclusion === 'success', 'ARTIFACT_RUN_NOT_SUCCESSFUL');
assert(shaPattern.test(artifactBinding.head_sha) && shaPattern.test(artifactBinding.consumer_sha), 'ARTIFACT_SHA_INVALID');
assert(artifactBinding.source_sha_ancestor_of_consumer === true, 'ARTIFACT_SOURCE_NOT_ANCESTOR');
assert(artifactBinding.execution_sha_ancestor_of_consumer === true, 'ARTIFACT_EXECUTION_NOT_ANCESTOR');
assert(Number.isFinite(Date.parse(artifactBinding.created_at)) && Number.isFinite(Date.parse(artifactBinding.expires_at)), 'ARTIFACT_TIME_INVALID');
assert(Date.parse(artifactBinding.expires_at) > Date.parse(artifactBinding.created_at), 'ARTIFACT_EXPIRY_INVALID');

assert(queue.id === input.replacement_queue_id && queue.version === '1.0.0', 'REPLACEMENT_QUEUE_ID_VERSION');
assert(resolutionManifest.id === input.resolution_manifest_id && resolutionManifest.version === '1.0.0', 'RESOLUTION_MANIFEST_ID_VERSION');
assert(resolutionReceipt.id === input.resolution_receipt_id && resolutionReceipt.state === 'VERIFIED_PASS', 'RESOLUTION_RECEIPT_ID_STATE');
assert(resolutionReceipt.source_sha === artifactBinding.execution_sha, 'RECEIPT_EXECUTION_SHA_MISMATCH');
assert(resolutionReceipt.manifest_digest === hash(manifestText), 'RESOLUTION_MANIFEST_DIGEST_MISMATCH');
assert(same(resolutionReceipt.results, resolutionManifest.results), 'RESOLUTION_RECEIPT_RESULTS_MISMATCH');
assert(resolutionReceipt.live_target_site_network_requests === 0 && resolutionReceipt.rights_pass_created === 0, 'RESOLUTION_RECEIPT_LIVE_OR_RIGHTS_OVERCLAIM');
assert(resolutionReceipt.evidence_admitted === 0 && resolutionReceipt.market_events_created === 0 && resolutionReceipt.snapshot_candidates_created === 0, 'RESOLUTION_RECEIPT_EMPIRICAL_OVERCLAIM');
assert(resolutionReceipt.public_release === 'HOLD' && resolutionReceipt.production === 'HOLD', 'RESOLUTION_RECEIPT_RELEASE_BOUNDARY');
assert(resolutionManifest.results?.replacement_missions === queue.mission_count, 'RESOLUTION_RESULT_MISSION_COUNT_MISMATCH');
assert(resolutionManifest.results?.replacement_missions_with_profiles === queue.missions_with_profile_candidates, 'RESOLUTION_RESULT_PROFILE_MISSION_COUNT_MISMATCH');
assert(resolutionManifest.results?.replacement_missions_without_profiles === queue.missions_without_profile_candidates, 'RESOLUTION_RESULT_PROFILE_GAP_COUNT_MISMATCH');
assert(resolutionManifest.results?.replacement_source_slots_filled === queue.filled_source_slots, 'RESOLUTION_RESULT_FILLED_SLOT_COUNT_MISMATCH');
assert(resolutionManifest.results?.unique_registered_profiles_selected === queue.unique_registered_profiles_selected, 'RESOLUTION_RESULT_SELECTED_PROFILE_COUNT_MISMATCH');
const upstreamRightsGate = resolutionManifest.results?.rights_clear_gate;
const legacyUpstreamRightsQueue = upstreamRightsGate === undefined && queue.state === 'REGISTERED_HIGH_AUTHORITY_PROFILE_REPLACEMENT_QUEUE_READY';
assert(upstreamRightsGate === undefined || upstreamRightsGate === rightsGateRule, 'RESOLUTION_RESULT_RIGHTS_GATE_MISMATCH');
if (!legacyUpstreamRightsQueue) {
  assert(resolutionManifest.results?.rights_clear_registered_profiles === queue.rights_clear_registered_profile_count, 'RESOLUTION_RESULT_RIGHTS_CLEAR_COUNT_MISMATCH');
  assert(resolutionManifest.results?.rights_hold_registered_profiles === queue.rights_hold_registered_profile_count, 'RESOLUTION_RESULT_RIGHTS_HOLD_COUNT_MISMATCH');
  assert(resolutionManifest.results?.rights_preflight_queue_items === queue.rights_preflight_queue_count, 'RESOLUTION_RESULT_RIGHTS_QUEUE_COUNT_MISMATCH');
}
const queueOutput = resolutionManifest.output_files?.find((file) => file.name === input.replacement_queue_file);
assert(queueOutput && queueOutput.sha256 === hash(queueText) && queueOutput.bytes === Buffer.byteLength(queueText), 'REPLACEMENT_QUEUE_OUTPUT_BINDING_MISMATCH');

assert(resolutionContract.id === 'kidults-asi-autonomous-resolution-layer-contract-v1' && resolutionContract.version === '1.0.0', 'RESOLUTION_CONTRACT_INVALID');
assert(runtimeContract.id === 'kidults-asi-p1-market-event-adapter-runtime-contract-v1' && runtimeContract.version === '1.0.0', 'RUNTIME_CONTRACT_INVALID');
assert(crosswalk.id === 'scope-registry-v1-to-v2-crosswalk-v1' && crosswalk.status === 'ACTIVE_CANONICAL_MIGRATION_GATE', 'SCOPE_CROSSWALK_INVALID');
const upstreamResolutionContractDigest = resolutionManifest.input_bindings?.contract?.digest;
const currentResolutionContractDigest = hash(stableJson(resolutionContract));
assert(
  upstreamResolutionContractDigest === currentResolutionContractDigest
    || (legacyUpstreamRightsQueue && upstreamResolutionContractDigest === legacyResolutionContractDigest),
  'RESOLUTION_CONTRACT_DIGEST_DRIFT'
);
assert(resolutionManifest.input_bindings?.adapter_contract?.digest === hash(stableJson(runtimeContract)), 'RUNTIME_CONTRACT_DIGEST_DRIFT');
assert(resolutionManifest.input_bindings?.frontier?.digest === hash(staticTexts.frontier), 'SOURCE_FRONTIER_DIGEST_DRIFT');
assert(resolutionManifest.input_bindings?.crosswalk?.digest === hash(stableJson(crosswalk)), 'SCOPE_CROSSWALK_DIGEST_DRIFT');
assert(resolutionManifest.input_bindings?.frontier?.records === frontier.length, 'SOURCE_FRONTIER_COUNT_DRIFT');
assert(resolutionManifest.input_bindings?.crosswalk?.records === crosswalk.records?.length, 'SCOPE_CROSSWALK_COUNT_DRIFT');
assert(resolutionManifest.input_bindings?.adapter_contract?.profiles === runtimeContract.registered_source_profiles?.length, 'RUNTIME_PROFILE_COUNT_DRIFT');

const runtimeProfiles = new Map();
for (const tuple of runtimeContract.registered_source_profiles || []) {
  assert(Array.isArray(tuple) && tuple.length === 4, 'RUNTIME_PROFILE_TUPLE_INVALID');
  const [priorityRank, sourceId, verifiedAssignmentCount, targetClaims] = tuple;
  assert(Number.isInteger(priorityRank) && priorityRank > 0, `RUNTIME_PROFILE_RANK_INVALID:${sourceId}`);
  assert(typeof sourceId === 'string' && sourceId.length > 0 && !runtimeProfiles.has(sourceId), `RUNTIME_PROFILE_SOURCE_INVALID:${sourceId}`);
  assert(Number.isInteger(verifiedAssignmentCount) && verifiedAssignmentCount > 0, `RUNTIME_PROFILE_ASSIGNMENT_COUNT_INVALID:${sourceId}`);
  assert(Array.isArray(targetClaims) && targetClaims.length > 0 && uniq(targetClaims).length === targetClaims.length, `RUNTIME_PROFILE_CLAIMS_INVALID:${sourceId}`);
  runtimeProfiles.set(sourceId, {
    priority_rank: priorityRank,
    source_id: sourceId,
    verified_assignment_count: verifiedAssignmentCount,
    registered_claims: [...targetClaims],
  });
}
const expectedSourceCount = contract.expected_current_main_baseline.registered_source_profiles;
assert(runtimeProfiles.size === expectedSourceCount, `RUNTIME_PROFILE_COUNT_INVALID:${runtimeProfiles.size}`);
assert(uniq([...runtimeProfiles.values()].map((profile) => profile.priority_rank)).length === expectedSourceCount, 'RUNTIME_PROFILE_RANK_DUPLICATE');
assert(purposeRightsPreflight.id === 'kidults-top16-empirical-activation-preflight-v1', 'PURPOSE_RIGHTS_PREFLIGHT_ID');
const purposeRightsIndex = buildPurposeRightsIndex(
  purposeRightsPreflight,
  [...runtimeProfiles.keys()],
  'CURRENT_SOLD_TRANSACTION_AND_LIQUIDITY_ACQUISITION'
);
const rightsClearRegisteredProfileCount = [...purposeRightsIndex.values()].filter((value) => value.decision === RIGHTS_CLEAR).length;
const rightsHoldRegisteredProfileCount = purposeRightsIndex.size - rightsClearRegisteredProfileCount;

const frontierBySource = new Map();
for (const record of frontier) {
  assert(typeof record.source_id === 'string' && record.source_id.length > 0, 'FRONTIER_SOURCE_ID_MISSING');
  assert(!frontierBySource.has(record.source_id), `FRONTIER_SOURCE_ID_DUPLICATE:${record.source_id}`);
  frontierBySource.set(record.source_id, record);
}
for (const sourceId of runtimeProfiles.keys()) assert(frontierBySource.has(sourceId), `RUNTIME_SOURCE_NOT_IN_FRONTIER:${sourceId}`);

const normalized = [];
const registerAdapter = ({ sourceId, rank, registeredClaims, implementedClaims, templateClaims = [], contextClaims = [], implementationState, contractFile, moduleFile, family }) => {
  const runtime = runtimeProfiles.get(sourceId);
  assert(runtime, `IMPLEMENTATION_SOURCE_NOT_REGISTERED:${sourceId}`);
  assert(!normalized.some((record) => record.source_id === sourceId), `IMPLEMENTATION_SOURCE_DUPLICATE:${sourceId}`);
  assert(rank === runtime.priority_rank, `IMPLEMENTATION_RANK_MISMATCH:${sourceId}`);
  assert(setEqual(registeredClaims, runtime.registered_claims), `IMPLEMENTATION_REGISTERED_CLAIMS_MISMATCH:${sourceId}`);
  assert(implementedClaims.every((claim) => runtime.registered_claims.includes(claim)), `IMPLEMENTED_CLAIM_NOT_REGISTERED:${sourceId}`);
  assert(templateClaims.every((claim) => runtime.registered_claims.includes(claim)), `TEMPLATE_CLAIM_NOT_REGISTERED:${sourceId}`);
  assert(typeof implementationState === 'string' && implementationState.includes('IMPLEMENTED'), `IMPLEMENTATION_STATE_INVALID:${sourceId}`);
  const adapterKind = implementedClaims.includes('LIQUIDITY_OR_TIME_TO_SALE')
    ? 'EXPOSURE_PARSER'
    : implementedClaims.includes('DATED_OBSERVED_SOLD_TRANSACTION')
      ? 'TRANSACTION_PARSER'
      : 'CONTEXT_ONLY_CLASSIFIER';
  assert(adapterKind !== 'CONTEXT_ONLY_CLASSIFIER' || (implementedClaims.length === 0 && contextClaims.length > 0), `CONTEXT_ONLY_CLASSIFICATION_INVALID:${sourceId}`);
  normalized.push({
    source_id: sourceId,
    priority_rank: rank,
    verified_assignment_count: runtime.verified_assignment_count,
    registered_claims: sorted(registeredClaims),
    implemented_claim_parsers: sorted(implementedClaims),
    unimplemented_registered_claims: sorted(registeredClaims.filter((claim) => !implementedClaims.includes(claim))),
    template_only_claims: sorted(templateClaims),
    context_only_claims: sorted(contextClaims),
    adapter_kind: adapterKind,
    adapter_implemented: true,
    implementation_state: implementationState,
    source_contract: contractFile,
    module: moduleFile,
    family,
    live_source_snapshots_verified: 0,
    field_purpose_rights_verified: false,
    adapter_activated: false,
    empirical_market_events_admitted: 0,
    public_release: 'HOLD',
    production: 'HOLD',
  });
};

assert(bonhamsContract.id === 'kidults-asi-bonhams-cars-results-adapter-contract-v1', 'BONHAMS_CONTRACT_ID');
registerAdapter({
  sourceId: bonhamsContract.source_id,
  rank: runtimeProfiles.get(bonhamsContract.source_id)?.priority_rank,
  registeredClaims: bonhamsContract.source_profile?.target_claims || [],
  implementedClaims: bonhamsContract.source_profile?.implemented_claim_parsers || [],
  templateClaims: bonhamsContract.source_profile?.template_only_claims || [],
  implementationState: bonhamsContract.source_profile?.adapter_state,
  contractFile: input.bonhams_contract,
  moduleFile: bonhamsContract.registered_assets?.source_specific_module,
  family: 'PUBLIC_AUCTION_TRANSACTION',
});
for (const [waveName, waveContract, contractFile] of [
  ['WAVE2', wave2Contract, input.wave2_contract],
  ['WAVE3', wave3Contract, input.wave3_contract],
]) {
  assert(waveContract.id === `kidults-asi-source-adapter-${waveName.toLowerCase()}-contract-v1`, `${waveName}_CONTRACT_ID`);
  for (const adapter of waveContract.source_adapters || []) {
    registerAdapter({
      sourceId: adapter.source_id,
      rank: adapter.rank,
      registeredClaims: runtimeProfiles.get(adapter.source_id)?.registered_claims || [],
      implementedClaims: adapter.implemented_claim_parsers || [],
      templateClaims: adapter.template_only_claims || [],
      implementationState: adapter.implementation_state,
      contractFile,
      moduleFile: adapter.module,
      family: 'PUBLIC_AUCTION_TRANSACTION',
    });
  }
}
assert(wave4Contract.id === 'kidults-asi-source-adapter-wave4-contract-v1', 'WAVE4_CONTRACT_ID');
for (const adapter of wave4Contract.source_adapters || []) {
  registerAdapter({
    sourceId: adapter.source_id,
    rank: adapter.rank,
    registeredClaims: adapter.registered_claims || [],
    implementedClaims: adapter.implemented_claim_parsers || [],
    contextClaims: adapter.context_only_claims || [],
    implementationState: adapter.implementation_state,
    contractFile: input.wave4_contract,
    moduleFile: wave4Contract.registered_assets?.source_adapter_module,
    family: adapter.family,
  });
}
normalized.sort((a, b) => a.priority_rank - b.priority_rank || a.source_id.localeCompare(b.source_id));
assert(normalized.length === expectedSourceCount, `NORMALIZED_SOURCE_COUNT_INVALID:${normalized.length}`);
assert(setEqual(normalized.map((record) => record.source_id), [...runtimeProfiles.keys()]), 'NORMALIZED_RUNTIME_SOURCE_SET_MISMATCH');
for (const record of normalized) {
  assert(typeof record.module === 'string' && record.module.length > 0, `ADAPTER_MODULE_PATH_MISSING:${record.source_id}`);
  await fs.access(record.module);
}

assert(bonhamsRegistry.id === 'kidults-asi-bonhams-cars-results-adapter-registry-v1', 'BONHAMS_REGISTRY_ID');
assert(wave2Registry.id === 'kidults-asi-source-adapter-wave2-registry-v1', 'WAVE2_REGISTRY_ID');
assert(wave3Registry.id === 'kidults-asi-source-adapter-wave3-registry-v1', 'WAVE3_REGISTRY_ID');
assert(wave4Registry.id === 'kidults-asi-source-adapter-wave4-registry-v1', 'WAVE4_REGISTRY_ID');
const wave4State = wave4Registry.implementation_state || {};
assert(wave4State.portfolio_source_specific_adapters_implemented === expectedSourceCount, 'WAVE4_IMPLEMENTED_SOURCE_COUNT');
assert(wave4State.portfolio_registered_source_profiles === expectedSourceCount, 'WAVE4_REGISTERED_SOURCE_COUNT');
assert(wave4State.portfolio_source_specific_adapters_pending === 0 && wave4Registry.remaining_source_adapter_backlog?.length === 0, 'WAVE4_SOFTWARE_BACKLOG_NOT_ZERO');
assert(setEqual(wave4Registry.implemented_source_ids || [], normalized.map((record) => record.source_id)), 'WAVE4_IMPLEMENTED_SOURCE_SET_MISMATCH');
assert(wave4State.live_source_snapshots_verified === 0 && wave4State.field_purpose_rights_verified_sources === 0, 'WAVE4_LIVE_OR_RIGHTS_OVERCLAIM');
assert(wave4State.source_specific_adapters_activated === 0 && wave4State.empirical_market_events_admitted === 0, 'WAVE4_ACTIVATION_OR_EVENT_OVERCLAIM');
for (const registry of [bonhamsRegistry, wave2Registry, wave3Registry, wave4Registry]) {
  const state = registry.implementation_state || {};
  assert((state.live_source_snapshots_verified ?? 0) === 0, `REGISTRY_LIVE_SNAPSHOT_OVERCLAIM:${registry.id}`);
  assert((state.field_purpose_rights_verified_sources ?? 0) === 0, `REGISTRY_RIGHTS_OVERCLAIM:${registry.id}`);
  assert((state.source_specific_adapters_activated ?? 0) === 0, `REGISTRY_ACTIVATION_OVERCLAIM:${registry.id}`);
  assert((state.empirical_market_events_admitted ?? 0) === 0, `REGISTRY_EVENT_OVERCLAIM:${registry.id}`);
}

const targetToLegacy = new Map();
for (const record of crosswalk.records || []) {
  for (const targetScopeId of record.target_scope_ids || []) {
    if (!targetToLegacy.has(targetScopeId)) targetToLegacy.set(targetScopeId, []);
    targetToLegacy.get(targetScopeId).push(record.legacy_scope_id);
  }
}
for (const [target, legacy] of targetToLegacy) targetToLegacy.set(target, uniq(legacy));
assert(targetToLegacy.size === contract.canonical_grain.expected_scope_count, `TARGET_SCOPE_COUNT_INVALID:${targetToLegacy.size}`);

const eligibleProfiles = [...runtimeProfiles.values()].map((runtime) => {
  const source = frontierBySource.get(runtime.source_id);
  return {
    ...runtime,
    collection_scope_ids: uniq(String(source.collection_scope_ids || '').split(';')),
  };
});
const claimCeilingBySource = new Map(normalized.map((record) => [record.source_id, record]));
const expectedSlots = resolutionContract.replacement_policy?.required_slots;
assert(Array.isArray(expectedSlots) && expectedSlots.length === 3, 'RESOLUTION_REQUIRED_SLOTS_INVALID');
assert(same(resolutionContract.replacement_policy?.claim_mapping, contract.claim_mapping), 'CLAIM_MAPPING_DRIFT');

const grain = contract.canonical_grain;
assert(queue.state === 'RIGHTS_GATED_REPLACEMENT_QUEUE_READY' || legacyUpstreamRightsQueue, 'REPLACEMENT_QUEUE_STATE');
assert(queue.mission_count === grain.expected_mission_count && queue.missions?.length === grain.expected_mission_count, 'REPLACEMENT_MISSION_COUNT');
assert(queue.registered_profile_is_rights_verified === false && queue.registered_profile_is_adapter_implemented === true, 'QUEUE_IMPLEMENTATION_TRUTH_BOUNDARY_CHANGED');
assert(queue.evidence_admitted === 0 && queue.public_release === 'HOLD' && queue.production === 'HOLD', 'REPLACEMENT_QUEUE_PROMOTION');
assert(uniq(queue.missions.map((mission) => mission.mission_id)).length === grain.expected_mission_count, 'MISSION_ID_DUPLICATE');
assert(uniq(queue.missions.map((mission) => mission.replacement_mission_id)).length === grain.expected_mission_count, 'REPLACEMENT_MISSION_ID_DUPLICATE');
assert(uniq(queue.missions.map((mission) => mission.market_cell_id)).length === grain.expected_unique_market_cell_count, 'MARKET_CELL_ID_DUPLICATE');

const records = [];
for (const mission of queue.missions) {
  assert(typeof mission.mission_id === 'string' && mission.mission_id === `mission::${mission.market_cell_id}`, `MISSION_ID_FORMAT:${mission.mission_id}`);
  assert(/^replacement_mission_[a-f0-9]{32}$/.test(mission.replacement_mission_id), `REPLACEMENT_MISSION_ID_FORMAT:${mission.mission_id}`);
  assert(mission.market_cell_id === `${mission.scope_id}::${mission.region}::${mission.evidence_class}`, `MARKET_CELL_ID_FORMAT:${mission.mission_id}`);
  assert(contract.claim_mapping[mission.evidence_class] === mission.required_adapter_claim, `MISSION_REQUIRED_CLAIM:${mission.mission_id}`);
  const legacyScopes = targetToLegacy.get(mission.scope_id) || [];
  assert(same(uniq(mission.legacy_scope_crosswalks || []), legacyScopes), `MISSION_SCOPE_CROSSWALK:${mission.mission_id}`);
  const eligible = eligibleProfiles
    .filter((profile) => profile.registered_claims.includes(mission.required_adapter_claim)
      && profile.collection_scope_ids.some((scopeId) => legacyScopes.includes(scopeId)))
    .sort((a, b) => a.priority_rank - b.priority_rank || a.source_id.localeCompare(b.source_id));
  const rightsEligible = eligible
    .filter((profile) => purposeRightsIndex.get(profile.source_id)?.decision === RIGHTS_CLEAR);
  const selected = rightsEligible.slice(0, expectedSlots.length);
  const selectedIds = selected.map((profile) => profile.source_id);
  if (!legacyUpstreamRightsQueue) assert(mission.eligible_registered_profile_count === rightsEligible.length, `MISSION_RIGHTS_ELIGIBLE_COUNT:${mission.mission_id}`);
  assert(mission.slots?.length === expectedSlots.length, `MISSION_SLOT_COUNT:${mission.mission_id}`);
  assert(same(mission.slots.map((slot) => slot.slot), expectedSlots), `MISSION_SLOT_ORDER:${mission.mission_id}`);
  const upstreamSelectedIds = mission.slots.filter((slot) => slot.source_id).map((slot) => slot.source_id);
  if (!legacyUpstreamRightsQueue) {
    assert(same(upstreamSelectedIds, selectedIds), `MISSION_SELECTED_SOURCE_DRIFT:${mission.mission_id}`);
    assert(mission.filled_slot_count === selectedIds.length, `MISSION_FILLED_SLOT_COUNT:${mission.mission_id}`);
    assert(mission.state === (rightsEligible.length > 0 ? 'RIGHTS_CLEAR_REGISTERED_PROFILES_IDENTIFIED' : 'NO_RIGHTS_CLEAR_REGISTERED_PROFILE'), `MISSION_STATE:${mission.mission_id}`);
  }
  assert(mission.rights_or_admission_created === false && mission.public_release === 'HOLD' && mission.production === 'HOLD', `MISSION_PROMOTION:${mission.mission_id}`);
  for (let index = 0; index < mission.slots.length; index += 1) {
    const slot = mission.slots[index];
    const selectedProfile = selected[index] || null;
    if (selectedProfile && !legacyUpstreamRightsQueue) {
      assert(slot.source_id === selectedProfile.source_id, `MISSION_SLOT_SOURCE:${mission.mission_id}:${slot.slot}`);
      assert(same(uniq(slot.registered_target_claims || []), uniq(selectedProfile.registered_claims)), `MISSION_SLOT_REGISTERED_CLAIMS:${mission.mission_id}:${slot.slot}`);
      assert(slot.adapter_state === 'IMPLEMENTED_NOT_RIGHTS_VERIFIED', `UPSTREAM_ADAPTER_STATE_CHANGED:${mission.mission_id}:${slot.slot}`);
      assert(slot.rights_state === RIGHTS_CLEAR && slot.rights_eligibility_state === RIGHTS_CLEAR && slot.sold_or_liquidity_semantics_state === 'UNVERIFIED', `MISSION_SLOT_EMPIRICAL_STATE:${mission.mission_id}:${slot.slot}`);
      assert(slot.factual_origin_independence_state === 'UNVERIFIED' && slot.evidence_admitted === false, `MISSION_SLOT_PROMOTION:${mission.mission_id}:${slot.slot}`);
    } else if (!legacyUpstreamRightsQueue) {
      assert(slot.source_id === null && slot.adapter_state === 'NOT_AVAILABLE', `MISSION_UNFILLED_SLOT:${mission.mission_id}:${slot.slot}`);
    }
  }

  const evaluations = eligible.map((profile) => {
    const ceiling = claimCeilingBySource.get(profile.source_id);
    assert(ceiling, `MISSION_SOURCE_WITHOUT_CURRENT_IMPLEMENTATION:${mission.mission_id}:${profile.source_id}`);
    const matchingParser = ceiling.implemented_claim_parsers.includes(mission.required_adapter_claim);
    const contextOnly = ceiling.adapter_kind === 'CONTEXT_ONLY_CLASSIFIER';
    return {
      source_id: profile.source_id,
      priority_rank: profile.priority_rank,
      selected_slot: selectedIds.includes(profile.source_id),
      selected_slot_name: selectedIds.includes(profile.source_id) ? expectedSlots[selectedIds.indexOf(profile.source_id)] : null,
      registered_claims: ceiling.registered_claims,
      implemented_claim_parsers: ceiling.implemented_claim_parsers,
      unimplemented_registered_claims: ceiling.unimplemented_registered_claims,
      template_only_claims: ceiling.template_only_claims,
      context_only_claims: ceiling.context_only_claims,
      adapter_kind: ceiling.adapter_kind,
      adapter_implemented: true,
      purpose_rights_decision: purposeRightsIndex.get(profile.source_id)?.decision,
      purpose_rights_reason_codes: purposeRightsIndex.get(profile.source_id)?.reason_codes || [],
      purpose_rights_evidence_refs: purposeRightsIndex.get(profile.source_id)?.evidence_refs || [],
      acquisition_or_adapter_backlog_eligible: purposeRightsIndex.get(profile.source_id)?.decision === RIGHTS_CLEAR,
      required_claim_parser_match: matchingParser,
      software_evaluation_state: matchingParser ? 'CLAIM_PARSER_MATCH' : contextOnly ? 'CONTEXT_ONLY_NOT_CLAIM_CAPABLE' : 'CLAIM_REGISTERED_NOT_IMPLEMENTED',
      source_contract: ceiling.source_contract,
      module: ceiling.module,
      empirical_state: contract.empirical_state,
      rights_verified: false,
      live_schema_verified: false,
      adapter_activated: false,
      evidence_admitted: false,
    };
  });
  const qualifying = evaluations.filter((evaluation) => evaluation.required_claim_parser_match).map((evaluation) => evaluation.source_id);
  const selectedQualifying = evaluations.filter((evaluation) => evaluation.selected_slot && evaluation.required_claim_parser_match).map((evaluation) => evaluation.source_id);
  const coverageState = qualifying.length > 0
    ? 'SOFTWARE_IMPLEMENTED'
    : evaluations.some((evaluation) => evaluation.adapter_kind === 'CONTEXT_ONLY_CLASSIFIER')
      ? 'CONTEXT_ONLY'
      : 'UNMAPPED';
  const unresolved = [];
  if (eligible.length === 0) unresolved.push('NO_REGISTERED_PROFILE_FOR_SCOPE_AND_CLAIM');
  if (eligible.length > 0 && rightsEligible.length === 0) unresolved.push('NO_RIGHTS_CLEAR_PROFILE_FOR_PURPOSE');
  if (eligible.length > 0 && qualifying.length === 0) unresolved.push('NO_MATCHING_IMPLEMENTED_CLAIM_PARSER');
  if (coverageState === 'CONTEXT_ONLY') unresolved.push('CONTEXT_ONLY_CLASSIFIER_NON_PROMOTABLE');
  if (selectedIds.length < expectedSlots.length) unresolved.push('THREE_SLOT_REPLACEMENT_REDUNDANCY_INCOMPLETE');
  records.push({
    coverage_record_id: shaId('requirement-adapter-coverage', {
      mission_id: mission.mission_id,
      scope_id: mission.scope_id,
      region: mission.region,
      evidence_class: mission.evidence_class,
      required_adapter_claim: mission.required_adapter_claim,
    }),
    authoritative_requirement_grain: 'AUTONOMOUS_RESOLUTION_MISSION_V1',
    legacy_v2_adapter_requirement_id: null,
    legacy_v2_identifier_synthesized: false,
    mission_id: mission.mission_id,
    replacement_mission_id: mission.replacement_mission_id,
    market_cell_id: mission.market_cell_id,
    scope_id: mission.scope_id,
    scope_name: mission.scope_name,
    domain: mission.domain,
    region: mission.region,
    evidence_class: mission.evidence_class,
    required_adapter_claim: mission.required_adapter_claim,
    legacy_scope_crosswalks: legacyScopes,
    producer_source_sha: artifactBinding.execution_sha,
    consumer_source_sha: artifactBinding.consumer_sha,
    upstream_digests: {
      replacement_queue: hash(queueText),
      resolution_manifest: hash(manifestText),
    },
    eligible_source_ids: eligible.map((profile) => profile.source_id),
    rights_clear_source_ids: rightsEligible.map((profile) => profile.source_id),
    rights_hold_source_ids: eligible.filter((profile) => purposeRightsIndex.get(profile.source_id)?.decision !== RIGHTS_CLEAR).map((profile) => profile.source_id),
    acquisition_eligible_source_ids: selectedIds,
    selected_source_ids: selectedIds,
    qualifying_software_adapter_ids: qualifying,
    selected_qualifying_software_adapter_ids: selectedQualifying,
    source_evaluations: evaluations,
    software_coverage_state: coverageState,
    empirical_state: contract.empirical_state,
    empirical_hold_reasons: contract.empirical_hold_reasons,
    unresolved_reason_codes: unresolved,
    rights_verified: false,
    live_schema_verified: false,
    adapter_activated: false,
    evidence_admitted: false,
    market_event_created: false,
    snapshot_candidate_created: false,
    track_b_result_created: false,
    projection_created: false,
    public_release: 'HOLD',
    production: 'HOLD',
    g5: 'HOLD',
  });
}
records.sort((a, b) => a.domain.localeCompare(b.domain)
  || a.evidence_class.localeCompare(b.evidence_class)
  || a.scope_id.localeCompare(b.scope_id)
  || a.region.localeCompare(b.region));

assert(uniq(records.map((record) => record.coverage_record_id)).length === grain.expected_mission_count, 'COVERAGE_RECORD_ID_DUPLICATE');
assert(uniq(records.map((record) => record.mission_id)).length === grain.expected_mission_count, 'COVERAGE_MISSION_ID_DUPLICATE');
assert(uniq(records.map((record) => record.scope_id)).length === grain.expected_scope_count, 'COVERAGE_SCOPE_COUNT');
assert(uniq(records.map((record) => record.region)).length === grain.expected_region_count, 'COVERAGE_REGION_COUNT');
assert(uniq(records.map((record) => record.domain)).length === grain.expected_domain_count, 'COVERAGE_DOMAIN_COUNT');
assert(uniq(records.map((record) => record.evidence_class)).length === grain.expected_evidence_class_count, 'COVERAGE_EVIDENCE_CLASS_COUNT');

const familyMap = new Map();
for (const record of records) {
  const key = `${record.domain}::${record.evidence_class}`;
  if (!familyMap.has(key)) familyMap.set(key, []);
  familyMap.get(key).push(record);
}
assert(familyMap.size === grain.expected_family_count, `COVERAGE_FAMILY_COUNT:${familyMap.size}`);
const families = [...familyMap.entries()].map(([key, familyRecords]) => {
  const [domain, evidenceClass] = key.split('::');
  assert(familyRecords.length === grain.expected_requirements_per_family, `FAMILY_REQUIREMENT_COUNT:${key}`);
  const softwareImplemented = familyRecords.filter((record) => record.software_coverage_state === 'SOFTWARE_IMPLEMENTED').length;
  return {
    adapter_family_id: shaId('requirement-adapter-family', { domain, evidence_class: evidenceClass }),
    domain,
    evidence_class: evidenceClass,
    required_adapter_claim: contract.claim_mapping[evidenceClass],
    requirement_count: familyRecords.length,
    scope_count: uniq(familyRecords.map((record) => record.scope_id)).length,
    scope_ids: uniq(familyRecords.map((record) => record.scope_id)),
    region_count: uniq(familyRecords.map((record) => record.region)).length,
    regions: uniq(familyRecords.map((record) => record.region)),
    software_implemented_count: softwareImplemented,
    context_only_count: familyRecords.filter((record) => record.software_coverage_state === 'CONTEXT_ONLY').length,
    unmapped_count: familyRecords.filter((record) => record.software_coverage_state === 'UNMAPPED').length,
    software_gap_count: familyRecords.length - softwareImplemented,
    family_software_state: softwareImplemented === familyRecords.length
      ? 'FULLY_SOFTWARE_COVERED'
      : softwareImplemented > 0
        ? 'PARTIALLY_SOFTWARE_COVERED'
        : 'ZERO_SOFTWARE_COVERED',
    eligible_source_ids: uniq(familyRecords.flatMap((record) => record.eligible_source_ids)),
    qualifying_software_adapter_ids: uniq(familyRecords.flatMap((record) => record.qualifying_software_adapter_ids)),
    empirical_state: contract.empirical_state,
    rights_schema_activation_hold_count: familyRecords.length,
    evidence_admitted: 0,
    market_events_created: 0,
    public_release: 'HOLD',
    production: 'HOLD',
    g5: 'HOLD',
  };
}).sort((a, b) => a.domain.localeCompare(b.domain) || a.evidence_class.localeCompare(b.evidence_class));

const coverageCounts = countBy(records, (record) => record.software_coverage_state);
const evidenceCounts = countBy(records, (record) => record.evidence_class);
const softwareByEvidence = countBy(records.filter((record) => record.software_coverage_state === 'SOFTWARE_IMPLEMENTED'), (record) => record.evidence_class);
const familyStateCounts = countBy(families, (family) => family.family_software_state);
const baseline = contract.expected_current_main_baseline;
const effectiveMissionsWithProfiles = new Set(records.filter((record) => record.selected_source_ids.length > 0).map((record) => record.mission_id)).size;
const effectiveFilledSlots = records.reduce((total, record) => total + record.selected_source_ids.length, 0);
const effectiveSelectedProfiles = uniq(records.flatMap((record) => record.selected_source_ids)).length;
assert(queue.missions_with_profile_candidates === queue.missions.filter((mission) => mission.eligible_registered_profile_count > 0).length, 'QUEUE_MISSIONS_WITH_PROFILES_RECOMPUTE');
assert(queue.missions_without_profile_candidates === queue.missions.filter((mission) => mission.eligible_registered_profile_count === 0).length, 'QUEUE_MISSIONS_WITHOUT_PROFILES_RECOMPUTE');
assert(queue.filled_source_slots === queue.missions.reduce((sum, mission) => sum + mission.filled_slot_count, 0), 'QUEUE_FILLED_SLOTS_RECOMPUTE');
assert(queue.unique_registered_profiles_selected === uniq(queue.missions.flatMap((mission) => mission.slots.map((slot) => slot.source_id))).length, 'QUEUE_SELECTED_PROFILES_RECOMPUTE');
const effectiveQueueMetrics = legacyUpstreamRightsQueue
  ? {
      missions_with_profile_candidates: effectiveMissionsWithProfiles,
      missions_without_profile_candidates: grain.expected_mission_count - effectiveMissionsWithProfiles,
      filled_source_slots: effectiveFilledSlots,
      unique_registered_profiles_selected: effectiveSelectedProfiles,
    }
  : queue;
assert(effectiveQueueMetrics.missions_with_profile_candidates === baseline.missions_with_registered_profiles, 'QUEUE_MISSIONS_WITH_PROFILES_BASELINE');
assert(effectiveQueueMetrics.missions_without_profile_candidates === baseline.missions_without_registered_profiles, 'QUEUE_MISSIONS_WITHOUT_PROFILES_BASELINE');
assert(effectiveQueueMetrics.filled_source_slots === baseline.filled_registered_profile_slots, 'QUEUE_FILLED_SLOTS_BASELINE');
assert(effectiveQueueMetrics.unique_registered_profiles_selected === baseline.unique_selected_registered_profiles, 'QUEUE_SELECTED_PROFILES_BASELINE');
assert((coverageCounts.SOFTWARE_IMPLEMENTED || 0) === baseline.software_implemented_requirements, 'SOFTWARE_IMPLEMENTED_BASELINE');
assert((coverageCounts.CONTEXT_ONLY || 0) === baseline.context_only_requirements, 'CONTEXT_ONLY_BASELINE');
assert((coverageCounts.UNMAPPED || 0) === baseline.unmapped_requirements, 'UNMAPPED_BASELINE');
assert((softwareByEvidence.CURRENT_SOLD_TRANSACTION || 0) === baseline.sold_software_implemented_requirements, 'SOLD_SOFTWARE_BASELINE');
assert((softwareByEvidence.LIQUIDITY_TIME_TO_SALE_EXPOSURE || 0) === baseline.liquidity_software_implemented_requirements, 'LIQUIDITY_SOFTWARE_BASELINE');
assert((familyStateCounts.FULLY_SOFTWARE_COVERED || 0) === baseline.fully_software_covered_families, 'FULL_FAMILY_BASELINE');
assert((familyStateCounts.PARTIALLY_SOFTWARE_COVERED || 0) === baseline.partially_software_covered_families, 'PARTIAL_FAMILY_BASELINE');
assert((familyStateCounts.ZERO_SOFTWARE_COVERED || 0) === baseline.zero_software_covered_families, 'ZERO_FAMILY_BASELINE');
assert((evidenceCounts.CURRENT_SOLD_TRANSACTION || 0) === 96 && (evidenceCounts.LIQUIDITY_TIME_TO_SALE_EXPOSURE || 0) === 96, 'EVIDENCE_DENOMINATOR_INVALID');

const coverageLedger = {
  id: 'kidults-asi-requirement-adapter-coverage-ledger-v1',
  version: '1.0.0',
  state: 'ALL_AUTHORITATIVE_REQUIREMENTS_CROSSWALKED_TO_CURRENT_CLAIM_CEILINGS',
  platform_principles: principles,
  authoritative_requirement_grain: 'AUTONOMOUS_RESOLUTION_MISSION_V1',
  requirement_count: records.length,
  unique_mission_count: uniq(records.map((record) => record.mission_id)).length,
  unique_market_cell_count: uniq(records.map((record) => record.market_cell_id)).length,
  scope_count: uniq(records.map((record) => record.scope_id)).length,
  region_count: uniq(records.map((record) => record.region)).length,
  domain_count: uniq(records.map((record) => record.domain)).length,
  family_count: families.length,
  evidence_class_counts: evidenceCounts,
  software_coverage_counts: coverageCounts,
  software_gap_count: records.filter((record) => record.software_coverage_state !== 'SOFTWARE_IMPLEMENTED').length,
  rights_schema_activation_hold_count: records.length,
  legacy_v2_adapter_requirement_ids_available: 0,
  legacy_v2_adapter_requirement_ids_synthesized: 0,
  records,
  evidence_admitted: 0,
  market_events_created: 0,
  public_release: 'HOLD',
  production: 'HOLD',
  g5: 'HOLD',
};
const familyCoverage = {
  id: 'kidults-asi-requirement-adapter-family-coverage-v1',
  version: '1.0.0',
  state: 'DOMAIN_EVIDENCE_FAMILY_SOFTWARE_COVERAGE_REPORTED_WITHOUT_DENOMINATOR_SUBSTITUTION',
  family_key: ['domain', 'evidence_class'],
  family_count: families.length,
  fully_software_covered_families: familyStateCounts.FULLY_SOFTWARE_COVERED || 0,
  partially_software_covered_families: familyStateCounts.PARTIALLY_SOFTWARE_COVERED || 0,
  zero_software_covered_families: familyStateCounts.ZERO_SOFTWARE_COVERED || 0,
  requirement_count: records.length,
  software_implemented_requirement_count: coverageCounts.SOFTWARE_IMPLEMENTED || 0,
  families,
  evidence_admitted: 0,
  public_release: 'HOLD',
  production: 'HOLD',
  g5: 'HOLD',
};
const claimCeilingRegistry = {
  id: 'kidults-asi-source-adapter-claim-ceiling-registry-v1',
  version: '1.0.0',
  state: 'CURRENT_16_SOURCE_SOFTWARE_CLAIM_CEILINGS_NORMALIZED_EMPIRICAL_HOLD',
  source_profile_count: normalized.length,
  implemented_source_adapter_count: normalized.length,
  transaction_parser_count: normalized.filter((record) => record.adapter_kind === 'TRANSACTION_PARSER').length,
  exposure_parser_count: normalized.filter((record) => record.adapter_kind === 'EXPOSURE_PARSER').length,
  context_only_classifier_count: normalized.filter((record) => record.adapter_kind === 'CONTEXT_ONLY_CLASSIFIER').length,
  verified_assignment_count_metadata_sum: normalized.reduce((sum, record) => sum + record.verified_assignment_count, 0),
  verified_assignment_count_is_requirement_denominator: false,
  sources: normalized,
  live_source_snapshots_verified: 0,
  field_purpose_rights_verified_sources: 0,
  source_specific_adapters_activated: 0,
  evidence_admitted: 0,
  market_events_created: 0,
  public_release: 'HOLD',
  production: 'HOLD',
  g5: 'HOLD',
};
const gapRecords = records.filter((record) => record.software_coverage_state !== 'SOFTWARE_IMPLEMENTED').map((record) => ({
  coverage_record_id: record.coverage_record_id,
  mission_id: record.mission_id,
  scope_id: record.scope_id,
  domain: record.domain,
  region: record.region,
  evidence_class: record.evidence_class,
  required_adapter_claim: record.required_adapter_claim,
  software_coverage_state: record.software_coverage_state,
  eligible_source_ids: record.eligible_source_ids,
  selected_source_ids: record.selected_source_ids,
  unresolved_reason_codes: record.unresolved_reason_codes,
  empirical_state: record.empirical_state,
  public_release: 'HOLD',
  production: 'HOLD',
  g5: 'HOLD',
}));
const gapQueue = {
  id: 'kidults-asi-requirement-adapter-gap-queue-v1',
  version: '1.0.0',
  state: 'CURRENT_REQUIREMENT_SOFTWARE_GAPS_EXPLICIT',
  gap_count: gapRecords.length,
  context_only_count: gapRecords.filter((record) => record.software_coverage_state === 'CONTEXT_ONLY').length,
  unmapped_count: gapRecords.filter((record) => record.software_coverage_state === 'UNMAPPED').length,
  records: gapRecords,
  evidence_admitted: 0,
  public_release: 'HOLD',
  production: 'HOLD',
  g5: 'HOLD',
};

await fs.mkdir(outputDir, { recursive: true });
const writeJson = makeWriter(outputDir);
const outputs = [];
for (const [name, value] of [
  ['requirement-adapter-coverage-ledger-v1.json', coverageLedger],
  ['requirement-adapter-family-coverage-v1.json', familyCoverage],
  ['source-adapter-claim-ceiling-registry-v1.json', claimCeilingRegistry],
  ['requirement-adapter-gap-queue-v1.json', gapQueue],
]) outputs.push(await writeJson(name, value));

const outputManifest = {
  id: 'kidults-asi-requirement-adapter-coverage-manifest-v1',
  version: '1.0.0',
  state: 'AUTHORITATIVE_192_REQUIREMENT_TO_CURRENT_ADAPTER_CLAIM_CEILING_CROSSWALK_BUILT',
  as_of: resolutionManifest.as_of,
  platform_principles: principles,
  source_sha: artifactBinding.execution_sha,
  producer_head_sha: artifactBinding.head_sha,
  consumer_sha: artifactBinding.consumer_sha,
  input_bindings: {
    upstream_artifact: {
      artifact_id: artifactBinding.artifact_id,
      artifact_name: artifactBinding.artifact_name,
      workflow_run_id: artifactBinding.workflow_run_id,
      workflow_name: artifactBinding.workflow_name,
      workflow_path: artifactBinding.workflow_path,
      head_branch: artifactBinding.head_branch,
      expected_head_branch: artifactBinding.expected_head_branch,
      head_sha: artifactBinding.head_sha,
      expected_source_sha: artifactBinding.expected_source_sha,
      execution_sha: artifactBinding.execution_sha,
      validation_scope: artifactBinding.validation_scope,
      production_eligible: artifactBinding.production_eligible,
      conclusion: artifactBinding.conclusion,
      expired: artifactBinding.expired,
      source_sha_ancestor_of_consumer: artifactBinding.source_sha_ancestor_of_consumer,
      execution_sha_ancestor_of_consumer: artifactBinding.execution_sha_ancestor_of_consumer,
      created_at: artifactBinding.created_at,
      expires_at: artifactBinding.expires_at,
    },
    replacement_queue: { id: queue.id, digest: hash(queueText), mission_count: queue.mission_count },
    resolution_manifest: { id: resolutionManifest.id, digest: hash(manifestText) },
    resolution_receipt: { id: resolutionReceipt.id, digest: hash(receiptText), source_sha: resolutionReceipt.source_sha },
    resolution_contract: { id: resolutionContract.id, digest: hash(stableJson(resolutionContract)) },
    runtime_contract: { id: runtimeContract.id, digest: hash(stableJson(runtimeContract)), source_profile_count: runtimeProfiles.size },
    source_frontier: { path: input.source_frontier, digest: hash(staticTexts.frontier), record_count: frontier.length },
    scope_crosswalk: { id: crosswalk.id, digest: hash(stableJson(crosswalk)), record_count: crosswalk.records.length },
    adapter_contracts: normalized.map((record) => record.source_contract).filter((file, index, all) => all.indexOf(file) === index).map((file) => ({
      path: file,
      digest: hash(stableJson(JSON.parse(staticTexts[staticEntries.find(([name, pathValue]) => pathValue === file)?.[0]]))),
    })),
    coverage_contract: { id: contract.id, version: contract.version, digest: hash(contractText) },
  },
  results: {
    requirements_accounted_for: records.length,
    duplicate_requirements: 0,
    silently_dropped_requirements: 0,
    family_count: families.length,
    registered_source_profiles: normalized.length,
    implemented_source_adapters: normalized.length,
    software_implemented_requirements: coverageCounts.SOFTWARE_IMPLEMENTED || 0,
    context_only_requirements: coverageCounts.CONTEXT_ONLY || 0,
    unmapped_requirements: coverageCounts.UNMAPPED || 0,
    software_gap_requirements: gapRecords.length,
    rights_schema_activation_hold_requirements: records.length,
    rights_clear_registered_profiles: rightsClearRegisteredProfileCount,
    rights_hold_registered_profiles: rightsHoldRegisteredProfileCount,
    rights_preflight_queue_items: rightsHoldRegisteredProfileCount,
    replacement_missions_with_rights_clear_profiles: new Set(records.filter((record) => record.selected_source_ids.length > 0).map((record) => record.mission_id)).size,
    replacement_source_slots_filled: records.reduce((total, record) => total + record.selected_source_ids.length, 0),
    unique_rights_clear_profiles_selected: uniq(records.flatMap((record) => record.selected_source_ids)).length,
    rights_clear_gate: rightsGateRule,
    legacy_v2_adapter_requirement_ids_synthesized: 0,
    duplicate_sdk_or_runtime_introduced: 0,
    live_source_requests_executed: 0,
    provider_contacts_executed: 0,
    rights_passes_created: 0,
    adapters_activated: 0,
    evidence_admitted: 0,
    market_events_created: 0,
    snapshot_candidates_created: 0,
    track_b_results_created: 0,
    projections_created: 0,
  },
  output_files: outputs,
  autonomous_effect: 'POSITIVE_AUTOMATIC_EXACT_PROVENANCE_BOUND_ARTIFACT_REPLAY_AND_FAIL_CLOSED_SOFTWARE_GAP_QUEUE',
  global_effect: 'POSITIVE_ALL_192_SCOPE_REGION_EVIDENCE_REQUIREMENTS_RETAINED_WITHOUT_CALLING_SOURCE_COUNT_GLOBAL_EVIDENCE',
  irreplaceable_value_effect: 'POSITIVE_KIDULTS_OWNED_REQUIREMENT_TO_SOURCE_CLAIM_CEILING_LINEAGE_AND_SWITCHING_GAPS',
  transparency_effect: 'POSITIVE_REGISTERED_IMPLEMENTED_CONTEXT_EMPIRICAL_AND_RELEASE_STATES_SEPARATED_WITH_DIGESTS',
  public_release: 'HOLD',
  production: 'HOLD',
  g5: 'HOLD',
};
outputs.push(await writeJson('requirement-adapter-coverage-manifest-v1.json', outputManifest));

assert(contract.required_outputs.length === outputs.length && same(contract.required_outputs, outputs.map((output) => output.name)), 'REQUIRED_OUTPUT_SET_MISMATCH');
console.log(JSON.stringify({
  id: 'kidults-asi-requirement-adapter-coverage-build-v1',
  state: 'IMPLEMENTED_NOT_VERIFIED',
  source_sha: artifactBinding.execution_sha,
  producer_head_sha: artifactBinding.head_sha,
  consumer_sha: artifactBinding.consumer_sha,
  requirements_accounted_for: records.length,
  family_count: families.length,
  registered_source_profiles: normalized.length,
  software_implemented_requirements: coverageCounts.SOFTWARE_IMPLEMENTED || 0,
  context_only_requirements: coverageCounts.CONTEXT_ONLY || 0,
  unmapped_requirements: coverageCounts.UNMAPPED || 0,
  software_gap_requirements: gapRecords.length,
  rights_schema_activation_hold_requirements: records.length,
  evidence_admitted: 0,
  market_events_created: 0,
  public_release: 'HOLD',
  production: 'HOLD',
  g5: 'HOLD',
}, null, 2));
