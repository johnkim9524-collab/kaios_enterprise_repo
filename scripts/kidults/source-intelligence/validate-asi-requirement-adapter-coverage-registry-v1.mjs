#!/usr/bin/env node
import fs from 'node:fs';

const files = {
  contract: 'coordination/kidults/source-intelligence/asi-requirement-adapter-coverage-contract-v1.json',
  registry: 'coordination/kidults/source-intelligence/asi-requirement-adapter-coverage-registry-v1.json',
  builder: 'scripts/kidults/source-intelligence/build-asi-requirement-adapter-coverage-v1.mjs',
  validator: 'scripts/kidults/source-intelligence/validate-asi-requirement-adapter-coverage-v1.mjs',
  purposeRightsPreflight: 'coordination/kidults/source-intelligence/top16-empirical-activation-preflight-v1.json',
  purposeRightsGate: 'scripts/kidults/source-intelligence/lib/source-purpose-rights-gate-v1.mjs',
  registryValidator: 'scripts/kidults/source-intelligence/validate-asi-requirement-adapter-coverage-registry-v1.mjs',
  workflow: '.github/workflows/kidults-asi-requirement-adapter-coverage-v1.yml',
  documentation: 'docs/kidults/asi/asi-requirement-adapter-coverage-v1.md',
};
const fail = (message) => { throw new Error(message); };
const assert = (condition, message) => { if (!condition) fail(message); };
const read = (file) => fs.readFileSync(file, 'utf8');
const json = (file) => JSON.parse(read(file));
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
for (const [name, file] of Object.entries(files)) assert(fs.existsSync(file), `REGISTERED_ASSET_MISSING:${name}:${file}`);

const contract = json(files.contract);
const registry = json(files.registry);
const builder = read(files.builder);
const validator = read(files.validator);
const workflow = read(files.workflow);
const documentation = read(files.documentation);
const principles = ['AUTONOMOUS', 'GLOBAL', 'IRREPLACEABLE_VALUE', 'TRANSPARENT'];

