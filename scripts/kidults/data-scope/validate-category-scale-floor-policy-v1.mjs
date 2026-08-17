import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const policyPath = path.join(
  root,
  "coordination",
  "kidults",
  "data-scope",
  "category-scale-floor-policy-v1.json"
);

const errors = [];

function assert(condition, message) {
  if (!condition) errors.push(message);
}

let policy;
try {
  policy = JSON.parse(fs.readFileSync(policyPath, "utf8"));
} catch (error) {
  console.error(`Category Scale Floor Policy: FAIL (read error: ${error.message})`);
  process.exit(1);
}

assert(policy.status === "APPROVED_ACTIVE", "Policy must be APPROVED_ACTIVE.");
assert(policy.first_value === "AUTONOMOUS", "AUTONOMOUS must remain first.");
assert(
  policy.governing_rule === "CATEGORY_1000_IS_A_MINIMUM_ADMISSION_FLOOR_NOT_A_COMPLETION_TARGET_OR_CAP",
  "Category 1000 must be a minimum floor, not a target or cap."
);
assert(policy.floor_definition?.minimum_qualified_objects_per_category === 1000,
  "Minimum qualified-object floor must be 1,000 per category.");
assert(policy.floor_definition?.minimum_total_qualified_objects === 8000,
  "Eight-category minimum floor must total 8,000.");
assert(policy.floor_definition?.upper_cap === null,
  "Category scale must have no fixed upper cap.");
assert(policy.scope_allocation_policy?.previous_250_per_scope_value === "BOOTSTRAP_PLANNING_SEED_ONLY",
  "The previous 250-per-Scope value must be planning-only.");
assert(policy.scope_allocation_policy?.fixed_scope_quota === false,
  "Collection Scopes must not use fixed quotas.");
assert(policy.scope_allocation_policy?.dynamic_reallocation_required === true,
  "Scope allocation must be dynamically rebalanced.");

const levels = Object.fromEntries((policy.scale_ladder ?? []).map(item => [item.level, item]));
assert(levels.L1_MINIMUM_MARKET_POC_FLOOR?.qualified_objects_per_category_minimum === 1000,
  "L1 floor must be 1,000.");
assert(levels.L2_OPERATIONAL_DEPTH?.qualified_objects_per_category_minimum === 5000,
  "L2 operational depth must be 5,000.");
assert(levels.L3_GLOBAL_LEADERSHIP_DEPTH?.qualified_objects_per_category_minimum === 10000,
  "L3 leadership depth must be 10,000.");
assert(levels.L4_ADAPTIVE_UNIVERSE?.minimum_status === "COVERAGE_DRIVEN_NO_FIXED_CAP",
  "L4 must be adaptive and uncapped.");

assert(policy.provider_scale_rule?.provider_data_counts_only_after_fusion_gates === true,
  "Provider data may count only after Fusion gates.");
assert(policy.provider_scale_rule?.provider_id_as_canonical_id === false,
  "Provider IDs cannot become Canonical IDs.");
assert(policy.provider_scale_rule?.provider_direct_to_portal === false,
  "Provider-to-Portal direct paths must remain zero.");
assert(policy.provider_scale_rule?.provider_direct_to_index === false,
  "Provider-to-Index direct paths must remain zero.");
assert(policy.current_state?.actual_qualified_objects_per_category === null,
  "Unknown actual category counts must remain null.");
assert(policy.current_state?.actual_qualified_objects_status === "NOT_MEASURED",
  "Unknown actual category counts must be NOT_MEASURED.");
assert(policy.current_state?.public_index === "NOT_COMPUTED",
  "Public Index must remain NOT_COMPUTED.");
assert(policy.current_state?.production === "HOLD",
  "Production must remain HOLD.");

if (errors.length) {
  console.error(`Category Scale Floor Policy: FAIL (${errors.length})`);
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}

console.log("Category Scale Floor Policy: PASS");
console.log("Category 1000: MINIMUM FLOOR");
console.log("L2 Operational Depth: 5,000 per category");
console.log("L3 Global Leadership Depth: 10,000 per category");
console.log("L4: Coverage-driven / no fixed cap");
console.log("Current actual counts: null / NOT_MEASURED");
console.log("KIDULT 500 / KIDULT 100: NOT_COMPUTED");
console.log("Production: HOLD");
