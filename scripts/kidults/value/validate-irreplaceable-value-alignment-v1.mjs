import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const output = path.resolve(process.argv[2] ?? "artifacts/agci-os/irreplaceable-value-alignment-v1");
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

const engines = read("engine-alignment-matrix.json");
const features = read("feature-alignment-matrix.json");
const processes = read("process-alignment-matrix.json");
const readiness = read("alignment-readiness-report.json");
const manifest = read("run-manifest.json");

assert(manifest?.status === "IRREPLACEABLE_VALUE_ALIGNMENT_FOUNDATION_PASS",
  "Alignment run status mismatch.");
assert(engines?.engine_count > 0, "No engines registered for Value alignment.");
assert(engines?.engine_count === engines?.aligned_engine_count,
  "Every registered engine must be aligned.");
assert(engines?.unaligned_engine_count === 0, "Unaligned engines must be zero.");

for (const engine of engines?.engines ?? []) {
  assert(Array.isArray(engine.value_scope_ids) && engine.value_scope_ids.length > 0,
    `${engine.engine_id}: no Value Scope linkage.`);
  assert(engine.decision_advantage_created_or_protected,
    `${engine.engine_id}: no decision advantage statement.`);
  assert(engine.input_contract === "VERSIONED_AND_VALUE_TRACEABLE",
    `${engine.engine_id}: input contract is not Value traceable.`);
  assert(engine.output_contract === "EVIDENCE_LINEAGED_AND_VALUE_GATED",
    `${engine.engine_id}: output contract is not Value gated.`);
  assert(engine.evidence_and_lineage === "REQUIRED",
    `${engine.engine_id}: Evidence and lineage are not required.`);
  assert(engine.failure_state, `${engine.engine_id}: missing fail-closed state.`);
  assert(engine.deterministic_replay === true,
    `${engine.engine_id}: deterministic replay must be true.`);
  assert(engine.audit_output === "REQUIRED",
    `${engine.engine_id}: audit output must be required.`);
  assert(engine.alignment_state === "ALIGNED",
    `${engine.engine_id}: alignment state is not ALIGNED.`);
}

assert(features?.feature_family_count >= 10,
  "Core feature-family alignment coverage is incomplete.");
for (const feature of features?.features ?? []) {
  assert(Array.isArray(feature.customer_decisions) && feature.customer_decisions.length > 0,
    `${feature.feature_id}: no customer decision linkage.`);
  assert(Array.isArray(feature.value_scope_ids) && feature.value_scope_ids.length > 0,
    `${feature.feature_id}: no Value Scope linkage.`);
  assert(feature.irreplaceability_mechanism,
    `${feature.feature_id}: no irreplaceability mechanism.`);
  assert(Array.isArray(feature.required_evidence) && feature.required_evidence.length > 0,
    `${feature.feature_id}: no required Evidence.`);
  assert(Array.isArray(feature.substitution_test) && feature.substitution_test.length >= 6,
    `${feature.feature_id}: substitution tests incomplete.`);
  assert(feature.confidence_and_limitations === "MANDATORY",
    `${feature.feature_id}: confidence and limitations must be mandatory.`);
  assert(feature.source_removal_behavior === "FAIL_CLOSED_OR_EXPLICITLY_BOUNDED",
    `${feature.feature_id}: Source removal behavior mismatch.`);
  assert(feature.publication_gate,
    `${feature.feature_id}: publication gate missing.`);
  assert(feature.alignment_state === "ALIGNED",
    `${feature.feature_id}: alignment state is not ALIGNED.`);
}

assert(processes?.stage_count >= 18,
  "Canonical Value process stages are incomplete.");
for (const stage of processes?.stages ?? []) {
  assert(stage.value_input, `${stage.process_stage}: Value input missing.`);
  assert(stage.value_output, `${stage.process_stage}: Value output missing.`);
  assert(stage.quality_gate, `${stage.process_stage}: quality gate missing.`);
  assert(stage.failure_state, `${stage.process_stage}: failure state missing.`);
  assert(stage.audit_record, `${stage.process_stage}: audit record missing.`);
  assert(stage.owner, `${stage.process_stage}: owner missing.`);
  assert(stage.shortcut_allowed === false,
    `${stage.process_stage}: shortcuts must not be allowed.`);
}

assert(readiness?.north_star === "IRREPLACEABLE_CUSTOMER_AND_INSTITUTIONAL_DECISION_ADVANTAGE",
  "Irreplaceable Value North Star mismatch.");
assert(readiness?.feature_admission_default === "HOLD_NOT_ALIGNED",
  "Unaligned features must default to HOLD.");
assert(readiness?.work_without_value_scope === "HOLD",
  "Work without a Value Scope must be HOLD.");
assert(readiness?.digitalocean?.commercial_relationship_state === "FOUNDER_CONFIRMED_CONTRACTED",
  "DigitalOcean commercial relationship state mismatch.");
assert(readiness?.digitalocean?.technical_binding_state === "NOT_VERIFIED_IN_REPOSITORY",
  "DigitalOcean technical binding must not be fabricated.");
assert(readiness?.digitalocean?.current_mode === "READ_ONLY_OBSERVATION_AND_FOUNDATION",
  "DigitalOcean must remain read-only during foundation.");
assert(readiness?.candidate_r2?.startsWith("BLOCKED"),
  "Candidate R2 must remain blocked until Value and ASI gates pass.");
assert(readiness?.kidult_500 === "NOT_COMPUTED", "KIDULT 500 must remain not computed.");
assert(readiness?.kidult_100 === "NOT_COMPUTED", "KIDULT 100 must remain not computed.");
assert(readiness?.public_market_claim === "PROHIBITED",
  "Public market claims must remain prohibited.");
assert(readiness?.production === "HOLD", "Production must remain HOLD.");

assert(manifest?.unaligned_engine_count === 0, "Manifest reports unaligned engines.");
assert(manifest?.market_claims_created === 0, "Alignment work cannot create market claims.");
assert(manifest?.indexes_computed === 0, "Alignment work cannot compute Indexes.");
assert(manifest?.production_mutation === 0, "Alignment work cannot mutate Production.");
assert(manifest?.production === "HOLD", "Production must remain HOLD.");

if (errors.length) {
  console.error(`AGCI-OS Irreplaceable Value Alignment: FAIL (${errors.length})`);
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}

console.log("AGCI-OS Irreplaceable Value Alignment: PASS");
console.log(`Engines aligned: ${engines.engine_count}`);
console.log(`Feature families aligned: ${features.feature_family_count}`);
console.log(`Process stages aligned: ${processes.stage_count}`);
console.log("Default for unaligned work: HOLD");
console.log("DigitalOcean: CONTRACTED / TECHNICAL BINDING NOT VERIFIED / READ_ONLY");
console.log("KIDULT 500 / KIDULT 100: NOT_COMPUTED");
console.log("Production: HOLD");
