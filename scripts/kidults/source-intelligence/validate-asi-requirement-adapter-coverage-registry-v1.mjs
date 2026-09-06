#!/usr/bin/env node
import fs from 'node:fs';
import {
  AUTHORITATIVE_INPUT_FILE_KEYS,
  MANIFEST_ALLOWLIST,
  RECEIPT_ALLOWLIST,
  VOLATILE_PROVENANCE_EXCLUSIONS,
} from './build-asi-requirement-adapter-coverage-semantic-input-v1.mjs';

const files = {
  contract: 'coordination/kidults/source-intelligence/asi-requirement-adapter-coverage-contract-v1.json',
  registry: 'coordination/kidults/source-intelligence/asi-requirement-adapter-coverage-registry-v1.json',
  builder: 'scripts/kidults/source-intelligence/build-asi-requirement-adapter-coverage-v1.mjs',
  validator: 'scripts/kidults/source-intelligence/validate-asi-requirement-adapter-coverage-v1.mjs',
  artifactBindingSchema: 'coordination/kidults/schemas/asi-autonomous-resolution-artifact-binding-v1.schema.json',
  purposeRightsPreflight: 'coordination/kidults/source-intelligence/top16-empirical-activation-preflight-v1.json',
  purposeRightsGate: 'scripts/kidults/source-intelligence/lib/source-purpose-rights-gate-v1.mjs',
  semanticInputProjector: 'scripts/kidults/source-intelligence/build-asi-requirement-adapter-coverage-semantic-input-v1.mjs',
  canonicalGuardResolver: 'scripts/kidults/source-intelligence/resolve-asi-requirement-adapter-coverage-canonical-guard-v1.mjs',
  canonicalGuardValidator: 'scripts/kidults/source-intelligence/validate-asi-requirement-adapter-coverage-canonical-guard-v1.mjs',
  safeZipValidator: 'scripts/kidults/kpmo/validate-safe-zip-archive-v1.py',
  safeZipNegativeTests: 'scripts/kidults/kpmo/validate-safe-zip-archive-v1.test.py',
  strictExpiryParser: 'scripts/kidults/kpmo/read-strict-json-boolean-v1.mjs',
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
const runHistoryPath = 'scripts/kidults/source-intelligence/resolve-asi-orchestration-run-history-v1.mjs';
assert(fs.existsSync(runHistoryPath), `RUN_HISTORY_ASSET_MISSING:${runHistoryPath}`);

const contract = json(files.contract);
const registry = json(files.registry);
const artifactBindingSchema = json(files.artifactBindingSchema);
const builder = read(files.builder);
const validator = read(files.validator);
const workflow = read(files.workflow);
const runHistory = read(runHistoryPath);
const semanticInputProjector = read(files.semanticInputProjector);
const documentation = read(files.documentation);
const strictExpiryParser = read(files.strictExpiryParser);
const principles = ['AUTONOMOUS', 'GLOBAL', 'IRREPLACEABLE_VALUE', 'TRANSPARENT'];

assert(contract.id === 'kidults-asi-requirement-adapter-coverage-contract-v1' && contract.version === '1.2.0', 'CONTRACT_ID_VERSION');
assert(artifactBindingSchema.additionalProperties === false && artifactBindingSchema.properties?.version?.const === '1.3.0', 'ARTIFACT_BINDING_SCHEMA_VERSION_STRICTNESS');
assert(artifactBindingSchema.properties?.production_authorized?.const === false && !Object.hasOwn(artifactBindingSchema.properties || {}, 'production_eligible'), 'ARTIFACT_BINDING_SCHEMA_PRODUCTION_AUTHORITY');
assert(artifactBindingSchema.properties?.upstream_class?.const === 'ASI_AUTONOMOUS_RESOLUTION' && artifactBindingSchema.required?.includes('canonical_run_key'), 'ARTIFACT_BINDING_SCHEMA_CANONICAL_RUN_IDENTITY');
assert(contract.status === 'ACTIVE_MANDATORY_FAIL_CLOSED_AFTER_MAIN_MERGE', 'CONTRACT_STATUS');
assert(same(contract.platform_principles, principles), 'CONTRACT_PRINCIPLES');
assert(contract.canonical_grain?.expected_mission_count === 192 && contract.canonical_grain?.expected_unique_market_cell_count === 192, 'CONTRACT_MISSION_GRAIN');
assert(contract.canonical_grain?.expected_scope_count === 32 && contract.canonical_grain?.expected_region_count === 3, 'CONTRACT_SCOPE_REGION_COUNTS');
assert(contract.canonical_grain?.expected_domain_count === 8 && contract.canonical_grain?.expected_family_count === 16 && contract.canonical_grain?.expected_requirements_per_family === 12, 'CONTRACT_FAMILY_COUNTS');
assert(contract.canonical_grain?.unmerged_v2_adapter_requirement_id_is_authoritative === false && contract.canonical_grain?.unmerged_v2_adapter_requirement_id_may_be_synthesized === false, 'CONTRACT_V2_ID_BOUNDARY');
assert(contract.canonical_fanout?.upstream_class === 'ASI_AUTONOMOUS_RESOLUTION' && same(contract.canonical_fanout?.workflow_run_identity_fields, ['head_sha', 'upstream_class']) && contract.canonical_fanout?.canonical_run_key === 'head_sha:upstream_class', 'CONTRACT_CANONICAL_FANOUT_IDENTITY');
assert(contract.canonical_fanout?.workflow_run_concurrency_scope === 'job-level head_sha + ASI_AUTONOMOUS_RESOLUTION' && contract.canonical_fanout?.manual_dispatch_concurrency_scope === 'github.run_id' && contract.canonical_fanout?.cancel_in_progress === false && contract.canonical_fanout?.duplicate_workflow_run_fanout_allowed === false, 'CONTRACT_CANONICAL_FANOUT_POLICY');
assert(contract.canonical_fanout?.github_concurrency_semantics === 'ONE_RUNNING_AND_ONE_PENDING_ADDITIONAL_PENDING_RUN_MAY_REPLACE_PRIOR_PENDING' && contract.canonical_fanout?.every_noncanonical_trigger_alias_receipt_guaranteed === false, 'CONTRACT_GITHUB_PENDING_REPLACEMENT_TRUTH');
const canonicalGuard = contract.canonical_fanout?.canonical_guard;
assert(canonicalGuard?.status === 'ACTIVE_EPHEMERAL_ACTIONS_ARTIFACT_GUARD' && canonicalGuard?.eligible_trigger === 'SUCCESSFUL_WORKFLOW_RUN_ONLY' && canonicalGuard?.leader_artifact_retention_days === 90, 'CONTRACT_EPHEMERAL_GUARD');
assert(canonicalGuard?.manual_recovery === 'NON_DEDUPABLE_NON_LEADER_FULL_VALIDATION' && canonicalGuard?.manual_may_impersonate_canonical === false, 'CONTRACT_MANUAL_RECOVERY_BOUNDARY');
assert(canonicalGuard?.runtime_exactly_once_claimed === false && canonicalGuard?.remote_ledger_state === 'REMOTE_LEDGER_ACTIVATION_HOLD', 'CONTRACT_DURABLE_DEDUPE_HOLD');
const semanticProjection = canonicalGuard?.semantic_input_projection;
assert(semanticProjection?.version === '1.0.0' && semanticProjection?.replacement_queue === 'FULL_DETERMINISTIC_OBJECT', 'CONTRACT_SEMANTIC_PROJECTION_VERSION');
assert(same(semanticProjection?.manifest_allowlist, MANIFEST_ALLOWLIST) && same(semanticProjection?.receipt_allowlist, RECEIPT_ALLOWLIST), 'CONTRACT_SEMANTIC_PROJECTION_ALLOWLIST');
assert(same(semanticProjection?.authoritative_input_file_keys, AUTHORITATIVE_INPUT_FILE_KEYS) && semanticProjection?.non_file_authoritative_inputs === 'BOUND_AS_KEY_VALUE_CONSTANTS', 'CONTRACT_SEMANTIC_AUTHORITATIVE_INPUT_BINDING');
assert(same(semanticProjection?.volatile_exact_provenance_excluded, VOLATILE_PROVENANCE_EXCLUSIONS) && semanticProjection?.exact_provenance_location === 'LEADER_OR_ALIAS_OBSERVATION_RECEIPT_ONLY', 'CONTRACT_SEMANTIC_EXACT_PROVENANCE_BOUNDARY');
assert(semanticProjection?.serialized_material_digest_recomputation_required === true && semanticProjection?.canonical_artifact_must_embed_semantic_receipt === true && semanticProjection?.semantic_receipt_exact_file_digest_readback_required === true, 'CONTRACT_SEMANTIC_RECEIPT_READBACK');
const archiveLimits = contract.canonical_fanout?.archive_pre_extraction_limits;
assert(archiveLimits?.max_compressed_bytes === 4194304 && archiveLimits?.max_entries === 256 && archiveLimits?.max_entry_uncompressed_bytes === 8388608 && archiveLimits?.max_total_uncompressed_bytes === 33554432 && archiveLimits?.max_compression_ratio === 100, 'CONTRACT_ARCHIVE_RESOURCE_LIMITS');
assert(archiveLimits?.safe_names_required === true && archiveLimits?.regular_files_or_directories_only === true && archiveLimits?.encrypted_entries_allowed === false && archiveLimits?.digest_match_before_extraction_required === true, 'CONTRACT_ARCHIVE_SAFETY_BOUNDARY');
assert(contract.coverage_policy?.registered_claim_is_implemented_claim === false && contract.coverage_policy?.context_classifier_is_claim_parser === false, 'CONTRACT_CLAIM_BOUNDARY');
assert(contract.coverage_policy?.software_coverage_rule === 'ELIGIBLE_CURRENT_SOURCE_WITH_LITERAL_REQUIRED_CLAIM_IN_IMPLEMENTED_CLAIM_PARSERS', 'CONTRACT_SOFTWARE_COVERAGE_RULE');
assert(contract.coverage_policy?.acquisition_eligibility_rule === 'PURPOSE_RIGHTS_PREFLIGHT_DECISION_MUST_EQUAL_RIGHTS_CLEAR_FOR_PURPOSE', 'CONTRACT_ACQUISITION_RIGHTS_RULE');
assert(contract.coverage_policy?.selected_slot_rule === 'FIRST_THREE_RIGHTS_CLEAR_SOURCES_BY_PRIORITY_RANK_THEN_SOURCE_ID', 'CONTRACT_RIGHTS_SLOT_RULE');
assert(same(contract.software_coverage_states, ['SOFTWARE_IMPLEMENTED', 'CONTEXT_ONLY', 'NO_IMPLEMENTED_CLAIM_PARSER']), 'CONTRACT_COVERAGE_STATES');
assert(contract.deprecated_compatibility_metrics?.status === 'READ_ONLY_TRANSLATION_NOT_CANONICAL_STATUS', 'CONTRACT_DEPRECATED_METRICS_STATUS');
assert(contract.deprecated_compatibility_metrics?.software_gap_requirements?.interpretation_forbidden === 'MISSING_INTERNAL_CODE_MODULES', 'CONTRACT_DEPRECATED_SOFTWARE_GAP_BOUNDARY');
assert(contract.deprecated_compatibility_metrics?.unmapped_requirements?.canonical_replacement === 'claim_parser_not_implemented_requirements', 'CONTRACT_DEPRECATED_UNMAPPED_REPLACEMENT');
assert(contract.empirical_state === 'RIGHTS_SCHEMA_ACTIVATION_HOLD' && contract.empirical_hold_reasons?.length === 6, 'CONTRACT_EMPIRICAL_HOLD');
assert(contract.authoritative_inputs?.artifact_binding_schema === files.artifactBindingSchema, 'CONTRACT_ARTIFACT_BINDING_SCHEMA');
assert(contract.gap_queue_operating_model?.record_accountable_owner === 'KPMO' && contract.gap_queue_operating_model?.record_priority === 'P1' && contract.gap_queue_operating_model?.record_queue_state === 'QUEUED_PREREQUISITES_PENDING', 'CONTRACT_GAP_ACCOUNTABILITY');
assert(contract.gap_queue_operating_model?.record_queue_id?.includes('coverage_record_id,gap_class') && contract.gap_queue_operating_model?.record_idempotency_key?.includes('coverage_record_id,gap_class,required_adapter_claim') && contract.gap_queue_operating_model?.work_unit_idempotency_key?.includes('unit_class,grouping_keys'), 'CONTRACT_GAP_IDEMPOTENCY_FORMULAS');
assert(contract.gap_queue_operating_model?.source_discovery_bundle?.expected_work_unit_count === 42 && contract.gap_queue_operating_model?.source_discovery_bundle?.execution_owner === 'TRACK_Z', 'CONTRACT_DISCOVERY_WORK_UNITS');
assert(contract.gap_queue_operating_model?.schema_bound_source_claim_unit?.expected_work_unit_count === 10 && contract.gap_queue_operating_model?.schema_bound_source_claim_unit?.execution_owner === 'TRACK_A', 'CONTRACT_SCHEMA_WORK_UNITS');
assert(contract.gap_queue_operating_model?.source_discovery_bundle?.ack_due_after_successful_canonical_runs === 1 && contract.gap_queue_operating_model?.source_discovery_bundle?.resolution_due_after_successful_canonical_runs === 5 && contract.gap_queue_operating_model?.schema_bound_source_claim_unit?.ack_due_after_successful_canonical_runs === 1 && contract.gap_queue_operating_model?.schema_bound_source_claim_unit?.resolution_due_after_successful_canonical_runs === 3, 'CONTRACT_GAP_SLA_WINDOWS');
assert(same(contract.gap_queue_operating_model?.fallback_paths?.KPMO_TRACK_Z_TRACK_A_GENERIC_DISCOVERY_FALLBACK, ['KPMO_RETAIN_FAIL_CLOSED_HOLD', 'TRACK_Z_IDENTIFY_ALTERNATE_LAWFUL_SOURCE_PROFILE_WITHOUT_CONTACT', 'TRACK_A_VALIDATE_IMMUTABLE_SCHEMA_AND_CLAIM_CAPABILITY']), 'CONTRACT_DISCOVERY_GENERIC_FALLBACK');
assert(same(contract.gap_queue_operating_model?.fallback_paths?.KPMO_TRACK_A_TRACK_Z_GENERIC_SCHEMA_FALLBACK, ['KPMO_RETAIN_FAIL_CLOSED_HOLD', 'TRACK_A_VALIDATE_COMPATIBLE_SCHEMA_OR_PRESERVE_MISSING', 'TRACK_Z_IDENTIFY_ALTERNATE_RIGHTS_CLEAR_SOURCE_ROUTE_WITHOUT_CONTACT']), 'CONTRACT_SCHEMA_GENERIC_FALLBACK');
assert(contract.gap_queue_operating_model?.external_contact_authorized === false && contract.gap_queue_operating_model?.live_source_request_authorized === false && contract.gap_queue_operating_model?.adapter_activation_authorized === false && contract.gap_queue_operating_model?.production_authorized === false, 'CONTRACT_GAP_AUTHORITY');
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
assert(baseline.accountable_gap_records === 153 && baseline.gap_records_with_sla === 153 && baseline.gap_records_with_idempotency_key === 153 && baseline.gap_records_with_generic_fallback === 153, 'CONTRACT_GAP_ACCOUNTABILITY_BASELINE');
assert(baseline.gap_work_units === 52 && baseline.source_discovery_work_units === 42 && baseline.schema_bound_source_claim_work_units === 10, 'CONTRACT_GAP_WORK_UNIT_BASELINE');
assert(baseline.rights_schema_activation_hold_requirements === 192 && baseline.evidence_admitted === 0 && baseline.market_events_created === 0, 'CONTRACT_EMPIRICAL_BASELINE');
assert(contract.truth_boundary?.software_lineage_only === true && contract.truth_boundary?.live_source_request_executed === false && contract.truth_boundary?.provider_contact_executed === false, 'CONTRACT_LIVE_BOUNDARY');
assert(contract.truth_boundary?.rights_pass_created === false && contract.truth_boundary?.source_adapter_activated === false, 'CONTRACT_ACTIVATION_BOUNDARY');
assert(contract.truth_boundary?.evidence_admitted === 0 && contract.truth_boundary?.market_events_created === 0 && contract.truth_boundary?.snapshot_candidates_created === 0, 'CONTRACT_EVIDENCE_BOUNDARY');
assert(contract.truth_boundary?.public_release === 'HOLD' && contract.truth_boundary?.production === 'HOLD' && contract.truth_boundary?.g5 === 'HOLD', 'CONTRACT_RELEASE_BOUNDARY');
assert(contract.truth_boundary?.main_scope_validated_is_production_authority === false && contract.truth_boundary?.production_authorized === false, 'CONTRACT_PRODUCTION_AUTHORITY_BOUNDARY');

assert(registry.id === 'kidults-asi-requirement-adapter-coverage-registry-v1' && registry.version === '1.2.0', 'REGISTRY_ID_VERSION');
assert(registry.status === 'REGISTERED_FAIL_CLOSED_AFTER_MAIN_MERGE', 'REGISTRY_STATUS');
assert(same(registry.platform_principles, principles), 'REGISTRY_PRINCIPLES');
for (const [name, expected] of Object.entries({
  contract: files.contract,
  registry: files.registry,
  builder: files.builder,
  validator: files.validator,
  artifact_binding_schema: files.artifactBindingSchema,
  purpose_rights_preflight: files.purposeRightsPreflight,
  purpose_rights_gate: files.purposeRightsGate,
  semantic_input_projector: files.semanticInputProjector,
  canonical_guard_resolver: files.canonicalGuardResolver,
  canonical_guard_validator: files.canonicalGuardValidator,
  safe_zip_validator: files.safeZipValidator,
  safe_zip_negative_tests: files.safeZipNegativeTests,
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
assert(registry.implementation_state?.accountable_gap_records === 153 && registry.implementation_state?.gap_records_with_sla === 153 && registry.implementation_state?.gap_records_with_idempotency_key === 153 && registry.implementation_state?.gap_records_with_generic_fallback === 153, 'REGISTRY_GAP_ACCOUNTABILITY_COUNTS');
assert(registry.implementation_state?.gap_work_units === 52 && registry.implementation_state?.source_discovery_work_units === 42 && registry.implementation_state?.schema_bound_source_claim_work_units === 10, 'REGISTRY_GAP_WORK_UNIT_COUNTS');
assert(registry.implementation_state?.rights_schema_activation_hold_requirements === 192, 'REGISTRY_HOLD_COUNT');
assert(registry.implementation_state?.unmerged_v2_ids_synthesized === 0 && registry.implementation_state?.duplicate_sdk_or_runtime_introduced === 0, 'REGISTRY_FORBIDDEN_ASSET_COUNTS');
assert(registry.implementation_state?.evidence_admitted === 0 && registry.implementation_state?.market_events_created === 0, 'REGISTRY_EMPIRICAL_COUNTS');
assert(registry.automatic_activation?.main_push === false && registry.automatic_activation?.schedule === 'UPSTREAM_WORKFLOW_ONLY', 'REGISTRY_AUTOMATIC_TRIGGER');
assert(same(registry.automatic_activation?.upstream_workflows, ['KIDULTS ASI Autonomous Resolution Layer v1']), 'REGISTRY_UPSTREAM_WORKFLOWS');
assert(registry.automatic_activation?.upstream_class === 'ASI_AUTONOMOUS_RESOLUTION' && registry.automatic_activation?.workflow_run_canonical_key === 'head_sha:ASI_AUTONOMOUS_RESOLUTION', 'REGISTRY_CANONICAL_FANOUT_IDENTITY');
assert(registry.automatic_activation?.workflow_run_duplicate_fanout_allowed === false && registry.automatic_activation?.workflow_run_cancel_in_progress === false && registry.automatic_activation?.manual_dispatch_concurrency_scope === 'github.run_id', 'REGISTRY_CANONICAL_FANOUT_POLICY');
assert(registry.automatic_activation?.workflow_run_guard_state === 'ACTIVE_EPHEMERAL_ACTIONS_ARTIFACT_GUARD' && registry.automatic_activation?.workflow_run_guard_retention_days === 90 && registry.automatic_activation?.workflow_run_exactly_once_durable === false, 'REGISTRY_EPHEMERAL_GUARD');
assert(registry.automatic_activation?.workflow_run_semantic_projection_version === '1.0.0' && registry.automatic_activation?.workflow_run_exact_provenance_in_semantic_identity === false && registry.automatic_activation?.workflow_run_exact_provenance_in_observation_receipt === true, 'REGISTRY_SEMANTIC_PROVENANCE_BOUNDARY');
assert(registry.automatic_activation?.workflow_run_canonical_artifact_embeds_semantic_receipt === true && registry.automatic_activation?.workflow_run_semantic_receipt_exact_file_readback_required === true, 'REGISTRY_SEMANTIC_RECEIPT_READBACK');
assert(registry.automatic_activation?.every_noncanonical_trigger_alias_receipt_guaranteed === false && registry.automatic_activation?.github_pending_replacement_caveat === 'ONE_RUNNING_ONE_PENDING_ADDITIONAL_PENDING_MAY_REPLACE_PRIOR_PENDING' && registry.automatic_activation?.remote_ledger_state === 'REMOTE_LEDGER_ACTIVATION_HOLD', 'REGISTRY_DEDUPE_TRUTH_BOUNDARY');
assert(registry.automatic_activation?.manual_dispatch_role === 'RECOVERY_OR_EXPLICIT_REPLAY_ONLY' && registry.automatic_activation?.manual_dispatch_alias_eligible === false && registry.automatic_activation?.manual_dispatch_canonical_leader_eligible === false, 'REGISTRY_MANUAL_ROLE');
assert(registry.continuation?.automatic_continuation_required === true && registry.continuation?.source_discovery_and_schema_activation_queue_output === 'requirement-adapter-gap-queue-v1.json', 'REGISTRY_CONTINUATION');
assert(registry.continuation?.queue_record_owner === 'KPMO' && registry.continuation?.source_discovery_execution_owner === 'TRACK_Z' && registry.continuation?.schema_bound_execution_owner === 'TRACK_A' && registry.continuation?.generic_fail_closed_fallbacks_only === true, 'REGISTRY_CONTINUATION_ACCOUNTABILITY');
assert(registry.truth_boundary?.artifact_must_be_successful_nonexpired_main_lineage === true, 'REGISTRY_ARTIFACT_BOUNDARY');
assert(registry.truth_boundary?.software_implemented_is_empirically_ready === false, 'REGISTRY_EMPIRICAL_READINESS_BOUNDARY');
assert(registry.truth_boundary?.evidence_admitted === 0 && registry.truth_boundary?.market_events_created === 0 && registry.truth_boundary?.projections_created === 0, 'REGISTRY_PROMOTION_BOUNDARY');
assert(registry.truth_boundary?.public_release === 'HOLD' && registry.truth_boundary?.production === 'HOLD' && registry.truth_boundary?.g5 === 'HOLD', 'REGISTRY_RELEASE_BOUNDARY');
assert(registry.truth_boundary?.main_scope_validated_is_production_authority === false && registry.truth_boundary?.production_authorized === false, 'REGISTRY_PRODUCTION_AUTHORITY_BOUNDARY');

for (const source of [builder, validator]) {
  assert(!source.includes('claim-suitable-adapter-sdk'), 'STALE_PARALLEL_SDK_REFERENCE');
  assert(!source.includes('replacement-mission-queue-v2.json'), 'UNMERGED_V2_REPLACEMENT_QUEUE_REFERENCE');
  assert(!source.includes('adapter-requirement-queue-v2.json'), 'UNMERGED_V2_ADAPTER_QUEUE_REFERENCE');
}
for (const marker of [
  'PROJECTION_VERSION',
  'MANIFEST_ALLOWLIST',
  'RECEIPT_ALLOWLIST',
  'AUTHORITATIVE_INPUT_FILE_KEYS',
  'authoritative_input_constants',
  'volatile_provenance_excluded_from_identity',
  'npm-shrinkwrap.json',
  'SEMANTIC_RECEIPT_WRITE_READ_DIGEST_MISMATCH',
]) assert(semanticInputProjector.includes(marker), `SEMANTIC_INPUT_PROJECTOR_CONTROL_MARKER:${marker}`);
for (const marker of [
  'REPLACEMENT_QUEUE_ID_VERSION',
  'implemented_claim_parsers',
  'REGISTERED_CLAIM_INHERITANCE_FORBIDDEN',
  'CONTEXT_AS_PARSER_FORBIDDEN',
  'source_sha_ancestor_of_consumer',
  'upstream_class',
  'canonical_run_key',
  'main_scope_validated',
  'production_authorized',
  'accountable_owner',
  'idempotency_key',
  'fallback_path',
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
  'run-name: KIDULTS Coverage /',
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
  'Reject production authority and legacy eligibility mutations',
  'bad-autonomous-resolution-canonical-run-key-v1.json',
  'Reject unaccountable or non-idempotent gap queue mutations',
  'Reject unbound upstream digest mutation',
  'Reject silent-drop and duplicate-grain mutations',
  'top16-empirical-activation-preflight-v1.json',
  'validate-safe-zip-archive-v1.py',
  'resolve-asi-requirement-adapter-coverage-canonical-guard-v1.mjs',
  'build-asi-requirement-adapter-coverage-semantic-input-v1.mjs',
  'coverage-semantic-input-receipt-v1.json',
  'SEMANTIC_INPUT_RECEIPT_DIGEST',
  '--mode coverage-exact-producer',
  '--mode coverage-prior-success',
  'KIDULTS_COVERAGE_EXECUTE_FULL',
  'Publish successful bounded Coverage canonical leader artifact',
  'retention-days: 90',
]) assert(workflow.includes(marker), `WORKFLOW_CONTROL_MARKER:${marker}`);
const canonicalCoverageConcurrency = "group: kidults-asi-requirement-adapter-coverage-v1-${{ github.event_name == 'workflow_run' && format('{0}-{1}', github.event.workflow_run.head_sha, 'ASI_AUTONOMOUS_RESOLUTION') || github.run_id }}";
assert(workflow.includes(canonicalCoverageConcurrency) && workflow.includes('cancel-in-progress: false'), 'WORKFLOW_CANONICAL_FANOUT_CONCURRENCY');
assert(workflow.indexOf(canonicalCoverageConcurrency) > workflow.indexOf('verify-requirement-adapter-coverage:'), 'WORKFLOW_JOB_LEVEL_CONCURRENCY_REQUIRED');
assert(workflow.includes('-f name="$CANONICAL_ARTIFACT_NAME"'), 'WORKFLOW_EXACT_CANONICAL_ARTIFACT_LOOKUP');
assert(workflow.includes('-f branch=main -f head_sha="$SOURCE_SHA" -f event=workflow_run -f status=success'), 'WORKFLOW_PRIOR_SUCCESS_EXACT_SERVER_FILTERS');
assert(workflow.includes("if: success() && env.KIDULTS_COVERAGE_EXECUTE_FULL == 'true' && env.KIDULTS_COVERAGE_EPHEMERAL_LEADER == 'true'"), 'WORKFLOW_FINAL_LEADER_PUBLICATION_GUARD');
assert(workflow.includes("upstream_class:upstreamClass") && workflow.includes("canonical_run_key:canonicalRunKey"), 'WORKFLOW_CANONICAL_RUN_BINDING');
assert(!/^\s{2}(schedule|push|pull_request):/m.test(workflow), 'WORKFLOW_UNBOUND_TRIGGER_FORBIDDEN');
assert(!workflow.includes('/actions/artifacts?per_page='), 'WORKFLOW_GLOBAL_ARTIFACT_LISTING_FORBIDDEN');
assert(workflow.includes('/actions/runs/${RUN_ID}/artifacts?per_page=100'), 'WORKFLOW_EXACT_RUN_ARTIFACT_BINDING');
assert(workflow.includes("consumer_event:process.env.GITHUB_EVENT_NAME"), 'WORKFLOW_CONSUMER_EVENT_BINDING_MISSING');
assert(workflow.includes("exact_triggering_run_bound:process.env.GITHUB_EVENT_NAME==='workflow_run'"), 'WORKFLOW_EXACT_TRIGGER_CONSUMER_SEMANTICS');
assert(workflow.includes("authoritative_producer_event:run.event==='workflow_run'"), 'WORKFLOW_AUTHORITATIVE_PRODUCER_EVENT_MISSING');
assert(workflow.includes('AUTHORITATIVE_PRODUCER_CARDINALITY') && workflow.includes('test "$AUTHORITATIVE_PRODUCER_CARDINALITY" = 1'), 'WORKFLOW_DUPLICATE_PRODUCER_REJECTION_MISSING');
assert(workflow.includes('read-strict-json-boolean-v1.mjs --self-test') && workflow.includes('read-strict-json-boolean-v1.mjs expired'), 'WORKFLOW_STRICT_EXPIRY_PARSER_MISSING');
assert(!workflow.includes('.expired // true'), 'WORKFLOW_UNSAFE_EXPIRY_BOOLEAN_COALESCING');
assert(strictExpiryParser.includes("typeof value[field] !== 'boolean'") && strictExpiryParser.includes('Object.prototype.hasOwnProperty.call(value, field)'), 'STRICT_EXPIRY_PARSER_CONTRACT');
assert(runHistory.includes('AUTONOMOUS_RESOLUTION_RECEIPT_PRODUCER_IDENTITY_MISMATCH'), 'WORKFLOW_PRODUCER_RECEIPT_IDENTITY_MISSING');
assert(runHistory.includes('COVERAGE_PRIOR_SUCCESS_TITLE_FILTER_DRIFT') && runHistory.includes('pagination_required_for_count: false'), 'WORKFLOW_PRIOR_SUCCESS_EXACT_QUERY_GUARD_MISSING');
for (const pin of [
  'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1',
  'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020',
  'actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02',
]) assert(workflow.includes(pin), `WORKFLOW_ACTION_NOT_IMMUTABLY_PINNED:${pin}`);
assert(documentation.includes('39 / 192') && documentation.includes('RIGHTS_SCHEMA_ACTIVATION_HOLD'), 'DOCUMENTATION_BASELINE_OR_BOUNDARY');
assert(documentation.includes('RIGHTS_CLEAR_FOR_PURPOSE') && documentation.includes('adapter-acquisition backlog items'), 'DOCUMENTATION_RIGHTS_FIRST_BOUNDARY');
assert(documentation.includes('latest exact-main producer at execution time') && documentation.includes('KPMO receipt'), 'DOCUMENTATION_DYNAMIC_EVIDENCE_BINDING');
assert(documentation.includes('`main_scope_validated`') && documentation.includes('`production_authorized: false`'), 'DOCUMENTATION_PRODUCTION_AUTHORITY_SEMANTICS');
assert(documentation.includes('42') && documentation.includes('10') && documentation.includes('KPMO') && documentation.includes('Track Z') && documentation.includes('Track A'), 'DOCUMENTATION_GAP_WORK_UNITS');
assert(documentation.includes('`head_sha + ASI_AUTONOMOUS_RESOLUTION`') && documentation.includes('`canonical_run_key`'), 'DOCUMENTATION_CANONICAL_FANOUT');

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
