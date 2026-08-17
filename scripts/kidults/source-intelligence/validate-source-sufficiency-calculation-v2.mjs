import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import {
  fingerprint,
  readJson,
  stableJson,
  unique
} from "./asi-discovery-common-v1.mjs";
import { buildSourceSufficiencyCalculationV2 } from "./build-source-sufficiency-calculation-v2.mjs";

const REQUIRED_FILES = [
  "source-sufficiency-calculation-v2.json",
  "category-source-requirement-matrix-v2.json",
  "source-sufficiency-driver-linkage-v2.json",
  "source-sufficiency-sensitivity-v2.json",
  "global-source-sufficiency-admission-v2.json",
  "run-manifest.json"
];

function fail(errors, message) {
  errors.push(message);
}

function validateFingerprints(outputs, errors) {
  for (const [name, value] of Object.entries(outputs)) {
    if (name === "run-manifest.json") continue;
    const copy = structuredClone(value);
    const stored = copy.fingerprint;
    delete copy.fingerprint;
    if (stored !== fingerprint(copy)) fail(errors, `${name}: fingerprint mismatch.`);
  }
  const manifest = outputs["run-manifest.json"];
  const copy = structuredClone(manifest);
  const stored = copy.run_fingerprint;
  delete copy.run_fingerprint;
  if (stored !== fingerprint(copy)) fail(errors, "run-manifest.json: run fingerprint mismatch.");
}

function validateCategory(category, errors) {
  const requirements = category.active_family_requirements;
  const expectedActive = Math.max(
    requirements.PRODUCT_ROLE_COVERAGE,
    requirements.VALIDATED_EVIDENCE_VOLUME,
    requirements.MARKET_OBSERVATION_VOLUME,
    requirements.SOURCE_ROLE_DIVERSITY_FLOOR
  );
  if (requirements.required_active_independent_families !== expectedActive) {
    fail(errors, `${category.category_id}: active family requirement is not the maximum linked driver.`);
  }
  const reverse = category.reverse_calculated_requirement;
  if (!Number.isInteger(reverse.required_high_trust_independent_families) || reverse.required_high_trust_independent_families <= 0) {
    fail(errors, `${category.category_id}: invalid independent family requirement.`);
  }
  if (!Number.isInteger(reverse.required_verified_source_channels_min) || !Number.isInteger(reverse.required_verified_source_channels_max)) {
    fail(errors, `${category.category_id}: channel range must contain integers.`);
  }
  if (reverse.required_verified_source_channels_min > reverse.required_verified_source_channels_max) {
    fail(errors, `${category.category_id}: channel minimum exceeds maximum.`);
  }
  if (category.inputs.attrition.survival_rate <= 0 || category.inputs.attrition.survival_rate > 1) {
    fail(errors, `${category.category_id}: invalid survival rate.`);
  }
  if (!category.active_family_requirements.dominant_requirement_driver.length) {
    fail(errors, `${category.category_id}: dominant driver is missing.`);
  }
  if (category.source_pool_promoted !== false || category.acquisition_authorized !== false || category.production !== "HOLD") {
    fail(errors, `${category.category_id}: fail-closed boundary violated.`);
  }
}

