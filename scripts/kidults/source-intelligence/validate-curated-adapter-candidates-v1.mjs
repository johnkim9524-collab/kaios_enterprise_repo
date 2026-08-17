import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const directory = path.resolve(process.argv[2] ?? "artifacts/agci-os/asi-discovery-batch-001");
const queue = JSON.parse(fs.readFileSync(path.join(directory, "adapter-contract-queue.json"), "utf8"));
const manifest = JSON.parse(fs.readFileSync(path.join(directory, "batch-run-manifest.json"), "utf8"));
const errors = [];
const assert = (condition, message) => { if (!condition) errors.push(message); };

assert(queue.version === "1.1.1", "Curated adapter queue version must be 1.1.1.");
assert(queue.candidate_selection_policy === "STRONG_VERIFICATION_THEN_MACHINE_ACCESS_FROM_TRUSTED_SOURCE_REGISTRY",
  "Adapter candidates must prefer strongly verified, machine-readable Trusted Source seeds.");
assert(queue.raw_search_result_auto_promotion === false,
  "Raw search results must never be auto-promoted to adapter candidates.");
assert(queue.candidate_count === 8, "Exactly one curated adapter candidate is required for each Core Domain.");
assert(new Set(queue.records.map(record => record.core_domain_id)).size === 8,
  "Curated adapter candidates must cover eight unique Core Domains.");
assert(new Set(queue.records.map(record => record.source_id)).size === 8,
  "Curated adapter candidates must use eight distinct Source candidates.");
assert(queue.records.every(record => record.source_origin === "TRUSTED_SOURCE_REGISTRY"),
  "Every adapter candidate must retain Trusted Source Registry origin.");
assert(queue.records.every(record => record.strong_verification_state === true),
  "Every adapter candidate must have OFFICIAL_EVIDENCE_VERIFIED or BOUNDED_LIVE_SAMPLE_PASSED state.");
assert(queue.records.every(record => ["OFFICIAL_EVIDENCE_VERIFIED", "BOUNDED_LIVE_SAMPLE_PASSED"].includes(record.verification_state)),
  "Adapter candidate verification state is outside the approved strong set.");
assert(queue.records.every(record => record.request_budget === 0 && record.schema_contract === "NOT_VERIFIED"),
  "Curated candidates must remain zero-budget and schema-unverified until preflight passes.");
assert(queue.records.every(record => record.acquisition_authorized === false && record.production === "HOLD"),
  "Curated candidates cannot authorize acquisition or Production.");
assert(manifest.adapter_candidate_selection === queue.candidate_selection_policy,
  "Manifest must record the curated adapter selection policy.");
assert(manifest.raw_search_result_auto_promotion === false,
  "Manifest must prohibit raw search result auto-promotion.");
assert(Boolean(manifest.inputs?.trusted_source_registry),
  "Manifest must fingerprint the Trusted Source Registry input.");

if (errors.length) {
  console.error(`KIDULTS Curated Adapter Candidate Gate: FAIL (${errors.length})`);
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}

console.log("KIDULTS Curated Adapter Candidate Gate: PASS");
console.log("Core Domains / distinct Sources: 8 / 8");
console.log("Origin: TRUSTED_SOURCE_REGISTRY");
console.log("Strong verification: 8 / 8");
console.log("Raw search auto-promotion: false");
console.log("Preflight passes / implemented adapters: 0 / 0");
console.log("Acquisition: BLOCKED");
console.log("Production: HOLD");
