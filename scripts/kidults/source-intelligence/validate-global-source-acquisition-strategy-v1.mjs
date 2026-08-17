import path from "node:path";
import process from "node:process";
import { readJson, unique } from "./asi-discovery-common-v1.mjs";

const root = process.cwd();
const contractPath = path.join(root, "coordination", "kidults", "source-intelligence", "global-high-trust-source-sufficiency-contract-v1.json");
const strategyPath = path.join(root, "coordination", "kidults", "source-intelligence", "global-source-acquisition-and-asi-operating-strategy-v1.json");
const programV2Path = path.join(root, "coordination", "kidults", "source-intelligence", "autonomous-source-intelligence-program-v2.json");
const scopeRegistryPath = path.join(root, "coordination", "kidults", "data-scope", "collection-scope-registry-v1.json");

function fail(errors, message) {
  errors.push(message);
}

export function validateGlobalSourceAcquisitionStrategyV1() {
  const errors = [];
  const contract = readJson(contractPath);
  const strategy = readJson(strategyPath);
  const program = readJson(programV2Path);
  const registry = readJson(scopeRegistryPath);

  const registryDomains = unique(registry.records.map(record => record.parent_core_domain));
  const strategyDomains = unique(strategy.core_domain_strategies.map(record => record.core_domain_id));

  if (contract.source_target_policy !== "ADAPTIVE_OUTCOME_DERIVED_NO_FIXED_CAP") fail(errors, "Contract must use the adaptive Source target policy.");
  if (contract.governing_change.fixed_high_trust_source_target !== null) fail(errors, "Contract must not retain a fixed High-Trust Source target.");
  if (contract.base_operating_universe.core_domains !== 8 || contract.base_operating_universe.collection_scopes !== 32) fail(errors, "Contract operating universe must remain 8 Core Domains and 32 Collection Scopes.");
  if (contract.mandatory_source_roles.length !== 7) fail(errors, "Contract must contain seven mandatory Source Roles.");
  if (contract.autonomous_calibration_wave.scope_role_lanes !== 224 || contract.autonomous_calibration_wave.initial_candidate_assessment_total !== 4480) fail(errors, "Contract calibration wave counts are invalid.");

  if (strategy.governing_contract !== contract.id) fail(errors, "Strategy must reference the adaptive Source sufficiency contract.");
  if (strategy.core_domain_strategies.length !== 8 || strategyDomains.length !== 8) fail(errors, "Strategy must define eight unique Core Domain profiles.");
  if (JSON.stringify(strategyDomains) !== JSON.stringify(registryDomains)) fail(errors, "Strategy Core Domains must match the Collection Scope Registry.");
  if (strategy.immediate_execution.scope_role_lanes !== 224 || strategy.immediate_execution.initial_total_assessments !== 4480) fail(errors, "Strategy immediate execution counts are invalid.");
  if (strategy.boundaries.fixed_global_source_target !== null) fail(errors, "Strategy must not define a fixed global Source target.");
  if (strategy.boundaries.source_pool_promotions !== 0 || strategy.boundaries.acquisition_authorized !== false || strategy.boundaries.production !== "HOLD") fail(errors, "Strategy fail-closed boundary violated.");

  for (const profile of strategy.core_domain_strategies) {
    if (profile.priority_source_families.length < 5) fail(errors, `${profile.core_domain_id}: insufficient Source-family strategy depth.`);
    if (profile.priority_roles.length < 5) fail(errors, `${profile.core_domain_id}: insufficient priority Source-role depth.`);
    if (profile.identity_focus.length < 5) fail(errors, `${profile.core_domain_id}: insufficient identity focus.`);
    if (profile.global_diversity_focus.length < 5) fail(errors, `${profile.core_domain_id}: insufficient global diversity focus.`);
    if (profile.dominant_risks.length < 4) fail(errors, `${profile.core_domain_id}: insufficient risk analysis.`);
    if (!profile.source_removal_requirement) fail(errors, `${profile.core_domain_id}: missing Source-removal requirement.`);
  }

  if (program.status !== "ACTIVE_P0" || program.version !== "2.0.0") fail(errors, "ASI Program v2 must be ACTIVE_P0.");
  if (program.supersedes.program_id !== "autonomous-source-intelligence-program-v1") fail(errors, "ASI Program v2 must explicitly supersede v1 for current execution.");
  if (program.source_target_policy.fixed_global_source_count !== null || program.source_target_policy.quantity_is_output_of_asi !== true) fail(errors, "ASI Program v2 must derive quantity autonomously.");
  if (program.operating_universe.scope_role_lanes !== 224 || program.immediate_execution.initial_total_candidate_assessments !== 4480) fail(errors, "ASI Program v2 execution counts are invalid.");
  if (program.engine_system.length < 10) fail(errors, "ASI Program v2 must define the complete engine system.");
  if (program.boundaries.source_pool_promotions !== 0 || program.boundaries.acquisition_authorized !== false || program.boundaries.production !== "HOLD") fail(errors, "ASI Program v2 fail-closed boundary violated.");

  return errors;
}

const errors = validateGlobalSourceAcquisitionStrategyV1();
if (errors.length) {
  console.error(`KIDULTS Global Source Acquisition and ASI Strategy v1: FAIL (${errors.length})`);
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}

console.log("KIDULTS Global Source Acquisition and ASI Strategy v1: PASS");
console.log("Core Domain strategies: 8 / 8");
console.log("Scope-role lanes / initial assessments: 224 / 4,480");
console.log("Fixed Source target: NONE / ADAPTIVE OUTCOME-DERIVED");
console.log("Source Pool promotions: 0; Acquisition: BLOCKED; Production: HOLD");