export function validateSourceSufficiencyCalculationV2(directory) {
  const errors = [];
  const outputs = {};
  for (const name of REQUIRED_FILES) {
    const file = path.join(directory, name);
    if (!fs.existsSync(file)) fail(errors, `Missing output: ${name}`);
    else outputs[name] = readJson(file);
  }
  if (errors.length) return errors;

  const expected = buildSourceSufficiencyCalculationV2();
  for (const name of REQUIRED_FILES) {
    if (stableJson(outputs[name]) !== stableJson(expected[name])) {
      fail(errors, `${name}: output does not match linked recalculation from current inputs.`);
    }
  }

  const calculation = outputs["source-sufficiency-calculation-v2.json"];
  const matrix = outputs["category-source-requirement-matrix-v2.json"];
  const linkage = outputs["source-sufficiency-driver-linkage-v2.json"];
  const sensitivity = outputs["source-sufficiency-sensitivity-v2.json"];
  const admission = outputs["global-source-sufficiency-admission-v2.json"];
  const manifest = outputs["run-manifest.json"];
  const baseline = calculation.baseline;

  if (calculation.interpretation.calculated_requirement_is_fixed_global_target !== false) {
    fail(errors, "Calculated requirement must not be represented as a fixed global target.");
  }
  if (calculation.interpretation.recalculation_required_when_any_linked_driver_changes !== true) {
    fail(errors, "Any linked driver change must trigger recalculation.");
  }
  if (baseline.category_count !== baseline.categories.length || matrix.category_count !== matrix.records.length) {
    fail(errors, "Category count must equal the current profile record count.");
  }
  if (unique(baseline.categories.map(category => category.category_id)).length !== baseline.category_count) {
    fail(errors, "Category IDs must be unique.");
  }
  for (const category of baseline.categories) validateCategory(category, errors);

  const categoryFamilySum = baseline.categories.reduce(
    (sum, category) => sum + category.reverse_calculated_requirement.required_high_trust_independent_families,
    0
  );
  if (categoryFamilySum !== baseline.gross_independent_family_requirement) {
    fail(errors, "Gross family requirement does not equal category sum.");
  }
  if (baseline.global_unique_independent_family_requirement <= 0) {
    fail(errors, "Global unique family requirement must be positive.");
  }
  if (baseline.global_verified_source_channels_min > baseline.global_verified_source_channels_max) {
    fail(errors, "Global channel range is inverted.");
  }
  if (matrix.totals.global_unique_independent_family_requirement !== baseline.global_unique_independent_family_requirement) {
    fail(errors, "Category matrix and calculation disagree on global family requirement.");
  }
  if (!linkage.linked_drivers.length || !linkage.automatic_recalculation_events.length) {
    fail(errors, "Driver linkage or automatic recalculation events are missing.");
  }
  const scenarioIds = unique(sensitivity.records.map(record => record.scenario_id));
  if (scenarioIds.length !== sensitivity.records.length || sensitivity.records.length < 5) {
    fail(errors, "Sensitivity scenarios are missing or duplicated.");
  }
  if (!sensitivity.records.some(record => record.scenario_id === "FULL_SEVEN_ROLE_COVERAGE")) {
    fail(errors, "Full seven-role coverage scenario is required.");
  }
  if (!sensitivity.records.some(record => record.scenario_id === "ATTRITION_PLUS_10_POINTS")) {
    fail(errors, "Attrition stress scenario is required.");
  }
  if (admission.global_market_poc_admitted !== false || admission.acquisition_authorized !== false || admission.production !== "HOLD") {
    fail(errors, "Admission must remain fail-closed pending empirical ASI calibration.");
  }
  if (manifest.fixed_global_source_target !== null || manifest.empirical_calibration_complete !== false) {
    fail(errors, "Manifest must preserve adaptive target and incomplete empirical calibration state.");
  }
  if (manifest.category_count !== baseline.category_count || manifest.total_representative_products !== baseline.total_representative_products) {
    fail(errors, "Manifest driver totals do not match baseline calculation.");
  }
  if (manifest.calculated_independent_source_families !== baseline.global_unique_independent_family_requirement) {
    fail(errors, "Manifest independent family requirement mismatch.");
  }
  if (manifest.source_pool_promotions !== 0 || manifest.acquisition_authorized !== false || manifest.production !== "HOLD") {
    fail(errors, "Manifest fail-closed boundary violated.");
  }

  validateFingerprints(outputs, errors);
  return errors;
}

const directory = path.resolve(process.argv[2] ?? "");
const errors = validateSourceSufficiencyCalculationV2(directory);
if (errors.length) {
  console.error(`KIDULTS Source Sufficiency Calculation v2: FAIL (${errors.length})`);
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}
const manifest = readJson(path.join(directory, "run-manifest.json"));
console.log("KIDULTS Source Sufficiency Calculation v2: PASS");
console.log(`Categories / Representative Products: ${manifest.category_count} / ${manifest.total_representative_products}`);
console.log(`Evidence / Market targets: ${manifest.total_target_validated_evidence_assertions} / ${manifest.total_target_market_observations}`);
console.log(`Calculated independent families: ${manifest.calculated_independent_source_families}`);
console.log(`Calculated verified channels: ${manifest.calculated_verified_source_channels_min}–${manifest.calculated_verified_source_channels_max}`);
console.log("Linked drivers: ACTIVE; Fixed global Source target: NONE; Production: HOLD");
