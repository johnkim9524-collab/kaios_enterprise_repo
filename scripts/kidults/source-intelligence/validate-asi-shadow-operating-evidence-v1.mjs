#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  buildAsiShadowOperatingEvidence,
  fingerprint,
  stable
} from "./build-asi-shadow-operating-evidence-v1.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "../../..");
const contractPath = path.join(repositoryRoot, "coordination/kidults/source-intelligence/asi-shadow-operating-evidence-contract-v1.json");
const defaultInputPath = path.join(repositoryRoot, "artifacts/agci-os/asi-shadow-operating-evidence-v1.json");
const localRealSourceHarnessMode =
  "LOCAL_QUEUE_D1_COMPATIBLE_DEV_SHADOW_HARNESS_IMPLEMENTED_WORKFLOW_ATTESTATION_NOT_INCLUDED";
const requiredApprovedCalibrationStrata = Object.freeze([
  {
    stratum_id: "er-stratum-designer-maker-edition",
    archetype: "DESIGNER_MAKER_EDITION",
    status: "APPROVED_REQUIRED",
    minimum_case_classes: ["HARD_NEGATIVE", "SAME_DESIGN_DIFFERENT_OBJECT", "SAME_OBJECT_NORMALIZATION"],
    minimum_boundaries: ["CANONICAL_DESIGN", "PHYSICAL_OBJECT", "SOURCE_RECORD"]
  },
  {
    stratum_id: "er-stratum-graded-population",
    archetype: "GRADED_POPULATION",
    status: "APPROVED_REQUIRED",
    minimum_case_classes: ["CROSS_MARKET_ALIAS", "HARD_NEGATIVE", "SAME_OBJECT_NORMALIZATION"],
    minimum_boundaries: ["PHYSICAL_OBJECT", "SOURCE_RECORD"]
  },
  {
    stratum_id: "er-stratum-pressing-edition-media",
    archetype: "PRESSING_EDITION_MEDIA",
    status: "APPROVED_REQUIRED",
    minimum_case_classes: ["CROSS_MARKET_ALIAS", "HARD_NEGATIVE", "SAME_OBJECT_NORMALIZATION"],
    minimum_boundaries: ["PHYSICAL_OBJECT", "SOURCE_RECORD"]
  },
  {
    stratum_id: "er-stratum-provenance-unique-object",
    archetype: "PROVENANCE_UNIQUE_OBJECT",
    status: "APPROVED_REQUIRED",
    minimum_case_classes: ["AMBIGUOUS_REVIEW_REQUIRED", "HARD_NEGATIVE", "TRANSACTION_TO_OBJECT_LINKAGE"],
    minimum_boundaries: ["MARKET_EVENT", "PHYSICAL_OBJECT"]
  },
  {
    stratum_id: "er-stratum-serialized-reference",
    archetype: "SERIALIZED_REFERENCE",
    status: "APPROVED_REQUIRED",
    minimum_case_classes: ["CROSS_MARKET_ALIAS", "HARD_NEGATIVE", "SAME_OBJECT_NORMALIZATION"],
    minimum_boundaries: ["PHYSICAL_OBJECT", "SOURCE_RECORD"]
  },
  {
    stratum_id: "er-stratum-variant-release-heavy",
    archetype: "VARIANT_RELEASE_HEAVY",
    status: "APPROVED_REQUIRED",
    minimum_case_classes: ["CROSS_MARKET_ALIAS", "HARD_NEGATIVE", "SAME_OBJECT_NORMALIZATION"],
    minimum_boundaries: ["PHYSICAL_OBJECT", "SOURCE_RECORD"]
  },
  {
    stratum_id: "er-stratum-vehicle-mechanical-asset",
    archetype: "VEHICLE_MECHANICAL_ASSET",
    status: "APPROVED_REQUIRED",
    minimum_case_classes: ["HARD_NEGATIVE", "SAME_DESIGN_DIFFERENT_OBJECT", "SAME_OBJECT_NORMALIZATION"],
    minimum_boundaries: ["CANONICAL_DESIGN", "PHYSICAL_OBJECT", "SOURCE_RECORD"]
  }
]);
const requiredCandidateHandoffBlockedSelftestBlockers = Object.freeze([
  "BLIND_CRITICAL_FALSE_AUTO_MERGE_NONZERO_OR_UNMEASURED",
  "CLAIM_STRENGTH_EXCEEDS_EVIDENCE:selftest-current-market-claim-r2",
  "CRITICAL_FALSE_AUTO_MERGE_NONZERO_OR_UNMEASURED",
  "CURRENT_CLAIM_WITHOUT_CURRENT_EVIDENCE:selftest-current-market-claim-r2",
  "ENTITY_RESOLUTION_BLIND_LT_TARGET",
  "ENTITY_RESOLUTION_BLIND_WILSON_LT_TARGET",
  "ENTITY_RESOLUTION_OVERALL_LT_TARGET",
  "ENTITY_RESOLUTION_OVERALL_WILSON_LT_TARGET",
  "ER_AGGREGATE_SAMPLE_FLOORS_NOT_MET",
  "ER_BLIND_HOLDOUT_FREEZE_REQUIRED",
  "ER_BLIND_SCOPE_ARCHETYPE_SAMPLE_FLOORS_NOT_MET",
  "ER_CALIBRATION_ARTIFACT_REQUIRED",
  "ER_CANONICAL_APPROVED_STRATA_BINDING_MISMATCH",
  "ER_CANONICAL_APPROVED_STRATA_SET_INCOMPLETE",
  "ER_CANONICAL_SAMPLE_POLICY_BINDING_MISMATCH",
  "ER_CASE_CLASS_SAMPLE_FLOORS_NOT_MET",
  "ER_CONSTRUCTED_CONTROL_NOT_EMPIRICAL",
  "ER_EMPIRICAL_ATTESTATION_REQUIRED",
  "ER_EMPIRICAL_BENCHMARK_NOT_ELIGIBLE",
  "ER_EMPIRICAL_OBSERVATION_COUNTS_INVALID",
  "ER_FINAL_DATASET_DIGEST_REQUIRED",
  "ER_FINAL_DATASET_NOT_REAL_WORLD_LABELED",
  "ER_FINAL_DATASET_REQUIRED",
  "ER_FINAL_SCOPE_STRATIFICATION_NOT_COMPLETE",
  "ER_IDENTITY_BOUNDARY_SAMPLE_FLOORS_NOT_MET",
  "ER_REQUIRED_STRATA_INCOMPLETE",
  "ER_SCOPE_ARCHETYPE_SAMPLE_FLOORS_NOT_MET",
  "EVIDENCE_PACKAGE_DIGEST_REQUIRED",
  "EVIDENCE_PACKAGE_NOT_IMMUTABLE",
  "SNAPSHOT_DIGEST_REQUIRED"
]);

function evidenceFingerprint(evidence) {
  const { evidence_fingerprint: ignored, ...unsigned } = evidence;
  return fingerprint(unsigned);
}

function canonicalJson(value) {
  return JSON.stringify(stable(value));
}

