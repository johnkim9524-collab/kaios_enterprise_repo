import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const directory = path.resolve(process.argv[2] ?? "artifacts/agci-os/asi-discovery-batch-001");
const errors = [];

function read(name) {
  try {
    return JSON.parse(fs.readFileSync(path.join(directory, name), "utf8"));
  } catch (error) {
    errors.push(`${name}: ${error.message}`);
    return null;
  }
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function fingerprint(value) {
  return `sha256:${crypto.createHash("sha256").update(stableJson(value)).digest("hex")}`;
}

function verifyFingerprint(value, field, name) {
  if (!value) return;
  const clone = structuredClone(value);
  const recorded = clone[field];
  delete clone[field];
  if (recorded !== fingerprint(clone)) errors.push(`${name}: ${field} mismatch.`);
}

function assert(condition, message) {
  if (!condition) errors.push(message);
}

const raw = read("raw-discovery-snapshot.json");
const universe = read("global-source-universe-batch-001.json");
const dedup = read("endpoint-deduplication-report.json");
const classification = read("source-classification-report.json");
const coverage = read("scope-role-coverage-matrix.json");
const utility = read("source-utility-scorecard.json");
const risk = read("source-risk-register.json");
const preflight = read("rights-access-cost-preflight.json");
const adapters = read("adapter-contract-queue.json");
const priority = read("acquisition-priority-plan.json");
const manifest = read("batch-run-manifest.json");

verifyFingerprint(raw, "snapshot_fingerprint", "raw-discovery-snapshot.json");
for (const [name, value] of [
  ["global-source-universe-batch-001.json", universe],
  ["endpoint-deduplication-report.json", dedup],
  ["source-classification-report.json", classification],
  ["scope-role-coverage-matrix.json", coverage],
  ["source-utility-scorecard.json", utility],
  ["source-risk-register.json", risk],
  ["rights-access-cost-preflight.json", preflight],
  ["adapter-contract-queue.json", adapters],
  ["acquisition-priority-plan.json", priority]
]) verifyFingerprint(value, "fingerprint", name);
verifyFingerprint(manifest, "run_fingerprint", "batch-run-manifest.json");

assert(raw?.status === "IMMUTABLE_LIVE_METADATA_SNAPSHOT", "Raw discovery snapshot state mismatch.");
assert(raw?.content_acquired === false, "Live discovery must not acquire content.");
assert(raw?.acquisition_authorized === false, "Raw discovery must not authorize acquisition.");
assert(raw?.production === "HOLD", "Raw discovery Production must remain HOLD.");
assert((raw?.raw_record_count ?? 0) === (raw?.records?.length ?? -1), "Raw record count mismatch.");
assert(Object.values(raw?.discovery_provider_counts ?? {}).filter(value => Number(value) > 0).length >= 2,
  "At least two discovery providers must return metadata records.");

assert(manifest?.status === "ASI_DISCOVERY_BATCH_001_TARGET_PASS",
  `Batch 1 must reach target; observed ${manifest?.status ?? "MISSING"}.`);
assert((manifest?.unique_source_endpoints ?? 0) >= 2000,
  "Unique Source endpoint discovery must reach at least 2,000.");
assert(manifest?.basic_classification_coverage === 1,
  "Basic classification coverage must be 100%.");
assert(manifest?.mandatory_lanes_with_candidate_coverage === 224,
  "All 224 mandatory Scope x Source-role lanes must have candidate coverage.");
assert(manifest?.mandatory_lane_count === 224, "Mandatory lane count must be 224.");
assert((manifest?.deep_assessments ?? 0) >= 200, "Deep assessment selection must contain at least 200 records.");
assert((manifest?.preflight_records ?? 0) >= 50, "Preflight register must contain at least 50 records.");
assert((manifest?.adapter_contract_candidates ?? 0) >= 8, "Adapter contract queue must contain at least 8 candidates.");
assert(manifest?.preflight_passes === 0,
  "Metadata discovery must not falsely claim a rights/access preflight pass.");
assert(manifest?.implemented_adapters === 0,
  "Metadata discovery must not falsely claim implemented adapters.");
assert(manifest?.discovery_executed === true, "Discovery execution must be recorded.");
assert(manifest?.content_acquired === false, "Content acquisition must remain false.");
assert(manifest?.acquisition_authorized === false, "Acquisition must remain blocked.");
assert(manifest?.market_claims_created === 0, "Discovery cannot create market claims.");
assert(manifest?.candidate_r2_created === false, "Discovery cannot create Candidate R2.");
assert(manifest?.indexes_computed === 0, "Discovery cannot compute Indexes.");
assert(manifest?.public_projection === false, "Discovery cannot create public Projection.");
assert(manifest?.production === "HOLD", "Production must remain HOLD.");

assert(universe?.unique_endpoint_count === manifest?.unique_source_endpoints,
  "Universe and manifest unique endpoint counts must match.");
assert(universe?.basic_classification_coverage === 1,
  "Universe classification coverage must be 100%.");
assert(universe?.records?.every(record => record.scope_relevance_state === "QUERY_MATCH_PRELIMINARY"),
  "Live discovery must not represent query matches as validated Scope relevance.");
assert(universe?.records?.every(record => record.acquisition_authorized === false),
  "No discovered Source may authorize acquisition.");
assert(universe?.records?.every(record => record.provider_direct_to_portal === false && record.provider_direct_to_index === false),
  "No discovered Source may have a direct Portal or Index path.");

assert(dedup?.final_duplicate_endpoint_id_count === 0, "Final endpoint IDs must be unique.");
assert(dedup?.final_duplicate_normalized_url_count === 0, "Final normalized endpoint URLs must be unique.");
assert(dedup?.owner_and_lineage_independence_not_inferred === true,
  "Endpoint deduplication must not infer Source independence.");

assert(classification?.classification_coverage === 1, "Classification report coverage must be 100%.");
assert(classification?.unknown_risk_coerced_to_low === 0,
  "Unknown risk must never be coerced to low risk.");
assert(classification?.records?.every(record =>
  Array.isArray(record.discovery_provenance) && record.discovery_provenance.length > 0),
  "Every classified endpoint must retain discovery provenance.");

assert(coverage?.mandatory_lane_count === 224, "Coverage matrix must contain 224 mandatory lanes.");
assert(coverage?.lanes_with_candidate_coverage === 224,
  "Coverage matrix must show candidate coverage for all 224 lanes.");
assert(coverage?.source_pools_ready === 0,
  "Discovery candidate coverage must not be promoted to Source Pool readiness.");
assert(coverage?.scope_relevance_validated === false,
  "Scope relevance must remain unvalidated after query-match discovery.");

assert((utility?.deep_assessments?.length ?? 0) >= 200,
  "Utility scorecard must include 200 preliminary deep assessments.");
assert(utility?.empirical_market_utility_calibrated === false,
  "Structural utility scoring must not be represented as empirical market utility.");
assert(risk?.unknown_risk_coerced_to_low === 0,
  "Risk register must preserve unknown risk.");
assert(risk?.records?.every(record => record.risk_classification !== "LOW"),
  "No Source may be classified LOW risk by default.");

assert(preflight?.preflight_record_count >= 50, "Preflight output must contain at least 50 records.");
assert(preflight?.preflight_pass_count === 0,
  "Preflight records must remain not passed until official terms and access review.");
assert(preflight?.records?.every(record => record.acquisition_authorized === false),
  "Preflight records cannot authorize acquisition.");
assert(adapters?.candidate_count >= 8, "Adapter queue must contain at least eight candidates.");
assert(adapters?.implemented_adapter_count === 0,
  "Adapter candidates cannot be represented as implemented adapters.");
assert(adapters?.records?.every(record => record.request_budget === 0 && record.acquisition_authorized === false),
  "Adapter candidates must remain zero-budget and acquisition-blocked.");
assert(priority?.acquisition_authorized === false,
  "Priority plan cannot authorize acquisition.");
assert(priority?.market_claim_authorized === false,
  "Priority plan cannot authorize market claims.");

if (errors.length) {
  console.error(`KIDULTS ASI Discovery Batch 001: FAIL (${errors.length})`);
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}

console.log("KIDULTS ASI Discovery Batch 001: PASS");
console.log(`Raw / unique endpoints: ${manifest.raw_records} / ${manifest.unique_source_endpoints}`);
console.log(`Mandatory lane coverage: ${manifest.mandatory_lanes_with_candidate_coverage} / ${manifest.mandatory_lane_count}`);
console.log(`Deep / preflight / adapter candidates: ${manifest.deep_assessments} / ${manifest.preflight_records} / ${manifest.adapter_contract_candidates}`);
console.log(`Provider errors: ${manifest.provider_errors}`);
console.log("Preflight passes / implemented adapters: 0 / 0 — truthful boundary preserved");
console.log("Acquisition: BLOCKED");
console.log("KIDULT 500 / KIDULT 100: NOT_COMPUTED");
console.log("Production: HOLD");
