#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "../../..");
const contractPath = path.join(repositoryRoot, "coordination/kidults/source-intelligence/asi-shadow-operating-evidence-contract-v1.json");
const defaultOutputPath = path.join(repositoryRoot, "artifacts/agci-os/asi-shadow-operating-evidence-v1.json");
const expectedToolchain = Object.freeze({
  node_version: "v24.19.0",
  platform: "linux",
  architecture: "x64"
});
const requiredCanonicalCodeInputs = Object.freeze({
  processor_registry: "services/kidults-autonomous-intelligence/src/asi/registry.ts",
  event_runtime: "services/kidults-autonomous-intelligence/src/asi/event.ts",
  processor_implementations: "services/kidults-autonomous-intelligence/src/asi/processors.ts",
  processor_runtime: "services/kidults-autonomous-intelligence/src/asi/processor-runtime.ts",
  queue_recovery_runtime: "services/kidults-autonomous-intelligence/src/asi/runtime.ts",
  canonical_foundation_migration: "services/kidults-autonomous-intelligence/migrations/0001_canonical_foundation.sql",
  autonomous_orchestration_migration: "services/kidults-autonomous-intelligence/migrations/0002_autonomous_orchestration.sql",
  market_funnel_shadow_migration: "services/kidults-autonomous-intelligence/migrations/0003_asi_market_funnel_shadow.sql",
  processor_shadow_migration: "services/kidults-autonomous-intelligence/migrations/0004_asi_processor_shadow.sql",
  recovery_fairness_shadow_migration: "services/kidults-autonomous-intelligence/migrations/0005_asi_runtime_recovery_fairness_shadow.sql",
  task_lease_atomic_fencing_shadow_migration: "services/kidults-autonomous-intelligence/migrations/0006_asi_task_lease_atomic_fencing_shadow.sql",
  d1_fail_closed_shadow_test: "services/kidults-autonomous-intelligence/scripts/asi-processor-shadow-test.mjs",
  queue_d1_processor_e2e_test: "services/kidults-autonomous-intelligence/scripts/asi-processor-runtime-e2e-test.mjs",
  runtime_recovery_fairness_test: "services/kidults-autonomous-intelligence/scripts/asi-runtime-recovery-fairness-test.mjs",
  met_real_source_admission_runner: "scripts/kidults/source-intelligence/run-met-real-source-admission-r1.mjs",
  getty_historical_sale_runner: "scripts/kidults/source-intelligence/run-getty-historical-sale-r1.mjs",
  real_source_processor_bridge_builder: "scripts/kidults/source-intelligence/build-real-source-processor-bridge-r1.mjs",
  real_source_queue_d1_injection_runner: "services/kidults-autonomous-intelligence/scripts/asi-real-source-queue-injection-r1.mjs",
  real_source_retry_dlq_quarantine_runner: "services/kidults-autonomous-intelligence/scripts/asi-real-source-retry-dlq-quarantine-r1.mjs",
  met_real_source_admission_workflow: ".github/workflows/kidults-asi-real-source-admission-r1.yml",
  getty_historical_sale_workflow: ".github/workflows/kidults-asi-getty-historical-sale-r1.yml",
  real_source_processor_bridge_workflow: ".github/workflows/kidults-asi-real-source-processor-bridge-r1.yml",
  real_source_queue_d1_injection_workflow: ".github/workflows/kidults-asi-real-source-queue-injection-r1.yml",
  real_source_retry_dlq_quarantine_workflow: ".github/workflows/kidults-asi-real-source-retry-dlq-quarantine-r1.yml",
  runtime_control_baseline_runner: "scripts/kidults/runtime/run-real-source-runtime-control-baseline-r1.mjs",
  entity_resolution_benchmark_runner: "scripts/kidults/entity-resolution/run-entity-resolution-benchmark-v2.mjs",
  entity_resolution_real_dataset_assembler: "scripts/kidults/entity-resolution/assemble-real-world-er-dataset-r1.mjs",
  entity_resolution_getty_transaction_r2_extender: "scripts/kidults/entity-resolution/extend-er-dataset-getty-transaction-r2.mjs",
  entity_resolution_wikidata_design_r3_extender: "scripts/kidults/entity-resolution/extend-er-dataset-wikidata-design-r3.mjs",
  entity_resolution_real_holdout_r4_freezer: "scripts/kidults/entity-resolution/freeze-er-blind-holdout-v1.mjs",
  entity_resolution_cross_market_alias_r5_extender: "scripts/kidults/entity-resolution/extend-er-dataset-cross-market-alias-r5.mjs",
  entity_resolution_ambiguous_review_r6_extender: "scripts/kidults/entity-resolution/extend-er-dataset-ambiguous-review-r6.mjs",
  entity_resolution_approved_strata_validator: "scripts/kidults/entity-resolution/validate-approved-calibration-strata-v1.mjs",
  entity_resolution_approved_strata_r7a_promoter: "scripts/kidults/entity-resolution/promote-er-r6-to-approved-strata-r7a.mjs",
  entity_resolution_serialized_reference_r7b_extender: "scripts/kidults/entity-resolution/extend-er-r7a-serialized-reference-r7b.mjs",
  entity_resolution_variant_release_r7c_extender: "scripts/kidults/entity-resolution/extend-er-r7b-variant-release-r7c.mjs",
  entity_resolution_serialized_cross_authority_r7e_extender: "scripts/kidults/entity-resolution/extend-er-r7c-serialized-cross-authority-r7e.mjs",
  entity_resolution_vehicle_minimums_r7f_extender: "scripts/kidults/entity-resolution/extend-er-r7e-vehicle-minimums-r7f.mjs",
  entity_resolution_variant_minimums_r7g_extender: "scripts/kidults/entity-resolution/extend-er-r7f-variant-minimums-r7g.mjs",
  entity_resolution_pressing_minimums_r7h_extender: "scripts/kidults/entity-resolution/extend-er-r7g-pressing-minimums-r7h.mjs",
  entity_resolution_provenance_minimums_r7i_extender: "scripts/kidults/entity-resolution/extend-er-r7h-provenance-minimums-r7i.mjs",
  entity_resolution_designer_maker_minimums_r7j_extender: "scripts/kidults/entity-resolution/extend-er-r7i-designer-maker-minimums-r7j.mjs",
  entity_resolution_approved_dataset_finalizer: "scripts/kidults/entity-resolution/finalize-er-approved-dataset-v1.mjs",
  asi_runtime_core_validation_workflow: ".github/workflows/kidults-asi-runtime-core-validation-r1.yml",
  runtime_control_baseline_workflow: ".github/workflows/kidults-runtime-control-baseline-r1.yml",
  global_rights_source_pool_expansion_r2_workflow: ".github/workflows/kidults-global-rights-source-pool-expansion-r2.yml",
  designer_maker_repository_declared_identity_calibration_admission_r3_workflow: ".github/workflows/kidults-designer-maker-source-admission-r3.yml",
  entity_resolution_benchmark_v2_workflow: ".github/workflows/kidults-entity-resolution-benchmark-v2-runner.yml",
  entity_resolution_real_dataset_workflow: ".github/workflows/kidults-er-real-dataset-r1.yml",
  entity_resolution_getty_transaction_r2_workflow: ".github/workflows/kidults-er-getty-transaction-r2.yml",
  entity_resolution_canonical_design_r3_workflow: ".github/workflows/kidults-er-canonical-design-r3.yml",
  entity_resolution_real_holdout_r4_workflow: ".github/workflows/kidults-er-real-holdout-r4.yml",
  entity_resolution_cross_market_alias_r5_workflow: ".github/workflows/kidults-er-cross-market-alias-r5.yml",
  entity_resolution_ambiguous_review_r6_workflow: ".github/workflows/kidults-er-ambiguous-review-r6.yml",
  entity_resolution_approved_strata_workflow: ".github/workflows/kidults-er-approved-calibration-strata-v1.yml",
  entity_resolution_approved_strata_r7a_workflow: ".github/workflows/kidults-er-r7a-approved-strata-real.yml",
  entity_resolution_serialized_reference_r7b_workflow: ".github/workflows/kidults-er-r7b-serialized-reference-real.yml",
  entity_resolution_variant_release_r7c_workflow: ".github/workflows/kidults-er-r7c-variant-release-real.yml",
  entity_resolution_serialized_cross_authority_r7e_workflow: ".github/workflows/kidults-er-r7e-serialized-cross-authority.yml",
  entity_resolution_vehicle_minimums_r7f_workflow: ".github/workflows/kidults-er-r7f-vehicle-minimums.yml",
  entity_resolution_variant_minimums_r7g_workflow: ".github/workflows/kidults-er-r7g-variant-minimums.yml",
  entity_resolution_pressing_minimums_r7h_workflow: ".github/workflows/kidults-er-r7h-pressing-minimums.yml",
  entity_resolution_provenance_minimums_r7i_workflow: ".github/workflows/kidults-er-r7i-provenance-minimums.yml",
  entity_resolution_designer_maker_minimums_r7j_workflow: ".github/workflows/kidults-er-r7j-designer-maker-minimums.yml",
  entity_resolution_finalization_preflight_workflow: ".github/workflows/kidults-er-finalization-preflight-v1.yml",
  candidate_handoff_preflight_validator_r2: "scripts/kidults/poc/validate-candidate-evidence-handoff-r2.mjs",
  candidate_handoff_preflight_workflow_r2: ".github/workflows/kidults-candidate-evidence-handoff-preflight-r2.yml",
  autonomous_runtime_workflow: ".github/workflows/kidults-autonomous-runtime.yml",
  runtime_deploy_preflight: "services/kidults-autonomous-intelligence/scripts/deploy-preflight.mjs",
  runtime_smoke: "services/kidults-autonomous-intelligence/scripts/runtime-smoke.mjs",
  rights_access_review_compiler: "scripts/kidults/source-intelligence/compile-asi-source-rights-access-review-r1.mjs",
  rights_access_review_validator: "scripts/kidults/source-intelligence/validate-asi-source-rights-access-review-r1.mjs",
  global_pool_bootstrap_compiler: "scripts/kidults/source-intelligence/compile-global-pool-r1-bootstrap-capture-v1.mjs",
  global_pool_frontier_compiler: "scripts/kidults/source-intelligence/compile-global-pool-r1-frontier-v1.mjs",
  scope_source_pool_readiness_builder: "scripts/kidults/source-intelligence/build-scope-source-pool-readiness-v1.mjs",
  market_funnel_validator: "scripts/kidults/source-intelligence/validate-asi-market-funnel-v1.mjs",
  market_funnel_simulator: "scripts/kidults/source-intelligence/simulate-asi-market-funnel-v1.mjs",
  shadow_evidence_builder: "scripts/kidults/source-intelligence/build-asi-shadow-operating-evidence-v1.mjs",
  shadow_evidence_validator: "scripts/kidults/source-intelligence/validate-asi-shadow-operating-evidence-v1.mjs",
  shadow_evidence_workflow: ".github/workflows/kidults-asi-shadow-operating-evidence-v1.yml",
  root_package_manifest: "package.json",
  root_dependency_lock: "npm-shrinkwrap.json",
  autonomous_intelligence_package_manifest: "services/kidults-autonomous-intelligence/package.json",
  autonomous_intelligence_dependency_lock: "services/kidults-autonomous-intelligence/package-lock.json"
});
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

export function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  }
  return value;
}

export function fingerprint(value) {
  return `sha256:${crypto.createHash("sha256").update(JSON.stringify(stable(value))).digest("hex")}`;
}

function calibrationStrataGrammar(manifest) {
  return [...(manifest.strata ?? [])].map(stratum => ({
    stratum_id: stratum.stratum_id,
    archetype: stratum.archetype,
    status: stratum.status,
    minimum_case_classes: [...(stratum.minimum_case_classes ?? [])].sort(),
    minimum_boundaries: [...(stratum.minimum_boundaries ?? [])].sort()
  })).sort((left, right) => left.stratum_id.localeCompare(right.stratum_id));
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8"));
}

function inputReference(relativePath) {
  const value = readJson(relativePath);
  return {
    path: relativePath,
    id: value.id ?? value.registry_id ?? null,
    version: value.version ?? null,
    fingerprint: fingerprint(value)
  };
}

function fileReference(relativePath) {
  const content = fs.readFileSync(path.join(repositoryRoot, relativePath));
  return {
    path: relativePath,
    sha256: `sha256:${crypto.createHash("sha256").update(content).digest("hex")}`,
    byte_count: content.byteLength
  };
}

function parseFinalJson(stdout, suiteId) {
  const lines = stdout.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (!lines[index].startsWith("{")) continue;
    try {
      return JSON.parse(lines[index]);
    } catch {
      // Continue until a complete JSON summary line is found.
    }
  }
  throw new Error(`${suiteId}:FINAL_JSON_SUMMARY_MISSING`);
}

function tapTests(stdout) {
  return stdout.split(/\r?\n/).map(line => {
    const match = /^(ok|not ok)\s+\d+\s+-\s+(.+)$/.exec(line.trim());
    if (!match) return null;
    const directiveMatch = /\s+#\s*(SKIP|TODO)\b/i.exec(match[2]);
    return {
      status: match[1],
      name: directiveMatch ? match[2].slice(0, directiveMatch.index).trim() : match[2].trim(),
      directive: directiveMatch ? directiveMatch[1].toUpperCase() : null
    };
  }).filter(Boolean);
}

