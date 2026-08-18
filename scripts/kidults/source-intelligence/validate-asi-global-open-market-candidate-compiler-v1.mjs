import assert from "node:assert/strict";
import { compileCandidates, normalizeSite } from "./compile-asi-global-open-market-candidates-v1.mjs";
import { buildGlobalSourceUniverse } from "./build-asi-global-source-universe-v1.mjs";

const built = buildGlobalSourceUniverse();
const scopes = built["canonical-collection-scope-registry-v2.json"];
const contract = JSON.parse((await import("node:fs")).readFileSync("coordination/kidults/source-intelligence/asi-global-source-universe-v1.json", "utf8"));
const channel = "COMMON_CRAWL_AND_WEB_DATA_COMMONS_STRUCTURED_WEB_INDEX";
const observed = "2026-08-18T12:30:00Z";
const base = {
  discovery_channel_id: channel,
  scope_ids: ["trading_cards"],
  source_roles: ["LISTING_SUPPLY"],
  region_ids: ["NORTH_AMERICA"],
  observed_at: observed
};

assert.equal(normalizeSite("https://www.Example.com/a?x=1").canonical_site_host, "example.com");
assert.equal(normalizeSite("ftp://example.com"), null);
assert.equal(normalizeSite("http://127.0.0.1"), null);

const output = compileCandidates([
  { ...base, provider_record_id: "one", site_url: "https://www.market-one.example/items/1", source_name: "Market One" },
  { ...base, provider_record_id: "two", site_url: "http://market-one.example/results/2", source_roles: ["SOLD_TRANSACTION"] },
  { ...base, provider_record_id: "three", site_url: "https://github.com/example/repo" },
  { ...base, provider_record_id: "four", site_url: "https://instagram.com/example" },
  { ...base, provider_record_id: "five", site_url: "https://market-two.example", scope_ids: ["unknown_scope"] },
  { ...base, provider_record_id: "six", site_url: "https://market-three.example", region_ids: [] },
  { ...base, provider_record_id: "seven", site_url: "https://market-four.example", discovery_channel_id: "UNKNOWN" },
  { ...base, provider_record_id: "eight", site_url: "https://market-five.example", observed_at: null }
], contract, scopes);

assert.equal(output.raw_assertion_count, 8);
assert.equal(output.unique_candidate_site_count, 1);
assert.equal(output.open_market_candidate_site_count, 1);
assert.equal(output.rejected_assertion_count, 6);
assert.equal(output.records[0].canonical_site_host, "market-one.example");
assert.deepEqual(output.records[0].candidate_source_roles, ["LISTING_SUPPLY", "SOLD_TRANSACTION"]);
assert.equal(output.records[0].discovery_assertions.length, 2);
assert.equal(output.records[0].legal_state, "TERMS_ROBOTS_FIELD_RIGHTS_NOT_REVIEWED");
assert.equal(output.records[0].source_pool_state, "NOT_ELIGIBLE");
assert.equal(output.records[0].acquisition_authorized, false);
assert.equal(output.records[0].commercial_use_authorized, false);
assert.equal(output.records[0].market_claim_authorized, false);
assert.equal(output.directly_relevant_site_count, null);
assert.equal(output.legally_admitted_site_count, null);
assert.equal(output.source_pool_eligible_site_count, 0);
assert.equal(output.market_claims_created, 0);
assert.equal(output.production, "HOLD");

const mutations = [
  ["numeric target", value => { value.contract.universe_boundary.numeric_site_target = 100; }, "Numeric site targets are prohibited"],
  ["closed universe", value => { value.contract.universe_boundary.open_ended = false; }, "Global Source Universe must be open-ended"],
  ["duplicate role", value => { value.contract.required_source_roles[1].role = value.contract.required_source_roles[0].role; }, "Required Source Roles must be unique"],
  ["missing region", value => { value.contract.geographic_regions.pop(); }, "Expected 12 global regions"],
  ["unknown rights allowed", value => { value.contract.promotion_boundaries.unknown_rights_authorizes_adapter = true; }, "Unknown rights must never authorize an adapter"],
  ["listing demoted", value => { value.contract.required_source_roles.find(role => role.role === "LISTING_SUPPLY").market_universe_priority = "SUPPORTING_CONTEXT"; }, "Listing Supply must remain a core open-market role"]
];
for (const [name, mutate, expected] of mutations) {
  const inputs = JSON.parse(JSON.stringify((await import("./build-asi-global-source-universe-v1.mjs")).loadGlobalSourceUniverseInputs()));
  mutate(inputs);
  assert.throws(() => buildGlobalSourceUniverse(inputs), new RegExp(expected), `${name} mutation must fail closed.`);
}

console.log("KIDULTS ASI Global Open-Market candidate compiler: PASS");
console.log("Negative controls: 8 record-admission controls + 6 contract mutation controls");
console.log("Host deduplication: protocol/path variants merged once");
console.log("Discovery remains unreviewed; legal admission and acquisition remain blocked");
