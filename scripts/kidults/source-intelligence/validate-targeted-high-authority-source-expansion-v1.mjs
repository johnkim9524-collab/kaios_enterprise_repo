import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fingerprint, readJson, unique } from "./asi-discovery-common-v1.mjs";

const REQUIRED_FILES = [
  "targeted-high-authority-source-candidate-registry-v1.json",
  "targeted-source-expansion-coverage-v1.json",
  "targeted-high-authority-blind-top50-input-v1.json",
  "targeted-high-authority-source-preflight-queue-v1.json",
  "run-manifest.json"
];

const PROHIBITED = [
  /\b(todo|task manager|starter|boilerplate|demo app|sample app|awesome list|sdk example)\b/i,
  /\b(generic software repository|tangential research promoted)\b/i
];

function fail(errors, message) { errors.push(message); }
function uniqueCount(values) { return new Set(values).size; }

function validateFingerprints(outputs, errors) {
  for (const [name, value] of Object.entries(outputs)) {
    if (name === "run-manifest.json") continue;
    const copy = structuredClone(value);
    const stored = copy.fingerprint;
    delete copy.fingerprint;
    if (stored !== fingerprint(copy)) fail(errors, `${name}: fingerprint mismatch.`);
  }
}

export function validateTargetedSourceExpansion(directory) {
  const errors = [];
  const outputs = {};
  for (const name of REQUIRED_FILES) {
    const file = path.join(directory, name);
    if (!fs.existsSync(file)) fail(errors, `Missing required output: ${name}`);
    else outputs[name] = readJson(file);
  }
  if (errors.length) return errors;

  const registry = outputs["targeted-high-authority-source-candidate-registry-v1.json"];
  const coverage = outputs["targeted-source-expansion-coverage-v1.json"];
  const blind = outputs["targeted-high-authority-blind-top50-input-v1.json"];
  const preflight = outputs["targeted-high-authority-source-preflight-queue-v1.json"];
  const manifest = outputs["run-manifest.json"];

  if (registry.record_count !== 64 || registry.records.length !== 64) fail(errors, "Candidate registry must contain exactly 64 records.");
  if (uniqueCount(registry.records.map(record => record.source_id)) !== 64) fail(errors, "Source IDs must be unique.");
  if (uniqueCount(registry.records.map(record => record.official_endpoint)) !== 64) fail(errors, "Official endpoints must be unique.");

  const domains = unique(registry.records.map(record => record.core_domain));
  if (domains.length !== 8) fail(errors, `Expected 8 Core Domains, got ${domains.length}.`);
  for (const domain of domains) {
    const count = registry.records.filter(record => record.core_domain === domain).length;
    if (count < 8) fail(errors, `${domain}: expected at least 8 candidates, got ${count}.`);
  }

  for (const record of registry.records) {
    for (const field of ["collection_scope_ids", "source_roles", "customer_decision_archetypes", "irreplaceable_value_scope_ids", "evidence_references"]) {
      if (!Array.isArray(record[field]) || record[field].length === 0) fail(errors, `${record.source_id}: ${field} must be non-empty.`);
    }
    for (const field of ["display_name", "core_domain", "official_endpoint", "official_documentation_url", "authority_basis", "channel_type", "access_mode", "rights_state", "commercial_use_state", "verification_state", "next_gate"]) {
      if (!record[field]) fail(errors, `${record.source_id}: missing ${field}.`);
    }
    if (!/^https?:\/\//.test(record.official_endpoint)) fail(errors, `${record.source_id}: invalid official endpoint.`);
    if (!/^https?:\/\//.test(record.official_documentation_url)) fail(errors, `${record.source_id}: invalid documentation URL.`);
    if (PROHIBITED.some(pattern => pattern.test(JSON.stringify(record)))) fail(errors, `${record.source_id}: prohibited generic-source pattern detected.`);
    if (record.source_pool_promoted !== false || record.acquisition_authorized !== false || record.production !== "HOLD") {
      fail(errors, `${record.source_id}: fail-closed boundary violated.`);
    }
  }

  if (coverage.status !== "STRUCTURAL_COVERAGE_PASS_RELEVANCE_AND_RIGHTS_PENDING") fail(errors, `Unexpected coverage state: ${coverage.status}`);
  if (coverage.invalid_scope_link_count !== 0) fail(errors, "Invalid Collection Scope links must be zero.");
  for (const metric of ["explicit_scope_coverage", "explicit_source_role_coverage", "explicit_decision_linkage_coverage", "explicit_value_linkage_coverage", "official_endpoint_coverage", "documentation_reference_coverage"]) {
    if (coverage[metric] !== 1) fail(errors, `${metric} must equal 1.0.`);
  }

  if (blind.review_case_count !== 50 || blind.records.length !== 50) fail(errors, "Blind review input must contain 50 cases.");
  if (uniqueCount(blind.records.map(record => record.source_id)) !== 50) fail(errors, "Blind Top-50 Source IDs must be unique.");
  if (uniqueCount(blind.records.map(record => record.official_endpoint)) !== 50) fail(errors, "Blind Top-50 endpoints must be unique.");
  if (blind.core_domains_represented.length !== 8) fail(errors, "Blind Top-50 must represent all eight Core Domains.");
  if (blind.prior_rank_scores_included !== false || blind.prior_top50_labels_included !== false) fail(errors, "Blind input must omit previous scores and labels.");

  if (preflight.queue_count !== 64 || preflight.preflight_passes !== 0) fail(errors, "Preflight queue must contain 64 records and zero passes.");
  if (preflight.records.some(record => record.preflight_pass !== false || record.preflight_state !== "NOT_STARTED")) fail(errors, "No preflight may be passed or started.");

  if (manifest.status !== "TARGETED_SOURCE_EXPANSION_FOUNDATION_PASS" || manifest.candidate_count !== 64 || manifest.core_domain_count !== 8 || manifest.blind_top50_count !== 50) fail(errors, "Manifest counts or status are invalid.");
  if (manifest.source_pool_promotions !== 0 || manifest.preflight_passes !== 0 || manifest.implemented_adapters !== 0 || manifest.acquisition_authorized !== false || manifest.production !== "HOLD") fail(errors, "Manifest fail-closed boundary is invalid.");

  validateFingerprints(outputs, errors);
  const manifestCopy = structuredClone(manifest);
  const stored = manifestCopy.run_fingerprint;
  delete manifestCopy.run_fingerprint;
  if (stored !== fingerprint(manifestCopy)) fail(errors, "Run manifest fingerprint mismatch.");
  return errors;
}

const directory = path.resolve(process.argv[2] ?? "");
const errors = validateTargetedSourceExpansion(directory);
if (errors.length) {
  console.error(`KIDULTS Targeted High-Authority Source Expansion v1: FAIL (${errors.length})`);
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}
const manifest = readJson(path.join(directory, "run-manifest.json"));
console.log("KIDULTS Targeted High-Authority Source Expansion v1: PASS");
console.log(`Candidates / Core Domains / Blind Top-50: ${manifest.candidate_count} / ${manifest.core_domain_count} / ${manifest.blind_top50_count}`);
console.log("Source Pool promotions / Preflight PASS / Implemented adapters: 0 / 0 / 0");
console.log("Acquisition: BLOCKED; Production: HOLD");