function executeSuite(suite) {
  const [runtime, ...argumentsList] = suite.command.split(" ");
  if (runtime !== "node") throw new Error(`${suite.suite_id}:UNSUPPORTED_RUNTIME`);
  const result = spawnSync(process.execPath, argumentsList, {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      TZ: "UTC",
      LANG: "C.UTF-8",
      LC_ALL: "C.UTF-8",
      KAIOS_ASI_TEST_CLOCK: "2025-01-15T12:00:00.000Z"
    },
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${suite.suite_id}:FAILED:${result.status}\n${result.stdout}\n${result.stderr}`);
  }
  const tapResults = tapTests(result.stdout);
  if (suite.result_format === "TEXT_WITH_NEGATIVE_CONTROL_COUNT") {
    const match = /Negative controls:\s*(\d+)\/(\d+)\s+PASS/.exec(result.stdout);
    const passed = Number(match?.[1]);
    const total = Number(match?.[2]);
    if (!match || passed !== total) {
      throw new Error(`${suite.suite_id}:NEGATIVE_CONTROL_RESULT_MISSING_OR_FAILED`);
    }
    if (!Number.isInteger(suite.minimum_negative_controls) || suite.minimum_negative_controls < 1 ||
        total < suite.minimum_negative_controls) {
      throw new Error(`${suite.suite_id}:NEGATIVE_CONTROL_MINIMUM_NOT_MET`);
    }
    return {
      suite_id: suite.suite_id,
      command: suite.command,
      status: "PASS",
      execution_mode: "LOCAL_DETERMINISTIC_CONTRACT_PREFLIGHT",
      negative_controls_passed: passed,
      negative_controls_total: total,
      minimum_negative_controls: suite.minimum_negative_controls,
      test_count: null,
      test_names: []
    };
  }
  const summary = parseFinalJson(result.stdout, suite.suite_id);
  if (summary.status !== "PASS" || summary.mode !== "SHADOW") {
    throw new Error(`${suite.suite_id}:SUMMARY_NOT_PASSING_SHADOW`);
  }
  if (tapResults.some(test => test.status !== "ok" || test.directive === "SKIP" || test.directive === "TODO")) {
    throw new Error(`${suite.suite_id}:TAP_FAILURE_SKIP_OR_TODO_FORBIDDEN`);
  }
  const testNames = tapResults.map(test => test.name);
  if (Number(summary.tests) !== testNames.length) {
    throw new Error(`${suite.suite_id}:TAP_AND_SUMMARY_TEST_COUNT_MISMATCH`);
  }
  if (!Number.isInteger(suite.minimum_test_count) || suite.minimum_test_count < 1 ||
      testNames.length < suite.minimum_test_count) {
    throw new Error(`${suite.suite_id}:MINIMUM_TEST_COUNT_NOT_MET`);
  }
  return {
    suite_id: suite.suite_id,
    command: suite.command,
    status: "PASS",
      execution_mode: "LOCAL_SHADOW",
      test_count: Number(summary.tests),
      minimum_test_count: suite.minimum_test_count,
    test_names: testNames,
    summary: stable(summary)
  };
}

function executeCandidateHandoffBlockedSelftest(fixture, validatorRelativePath) {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "kidults-candidate-handoff-"));
  try {
    const snapshotPath = path.join(temporaryDirectory, "snapshot-candidate.json");
    const evidencePath = path.join(temporaryDirectory, "evidence-package.json");
    const outputA = path.join(temporaryDirectory, "result-a.json");
    const outputB = path.join(temporaryDirectory, "result-b.json");
    fs.writeFileSync(snapshotPath, `${JSON.stringify(fixture.snapshot, null, 2)}\n`, "utf8");
    fs.writeFileSync(evidencePath, `${JSON.stringify(fixture.evidence, null, 2)}\n`, "utf8");
    for (const outputPath of [outputA, outputB]) {
      const result = spawnSync(process.execPath, [validatorRelativePath, snapshotPath, evidencePath, outputPath], {
        cwd: repositoryRoot,
        env: { ...process.env, TZ: "UTC", LANG: "C.UTF-8", LC_ALL: "C.UTF-8" },
        encoding: "utf8",
        maxBuffer: 8 * 1024 * 1024
      });
      if (result.error) throw result.error;
      if (result.status !== 0) {
        throw new Error(`CANDIDATE_HANDOFF_BLOCKED_SELFTEST_EXECUTION_FAILED:${result.status}\n${result.stderr}`);
      }
    }
    const bytesA = fs.readFileSync(outputA);
    const bytesB = fs.readFileSync(outputB);
    if (!bytesA.equals(bytesB)) throw new Error("CANDIDATE_HANDOFF_BLOCKED_SELFTEST_NONDETERMINISTIC");
    const result = JSON.parse(bytesA.toString("utf8"));
    const gates = result.computed_entity_resolution_gates;
    if (result.handoff_state !== "BLOCKED" || result.blocker_count !== 30 ||
        JSON.stringify(result.blockers) !== JSON.stringify(requiredCandidateHandoffBlockedSelftestBlockers) ||
        result.handoff_semantics !== "TRACK_B_SUBMISSION_ELIGIBILITY_ONLY" ||
        result.track_b_assessment !== "NOT_PERFORMED_BY_THIS_PREFLIGHT" ||
        result.track_b_pass !== "NOT_ASSERTED_BY_THIS_PREFLIGHT" ||
        result.publication !== "HOLD" || result.production !== "HOLD" ||
        gates?.canonical_required_strata_count !== 7 ||
        gates?.canonical_approved_strata_set_complete !== false ||
        gates?.overall_accuracy !== null || gates?.blind_accuracy !== null ||
        gates?.overall_accuracy_wilson_lower_95 !== null || gates?.blind_accuracy_wilson_lower_95 !== null ||
        gates?.empirical_attestation_verified !== false || gates?.empirical_sample_floors_pass !== false ||
        gates?.current_market_evidence_present !== false ||
        gates?.caller_gate_booleans_authoritative !== false ||
        gates?.caller_point_estimates_authoritative !== false) {
      throw new Error("CANDIDATE_HANDOFF_BLOCKED_SELFTEST_TRUTH_BOUNDARY_CHANGED");
    }
    return {
      execution_mode: "LOCAL_DETERMINISTIC_BLOCKED_SELFTEST",
      executed: true,
      two_run_byte_identical: true,
      result_sha256: `sha256:${crypto.createHash("sha256").update(bytesA).digest("hex")}`,
      handoff_state: result.handoff_state,
      blocker_count: result.blocker_count,
      blockers: [...result.blockers],
      represented_approved_strata_complete: false,
      constructed_control: true,
      empirical_metrics_present: false,
      empirical_attestation_verified: false,
      current_market_evidence_present: false,
      ready_pair_count: 0,
      track_b_submission_count: 0,
      track_b_assessment_count: 0,
      track_b_pass_count: 0,
      publication_authorized_count: 0,
      production_authorized_count: 0,
      production: "HOLD"
    };
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

function countField(value, field, defaultValue = 0) {
  const containers = [
    value,
    value?.summary,
    value?.counts,
    value?.truth_boundary,
    value?.review_batch,
    value?.eligibility_summary
  ];
  for (const container of containers) {
    if (container && Number.isInteger(container[field]) && container[field] >= 0) return container[field];
  }
  return defaultValue;
}

function optionalCurrentState(contract, key) {
  const relativePath = contract.optional_current_state_inputs[key];
  const absolutePath = path.join(repositoryRoot, relativePath);
  if (!fs.existsSync(absolutePath)) return { present: false, path: relativePath, value: null, reference: null };
  const value = readJson(relativePath);
  return { present: true, path: relativePath, value, reference: inputReference(relativePath) };
}

function hasTest(suite, fragment) {
  return suite.test_names.some(name => name.toLowerCase().includes(fragment.toLowerCase()));
}

function verified(condition) {
  return condition ? "VERIFIED_LOCAL_SHADOW" : "NOT_VERIFIED";
}

function evidenceFingerprint(evidence) {
  const { evidence_fingerprint: ignored, ...unsigned } = evidence;
  return fingerprint(unsigned);
}

export async function buildAsiShadowOperatingEvidence() {
  if (process.version !== expectedToolchain.node_version || process.platform !== expectedToolchain.platform ||
      process.arch !== expectedToolchain.architecture) {
    throw new Error(`SHADOW_EVIDENCE_TOOLCHAIN_MISMATCH:${process.version}:${process.platform}:${process.arch}`);
  }
  const contract = JSON.parse(fs.readFileSync(contractPath, "utf8"));
  if (JSON.stringify(stable(contract.canonical_code_inputs)) !==
      JSON.stringify(stable(requiredCanonicalCodeInputs))) {
    throw new Error("CANONICAL_CODE_PROVENANCE_INPUT_MANIFEST_MISMATCH");
  }
  const mesh = readJson(contract.canonical_inputs.engine_mesh);
  const queueContract = readJson(contract.canonical_inputs.queue_and_partition);
  const mainlineIdentityContextPool = readJson(contract.canonical_inputs.rights_admitted_identity_context_pilot_pool);
  const mainlineHistoricalTransactionPool = readJson(contract.canonical_inputs.rights_admitted_historical_transaction_pool);
  const globalRightsR2 = readJson(contract.canonical_inputs.global_rights_source_pool_expansion_r2);
  const designerMakerAdmissionR3 = readJson(
    contract.canonical_inputs.designer_maker_repository_declared_identity_calibration_admission_r3
  );
  const candidateHandoffContractR2 = readJson(contract.canonical_inputs.candidate_handoff_preflight_contract_r2);
  const candidateHandoffBlockedSelftestR2 = readJson(contract.canonical_inputs.candidate_handoff_blocked_selftest_r2);
  const runtimeCoreR1 = readJson(contract.canonical_inputs.asi_runtime_core_validation_r1);
  const entityResolutionContract = readJson(contract.canonical_inputs.entity_resolution_benchmark_v2_contract);
  const entityResolutionSelftest = readJson(contract.canonical_inputs.entity_resolution_benchmark_v2_selftest);
  const entityResolutionScopeMatrix = readJson(contract.canonical_inputs.entity_resolution_scope_matrix);
  const entityResolutionApprovedCalibrationStrata = readJson(
    contract.canonical_inputs.entity_resolution_approved_calibration_strata
  );
  const entityResolutionApprovedCalibrationStrataGrammar = calibrationStrataGrammar(
    entityResolutionApprovedCalibrationStrata
  );
  const entityResolutionRequiredScopeArchetypes = [...new Set(
    (entityResolutionScopeMatrix.scopes ?? []).map(scope => scope.archetype)
  )].sort();
  const entityResolutionScopeArchetypeMapping = Object.fromEntries(
    [...(entityResolutionScopeMatrix.scopes ?? [])]
      .sort((left, right) => left.scope_id.localeCompare(right.scope_id))
      .map(scope => [scope.scope_id, scope.archetype])
  );
  const entityResolutionEmpiricalSamplePolicy =
    entityResolutionContract.empirical_attestation_policy?.empirical_sample_policy;
  if (globalRightsR2.status !== "REPOSITORY_METHODOLOGY_DECLARATION_NOT_STRICT_R1_REVALIDATED" ||
      globalRightsR2.production !== "HOLD" || globalRightsR2.sources?.length !== 4 ||
      globalRightsR2.pool_effect?.new_admitted_identity_context_sources !== 2 ||
      globalRightsR2.pool_effect?.new_current_market_candidates_conditional !== 2 ||
      globalRightsR2.pool_effect?.strict_r1_revalidated_admitted_sources !== 0 ||
      globalRightsR2.pool_effect?.runtime_admitted_sources !== 0 ||
      globalRightsR2.pool_effect?.current_market_evidence_sources !== 0 ||
      globalRightsR2.evidence_assurance?.strict_r1_evidence_bound_revalidation_complete !== false ||
      globalRightsR2.evidence_assurance?.independent_legal_review_complete !== false ||
      globalRightsR2.evidence_assurance?.runtime_admission_events_emitted !== 0 ||
      globalRightsR2.evidence_assurance?.current_market_claim_authorized !== false) {
    throw new Error("GLOBAL_RIGHTS_R2_DECLARATION_BOUNDARY_CHANGED_REVIEW_REQUIRED");
  }
  const designerAdmissionAccounting = designerMakerAdmissionR3.admission_accounting;
  const designerAdmissionAssurance = designerMakerAdmissionR3.evidence_assurance;
  const designerAdmissionAuthorization = designerMakerAdmissionR3.authorization_boundaries;
  if (designerMakerAdmissionR3.id !== "designer-maker-moma-cooper-admission-r3" ||
      designerMakerAdmissionR3.version !== "3.0.0" ||
      designerMakerAdmissionR3.admission_scope !== "DESIGNER_MAKER_EDITION_IDENTITY_CALIBRATION_ONLY" ||
      designerMakerAdmissionR3.admission_class !== "REPOSITORY_DECLARED_IDENTITY_CALIBRATION_METADATA_ONLY" ||
      designerMakerAdmissionR3.admitted_state_definition !==
        "ADMITTED_MEANS_REPOSITORY_DECLARED_FOR_BOUNDED_INTERNAL_IDENTITY_CALIBRATION_METADATA_ONLY" ||
      designerMakerAdmissionR3.production !== "HOLD" || designerMakerAdmissionR3.sources?.length !== 2 ||
      JSON.stringify(designerMakerAdmissionR3.sources.map(source => source.source_id).sort()) !==
        JSON.stringify(["cooper-hewitt-collection-json", "moma-collection-research-dataset"]) ||
      designerAdmissionAccounting?.repository_declared_identity_calibration_metadata_source_count !== 2 ||
      designerAdmissionAccounting?.strict_r1_evidence_bound_admitted_source_count !== 0 ||
      designerAdmissionAccounting?.full_source_pool_admitted_source_count !== 0 ||
      designerAdmissionAccounting?.current_market_ready_source_count !== 0 ||
      designerAdmissionAccounting?.runtime_admitted_source_count !== 0 ||
      designerAdmissionAccounting?.image_admitted_source_count !== 0 ||
      designerAdmissionAssurance?.repository_declaration_only !== true ||
      designerAdmissionAssurance?.strict_r1_evidence_bound_revalidation_complete !== false ||
      designerAdmissionAssurance?.independent_legal_review_complete !== false ||
      designerAdmissionAssurance?.source_content_bytes_archived !== false ||
      designerAdmissionAssurance?.source_content_archive_state !== "NOT_ARCHIVED" ||
      designerAdmissionAssurance?.live_workflow_probe_is_archival_or_independent_review_evidence !== false ||
      designerAdmissionAuthorization?.current_market_claim_authorized !== false ||
      designerAdmissionAuthorization?.full_source_pool_admission_authorized !== false ||
      designerAdmissionAuthorization?.public_release_authorized !== false ||
      designerAdmissionAuthorization?.commercial_use_authorized !== false ||
      designerAdmissionAuthorization?.public_commercial_admission_authorized !== false ||
      designerAdmissionAuthorization?.runtime_admission_authorized !== false ||
      designerAdmissionAuthorization?.runtime_admission_events_emitted !== 0 ||
      designerAdmissionAuthorization?.image_admission_authorized !== false ||
      designerAdmissionAuthorization?.market_observation_count !== 0 ||
      designerAdmissionAuthorization?.production_promotion_authorized !== false ||
      designerMakerAdmissionR3.pool_effect?.current_market_claim_gate_satisfied !== false ||
      designerMakerAdmissionR3.pool_effect?.full_source_pool_effect !== "NONE" ||
      designerMakerAdmissionR3.pool_effect?.runtime_admission_effect !== "NONE" ||
      designerMakerAdmissionR3.purpose_rights_interpretation !==
        "SOURCE_LICENSE_FIELD_USE_CEILING_ONLY_NOT_PLATFORM_ADMISSION_OR_PUBLICATION_AUTHORIZATION" ||
      designerMakerAdmissionR3.sources.some(source =>
        source.admission_state !== "ADMITTED" ||
        source.admission_state_scope !==
          "REPOSITORY_DECLARED_BOUNDED_INTERNAL_IDENTITY_CALIBRATION_METADATA_ONLY" ||
        source.strict_r1_evidence_bound_admission !== false || source.source_content_bytes_archived !== false)) {
    throw new Error("DESIGNER_MAKER_R3_REPOSITORY_DECLARATION_BOUNDARY_CHANGED_REVIEW_REQUIRED");
  }
  const candidateFixtureEr = candidateHandoffBlockedSelftestR2.evidence?.entity_resolution;
  if (candidateHandoffContractR2.id !== "candidate-evidence-handoff-preflight-contract-r2" ||
      candidateHandoffContractR2.version !== "2.1.0" ||
      candidateHandoffContractR2.current_state !== "BLOCKED" ||
      candidateHandoffContractR2.downstream_track !== "TRACK_B_INDEPENDENT_VALIDATION" ||
      candidateHandoffContractR2.canonical_governance?.caller_supplied_governance_allowed !== false ||
      candidateHandoffContractR2.handoff_ready_semantics !==
        "Track B submission eligibility for the exact immutable pair only. It never means Track B PASS, publication approval, public release or Production authorization." ||
      candidateHandoffContractR2.publication !== "HOLD" || candidateHandoffContractR2.production !== "HOLD" ||
      candidateFixtureEr?.required_strata !== 7 || candidateFixtureEr?.complete_strata !== 6 ||
      candidateFixtureEr?.dataset_class !== "REAL_SOURCE_DERIVED_CONSTRUCTED_CONTROL" ||
      candidateFixtureEr?.constructed_control !== true || candidateFixtureEr?.empirical_benchmark_eligible !== false ||
      candidateFixtureEr?.overall_accuracy !== null || candidateFixtureEr?.blind_accuracy !== null ||
      candidateFixtureEr?.overall_accuracy_wilson_lower_95 !== null ||
      candidateFixtureEr?.blind_accuracy_wilson_lower_95 !== null ||
      candidateFixtureEr?.empirical_attestation_approved !== false ||
      candidateFixtureEr?.current_market_evidence_present !== false ||
      candidateHandoffBlockedSelftestR2.snapshot?.publication_eligible !== false ||
      candidateHandoffBlockedSelftestR2.snapshot?.production_authorized !== false ||
      candidateHandoffBlockedSelftestR2.evidence?.publication_authorized !== false ||
      candidateHandoffBlockedSelftestR2.evidence?.production_authorized !== false) {
    throw new Error("CANDIDATE_HANDOFF_R2_BLOCKED_TRUTH_BOUNDARY_CHANGED_REVIEW_REQUIRED");
  }
  if (runtimeCoreR1.status !== "LOCAL_DEV_SHADOW_PRECHECK_PASS_REMOTE_NOT_VERIFIED" ||
      runtimeCoreR1.production !== "HOLD" ||
      runtimeCoreR1.execution_assurance?.database_backend !== "LOCAL_IN_MEMORY_SQLITE" ||
      runtimeCoreR1.execution_assurance?.queue_backend !== "LOCAL_DETERMINISTIC_IN_MEMORY_QUEUE" ||
      runtimeCoreR1.execution_assurance?.remote_cloudflare_queue_d1_executed !== false ||
      runtimeCoreR1.execution_assurance?.canonical_cloudflare_durability_verified !== false ||
      runtimeCoreR1.execution_assurance?.original_source_record_processed_by_runtime !== false ||
      runtimeCoreR1.execution_assurance?.forced_transport_failure_is_source_observed !== false ||
      runtimeCoreR1.execution_assurance?.unknown_rights_control_is_source_observed !== false ||
      runtimeCoreR1.truth_boundary?.full_platform_validation !== false ||
      runtimeCoreR1.truth_boundary?.market_intelligence_poc_complete !== false ||
      runtimeCoreR1.truth_boundary?.production_authorized !== false) {
    throw new Error("RUNTIME_CORE_R1_LOCAL_HARNESS_BOUNDARY_CHANGED_REVIEW_REQUIRED");
  }
  if (entityResolutionContract.production !== "HOLD" ||
      entityResolutionContract.constructed_controls_are_empirical_benchmark_eligible !== false ||
      entityResolutionContract.independent_label_review_required !== true ||
      entityResolutionContract.label_adjudication_required !== true ||
      entityResolutionContract.holdout_sealed_before_modeling_required !== true ||
      entityResolutionContract.empirical_attestation_policy?.required !== true ||
      entityResolutionContract.empirical_attestation_policy?.minimum_independent_reviewers !== 2 ||
      entityResolutionContract.empirical_attestation_policy?.source_payload_digest_binding_required !== true ||
      entityResolutionContract.empirical_attestation_policy?.license_evidence_binding_required !== true ||
      entityResolutionContract.empirical_attestation_policy?.per_case_source_evidence_required !== true ||
      entityResolutionContract.empirical_attestation_policy?.case_source_evidence_binding_required !== true ||
      entityResolutionContract.empirical_attestation_policy?.case_source_payload_digest_binding_required !== true ||
      entityResolutionContract.empirical_attestation_policy?.scope_matrix_digest_binding_required !== true ||
      entityResolutionContract.empirical_attestation_policy?.exact_required_scope_archetype_binding_required !== true ||
      entityResolutionContract.empirical_attestation_policy?.case_scope_archetype_binding_required !== true ||
      entityResolutionContract.empirical_attestation_policy?.approved_calibration_strata_digest_binding_required !== true ||
      entityResolutionContract.empirical_attestation_policy?.case_to_approved_stratum_binding_required !== true ||
      entityResolutionContract.empirical_attestation_policy
        ?.per_stratum_case_class_and_identity_boundary_minima_required !== true ||
      entityResolutionContract.empirical_attestation_policy?.holdout_seal_must_precede_model_freeze !== true ||
      entityResolutionContract.empirical_attestation_policy?.track_b_pass_required !== true ||
      !Array.isArray(entityResolutionContract.empirical_attestation_policy?.approved_manifest_fingerprints) ||
      entityResolutionContract.empirical_attestation_policy.approved_manifest_fingerprints.length !== 0 ||
      entityResolutionSelftest.dataset_class !== "SYNTHETIC_SELFTEST" ||
      entityResolutionSelftest.synthetic !== true || entityResolutionSelftest.production !== "HOLD" ||
      !Array.isArray(entityResolutionSelftest.cases) || entityResolutionSelftest.cases.length !== 6) {
    throw new Error("ENTITY_RESOLUTION_CONTROL_OR_PROMOTION_BOUNDARY_CHANGED_REVIEW_REQUIRED");
  }
  if (entityResolutionContract.scope_stratification !== "REQUIRED_ACROSS_APPROVED_POC_SCOPE_ARCHETYPES" ||
      entityResolutionContract.empirical_attestation_policy.canonical_scope_matrix_path !==
        contract.canonical_inputs.entity_resolution_scope_matrix ||
      entityResolutionScopeMatrix.version !== "1.1" ||
      entityResolutionScopeMatrix.status !== "CANDIDATE_FOR_CANONICAL" ||
      !Array.isArray(entityResolutionScopeMatrix.scopes) || entityResolutionScopeMatrix.scopes.length !== 32 ||
      fingerprint(entityResolutionScopeMatrix) !==
        entityResolutionContract.empirical_attestation_policy.canonical_scope_matrix_sha256 ||
      fingerprint(entityResolutionScopeArchetypeMapping) !==
        entityResolutionContract.empirical_attestation_policy.canonical_scope_archetype_mapping_sha256 ||
      JSON.stringify(entityResolutionRequiredScopeArchetypes) !== JSON.stringify(
        entityResolutionContract.empirical_attestation_policy.required_poc_scope_archetypes) ||
      entityResolutionRequiredScopeArchetypes.length !== 7 ||
      fingerprint(entityResolutionEmpiricalSamplePolicy) !==
        entityResolutionContract.empirical_attestation_policy.empirical_sample_policy_sha256 ||
      entityResolutionEmpiricalSamplePolicy?.minimum_total_cases !== 800 ||
      entityResolutionEmpiricalSamplePolicy?.minimum_blind_holdout_cases !== 400 ||
      entityResolutionEmpiricalSamplePolicy?.minimum_cases_per_required_scope_archetype !== 50 ||
      entityResolutionEmpiricalSamplePolicy?.minimum_blind_cases_per_required_scope_archetype !== 25 ||
      entityResolutionEmpiricalSamplePolicy?.minimum_cases_per_identity_boundary !== 100 ||
      entityResolutionEmpiricalSamplePolicy?.minimum_cases_per_required_case_class !== 50 ||
      entityResolutionEmpiricalSamplePolicy?.wilson_confidence_level !== 0.95 ||
      entityResolutionEmpiricalSamplePolicy?.minimum_overall_accuracy_wilson_lower_bound !== 0.99 ||
      entityResolutionEmpiricalSamplePolicy?.minimum_blind_accuracy_wilson_lower_bound !== 0.99) {
    throw new Error("ENTITY_RESOLUTION_SCOPE_MATRIX_OR_ARCHETYPE_POLICY_CHANGED_REVIEW_REQUIRED");
  }
  const approvedCalibrationStrataIds = entityResolutionApprovedCalibrationStrataGrammar
    .map(stratum => stratum.stratum_id).sort();
  const approvedCalibrationArchetypes = entityResolutionApprovedCalibrationStrataGrammar
    .map(stratum => stratum.archetype).sort();
  if (entityResolutionContract.empirical_attestation_policy.approved_calibration_strata_path !==
        contract.canonical_inputs.entity_resolution_approved_calibration_strata ||
      fingerprint(entityResolutionApprovedCalibrationStrata) !==
        entityResolutionContract.empirical_attestation_policy.approved_calibration_strata_sha256 ||
      entityResolutionApprovedCalibrationStrata.id !==
        entityResolutionContract.empirical_attestation_policy.approved_calibration_strata_id ||
      entityResolutionApprovedCalibrationStrata.status !==
        entityResolutionContract.empirical_attestation_policy.approved_calibration_strata_status ||
      entityResolutionApprovedCalibrationStrata.id !==
        "kidults-er-approved-bounded-poc-calibration-strata-v1" ||
      entityResolutionApprovedCalibrationStrata.status !== "APPROVED_BOUNDED_POC_CALIBRATION" ||
      entityResolutionApprovedCalibrationStrata.source_scope_matrix !==
        contract.canonical_inputs.entity_resolution_scope_matrix ||
      entityResolutionApprovedCalibrationStrata.source_scope_matrix_status_required !== "CANDIDATE_FOR_CANONICAL" ||
      JSON.stringify(stable(entityResolutionApprovedCalibrationStrataGrammar)) !==
        JSON.stringify(stable(requiredApprovedCalibrationStrata)) ||
      JSON.stringify(approvedCalibrationArchetypes) !== JSON.stringify(entityResolutionRequiredScopeArchetypes) ||
      JSON.stringify([...(entityResolutionApprovedCalibrationStrata.required_strata_ids ?? [])].sort()) !==
        JSON.stringify(approvedCalibrationStrataIds) ||
      JSON.stringify([...(entityResolutionApprovedCalibrationStrata.approved_strata_ids ?? [])].sort()) !==
        JSON.stringify(approvedCalibrationStrataIds) ||
      entityResolutionApprovedCalibrationStrata.common_requirements?.dataset_class !== "REAL_WORLD_LABELED" ||
      entityResolutionApprovedCalibrationStrata.common_requirements?.rights_coverage !== 1 ||
      entityResolutionApprovedCalibrationStrata.common_requirements?.provenance_coverage !== 1 ||
      entityResolutionApprovedCalibrationStrata.common_requirements?.blind_holdout_required !== true ||
      entityResolutionApprovedCalibrationStrata.common_requirements?.diagnostic_scope_leakage_allowed !== false ||
      entityResolutionApprovedCalibrationStrata.common_requirements?.synthetic_promotion_allowed !== false ||
      entityResolutionApprovedCalibrationStrata.common_requirements?.track_b_required_separately !== true ||
      entityResolutionApprovedCalibrationStrata.common_requirements?.production !== "HOLD") {
    throw new Error("ENTITY_RESOLUTION_APPROVED_CALIBRATION_STRATA_CHANGED_REVIEW_REQUIRED");
  }
  if (mainlineIdentityContextPool.status !== "PILOT_PARTIAL" || mainlineIdentityContextPool.production !== "HOLD" ||
      mainlineIdentityContextPool.pool_readiness?.rights_admitted_real_sources !== 2 ||
      mainlineIdentityContextPool.pool_readiness?.identity_context_pool_ready !== true ||
      mainlineIdentityContextPool.pool_readiness?.transaction_market_event_pool_ready !== false ||
      mainlineIdentityContextPool.pool_readiness?.eligible_for_asi_market_event_exit !== false) {
    throw new Error("MAINLINE_IDENTITY_CONTEXT_PILOT_POOL_BOUNDARY_CHANGED_REVIEW_REQUIRED");
  }
  if (mainlineHistoricalTransactionPool.status !== "PILOT_READY" || mainlineHistoricalTransactionPool.production !== "HOLD" ||
      mainlineHistoricalTransactionPool.pool_readiness?.rights_admitted_transaction_sources !== 1 ||
      mainlineHistoricalTransactionPool.pool_readiness?.historical_sale_activity_ready !== true ||
      mainlineHistoricalTransactionPool.pool_readiness?.current_market_event_ready !== false ||
      mainlineHistoricalTransactionPool.pool_readiness?.eligible_for_current_market_price_claim !== false) {
    throw new Error("MAINLINE_HISTORICAL_TRANSACTION_POOL_BOUNDARY_CHANGED_REVIEW_REQUIRED");
  }
  const mainlineIdentityContextDeclaredAdmittedSourceCount = mainlineIdentityContextPool.sources
    .filter(source => source.admission_state === "ADMITTED").length;
  const mainlineConditionalSourceCount = mainlineIdentityContextPool.sources
    .filter(source => source.admission_state === "CONDITIONAL").length;
  const mainlineHistoricalTransactionDeclaredAdmittedSourceCount = mainlineHistoricalTransactionPool.sources
    .filter(source => source.admission_state === "ADMITTED").length;
  const mainlineCurrentMarketEventReadySourceCount = 0;
  if (mainlineIdentityContextDeclaredAdmittedSourceCount !== 2 || mainlineConditionalSourceCount !== 1 ||
      mainlineHistoricalTransactionDeclaredAdmittedSourceCount !== 1 ||
      mainlineIdentityContextPool.sources.filter(source => source.admission_state === "ADMITTED").some(source =>
        !["MARKET_PRICE", "LIQUIDITY", "DEMAND"].every(claim => source.prohibited_claim_classes.includes(claim))) ||
      mainlineHistoricalTransactionPool.sources.some(source =>
        !["CURRENT_MARKET_PRICE", "CURRENT_LIQUIDITY", "CURRENT_DEMAND"].every(claim =>
          source.prohibited_claim_classes.includes(claim)))) {
    throw new Error("MAINLINE_PILOT_SOURCE_COUNT_OR_CLAIM_CEILING_CHANGED_REVIEW_REQUIRED");
  }
  const bootstrapModule = await import(pathToFileURL(path.join(scriptDirectory, "compile-global-pool-r1-bootstrap-capture-v1.mjs")).href);
  const readinessModule = await import(pathToFileURL(path.join(scriptDirectory, "build-scope-source-pool-readiness-v1.mjs")).href);
  const rightsCompilerModule = await import(pathToFileURL(path.join(scriptDirectory, "compile-asi-source-rights-access-review-r1.mjs")).href);
  const bootstrap = bootstrapModule.compileGlobalPoolR1BootstrapCapture(bootstrapModule.loadGlobalPoolR1BootstrapInputs());
  const readinessOutputs = readinessModule.buildScopeSourcePoolReadiness(readinessModule.loadScopeSourcePoolInputs());
  const readiness = readinessOutputs["run-manifest.json"];

  const requiredSuites = contract.required_test_suites.map(executeSuite);
  const candidateHandoffBlockedSelftest = executeCandidateHandoffBlockedSelftest(
    candidateHandoffBlockedSelftestR2,
    requiredCanonicalCodeInputs.candidate_handoff_preflight_validator_r2
  );
  const optionalSuites = contract.optional_test_suites.map(suite => {
    if (!fs.existsSync(path.join(repositoryRoot, suite.path))) {
      return {
        suite_id: suite.suite_id,
        command: suite.command,
        status: suite.absent_state,
        execution_mode: "NOT_EXECUTED",
        test_count: 0,
        test_names: []
      };
    }
    return executeSuite(suite);
  });
  const suites = [...requiredSuites, ...optionalSuites];
  const suiteById = Object.fromEntries(suites.map(suite => [suite.suite_id, suite]));
  const meshPreflight = suiteById.ASI_MESH_CONTRACT_PREFLIGHT;
  const shadow = suiteById.ASI_D1_FAIL_CLOSED_SHADOW;
  const e2e = suiteById.ASI_QUEUE_D1_PROCESSOR_E2E;
  const recovery = suiteById.ASI_RUNTIME_RECOVERY_FAIRNESS_SHADOW;
  if (recovery.status === "PASS") {
    const recoveryTruth = recovery.summary;
    if (recovery.test_count !== 24 || Number(recoveryTruth.tests) !== 24) {
      throw new Error("RECOVERY_FAIRNESS_SUITE_EXPECTED_24_TESTS_REVIEW_REQUIRED");
    }
    if (recoveryTruth.deployed !== false || recoveryTruth.remote_resources_verified !== false ||
        recoveryTruth.loss_guarantee !== false || recoveryTruth.network_requests !== 0 ||
        recoveryTruth.public_projection_authorized !== false || recoveryTruth.production !== "HOLD") {
      throw new Error("RECOVERY_FAIRNESS_SUITE_REMOTE_OR_PRODUCTION_TRUTH_OVERCLAIM");
    }
  }

  const rightsReview = optionalCurrentState(contract, "rights_access_review");
  const purposeEligibility = optionalCurrentState(contract, "purpose_eligibility");
  let purposeEligibilityRebuildMatches = false;
  if (purposeEligibility.present) {
    const rightsInputs = rightsCompilerModule.loadSourceRightsReviewInputs();
    const rebuiltPurposeEligibility = rightsCompilerModule.compileSourceRightsReview(rightsInputs);
    rightsCompilerModule.assertCompiledSourceRightsReview(purposeEligibility.value, rightsInputs);
    if (JSON.stringify(stable(rebuiltPurposeEligibility)) !== JSON.stringify(stable(purposeEligibility.value))) {
      throw new Error("PURPOSE_ELIGIBILITY_ARTIFACT_IS_STALE_OR_NONDETERMINISTIC");
    }
    purposeEligibilityRebuildMatches = true;
  }
  const reviewedSourceCount = rightsReview.present ? countField(rightsReview.value, "reviewed_source_count") : 0;
  const boundedShadowRightsPolicyPreflightPassSourceCount = purposeEligibility.present
    ? countField(purposeEligibility.value, "bounded_shadow_rights_policy_preflight_pass_source_count")
    : 0;
  const purposePolicyPreflightPassBindingCount = purposeEligibility.present
    ? countField(purposeEligibility.value, "purpose_policy_preflight_pass_binding_count")
    : 0;
  const purposePolicyPreflightPassSourceCount = purposeEligibility.present
    ? countField(purposeEligibility.value, "purpose_policy_preflight_pass_source_count")
    : 0;
  const heldSourceCount = purposeEligibility.present
    ? countField(purposeEligibility.value, "held_source_count")
    : reviewedSourceCount;
  const rejectedSourceCount = purposeEligibility.present
    ? countField(purposeEligibility.value, "rejected_source_count")
    : 0;
  const marketEvidenceEligibleCount = purposeEligibility.present
    ? countField(purposeEligibility.value, "market_event_evidence_policy_preflight_pass_count")
    : 0;
  const publicOrCommercialEligibleCount = purposeEligibility.present
    ? countField(purposeEligibility.value, "public_or_commercial_projection_policy_preflight_pass_count")
    : 0;
  const fullScopePoolReadyCount = purposeEligibility.present
    ? countField(purposeEligibility.value, "full_scope_pool_ready_count")
    : 0;
  const rightsArtifactIndexCount = purposeEligibility.present
    ? countField(purposeEligibility.value, "indexes_computed")
    : 0;
  const deployedAlignmentPercent = purposeEligibility.present
    ? countField(purposeEligibility.value, "deployed_alignment_percent")
    : 0;
  const purposePackages = purposeEligibility.value?.review_observations?.flatMap(observation => observation.purpose_packages ?? []) ?? [];
  const passPackages = purposePackages.filter(item => item.decision === "PASS");
  const purposePolicyPreflightBindings = purposeEligibility.value?.purpose_eligibility_bindings ?? [];
  const passPackageTemporalProvenanceVerified = purposeEligibility.present && passPackages.length > 0 &&
    passPackages.every(item => {
      const evidenceObserved = Date.parse(item.evidence_observed_at_max);
      const claimRecorded = Date.parse(item.normalized_claim_record_recorded_at_max);
      const reviewDue = Date.parse(item.review_due_at);
      return Number.isFinite(evidenceObserved) && Number.isFinite(claimRecorded) && Number.isFinite(reviewDue) &&
        evidenceObserved <= claimRecorded && claimRecorded < reviewDue;
    });
  const passPackageEvidenceAssertionBindingsVerified = purposeEligibility.present && passPackages.length > 0 &&
    passPackages.every(item => item.evidence_assertion_binding_fingerprints?.length > 0 &&
      item.evidence_assertion_binding_fingerprints.length === item.evidence_claim_record_refs?.length &&
      item.evidence_assertion_binding_fingerprints.every(value => /^sha256:[a-f0-9]{64}$/.test(value)));
  const passClaimRecordIntegrityVerified = purposeEligibility.present && passPackages.length > 0 &&
    Object.values(purposeEligibility.value.input_fingerprints ?? {}).every(value => /^sha256:[a-f0-9]{64}$/.test(value)) &&
    passPackages.every(item => item.evidence_claim_record_refs?.length > 0 &&
      item.evidence_claim_record_refs.length === item.evidence_claim_record_integrity_digests?.length &&
      item.evidence_claim_record_integrity_digests.every(value => /^sha256:[a-f0-9]{64}$/.test(value)) &&
      item.source_content_capture_state === "PENDING_NOT_ARCHIVED") &&
    purposeEligibility.value?.decision_semantics?.normalized_claim_record_digest_covers_source_content === false &&
    passPackageTemporalProvenanceVerified && passPackageEvidenceAssertionBindingsVerified;
  const runtimeAdmissionEventsEmitted = countField(purposeEligibility.value, "runtime_admission_events_emitted");
  const runtimeAdmissionMaterializedBindingCount = purposePolicyPreflightBindings
    .filter(item => item.runtime_admission_materialized === true).length;
  const frontierScopeRolePolicyBindingProvenanceVerified = purposeEligibility.present &&
    purposePolicyPreflightBindings.length > 0 && purposePolicyPreflightBindings.every(item =>
      item.source_kind === "FRONTIER_DISCOVERY_CHANNEL"
        ? typeof item.frontier_scope_role_policy_binding_ref === "string" &&
          item.frontier_scope_role_policy_binding_ref.length > 0
        : item.frontier_scope_role_policy_binding_ref === null);
  const canonicalRegionLanguageCoverageCredit = countField(
    purposeEligibility.value, "canonical_region_language_coverage_credit");
  if (purposeEligibility.present && passPackages.length > 0 && !passClaimRecordIntegrityVerified) {
    throw new Error("PASS_PACKAGE_NORMALIZED_CLAIM_RECORD_PROVENANCE_NOT_VERIFIED");
  }
  if (runtimeAdmissionEventsEmitted !== 0 || runtimeAdmissionMaterializedBindingCount !== 0) {
    throw new Error("POLICY_PREFLIGHT_BINDING_LAUNDERED_INTO_RUNTIME_ADMISSION");
  }
  if (canonicalRegionLanguageCoverageCredit !== 0) {
    throw new Error("REVIEW_SLICE_CANONICAL_REGION_LANGUAGE_COVERAGE_OVERCLAIM");
  }
  if (purposeEligibility.present && !frontierScopeRolePolicyBindingProvenanceVerified) {
    throw new Error("FRONTIER_SCOPE_ROLE_POLICY_BINDING_PROVENANCE_NOT_VERIFIED");
  }
  const reviewDueDates = (rightsReview.value?.evidence ?? []).map(item => item.review_due_at).filter(Boolean).sort();
  const staleEvidenceCount = (rightsReview.value?.evidence ?? []).filter(item =>
    item.review_due_at && Date.parse(item.review_due_at) <= Date.parse(contract.evidence_clock)).length;

  const processorCount = Number(e2e.summary.processors_registered);
  if (processorCount !== Number(mesh.asi_funnel.engine_fleet_contract_count)) {
    throw new Error("ACTUAL_PROCESSOR_COUNT_DOES_NOT_MATCH_CANONICAL_MESH");
  }
  if (Number(e2e.summary.processors_exercised) !== processorCount) {
    throw new Error("NOT_ALL_REGISTERED_PROCESSORS_WERE_EXERCISED");
  }
  if (Number(e2e.summary.global_pool_bootstrap_seed_events) !== bootstrap.queue_seed_event_count) {
    throw new Error("E2E_BOOTSTRAP_COUNT_DOES_NOT_MATCH_CANONICAL_BOOTSTRAP");
  }
  if (mesh.truth_boundary.durable_queue_runtime_deployed !== false || queueContract.runtime_implementation_state.deployed !== false) {
    throw new Error("REMOTE_DEPLOYMENT_TRUTH_BOUNDARY_CHANGED_REVIEW_REQUIRED");
  }
  if (readiness.public_projection !== false || readiness.production !== "HOLD") {
    throw new Error("SOURCE_POOL_READINESS_PUBLIC_OR_PRODUCTION_HOLD_CHANGED_REVIEW_REQUIRED");
  }
  if (publicOrCommercialEligibleCount !== 0) {
    throw new Error("CURRENT_PURPOSE_ELIGIBILITY_ARTIFACT_ATTEMPTS_PUBLIC_OR_COMMERCIAL_ELIGIBILITY");
  }
  if (purposeEligibility.present && (purposeEligibility.value.public_projection !== false ||
      purposeEligibility.value.commercial_projection !== false || purposeEligibility.value.production !== "HOLD")) {
    throw new Error("CURRENT_PURPOSE_ELIGIBILITY_ARTIFACT_BREAKS_PUBLIC_COMMERCIAL_OR_PRODUCTION_HOLD");
  }
  if (fullScopePoolReadyCount !== Number(readiness.source_pools_ready) ||
      rightsArtifactIndexCount !== Number(readiness.indexes_computed)) {
    throw new Error("RIGHTS_ARTIFACT_AND_CANONICAL_SCOPE_READINESS_COUNTS_DIVERGE");
  }
  if (deployedAlignmentPercent !== 0) {
    throw new Error("RIGHTS_ARTIFACT_DEPLOYED_ALIGNMENT_OVERCLAIM");
  }

  const currentInputReferences = Object.fromEntries(Object.entries(contract.canonical_inputs).map(([key, relativePath]) =>
    [key, inputReference(relativePath)]));
  if (rightsReview.present) currentInputReferences.rights_access_review = rightsReview.reference;
  if (purposeEligibility.present) currentInputReferences.purpose_eligibility = purposeEligibility.reference;

  const replayControllerVerified = hasTest(recovery, "explicit bounded replay claims a durable lease") &&
    hasTest(recovery, "unexpired replay lease is not stolen") &&
    hasTest(recovery, "expired replay lease is reclaimed once and fails closed");
  const boundedPartitionRotationVerified = hasTest(recovery, "fair relay selects one item from each of three source partitions") &&
    hasTest(recovery, "persistent fairness state advances all three partitions without starvation");
  const oldestAgeLrsVerified = hasTest(recovery, "oldest waiting market cell is not starved") &&
    hasTest(recovery, "least-recently-served clock rotates to the oldest unserved market cell");
  const circuitBreakerVerified = hasTest(recovery, "future circuit probe is not treated as active") &&
    hasTest(recovery, "due half-open probe is single-use") &&
    hasTest(recovery, "five consecutive transport failures open the per-fleet circuit") &&
    hasTest(recovery, "open circuit blocks a sixth Queue send");
  const budgetVerified = hasTest(recovery, "per-fleet hourly request and zero-cost budget hold before Queue send");
  const terminalDlqPersistBeforeAckVerified = hasTest(recovery, "terminal DLQ persistence failure requests retry and never ACKs");
  const terminalDlqReceiptIdempotencyVerified = hasTest(recovery, "terminal DLQ ACK follows D1 commit and duplicate delivery is receipt-idempotent");
  const taskLeaseOwnerEpochWriteFenceVerified = hasTest(
    recovery,
    "stale task lease owner cannot mutate processor state after the final fence read before the output batch"
  );
  const requiredRuntimeControlProofs = {
    replay_controller_and_lease: replayControllerVerified,
    bounded_partition_rotation_without_starvation: boundedPartitionRotationVerified,
    oldest_age_least_recently_served_starvation_resistance: oldestAgeLrsVerified,
    circuit_breaker_state_transitions: circuitBreakerVerified,
    rate_and_cost_budget_exhaustion: budgetVerified,
    terminal_dlq_persist_before_ack_fail_closed: terminalDlqPersistBeforeAckVerified,
    terminal_dlq_receipt_idempotency: terminalDlqReceiptIdempotencyVerified,
    task_lease_owner_epoch_write_fence: taskLeaseOwnerEpochWriteFenceVerified
  };
  const missingRuntimeControlProofs = Object.entries(requiredRuntimeControlProofs)
    .filter(([, proven]) => !proven)
    .map(([control]) => control);
  if (missingRuntimeControlProofs.length > 0) {
    throw new Error(`REQUIRED_RUNTIME_CONTROL_PROOF_MISSING:${missingRuntimeControlProofs.join(",")}`);
  }
  const evidence = {
    id: "kidults-asi-shadow-operating-evidence-v1",
    record_type: "asi_shadow_operating_evidence",
    version: "1.0.0",
    status: "LOCAL_SHADOW_OPERATING_EVIDENCE_PASS_NOT_DEPLOYED",
    evidence_clock: contract.evidence_clock,
    contract: {
      id: contract.id,
      version: contract.version,
      fingerprint: fingerprint(contract)
    },
    principles: contract.principles,
    canonical_inputs: currentInputReferences,
    canonical_code_input_semantics: "HASHED_IMPLEMENTATION_PROVENANCE_NOT_EXECUTION_ATTESTATION",
    canonical_code_inputs: Object.fromEntries(Object.entries(contract.canonical_code_inputs).map(([key, relativePath]) =>
      [key, fileReference(relativePath)])),
    toolchain: {
      node_version: process.version,
      platform: process.platform,
      architecture: process.arch,
      deterministic_environment: {
        TZ: "UTC",
        LANG: "C.UTF-8",
        LC_ALL: "C.UTF-8"
      },
      dependency_lockfiles: {
        root_npm_shrinkwrap: fileReference("npm-shrinkwrap.json"),
        autonomous_intelligence_package_lock: fileReference("services/kidults-autonomous-intelligence/package-lock.json")
      }
    },
    transitive_provenance: {
      source_rights_policy_preflight: purposeEligibility.present ? {
        id: purposeEligibility.value.id,
        input_fingerprints: stable(purposeEligibility.value.input_fingerprints ?? {}),
        eligibility_fingerprint: purposeEligibility.value.eligibility_fingerprint
      } : {
        id: null,
        input_fingerprints: {},
        eligibility_fingerprint: null
      },
      global_pool_bootstrap_capture: {
        id: bootstrap.id,
        input_fingerprints: stable(bootstrap.input_fingerprints),
        bootstrap_fingerprint: bootstrap.bootstrap_fingerprint
      },
      scope_source_pool_readiness: {
        id: readiness.id,
        input_fingerprints: stable(readiness.inputs),
        output_fingerprints: stable(readiness.outputs),
        run_fingerprint: readiness.run_fingerprint
      },
      mainline_rights_admitted_pilot_declarations: {
        identity_context_pool_id: mainlineIdentityContextPool.id,
        identity_context_pool_fingerprint: fingerprint(mainlineIdentityContextPool),
        historical_transaction_pool_id: mainlineHistoricalTransactionPool.id,
        historical_transaction_pool_fingerprint: fingerprint(mainlineHistoricalTransactionPool),
        sealed_evidence_live_retrieval_artifact_refs: [],
        sealed_evidence_bridge_artifact_refs: [],
        sealed_evidence_external_workflow_attestation_refs: []
      },
      global_rights_r2_declaration: {
        id: globalRightsR2.id,
        fingerprint: fingerprint(globalRightsR2),
        count_scope: globalRightsR2.evidence_assurance.count_scope,
        declared_source_record_count: globalRightsR2.sources.length,
        declared_identity_context_source_count:
          globalRightsR2.pool_effect.new_admitted_identity_context_sources,
        conditional_market_candidate_count:
          globalRightsR2.pool_effect.new_current_market_candidates_conditional,
        strict_r1_revalidated_source_count:
          globalRightsR2.pool_effect.strict_r1_revalidated_admitted_sources,
        runtime_admitted_source_count: globalRightsR2.pool_effect.runtime_admitted_sources,
        current_market_evidence_source_count: globalRightsR2.pool_effect.current_market_evidence_sources,
        independent_legal_review_complete: false,
        counts_are_additive_to_prior_pilot_declarations: false,
        sealed_execution_attestation_refs: []
      },
      designer_maker_r3_repository_declaration: {
        id: designerMakerAdmissionR3.id,
        version: designerMakerAdmissionR3.version,
        fingerprint: fingerprint(designerMakerAdmissionR3),
        canonical_input_ref: inputReference(
          contract.canonical_inputs.designer_maker_repository_declared_identity_calibration_admission_r3
        ),
        workflow_ref: fileReference(
          requiredCanonicalCodeInputs.designer_maker_repository_declared_identity_calibration_admission_r3_workflow
        ),
        admission_scope: designerMakerAdmissionR3.admission_scope,
        admission_class: designerMakerAdmissionR3.admission_class,
        admitted_state_definition: designerMakerAdmissionR3.admitted_state_definition,
        source_ids: designerMakerAdmissionR3.sources.map(source => source.source_id).sort(),
        repository_declared_identity_calibration_metadata_source_count:
          designerAdmissionAccounting.repository_declared_identity_calibration_metadata_source_count,
        strict_r1_evidence_bound_admitted_source_count: 0,
        full_source_pool_admitted_source_count: 0,
        current_market_ready_source_count: 0,
        runtime_admitted_source_count: 0,
        image_admitted_source_count: 0,
        repository_declaration_only: true,
        strict_r1_evidence_bound_revalidation_complete: false,
        independent_legal_review_complete: false,
        source_content_bytes_archived: false,
        source_content_archive_state: "NOT_ARCHIVED",
        live_workflow_probe_is_archival_or_independent_review_evidence: false,
        current_market_claim_authorized: false,
        full_source_pool_admission_authorized: false,
        public_release_authorized: false,
        commercial_use_authorized: false,
        public_commercial_admission_authorized: false,
        runtime_admission_authorized: false,
        runtime_admission_events_emitted: 0,
        image_admission_authorized: false,
        market_observation_count: 0,
        production_promotion_authorized: false,
        production: "HOLD",
        purpose_rights_interpretation:
          "SOURCE_LICENSE_FIELD_USE_CEILING_ONLY_NOT_PLATFORM_ADMISSION_OR_PUBLICATION_AUTHORIZATION",
        sealed_execution_attestation_refs: []
      },
      candidate_handoff_r2_downstream_blocked_selftest: {
        contract_ref: inputReference(contract.canonical_inputs.candidate_handoff_preflight_contract_r2),
        blocked_selftest_fixture_ref: inputReference(contract.canonical_inputs.candidate_handoff_blocked_selftest_r2),
        validator_ref: fileReference(requiredCanonicalCodeInputs.candidate_handoff_preflight_validator_r2),
        workflow_ref: fileReference(requiredCanonicalCodeInputs.candidate_handoff_preflight_workflow_r2),
        materiality:
          "DOWNSTREAM_TRACK_B_SUBMISSION_TRUTH_BOUNDARY_NOT_UPSTREAM_SHADOW_EXECUTION_OR_PROMOTION_EVIDENCE",
        local_blocked_selftest: stable(candidateHandoffBlockedSelftest),
        current_state: "BLOCKED",
        ready_semantics: "TRACK_B_SUBMISSION_ELIGIBILITY_ONLY",
        sealed_ready_pair_refs: [],
        sealed_track_b_submission_refs: [],
        sealed_track_b_assessment_refs: [],
        sealed_track_b_pass_refs: [],
        ready_pair_count: 0,
        track_b_submission_count: 0,
        track_b_assessment_count: 0,
        track_b_pass_count: 0,
        publication_authorized_count: 0,
        production_authorized_count: 0,
        publication: "HOLD",
        production: "HOLD"
      },
      entity_resolution_control_implementations: {
        contract_id: entityResolutionContract.id,
        contract_fingerprint: fingerprint(entityResolutionContract),
        synthetic_selftest_id: entityResolutionSelftest.id,
        synthetic_selftest_fingerprint: fingerprint(entityResolutionSelftest),
        canonical_scope_matrix_ref: inputReference(contract.canonical_inputs.entity_resolution_scope_matrix),
        approved_calibration_strata_ref:
          inputReference(contract.canonical_inputs.entity_resolution_approved_calibration_strata),
        approved_calibration_strata_id: entityResolutionApprovedCalibrationStrata.id,
        approved_calibration_strata_status: entityResolutionApprovedCalibrationStrata.status,
        approved_calibration_strata_fingerprint:
          entityResolutionContract.empirical_attestation_policy.approved_calibration_strata_sha256,
        approved_calibration_strata_count: entityResolutionApprovedCalibrationStrataGrammar.length,
        required_calibration_strata_ids: approvedCalibrationStrataIds,
        approved_calibration_strata_ids: approvedCalibrationStrataIds,
        approved_calibration_strata_grammar: stable(entityResolutionApprovedCalibrationStrataGrammar),
        canonical_scope_matrix_fingerprint:
          entityResolutionContract.empirical_attestation_policy.canonical_scope_matrix_sha256,
        canonical_scope_archetype_mapping_fingerprint:
          entityResolutionContract.empirical_attestation_policy.canonical_scope_archetype_mapping_sha256,
        canonical_scope_count: entityResolutionScopeMatrix.scopes.length,
        required_scope_archetypes: entityResolutionRequiredScopeArchetypes,
        required_scope_archetype_count: entityResolutionRequiredScopeArchetypes.length,
        benchmark_runner_ref: fileReference(requiredCanonicalCodeInputs.entity_resolution_benchmark_runner),
        real_source_constructed_control_assembler_ref:
          fileReference(requiredCanonicalCodeInputs.entity_resolution_real_dataset_assembler),
        getty_transaction_r2_extender_ref:
          fileReference(requiredCanonicalCodeInputs.entity_resolution_getty_transaction_r2_extender),
        wikidata_design_r3_extender_ref:
          fileReference(requiredCanonicalCodeInputs.entity_resolution_wikidata_design_r3_extender),
        real_holdout_r4_freezer_ref:
          fileReference(requiredCanonicalCodeInputs.entity_resolution_real_holdout_r4_freezer),
        cross_market_alias_r5_extender_ref:
          fileReference(requiredCanonicalCodeInputs.entity_resolution_cross_market_alias_r5_extender),
        ambiguous_review_r6_extender_ref:
          fileReference(requiredCanonicalCodeInputs.entity_resolution_ambiguous_review_r6_extender),
        approved_calibration_strata_validator_ref:
          fileReference(requiredCanonicalCodeInputs.entity_resolution_approved_strata_validator),
        approved_strata_r7a_promoter_ref:
          fileReference(requiredCanonicalCodeInputs.entity_resolution_approved_strata_r7a_promoter),
        serialized_reference_r7b_extender_ref:
          fileReference(requiredCanonicalCodeInputs.entity_resolution_serialized_reference_r7b_extender),
        variant_release_r7c_extender_ref:
          fileReference(requiredCanonicalCodeInputs.entity_resolution_variant_release_r7c_extender),
        serialized_cross_authority_r7e_extender_ref:
          fileReference(requiredCanonicalCodeInputs.entity_resolution_serialized_cross_authority_r7e_extender),
        vehicle_minimums_r7f_extender_ref:
          fileReference(requiredCanonicalCodeInputs.entity_resolution_vehicle_minimums_r7f_extender),
        variant_minimums_r7g_extender_ref:
          fileReference(requiredCanonicalCodeInputs.entity_resolution_variant_minimums_r7g_extender),
        pressing_minimums_r7h_extender_ref:
          fileReference(requiredCanonicalCodeInputs.entity_resolution_pressing_minimums_r7h_extender),
        provenance_minimums_r7i_extender_ref:
          fileReference(requiredCanonicalCodeInputs.entity_resolution_provenance_minimums_r7i_extender),
        designer_maker_minimums_r7j_extender_ref:
          fileReference(requiredCanonicalCodeInputs.entity_resolution_designer_maker_minimums_r7j_extender),
        approved_dataset_finalizer_ref:
          fileReference(requiredCanonicalCodeInputs.entity_resolution_approved_dataset_finalizer),
        benchmark_workflow_ref:
          fileReference(requiredCanonicalCodeInputs.entity_resolution_benchmark_v2_workflow),
        real_source_constructed_control_workflow_ref:
          fileReference(requiredCanonicalCodeInputs.entity_resolution_real_dataset_workflow),
        getty_transaction_r2_workflow_ref:
          fileReference(requiredCanonicalCodeInputs.entity_resolution_getty_transaction_r2_workflow),
        canonical_design_r3_workflow_ref:
          fileReference(requiredCanonicalCodeInputs.entity_resolution_canonical_design_r3_workflow),
        real_holdout_r4_workflow_ref:
          fileReference(requiredCanonicalCodeInputs.entity_resolution_real_holdout_r4_workflow),
        cross_market_alias_r5_workflow_ref:
          fileReference(requiredCanonicalCodeInputs.entity_resolution_cross_market_alias_r5_workflow),
        ambiguous_review_r6_workflow_ref:
          fileReference(requiredCanonicalCodeInputs.entity_resolution_ambiguous_review_r6_workflow),
        approved_calibration_strata_workflow_ref:
          fileReference(requiredCanonicalCodeInputs.entity_resolution_approved_strata_workflow),
        approved_strata_r7a_workflow_ref:
          fileReference(requiredCanonicalCodeInputs.entity_resolution_approved_strata_r7a_workflow),
        serialized_reference_r7b_workflow_ref:
          fileReference(requiredCanonicalCodeInputs.entity_resolution_serialized_reference_r7b_workflow),
        variant_release_r7c_workflow_ref:
          fileReference(requiredCanonicalCodeInputs.entity_resolution_variant_release_r7c_workflow),
        serialized_cross_authority_r7e_workflow_ref:
          fileReference(requiredCanonicalCodeInputs.entity_resolution_serialized_cross_authority_r7e_workflow),
        vehicle_minimums_r7f_workflow_ref:
          fileReference(requiredCanonicalCodeInputs.entity_resolution_vehicle_minimums_r7f_workflow),
        variant_minimums_r7g_workflow_ref:
          fileReference(requiredCanonicalCodeInputs.entity_resolution_variant_minimums_r7g_workflow),
        pressing_minimums_r7h_workflow_ref:
          fileReference(requiredCanonicalCodeInputs.entity_resolution_pressing_minimums_r7h_workflow),
        provenance_minimums_r7i_workflow_ref:
          fileReference(requiredCanonicalCodeInputs.entity_resolution_provenance_minimums_r7i_workflow),
        designer_maker_minimums_r7j_workflow_ref:
          fileReference(requiredCanonicalCodeInputs.entity_resolution_designer_maker_minimums_r7j_workflow),
        finalization_preflight_workflow_ref:
          fileReference(requiredCanonicalCodeInputs.entity_resolution_finalization_preflight_workflow),
        synthetic_selftest_mechanics_present: true,
        real_source_constructed_control_implementation_present: true,
        r7efg_constructed_control_extensions_implementation_present: true,
        r7e_declared_output_id:
          "entity-resolution-live-source-derived-constructed-control-r7e-serialized-minimums",
        r7e_declared_output_scope:
          "R7E_PARTIAL_APPROVED_STRATA_5_OF_7_SERIALIZED_COMPLETE_CONSTRUCTED_CONTROL",
        r7f_declared_output_id:
          "entity-resolution-live-source-derived-constructed-control-r7f-vehicle-minimums",
        r7f_declared_output_scope:
          "R7F_PARTIAL_APPROVED_STRATA_5_OF_7_VEHICLE_AND_SERIALIZED_COMPLETE_CONSTRUCTED_CONTROL",
        r7g_declared_output_id:
          "entity-resolution-live-source-derived-constructed-control-r7g-variant-minimums",
        r7g_declared_output_scope:
          "R7G_PARTIAL_APPROVED_STRATA_5_OF_7_VARIANT_SERIALIZED_VEHICLE_COMPLETE_CONSTRUCTED_CONTROL",
        r7efg_declared_case_count_contract: {
          r7e: { input_case_count: 9, output_case_count: 10 },
          r7f: { input_case_count: 10, output_case_count: 12 },
          r7g: { input_case_count: 12, output_case_count: 14 }
        },
        r7efg_prior_input_sha256_role: "INTEGRITY_ONLY_NOT_AUTHORITY_OR_PROMOTION_EVIDENCE",
        r7efg_prior_input_sha256_is_sealed_execution_or_empirical_evidence: false,
        r7hi_constructed_control_extensions_implementation_present: true,
        r7h_declared_output_id:
          "entity-resolution-live-source-derived-constructed-control-r7h-pressing-minimums",
        r7h_declared_output_scope:
          "R7H_PARTIAL_APPROVED_STRATA_5_OF_7_FOUR_GRAMMARS_COMPLETE_CONSTRUCTED_CONTROL",
        r7i_declared_output_id:
          "entity-resolution-live-source-derived-constructed-control-r7i-provenance-minimums",
        r7i_declared_output_scope:
          "R7I_PARTIAL_APPROVED_STRATA_5_OF_7_FIVE_GRAMMARS_COMPLETE_CONSTRUCTED_CONTROL",
        r7efghi_declared_case_count_contract: {
          r7e: { input_case_count: 9, output_case_count: 10 },
          r7f: { input_case_count: 10, output_case_count: 12 },
          r7g: { input_case_count: 12, output_case_count: 14 },
          r7h: { input_case_count: 14, output_case_count: 16 },
          r7i: { input_case_count: 16, output_case_count: 18 }
        },
        r7hi_prior_input_sha256_role: "INTEGRITY_ONLY_NOT_AUTHORITY_OR_PROMOTION_EVIDENCE",
        r7hi_prior_input_sha256_is_sealed_execution_or_empirical_evidence: false,
        r7i_ambiguous_case_declared_expected_decision: "REVIEW",
        r7i_ambiguous_case_auto_merge_allowed: false,
        r7i_ambiguous_case_auto_split_allowed: false,
        r7j_constructed_control_extension_implementation_present: true,
        r7j_declared_output_id:
          "entity-resolution-live-source-derived-constructed-control-r7j-designer-maker-minimums",
        r7j_declared_output_scope:
          "R7J_PARTIAL_APPROVED_STRATA_6_OF_7_SIX_GRAMMARS_COMPLETE_CONSTRUCTED_CONTROL",
        r7j_declared_input_case_count: 18,
        r7j_declared_output_case_count: 21,
        r7j_declared_represented_grammar_count: 6,
        r7j_declared_required_grammar_count: 7,
        r7j_declared_all_required_grammars_complete: false,
        r7j_prior_input_sha256_role: "INTEGRITY_ONLY_NOT_AUTHORITY_OR_PROMOTION_EVIDENCE",
        r7j_prior_input_sha256_is_sealed_execution_or_empirical_evidence: false,
        finalization_preflight_implementation_present: true,
        current_r7j_finalization_state: "BLOCKED",
        current_r7j_finalization_blockers: [
          "FINALIZE_PER_STRATUM_INCOMPLETE:er-stratum-graded-population",
          "FINALIZE_EMPIRICAL_DATASET_FLAGS_REQUIRED",
          "FINALIZE_CONSTRUCTED_CONTROL_PROHIBITED",
          "FINALIZE_CANONICALLY_APPROVED_EMPIRICAL_ATTESTATION_REQUIRED",
          "FINALIZE_VERIFIED_TRACK_B_EMPIRICAL_ATTESTATION_REQUIRED",
          "FINALIZE_EMPIRICAL_SAMPLE_FLOORS_REQUIRED",
          "FINALIZE_WILSON95_LOWER_BOUNDS_REQUIRED",
          "FINALIZE_ATTESTED_CASE_EVIDENCE_BINDING_REQUIRED",
          "FINALIZE_EMPIRICAL_BENCHMARK_GATE_REQUIRED"
        ],
        canonical_approved_empirical_attestation_fingerprint_count: 0,
        caller_supplied_seven_of_seven_or_empirical_booleans_may_override_canonical_attestation: false,
        sealed_finalized_dataset_artifact_refs: [],
        sealed_finalization_workflow_attestation_refs: [],
        finalized_dataset_artifact_count_in_sealed_evidence: 0,
        finalization_execution_evidenced: false,
        finalization_public_claim_or_release_authorized: false,
        finalization_production_authorized: false,
        finalization_production: "HOLD",
        constructed_controls_are_empirical_benchmark_eligible: false,
        empirical_attestation_required: true,
        per_case_source_evidence_required: true,
        case_source_evidence_binding_required: true,
        case_source_payload_digest_binding_required: true,
        scope_matrix_digest_binding_required: true,
        exact_required_scope_archetype_binding_required: true,
        case_scope_archetype_binding_required: true,
        approved_calibration_strata_digest_binding_required: true,
        case_to_approved_stratum_binding_required: true,
        per_stratum_case_class_and_identity_boundary_minima_required: true,
        aggregate_case_class_and_boundary_coverage_may_substitute_for_per_stratum_grammar: false,
        caller_supplied_calibration_manifest_must_match_canonical: true,
        caller_supplied_calibration_manifest_may_override_canonical: false,
        empirical_sample_policy: stable(entityResolutionEmpiricalSamplePolicy),
        empirical_sample_policy_fingerprint:
          entityResolutionContract.empirical_attestation_policy.empirical_sample_policy_sha256,
        empirical_sample_floors_required: true,
        wilson_95_lower_bound_gate_required: true,
        approved_empirical_attestation_manifest_count:
          entityResolutionContract.empirical_attestation_policy.approved_manifest_fingerprints.length,
        sealed_dataset_artifact_refs: [],
        sealed_benchmark_result_refs: [],
        sealed_workflow_attestation_refs: [],
        sealed_r7_dataset_artifact_refs: [],
        sealed_r7_workflow_attestation_refs: [],
        r7_chain_execution_evidenced: false,
        sealed_r7efg_dataset_artifact_refs: [],
        sealed_r7efg_benchmark_result_refs: [],
        sealed_r7efg_workflow_attestation_refs: [],
        r7efg_executed_constructed_control_case_count_in_sealed_evidence: 0,
        r7efg_chain_execution_evidenced: false,
        r7efg_empirical_benchmark_evidence_present: false,
        r7efg_current_market_evidence_present: false,
        r7efg_production_authorized: false,
        sealed_r7hi_dataset_artifact_refs: [],
        sealed_r7hi_benchmark_result_refs: [],
        sealed_r7hi_workflow_attestation_refs: [],
        r7hi_executed_constructed_control_case_count_in_sealed_evidence: 0,
        r7hi_chain_execution_evidenced: false,
        r7hi_blind_holdout_evidence_present: false,
        r7hi_empirical_benchmark_evidence_present: false,
        r7hi_current_market_evidence_present: false,
        r7hi_public_claim_or_release_authorized: false,
        r7hi_production_authorized: false,
        sealed_r7j_dataset_artifact_refs: [],
        sealed_r7j_benchmark_result_refs: [],
        sealed_r7j_workflow_attestation_refs: [],
        r7j_executed_constructed_control_case_count_in_sealed_evidence: 0,
        r7j_chain_execution_evidenced: false,
        r7j_blind_holdout_evidence_present: false,
        r7j_empirical_benchmark_evidence_present: false,
        r7j_current_market_evidence_present: false,
        r7j_public_claim_or_release_authorized: false,
        r7j_production_authorized: false,
        r7j_production: "HOLD",
        empirical_99_percent_evidenced: false,
        per_case_source_evidence_binding_verified: false,
        case_source_evidence_binding_verified: false,
        case_source_payload_binding_verified: false,
        case_license_evidence_binding_verified: false,
        scope_policy_binding_verified: false,
        sample_policy_binding_verified: false,
        empirical_attestation_verified: false,
        required_scope_archetype_coverage_verified: false,
        approved_calibration_strata_binding_verified_in_sealed_dataset: false,
        per_stratum_case_class_and_identity_boundary_minima_verified: false,
        empirical_sample_floors_verified: false,
        wilson_95_lower_bound_gate_verified: false,
        empirical_benchmark_gate_pass: false,
        pre_track_b_promotion_authorized: false,
        production_promotion_authorized: false,
        empirical_promotion_authorized: false,
        independent_label_review_complete: false,
        label_adjudication_complete: false,
        holdout_sealed_before_modeling: false,
        track_b_pass: false
      },
      runtime_core_and_baseline_declarations: {
        runtime_core_id: runtimeCoreR1.id,
        runtime_core_fingerprint: fingerprint(runtimeCoreR1),
        baseline_runner_ref: fileReference(requiredCanonicalCodeInputs.runtime_control_baseline_runner),
        runtime_core_workflow_ref:
          fileReference(requiredCanonicalCodeInputs.asi_runtime_core_validation_workflow),
        baseline_workflow_ref:
          fileReference(requiredCanonicalCodeInputs.runtime_control_baseline_workflow),
        queue_recovery_runtime_ref:
          fileReference(requiredCanonicalCodeInputs.queue_recovery_runtime),
        task_lease_atomic_fencing_migration_ref:
          fileReference(requiredCanonicalCodeInputs.task_lease_atomic_fencing_shadow_migration),
        d1_fail_closed_shadow_test_ref:
          fileReference(requiredCanonicalCodeInputs.d1_fail_closed_shadow_test),
        queue_d1_processor_e2e_test_ref:
          fileReference(requiredCanonicalCodeInputs.queue_d1_processor_e2e_test),
        runtime_recovery_fairness_test_ref:
          fileReference(requiredCanonicalCodeInputs.runtime_recovery_fairness_test),
        autonomous_runtime_workflow_ref:
          fileReference(requiredCanonicalCodeInputs.autonomous_runtime_workflow),
        runtime_deploy_preflight_ref:
          fileReference(requiredCanonicalCodeInputs.runtime_deploy_preflight),
        runtime_smoke_ref:
          fileReference(requiredCanonicalCodeInputs.runtime_smoke),
        implementation_mode: "LOCAL_IN_MEMORY_QUEUE_D1_COMPATIBLE_DEV_SHADOW_CONTROL",
        task_lease_atomic_fencing_local_shadow_verified: taskLeaseOwnerEpochWriteFenceVerified,
        task_lease_atomic_fencing_remote_cloudflare_verified: false,
        remote_cloudflare_queue_d1_executed: false,
        canonical_cloudflare_durability_verified: false,
        original_source_record_processed_by_runtime: false,
        synthetic_retry_and_quarantine_controls: true,
        sealed_baseline_artifact_refs: [],
        sealed_workflow_attestation_refs: []
      },
      mainline_real_source_runtime_implementations: {
        queue_d1_injection: {
          implementation_present: true,
          implementation_mode: "LOCAL_QUEUE_D1_COMPATIBLE_DEV_SHADOW_HARNESS_IMPLEMENTED_WORKFLOW_ATTESTATION_NOT_INCLUDED",
          remote_execution: false,
          original_getty_record_processed: false,
          getty_derived_admission_metadata_is_ancillary_on_synthetic_discovery_request: true,
          pass_allow_assertions_are_fixture_derived: true,
          real_source_admission_metadata_read_by_processors: false,
          raw_source_response_preserved: false,
          raw_source_response_hash_preserved: false,
          raw_source_assertion_binding_preserved: false,
          bridge_payload_hash_scope: ["record_id", "record_type", "retrieved_at"],
          external_fetch_forbidden_inside_harness: true,
          script_ref: fileReference(requiredCanonicalCodeInputs.real_source_queue_d1_injection_runner),
          workflow_ref: fileReference(requiredCanonicalCodeInputs.real_source_queue_d1_injection_workflow),
          sealed_execution_attestation_refs: []
        },
        retry_dlq_quarantine: {
          implementation_present: true,
          implementation_mode: "LOCAL_QUEUE_D1_COMPATIBLE_DEV_SHADOW_HARNESS_IMPLEMENTED_WORKFLOW_ATTESTATION_NOT_INCLUDED",
          remote_execution: false,
          original_getty_record_processed: false,
          getty_derived_admission_metadata_is_ancillary_on_synthetic_discovery_request: true,
          retry_and_unknown_quarantine_are_synthetic_controls: true,
          real_source_admission_metadata_read_by_processors: false,
          remote_durability_proven: false,
          source_failure_empirically_observed: false,
          external_fetch_forbidden_inside_harness: true,
          script_ref: fileReference(requiredCanonicalCodeInputs.real_source_retry_dlq_quarantine_runner),
          workflow_ref: fileReference(requiredCanonicalCodeInputs.real_source_retry_dlq_quarantine_workflow),
          sealed_execution_attestation_refs: []
        },
        workflow_presence_is_sealed_execution_attestation: false
      }
    },
    execution_truth: {
      mode: "LOCAL_DETERMINISTIC_SHADOW",
      registered_processor_count: processorCount,
      exercised_processor_count: Number(e2e.summary.processors_exercised),
      discovery_fleet_queue_d1_count: Number(e2e.summary.discovery_fleets_queue_d1_exercised),
      queue_d1_processor_deliveries: Number(e2e.summary.full_queue_d1_processor_deliveries),
      global_pool_registered_endpoint_records: bootstrap.registered_endpoint_record_count,
      global_pool_registered_canonical_hosts: bootstrap.registered_canonical_host_count,
      global_pool_queue_seed_events: bootstrap.queue_seed_event_count,
      network_requests_during_processor_e2e: Number(e2e.summary.network_requests),
      sealed_evidence_live_retrieval_artifact_count: 0,
      sealed_evidence_bridge_artifact_count: 0,
      mainline_real_source_queue_d1_implementation_present: true,
      mainline_real_source_retry_dlq_quarantine_implementation_present: true,
      mainline_real_source_harness_implementation_mode:
        "LOCAL_QUEUE_D1_COMPATIBLE_DEV_SHADOW_HARNESS_IMPLEMENTED_WORKFLOW_ATTESTATION_NOT_INCLUDED",
      mainline_workflow_presence_is_sealed_execution_attestation: false,
      mainline_real_source_harness_remote_execution: false,
      sealed_evidence_original_getty_record_processed: false,
      sealed_evidence_mainline_workflow_attestation_count: 0,
      mainline_runtime_core_declaration_present: true,
      mainline_runtime_control_baseline_implementation_present: true,
      mainline_runtime_control_implementation_mode:
        "LOCAL_IN_MEMORY_QUEUE_D1_COMPATIBLE_DEV_SHADOW_CONTROL",
      mainline_runtime_core_remote_execution_verified: false,
      mainline_runtime_core_canonical_durability_verified: false,
      mainline_runtime_core_original_source_record_processed: false,
      sealed_evidence_runtime_core_or_baseline_attestation_count: 0,
      sealed_evidence_real_source_queue_d1_injection_count: 0,
      sealed_evidence_real_source_retry_dlq_quarantine_execution_count: 0,
      sealed_evidence_real_source_bridge_processor_mesh_execution: "NOT_RUN_IN_THIS_SEALED_EVIDENCE",
      full_platform_runtime_verified: false,
      remote_resources_verified: false,
      remote_deployment_verified: false,
      deployed_runtime_count: 0
    },
    source_truth: {
      rights_review_artifact_present: rightsReview.present,
      purpose_eligibility_artifact_present: purposeEligibility.present,
      strict_r1_count_scope: "ASI_SOURCE_RIGHTS_ACCESS_REVIEW_R1_ONLY",
      reviewed_source_count: reviewedSourceCount,
      reviewed_purpose_package_count: countField(purposeEligibility.value, "reviewed_purpose_package_count"),
      purpose_policy_preflight_pass_package_count: countField(
        purposeEligibility.value, "purpose_policy_preflight_pass_package_count"),
      held_purpose_package_count: countField(purposeEligibility.value, "held_purpose_package_count"),
      rejected_purpose_package_count: countField(purposeEligibility.value, "rejected_purpose_package_count"),
      bounded_shadow_rights_policy_preflight_pass_source_count: boundedShadowRightsPolicyPreflightPassSourceCount,
      purpose_policy_preflight_pass_binding_count: purposePolicyPreflightPassBindingCount,
      purpose_policy_preflight_pass_source_count: purposePolicyPreflightPassSourceCount,
      purpose_policy_preflight_pass_frontier_channel_count: countField(
        purposeEligibility.value, "purpose_policy_preflight_pass_frontier_channel_count"),
      purpose_policy_preflight_pass_target_source_count: countField(
        purposeEligibility.value, "purpose_policy_preflight_pass_target_source_count"),
      evidence_claim_count: countField(purposeEligibility.value, "evidence_claim_count"),
      normalized_claim_record_integrity_verified_count: countField(
        purposeEligibility.value, "normalized_claim_record_integrity_verified_count"),
      pending_normalized_claim_record_count: countField(
        purposeEligibility.value, "pending_normalized_claim_record_count"),
      source_content_capture_complete_count: countField(
        purposeEligibility.value, "source_content_capture_complete_count"),
      source_content_capture_pending_count: countField(
        purposeEligibility.value, "source_content_capture_pending_count"),
      runtime_admission_events_emitted: runtimeAdmissionEventsEmitted,
      runtime_admission_materialized_binding_count: runtimeAdmissionMaterializedBindingCount,
      canonical_region_language_coverage_credit: canonicalRegionLanguageCoverageCredit,
      purpose_held_source_count: heldSourceCount,
      purpose_rejected_source_count: rejectedSourceCount,
      market_event_evidence_policy_preflight_pass_source_count: marketEvidenceEligibleCount,
      mainline_methodology_declared_identity_context_admitted_source_count:
        mainlineIdentityContextDeclaredAdmittedSourceCount,
      mainline_methodology_declared_historical_transaction_admitted_source_count:
        mainlineHistoricalTransactionDeclaredAdmittedSourceCount,
      mainline_methodology_conditional_source_count: mainlineConditionalSourceCount,
      mainline_methodology_current_market_event_ready_source_count: mainlineCurrentMarketEventReadySourceCount,
      mainline_prior_pilot_declared_source_record_count:
        mainlineIdentityContextPool.sources.length + mainlineHistoricalTransactionPool.sources.length,
      global_rights_r2_count_scope:
        globalRightsR2.evidence_assurance.count_scope,
      global_rights_r2_declared_source_record_count: globalRightsR2.sources.length,
      global_rights_r2_declared_identity_context_source_count:
        globalRightsR2.pool_effect.new_admitted_identity_context_sources,
      global_rights_r2_conditional_market_candidate_count:
        globalRightsR2.pool_effect.new_current_market_candidates_conditional,
      global_rights_r2_current_market_ready_source_count:
        globalRightsR2.pool_effect.current_market_evidence_sources,
      global_rights_r2_strict_r1_revalidation_complete: false,
      global_rights_r2_independent_legal_review_complete: false,
      global_rights_r2_runtime_admission_events_emitted:
        globalRightsR2.evidence_assurance.runtime_admission_events_emitted,
      global_rights_r2_counts_are_additive_to_prior_pilot_counts: false,
      designer_maker_r3_repository_declared_identity_calibration_metadata_source_count: 2,
      designer_maker_r3_strict_r1_evidence_bound_admitted_source_count: 0,
      designer_maker_r3_full_source_pool_admitted_source_count: 0,
      designer_maker_r3_current_market_ready_source_count: 0,
      designer_maker_r3_runtime_admitted_source_count: 0,
      designer_maker_r3_image_admitted_source_count: 0,
      designer_maker_r3_repository_declaration_only: true,
      designer_maker_r3_strict_r1_evidence_bound_revalidation_complete: false,
      designer_maker_r3_independent_legal_review_complete: false,
      designer_maker_r3_source_content_bytes_archived: false,
      designer_maker_r3_runtime_admission_authorized: false,
      designer_maker_r3_current_market_claim_authorized: false,
      designer_maker_r3_full_source_pool_admission_authorized: false,
      designer_maker_r3_public_commercial_admission_authorized: false,
      designer_maker_r3_image_admission_authorized: false,
      designer_maker_r3_production_promotion_authorized: false,
      designer_maker_r3_production: "HOLD",
      candidate_handoff_r2_blocked_selftest_executed_locally: true,
      candidate_handoff_r2_blocked_selftest_two_run_byte_identical: true,
      candidate_handoff_r2_blocker_count: 30,
      candidate_handoff_r2_current_state: "BLOCKED",
      candidate_handoff_r2_constructed_control: true,
      candidate_handoff_r2_empirical_metrics_present: false,
      candidate_handoff_r2_empirical_attestation_verified: false,
      candidate_handoff_r2_current_market_evidence_present: false,
      candidate_handoff_r2_ready_semantics: "TRACK_B_SUBMISSION_ELIGIBILITY_ONLY",
      candidate_handoff_r2_ready_pair_count: 0,
      candidate_handoff_r2_track_b_submission_count: 0,
      candidate_handoff_r2_track_b_assessment_count: 0,
      candidate_handoff_r2_track_b_pass_count: 0,
      candidate_handoff_r2_publication_authorized_count: 0,
      candidate_handoff_r2_production_authorized_count: 0,
      candidate_handoff_r2_publication: "HOLD",
      candidate_handoff_r2_production: "HOLD",
      er_synthetic_selftest_mechanics_present: true,
      er_real_source_constructed_control_assembler_present: true,
      sealed_er_dataset_artifact_count: 0,
      sealed_er_benchmark_result_count: 0,
      sealed_er_workflow_attestation_count: 0,
      er_approved_empirical_attestation_manifest_count:
        entityResolutionContract.empirical_attestation_policy.approved_manifest_fingerprints.length,
      er_approved_calibration_strata_count: entityResolutionApprovedCalibrationStrataGrammar.length,
      sealed_er_r7_dataset_artifact_count: 0,
      sealed_er_r7_workflow_attestation_count: 0,
      sealed_er_r7efg_dataset_artifact_count: 0,
      sealed_er_r7efg_benchmark_result_count: 0,
      sealed_er_r7efg_workflow_attestation_count: 0,
      er_r7efg_executed_constructed_control_case_count: 0,
      sealed_er_r7hi_dataset_artifact_count: 0,
      sealed_er_r7hi_benchmark_result_count: 0,
      sealed_er_r7hi_workflow_attestation_count: 0,
      er_r7hi_executed_constructed_control_case_count: 0,
      er_approved_calibration_strata_manifest_present: true,
      er_approved_calibration_strata_fingerprint_verified: true,
      er_approved_calibration_strata_is_empirical_attestation: false,
      er_r7_chain_implementation_present: true,
      er_r7_chain_execution_evidenced: false,
      er_r7efg_constructed_control_extensions_implementation_present: true,
      er_r7efg_chain_execution_evidenced: false,
      er_r7efg_empirical_benchmark_evidence_present: false,
      er_r7efg_current_market_evidence_present: false,
      er_r7efg_production_authorized: false,
      er_r7hi_constructed_control_extensions_implementation_present: true,
      er_r7hi_chain_execution_evidenced: false,
      er_r7hi_blind_holdout_evidence_present: false,
      er_r7hi_empirical_benchmark_evidence_present: false,
      er_r7hi_current_market_evidence_present: false,
      er_r7hi_public_claim_or_release_authorized: false,
      er_r7hi_production_authorized: false,
      sealed_er_r7j_dataset_artifact_count: 0,
      sealed_er_r7j_benchmark_result_count: 0,
      sealed_er_r7j_workflow_attestation_count: 0,
      er_r7j_executed_constructed_control_case_count: 0,
      er_r7j_constructed_control_extension_implementation_present: true,
      er_r7j_chain_execution_evidenced: false,
      er_r7j_declared_represented_grammar_count: 6,
      er_r7j_declared_required_grammar_count: 7,
      er_r7j_declared_all_required_grammars_complete: false,
      er_r7j_blind_holdout_evidence_present: false,
      er_r7j_empirical_benchmark_evidence_present: false,
      er_r7j_current_market_evidence_present: false,
      er_r7j_public_claim_or_release_authorized: false,
      er_r7j_production_authorized: false,
      er_r7j_production: "HOLD",
      er_finalization_preflight_implementation_present: true,
      er_current_r7j_finalization_state: "BLOCKED",
      er_canonical_approved_empirical_attestation_fingerprint_count: 0,
      sealed_er_finalized_dataset_artifact_count: 0,
      sealed_er_finalization_workflow_attestation_count: 0,
      er_finalization_execution_evidenced: false,
      er_finalization_caller_supplied_flags_may_override_canonical_attestation: false,
      er_finalization_public_claim_or_release_authorized: false,
      er_finalization_production_authorized: false,
      er_finalization_production: "HOLD",
      er_approved_calibration_strata_digest_binding_required: true,
      er_case_to_approved_stratum_binding_required: true,
      er_per_stratum_case_class_and_identity_boundary_minima_required: true,
      er_aggregate_class_boundary_coverage_may_substitute_for_per_stratum_grammar: false,
      er_caller_supplied_calibration_manifest_must_match_canonical: true,
      er_caller_supplied_calibration_manifest_may_override_canonical: false,
      er_approved_calibration_strata_binding_verified_in_sealed_dataset: false,
      er_per_stratum_case_class_and_identity_boundary_minima_verified: false,
      er_required_scope_archetype_count: entityResolutionRequiredScopeArchetypes.length,
      er_scope_matrix_canonical_fingerprint_verified: true,
      er_per_case_source_evidence_and_license_binding_required: true,
      er_case_source_evidence_binding_required: true,
      er_case_scope_archetype_binding_required: true,
      er_empirical_sample_policy_fingerprint_verified: true,
      er_minimum_total_cases_required: entityResolutionEmpiricalSamplePolicy.minimum_total_cases,
      er_minimum_blind_holdout_cases_required:
        entityResolutionEmpiricalSamplePolicy.minimum_blind_holdout_cases,
      er_minimum_cases_per_scope_archetype_required:
        entityResolutionEmpiricalSamplePolicy.minimum_cases_per_required_scope_archetype,
      er_minimum_blind_cases_per_scope_archetype_required:
        entityResolutionEmpiricalSamplePolicy.minimum_blind_cases_per_required_scope_archetype,
      er_minimum_cases_per_identity_boundary_required:
        entityResolutionEmpiricalSamplePolicy.minimum_cases_per_identity_boundary,
      er_minimum_cases_per_case_class_required:
        entityResolutionEmpiricalSamplePolicy.minimum_cases_per_required_case_class,
      er_wilson_confidence_level_required: entityResolutionEmpiricalSamplePolicy.wilson_confidence_level,
      er_minimum_overall_accuracy_wilson_lower_bound_required:
        entityResolutionEmpiricalSamplePolicy.minimum_overall_accuracy_wilson_lower_bound,
      er_minimum_blind_accuracy_wilson_lower_bound_required:
        entityResolutionEmpiricalSamplePolicy.minimum_blind_accuracy_wilson_lower_bound,
      er_per_case_source_evidence_binding_verified: false,
      er_case_source_evidence_binding_verified: false,
      er_case_source_payload_binding_verified: false,
      er_case_license_evidence_binding_verified: false,
      er_scope_policy_binding_verified: false,
      er_sample_policy_binding_verified: false,
      er_empirical_attestation_verified: false,
      er_full_required_scope_archetype_coverage_verified: false,
      er_empirical_sample_floors_verified: false,
      er_wilson_95_lower_bound_gate_verified: false,
      er_empirical_benchmark_gate_pass: false,
      er_pre_track_b_promotion_authorized: false,
      er_production_promotion_authorized: false,
      er_empirical_promotion_authorized: false,
      er_empirical_99_percent_evidenced: false,
      er_independent_label_review_complete: false,
      er_label_adjudication_complete: false,
      er_holdout_sealed_before_modeling: false,
      er_track_b_pass: false,
      runtime_core_declaration_present: true,
      runtime_control_baseline_implementation_present: true,
      sealed_runtime_core_or_baseline_artifact_count: 0,
      sealed_runtime_core_or_baseline_workflow_attestation_count: 0,
      runtime_core_remote_cloudflare_execution_verified: false,
      runtime_core_canonical_cloudflare_durability_verified: false,
      scope_source_pools_ready: Number(readiness.source_pools_ready),
      market_data_poc_ready_scopes: Number(readiness.market_data_poc_ready_scopes),
      indexes_computed: Number(readiness.indexes_computed),
      deployed_alignment_percent: deployedAlignmentPercent,
      rights_pass_semantics: "POLICY_AND_EVIDENCE_PREFLIGHT_NOT_LEGAL_CONCLUSION",
      canonical_rights_decision_semantics: purposeEligibility.value?.decision_semantics?.pass_means ?? "NO_PURPOSE_ELIGIBILITY_ARTIFACT",
      purpose_eligibility_rebuild_matches_committed_artifact: purposeEligibilityRebuildMatches,
      normalized_claim_record_integrity_state: purposeEligibility.value?.summary?.normalized_claim_record_integrity_state ?? "NOT_VERIFIED",
      pass_package_claim_record_integrity_state: passClaimRecordIntegrityVerified
        ? "ALL_PASS_NORMALIZED_CLAIM_RECORDS_INTEGRITY_VERIFIED"
        : "NOT_VERIFIED",
      pass_package_temporal_provenance_state: passPackageTemporalProvenanceVerified
        ? "ALL_PASS_TEMPORAL_PROVENANCE_ORDER_VERIFIED"
        : "NOT_VERIFIED",
      pass_package_evidence_assertion_binding_state: passPackageEvidenceAssertionBindingsVerified
        ? "ALL_PASS_ASSERTION_BINDING_FINGERPRINTS_VERIFIED"
        : "NOT_VERIFIED",
      source_content_capture_state: purposeEligibility.value?.summary?.source_content_reproducibility_state ?? "NOT_VERIFIED",
      normalized_claim_record_digest_covers_source_content:
        purposeEligibility.value?.decision_semantics?.normalized_claim_record_digest_covers_source_content ?? false,
      earliest_evidence_review_due_at: reviewDueDates[0] ?? null,
      stale_evidence_count_at_evidence_clock: staleEvidenceCount,
      independent_review_state: "NOT_INDEPENDENT_INTERNAL_POLICY_PREFLIGHT",
      independent_legal_review_state: purposeEligibility.value?.summary?.independent_legal_review_state ?? "NOT_COMPLETED",
      independent_legal_review_complete: purposeEligibility.value?.summary?.independent_legal_review_complete ?? false,
      independently_legal_cleared_source_count: 0,
      bounded_shadow_collection_execution_authorized_source_count: 0,
      mainline_pilot_source_declarations_revalidated_by_current_r1: false,
      mainline_declared_admission_is_independent_legal_clearance: false,
      mainline_declared_admission_is_strict_r1_evidence_bound_preflight: false,
      mainline_live_retrieval_artifacts_included_as_canonical_inputs_in_this_sealed_evidence: false,
      sealed_evidence_bridge_artifact_count: 0,
      sealed_evidence_real_source_queue_d1_injection_evidenced: false,
      sealed_evidence_real_source_retry_dlq_quarantine_execution_evidenced: false,
      sealed_evidence_mainline_bridge_processor_mesh_execution: "NOT_RUN_IN_THIS_SEALED_EVIDENCE",
      mainline_real_source_harness_remote_execution: false,
      sealed_evidence_original_getty_record_processed: false,
      mainline_queue_d1_implementation_pass_allow_assertions_are_fixture_derived: true,
      mainline_retry_and_unknown_quarantine_implementation_controls_are_synthetic: true,
      mainline_real_source_admission_metadata_read_by_processors: false,
      mainline_raw_source_response_preserved_in_bridge: false,
      mainline_raw_source_response_hash_preserved_in_bridge: false,
      mainline_raw_source_assertion_binding_preserved_in_bridge: false,
      historical_transaction_context_declared_available: true,
      sealed_historical_transaction_evidence_available: false,
      current_market_event_evidence_available: false,
      registered_endpoints_are_policy_preflight_pass_sources: false,
      purpose_policy_preflight_pass_sources_are_scope_source_pools: false,
      purpose_policy_preflight_bindings_are_runtime_admissions: false,
      frontier_scope_role_policy_binding_provenance_state: frontierScopeRolePolicyBindingProvenanceVerified
        ? "ALL_FRONTIER_BINDINGS_EXACTLY_POLICY_BOUND"
        : "NOT_VERIFIED"
    },
    test_execution: {
      required_suite_count: contract.required_test_suites.length,
      required_suite_pass_count: requiredSuites.filter(suite => suite.status === "PASS").length,
      optional_suite_count: contract.optional_test_suites.length,
      optional_suite_pass_count: optionalSuites.filter(suite => suite.status === "PASS").length,
      executed_test_count: suites.reduce((sum, suite) => sum + Number(suite.test_count || 0), 0),
      contract_negative_controls_passed: meshPreflight.negative_controls_passed,
      contract_negative_controls_total: meshPreflight.negative_controls_total,
      suites
    },
    replay_readiness: {
      schema_migration_reapply: verified(hasTest(shadow, "migrations 0004 and 0006 are replay-safe")),
      duplicate_queue_delivery: verified(hasTest(e2e, "duplicate Queue delivery ACKs idempotently")),
      duplicate_ingress_event_outbox: verified(hasTest(e2e, "duplicate ingress event/outbox is immutable and not redispatched")),
      replay_controller_and_lease: verified(replayControllerVerified),
      remote_replay: "NOT_VERIFIED"
    },
    chaos_and_failure_mode_readiness: {
      payload_hash_forgery_rejection: verified(hasTest(e2e, "declared payload SHA-256 is recomputed")),
      outbox_provenance_forgery_retry: verified(hasTest(e2e, "forged outbox provenance retries fail-closed")),
      unknown_rights_partition_local_hold: verified(hasTest(shadow, "UNKNOWN rights holds only the affected source-purpose-partition")),
      admission_expiry_fail_closed: verified(hasTest(shadow, "expired linked admission")),
      admission_revocation_fail_closed: verified(hasTest(shadow, "revoked linked admission")),
      later_deny_audit_preservation: verified(hasTest(shadow, "later denied discovery observation")),
      partition_delimiter_collision: verified(hasTest(e2e, "partition tuple encoding prevents delimiter-based grain collisions")),
      institutional_context_market_guard: meshPreflight.status === "PASS" ? "CONTRACT_PREFLIGHT_ONLY" : "NOT_VERIFIED",
      synthetic_dead_letter_failure_isolation: meshPreflight.status === "PASS" ? "CONTRACT_PREFLIGHT_ONLY" : "NOT_VERIFIED",
      bounded_partition_rotation_without_starvation: verified(boundedPartitionRotationVerified),
      oldest_age_least_recently_served_starvation_resistance: verified(oldestAgeLrsVerified),
      decision_value_priority: "NOT_IMPLEMENTED",
      coverage_gap_priority: "NOT_IMPLEMENTED",
      market_funnel_priority_completeness: "HOLD",
      circuit_breaker_state_transitions: verified(circuitBreakerVerified),
      rate_and_cost_budget_exhaustion: verified(budgetVerified),
      terminal_dlq_persist_before_ack_fail_closed: verified(terminalDlqPersistBeforeAckVerified),
      terminal_dlq_receipt_idempotency: verified(terminalDlqReceiptIdempotencyVerified),
      task_lease_owner_epoch_write_fence: verified(taskLeaseOwnerEpochWriteFenceVerified),
      terminal_dlq_durability_under_d1_failure: "NOT_VERIFIED",
      remote_chaos_injection: "NOT_VERIFIED"
    },
    recovery_operating_truth: {
      suite_status: recovery.status,
      executed_test_count: recovery.test_count,
      fair_partitions_exercised: Number(recovery.summary.fair_partitions),
      verified_fairness_subset: "BOUNDED_PARTITION_ROTATION_PLUS_OLDEST_AGE_LEAST_RECENTLY_SERVED",
      decision_value_priority: "NOT_IMPLEMENTED",
      coverage_gap_priority: "NOT_IMPLEMENTED",
      full_market_funnel_priority_model: "HOLD",
      replay_max_attempts_exercised: Number(recovery.summary.replay_max_attempts),
      terminal_ack_policy_exercised: recovery.summary.terminal_ack_policy,
      terminal_dlq_loss_guarantee: recovery.summary.loss_guarantee,
      network_requests: Number(recovery.summary.network_requests),
      remote_resources_verified: recovery.summary.remote_resources_verified,
      deployed: recovery.summary.deployed,
      public_projection_authorized: recovery.summary.public_projection_authorized,
      production: recovery.summary.production,
      structured_runtime_telemetry_source: contract.canonical_code_inputs.queue_recovery_runtime
    },
    failure_observations: [
      {
        observation_id: "MIGRATION_REPLAY_SAFE",
        readiness: verified(hasTest(shadow, "migrations 0004 and 0006 are replay-safe")),
        suite_id: shadow.suite_id,
        evidence_ref: "migrations 0004 and 0006 are replay-safe"
      },
      {
        observation_id: "DUPLICATE_QUEUE_DELIVERY_IDEMPOTENT",
        readiness: verified(hasTest(e2e, "duplicate Queue delivery ACKs idempotently")),
        suite_id: e2e.suite_id,
        evidence_ref: "duplicate Queue delivery ACKs idempotently without new materialization"
      },
      {
        observation_id: "DUPLICATE_INGRESS_NOT_REDISPATCHED",
        readiness: verified(hasTest(e2e, "duplicate ingress event/outbox is immutable and not redispatched")),
        suite_id: e2e.suite_id,
        evidence_ref: "duplicate ingress event/outbox is immutable and not redispatched"
      },
      {
        observation_id: "PAYLOAD_HASH_FORGERY_REJECTED",
        readiness: verified(hasTest(e2e, "declared payload SHA-256 is recomputed")),
        suite_id: e2e.suite_id,
        evidence_ref: "declared payload SHA-256 is recomputed before event or outbox persistence"
      },
      {
        observation_id: "OUTBOX_PROVENANCE_FORGERY_RETRIED_FAIL_CLOSED",
        readiness: verified(hasTest(e2e, "forged outbox provenance retries fail-closed")),
        suite_id: e2e.suite_id,
        evidence_ref: "forged outbox provenance retries fail-closed and creates no processor output"
      },
      {
        observation_id: "UNKNOWN_RIGHTS_PARTITION_LOCAL_HOLD",
        readiness: verified(hasTest(shadow, "UNKNOWN rights holds only the affected source-purpose-partition")),
        suite_id: shadow.suite_id,
        evidence_ref: "UNKNOWN rights holds only the affected source-purpose-partition"
      },
      {
        observation_id: "EXPIRED_ADMISSION_FAIL_CLOSED",
        readiness: verified(hasTest(shadow, "expired linked admission")),
        suite_id: shadow.suite_id,
        evidence_ref: "expired linked admission makes a recorded qualification effectively unusable"
      },
      {
        observation_id: "REVOKED_ADMISSION_FAIL_CLOSED",
        readiness: verified(hasTest(shadow, "revoked linked admission")),
        suite_id: shadow.suite_id,
        evidence_ref: "revoked linked admission makes a recorded qualification effectively revoked"
      },
      {
        observation_id: "LATER_DENY_FAIL_CLOSED_WITH_AUDIT_PRESERVED",
        readiness: verified(hasTest(shadow, "later denied discovery observation")),
        suite_id: shadow.suite_id,
        evidence_ref: "later denied discovery observation makes current fail closed without rewriting audit history"
      },
      {
        observation_id: "PARTITION_DELIMITER_COLLISION_PREVENTED",
        readiness: verified(hasTest(e2e, "partition tuple encoding prevents delimiter-based grain collisions")),
        suite_id: e2e.suite_id,
        evidence_ref: "partition tuple encoding prevents delimiter-based grain collisions"
      },
      {
        observation_id: "NO_NETWORK_CALL_DURING_PROCESSOR_E2E",
        readiness: Number(e2e.summary.network_requests) === 0 ? "VERIFIED_LOCAL_SHADOW" : "NOT_VERIFIED",
        suite_id: e2e.suite_id,
        evidence_ref: "all 25 processors are registered and exercised without a network call"
      },
      {
        observation_id: "TASK_LEASE_OWNER_EPOCH_WRITE_FENCE_FAILS_CLOSED",
        readiness: verified(taskLeaseOwnerEpochWriteFenceVerified),
        suite_id: recovery.suite_id,
        evidence_ref: "stale task lease owner cannot mutate processor state after the final fence read before the output batch"
      },
      {
        observation_id: "INSTITUTIONAL_CONTEXT_NOT_PROMOTED_TO_MARKET_EVIDENCE",
        readiness: meshPreflight.status === "PASS" ? "CONTRACT_PREFLIGHT_ONLY" : "NOT_VERIFIED",
        suite_id: meshPreflight.suite_id,
        evidence_ref: "institutional context contract mutation and deterministic simulation"
      }
    ],
    data_quality: {
      intended_grain: "ONE_EVIDENCE_RECORD_PER_CANONICAL_INPUT_AND_FIXED_SHADOW_TEST_SNAPSHOT",
      completeness: {
        required_suites_passed: requiredSuites.filter(suite => suite.status === "PASS").length,
        required_suites_total: contract.required_test_suites.length,
        required_failure_observations_present: contract.required_failure_mode_observations.length,
        required_failure_observations_total: contract.required_failure_mode_observations.length
      },
      uniqueness: {
        registered_processors_unique_and_exercised: processorCount === Number(e2e.summary.processors_exercised),
        evidence_input_keys_unique: new Set(Object.keys(currentInputReferences)).size === Object.keys(currentInputReferences).length,
        code_input_keys_unique: new Set(Object.keys(contract.canonical_code_inputs)).size === Object.keys(contract.canonical_code_inputs).length
      },
      validity: {
        all_canonical_json_inputs_fingerprinted: Object.values(currentInputReferences).every(item => /^sha256:[a-f0-9]{64}$/.test(item.fingerprint)),
        all_canonical_code_inputs_present_and_hashed: Object.values(contract.canonical_code_inputs).every(relativePath =>
          fs.existsSync(path.join(repositoryRoot, relativePath))),
        passing_rights_packages_have_normalized_claim_record_integrity_digests: passClaimRecordIntegrityVerified,
        passing_rights_packages_have_temporal_provenance: passPackageTemporalProvenanceVerified,
        passing_rights_packages_have_assertion_binding_fingerprints: passPackageEvidenceAssertionBindingsVerified,
        frontier_scope_role_policy_binding_provenance_verified: frontierScopeRolePolicyBindingProvenanceVerified,
        source_content_capture_not_claimed: purposeEligibility.present
          ? purposeEligibility.value?.summary?.source_content_reproducibility_state === "PENDING_NOT_ARCHIVED"
          : true,
        bootstrap_transitive_input_fingerprints_present: Object.values(bootstrap.input_fingerprints ?? {})
          .every(value => /^sha256:[a-f0-9]{64}$/.test(value)),
        readiness_transitive_input_and_output_fingerprints_present:
          Object.values(readiness.inputs ?? {}).every(value => /^sha256:[a-f0-9]{64}$/.test(value.fingerprint)) &&
          Object.values(readiness.outputs ?? {}).every(value => /^sha256:[a-f0-9]{64}$/.test(value))
      },
      integrity: {
        queue_d1_foreign_key_check_executed: hasTest(e2e, "all 25 processors are registered and exercised without a network call"),
        recovery_foreign_key_check_executed: hasTest(recovery, "data quality has unique replay/outbox grains and no orphan foreign-key rows")
      },
      timeliness: {
        evidence_clock: contract.evidence_clock,
        earliest_rights_evidence_review_due_at: reviewDueDates[0] ?? null,
        stale_rights_evidence_count: staleEvidenceCount
      },
      limitations: [
        "LOCAL_SHADOW_NOT_REMOTE_RUNTIME",
        "RIGHTS_PASS_IS_POLICY_EVIDENCE_PREFLIGHT_NOT_LEGAL_OPINION",
        "NORMALIZED_CLAIM_RECORD_DIGEST_IS_NOT_PRIMARY_SOURCE_CONTENT_CAPTURE",
        "PRIMARY_SOURCE_CONTENT_IS_PENDING_NOT_ARCHIVED",
        "REVIEWED_SLICE_IS_NOT_GLOBAL_MARKET_COMPLETENESS",
        "MAINLINE_PILOT_SOURCE_DECLARATIONS_ARE_NOT_REVALIDATED_BY_THIS_R1_SLICE",
        "MAINLINE_LIVE_RETRIEVAL_AND_REAL_SOURCE_RUNTIME_EXECUTION_ATTESTATIONS_ARE_NOT_CANONICAL_INPUTS_IN_THIS_SEALED_EVIDENCE",
        "MAINLINE_REAL_SOURCE_QUEUE_D1_AND_RETRY_DLQ_IMPLEMENTATIONS_ARE_PRESENT_BUT_NOT_EXECUTED_IN_THIS_SEALED_EVIDENCE",
        "GLOBAL_RIGHTS_R2_IS_A_NON_ADDITIVE_REPOSITORY_DECLARATION_NOT_STRICT_R1_REVALIDATION_OR_LEGAL_CLEARANCE",
        "DESIGNER_MAKER_R3_TWO_SOURCE_ADMISSION_IS_REPOSITORY_DECLARED_BOUNDED_INTERNAL_IDENTITY_CALIBRATION_METADATA_ONLY_NOT_STRICT_R1_LEGAL_ARCHIVAL_RUNTIME_CURRENT_MARKET_FULL_POOL_IMAGE_PUBLIC_COMMERCIAL_OR_PRODUCTION_AUTHORIZATION",
        "ENTITY_RESOLUTION_SELFTEST_AND_CONSTRUCTED_CONTROL_IMPLEMENTATIONS_ARE_NOT_EMPIRICAL_99_PERCENT_OR_TRACK_B_EVIDENCE",
        "ENTITY_RESOLUTION_EMPIRICAL_SAMPLE_FLOORS_AND_WILSON_95_LOWER_BOUNDS_ARE_POLICY_GATES_NOT_EXECUTED_EVIDENCE",
        "ENTITY_RESOLUTION_APPROVED_BOUNDED_CALIBRATION_STRATA_IS_POLICY_GRAMMAR_NOT_EMPIRICAL_ATTESTATION_OR_EXECUTION_EVIDENCE",
        "ENTITY_RESOLUTION_R7_IMPLEMENTATIONS_AND_WORKFLOWS_ARE_PRESENT_BUT_NOT_EXECUTED_IN_THIS_SEALED_EVIDENCE",
        "ENTITY_RESOLUTION_R7EFG_CONSTRUCTED_CONTROL_IMPLEMENTATIONS_AND_WORKFLOWS_ARE_PRESENT_BUT_NOT_EXECUTED_IN_THIS_SEALED_EVIDENCE",
        "ENTITY_RESOLUTION_R7EFG_SCHEMA_MECHANICS_DO_NOT_PROVE_EMPIRICAL_PER_STRATUM_COMPLETION_OR_CURRENT_MARKET_EVIDENCE",
        "ENTITY_RESOLUTION_R7HI_CONSTRUCTED_CONTROL_IMPLEMENTATIONS_AND_WORKFLOWS_ARE_PRESENT_BUT_NOT_EXECUTED_IN_THIS_SEALED_EVIDENCE",
        "ENTITY_RESOLUTION_R7HI_SCHEMA_MECHANICS_DO_NOT_PROVE_BLIND_EMPIRICAL_CURRENT_MARKET_PUBLIC_OR_PRODUCTION_READINESS",
        "ENTITY_RESOLUTION_R7J_IMPLEMENTATION_AND_WORKFLOW_ARE_PRESENT_BUT_HAVE_ZERO_SEALED_ARTIFACTS_EXECUTED_CASES_OR_ATTESTATIONS_IN_THIS_EVIDENCE",
        "ENTITY_RESOLUTION_R7J_SIX_OF_SEVEN_CONSTRUCTED_CONTROL_GRAMMAR_MECHANICS_DO_NOT_PROVE_FULL_SCOPE_BLIND_EMPIRICAL_CURRENT_MARKET_PUBLIC_OR_PRODUCTION_READINESS",
        "ENTITY_RESOLUTION_FINALIZER_IS_IMPLEMENTED_BUT_CURRENT_R7J_FINALIZATION_IS_BLOCKED_AND_NO_FINAL_ARTIFACT_OR_WORKFLOW_ATTESTATION_IS_SEALED",
        "CALLER_FORGED_SEVEN_OF_SEVEN_OR_EMPIRICAL_RESULT_FLAGS_CANNOT_REPLACE_A_CANONICALLY_APPROVED_EMPIRICAL_ATTESTATION",
        "CANDIDATE_HANDOFF_R2_LOCAL_BLOCKED_SELFTEST_IS_NOT_A_READY_PAIR_TRACK_B_SUBMISSION_ASSESSMENT_PASS_PUBLICATION_OR_PRODUCTION_AUTHORIZATION",
        "RUNTIME_CORE_AND_BASELINE_DECLARATIONS_ARE_NOT_REMOTE_CLOUDFLARE_EXECUTION_OR_DURABILITY_ATTESTATIONS",
        "HISTORICAL_TRANSACTION_CONTEXT_IS_NOT_CURRENT_MARKET_EVIDENCE",
        "TERMINAL_DLQ_HAS_NO_NO_LOSS_GUARANTEE",
        "PURPOSE_ELIGIBILITY_IS_NOT_SCOPE_SOURCE_POOL_READINESS",
        "DECISION_VALUE_AND_COVERAGE_GAP_FAIRNESS_PRIORITIES_NOT_IMPLEMENTED"
      ]
    },
    readiness_limits: {
      current_local_queue_controls_complete: queueContract.runtime_implementation_state.required_queue_controls_complete,
      local_recovery_fairness_suite_status: recovery.status,
      remote_terminal_dlq_loss_guarantee: false,
      live_worldwide_discovery_proven: false,
      reviewed_source_slice_is_global_market_complete: false,
      source_content_archived: false,
      historical_transaction_context_declared_available: true,
      sealed_historical_transaction_evidence_available: false,
      current_market_event_evidence_available: false,
      real_source_live_retrieval_artifact_included_in_this_sealed_evidence: false,
      mainline_real_source_queue_d1_implementation_present: true,
      mainline_real_source_retry_dlq_quarantine_implementation_present: true,
      mainline_real_source_harness_implementation_mode:
        "LOCAL_QUEUE_D1_COMPATIBLE_DEV_SHADOW_HARNESS_IMPLEMENTED_WORKFLOW_ATTESTATION_NOT_INCLUDED",
      mainline_real_source_harness_remote_execution: false,
      sealed_evidence_original_getty_record_processed: false,
      sealed_evidence_real_source_queue_d1_injection_count: 0,
      sealed_evidence_real_source_retry_dlq_quarantine_execution_count: 0,
      sealed_evidence_real_source_queue_d1_injection_evidenced: false,
      sealed_evidence_real_source_retry_dlq_quarantine_execution_evidenced: false,
      global_rights_r2_strict_r1_revalidation_complete: false,
      global_rights_r2_independent_legal_review_complete: false,
      global_rights_r2_current_market_ready_source_count: 0,
      designer_maker_r3_repository_declared_identity_calibration_metadata_source_count: 2,
      designer_maker_r3_strict_r1_evidence_bound_admitted_source_count: 0,
      designer_maker_r3_full_source_pool_admitted_source_count: 0,
      designer_maker_r3_current_market_ready_source_count: 0,
      designer_maker_r3_runtime_admitted_source_count: 0,
      designer_maker_r3_image_admitted_source_count: 0,
      designer_maker_r3_repository_declaration_only: true,
      designer_maker_r3_strict_r1_evidence_bound_revalidation_complete: false,
      designer_maker_r3_independent_legal_review_complete: false,
      designer_maker_r3_source_content_bytes_archived: false,
      designer_maker_r3_runtime_admission_authorized: false,
      designer_maker_r3_current_market_claim_authorized: false,
      designer_maker_r3_full_source_pool_admission_authorized: false,
      designer_maker_r3_public_commercial_admission_authorized: false,
      designer_maker_r3_image_admission_authorized: false,
      designer_maker_r3_production_promotion_authorized: false,
      designer_maker_r3_production: "HOLD",
      candidate_handoff_r2_blocked_selftest_executed_locally: true,
      candidate_handoff_r2_blocked_selftest_two_run_byte_identical: true,
      candidate_handoff_r2_blocker_count: 30,
      candidate_handoff_r2_current_state: "BLOCKED",
      candidate_handoff_r2_constructed_control: true,
      candidate_handoff_r2_empirical_metrics_present: false,
      candidate_handoff_r2_empirical_attestation_verified: false,
      candidate_handoff_r2_current_market_evidence_present: false,
      candidate_handoff_r2_ready_semantics: "TRACK_B_SUBMISSION_ELIGIBILITY_ONLY",
      candidate_handoff_r2_ready_pair_count: 0,
      candidate_handoff_r2_track_b_submission_count: 0,
      candidate_handoff_r2_track_b_assessment_count: 0,
      candidate_handoff_r2_track_b_pass_count: 0,
      candidate_handoff_r2_publication_authorized_count: 0,
      candidate_handoff_r2_production_authorized_count: 0,
      candidate_handoff_r2_publication: "HOLD",
      candidate_handoff_r2_production: "HOLD",
      er_empirical_99_percent_evidenced: false,
      er_independent_label_review_complete: false,
      er_label_adjudication_complete: false,
      er_holdout_sealed_before_modeling: false,
      er_track_b_pass: false,
      er_approved_empirical_attestation_manifest_count: 0,
      er_approved_calibration_strata_count: entityResolutionApprovedCalibrationStrataGrammar.length,
      sealed_er_r7_dataset_artifact_count: 0,
      sealed_er_r7_workflow_attestation_count: 0,
      sealed_er_r7efg_dataset_artifact_count: 0,
      sealed_er_r7efg_benchmark_result_count: 0,
      sealed_er_r7efg_workflow_attestation_count: 0,
      er_r7efg_executed_constructed_control_case_count: 0,
      sealed_er_r7hi_dataset_artifact_count: 0,
      sealed_er_r7hi_benchmark_result_count: 0,
      sealed_er_r7hi_workflow_attestation_count: 0,
      er_r7hi_executed_constructed_control_case_count: 0,
      er_approved_calibration_strata_manifest_present: true,
      er_approved_calibration_strata_fingerprint_verified: true,
      er_approved_calibration_strata_is_empirical_attestation: false,
      er_r7_chain_implementation_present: true,
      er_r7_chain_execution_evidenced: false,
      er_r7efg_constructed_control_extensions_implementation_present: true,
      er_r7efg_chain_execution_evidenced: false,
      er_r7efg_empirical_benchmark_evidence_present: false,
      er_r7efg_current_market_evidence_present: false,
      er_r7efg_production_authorized: false,
      er_r7hi_constructed_control_extensions_implementation_present: true,
      er_r7hi_chain_execution_evidenced: false,
      er_r7hi_blind_holdout_evidence_present: false,
      er_r7hi_empirical_benchmark_evidence_present: false,
      er_r7hi_current_market_evidence_present: false,
      er_r7hi_public_claim_or_release_authorized: false,
      er_r7hi_production_authorized: false,
      sealed_er_r7j_dataset_artifact_count: 0,
      sealed_er_r7j_benchmark_result_count: 0,
      sealed_er_r7j_workflow_attestation_count: 0,
      er_r7j_executed_constructed_control_case_count: 0,
      er_r7j_constructed_control_extension_implementation_present: true,
      er_r7j_chain_execution_evidenced: false,
      er_r7j_declared_represented_grammar_count: 6,
      er_r7j_declared_required_grammar_count: 7,
      er_r7j_declared_all_required_grammars_complete: false,
      er_r7j_blind_holdout_evidence_present: false,
      er_r7j_empirical_benchmark_evidence_present: false,
      er_r7j_current_market_evidence_present: false,
      er_r7j_public_claim_or_release_authorized: false,
      er_r7j_production_authorized: false,
      er_r7j_production: "HOLD",
      er_finalization_preflight_implementation_present: true,
      er_current_r7j_finalization_state: "BLOCKED",
      er_canonical_approved_empirical_attestation_fingerprint_count: 0,
      sealed_er_finalized_dataset_artifact_count: 0,
      sealed_er_finalization_workflow_attestation_count: 0,
      er_finalization_execution_evidenced: false,
      er_finalization_caller_supplied_flags_may_override_canonical_attestation: false,
      er_finalization_public_claim_or_release_authorized: false,
      er_finalization_production_authorized: false,
      er_finalization_production: "HOLD",
      er_approved_calibration_strata_digest_binding_required: true,
      er_case_to_approved_stratum_binding_required: true,
      er_per_stratum_case_class_and_identity_boundary_minima_required: true,
      er_aggregate_class_boundary_coverage_may_substitute_for_per_stratum_grammar: false,
      er_caller_supplied_calibration_manifest_must_match_canonical: true,
      er_caller_supplied_calibration_manifest_may_override_canonical: false,
      er_approved_calibration_strata_binding_verified_in_sealed_dataset: false,
      er_per_stratum_case_class_and_identity_boundary_minima_verified: false,
      er_required_scope_archetype_count: entityResolutionRequiredScopeArchetypes.length,
      er_scope_matrix_canonical_fingerprint_verified: true,
      er_per_case_source_evidence_and_license_binding_required: true,
      er_case_source_evidence_binding_required: true,
      er_case_scope_archetype_binding_required: true,
      er_empirical_sample_policy_fingerprint_verified: true,
      er_minimum_total_cases_required: entityResolutionEmpiricalSamplePolicy.minimum_total_cases,
      er_minimum_blind_holdout_cases_required:
        entityResolutionEmpiricalSamplePolicy.minimum_blind_holdout_cases,
      er_minimum_cases_per_scope_archetype_required:
        entityResolutionEmpiricalSamplePolicy.minimum_cases_per_required_scope_archetype,
      er_minimum_blind_cases_per_scope_archetype_required:
        entityResolutionEmpiricalSamplePolicy.minimum_blind_cases_per_required_scope_archetype,
      er_minimum_cases_per_identity_boundary_required:
        entityResolutionEmpiricalSamplePolicy.minimum_cases_per_identity_boundary,
      er_minimum_cases_per_case_class_required:
        entityResolutionEmpiricalSamplePolicy.minimum_cases_per_required_case_class,
      er_wilson_confidence_level_required: entityResolutionEmpiricalSamplePolicy.wilson_confidence_level,
      er_minimum_overall_accuracy_wilson_lower_bound_required:
        entityResolutionEmpiricalSamplePolicy.minimum_overall_accuracy_wilson_lower_bound,
      er_minimum_blind_accuracy_wilson_lower_bound_required:
        entityResolutionEmpiricalSamplePolicy.minimum_blind_accuracy_wilson_lower_bound,
      er_per_case_source_evidence_binding_verified: false,
      er_case_source_evidence_binding_verified: false,
      er_case_source_payload_binding_verified: false,
      er_case_license_evidence_binding_verified: false,
      er_scope_policy_binding_verified: false,
      er_sample_policy_binding_verified: false,
      er_empirical_attestation_verified: false,
      er_full_required_scope_archetype_coverage_verified: false,
      er_empirical_sample_floors_verified: false,
      er_wilson_95_lower_bound_gate_verified: false,
      er_empirical_benchmark_gate_pass: false,
      er_pre_track_b_promotion_authorized: false,
      er_production_promotion_authorized: false,
      er_empirical_promotion_authorized: false,
      runtime_core_remote_cloudflare_execution_verified: false,
      runtime_core_canonical_cloudflare_durability_verified: false,
      task_lease_atomic_fencing_local_shadow_verified: taskLeaseOwnerEpochWriteFenceVerified,
      task_lease_atomic_fencing_remote_cloudflare_verified: false,
      sealed_runtime_core_or_baseline_attestation_count: 0,
      indexes_are_computed: false,
      public_projection_authorized: false,
      commercial_projection_authorized: false,
      production: "HOLD"
    },
    negative_control_contract: {
      count: contract.negative_controls.length,
      controls: contract.negative_controls
    },
    prohibited_claims: contract.prohibited_claims
  };
  evidence.evidence_fingerprint = evidenceFingerprint(evidence);
  return evidence;
}

function parseArguments(argv) {
  const config = { output: defaultOutputPath, write: false };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--output") config.output = path.resolve(argv[++index]);
    else if (argv[index] === "--write") config.write = true;
    else throw new Error(`Unknown argument: ${argv[index]}`);
  }
  return config;
}

async function main() {
  const config = parseArguments(process.argv.slice(2));
  const evidence = await buildAsiShadowOperatingEvidence();
  if (config.write) {
    fs.mkdirSync(path.dirname(config.output), { recursive: true });
    fs.writeFileSync(config.output, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  }
  console.log(`KIDULTS ASI SHADOW operating evidence: ${evidence.status}`);
  console.log(`Processors registered/exercised: ${evidence.execution_truth.registered_processor_count}/${evidence.execution_truth.exercised_processor_count}`);
  console.log(`Actual SHADOW tests: ${evidence.test_execution.executed_test_count}; contract negative controls: ${evidence.test_execution.contract_negative_controls_passed}/${evidence.test_execution.contract_negative_controls_total}`);
  console.log(`Bounded-rights-policy-preflight/purpose-policy-preflight/scope-pools/indexes: ${evidence.source_truth.bounded_shadow_rights_policy_preflight_pass_source_count}/${evidence.source_truth.purpose_policy_preflight_pass_source_count}/${evidence.source_truth.scope_source_pools_ready}/${evidence.source_truth.indexes_computed}`);
  console.log("Remote deployed/public/commercial/Production: 0/FALSE/FALSE/HOLD");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