assert(contract.id === 'kidults-asi-requirement-adapter-coverage-contract-v1' && contract.version === '1.1.0', 'CONTRACT_ID_VERSION');
assert(contract.status === 'ACTIVE_MANDATORY_FAIL_CLOSED_AFTER_MAIN_MERGE', 'CONTRACT_STATUS');
assert(same(contract.platform_principles, principles), 'CONTRACT_PRINCIPLES');
assert(contract.canonical_grain?.expected_mission_count === 192 && contract.canonical_grain?.expected_unique_market_cell_count === 192, 'CONTRACT_MISSION_GRAIN');
assert(contract.canonical_grain?.expected_scope_count === 32 && contract.canonical_grain?.expected_region_count === 3, 'CONTRACT_SCOPE_REGION_COUNTS');
assert(contract.canonical_grain?.expected_domain_count === 8 && contract.canonical_grain?.expected_family_count === 16 && contract.canonical_grain?.expected_requirements_per_family === 12, 'CONTRACT_FAMILY_COUNTS');
assert(contract.canonical_grain?.unmerged_v2_adapter_requirement_id_is_authoritative === false && contract.canonical_grain?.unmerged_v2_adapter_requirement_id_may_be_synthesized === false, 'CONTRACT_V2_ID_BOUNDARY');
assert(contract.coverage_policy?.registered_claim_is_implemented_claim === false && contract.coverage_policy?.context_classifier_is_claim_parser === false, 'CONTRACT_CLAIM_BOUNDARY');
assert(contract.coverage_policy?.software_coverage_rule === 'ELIGIBLE_CURRENT_SOURCE_WITH_LITERAL_REQUIRED_CLAIM_IN_IMPLEMENTED_CLAIM_PARSERS', 'CONTRACT_SOFTWARE_COVERAGE_RULE');
assert(contract.coverage_policy?.acquisition_eligibility_rule === 'PURPOSE_RIGHTS_PREFLIGHT_DECISION_MUST_EQUAL_RIGHTS_CLEAR_FOR_PURPOSE', 'CONTRACT_ACQUISITION_RIGHTS_RULE');
assert(contract.coverage_policy?.selected_slot_rule === 'FIRST_THREE_RIGHTS_CLEAR_SOURCES_BY_PRIORITY_RANK_THEN_SOURCE_ID', 'CONTRACT_RIGHTS_SLOT_RULE');
assert(same(contract.software_coverage_states, ['SOFTWARE_IMPLEMENTED', 'CONTEXT_ONLY', 'NO_IMPLEMENTED_CLAIM_PARSER']), 'CONTRACT_COVERAGE_STATES');
assert(contract.deprecated_compatibility_metrics?.status === 'READ_ONLY_TRANSLATION_NOT_CANONICAL_STATUS', 'CONTRACT_DEPRECATED_METRICS_STATUS');
assert(contract.deprecated_compatibility_metrics?.software_gap_requirements?.interpretation_forbidden === 'MISSING_INTERNAL_CODE_MODULES', 'CONTRACT_DEPRECATED_SOFTWARE_GAP_BOUNDARY');
assert(contract.deprecated_compatibility_metrics?.unmapped_requirements?.canonical_replacement === 'claim_parser_not_implemented_requirements', 'CONTRACT_DEPRECATED_UNMAPPED_REPLACEMENT');
assert(contract.empirical_state === 'RIGHTS_SCHEMA_ACTIVATION_HOLD' && contract.empirical_hold_reasons?.length === 6, 'CONTRACT_EMPIRICAL_HOLD');
assert(same(contract.required_outputs, [
  'requirement-adapter-coverage-ledger-v1.json',
  'requirement-adapter-family-coverage-v1.json',
  'source-adapter-claim-ceiling-registry-v1.json',
  'requirement-adapter-gap-queue-v1.json',
  'requirement-adapter-coverage-manifest-v1.json',
]), 'CONTRACT_OUTPUTS');
const baseline = contract.expected_current_main_baseline;
assert(baseline.registered_source_profiles === 16 && baseline.implemented_source_adapters === 16 && baseline.pending_source_adapters === 0, 'CONTRACT_SOURCE_BASELINE');
assert(baseline.software_implemented_requirements === 39 && baseline.context_only_requirements === 15 && baseline.claim_parser_not_implemented_requirements === 138 && baseline.source_discovery_or_schema_activation_hold_requirements === 153, 'CONTRACT_COVERAGE_BASELINE');
assert(baseline.source_profile_discovery_requirements === 120 && baseline.schema_bound_claim_parser_requirements === 33 && baseline.internal_unbound_execution_queue_count === 0, 'CONTRACT_GAP_CLASS_BASELINE');
assert(baseline.rights_schema_activation_hold_requirements === 192 && baseline.evidence_admitted === 0 && baseline.market_events_created === 0, 'CONTRACT_EMPIRICAL_BASELINE');
assert(contract.truth_boundary?.software_lineage_only === true && contract.truth_boundary?.live_source_request_executed === false && contract.truth_boundary?.provider_contact_executed === false, 'CONTRACT_LIVE_BOUNDARY');
assert(contract.truth_boundary?.rights_pass_created === false && contract.truth_boundary?.source_adapter_activated === false, 'CONTRACT_ACTIVATION_BOUNDARY');
assert(contract.truth_boundary?.evidence_admitted === 0 && contract.truth_boundary?.market_events_created === 0 && contract.truth_boundary?.snapshot_candidates_created === 0, 'CONTRACT_EVIDENCE_BOUNDARY');
assert(contract.truth_boundary?.public_release === 'HOLD' && contract.truth_boundary?.production === 'HOLD' && contract.truth_boundary?.g5 === 'HOLD', 'CONTRACT_RELEASE_BOUNDARY');

