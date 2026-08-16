import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const output = path.resolve(process.argv[2] ?? "artifacts/agci-os/dos-v1");
const errors = [];

function read(name) {
  try {
    return JSON.parse(fs.readFileSync(path.join(output, name), "utf8"));
  } catch (error) {
    errors.push(`${name}: ${error.message}`);
    return null;
  }
}

function assert(condition, message) {
  if (!condition) errors.push(message);
}

function unique(values) {
  return [...new Set(values)];
}

const decision = read("decision-library-v1.json");
const value = read("value-scope-library-v1.json");
const product = read("intelligence-product-library-v1.json");
const valueToMetric = read("value-to-metric-map-v1.json");
const metricToField = read("metric-to-data-field-map-v1.json");
const fieldToRole = read("data-field-to-source-role-map-v1.json");
const coverage = read("collection-scope-value-coverage-matrix-v1.json");
const gap = read("value-gap-register-v1.json");
const processMap = read("process-operating-map-v1.json");
const featurePolicy = read("feature-admission-policy-v1.json");
const manifest = read("run-manifest.json");

const requiredDecisionFields = [
  "decision_scope_id",
  "customer_segment",
  "decision_archetype_id",
  "decision_name",
  "decision_context",
  "decision_consequence",
  "irreplaceable_value_scope_ids",
  "intelligence_product_ids",
  "required_assertions",
  "required_metrics",
  "required_data_fields",
  "required_collection_scopes",
  "required_source_roles",
  "minimum_independent_source_families",
  "coverage_requirements",
  "confidence_model",
  "risk_and_limitations",
  "single_source_substitution_test",
  "single_provider_substitution_test",
  "source_removal_behavior",
  "publication_gate",
  "owner"
];

assert(manifest?.status === "DOS_FOUNDATION_PASS", "DOS run status must be DOS_FOUNDATION_PASS.");
assert(manifest?.customer_segments === 4, "DOS must represent four customer segments.");
assert(manifest?.value_scopes === 7, "DOS must represent seven Irreplaceable Value Scopes.");
assert(manifest?.decision_archetypes === 64, "DOS v1 must contain 64 reviewed decision archetypes.");
assert(manifest?.decision_scopes >= 400, "DOS v1 must compile at least 400 Decision DNA records.");
assert(manifest?.collection_scopes === 32, "DOS must map all 32 Collection Scopes.");
assert(manifest?.process_stages === 18, "DOS must align all 18 canonical process stages.");
assert(manifest?.structural_gap_count === 0, "DOS structural traceability gaps must be zero.");
assert(manifest?.market_claims_created === 0, "DOS foundation must create no market claims.");
assert(manifest?.indexes_computed === 0, "DOS foundation must compute no Indexes.");
assert(manifest?.candidate_r2_created === false, "DOS foundation must not create Candidate R2.");
assert(manifest?.public_projection === false, "DOS foundation must not create a public Projection.");
assert(manifest?.production === "HOLD", "DOS foundation Production must remain HOLD.");
assert(manifest?.digitalocean_commercial_state === "FOUNDER_CONFIRMED_CONTRACTED",
  "DigitalOcean commercial state must reflect the Founder-confirmed contract.");
assert(manifest?.digitalocean_technical_binding === "NOT_VERIFIED",
  "DigitalOcean technical binding must not be fabricated.");

assert(decision?.status === "DOS_FOUNDATION_COMPILED_OPERATIONAL_EVIDENCE_PENDING",
  "Decision Library status mismatch.");
assert(decision?.customer_segment_count === 4, "Decision Library customer segment count mismatch.");
assert(decision?.decision_archetype_count === 64, "Decision Library archetype count mismatch.");
assert(decision?.decision_scope_count === decision?.records?.length,
  "Decision Library record count mismatch.");
assert(decision?.decision_scope_count === manifest?.decision_scopes,
  "Decision Library and manifest decision counts differ.");
assert(decision?.decision_scope_count >= 400, "Decision Library is below the minimum Decision DNA floor.");
assert(decision?.collection_scope_count === 32, "Decision Library Collection Scope count mismatch.");
assert(decision?.actual_decision_accuracy === null && decision?.actual_decision_accuracy_status === "NOT_MEASURED",
  "Decision accuracy must remain null / NOT_MEASURED before outcome calibration.");