export function evidenceErrors(evidence, expected, contract) {
  const errors = [];
  const check = (condition, code) => { if (!condition) errors.push(code); };
  const actualObservations = new Map((evidence.failure_observations ?? []).map(item => [item.observation_id, item]));

  check(evidence.id === "kidults-asi-shadow-operating-evidence-v1", "EVIDENCE_ID_MISMATCH");
  check(evidence.status === "LOCAL_SHADOW_OPERATING_EVIDENCE_PASS_NOT_DEPLOYED", "EVIDENCE_STATUS_MISMATCH");
  check(evidence.evidence_fingerprint === evidenceFingerprint(evidence), "EVIDENCE_FINGERPRINT_MISMATCH");
  check(canonicalJson(evidence) === canonicalJson(expected), "EVIDENCE_NOT_CURRENT_WITH_CANONICAL_INPUTS_AND_TESTS");

  check(evidence.execution_truth?.registered_processor_count === expected.execution_truth.registered_processor_count,
    "PROCESSOR_COUNT_INFLATED_OR_STALE");
  check(evidence.execution_truth?.exercised_processor_count === evidence.execution_truth?.registered_processor_count,
    "ALL_REGISTERED_PROCESSORS_NOT_EXERCISED");
  check(evidence.execution_truth?.network_requests_during_processor_e2e === 0, "PROCESSOR_E2E_NETWORK_REQUEST_DETECTED");
  check(evidence.execution_truth?.full_platform_runtime_verified === false, "FULL_PLATFORM_RUNTIME_OVERCLAIM");
  check(evidence.execution_truth?.remote_resources_verified === false, "REMOTE_RESOURCE_VERIFICATION_OVERCLAIM");
  check(evidence.execution_truth?.remote_deployment_verified === false, "REMOTE_DEPLOYMENT_OVERCLAIM");
  check(evidence.execution_truth?.deployed_runtime_count === 0, "DEPLOYED_RUNTIME_COUNT_OVERCLAIM");
  check(evidence.execution_truth?.sealed_evidence_live_retrieval_artifact_count === 0 &&
    evidence.execution_truth?.sealed_evidence_bridge_artifact_count === 0 &&
    evidence.execution_truth?.sealed_evidence_real_source_queue_d1_injection_count === 0 &&
    evidence.execution_truth?.sealed_evidence_real_source_retry_dlq_quarantine_execution_count === 0 &&
    evidence.execution_truth?.sealed_evidence_real_source_bridge_processor_mesh_execution ===
      "NOT_RUN_IN_THIS_SEALED_EVIDENCE",
  "REAL_SOURCE_READY_STATE_LAUNDERED_INTO_EXECUTION_EVIDENCE");
  check(Array.isArray(evidence.transitive_provenance?.mainline_rights_admitted_pilot_declarations?.sealed_evidence_live_retrieval_artifact_refs) &&
    evidence.transitive_provenance.mainline_rights_admitted_pilot_declarations.sealed_evidence_live_retrieval_artifact_refs.length === 0 &&
    evidence.transitive_provenance.mainline_rights_admitted_pilot_declarations.sealed_evidence_bridge_artifact_refs.length === 0 &&
    evidence.transitive_provenance.mainline_rights_admitted_pilot_declarations.sealed_evidence_external_workflow_attestation_refs.length === 0,
  "UNSEALED_REAL_SOURCE_ARTIFACT_OR_ATTESTATION_REFERENCE_PRESENT");
  const queueD1Implementation =
    evidence.transitive_provenance?.mainline_real_source_runtime_implementations?.queue_d1_injection;
  const retryDlqImplementation =
    evidence.transitive_provenance?.mainline_real_source_runtime_implementations?.retry_dlq_quarantine;
  check(evidence.execution_truth?.mainline_real_source_queue_d1_implementation_present === true &&
    evidence.execution_truth?.mainline_real_source_retry_dlq_quarantine_implementation_present === true &&
    evidence.execution_truth?.mainline_real_source_harness_implementation_mode === localRealSourceHarnessMode &&
    evidence.execution_truth?.mainline_real_source_harness_remote_execution === false &&
    evidence.execution_truth?.sealed_evidence_original_getty_record_processed === false &&
    queueD1Implementation?.implementation_present === true &&
    queueD1Implementation?.implementation_mode === localRealSourceHarnessMode &&
    queueD1Implementation?.remote_execution === false &&
    queueD1Implementation?.original_getty_record_processed === false &&
    queueD1Implementation?.getty_derived_admission_metadata_is_ancillary_on_synthetic_discovery_request === true &&
    queueD1Implementation?.pass_allow_assertions_are_fixture_derived === true &&
    queueD1Implementation?.real_source_admission_metadata_read_by_processors === false &&
    queueD1Implementation?.raw_source_response_preserved === false &&
    queueD1Implementation?.raw_source_response_hash_preserved === false &&
    queueD1Implementation?.raw_source_assertion_binding_preserved === false &&
    canonicalJson(queueD1Implementation?.bridge_payload_hash_scope) ===
      canonicalJson(["record_id", "record_type", "retrieved_at"]) &&
    queueD1Implementation?.external_fetch_forbidden_inside_harness === true &&
    canonicalJson(queueD1Implementation?.script_ref) ===
      canonicalJson(evidence.canonical_code_inputs?.real_source_queue_d1_injection_runner) &&
    canonicalJson(queueD1Implementation?.workflow_ref) ===
      canonicalJson(evidence.canonical_code_inputs?.real_source_queue_d1_injection_workflow) &&
    retryDlqImplementation?.implementation_present === true &&
    retryDlqImplementation?.implementation_mode === localRealSourceHarnessMode &&
    retryDlqImplementation?.remote_execution === false &&
    retryDlqImplementation?.original_getty_record_processed === false &&
    retryDlqImplementation?.getty_derived_admission_metadata_is_ancillary_on_synthetic_discovery_request === true &&
    retryDlqImplementation?.retry_and_unknown_quarantine_are_synthetic_controls === true &&
    retryDlqImplementation?.real_source_admission_metadata_read_by_processors === false &&
    retryDlqImplementation?.remote_durability_proven === false &&
    retryDlqImplementation?.source_failure_empirically_observed === false &&
    retryDlqImplementation?.external_fetch_forbidden_inside_harness === true &&
    canonicalJson(retryDlqImplementation?.script_ref) ===
      canonicalJson(evidence.canonical_code_inputs?.real_source_retry_dlq_quarantine_runner) &&
    canonicalJson(retryDlqImplementation?.workflow_ref) ===
      canonicalJson(evidence.canonical_code_inputs?.real_source_retry_dlq_quarantine_workflow),
  "MAINLINE_LOCAL_HARNESS_IMPLEMENTATION_SEMANTICS_MISMATCH");
  check(evidence.execution_truth?.mainline_workflow_presence_is_sealed_execution_attestation === false &&
    evidence.execution_truth?.sealed_evidence_mainline_workflow_attestation_count === 0 &&
    evidence.transitive_provenance?.mainline_real_source_runtime_implementations
      ?.workflow_presence_is_sealed_execution_attestation === false &&
    Array.isArray(queueD1Implementation?.sealed_execution_attestation_refs) &&
    queueD1Implementation.sealed_execution_attestation_refs.length === 0 &&
    Array.isArray(retryDlqImplementation?.sealed_execution_attestation_refs) &&
    retryDlqImplementation.sealed_execution_attestation_refs.length === 0,
  "MAINLINE_WORKFLOW_PRESENCE_LAUNDERED_INTO_SEALED_EXECUTION");

  const globalRightsR2 = evidence.transitive_provenance?.global_rights_r2_declaration;
  check(globalRightsR2?.count_scope ===
      "GLOBAL_RIGHTS_SOURCE_POOL_EXPANSION_R2_REPOSITORY_DECLARATIONS_ONLY" &&
    globalRightsR2?.declared_source_record_count === 4 &&
    globalRightsR2?.declared_identity_context_source_count === 2 &&
    globalRightsR2?.conditional_market_candidate_count === 2 &&
    globalRightsR2?.strict_r1_revalidated_source_count === 0 &&
    globalRightsR2?.runtime_admitted_source_count === 0 &&
    globalRightsR2?.current_market_evidence_source_count === 0 &&
    globalRightsR2?.independent_legal_review_complete === false &&
    globalRightsR2?.counts_are_additive_to_prior_pilot_declarations === false &&
    Array.isArray(globalRightsR2?.sealed_execution_attestation_refs) &&
    globalRightsR2.sealed_execution_attestation_refs.length === 0,
  "GLOBAL_RIGHTS_R2_DECLARATION_LAUNDERED_INTO_STRICT_R1_OR_LEGAL_CLEARANCE");

  const designerMakerR3 = evidence.transitive_provenance?.designer_maker_r3_repository_declaration;
  check(designerMakerR3?.id === "designer-maker-moma-cooper-admission-r3" &&
    designerMakerR3?.version === "3.0.0" &&
    canonicalJson(designerMakerR3?.canonical_input_ref) === canonicalJson(
      evidence.canonical_inputs?.designer_maker_repository_declared_identity_calibration_admission_r3) &&
    canonicalJson(designerMakerR3?.workflow_ref) === canonicalJson(
      evidence.canonical_code_inputs?.designer_maker_repository_declared_identity_calibration_admission_r3_workflow) &&
    designerMakerR3?.admission_scope === "DESIGNER_MAKER_EDITION_IDENTITY_CALIBRATION_ONLY" &&
    designerMakerR3?.admission_class === "REPOSITORY_DECLARED_IDENTITY_CALIBRATION_METADATA_ONLY" &&
    designerMakerR3?.admitted_state_definition ===
      "ADMITTED_MEANS_REPOSITORY_DECLARED_FOR_BOUNDED_INTERNAL_IDENTITY_CALIBRATION_METADATA_ONLY" &&
    canonicalJson(designerMakerR3?.source_ids) === canonicalJson([
      "cooper-hewitt-collection-json", "moma-collection-research-dataset"
    ]) &&
    designerMakerR3?.repository_declared_identity_calibration_metadata_source_count === 2 &&
    designerMakerR3?.strict_r1_evidence_bound_admitted_source_count === 0 &&
    designerMakerR3?.full_source_pool_admitted_source_count === 0 &&
    designerMakerR3?.current_market_ready_source_count === 0 &&
    designerMakerR3?.runtime_admitted_source_count === 0 &&
    designerMakerR3?.image_admitted_source_count === 0 &&
    designerMakerR3?.repository_declaration_only === true &&
    designerMakerR3?.strict_r1_evidence_bound_revalidation_complete === false &&
    designerMakerR3?.independent_legal_review_complete === false &&
    designerMakerR3?.source_content_bytes_archived === false &&
    designerMakerR3?.source_content_archive_state === "NOT_ARCHIVED" &&
    designerMakerR3?.live_workflow_probe_is_archival_or_independent_review_evidence === false &&
    designerMakerR3?.current_market_claim_authorized === false &&
    designerMakerR3?.full_source_pool_admission_authorized === false &&
    designerMakerR3?.public_release_authorized === false &&
    designerMakerR3?.commercial_use_authorized === false &&
    designerMakerR3?.public_commercial_admission_authorized === false &&
    designerMakerR3?.runtime_admission_authorized === false &&
    designerMakerR3?.runtime_admission_events_emitted === 0 &&
    designerMakerR3?.image_admission_authorized === false &&
    designerMakerR3?.market_observation_count === 0 &&
    designerMakerR3?.production_promotion_authorized === false &&
    designerMakerR3?.production === "HOLD" &&
    designerMakerR3?.purpose_rights_interpretation ===
      "SOURCE_LICENSE_FIELD_USE_CEILING_ONLY_NOT_PLATFORM_ADMISSION_OR_PUBLICATION_AUTHORIZATION" &&
    Array.isArray(designerMakerR3?.sealed_execution_attestation_refs) &&
    designerMakerR3.sealed_execution_attestation_refs.length === 0,
  "DESIGNER_MAKER_R3_REPOSITORY_DECLARATION_LAUNDERED_INTO_STRICT_R1_LEGAL_RUNTIME_MARKET_POOL_OR_PUBLIC");

  const candidateHandoffR2 = evidence.transitive_provenance?.candidate_handoff_r2_downstream_blocked_selftest;
  check(canonicalJson(candidateHandoffR2?.contract_ref) ===
      canonicalJson(evidence.canonical_inputs?.candidate_handoff_preflight_contract_r2) &&
    canonicalJson(candidateHandoffR2?.blocked_selftest_fixture_ref) ===
      canonicalJson(evidence.canonical_inputs?.candidate_handoff_blocked_selftest_r2) &&
    canonicalJson(candidateHandoffR2?.validator_ref) ===
      canonicalJson(evidence.canonical_code_inputs?.candidate_handoff_preflight_validator_r2) &&
    canonicalJson(candidateHandoffR2?.workflow_ref) ===
      canonicalJson(evidence.canonical_code_inputs?.candidate_handoff_preflight_workflow_r2) &&
    candidateHandoffR2?.materiality ===
      "DOWNSTREAM_TRACK_B_SUBMISSION_TRUTH_BOUNDARY_NOT_UPSTREAM_SHADOW_EXECUTION_OR_PROMOTION_EVIDENCE" &&
    candidateHandoffR2?.local_blocked_selftest?.execution_mode ===
      "LOCAL_DETERMINISTIC_BLOCKED_SELFTEST" &&
    candidateHandoffR2?.local_blocked_selftest?.executed === true &&
    candidateHandoffR2?.local_blocked_selftest?.two_run_byte_identical === true &&
    /^sha256:[a-f0-9]{64}$/.test(candidateHandoffR2?.local_blocked_selftest?.result_sha256 ?? "") &&
    candidateHandoffR2?.local_blocked_selftest?.handoff_state === "BLOCKED" &&
    candidateHandoffR2?.local_blocked_selftest?.blocker_count === 30 &&
    canonicalJson(candidateHandoffR2?.local_blocked_selftest?.blockers) ===
      canonicalJson(requiredCandidateHandoffBlockedSelftestBlockers) &&
    candidateHandoffR2?.local_blocked_selftest?.represented_approved_strata_complete === false &&
    candidateHandoffR2?.local_blocked_selftest?.constructed_control === true &&
    candidateHandoffR2?.local_blocked_selftest?.empirical_metrics_present === false &&
    candidateHandoffR2?.local_blocked_selftest?.empirical_attestation_verified === false &&
    candidateHandoffR2?.local_blocked_selftest?.current_market_evidence_present === false &&
    candidateHandoffR2?.current_state === "BLOCKED" &&
    candidateHandoffR2?.ready_semantics === "TRACK_B_SUBMISSION_ELIGIBILITY_ONLY" &&
    Array.isArray(candidateHandoffR2?.sealed_ready_pair_refs) &&
    candidateHandoffR2.sealed_ready_pair_refs.length === 0 &&
    Array.isArray(candidateHandoffR2?.sealed_track_b_submission_refs) &&
    candidateHandoffR2.sealed_track_b_submission_refs.length === 0 &&
    Array.isArray(candidateHandoffR2?.sealed_track_b_assessment_refs) &&
    candidateHandoffR2.sealed_track_b_assessment_refs.length === 0 &&
    Array.isArray(candidateHandoffR2?.sealed_track_b_pass_refs) &&
    candidateHandoffR2.sealed_track_b_pass_refs.length === 0 &&
    candidateHandoffR2?.ready_pair_count === 0 &&
    candidateHandoffR2?.track_b_submission_count === 0 &&
    candidateHandoffR2?.track_b_assessment_count === 0 &&
    candidateHandoffR2?.track_b_pass_count === 0 &&
    candidateHandoffR2?.publication_authorized_count === 0 &&
    candidateHandoffR2?.production_authorized_count === 0 &&
    candidateHandoffR2?.publication === "HOLD" && candidateHandoffR2?.production === "HOLD",
  "CANDIDATE_HANDOFF_BLOCKED_SELFTEST_LAUNDERED_INTO_READY_TRACK_B_PUBLIC_OR_PRODUCTION");

  const erControls = evidence.transitive_provenance?.entity_resolution_control_implementations;
  check(erControls?.synthetic_selftest_mechanics_present === true &&
    erControls?.real_source_constructed_control_implementation_present === true &&
    erControls?.r7efg_constructed_control_extensions_implementation_present === true &&
    erControls?.r7e_declared_output_id ===
      "entity-resolution-live-source-derived-constructed-control-r7e-serialized-minimums" &&
    erControls?.r7e_declared_output_scope ===
      "R7E_PARTIAL_APPROVED_STRATA_5_OF_7_SERIALIZED_COMPLETE_CONSTRUCTED_CONTROL" &&
    erControls?.r7f_declared_output_id ===
      "entity-resolution-live-source-derived-constructed-control-r7f-vehicle-minimums" &&
    erControls?.r7f_declared_output_scope ===
      "R7F_PARTIAL_APPROVED_STRATA_5_OF_7_VEHICLE_AND_SERIALIZED_COMPLETE_CONSTRUCTED_CONTROL" &&
    erControls?.r7g_declared_output_id ===
      "entity-resolution-live-source-derived-constructed-control-r7g-variant-minimums" &&
    erControls?.r7g_declared_output_scope ===
      "R7G_PARTIAL_APPROVED_STRATA_5_OF_7_VARIANT_SERIALIZED_VEHICLE_COMPLETE_CONSTRUCTED_CONTROL" &&
    canonicalJson(erControls?.r7efg_declared_case_count_contract) === canonicalJson({
      r7e: { input_case_count: 9, output_case_count: 10 },
      r7f: { input_case_count: 10, output_case_count: 12 },
      r7g: { input_case_count: 12, output_case_count: 14 }
    }) &&
    erControls?.r7efg_prior_input_sha256_role ===
      "INTEGRITY_ONLY_NOT_AUTHORITY_OR_PROMOTION_EVIDENCE" &&
    erControls?.r7efg_prior_input_sha256_is_sealed_execution_or_empirical_evidence === false &&
    erControls?.r7hi_constructed_control_extensions_implementation_present === true &&
    erControls?.r7h_declared_output_id ===
      "entity-resolution-live-source-derived-constructed-control-r7h-pressing-minimums" &&
    erControls?.r7h_declared_output_scope ===
      "R7H_PARTIAL_APPROVED_STRATA_5_OF_7_FOUR_GRAMMARS_COMPLETE_CONSTRUCTED_CONTROL" &&
    erControls?.r7i_declared_output_id ===
      "entity-resolution-live-source-derived-constructed-control-r7i-provenance-minimums" &&
    erControls?.r7i_declared_output_scope ===
      "R7I_PARTIAL_APPROVED_STRATA_5_OF_7_FIVE_GRAMMARS_COMPLETE_CONSTRUCTED_CONTROL" &&
    canonicalJson(erControls?.r7efghi_declared_case_count_contract) === canonicalJson({
      r7e: { input_case_count: 9, output_case_count: 10 },
      r7f: { input_case_count: 10, output_case_count: 12 },
      r7g: { input_case_count: 12, output_case_count: 14 },
      r7h: { input_case_count: 14, output_case_count: 16 },
      r7i: { input_case_count: 16, output_case_count: 18 }
    }) &&
    erControls?.r7hi_prior_input_sha256_role ===
      "INTEGRITY_ONLY_NOT_AUTHORITY_OR_PROMOTION_EVIDENCE" &&
    erControls?.r7hi_prior_input_sha256_is_sealed_execution_or_empirical_evidence === false &&
    erControls?.r7i_ambiguous_case_declared_expected_decision === "REVIEW" &&
    erControls?.r7i_ambiguous_case_auto_merge_allowed === false &&
    erControls?.r7i_ambiguous_case_auto_split_allowed === false &&
    erControls?.r7j_constructed_control_extension_implementation_present === true &&
    erControls?.r7j_declared_output_id ===
      "entity-resolution-live-source-derived-constructed-control-r7j-designer-maker-minimums" &&
    erControls?.r7j_declared_output_scope ===
      "R7J_PARTIAL_APPROVED_STRATA_6_OF_7_SIX_GRAMMARS_COMPLETE_CONSTRUCTED_CONTROL" &&
    erControls?.r7j_declared_input_case_count === 18 &&
    erControls?.r7j_declared_output_case_count === 21 &&
    erControls?.r7j_declared_represented_grammar_count === 6 &&
    erControls?.r7j_declared_required_grammar_count === 7 &&
    erControls?.r7j_declared_all_required_grammars_complete === false &&
    erControls?.r7j_prior_input_sha256_role ===
      "INTEGRITY_ONLY_NOT_AUTHORITY_OR_PROMOTION_EVIDENCE" &&
    erControls?.r7j_prior_input_sha256_is_sealed_execution_or_empirical_evidence === false &&
    erControls?.finalization_preflight_implementation_present === true &&
    erControls?.current_r7j_finalization_state === "BLOCKED" &&
    canonicalJson(erControls?.current_r7j_finalization_blockers) === canonicalJson([
      "FINALIZE_PER_STRATUM_INCOMPLETE:er-stratum-graded-population",
      "FINALIZE_EMPIRICAL_DATASET_FLAGS_REQUIRED",
      "FINALIZE_CONSTRUCTED_CONTROL_PROHIBITED",
      "FINALIZE_CANONICALLY_APPROVED_EMPIRICAL_ATTESTATION_REQUIRED",
      "FINALIZE_VERIFIED_TRACK_B_EMPIRICAL_ATTESTATION_REQUIRED",
      "FINALIZE_EMPIRICAL_SAMPLE_FLOORS_REQUIRED",
      "FINALIZE_WILSON95_LOWER_BOUNDS_REQUIRED",
      "FINALIZE_ATTESTED_CASE_EVIDENCE_BINDING_REQUIRED",
      "FINALIZE_EMPIRICAL_BENCHMARK_GATE_REQUIRED"
    ]) &&
    erControls?.canonical_approved_empirical_attestation_fingerprint_count === 0 &&
    erControls?.caller_supplied_seven_of_seven_or_empirical_booleans_may_override_canonical_attestation === false &&
    Array.isArray(erControls?.sealed_finalized_dataset_artifact_refs) &&
    erControls.sealed_finalized_dataset_artifact_refs.length === 0 &&
    Array.isArray(erControls?.sealed_finalization_workflow_attestation_refs) &&
    erControls.sealed_finalization_workflow_attestation_refs.length === 0 &&
    erControls?.finalized_dataset_artifact_count_in_sealed_evidence === 0 &&
    erControls?.finalization_execution_evidenced === false &&
    erControls?.finalization_public_claim_or_release_authorized === false &&
    erControls?.finalization_production_authorized === false &&
    erControls?.finalization_production === "HOLD" &&
    erControls?.constructed_controls_are_empirical_benchmark_eligible === false &&
    erControls?.empirical_attestation_required === true &&
    erControls?.per_case_source_evidence_required === true &&
    erControls?.case_source_evidence_binding_required === true &&
    erControls?.case_source_payload_digest_binding_required === true &&
    erControls?.scope_matrix_digest_binding_required === true &&
    erControls?.exact_required_scope_archetype_binding_required === true &&
    erControls?.case_scope_archetype_binding_required === true &&
    erControls?.empirical_sample_floors_required === true &&
    erControls?.wilson_95_lower_bound_gate_required === true &&
    canonicalJson(erControls?.empirical_sample_policy) === canonicalJson({
      minimum_total_cases: 800,
      minimum_blind_holdout_cases: 400,
      minimum_cases_per_required_scope_archetype: 50,
      minimum_blind_cases_per_required_scope_archetype: 25,
      minimum_cases_per_identity_boundary: 100,
      minimum_cases_per_required_case_class: 50,
      wilson_confidence_level: 0.95,
      minimum_overall_accuracy_wilson_lower_bound: 0.99,
      minimum_blind_accuracy_wilson_lower_bound: 0.99
    }) &&
    erControls?.canonical_scope_archetype_mapping_fingerprint ===
      "sha256:2f173938613d832e66bca2ef9f3e695f017ff1a4e37ca0110db9795e7d70bb62" &&
    erControls?.empirical_sample_policy_fingerprint ===
      "sha256:29ac17da78e9020b5a51a756ea265915d862033584e283ff1e21b8fdbf4ec00b" &&
    erControls?.canonical_scope_count === 32 &&
    erControls?.required_scope_archetype_count === 7 &&
    canonicalJson(erControls?.required_scope_archetypes) === canonicalJson(
      contract.canonical_inputs?.entity_resolution_scope_matrix
        ? ["DESIGNER_MAKER_EDITION", "GRADED_POPULATION", "PRESSING_EDITION_MEDIA",
          "PROVENANCE_UNIQUE_OBJECT", "SERIALIZED_REFERENCE", "VARIANT_RELEASE_HEAVY",
          "VEHICLE_MECHANICAL_ASSET"]
        : []) &&
    erControls?.approved_empirical_attestation_manifest_count === 0 &&
    erControls?.empirical_99_percent_evidenced === false &&
    erControls?.per_case_source_evidence_binding_verified === false &&
    erControls?.case_source_evidence_binding_verified === false &&
    erControls?.case_source_payload_binding_verified === false &&
    erControls?.case_license_evidence_binding_verified === false &&
    erControls?.scope_policy_binding_verified === false &&
    erControls?.sample_policy_binding_verified === false &&
    erControls?.empirical_attestation_verified === false &&
    erControls?.required_scope_archetype_coverage_verified === false &&
    erControls?.empirical_sample_floors_verified === false &&
    erControls?.wilson_95_lower_bound_gate_verified === false &&
    erControls?.empirical_benchmark_gate_pass === false &&
    erControls?.pre_track_b_promotion_authorized === false &&
    erControls?.production_promotion_authorized === false &&
    erControls?.empirical_promotion_authorized === false &&
    erControls?.independent_label_review_complete === false &&
    erControls?.label_adjudication_complete === false &&
    erControls?.holdout_sealed_before_modeling === false &&
    erControls?.track_b_pass === false &&
    Array.isArray(erControls?.sealed_dataset_artifact_refs) &&
    erControls.sealed_dataset_artifact_refs.length === 0 &&
    Array.isArray(erControls?.sealed_benchmark_result_refs) &&
    erControls.sealed_benchmark_result_refs.length === 0 &&
    Array.isArray(erControls?.sealed_workflow_attestation_refs) &&
    erControls.sealed_workflow_attestation_refs.length === 0 &&
    Array.isArray(erControls?.sealed_r7efg_dataset_artifact_refs) &&
    erControls.sealed_r7efg_dataset_artifact_refs.length === 0 &&
    Array.isArray(erControls?.sealed_r7efg_benchmark_result_refs) &&
    erControls.sealed_r7efg_benchmark_result_refs.length === 0 &&
    Array.isArray(erControls?.sealed_r7efg_workflow_attestation_refs) &&
    erControls.sealed_r7efg_workflow_attestation_refs.length === 0 &&
    erControls?.r7efg_executed_constructed_control_case_count_in_sealed_evidence === 0 &&
    erControls?.r7efg_chain_execution_evidenced === false &&
    erControls?.r7efg_empirical_benchmark_evidence_present === false &&
    erControls?.r7efg_current_market_evidence_present === false &&
    erControls?.r7efg_production_authorized === false &&
    Array.isArray(erControls?.sealed_r7hi_dataset_artifact_refs) &&
    erControls.sealed_r7hi_dataset_artifact_refs.length === 0 &&
    Array.isArray(erControls?.sealed_r7hi_benchmark_result_refs) &&
    erControls.sealed_r7hi_benchmark_result_refs.length === 0 &&
    Array.isArray(erControls?.sealed_r7hi_workflow_attestation_refs) &&
    erControls.sealed_r7hi_workflow_attestation_refs.length === 0 &&
    erControls?.r7hi_executed_constructed_control_case_count_in_sealed_evidence === 0 &&
    erControls?.r7hi_chain_execution_evidenced === false &&
    erControls?.r7hi_blind_holdout_evidence_present === false &&
    erControls?.r7hi_empirical_benchmark_evidence_present === false &&
    erControls?.r7hi_current_market_evidence_present === false &&
    erControls?.r7hi_public_claim_or_release_authorized === false &&
    erControls?.r7hi_production_authorized === false &&
    Array.isArray(erControls?.sealed_r7j_dataset_artifact_refs) &&
    erControls.sealed_r7j_dataset_artifact_refs.length === 0 &&
    Array.isArray(erControls?.sealed_r7j_benchmark_result_refs) &&
    erControls.sealed_r7j_benchmark_result_refs.length === 0 &&
    Array.isArray(erControls?.sealed_r7j_workflow_attestation_refs) &&
    erControls.sealed_r7j_workflow_attestation_refs.length === 0 &&
    erControls?.r7j_executed_constructed_control_case_count_in_sealed_evidence === 0 &&
    erControls?.r7j_chain_execution_evidenced === false &&
    erControls?.r7j_blind_holdout_evidence_present === false &&
    erControls?.r7j_empirical_benchmark_evidence_present === false &&
    erControls?.r7j_current_market_evidence_present === false &&
    erControls?.r7j_public_claim_or_release_authorized === false &&
    erControls?.r7j_production_authorized === false &&
    erControls?.r7j_production === "HOLD",
  "ER_CONTROL_LAUNDERED_INTO_EMPIRICAL_OR_TRACK_B_EVIDENCE");
  check(erControls?.approved_calibration_strata_id ===
      "kidults-er-approved-bounded-poc-calibration-strata-v1" &&
    erControls?.approved_calibration_strata_status === "APPROVED_BOUNDED_POC_CALIBRATION" &&
    erControls?.approved_calibration_strata_fingerprint ===
      "sha256:22e9ef7ee56452910887a764df98e7a0c22d30b47e0eccab01ceaee7aaa09af1" &&
    erControls?.approved_calibration_strata_count === 7 &&
    canonicalJson(erControls?.approved_calibration_strata_grammar) ===
      canonicalJson(requiredApprovedCalibrationStrata) &&
    canonicalJson(erControls?.required_calibration_strata_ids) === canonicalJson(
      requiredApprovedCalibrationStrata.map(item => item.stratum_id).sort()) &&
    canonicalJson(erControls?.approved_calibration_strata_ids) === canonicalJson(
      requiredApprovedCalibrationStrata.map(item => item.stratum_id).sort()) &&
    erControls?.approved_calibration_strata_digest_binding_required === true &&
    erControls?.case_to_approved_stratum_binding_required === true &&
    erControls?.per_stratum_case_class_and_identity_boundary_minima_required === true &&
    erControls?.aggregate_case_class_and_boundary_coverage_may_substitute_for_per_stratum_grammar === false &&
    erControls?.caller_supplied_calibration_manifest_must_match_canonical === true &&
    erControls?.caller_supplied_calibration_manifest_may_override_canonical === false &&
    erControls?.approved_calibration_strata_binding_verified_in_sealed_dataset === false &&
    erControls?.per_stratum_case_class_and_identity_boundary_minima_verified === false &&
    erControls?.r7_chain_execution_evidenced === false &&
    Array.isArray(erControls?.sealed_r7_dataset_artifact_refs) &&
    erControls.sealed_r7_dataset_artifact_refs.length === 0 &&
    Array.isArray(erControls?.sealed_r7_workflow_attestation_refs) &&
    erControls.sealed_r7_workflow_attestation_refs.length === 0,
  "ER_APPROVED_CALIBRATION_STRATA_GRAMMAR_OR_MANIFEST_BOUNDARY_MISMATCH");
  check(canonicalJson(erControls?.approved_calibration_strata_validator_ref) ===
      canonicalJson(evidence.canonical_code_inputs?.entity_resolution_approved_strata_validator) &&
    canonicalJson(erControls?.getty_transaction_r2_extender_ref) ===
      canonicalJson(evidence.canonical_code_inputs?.entity_resolution_getty_transaction_r2_extender) &&
    canonicalJson(erControls?.wikidata_design_r3_extender_ref) ===
      canonicalJson(evidence.canonical_code_inputs?.entity_resolution_wikidata_design_r3_extender) &&
    canonicalJson(erControls?.real_holdout_r4_freezer_ref) ===
      canonicalJson(evidence.canonical_code_inputs?.entity_resolution_real_holdout_r4_freezer) &&
    canonicalJson(erControls?.cross_market_alias_r5_extender_ref) ===
      canonicalJson(evidence.canonical_code_inputs?.entity_resolution_cross_market_alias_r5_extender) &&
    canonicalJson(erControls?.ambiguous_review_r6_extender_ref) ===
      canonicalJson(evidence.canonical_code_inputs?.entity_resolution_ambiguous_review_r6_extender) &&
    canonicalJson(erControls?.approved_strata_r7a_promoter_ref) ===
      canonicalJson(evidence.canonical_code_inputs?.entity_resolution_approved_strata_r7a_promoter) &&
    canonicalJson(erControls?.serialized_reference_r7b_extender_ref) ===
      canonicalJson(evidence.canonical_code_inputs?.entity_resolution_serialized_reference_r7b_extender) &&
    canonicalJson(erControls?.variant_release_r7c_extender_ref) ===
      canonicalJson(evidence.canonical_code_inputs?.entity_resolution_variant_release_r7c_extender) &&
    canonicalJson(erControls?.serialized_cross_authority_r7e_extender_ref) ===
      canonicalJson(evidence.canonical_code_inputs?.entity_resolution_serialized_cross_authority_r7e_extender) &&
    canonicalJson(erControls?.vehicle_minimums_r7f_extender_ref) ===
      canonicalJson(evidence.canonical_code_inputs?.entity_resolution_vehicle_minimums_r7f_extender) &&
    canonicalJson(erControls?.variant_minimums_r7g_extender_ref) ===
      canonicalJson(evidence.canonical_code_inputs?.entity_resolution_variant_minimums_r7g_extender) &&
    canonicalJson(erControls?.pressing_minimums_r7h_extender_ref) ===
      canonicalJson(evidence.canonical_code_inputs?.entity_resolution_pressing_minimums_r7h_extender) &&
    canonicalJson(erControls?.provenance_minimums_r7i_extender_ref) ===
      canonicalJson(evidence.canonical_code_inputs?.entity_resolution_provenance_minimums_r7i_extender) &&
    canonicalJson(erControls?.designer_maker_minimums_r7j_extender_ref) ===
      canonicalJson(evidence.canonical_code_inputs?.entity_resolution_designer_maker_minimums_r7j_extender) &&
    canonicalJson(erControls?.approved_dataset_finalizer_ref) ===
      canonicalJson(evidence.canonical_code_inputs?.entity_resolution_approved_dataset_finalizer) &&
    canonicalJson(erControls?.approved_calibration_strata_workflow_ref) ===
      canonicalJson(evidence.canonical_code_inputs?.entity_resolution_approved_strata_workflow) &&
    canonicalJson(erControls?.getty_transaction_r2_workflow_ref) ===
      canonicalJson(evidence.canonical_code_inputs?.entity_resolution_getty_transaction_r2_workflow) &&
    canonicalJson(erControls?.canonical_design_r3_workflow_ref) ===
      canonicalJson(evidence.canonical_code_inputs?.entity_resolution_canonical_design_r3_workflow) &&
    canonicalJson(erControls?.real_holdout_r4_workflow_ref) ===
      canonicalJson(evidence.canonical_code_inputs?.entity_resolution_real_holdout_r4_workflow) &&
    canonicalJson(erControls?.cross_market_alias_r5_workflow_ref) ===
      canonicalJson(evidence.canonical_code_inputs?.entity_resolution_cross_market_alias_r5_workflow) &&
    canonicalJson(erControls?.ambiguous_review_r6_workflow_ref) ===
      canonicalJson(evidence.canonical_code_inputs?.entity_resolution_ambiguous_review_r6_workflow) &&
    canonicalJson(erControls?.approved_strata_r7a_workflow_ref) ===
      canonicalJson(evidence.canonical_code_inputs?.entity_resolution_approved_strata_r7a_workflow) &&
    canonicalJson(erControls?.serialized_reference_r7b_workflow_ref) ===
      canonicalJson(evidence.canonical_code_inputs?.entity_resolution_serialized_reference_r7b_workflow) &&
    canonicalJson(erControls?.variant_release_r7c_workflow_ref) ===
      canonicalJson(evidence.canonical_code_inputs?.entity_resolution_variant_release_r7c_workflow) &&
    canonicalJson(erControls?.serialized_cross_authority_r7e_workflow_ref) ===
      canonicalJson(evidence.canonical_code_inputs?.entity_resolution_serialized_cross_authority_r7e_workflow) &&
    canonicalJson(erControls?.vehicle_minimums_r7f_workflow_ref) ===
      canonicalJson(evidence.canonical_code_inputs?.entity_resolution_vehicle_minimums_r7f_workflow) &&
    canonicalJson(erControls?.variant_minimums_r7g_workflow_ref) ===
      canonicalJson(evidence.canonical_code_inputs?.entity_resolution_variant_minimums_r7g_workflow) &&
    canonicalJson(erControls?.pressing_minimums_r7h_workflow_ref) ===
      canonicalJson(evidence.canonical_code_inputs?.entity_resolution_pressing_minimums_r7h_workflow) &&
    canonicalJson(erControls?.provenance_minimums_r7i_workflow_ref) ===
      canonicalJson(evidence.canonical_code_inputs?.entity_resolution_provenance_minimums_r7i_workflow) &&
    canonicalJson(erControls?.designer_maker_minimums_r7j_workflow_ref) ===
      canonicalJson(evidence.canonical_code_inputs?.entity_resolution_designer_maker_minimums_r7j_workflow) &&
    canonicalJson(erControls?.finalization_preflight_workflow_ref) ===
      canonicalJson(evidence.canonical_code_inputs?.entity_resolution_finalization_preflight_workflow),
  "ER_APPROVED_CALIBRATION_STRATA_CODE_PROVENANCE_MISMATCH");

  const runtimeCore = evidence.transitive_provenance?.runtime_core_and_baseline_declarations;
  check(evidence.execution_truth?.mainline_runtime_core_declaration_present === true &&
    evidence.execution_truth?.mainline_runtime_control_baseline_implementation_present === true &&
    evidence.execution_truth?.mainline_runtime_control_implementation_mode ===
      "LOCAL_IN_MEMORY_QUEUE_D1_COMPATIBLE_DEV_SHADOW_CONTROL" &&
    evidence.execution_truth?.mainline_runtime_core_remote_execution_verified === false &&
    evidence.execution_truth?.mainline_runtime_core_canonical_durability_verified === false &&
    evidence.execution_truth?.mainline_runtime_core_original_source_record_processed === false &&
    evidence.execution_truth?.sealed_evidence_runtime_core_or_baseline_attestation_count === 0 &&
    runtimeCore?.implementation_mode === "LOCAL_IN_MEMORY_QUEUE_D1_COMPATIBLE_DEV_SHADOW_CONTROL" &&
    runtimeCore?.remote_cloudflare_queue_d1_executed === false &&
    runtimeCore?.canonical_cloudflare_durability_verified === false &&
    runtimeCore?.original_source_record_processed_by_runtime === false &&
    runtimeCore?.synthetic_retry_and_quarantine_controls === true &&
    runtimeCore?.task_lease_atomic_fencing_local_shadow_verified === true &&
    runtimeCore?.task_lease_atomic_fencing_remote_cloudflare_verified === false &&
    canonicalJson(runtimeCore?.queue_recovery_runtime_ref) ===
      canonicalJson(evidence.canonical_code_inputs?.queue_recovery_runtime) &&
    canonicalJson(runtimeCore?.task_lease_atomic_fencing_migration_ref) ===
      canonicalJson(evidence.canonical_code_inputs?.task_lease_atomic_fencing_shadow_migration) &&
    canonicalJson(runtimeCore?.d1_fail_closed_shadow_test_ref) ===
      canonicalJson(evidence.canonical_code_inputs?.d1_fail_closed_shadow_test) &&
    canonicalJson(runtimeCore?.queue_d1_processor_e2e_test_ref) ===
      canonicalJson(evidence.canonical_code_inputs?.queue_d1_processor_e2e_test) &&
    canonicalJson(runtimeCore?.runtime_recovery_fairness_test_ref) ===
      canonicalJson(evidence.canonical_code_inputs?.runtime_recovery_fairness_test) &&
    canonicalJson(runtimeCore?.autonomous_runtime_workflow_ref) ===
      canonicalJson(evidence.canonical_code_inputs?.autonomous_runtime_workflow) &&
    canonicalJson(runtimeCore?.runtime_deploy_preflight_ref) ===
      canonicalJson(evidence.canonical_code_inputs?.runtime_deploy_preflight) &&
    canonicalJson(runtimeCore?.runtime_smoke_ref) ===
      canonicalJson(evidence.canonical_code_inputs?.runtime_smoke) &&
    Array.isArray(runtimeCore?.sealed_baseline_artifact_refs) &&
    runtimeCore.sealed_baseline_artifact_refs.length === 0 &&
    Array.isArray(runtimeCore?.sealed_workflow_attestation_refs) &&
    runtimeCore.sealed_workflow_attestation_refs.length === 0,
  "RUNTIME_CORE_DECLARATION_LAUNDERED_INTO_REMOTE_EXECUTION");
  check(globalRightsR2?.fingerprint ===
      evidence.canonical_inputs?.global_rights_source_pool_expansion_r2?.fingerprint &&
    erControls?.contract_fingerprint ===
      evidence.canonical_inputs?.entity_resolution_benchmark_v2_contract?.fingerprint &&
    erControls?.synthetic_selftest_fingerprint ===
      evidence.canonical_inputs?.entity_resolution_benchmark_v2_selftest?.fingerprint &&
    erControls?.canonical_scope_matrix_fingerprint ===
      evidence.canonical_inputs?.entity_resolution_scope_matrix?.fingerprint &&
    canonicalJson(erControls?.canonical_scope_matrix_ref) ===
      canonicalJson(evidence.canonical_inputs?.entity_resolution_scope_matrix) &&
    erControls?.approved_calibration_strata_fingerprint ===
      evidence.canonical_inputs?.entity_resolution_approved_calibration_strata?.fingerprint &&
    canonicalJson(erControls?.approved_calibration_strata_ref) ===
      canonicalJson(evidence.canonical_inputs?.entity_resolution_approved_calibration_strata) &&
    runtimeCore?.runtime_core_fingerprint ===
      evidence.canonical_inputs?.asi_runtime_core_validation_r1?.fingerprint &&
    designerMakerR3?.fingerprint ===
      evidence.canonical_inputs?.designer_maker_repository_declared_identity_calibration_admission_r3?.fingerprint,
  "LATEST_MAINLINE_DECLARATION_TRANSITIVE_FINGERPRINT_MISMATCH");

  const countFields = [
    "reviewed_source_count",
    "reviewed_purpose_package_count",
    "purpose_policy_preflight_pass_package_count",
    "held_purpose_package_count",
    "rejected_purpose_package_count",
    "bounded_shadow_rights_policy_preflight_pass_source_count",
    "purpose_policy_preflight_pass_binding_count",
    "purpose_policy_preflight_pass_source_count",
    "purpose_policy_preflight_pass_frontier_channel_count",
    "purpose_policy_preflight_pass_target_source_count",
    "evidence_claim_count",
    "normalized_claim_record_integrity_verified_count",
    "pending_normalized_claim_record_count",
    "source_content_capture_complete_count",
    "source_content_capture_pending_count",
    "runtime_admission_events_emitted",
    "runtime_admission_materialized_binding_count",
    "canonical_region_language_coverage_credit",
    "purpose_held_source_count",
    "purpose_rejected_source_count",
    "market_event_evidence_policy_preflight_pass_source_count",
    "mainline_methodology_declared_identity_context_admitted_source_count",
    "mainline_methodology_declared_historical_transaction_admitted_source_count",
    "mainline_methodology_conditional_source_count",
    "mainline_methodology_current_market_event_ready_source_count",
    "mainline_prior_pilot_declared_source_record_count",
    "global_rights_r2_declared_source_record_count",
    "global_rights_r2_declared_identity_context_source_count",
    "global_rights_r2_conditional_market_candidate_count",
    "global_rights_r2_current_market_ready_source_count",
    "global_rights_r2_runtime_admission_events_emitted",
    "designer_maker_r3_repository_declared_identity_calibration_metadata_source_count",
    "designer_maker_r3_strict_r1_evidence_bound_admitted_source_count",
    "designer_maker_r3_full_source_pool_admitted_source_count",
    "designer_maker_r3_current_market_ready_source_count",
    "designer_maker_r3_runtime_admitted_source_count",
    "designer_maker_r3_image_admitted_source_count",
    "candidate_handoff_r2_blocker_count",
    "candidate_handoff_r2_ready_pair_count",
    "candidate_handoff_r2_track_b_submission_count",
    "candidate_handoff_r2_track_b_assessment_count",
    "candidate_handoff_r2_track_b_pass_count",
    "candidate_handoff_r2_publication_authorized_count",
    "candidate_handoff_r2_production_authorized_count",
    "sealed_er_dataset_artifact_count",
    "sealed_er_benchmark_result_count",
    "sealed_er_workflow_attestation_count",
    "er_approved_empirical_attestation_manifest_count",
    "er_approved_calibration_strata_count",
    "sealed_er_r7_dataset_artifact_count",
    "sealed_er_r7_workflow_attestation_count",
    "sealed_er_r7efg_dataset_artifact_count",
    "sealed_er_r7efg_benchmark_result_count",
    "sealed_er_r7efg_workflow_attestation_count",
    "er_r7efg_executed_constructed_control_case_count",
    "sealed_er_r7hi_dataset_artifact_count",
    "sealed_er_r7hi_benchmark_result_count",
    "sealed_er_r7hi_workflow_attestation_count",
    "er_r7hi_executed_constructed_control_case_count",
    "sealed_er_r7j_dataset_artifact_count",
    "sealed_er_r7j_benchmark_result_count",
    "sealed_er_r7j_workflow_attestation_count",
    "er_r7j_executed_constructed_control_case_count",
    "er_r7j_declared_represented_grammar_count",
    "er_r7j_declared_required_grammar_count",
    "er_canonical_approved_empirical_attestation_fingerprint_count",
    "sealed_er_finalized_dataset_artifact_count",
    "sealed_er_finalization_workflow_attestation_count",
    "er_required_scope_archetype_count",
    "er_minimum_total_cases_required",
    "er_minimum_blind_holdout_cases_required",
    "er_minimum_cases_per_scope_archetype_required",
    "er_minimum_blind_cases_per_scope_archetype_required",
    "er_minimum_cases_per_identity_boundary_required",
    "er_minimum_cases_per_case_class_required",
    "sealed_runtime_core_or_baseline_artifact_count",
    "sealed_runtime_core_or_baseline_workflow_attestation_count",
    "scope_source_pools_ready",
    "market_data_poc_ready_scopes",
    "indexes_computed",
    "deployed_alignment_percent"
  ];
  for (const field of countFields) {
    check(evidence.source_truth?.[field] === expected.source_truth[field], `SOURCE_TRUTH_COUNT_MISMATCH:${field}`);
  }
  check(evidence.source_truth?.registered_endpoints_are_policy_preflight_pass_sources === false,
    "REGISTERED_ENDPOINT_POLICY_PREFLIGHT_SUBSTITUTION_FORBIDDEN");
  check(evidence.source_truth?.purpose_policy_preflight_pass_sources_are_scope_source_pools === false,
    "PURPOSE_ELIGIBILITY_SCOPE_POOL_SUBSTITUTION_FORBIDDEN");
  check(evidence.source_truth?.strict_r1_count_scope === "ASI_SOURCE_RIGHTS_ACCESS_REVIEW_R1_ONLY",
    "STRICT_R1_COUNT_SCOPE_MISSING");
  check(evidence.source_truth?.mainline_prior_pilot_declared_source_record_count === 4,
    "MAINLINE_DECLARED_SOURCE_RECORD_COUNT_MISMATCH");
  check(evidence.source_truth?.mainline_pilot_source_declarations_revalidated_by_current_r1 === false &&
    evidence.source_truth?.mainline_declared_admission_is_independent_legal_clearance === false &&
    evidence.source_truth?.mainline_declared_admission_is_strict_r1_evidence_bound_preflight === false,
  "MAINLINE_DECLARATION_LAUNDERED_INTO_STRICT_R1_OR_LEGAL_CLEARANCE");
  check(evidence.source_truth?.global_rights_r2_count_scope ===
      "GLOBAL_RIGHTS_SOURCE_POOL_EXPANSION_R2_REPOSITORY_DECLARATIONS_ONLY" &&
    evidence.source_truth?.global_rights_r2_declared_source_record_count === 4 &&
    evidence.source_truth?.global_rights_r2_declared_identity_context_source_count === 2 &&
    evidence.source_truth?.global_rights_r2_conditional_market_candidate_count === 2 &&
    evidence.source_truth?.global_rights_r2_current_market_ready_source_count === 0 &&
    evidence.source_truth?.global_rights_r2_strict_r1_revalidation_complete === false &&
    evidence.source_truth?.global_rights_r2_independent_legal_review_complete === false &&
    evidence.source_truth?.global_rights_r2_runtime_admission_events_emitted === 0 &&
    evidence.source_truth?.global_rights_r2_counts_are_additive_to_prior_pilot_counts === false,
  "GLOBAL_RIGHTS_R2_DECLARATION_LAUNDERED_INTO_STRICT_R1_OR_LEGAL_CLEARANCE");
  check(evidence.source_truth
      ?.designer_maker_r3_repository_declared_identity_calibration_metadata_source_count === 2 &&
    evidence.source_truth?.designer_maker_r3_strict_r1_evidence_bound_admitted_source_count === 0 &&
    evidence.source_truth?.designer_maker_r3_full_source_pool_admitted_source_count === 0 &&
    evidence.source_truth?.designer_maker_r3_current_market_ready_source_count === 0 &&
    evidence.source_truth?.designer_maker_r3_runtime_admitted_source_count === 0 &&
    evidence.source_truth?.designer_maker_r3_image_admitted_source_count === 0 &&
    evidence.source_truth?.designer_maker_r3_repository_declaration_only === true &&
    evidence.source_truth?.designer_maker_r3_strict_r1_evidence_bound_revalidation_complete === false &&
    evidence.source_truth?.designer_maker_r3_independent_legal_review_complete === false &&
    evidence.source_truth?.designer_maker_r3_source_content_bytes_archived === false &&
    evidence.source_truth?.designer_maker_r3_runtime_admission_authorized === false &&
    evidence.source_truth?.designer_maker_r3_current_market_claim_authorized === false &&
    evidence.source_truth?.designer_maker_r3_full_source_pool_admission_authorized === false &&
    evidence.source_truth?.designer_maker_r3_public_commercial_admission_authorized === false &&
    evidence.source_truth?.designer_maker_r3_image_admission_authorized === false &&
    evidence.source_truth?.designer_maker_r3_production_promotion_authorized === false &&
    evidence.source_truth?.designer_maker_r3_production === "HOLD",
  "DESIGNER_MAKER_R3_REPOSITORY_DECLARATION_LAUNDERED_INTO_STRICT_R1_LEGAL_RUNTIME_MARKET_POOL_OR_PUBLIC");
  check(evidence.source_truth?.er_synthetic_selftest_mechanics_present === true &&
    evidence.source_truth?.er_real_source_constructed_control_assembler_present === true &&
    evidence.source_truth?.sealed_er_dataset_artifact_count === 0 &&
    evidence.source_truth?.sealed_er_benchmark_result_count === 0 &&
    evidence.source_truth?.sealed_er_workflow_attestation_count === 0 &&
    evidence.source_truth?.er_approved_empirical_attestation_manifest_count === 0 &&
    evidence.source_truth?.er_approved_calibration_strata_count === 7 &&
    evidence.source_truth?.sealed_er_r7_dataset_artifact_count === 0 &&
    evidence.source_truth?.sealed_er_r7_workflow_attestation_count === 0 &&
    evidence.source_truth?.er_approved_calibration_strata_manifest_present === true &&
    evidence.source_truth?.er_approved_calibration_strata_fingerprint_verified === true &&
    evidence.source_truth?.er_approved_calibration_strata_is_empirical_attestation === false &&
    evidence.source_truth?.er_r7_chain_implementation_present === true &&
    evidence.source_truth?.er_r7_chain_execution_evidenced === false &&
    evidence.source_truth?.sealed_er_r7efg_dataset_artifact_count === 0 &&
    evidence.source_truth?.sealed_er_r7efg_benchmark_result_count === 0 &&
    evidence.source_truth?.sealed_er_r7efg_workflow_attestation_count === 0 &&
    evidence.source_truth?.er_r7efg_executed_constructed_control_case_count === 0 &&
    evidence.source_truth?.er_r7efg_constructed_control_extensions_implementation_present === true &&
    evidence.source_truth?.er_r7efg_chain_execution_evidenced === false &&
    evidence.source_truth?.er_r7efg_empirical_benchmark_evidence_present === false &&
    evidence.source_truth?.er_r7efg_current_market_evidence_present === false &&
    evidence.source_truth?.er_r7efg_production_authorized === false &&
    evidence.source_truth?.sealed_er_r7hi_dataset_artifact_count === 0 &&
    evidence.source_truth?.sealed_er_r7hi_benchmark_result_count === 0 &&
    evidence.source_truth?.sealed_er_r7hi_workflow_attestation_count === 0 &&
    evidence.source_truth?.er_r7hi_executed_constructed_control_case_count === 0 &&
    evidence.source_truth?.er_r7hi_constructed_control_extensions_implementation_present === true &&
    evidence.source_truth?.er_r7hi_chain_execution_evidenced === false &&
    evidence.source_truth?.er_r7hi_blind_holdout_evidence_present === false &&
    evidence.source_truth?.er_r7hi_empirical_benchmark_evidence_present === false &&
    evidence.source_truth?.er_r7hi_current_market_evidence_present === false &&
    evidence.source_truth?.er_r7hi_public_claim_or_release_authorized === false &&
    evidence.source_truth?.er_r7hi_production_authorized === false &&
    evidence.source_truth?.sealed_er_r7j_dataset_artifact_count === 0 &&
    evidence.source_truth?.sealed_er_r7j_benchmark_result_count === 0 &&
    evidence.source_truth?.sealed_er_r7j_workflow_attestation_count === 0 &&
    evidence.source_truth?.er_r7j_executed_constructed_control_case_count === 0 &&
    evidence.source_truth?.er_r7j_constructed_control_extension_implementation_present === true &&
    evidence.source_truth?.er_r7j_chain_execution_evidenced === false &&
    evidence.source_truth?.er_r7j_declared_represented_grammar_count === 6 &&
    evidence.source_truth?.er_r7j_declared_required_grammar_count === 7 &&
    evidence.source_truth?.er_r7j_declared_all_required_grammars_complete === false &&
    evidence.source_truth?.er_r7j_blind_holdout_evidence_present === false &&
    evidence.source_truth?.er_r7j_empirical_benchmark_evidence_present === false &&
    evidence.source_truth?.er_r7j_current_market_evidence_present === false &&
    evidence.source_truth?.er_r7j_public_claim_or_release_authorized === false &&
    evidence.source_truth?.er_r7j_production_authorized === false &&
    evidence.source_truth?.er_r7j_production === "HOLD" &&
    evidence.source_truth?.er_finalization_preflight_implementation_present === true &&
    evidence.source_truth?.er_current_r7j_finalization_state === "BLOCKED" &&
    evidence.source_truth?.er_canonical_approved_empirical_attestation_fingerprint_count === 0 &&
    evidence.source_truth?.sealed_er_finalized_dataset_artifact_count === 0 &&
    evidence.source_truth?.sealed_er_finalization_workflow_attestation_count === 0 &&
    evidence.source_truth?.er_finalization_execution_evidenced === false &&
    evidence.source_truth?.er_finalization_caller_supplied_flags_may_override_canonical_attestation === false &&
    evidence.source_truth?.er_finalization_public_claim_or_release_authorized === false &&
    evidence.source_truth?.er_finalization_production_authorized === false &&
    evidence.source_truth?.er_finalization_production === "HOLD" &&
    evidence.source_truth?.er_approved_calibration_strata_digest_binding_required === true &&
    evidence.source_truth?.er_case_to_approved_stratum_binding_required === true &&
    evidence.source_truth?.er_per_stratum_case_class_and_identity_boundary_minima_required === true &&
    evidence.source_truth
      ?.er_aggregate_class_boundary_coverage_may_substitute_for_per_stratum_grammar === false &&
    evidence.source_truth?.er_caller_supplied_calibration_manifest_must_match_canonical === true &&
    evidence.source_truth?.er_caller_supplied_calibration_manifest_may_override_canonical === false &&
    evidence.source_truth?.er_approved_calibration_strata_binding_verified_in_sealed_dataset === false &&
    evidence.source_truth?.er_per_stratum_case_class_and_identity_boundary_minima_verified === false &&
    evidence.source_truth?.er_required_scope_archetype_count === 7 &&
    evidence.source_truth?.er_scope_matrix_canonical_fingerprint_verified === true &&
    evidence.source_truth?.er_per_case_source_evidence_and_license_binding_required === true &&
    evidence.source_truth?.er_case_source_evidence_binding_required === true &&
    evidence.source_truth?.er_case_scope_archetype_binding_required === true &&
    evidence.source_truth?.er_empirical_sample_policy_fingerprint_verified === true &&
    evidence.source_truth?.er_minimum_total_cases_required === 800 &&
    evidence.source_truth?.er_minimum_blind_holdout_cases_required === 400 &&
    evidence.source_truth?.er_minimum_cases_per_scope_archetype_required === 50 &&
    evidence.source_truth?.er_minimum_blind_cases_per_scope_archetype_required === 25 &&
    evidence.source_truth?.er_minimum_cases_per_identity_boundary_required === 100 &&
    evidence.source_truth?.er_minimum_cases_per_case_class_required === 50 &&
    evidence.source_truth?.er_wilson_confidence_level_required === 0.95 &&
    evidence.source_truth?.er_minimum_overall_accuracy_wilson_lower_bound_required === 0.99 &&
    evidence.source_truth?.er_minimum_blind_accuracy_wilson_lower_bound_required === 0.99 &&
    evidence.source_truth?.er_per_case_source_evidence_binding_verified === false &&
    evidence.source_truth?.er_case_source_evidence_binding_verified === false &&
    evidence.source_truth?.er_case_source_payload_binding_verified === false &&
    evidence.source_truth?.er_case_license_evidence_binding_verified === false &&
    evidence.source_truth?.er_scope_policy_binding_verified === false &&
    evidence.source_truth?.er_sample_policy_binding_verified === false &&
    evidence.source_truth?.er_empirical_attestation_verified === false &&
    evidence.source_truth?.er_full_required_scope_archetype_coverage_verified === false &&
    evidence.source_truth?.er_empirical_sample_floors_verified === false &&
    evidence.source_truth?.er_wilson_95_lower_bound_gate_verified === false &&
    evidence.source_truth?.er_empirical_benchmark_gate_pass === false &&
    evidence.source_truth?.er_pre_track_b_promotion_authorized === false &&
    evidence.source_truth?.er_production_promotion_authorized === false &&
    evidence.source_truth?.er_empirical_promotion_authorized === false &&
    evidence.source_truth?.er_empirical_99_percent_evidenced === false &&
    evidence.source_truth?.er_independent_label_review_complete === false &&
    evidence.source_truth?.er_label_adjudication_complete === false &&
    evidence.source_truth?.er_holdout_sealed_before_modeling === false &&
    evidence.source_truth?.er_track_b_pass === false,
  "ER_CONTROL_LAUNDERED_INTO_EMPIRICAL_OR_TRACK_B_EVIDENCE");
  check(evidence.source_truth?.runtime_core_declaration_present === true &&
    evidence.source_truth?.runtime_control_baseline_implementation_present === true &&
    evidence.source_truth?.sealed_runtime_core_or_baseline_artifact_count === 0 &&
    evidence.source_truth?.sealed_runtime_core_or_baseline_workflow_attestation_count === 0 &&
    evidence.source_truth?.runtime_core_remote_cloudflare_execution_verified === false &&
    evidence.source_truth?.runtime_core_canonical_cloudflare_durability_verified === false,
  "RUNTIME_CORE_DECLARATION_LAUNDERED_INTO_REMOTE_EXECUTION");
  check(evidence.source_truth?.mainline_live_retrieval_artifacts_included_as_canonical_inputs_in_this_sealed_evidence === false &&
    evidence.source_truth?.sealed_evidence_bridge_artifact_count === 0 &&
    evidence.source_truth?.sealed_evidence_real_source_queue_d1_injection_evidenced === false &&
    evidence.source_truth?.sealed_evidence_real_source_retry_dlq_quarantine_execution_evidenced === false &&
    evidence.source_truth?.sealed_evidence_mainline_bridge_processor_mesh_execution ===
      "NOT_RUN_IN_THIS_SEALED_EVIDENCE" &&
    evidence.source_truth?.mainline_real_source_harness_remote_execution === false &&
    evidence.source_truth?.sealed_evidence_original_getty_record_processed === false &&
    evidence.source_truth?.mainline_queue_d1_implementation_pass_allow_assertions_are_fixture_derived === true &&
    evidence.source_truth?.mainline_retry_and_unknown_quarantine_implementation_controls_are_synthetic === true &&
    evidence.source_truth?.mainline_real_source_admission_metadata_read_by_processors === false &&
    evidence.source_truth?.mainline_raw_source_response_preserved_in_bridge === false &&
    evidence.source_truth?.mainline_raw_source_response_hash_preserved_in_bridge === false &&
    evidence.source_truth?.mainline_raw_source_assertion_binding_preserved_in_bridge === false,
  "MAINLINE_READY_STATE_LAUNDERED_INTO_EXECUTION_EVIDENCE");
  check(evidence.source_truth?.historical_transaction_context_declared_available === true &&
    evidence.source_truth?.sealed_historical_transaction_evidence_available === false &&
    evidence.source_truth?.current_market_event_evidence_available === false,
  "HISTORICAL_OR_CURRENT_MARKET_EVIDENCE_BOUNDARY_MISMATCH");
  check(evidence.source_truth?.rights_pass_semantics === "POLICY_AND_EVIDENCE_PREFLIGHT_NOT_LEGAL_CONCLUSION",
    "RIGHTS_PREFLIGHT_LEGAL_CONCLUSION_OVERCLAIM");
  if (evidence.source_truth?.purpose_eligibility_artifact_present === true) {
    check(evidence.source_truth?.canonical_rights_decision_semantics === "POLICY_AND_EVIDENCE_PREFLIGHT_PASS_ONLY",
      "CANONICAL_RIGHTS_DECISION_SEMANTICS_MISMATCH");
    check(evidence.source_truth?.purpose_eligibility_rebuild_matches_committed_artifact === true,
      "PURPOSE_ELIGIBILITY_ARTIFACT_NOT_REPRODUCIBLE");
    check(evidence.source_truth?.pass_package_claim_record_integrity_state ===
      "ALL_PASS_NORMALIZED_CLAIM_RECORDS_INTEGRITY_VERIFIED",
    "PASS_PACKAGE_CLAIM_RECORD_INTEGRITY_NOT_VERIFIED");
    check(evidence.source_truth?.pass_package_temporal_provenance_state ===
      "ALL_PASS_TEMPORAL_PROVENANCE_ORDER_VERIFIED",
    "PASS_PACKAGE_TEMPORAL_PROVENANCE_NOT_VERIFIED");
    check(evidence.source_truth?.pass_package_evidence_assertion_binding_state ===
      "ALL_PASS_ASSERTION_BINDING_FINGERPRINTS_VERIFIED",
    "PASS_PACKAGE_ASSERTION_BINDING_FINGERPRINTS_NOT_VERIFIED");
    check(evidence.source_truth?.source_content_capture_state === "PENDING_NOT_ARCHIVED",
      "PRIMARY_SOURCE_CONTENT_CAPTURE_OVERCLAIM_OR_STATE_MISMATCH");
    check(evidence.source_truth?.normalized_claim_record_digest_covers_source_content === false,
      "NORMALIZED_CLAIM_RECORD_DIGEST_SCOPE_OVERCLAIM");
  }
  check(evidence.source_truth?.independent_legal_review_complete === false,
    "INDEPENDENT_LEGAL_REVIEW_OVERCLAIM");
  check(evidence.source_truth?.independently_legal_cleared_source_count === 0,
    "INDEPENDENT_LEGAL_CLEARANCE_OVERCLAIM");
  check(evidence.source_truth?.bounded_shadow_collection_execution_authorized_source_count === 0,
    "COLLECTION_EXECUTION_AUTHORIZATION_OVERCLAIM");
  check(evidence.source_truth?.runtime_admission_events_emitted === 0 &&
    evidence.source_truth?.runtime_admission_materialized_binding_count === 0,
  "POLICY_PREFLIGHT_RUNTIME_ADMISSION_OVERCLAIM");
  check(evidence.source_truth?.canonical_region_language_coverage_credit === 0,
    "REVIEW_SLICE_CANONICAL_REGION_LANGUAGE_COVERAGE_OVERCLAIM");
  check(evidence.source_truth?.purpose_policy_preflight_bindings_are_runtime_admissions === false,
    "POLICY_PREFLIGHT_BINDING_RUNTIME_ADMISSION_SUBSTITUTION_FORBIDDEN");
  check(evidence.source_truth?.frontier_scope_role_policy_binding_provenance_state ===
    "ALL_FRONTIER_BINDINGS_EXACTLY_POLICY_BOUND",
  "FRONTIER_SCOPE_ROLE_POLICY_BINDING_PROVENANCE_NOT_VERIFIED");
  check(evidence.source_truth?.stale_evidence_count_at_evidence_clock === 0,
    "STALE_RIGHTS_EVIDENCE_CANNOT_SUPPORT_CURRENT_PREFLIGHT");

  check(evidence.test_execution?.required_suite_pass_count === evidence.test_execution?.required_suite_count,
    "REQUIRED_TEST_SUITE_NOT_PASSING");
  check(evidence.test_execution?.contract_negative_controls_passed === evidence.test_execution?.contract_negative_controls_total,
    "MESH_CONTRACT_NEGATIVE_CONTROL_NOT_PASSING");
  const meshSuite = contract.required_test_suites.find(item => item.suite_id === "ASI_MESH_CONTRACT_PREFLIGHT");
  check(Number.isInteger(meshSuite?.minimum_negative_controls) &&
    evidence.test_execution?.contract_negative_controls_total >= meshSuite.minimum_negative_controls,
  "MESH_CONTRACT_NEGATIVE_CONTROL_MINIMUM_NOT_MET");
  check(Number.isInteger(evidence.test_execution?.executed_test_count) && evidence.test_execution.executed_test_count > 0,
    "ACTUAL_SHADOW_TEST_COUNT_MISSING");
  for (const suiteContract of contract.required_test_suites.filter(item => item.result_format === "TAP_PLUS_FINAL_JSON")) {
    const suiteEvidence = evidence.test_execution?.suites?.find(item => item.suite_id === suiteContract.suite_id);
    check(Number.isInteger(suiteContract.minimum_test_count) &&
      Number.isInteger(suiteEvidence?.test_count) && suiteEvidence.test_count >= suiteContract.minimum_test_count,
    `REQUIRED_SUITE_MINIMUM_TEST_COUNT_NOT_MET:${suiteContract.suite_id}`);
    check(Array.isArray(suiteEvidence?.test_names) &&
      suiteEvidence.test_names.length === suiteEvidence?.test_count,
    `REQUIRED_SUITE_EXECUTED_TEST_NAMES_MISMATCH:${suiteContract.suite_id}`);
  }

  check(actualObservations.size === contract.required_failure_mode_observations.length,
    "FAILURE_OBSERVATION_COUNT_MISMATCH");
  for (const observationId of contract.required_failure_mode_observations) {
    const observation = actualObservations.get(observationId);
    check(Boolean(observation), `FAILURE_OBSERVATION_MISSING:${observationId}`);
    check(observation?.readiness === "VERIFIED_LOCAL_SHADOW" || observation?.readiness === "CONTRACT_PREFLIGHT_ONLY",
      `FAILURE_OBSERVATION_NOT_PROVEN:${observationId}`);
  }

  check(evidence.chaos_and_failure_mode_readiness?.terminal_dlq_durability_under_d1_failure === "NOT_VERIFIED",
    "TERMINAL_DLQ_DURABILITY_OVERCLAIM");
  check(evidence.chaos_and_failure_mode_readiness?.remote_chaos_injection === "NOT_VERIFIED",
    "REMOTE_CHAOS_OVERCLAIM");
  check(evidence.readiness_limits?.remote_terminal_dlq_loss_guarantee === false,
    "REMOTE_TERMINAL_DLQ_LOSS_GUARANTEE_OVERCLAIM");
  check(evidence.readiness_limits?.live_worldwide_discovery_proven === false,
    "LIVE_WORLDWIDE_DISCOVERY_OVERCLAIM");
  check(evidence.readiness_limits?.reviewed_source_slice_is_global_market_complete === false,
    "REVIEWED_SOURCE_SLICE_GLOBAL_COMPLETENESS_OVERCLAIM");
  check(evidence.readiness_limits?.source_content_archived === false,
    "PRIMARY_SOURCE_CONTENT_ARCHIVE_OVERCLAIM");
  check(evidence.readiness_limits?.historical_transaction_context_declared_available === true &&
    evidence.readiness_limits?.sealed_historical_transaction_evidence_available === false,
  "SEALED_HISTORICAL_TRANSACTION_EVIDENCE_OVERCLAIM");
  check(evidence.readiness_limits?.current_market_event_evidence_available === false,
    "CURRENT_MARKET_EVENT_EVIDENCE_OVERCLAIM");
  check(evidence.readiness_limits?.real_source_live_retrieval_artifact_included_in_this_sealed_evidence === false &&
    evidence.readiness_limits?.mainline_real_source_queue_d1_implementation_present === true &&
    evidence.readiness_limits?.mainline_real_source_retry_dlq_quarantine_implementation_present === true &&
    evidence.readiness_limits?.mainline_real_source_harness_implementation_mode === localRealSourceHarnessMode &&
    evidence.readiness_limits?.mainline_real_source_harness_remote_execution === false &&
    evidence.readiness_limits?.sealed_evidence_original_getty_record_processed === false &&
    evidence.readiness_limits?.sealed_evidence_real_source_queue_d1_injection_count === 0 &&
    evidence.readiness_limits?.sealed_evidence_real_source_retry_dlq_quarantine_execution_count === 0 &&
    evidence.readiness_limits?.sealed_evidence_real_source_queue_d1_injection_evidenced === false &&
    evidence.readiness_limits?.sealed_evidence_real_source_retry_dlq_quarantine_execution_evidenced === false,
  "REAL_SOURCE_READY_STATE_LAUNDERED_INTO_EXECUTION_EVIDENCE");
  check(evidence.readiness_limits?.global_rights_r2_strict_r1_revalidation_complete === false &&
    evidence.readiness_limits?.global_rights_r2_independent_legal_review_complete === false &&
    evidence.readiness_limits?.global_rights_r2_current_market_ready_source_count === 0,
  "GLOBAL_RIGHTS_R2_DECLARATION_LAUNDERED_INTO_STRICT_R1_OR_LEGAL_CLEARANCE");
  check(evidence.readiness_limits
      ?.designer_maker_r3_repository_declared_identity_calibration_metadata_source_count === 2 &&
    evidence.readiness_limits?.designer_maker_r3_strict_r1_evidence_bound_admitted_source_count === 0 &&
    evidence.readiness_limits?.designer_maker_r3_full_source_pool_admitted_source_count === 0 &&
    evidence.readiness_limits?.designer_maker_r3_current_market_ready_source_count === 0 &&
    evidence.readiness_limits?.designer_maker_r3_runtime_admitted_source_count === 0 &&
    evidence.readiness_limits?.designer_maker_r3_image_admitted_source_count === 0 &&
    evidence.readiness_limits?.designer_maker_r3_repository_declaration_only === true &&
    evidence.readiness_limits?.designer_maker_r3_strict_r1_evidence_bound_revalidation_complete === false &&
    evidence.readiness_limits?.designer_maker_r3_independent_legal_review_complete === false &&
    evidence.readiness_limits?.designer_maker_r3_source_content_bytes_archived === false &&
    evidence.readiness_limits?.designer_maker_r3_runtime_admission_authorized === false &&
    evidence.readiness_limits?.designer_maker_r3_current_market_claim_authorized === false &&
    evidence.readiness_limits?.designer_maker_r3_full_source_pool_admission_authorized === false &&
    evidence.readiness_limits?.designer_maker_r3_public_commercial_admission_authorized === false &&
    evidence.readiness_limits?.designer_maker_r3_image_admission_authorized === false &&
    evidence.readiness_limits?.designer_maker_r3_production_promotion_authorized === false &&
    evidence.readiness_limits?.designer_maker_r3_production === "HOLD",
  "DESIGNER_MAKER_R3_REPOSITORY_DECLARATION_LAUNDERED_INTO_STRICT_R1_LEGAL_RUNTIME_MARKET_POOL_OR_PUBLIC");
  check(evidence.readiness_limits?.er_empirical_99_percent_evidenced === false &&
    evidence.readiness_limits?.er_independent_label_review_complete === false &&
    evidence.readiness_limits?.er_label_adjudication_complete === false &&
    evidence.readiness_limits?.er_holdout_sealed_before_modeling === false &&
    evidence.readiness_limits?.er_track_b_pass === false &&
    evidence.readiness_limits?.er_approved_empirical_attestation_manifest_count === 0 &&
    evidence.readiness_limits?.er_approved_calibration_strata_count === 7 &&
    evidence.readiness_limits?.sealed_er_r7_dataset_artifact_count === 0 &&
    evidence.readiness_limits?.sealed_er_r7_workflow_attestation_count === 0 &&
    evidence.readiness_limits?.er_approved_calibration_strata_manifest_present === true &&
    evidence.readiness_limits?.er_approved_calibration_strata_fingerprint_verified === true &&
    evidence.readiness_limits?.er_approved_calibration_strata_is_empirical_attestation === false &&
    evidence.readiness_limits?.er_r7_chain_implementation_present === true &&
    evidence.readiness_limits?.er_r7_chain_execution_evidenced === false &&
    evidence.readiness_limits?.sealed_er_r7efg_dataset_artifact_count === 0 &&
    evidence.readiness_limits?.sealed_er_r7efg_benchmark_result_count === 0 &&
    evidence.readiness_limits?.sealed_er_r7efg_workflow_attestation_count === 0 &&
    evidence.readiness_limits?.er_r7efg_executed_constructed_control_case_count === 0 &&
    evidence.readiness_limits?.er_r7efg_constructed_control_extensions_implementation_present === true &&
    evidence.readiness_limits?.er_r7efg_chain_execution_evidenced === false &&
    evidence.readiness_limits?.er_r7efg_empirical_benchmark_evidence_present === false &&
    evidence.readiness_limits?.er_r7efg_current_market_evidence_present === false &&
    evidence.readiness_limits?.er_r7efg_production_authorized === false &&
    evidence.readiness_limits?.sealed_er_r7hi_dataset_artifact_count === 0 &&
    evidence.readiness_limits?.sealed_er_r7hi_benchmark_result_count === 0 &&
    evidence.readiness_limits?.sealed_er_r7hi_workflow_attestation_count === 0 &&
    evidence.readiness_limits?.er_r7hi_executed_constructed_control_case_count === 0 &&
    evidence.readiness_limits?.er_r7hi_constructed_control_extensions_implementation_present === true &&
    evidence.readiness_limits?.er_r7hi_chain_execution_evidenced === false &&
    evidence.readiness_limits?.er_r7hi_blind_holdout_evidence_present === false &&
    evidence.readiness_limits?.er_r7hi_empirical_benchmark_evidence_present === false &&
    evidence.readiness_limits?.er_r7hi_current_market_evidence_present === false &&
    evidence.readiness_limits?.er_r7hi_public_claim_or_release_authorized === false &&
    evidence.readiness_limits?.er_r7hi_production_authorized === false &&
    evidence.readiness_limits?.sealed_er_r7j_dataset_artifact_count === 0 &&
    evidence.readiness_limits?.sealed_er_r7j_benchmark_result_count === 0 &&
    evidence.readiness_limits?.sealed_er_r7j_workflow_attestation_count === 0 &&
    evidence.readiness_limits?.er_r7j_executed_constructed_control_case_count === 0 &&
    evidence.readiness_limits?.er_r7j_constructed_control_extension_implementation_present === true &&
    evidence.readiness_limits?.er_r7j_chain_execution_evidenced === false &&
    evidence.readiness_limits?.er_r7j_declared_represented_grammar_count === 6 &&
    evidence.readiness_limits?.er_r7j_declared_required_grammar_count === 7 &&
    evidence.readiness_limits?.er_r7j_declared_all_required_grammars_complete === false &&
    evidence.readiness_limits?.er_r7j_blind_holdout_evidence_present === false &&
    evidence.readiness_limits?.er_r7j_empirical_benchmark_evidence_present === false &&
    evidence.readiness_limits?.er_r7j_current_market_evidence_present === false &&
    evidence.readiness_limits?.er_r7j_public_claim_or_release_authorized === false &&
    evidence.readiness_limits?.er_r7j_production_authorized === false &&
    evidence.readiness_limits?.er_r7j_production === "HOLD" &&
    evidence.readiness_limits?.er_finalization_preflight_implementation_present === true &&
    evidence.readiness_limits?.er_current_r7j_finalization_state === "BLOCKED" &&
    evidence.readiness_limits?.er_canonical_approved_empirical_attestation_fingerprint_count === 0 &&
    evidence.readiness_limits?.sealed_er_finalized_dataset_artifact_count === 0 &&
    evidence.readiness_limits?.sealed_er_finalization_workflow_attestation_count === 0 &&
    evidence.readiness_limits?.er_finalization_execution_evidenced === false &&
    evidence.readiness_limits?.er_finalization_caller_supplied_flags_may_override_canonical_attestation === false &&
    evidence.readiness_limits?.er_finalization_public_claim_or_release_authorized === false &&
    evidence.readiness_limits?.er_finalization_production_authorized === false &&
    evidence.readiness_limits?.er_finalization_production === "HOLD" &&
    evidence.readiness_limits?.er_approved_calibration_strata_digest_binding_required === true &&
    evidence.readiness_limits?.er_case_to_approved_stratum_binding_required === true &&
    evidence.readiness_limits?.er_per_stratum_case_class_and_identity_boundary_minima_required === true &&
    evidence.readiness_limits
      ?.er_aggregate_class_boundary_coverage_may_substitute_for_per_stratum_grammar === false &&
    evidence.readiness_limits?.er_caller_supplied_calibration_manifest_must_match_canonical === true &&
    evidence.readiness_limits?.er_caller_supplied_calibration_manifest_may_override_canonical === false &&
    evidence.readiness_limits?.er_approved_calibration_strata_binding_verified_in_sealed_dataset === false &&
    evidence.readiness_limits?.er_per_stratum_case_class_and_identity_boundary_minima_verified === false &&
    evidence.readiness_limits?.er_required_scope_archetype_count === 7 &&
    evidence.readiness_limits?.er_scope_matrix_canonical_fingerprint_verified === true &&
    evidence.readiness_limits?.er_per_case_source_evidence_and_license_binding_required === true &&
    evidence.readiness_limits?.er_case_source_evidence_binding_required === true &&
    evidence.readiness_limits?.er_case_scope_archetype_binding_required === true &&
    evidence.readiness_limits?.er_empirical_sample_policy_fingerprint_verified === true &&
    evidence.readiness_limits?.er_minimum_total_cases_required === 800 &&
    evidence.readiness_limits?.er_minimum_blind_holdout_cases_required === 400 &&
    evidence.readiness_limits?.er_minimum_cases_per_scope_archetype_required === 50 &&
    evidence.readiness_limits?.er_minimum_blind_cases_per_scope_archetype_required === 25 &&
    evidence.readiness_limits?.er_minimum_cases_per_identity_boundary_required === 100 &&
    evidence.readiness_limits?.er_minimum_cases_per_case_class_required === 50 &&
    evidence.readiness_limits?.er_wilson_confidence_level_required === 0.95 &&
    evidence.readiness_limits?.er_minimum_overall_accuracy_wilson_lower_bound_required === 0.99 &&
    evidence.readiness_limits?.er_minimum_blind_accuracy_wilson_lower_bound_required === 0.99 &&
    evidence.readiness_limits?.er_per_case_source_evidence_binding_verified === false &&
    evidence.readiness_limits?.er_case_source_evidence_binding_verified === false &&
    evidence.readiness_limits?.er_case_source_payload_binding_verified === false &&
    evidence.readiness_limits?.er_case_license_evidence_binding_verified === false &&
    evidence.readiness_limits?.er_scope_policy_binding_verified === false &&
    evidence.readiness_limits?.er_sample_policy_binding_verified === false &&
    evidence.readiness_limits?.er_empirical_attestation_verified === false &&
    evidence.readiness_limits?.er_full_required_scope_archetype_coverage_verified === false &&
    evidence.readiness_limits?.er_empirical_sample_floors_verified === false &&
    evidence.readiness_limits?.er_wilson_95_lower_bound_gate_verified === false &&
    evidence.readiness_limits?.er_empirical_benchmark_gate_pass === false &&
    evidence.readiness_limits?.er_pre_track_b_promotion_authorized === false &&
    evidence.readiness_limits?.er_production_promotion_authorized === false &&
    evidence.readiness_limits?.er_empirical_promotion_authorized === false,
  "ER_CONTROL_LAUNDERED_INTO_EMPIRICAL_OR_TRACK_B_EVIDENCE");
  check(evidence.readiness_limits?.runtime_core_remote_cloudflare_execution_verified === false &&
    evidence.readiness_limits?.runtime_core_canonical_cloudflare_durability_verified === false &&
    evidence.readiness_limits?.task_lease_atomic_fencing_local_shadow_verified === true &&
    evidence.readiness_limits?.task_lease_atomic_fencing_remote_cloudflare_verified === false &&
    evidence.readiness_limits?.sealed_runtime_core_or_baseline_attestation_count === 0,
  "RUNTIME_CORE_DECLARATION_LAUNDERED_INTO_REMOTE_EXECUTION");
  check(evidence.readiness_limits?.indexes_are_computed === false, "INDEX_COMPUTATION_OVERCLAIM");
  check(evidence.readiness_limits?.public_projection_authorized === false, "PUBLIC_PROJECTION_OVERCLAIM");
  check(evidence.readiness_limits?.commercial_projection_authorized === false, "COMMERCIAL_PROJECTION_OVERCLAIM");
  check(evidence.readiness_limits?.production === "HOLD", "PRODUCTION_HOLD_REMOVED");
  check(evidence.recovery_operating_truth?.suite_status === "PASS", "RECOVERY_OPERATING_SUITE_NOT_PASSING");
  check(evidence.recovery_operating_truth?.executed_test_count === 24,
    "RECOVERY_OPERATING_EXPECTED_24_TESTS_MISMATCH");
  check(evidence.chaos_and_failure_mode_readiness?.oldest_age_least_recently_served_starvation_resistance ===
    "VERIFIED_LOCAL_SHADOW", "OLDEST_AGE_LRS_FAIRNESS_NOT_VERIFIED");
  check(evidence.chaos_and_failure_mode_readiness?.bounded_partition_rotation_without_starvation ===
    "VERIFIED_LOCAL_SHADOW", "BOUNDED_PARTITION_ROTATION_NOT_VERIFIED");
  check(evidence.replay_readiness?.replay_controller_and_lease === "VERIFIED_LOCAL_SHADOW",
    "REPLAY_CONTROLLER_AND_LEASE_NOT_VERIFIED");
  check(evidence.chaos_and_failure_mode_readiness?.circuit_breaker_state_transitions ===
    "VERIFIED_LOCAL_SHADOW", "CIRCUIT_BREAKER_TRANSITIONS_NOT_VERIFIED");
  check(evidence.chaos_and_failure_mode_readiness?.rate_and_cost_budget_exhaustion ===
    "VERIFIED_LOCAL_SHADOW", "RATE_AND_COST_BUDGET_EXHAUSTION_NOT_VERIFIED");
  check(evidence.chaos_and_failure_mode_readiness?.terminal_dlq_persist_before_ack_fail_closed ===
    "VERIFIED_LOCAL_SHADOW", "TERMINAL_DLQ_PERSIST_BEFORE_ACK_NOT_VERIFIED");
  check(evidence.chaos_and_failure_mode_readiness?.terminal_dlq_receipt_idempotency ===
    "VERIFIED_LOCAL_SHADOW", "TERMINAL_DLQ_RECEIPT_IDEMPOTENCY_NOT_VERIFIED");
  check(evidence.chaos_and_failure_mode_readiness?.decision_value_priority === "NOT_IMPLEMENTED",
    "DECISION_VALUE_PRIORITY_OVERCLAIM");
  check(evidence.chaos_and_failure_mode_readiness?.coverage_gap_priority === "NOT_IMPLEMENTED",
    "COVERAGE_GAP_PRIORITY_OVERCLAIM");
  check(evidence.chaos_and_failure_mode_readiness?.market_funnel_priority_completeness === "HOLD",
    "MARKET_FUNNEL_PRIORITY_COMPLETENESS_OVERCLAIM");
  check(evidence.recovery_operating_truth?.terminal_dlq_loss_guarantee === false,
    "RECOVERY_TERMINAL_DLQ_LOSS_GUARANTEE_OVERCLAIM");
  check(evidence.recovery_operating_truth?.network_requests === 0, "RECOVERY_TEST_NETWORK_REQUEST_DETECTED");
  check(evidence.recovery_operating_truth?.remote_resources_verified === false,
    "RECOVERY_REMOTE_RESOURCE_VERIFICATION_OVERCLAIM");
  check(evidence.recovery_operating_truth?.deployed === false, "RECOVERY_DEPLOYMENT_OVERCLAIM");
  check(evidence.recovery_operating_truth?.public_projection_authorized === false,
    "RECOVERY_PUBLIC_PROJECTION_OVERCLAIM");
  check(evidence.recovery_operating_truth?.production === "HOLD", "RECOVERY_PRODUCTION_HOLD_REMOVED");

  check(evidence.toolchain?.node_version === "v24.19.0", "TOOLCHAIN_NODE_VERSION_MISMATCH");
  check(evidence.toolchain?.platform === "linux" && evidence.toolchain?.architecture === "x64",
    "TOOLCHAIN_PLATFORM_OR_ARCHITECTURE_MISMATCH");
  check(evidence.toolchain?.deterministic_environment?.TZ === "UTC" &&
    evidence.toolchain?.deterministic_environment?.LANG === "C.UTF-8" &&
    evidence.toolchain?.deterministic_environment?.LC_ALL === "C.UTF-8",
  "TOOLCHAIN_DETERMINISTIC_ENVIRONMENT_MISMATCH");
  check(evidence.canonical_code_input_semantics ===
    "HASHED_IMPLEMENTATION_PROVENANCE_NOT_EXECUTION_ATTESTATION",
  "CANONICAL_CODE_INPUT_SEMANTICS_MISMATCH");
  const codeInputKeys = Object.keys(evidence.canonical_code_inputs ?? {});
  const contractCodeInputKeys = Object.keys(contract.canonical_code_inputs ?? {});
  check(new Set(codeInputKeys).size === codeInputKeys.length &&
    canonicalJson([...codeInputKeys].sort()) === canonicalJson([...contractCodeInputKeys].sort()) &&
    contractCodeInputKeys.every(key => evidence.canonical_code_inputs?.[key]?.path ===
      contract.canonical_code_inputs[key] &&
      /^sha256:[a-f0-9]{64}$/.test(evidence.canonical_code_inputs?.[key]?.sha256 ?? "") &&
      Number.isInteger(evidence.canonical_code_inputs?.[key]?.byte_count) &&
      evidence.canonical_code_inputs[key].byte_count > 0),
  "CANONICAL_CODE_PROVENANCE_INPUT_MANIFEST_MISMATCH");
  check(/^sha256:[a-f0-9]{64}$/.test(evidence.toolchain?.dependency_lockfiles?.root_npm_shrinkwrap?.sha256 ?? ""),
    "ROOT_DEPENDENCY_LOCK_DIGEST_MISSING");
  check(/^sha256:[a-f0-9]{64}$/.test(
    evidence.toolchain?.dependency_lockfiles?.autonomous_intelligence_package_lock?.sha256 ?? ""),
  "AUTONOMOUS_INTELLIGENCE_DEPENDENCY_LOCK_DIGEST_MISSING");
  if (evidence.source_truth?.purpose_eligibility_artifact_present === true) {
    check(Object.values(evidence.transitive_provenance?.source_rights_policy_preflight?.input_fingerprints ?? {})
      .every(value => /^sha256:[a-f0-9]{64}$/.test(value)) &&
      Object.keys(evidence.transitive_provenance?.source_rights_policy_preflight?.input_fingerprints ?? {}).length > 0 &&
      /^sha256:[a-f0-9]{64}$/.test(
        evidence.transitive_provenance?.source_rights_policy_preflight?.eligibility_fingerprint ?? ""),
    "RIGHTS_POLICY_PREFLIGHT_TRANSITIVE_PROVENANCE_INCOMPLETE");
  }
  check(Object.values(evidence.transitive_provenance?.global_pool_bootstrap_capture?.input_fingerprints ?? {})
    .every(value => /^sha256:[a-f0-9]{64}$/.test(value)) &&
    Object.keys(evidence.transitive_provenance?.global_pool_bootstrap_capture?.input_fingerprints ?? {}).length > 0 &&
    /^sha256:[a-f0-9]{64}$/.test(
      evidence.transitive_provenance?.global_pool_bootstrap_capture?.bootstrap_fingerprint ?? ""),
  "BOOTSTRAP_TRANSITIVE_PROVENANCE_INCOMPLETE");
  check(Object.values(evidence.transitive_provenance?.scope_source_pool_readiness?.input_fingerprints ?? {})
    .every(value => /^sha256:[a-f0-9]{64}$/.test(value?.fingerprint ?? "")) &&
    Object.keys(evidence.transitive_provenance?.scope_source_pool_readiness?.input_fingerprints ?? {}).length > 0 &&
    Object.values(evidence.transitive_provenance?.scope_source_pool_readiness?.output_fingerprints ?? {})
      .every(value => /^sha256:[a-f0-9]{64}$/.test(value)) &&
    Object.keys(evidence.transitive_provenance?.scope_source_pool_readiness?.output_fingerprints ?? {}).length > 0 &&
    /^sha256:[a-f0-9]{64}$/.test(evidence.transitive_provenance?.scope_source_pool_readiness?.run_fingerprint ?? ""),
  "READINESS_TRANSITIVE_PROVENANCE_INCOMPLETE");

  const evidenceControlIds = evidence.negative_control_contract?.controls ?? [];
  check(evidence.negative_control_contract?.count === contract.negative_controls.length,
    "NEGATIVE_CONTROL_CONTRACT_COUNT_MISMATCH");
  check(new Set(evidenceControlIds).size === evidenceControlIds.length &&
    canonicalJson([...evidenceControlIds].sort()) === canonicalJson([...contract.negative_controls].sort()),
  "NEGATIVE_CONTROL_CONTRACT_ID_SET_MISMATCH");
  return errors;
}

