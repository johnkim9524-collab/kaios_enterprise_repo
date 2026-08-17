import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const errors = [];

function read(relative) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));
  } catch (error) {
    errors.push(`${relative}: ${error.message}`);
    return null;
  }
}

function assert(condition, message) {
  if (!condition) errors.push(message);
}

const adaptive = read("coordination/kidults/data-scope/category-adaptive-scale-floor-contract-v2.json");
const legacy = read("coordination/kidults/data-scope/category-1000-scale-contract-v1.json");
const strategy = read("coordination/kidults/strategy/agci-os-total-program-strategy-reset-v2.json");
const scopes = read("coordination/kidults/data-scope/collection-scope-registry-v1.json");

assert(adaptive?.status === "APPROVED_ACTIVE", "Adaptive scale contract must be active.");
assert(adaptive?.supersedes === legacy?.id, "Adaptive contract must supersede the original Category 1000 contract.");
assert(adaptive?.first_value === "AUTONOMOUS", "AUTONOMOUS must remain first.");
assert(adaptive?.governing_value === "IRREPLACEABLE_CUSTOMER_AND_INSTITUTIONAL_VALUE",
  "Scale must be governed by irreplaceable value.");

assert(adaptive?.scale_definition?.minimum_qualified_objects_per_category === 1000,
  "The category minimum floor must be exactly 1,000 qualified objects.");
assert(adaptive?.scale_definition?.minimum_qualified_objects_across_current_categories === 8000,
  "The current eight-category minimum floor must be 8,000.");
assert(adaptive?.scale_definition?.upper_cap === null,
  "Category scale must have no fabricated fixed upper cap.");
assert(adaptive?.scale_definition?.upper_cap_status === "NO_FIXED_CAP",
  "Category scale upper-cap state must be NO_FIXED_CAP.");
assert(adaptive?.scale_definition?.fixed_index_quota === false,
  "The category floor must not become an Index quota.");
assert(adaptive?.scale_definition?.category_floor_is_index_quota === false,
  "The 1,000 floor cannot be interpreted as an Index quota.");
assert(adaptive?.scale_definition?.collection_scope_planning_target_is_floor === false,
  "Per-Scope planning targets cannot become fixed floors.");
assert(adaptive?.scale_definition?.raw_record_volume_is_not_success_metric === true,
  "Raw record volume cannot be the success metric.");

assert(adaptive?.scale_governor?.engine === "AUTONOMOUS_CATEGORY_SCALE_GOVERNOR",
  "Adaptive scale governor is missing.");
assert(adaptive?.scale_governor?.minimum_gate === "CATEGORY_FLOOR_1000",
  "Scale governor minimum gate mismatch.");
assert(adaptive?.scale_governor?.numeric_stop_thresholds === null &&
  adaptive?.scale_governor?.numeric_stop_thresholds_status === "NOT_CALIBRATED",
  "Scale stop thresholds must not be fabricated before calibration.");
assert(adaptive?.scale_governor?.stop_rule ===
  "NO_CATEGORY_MAY_STOP_AT_1000_MERELY_BECAUSE_THE_FLOOR_WAS_REACHED",
  "The contract must explicitly prohibit stopping at 1,000 by count alone.");
for (const required of [
  "CUSTOMER_VALUE_PRODUCT_COVERAGE",
  "COLLECTION_SCOPE_BREADTH",
  "INDEPENDENT_SOURCE_ROLE_COVERAGE",
  "REGIONAL_COVERAGE",
  "TIME_DEPTH",
  "PRICE_BAND_COVERAGE",
  "CONDITION_AND_GRADE_COVERAGE",
  "BIAS_AND_MISSINGNESS",
  "FIELD_LEVEL_UNCERTAINTY",
  "PROVIDER_INCREMENTAL_VALUE",
  "MARGINAL_INTELLIGENCE_GAIN_PER_ACQUISITION_WAVE"
]) {
  assert(adaptive?.scale_governor?.inputs?.includes(required),
    `Scale governor input missing: ${required}`);
}

assert(Array.isArray(adaptive?.planning_waves?.waves) && adaptive.planning_waves.waves.length === 3,
  "Adaptive scale must contain Floor, Expansion and Global Leadership waves.");
assert(adaptive?.planning_waves?.waves?.[0]?.minimum_qualified_objects_per_category === 1000,
  "Floor wave must begin at 1,000.");
assert(adaptive?.planning_waves?.waves?.[1]?.minimum_status === "DYNAMIC_FROM_SCALE_GOVERNOR",
  "Expansion wave must be dynamically determined.");
assert(adaptive?.planning_waves?.waves?.[2]?.minimum_status === "DYNAMIC_NO_FIXED_CAP",
  "Global Leadership wave must have no fixed cap.");

assert(adaptive?.qualified_object_rule?.provider_record_alone_is_qualified_object === false,
  "A Provider record alone cannot be a Qualified Object.");
assert(adaptive?.qualified_object_rule?.raw_page_is_qualified_object === false,
  "A raw page cannot be a Qualified Object.");
assert(adaptive?.qualified_object_rule?.provider_id_is_canonical_id === false,
  "Provider IDs cannot become canonical IDs.");

assert(adaptive?.provider_and_self_collection?.provider_direct_to_portal === false,
  "Provider-to-Portal direct path must remain prohibited.");
assert(adaptive?.provider_and_self_collection?.provider_direct_to_index === false,
  "Provider-to-Index direct path must remain prohibited.");
assert(adaptive?.provider_and_self_collection?.provider_overwrites_self_collected_truth === false,
  "Provider data cannot overwrite self-collected truth.");

assert(adaptive?.program_effect?.category_1000_label === "MINIMUM_FLOOR_ONLY",
  "Category 1000 must be labeled as a minimum floor only.");
assert(adaptive?.program_effect?.total_8000_label === "MINIMUM_CURRENT_EIGHT_CATEGORY_FLOOR_ONLY",
  "8,000 must be labeled as the current eight-category floor only.");
assert(adaptive?.program_effect?.kidult_500 === "NOT_COMPUTED",
  "KIDULT 500 must remain NOT_COMPUTED.");
assert(adaptive?.program_effect?.kidult_100 === "NOT_COMPUTED",
  "KIDULT 100 must remain NOT_COMPUTED.");
assert(adaptive?.program_effect?.production === "HOLD", "Production must remain HOLD.");

assert(strategy?.scale_targets?.qualified_objects_per_category === 1000,
  "Existing strategy must still expose the original 1,000 planning floor.");
assert(scopes?.scope_count === 32 && scopes?.core_domain_count === 8,
  "Adaptive floor must remain anchored to the 32-Scope, eight-category foundation.");
assert(scopes?.common_contract?.per_scope_targets?.qualified_objects === 250,
  "Existing 250-per-Scope figure must remain a bootstrap planning allocation, not a fixed floor.");

if (errors.length) {
  console.error(`AGCI-OS Adaptive Category Scale Floor: FAIL (${errors.length})`);
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}

console.log("AGCI-OS Adaptive Category Scale Floor: PASS");
console.log("Minimum qualified objects per category: 1,000");
console.log("Current eight-category minimum: 8,000");
console.log("Upper cap: NONE / DYNAMIC");
console.log("Stop at 1,000 by count alone: PROHIBITED");
console.log("Next scale: Autonomous Category Scale Governor");
console.log("KIDULT 500 / KIDULT 100: NOT_COMPUTED");
console.log("Production: HOLD");