assert(registry.id === 'kidults-asi-requirement-adapter-coverage-registry-v1' && registry.version === '1.1.0', 'REGISTRY_ID_VERSION');
assert(registry.status === 'REGISTERED_FAIL_CLOSED_AFTER_MAIN_MERGE', 'REGISTRY_STATUS');
assert(same(registry.platform_principles, principles), 'REGISTRY_PRINCIPLES');
for (const [name, expected] of Object.entries({
  contract: files.contract,
  registry: files.registry,
  builder: files.builder,
  validator: files.validator,
  purpose_rights_preflight: files.purposeRightsPreflight,
  purpose_rights_gate: files.purposeRightsGate,
  registry_validator: files.registryValidator,
  workflow: files.workflow,
  documentation: files.documentation,
})) assert(registry.registered_assets?.[name] === expected, `REGISTRY_ASSET_PATH:${name}`);
assert(registry.input_artifact === contract.authoritative_inputs.upstream_artifact_name, 'REGISTRY_INPUT_ARTIFACT');
assert(registry.output_artifact === 'kidults-asi-requirement-adapter-coverage-v1', 'REGISTRY_OUTPUT_ARTIFACT');
assert(registry.implementation_state?.authoritative_requirement_grain === 'AUTONOMOUS_RESOLUTION_MISSION_V1', 'REGISTRY_GRAIN');
assert(registry.implementation_state?.requirements_accounted_for === 192 && registry.implementation_state?.domain_evidence_families_retained === 16, 'REGISTRY_REQUIREMENT_COUNTS');
assert(registry.implementation_state?.registered_source_profiles === 16 && registry.implementation_state?.implemented_source_adapters === 16, 'REGISTRY_SOURCE_COUNTS');
assert(registry.implementation_state?.purpose_rights_clear_sources === 0 && registry.implementation_state?.purpose_rights_preflight_hold_sources === 16 && registry.implementation_state?.replacement_profiles_selected_after_rights_gate === 0, 'REGISTRY_RIGHTS_FIRST_COUNTS');
assert(registry.implementation_state?.software_implemented_requirements === 39 && registry.implementation_state?.context_only_requirements === 15 && registry.implementation_state?.claim_parser_not_implemented_requirements === 138, 'REGISTRY_COVERAGE_COUNTS');
assert(registry.implementation_state?.rights_schema_activation_hold_requirements === 192, 'REGISTRY_HOLD_COUNT');
assert(registry.implementation_state?.unmerged_v2_ids_synthesized === 0 && registry.implementation_state?.duplicate_sdk_or_runtime_introduced === 0, 'REGISTRY_FORBIDDEN_ASSET_COUNTS');
assert(registry.implementation_state?.evidence_admitted === 0 && registry.implementation_state?.market_events_created === 0, 'REGISTRY_EMPIRICAL_COUNTS');
assert(registry.automatic_activation?.main_push === false && registry.automatic_activation?.schedule === 'UPSTREAM_WORKFLOW_ONLY', 'REGISTRY_AUTOMATIC_TRIGGER');
assert(same(registry.automatic_activation?.upstream_workflows, ['KIDULTS ASI Autonomous Resolution Layer v1']), 'REGISTRY_UPSTREAM_WORKFLOWS');
assert(registry.automatic_activation?.manual_dispatch_role === 'RECOVERY_OR_EXPLICIT_REPLAY_ONLY', 'REGISTRY_MANUAL_ROLE');
assert(registry.continuation?.automatic_continuation_required === true && registry.continuation?.source_discovery_and_schema_activation_queue_output === 'requirement-adapter-gap-queue-v1.json', 'REGISTRY_CONTINUATION');
assert(registry.truth_boundary?.artifact_must_be_successful_nonexpired_main_lineage === true, 'REGISTRY_ARTIFACT_BOUNDARY');
assert(registry.truth_boundary?.software_implemented_is_empirically_ready === false, 'REGISTRY_EMPIRICAL_READINESS_BOUNDARY');
assert(registry.truth_boundary?.evidence_admitted === 0 && registry.truth_boundary?.market_events_created === 0 && registry.truth_boundary?.projections_created === 0, 'REGISTRY_PROMOTION_BOUNDARY');
assert(registry.truth_boundary?.public_release === 'HOLD' && registry.truth_boundary?.production === 'HOLD' && registry.truth_boundary?.g5 === 'HOLD', 'REGISTRY_RELEASE_BOUNDARY');