assert(decision?.candidate_r2 === "BLOCKED", "Candidate R2 must remain BLOCKED.");
assert(decision?.kidult_500 === "NOT_COMPUTED" && decision?.kidult_100 === "NOT_COMPUTED",
  "KIDULT 500 and KIDULT 100 must remain NOT_COMPUTED.");
assert(decision?.production === "HOLD", "Decision Library Production must remain HOLD.");

const decisionIds = new Set();
const representedSegments = new Set();
const representedValues = new Set();
const representedScopes = new Set();
const representedProducts = new Set();
const representedMetrics = new Set();
const representedFields = new Set();
const representedRoles = new Set();

for (const record of decision?.records ?? []) {
  assert(!decisionIds.has(record.decision_scope_id), `Duplicate decision_scope_id: ${record.decision_scope_id}`);
  decisionIds.add(record.decision_scope_id);
  for (const field of requiredDecisionFields) {
    assert(Object.hasOwn(record, field), `${record.decision_scope_id}: missing required field ${field}`);
  }
  assert(record.state === "STRUCTURALLY_COMPILED_EVIDENCE_NOT_EVALUATED",
    `${record.decision_scope_id}: decision state mismatch.`);
  assert(Array.isArray(record.irreplaceable_value_scope_ids) && record.irreplaceable_value_scope_ids.length > 0,
    `${record.decision_scope_id}: missing Value Scope linkage.`);
  assert(Array.isArray(record.intelligence_product_ids) && record.intelligence_product_ids.length > 0,
    `${record.decision_scope_id}: missing Intelligence Product linkage.`);
  assert(Array.isArray(record.required_assertions) && record.required_assertions.length > 0,
    `${record.decision_scope_id}: missing assertions.`);
  assert(Array.isArray(record.required_metrics) && record.required_metrics.length > 0,
    `${record.decision_scope_id}: missing metrics.`);
  assert(Array.isArray(record.required_data_fields) && record.required_data_fields.length > 0,
    `${record.decision_scope_id}: missing data fields.`);
  assert(Array.isArray(record.required_source_roles) && record.required_source_roles.length > 0,
    `${record.decision_scope_id}: missing Source Roles.`);
  assert(record.minimum_independent_source_families >= 3,
    `${record.decision_scope_id}: insufficient independent Source family floor.`);
  assert(record.actual_evidence_readiness === null && record.actual_evidence_readiness_status === "NOT_MEASURED",
    `${record.decision_scope_id}: evidence readiness must remain null / NOT_MEASURED.`);
  assert(record.actual_decision_accuracy === null && record.actual_decision_accuracy_status === "NOT_MEASURED",
    `${record.decision_scope_id}: decision accuracy must remain null / NOT_MEASURED.`);
  assert(record.publication_gate === "TRACK_B_VALIDATION_AND_FOUNDER_AUTHORIZATION_REQUIRED",
    `${record.decision_scope_id}: publication gate mismatch.`);
  assert(record.production === "HOLD", `${record.decision_scope_id}: Production must remain HOLD.`);

  representedSegments.add(record.customer_segment);
  record.irreplaceable_value_scope_ids.forEach(valueScope => representedValues.add(valueScope));
  record.required_collection_scopes.forEach(scope => representedScopes.add(scope));
  record.intelligence_product_ids.forEach(productId => representedProducts.add(productId));
  record.required_metrics.forEach(metric => representedMetrics.add(metric));
  record.required_data_fields.forEach(field => representedFields.add(field));
  record.required_source_roles.forEach(role => representedRoles.add(role));
}

assert(representedSegments.size === 4, "Decision Library does not represent all customer segments.");
assert(representedValues.size === 7, "Decision Library does not represent all Value Scopes.");
assert(representedScopes.size === 32, "Decision Library does not map all Collection Scopes.");
assert(representedProducts.size === product?.product_count, "Decision/Product traceability is incomplete.");

assert(value?.value_scope_count === 7 && value?.records?.length === 7,
  "Value Scope Library must contain seven records.");
for (const record of value?.records ?? []) {
  assert(record.decision_scope_count > 0, `${record.value_scope_id}: no linked Decision DNA records.`);
  assert(record.required_metrics.length > 0, `${record.value_scope_id}: metrics missing.`);
  assert(record.required_data_fields.length > 0, `${record.value_scope_id}: data fields missing.`);
  assert(record.required_source_roles.length > 0, `${record.value_scope_id}: Source Roles missing.`);
  assert(record.actual_value_performance === null && record.actual_value_performance_status === "NOT_MEASURED",
    `${record.value_scope_id}: actual Value performance must remain null / NOT_MEASURED.`);
}