function resign(evidence) {
  evidence.evidence_fingerprint = evidenceFingerprint(evidence);
  return evidence;
}

function clone(value) {
  return structuredClone(value);
}

function expectRejected(name, source, expected, contract, mutate, expectedErrorCodes, resignAfter = true) {
  const candidate = clone(source);
  mutate(candidate);
  if (resignAfter) resign(candidate);
  const actualErrorCodes = evidenceErrors(candidate, expected, contract);
  if (canonicalJson([...actualErrorCodes].sort()) !== canonicalJson([...expectedErrorCodes].sort())) {
    throw new Error(`NEGATIVE_CONTROL_UNEXPECTED_ERROR_CODES:${name}:` +
      `expected=${JSON.stringify(expectedErrorCodes)}:actual=${JSON.stringify(actualErrorCodes)}`);
  }
}

function parseArguments(argv) {
  const config = { input: defaultInputPath };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--input") config.input = path.resolve(argv[++index]);
    else throw new Error(`Unknown argument: ${argv[index]}`);
  }
  return config;
}

export async function validateAsiShadowOperatingEvidence(evidence) {
  const contract = JSON.parse(fs.readFileSync(contractPath, "utf8"));
  const expected = await buildAsiShadowOperatingEvidence();
  const errors = evidenceErrors(evidence, expected, contract);
  if (errors.length > 0) throw new Error(`ASI_SHADOW_OPERATING_EVIDENCE_INVALID:\n${errors.join("\n")}`);

  const canonicalMismatch = "EVIDENCE_NOT_CURRENT_WITH_CANONICAL_INPUTS_AND_TESTS";
  const negativeControls = [
    {
      id: "PROCESSOR_COUNT_INFLATION",
      mutate: value => {
        value.execution_truth.registered_processor_count += 1;
        value.execution_truth.exercised_processor_count += 1;
      },
      errors: [canonicalMismatch, "PROCESSOR_COUNT_INFLATED_OR_STALE"]
    },
    {
      id: "BOUNDED_SHADOW_RIGHTS_POLICY_PREFLIGHT_COUNT_INFLATION",
      mutate: value => { value.source_truth.bounded_shadow_rights_policy_preflight_pass_source_count += 1; },
      errors: [canonicalMismatch,
        "SOURCE_TRUTH_COUNT_MISMATCH:bounded_shadow_rights_policy_preflight_pass_source_count"]
    },
    {
      id: "PURPOSE_POLICY_PREFLIGHT_COUNT_INFLATION",
      mutate: value => { value.source_truth.purpose_policy_preflight_pass_source_count += 1; },
      errors: [canonicalMismatch, "SOURCE_TRUTH_COUNT_MISMATCH:purpose_policy_preflight_pass_source_count"]
    },
    {
      id: "SCOPE_POOL_COUNT_INFLATION",
      mutate: value => { value.source_truth.scope_source_pools_ready += 1; },
      errors: [canonicalMismatch, "SOURCE_TRUTH_COUNT_MISMATCH:scope_source_pools_ready"]
    },
    {
      id: "INDEX_COUNT_INFLATION",
      mutate: value => { value.source_truth.indexes_computed += 1; },
      errors: [canonicalMismatch, "SOURCE_TRUTH_COUNT_MISMATCH:indexes_computed"]
    },
    {
      id: "REMOTE_DEPLOYMENT_FORGERY",
      mutate: value => {
        value.execution_truth.remote_deployment_verified = true;
        value.execution_truth.deployed_runtime_count = 1;
      },
      errors: [canonicalMismatch, "REMOTE_DEPLOYMENT_OVERCLAIM", "DEPLOYED_RUNTIME_COUNT_OVERCLAIM"]
    },
    {
      id: "PUBLIC_PROJECTION_FORGERY",
      mutate: value => { value.readiness_limits.public_projection_authorized = true; },
      errors: [canonicalMismatch, "PUBLIC_PROJECTION_OVERCLAIM"]
    },
    {
      id: "COMMERCIAL_PROJECTION_FORGERY",
      mutate: value => { value.readiness_limits.commercial_projection_authorized = true; },
      errors: [canonicalMismatch, "COMMERCIAL_PROJECTION_OVERCLAIM"]
    },
    {
      id: "PRODUCTION_PROMOTION_FORGERY",
      mutate: value => { value.readiness_limits.production = "ACTIVE"; },
      errors: [canonicalMismatch, "PRODUCTION_HOLD_REMOVED"]
    },
    {
      id: "TEST_RESULT_FORGERY",
      mutate: value => { value.test_execution.required_suite_pass_count = 0; },
      errors: [canonicalMismatch, "REQUIRED_TEST_SUITE_NOT_PASSING"]
    },
    {
      id: "FAILURE_OBSERVATION_REMOVAL",
      mutate: value => { value.failure_observations.pop(); },
      errors: [canonicalMismatch, "FAILURE_OBSERVATION_COUNT_MISMATCH",
        "FAILURE_OBSERVATION_MISSING:INSTITUTIONAL_CONTEXT_NOT_PROMOTED_TO_MARKET_EVIDENCE",
        "FAILURE_OBSERVATION_NOT_PROVEN:INSTITUTIONAL_CONTEXT_NOT_PROMOTED_TO_MARKET_EVIDENCE"]
    },
    {
      id: "EVIDENCE_FINGERPRINT_TAMPER",
      mutate: value => { value.evidence_fingerprint = "sha256:" + "0".repeat(64); },
      errors: ["EVIDENCE_FINGERPRINT_MISMATCH", canonicalMismatch],
      resign_after: false
    },
    {
      id: "STALE_CANONICAL_EXACT_EQUALITY",
      mutate: value => { value.contract.fingerprint = "sha256:" + "f".repeat(64); },
      errors: [canonicalMismatch]
    },
    {
      id: "MAINLINE_DECLARED_SOURCE_COUNT_INFLATION",
      mutate: value => {
        value.source_truth.mainline_methodology_declared_identity_context_admitted_source_count += 1;
      },
      errors: [canonicalMismatch,
        "SOURCE_TRUTH_COUNT_MISMATCH:mainline_methodology_declared_identity_context_admitted_source_count"]
    },
    {
      id: "HISTORICAL_CONTEXT_CURRENT_MARKET_CONFLATION",
      mutate: value => { value.readiness_limits.current_market_event_evidence_available = true; },
      errors: [canonicalMismatch, "CURRENT_MARKET_EVENT_EVIDENCE_OVERCLAIM"]
    },
    {
      id: "MAINLINE_WORKFLOW_PRESENCE_SEALED_EXECUTION_LAUNDERING",
      mutate: value => {
        value.execution_truth.mainline_workflow_presence_is_sealed_execution_attestation = true;
      },
      errors: [canonicalMismatch, "MAINLINE_WORKFLOW_PRESENCE_LAUNDERED_INTO_SEALED_EXECUTION"]
    },
    {
      id: "GLOBAL_RIGHTS_R2_DECLARATION_STRICT_R1_OR_LEGAL_LAUNDERING",
      mutate: value => {
        value.source_truth.global_rights_r2_strict_r1_revalidation_complete = true;
      },
      errors: [canonicalMismatch,
        "GLOBAL_RIGHTS_R2_DECLARATION_LAUNDERED_INTO_STRICT_R1_OR_LEGAL_CLEARANCE"]
    },
    {
      id: "DESIGNER_MAKER_R3_REPOSITORY_DECLARATION_STRICT_R1_LEGAL_RUNTIME_MARKET_POOL_OR_PUBLIC_LAUNDERING",
      mutate: value => {
        value.source_truth.designer_maker_r3_strict_r1_evidence_bound_admitted_source_count = 1;
      },
      errors: [canonicalMismatch,
        "SOURCE_TRUTH_COUNT_MISMATCH:designer_maker_r3_strict_r1_evidence_bound_admitted_source_count",
        "DESIGNER_MAKER_R3_REPOSITORY_DECLARATION_LAUNDERED_INTO_STRICT_R1_LEGAL_RUNTIME_MARKET_POOL_OR_PUBLIC"]
    },
    {
      id: "ER_CONTROL_EMPIRICAL_99_PERCENT_OR_TRACK_B_LAUNDERING",
      mutate: value => { value.source_truth.er_empirical_99_percent_evidenced = true; },
      errors: [canonicalMismatch, "ER_CONTROL_LAUNDERED_INTO_EMPIRICAL_OR_TRACK_B_EVIDENCE"]
    },
    {
      id: "ER_SCOPE_PER_CASE_ATTESTATION_GATE_LAUNDERING",
      mutate: value => { value.source_truth.er_empirical_promotion_authorized = true; },
      errors: [canonicalMismatch, "ER_CONTROL_LAUNDERED_INTO_EMPIRICAL_OR_TRACK_B_EVIDENCE"]
    },
    {
      id: "ER_SAMPLE_FLOOR_OR_WILSON95_GATE_LAUNDERING",
      mutate: value => { value.source_truth.er_empirical_benchmark_gate_pass = true; },
      errors: [canonicalMismatch, "ER_CONTROL_LAUNDERED_INTO_EMPIRICAL_OR_TRACK_B_EVIDENCE"]
    },
    {
      id: "ER_AGGREGATE_CLASS_BOUNDARY_COVERAGE_PER_STRATUM_GRAMMAR_LAUNDERING",
      mutate: value => {
        value.source_truth.er_aggregate_class_boundary_coverage_may_substitute_for_per_stratum_grammar = true;
      },
      errors: [canonicalMismatch, "ER_CONTROL_LAUNDERED_INTO_EMPIRICAL_OR_TRACK_B_EVIDENCE"]
    },
    {
      id: "ER_CALLER_SUPPLIED_CALIBRATION_MANIFEST_DIVERGENCE_LAUNDERING",
      mutate: value => {
        value.source_truth.er_caller_supplied_calibration_manifest_may_override_canonical = true;
      },
      errors: [canonicalMismatch, "ER_CONTROL_LAUNDERED_INTO_EMPIRICAL_OR_TRACK_B_EVIDENCE"]
    },
    {
      id: "ER_R7EFG_IMPLEMENTATION_SEALED_EXECUTION_LAUNDERING",
      mutate: value => { value.source_truth.er_r7efg_executed_constructed_control_case_count = 1; },
      errors: [canonicalMismatch,
        "SOURCE_TRUTH_COUNT_MISMATCH:er_r7efg_executed_constructed_control_case_count",
        "ER_CONTROL_LAUNDERED_INTO_EMPIRICAL_OR_TRACK_B_EVIDENCE"]
    },
    {
      id: "ER_R7EFG_LINEAGE_SHA_AUTHORITY_OR_PROMOTION_LAUNDERING",
      mutate: value => {
        value.transitive_provenance.entity_resolution_control_implementations
          .r7efg_prior_input_sha256_is_sealed_execution_or_empirical_evidence = true;
      },
      errors: [canonicalMismatch, "ER_CONTROL_LAUNDERED_INTO_EMPIRICAL_OR_TRACK_B_EVIDENCE"]
    },
    {
      id: "ER_R7HI_IMPLEMENTATION_SEALED_EXECUTION_LAUNDERING",
      mutate: value => { value.source_truth.er_r7hi_executed_constructed_control_case_count = 1; },
      errors: [canonicalMismatch,
        "SOURCE_TRUTH_COUNT_MISMATCH:er_r7hi_executed_constructed_control_case_count",
        "ER_CONTROL_LAUNDERED_INTO_EMPIRICAL_OR_TRACK_B_EVIDENCE"]
    },
    {
      id: "ER_R7HI_LINEAGE_SHA_AUTHORITY_OR_PROMOTION_LAUNDERING",
      mutate: value => {
        value.transitive_provenance.entity_resolution_control_implementations
          .r7hi_prior_input_sha256_is_sealed_execution_or_empirical_evidence = true;
      },
      errors: [canonicalMismatch, "ER_CONTROL_LAUNDERED_INTO_EMPIRICAL_OR_TRACK_B_EVIDENCE"]
    },
    {
      id: "ER_R7HI_PUBLIC_OR_PRODUCTION_AUTHORIZATION_LAUNDERING",
      mutate: value => {
        value.source_truth.er_r7hi_public_claim_or_release_authorized = true;
        value.source_truth.er_r7hi_production_authorized = true;
      },
      errors: [canonicalMismatch, "ER_CONTROL_LAUNDERED_INTO_EMPIRICAL_OR_TRACK_B_EVIDENCE"]
    },
    {
      id: "ER_R7J_IMPLEMENTATION_SEALED_EXECUTION_LAUNDERING",
      mutate: value => { value.source_truth.er_r7j_executed_constructed_control_case_count = 1; },
      errors: [canonicalMismatch,
        "SOURCE_TRUTH_COUNT_MISMATCH:er_r7j_executed_constructed_control_case_count",
        "ER_CONTROL_LAUNDERED_INTO_EMPIRICAL_OR_TRACK_B_EVIDENCE"]
    },
    {
      id: "ER_R7J_FULL_SCOPE_OR_EMPIRICAL_PROMOTION_LAUNDERING",
      mutate: value => {
        value.source_truth.er_r7j_declared_all_required_grammars_complete = true;
        value.source_truth.er_r7j_empirical_benchmark_evidence_present = true;
      },
      errors: [canonicalMismatch, "ER_CONTROL_LAUNDERED_INTO_EMPIRICAL_OR_TRACK_B_EVIDENCE"]
    },
    {
      id: "ER_FINALIZER_OR_CALLER_BOOLEAN_FORGERY_SEALED_FINAL_ARTIFACT_LAUNDERING",
      mutate: value => {
        value.source_truth.er_current_r7j_finalization_state = "FINALIZED";
        value.source_truth.er_canonical_approved_empirical_attestation_fingerprint_count = 1;
        value.source_truth.sealed_er_finalized_dataset_artifact_count = 1;
        value.source_truth.er_finalization_execution_evidenced = true;
      },
      errors: [canonicalMismatch,
        "SOURCE_TRUTH_COUNT_MISMATCH:er_canonical_approved_empirical_attestation_fingerprint_count",
        "SOURCE_TRUTH_COUNT_MISMATCH:sealed_er_finalized_dataset_artifact_count",
        "ER_CONTROL_LAUNDERED_INTO_EMPIRICAL_OR_TRACK_B_EVIDENCE"]
    },
    {
      id: "CANDIDATE_HANDOFF_BLOCKED_SELFTEST_READY_TRACK_B_PUBLIC_PRODUCTION_LAUNDERING",
      mutate: value => {
        const handoff = value.transitive_provenance.candidate_handoff_r2_downstream_blocked_selftest;
        handoff.current_state = "READY";
        handoff.ready_pair_count = 1;
        handoff.track_b_submission_count = 1;
        handoff.track_b_assessment_count = 1;
        handoff.track_b_pass_count = 1;
        handoff.publication_authorized_count = 1;
        handoff.production_authorized_count = 1;
        handoff.publication = "AUTHORIZED";
        handoff.production = "AUTHORIZED";
      },
      errors: [canonicalMismatch,
        "CANDIDATE_HANDOFF_BLOCKED_SELFTEST_LAUNDERED_INTO_READY_TRACK_B_PUBLIC_OR_PRODUCTION"]
    },
    {
      id: "RUNTIME_CORE_DECLARATION_REMOTE_EXECUTION_LAUNDERING",
      mutate: value => {
        value.execution_truth.mainline_runtime_core_remote_execution_verified = true;
      },
      errors: [canonicalMismatch, "RUNTIME_CORE_DECLARATION_LAUNDERED_INTO_REMOTE_EXECUTION"]
    },
    {
      id: "TASK_LEASE_ATOMIC_FENCING_REMOTE_EXECUTION_LAUNDERING",
      mutate: value => {
        value.readiness_limits.task_lease_atomic_fencing_remote_cloudflare_verified = true;
      },
      errors: [canonicalMismatch, "RUNTIME_CORE_DECLARATION_LAUNDERED_INTO_REMOTE_EXECUTION"]
    }
  ];
  const implementedIds = negativeControls.map(control => control.id);
  if (new Set(implementedIds).size !== implementedIds.length ||
      canonicalJson([...implementedIds].sort()) !== canonicalJson([...contract.negative_controls].sort())) {
    throw new Error("NEGATIVE_CONTROL_IMPLEMENTATION_ID_SET_MISMATCH");
  }
  for (const control of negativeControls) {
    expectRejected(control.id, evidence, expected, contract, control.mutate, control.errors,
      control.resign_after ?? true);
  }
  return { expected, negativeControlCount: negativeControls.length };
}

async function main() {
  const config = parseArguments(process.argv.slice(2));
  const evidence = JSON.parse(fs.readFileSync(config.input, "utf8"));
  const result = await validateAsiShadowOperatingEvidence(evidence);
  console.log("KIDULTS ASI SHADOW operating evidence: PASS");
  console.log(`Processors registered/exercised: ${evidence.execution_truth.registered_processor_count}/${evidence.execution_truth.exercised_processor_count}`);
  console.log(`Actual SHADOW tests: ${evidence.test_execution.executed_test_count}`);
  console.log(`Evidence negative controls: ${result.negativeControlCount}/${result.negativeControlCount} PASS`);
  console.log("Deployment/public/commercial/Production: NOT DEPLOYED/FALSE/FALSE/HOLD");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
