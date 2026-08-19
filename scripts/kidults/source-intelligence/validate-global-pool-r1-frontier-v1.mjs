import assert from "node:assert/strict";
import {
  assertCompiledGlobalPoolR1Frontier,
  compileGlobalPoolR1Frontier,
  fingerprint,
  loadGlobalPoolR1Inputs
} from "./compile-global-pool-r1-frontier-v1.mjs";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function resignUniverse(output) {
  const { universe_fingerprint: ignored, ...unsigned } = output;
  output.universe_fingerprint = fingerprint(unsigned);
  return output;
}

const baselineInputs = loadGlobalPoolR1Inputs();
const first = compileGlobalPoolR1Frontier(baselineInputs);
const second = compileGlobalPoolR1Frontier(loadGlobalPoolR1Inputs());

assert.equal(first.universe_fingerprint, second.universe_fingerprint, "Repeated compiles must be byte-semantically deterministic.");
assert.equal(first.scope_count, 32);
assert.equal(first.source_role_count, 7);
assert.equal(first.region_count, 12);
assert.equal(first.region_language_pair_count, 48);
assert.equal(first.frontier_candidate_count, 10_752);
assert.equal(first.frontier_candidate_count, first.scope_count * first.source_role_count * first.region_language_pair_count);
assert.equal(first.frontier_candidate_count_is_a_derived_coverage_intersection_not_a_site_target, true);
assert.equal(first.numeric_site_target, null);
assert.equal(first.unique_site_count, null);
assert.equal(first.source_pool_eligible_site_count, 0);
assert.equal(first.acquisition_authorized, false);
assert.equal(first.market_claim_authorized, false);
assert.equal(first.production, "HOLD");

const contractMutations = [
  ["numeric site quota", value => { value.contract.frontier_semantics.numeric_site_target = 250; }, /Numeric site targets are prohibited/],
  ["closed frontier", value => { value.contract.frontier_semantics.open_ended = false; }, /must be open-ended/],
  ["premature initial state", value => { value.contract.frontier_semantics.candidate_capture_state = "RIGHTS_CLEARED"; }, /CANDIDATE_CAPTURE_PENDING/],
  ["candidate counted as site", value => { value.contract.frontier_semantics.one_candidate_is_one_site = true; }, /must not be counted as a site/],
  ["URL clears rights", value => { value.contract.seed_record_contract.url_observation_rights_effect = "ALLOW"; }, /URL must not clear source rights/],
  ["URL authorizes collection", value => { value.contract.seed_record_contract.url_observation_collection_effect = "ALLOW"; }, /URL must not authorize collection/],
  ["query match promoted", value => { value.contract.seed_record_contract.query_or_keyword_match_relevance_effect = "PASS"; }, /candidate-only/],
  ["Scope removed", value => { value.scopeRegistry.scopes.pop(); }, /Expected 32 canonical current Scopes/],
  ["role removed", value => { value.globalSourceUniverse.required_source_roles.pop(); }, /Expected seven required source roles/],
  ["region removed", value => { value.globalSourceUniverse.geographic_regions.pop(); }, /Expected 12 global regions/],
  ["language frontier reduced", value => { value.globalSourceUniverse.geographic_regions[0].language_codes.pop(); }, /48 region-language pairs/],
  ["unknown rights adapter", value => { value.globalSourceUniverse.promotion_boundaries.unknown_rights_authorizes_adapter = true; }, /Unknown rights must not authorize adapters/],
  ["discovery authorizes collection", value => { value.globalSourceUniverse.promotion_boundaries.discovery_authorizes_content_collection = true; }, /Discovery must not authorize collection/],
  ["channel traversal enabled", value => { value.contract.seed_channel_taxonomy[0].target_site_traversal_authorized = true; }, /target-site traversal blocked/],
  ["channel fleet collapsed", value => { value.contract.seed_channel_taxonomy[1].processor_fleet_id = value.contract.seed_channel_taxonomy[0].processor_fleet_id; }, /independent discovery fleet/],
  ["optional provider made mandatory", value => { value.contract.seed_channel_taxonomy.at(-1).provider_is_optional = false; }, /must remain optional/],
  ["provider gate removed", value => { value.contract.seed_channel_taxonomy.at(-1).activation_gate = "NONE"; }, /necessity and contractual-rights gates/],
  ["museum sold role", value => {
    value.contract.source_family_semantic_boundaries
      .find(boundary => boundary.source_family === "MUSEUM_OR_INSTITUTIONAL_CONTEXT")
      .allowed_candidate_roles.push("SOLD_TRANSACTION");
  }, /must not contain a core market-event role/],
  ["museum demand claim", value => {
    value.contract.source_family_semantic_boundaries
      .find(boundary => boundary.source_family === "MUSEUM_OR_INSTITUTIONAL_CONTEXT")
      .demand_or_liquidity_claim_authorized = true;
  }, /cannot authorize demand or liquidity/]
];

for (const [name, mutate, expected] of contractMutations) {
  const mutated = clone(baselineInputs);
  mutate(mutated);
  assert.throws(() => compileGlobalPoolR1Frontier(mutated), expected, `${name} mutation must fail closed.`);
}

const outputMutations = [
  ["frontier promoted", value => { value.status = "READY"; }, /CANDIDATE_CAPTURE_PENDING/],
  ["site target introduced", value => { value.numeric_site_target = 250; }, /quota-free/],
  ["site count inferred", value => { value.unique_site_count = 1; }, /unknown before capture/],
  ["source pool inferred", value => { value.source_pool_eligible_site_count = 1; }, /No source-pool eligibility/],
  ["candidate rights inferred", value => { value.candidates[0].rights_state = "ALLOW"; }, /cannot clear rights/],
  ["candidate advanced", value => { value.candidates[0].capture_state = "DISCOVERY_METADATA_OBSERVED"; }, /prematurely advanced/],
  ["host invented", value => { value.candidates[0].canonical_site_host = "unobserved.example"; }, /host identity cannot exist before capture/],
  ["acquisition enabled", value => { value.candidates[0].acquisition_authorized = true; }, /acquisition cannot be authorized/],
  ["market claim enabled", value => { value.candidates[0].market_claim_authorized = true; }, /market claims cannot be authorized/],
  ["production enabled", value => { value.candidates[0].production = "ACTIVE"; }, /escaped SHADOW\/HOLD boundary/]
];

for (const [name, mutate, expected] of outputMutations) {
  const mutated = clone(first);
  mutate(mutated);
  resignUniverse(mutated);
  assert.throws(
    () => assertCompiledGlobalPoolR1Frontier(mutated, baselineInputs),
    expected,
    `${name} output mutation must fail closed.`
  );
}

console.log("KIDULTS Global Pool R1 frontier validator: PASS");
console.log("Determinism: PASS (two independent compiles share one universe fingerprint)");
console.log("Canonical coverage: 32 Scopes x 7 roles x 48 region-language pairs = 10,752 capture candidates");
console.log("The derived candidate count is not a site target or a completeness claim.");
console.log(`Negative controls: ${contractMutations.length} input mutations + ${outputMutations.length} output mutations`);
console.log("Museum/institutional context: excluded from listing, sold-transaction, authentication/condition market roles");
console.log("URL-only rights: prohibited; acquisition/publication: blocked; Production: HOLD");