for (const source of [builder, validator]) {
  assert(!source.includes('claim-suitable-adapter-sdk'), 'STALE_PARALLEL_SDK_REFERENCE');
  assert(!source.includes('replacement-mission-queue-v2.json'), 'UNMERGED_V2_REPLACEMENT_QUEUE_REFERENCE');
  assert(!source.includes('adapter-requirement-queue-v2.json'), 'UNMERGED_V2_ADAPTER_QUEUE_REFERENCE');
}
for (const marker of [
  'REPLACEMENT_QUEUE_ID_VERSION',
  'implemented_claim_parsers',
  'REGISTERED_CLAIM_INHERITANCE_FORBIDDEN',
  'CONTEXT_AS_PARSER_FORBIDDEN',
  'source_sha_ancestor_of_consumer',
  'legacy_v2_identifier_synthesized: false',
  "public_release: 'HOLD'",
  "production: 'HOLD'",
  "g5: 'HOLD'",
  'RIGHTS_CLEAR',
  'purposeRightsPreflight',
]) assert(builder.includes(marker), `BUILDER_CONTROL_MARKER:${marker}`);
for (const marker of [
  'LEDGER_REQUIREMENT_COUNT',
  'LEDGER_MARKET_CELL_UNIQUENESS',
  'REGISTERED_CLAIM_INHERITED',
  'CONTEXT_COUNTED_AS_PARSER',
  'OUTPUT_REBUILD_MISMATCH',
  'OUTPUT_MANIFEST_ACCOUNTING',
  'COVERAGE_PURPOSE_RIGHTS_BINDING',
]) assert(validator.includes(marker), `VALIDATOR_CONTROL_MARKER:${marker}`);

for (const marker of [
  'name: KIDULTS ASI Requirement-to-Adapter Coverage v1',
  'KIDULTS ASI Autonomous Resolution Layer v1',
  'contents: read',
  'actions: read',
  'persist-credentials: false',
  'node-version: \'24.19.0\'',
  'source_sha_ancestor_of_consumer',
  'Build requirement coverage twice',
  'Reject denominator-substitution mutation',
  'Reject legacy metric reintroduction mutation',
  'Reject registered-claim inheritance mutation',
  'Reject context-as-parser mutation',
  'Reject live-rights-activation promotion mutation',
  'Reject unbound upstream digest mutation',
  'Reject silent-drop and duplicate-grain mutations',
  'top16-empirical-activation-preflight-v1.json',
  'retention-days: 90',
]) assert(workflow.includes(marker), `WORKFLOW_CONTROL_MARKER:${marker}`);
assert(!/^\s{2}(schedule|push|pull_request):/m.test(workflow), 'WORKFLOW_UNBOUND_TRIGGER_FORBIDDEN');
assert(!workflow.includes('/actions/artifacts?per_page='), 'WORKFLOW_GLOBAL_ARTIFACT_LISTING_FORBIDDEN');
assert(workflow.includes('/actions/runs/${RUN_ID}/artifacts?per_page=100'), 'WORKFLOW_EXACT_RUN_ARTIFACT_BINDING');
for (const pin of [
  'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1',
  'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020',
  'actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02',
]) assert(workflow.includes(pin), `WORKFLOW_ACTION_NOT_IMMUTABLY_PINNED:${pin}`);
assert(documentation.includes('39 / 192') && documentation.includes('RIGHTS_SCHEMA_ACTIVATION_HOLD'), 'DOCUMENTATION_BASELINE_OR_BOUNDARY');
assert(documentation.includes('RIGHTS_CLEAR_FOR_PURPOSE') && documentation.includes('adapter-acquisition backlog items'), 'DOCUMENTATION_RIGHTS_FIRST_BOUNDARY');
assert(documentation.includes('latest exact-main producer at execution time') && documentation.includes('KPMO receipt'), 'DOCUMENTATION_DYNAMIC_EVIDENCE_BINDING');

console.log(JSON.stringify({
  id: 'kidults-asi-requirement-adapter-coverage-registry-validation-v1',
  version: contract.version,
  state: 'VERIFIED_PASS',
  registered_assets: Object.keys(registry.registered_assets).length,
  requirements_accounted_for: registry.implementation_state.requirements_accounted_for,
  family_count: registry.implementation_state.domain_evidence_families_retained,
  registered_source_profiles: registry.implementation_state.registered_source_profiles,
  software_implemented_requirements: registry.implementation_state.software_implemented_requirements,
  source_discovery_or_schema_activation_hold_requirements: registry.implementation_state.context_only_requirements + registry.implementation_state.claim_parser_not_implemented_requirements,
  legacy_v2_ids_synthesized: 0,
  duplicate_sdk_or_runtime_introduced: 0,
  automatic_activation_registered: 'UPSTREAM_WORKFLOW_ONLY',
  evidence_admitted: 0,
  market_events_created: 0,
  public_release: 'HOLD',
  production: 'HOLD',
  g5: 'HOLD',
}, null, 2));