assert(product?.product_count === product?.records?.length && product?.product_count >= 10,
  "Intelligence Product Library must contain the compiled product set.");
for (const record of product?.records ?? []) {
  assert(record.value_scope_ids.length > 0, `${record.intelligence_product_id}: Value Scope linkage missing.`);
  assert(record.decision_scope_count > 0, `${record.intelligence_product_id}: Decision linkage missing.`);
  assert(record.required_assertions.length > 0, `${record.intelligence_product_id}: assertions missing.`);
  assert(record.required_metrics.length > 0, `${record.intelligence_product_id}: metrics missing.`);
  assert(record.required_data_fields.length > 0, `${record.intelligence_product_id}: data fields missing.`);
  assert(record.required_source_roles.length > 0, `${record.intelligence_product_id}: Source Roles missing.`);
  assert(record.actual_customer_value === null && record.actual_customer_value_status === "NOT_MEASURED",
    `${record.intelligence_product_id}: customer Value must remain null / NOT_MEASURED.`);
}

assert(valueToMetric?.records?.length === 7, "Value-to-Metric Map must contain seven Value Scope records.");
const mapValueIds = new Set(valueToMetric?.records?.map(record => record.value_scope_id));
assert(mapValueIds.size === 7, "Value-to-Metric Map contains duplicate or missing Value Scope records.");
for (const record of valueToMetric?.records ?? []) {
  assert(record.metrics.length > 0, `${record.value_scope_id}: Value-to-Metric mapping is empty.`);
}

const metricFieldKeys = new Set();
for (const record of metricToField?.records ?? []) {
  const key = `${record.value_scope_id}:${record.metric_id}`;
  assert(!metricFieldKeys.has(key), `Duplicate Metric-to-Field mapping: ${key}`);
  metricFieldKeys.add(key);
  assert(record.data_fields.length > 0, `${key}: data field mapping is empty.`);
  assert(record.evidence_required === true, `${key}: Evidence must be required.`);
  assert(record.unsupported_state === "NOT_VERIFIED", `${key}: unsupported state must be NOT_VERIFIED.`);
}
assert(metricFieldKeys.size > 0, "Metric-to-Field Map is empty.");

const fieldRoleKeys = new Set();
for (const record of fieldToRole?.records ?? []) {
  assert(!fieldRoleKeys.has(record.data_field), `Duplicate Data Field mapping: ${record.data_field}`);
  fieldRoleKeys.add(record.data_field);
  assert(record.value_scope_ids.length > 0, `${record.data_field}: Value Scope linkage missing.`);
  assert(record.source_roles.length > 0, `${record.data_field}: Source Role linkage missing.`);
}
assert(fieldRoleKeys.size > 0, "Data Field-to-Source Role Map is empty.");

for (const metric of representedMetrics) {
  assert([...metricFieldKeys].some(key => key.endsWith(`:${metric}`)), `Decision metric is not mapped to fields: ${metric}`);
}
for (const field of representedFields) {
  assert(fieldRoleKeys.has(field), `Decision data field is not mapped to Source Roles: ${field}`);
}

assert(coverage?.collection_scope_count === 32 && coverage?.records?.length === 32,
  "Collection Scope Value Coverage Matrix must contain 32 scopes.");
const coverageScopeIds = new Set();
for (const record of coverage?.records ?? []) {
  assert(!coverageScopeIds.has(record.scope_id), `Duplicate Collection Scope coverage record: ${record.scope_id}`);
  coverageScopeIds.add(record.scope_id);
  assert(record.decision_scope_count > 0, `${record.scope_id}: no Decision DNA records mapped.`);
  assert(record.customer_segments.length === 4, `${record.scope_id}: all four customer segments must be represented.`);
  assert(record.value_scope_ids.length === 7, `${record.scope_id}: all seven Value Scopes must be represented.`);
  assert(record.structural_mapping_state === "PASS", `${record.scope_id}: structural mapping state mismatch.`);
  assert(record.source_pool_readiness === null && record.source_pool_readiness_status === "NOT_MEASURED",
    `${record.scope_id}: Source Pool readiness must remain null / NOT_MEASURED.`);
  assert(record.representative_sampling_readiness === null && record.representative_sampling_readiness_status === "NOT_MEASURED",
    `${record.scope_id}: sampling readiness must remain null / NOT_MEASURED.`);
  assert(record.actual_qualified_objects === null && record.actual_qualified_objects_status === "NOT_MEASURED",
    `${record.scope_id}: Qualified Object count must remain null / NOT_MEASURED.`);
}

assert(gap?.status === "STRUCTURAL_TRACEABILITY_PASS_OPERATIONAL_GAPS_ACTIVE",
  "Value Gap Register status mismatch.");
assert(gap?.structural_gap_count === 0 && gap?.structural_gaps?.length === 0,
  "Structural Value gaps must be zero.");
assert(gap?.operational_gap_count > 0, "Operational gaps must remain explicit.");
assert(gap?.operational_gaps?.includes("DIGITALOCEAN_TECHNICAL_BINDING_NOT_VERIFIED"),
  "DigitalOcean technical binding gap must remain explicit.");
assert(gap?.unknown_requirements_coerced_to_known === 0,
  "Unknown requirements must never be coerced to known.");
assert(gap?.default_unlinked_work_state === "HOLD_NOT_ALIGNED",
  "Unlinked work must default to HOLD_NOT_ALIGNED.");

assert(processMap?.process_stage_count === 18 && processMap?.records?.length === 18,
  "DOS Process Operating Map must contain 18 stages.");
for (const record of processMap?.records ?? []) {
  assert(record.value_input, `${record.stage}: Value input missing.`);
  assert(record.value_output, `${record.stage}: Value output missing.`);
  assert(record.quality_gate, `${record.stage}: quality gate missing.`);
  assert(record.failure_state?.startsWith("HOLD_"), `${record.stage}: failure state must fail closed.`);
  assert(record.audit_record, `${record.stage}: audit record missing.`);
  assert(record.owner, `${record.stage}: owner missing.`);
  assert(record.bypass_allowed === false, `${record.stage}: process bypass must be prohibited.`);
}

assert(featurePolicy?.default_state === "HOLD_NOT_ALIGNED",
  "Feature Admission default must be HOLD_NOT_ALIGNED.");
assert(featurePolicy?.unlinked_feature_state === "HOLD_NOT_ALIGNED",
  "Unlinked features must be held.");
for (const requiredField of requiredDecisionFields) {
  assert(featurePolicy?.required_fields?.includes(requiredField),
    `Feature Admission Policy missing Decision DNA field: ${requiredField}`);
}
assert(featurePolicy?.production === "HOLD", "Feature Admission Policy Production must remain HOLD.");

assert(unique(decision?.records?.map(record => record.customer_segment) ?? []).length === 4,
  "Decision records do not cover four unique customer segments.");
assert(unique(value?.records?.map(record => record.value_scope_id) ?? []).length === 7,
  "Value Scope records are not unique.");
assert(representedRoles.size >= 7, "Decision DNA does not cover the minimum Source Role diversity.");

if (errors.length) {
  console.error(`KIDULTS Decision Operating System v1: FAIL (${errors.length})`);
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}

console.log("KIDULTS Decision Operating System v1: PASS");
console.log(`Customer segments: ${manifest.customer_segments}`);
console.log(`Value Scopes: ${manifest.value_scopes}`);
console.log(`Intelligence Products: ${manifest.intelligence_products}`);
console.log(`Decision Archetypes: ${manifest.decision_archetypes}`);
console.log(`Decision DNA records: ${manifest.decision_scopes}`);
console.log(`Collection Scopes mapped: ${manifest.collection_scopes}`);
console.log(`Process stages aligned: ${manifest.process_stages}`);
console.log(`Structural gaps: ${manifest.structural_gap_count}`);
console.log(`Operational gaps disclosed: ${manifest.operational_gap_count}`);
console.log(`DigitalOcean: ${manifest.digitalocean_commercial_state} / ${manifest.digitalocean_technical_binding}`);
console.log("Unlinked feature or engine default: HOLD_NOT_ALIGNED");
console.log("Candidate R2: BLOCKED");
console.log("KIDULT 500 / KIDULT 100: NOT_COMPUTED");
console.log("Production: HOLD");
