import assert from "node:assert/strict";
import {
  assertCompiledGlobalPoolR1BootstrapCapture,
  compileGlobalPoolR1BootstrapCapture,
  loadGlobalPoolR1BootstrapInputs,
  normalizeRegisteredEndpoint
} from "./compile-global-pool-r1-bootstrap-capture-v1.mjs";
import { fingerprint } from "./compile-global-pool-r1-frontier-v1.mjs";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function resignOutput(output) {
  const { bootstrap_fingerprint: ignored, ...unsigned } = output;
  output.bootstrap_fingerprint = fingerprint(unsigned);
  return output;
}

const baselineInputs = loadGlobalPoolR1BootstrapInputs();
const first = compileGlobalPoolR1BootstrapCapture(baselineInputs);
const second = compileGlobalPoolR1BootstrapCapture(loadGlobalPoolR1BootstrapInputs());

assert.equal(first.bootstrap_fingerprint, second.bootstrap_fingerprint, "Bootstrap compiler must be deterministic.");
assert.equal(normalizeRegisteredEndpoint("https://www.Example.com/path?q=1").canonical_host, "example.com");
assert.equal(normalizeRegisteredEndpoint("ftp://example.com"), null);
assert.equal(normalizeRegisteredEndpoint("http://127.0.0.1"), null);
assert.equal(first.registered_endpoint_record_count, 64);
assert.equal(first.registered_canonical_host_count, 63);
assert.equal(first.queue_seed_event_count, 264);
assert.equal(new Set(first.source_records.map(record => record.canonical_host)).size, 63);
assert.equal(first.source_records.filter(record => record.context_only).length, 22);
assert.equal(first.queue_seed_events.filter(event => event.payload.context_only).length, 125);
assert.equal(first.source_records.filter(record =>
  record.role_transformations.some(mapping => mapping.input_role === "AUCTION_PRIVATE_SALE")
).length, 10);
assert.equal(first.source_records.filter(record => record.supplemental_role_hints.includes("INDEPENDENT_VERIFICATION")).length, 1);
assert.equal(first.live_verified_site_count, null);
assert.equal(first.rights_cleared_site_count, 0);
assert.equal(first.source_pool_eligible_site_count, 0);
assert.equal(first.market_claims_created, 0);
assert.equal(first.production, "HOLD");

const inputMutations = [
  ["endpoint record removed", value => { value.sourceRecords.pop(); }, /row count does not match/],
  ["duplicate source ID", value => { value.sourceRecords[1].source_id = value.sourceRecords[0].source_id; }, /source IDs must be unique/],
  ["invalid endpoint", value => { value.sourceRecords[0].official_endpoint = "file:///private/data"; }, /invalid public HTTP\(S\) endpoint/],
  ["unknown legacy Scope", value => { value.sourceRecords[0].collection_scope_ids = "scope-does-not-exist"; }, /unknown legacy Scope binding/],
  ["missing role", value => { value.sourceRecords[0].source_roles = ""; }, /missing candidate source role/],
  ["event type removed from schema", value => {
    value.eventSchema.properties.event_type.enum = value.eventSchema.properties.event_type.enum.filter(
      eventType => eventType !== "SOURCE_DISCOVERY_REQUESTED"
    );
  }, /event schema does not accept SOURCE_DISCOVERY_REQUESTED/],
  ["wrong bootstrap event type", value => { value.contract.bootstrap_capture.event_type = "SOURCE_DISCOVERED"; }, /must emit SOURCE_DISCOVERY_REQUESTED/],
  ["URL clears rights", value => { value.contract.bootstrap_capture.endpoint_url_rights_effect = "ALLOW"; }, /must not clear rights/],
  ["target traversal enabled", value => { value.contract.bootstrap_capture.target_site_traversal_authorized = true; }, /traversal must remain blocked/],
  ["source pool promoted", value => { value.contract.bootstrap_capture.source_pool_state = "ELIGIBLE"; }, /cannot enter the source pool/],
  ["acquisition enabled", value => { value.contract.bootstrap_capture.acquisition_authorized = true; }, /cannot authorize acquisition/],
  ["auction mapping overclaimed", value => { value.contract.bootstrap_capture.role_mapping.AUCTION_PRIVATE_SALE = "SOLD_TRANSACTION_VERIFIED"; }, /candidate-only/],
  ["independent role silently mapped", value => { value.contract.bootstrap_capture.role_mapping.INDEPENDENT_VERIFICATION = "PRIMARY_AUTHORITY"; }, /must not be silently substituted/],
  ["crosswalk unknown target", value => { value.scopeCrosswalk.records[0].target_scope_ids = ["not_a_scope"]; }, /non-canonical target Scope/],
  ["museum market role allowed", value => {
    value.contract.bootstrap_capture.museum_or_institutional_context.allowed_candidate_roles.push("SOLD_TRANSACTION");
  }, /Museum\/institutional allowed roles must not contain a core market-event role/],
  ["museum row only sold", value => {
    const museum = value.sourceRecords.find(record => record.channel_type.includes("MUSEUM"));
    museum.source_roles = "SOLD_TRANSACTION";
  }, /no canonical candidate role remains after fail-closed mapping/]
];

for (const [name, mutate, expected] of inputMutations) {
  const mutated = clone(baselineInputs);
  mutate(mutated);
  assert.throws(() => compileGlobalPoolR1BootstrapCapture(mutated), expected, `${name} mutation must fail closed.`);
}

const contextRecordIndex = first.source_records.findIndex(record => record.context_only);
const contextRecord = first.source_records[contextRecordIndex];
const contextEventIndex = first.queue_seed_events.findIndex(event =>
  event.payload.source_record_id === contextRecord.source_record_id
);
const outputMutations = [
  ["bootstrap promoted", value => { value.status = "READY"; }, /must remain CANDIDATE_CAPTURE_PENDING/],
  ["global site target introduced", value => { value.numeric_site_target = 250; }, /must not close or cap/],
  ["live site inferred", value => { value.live_verified_site_count = 64; }, /must not be reported as live-verified/],
  ["rights cleared from URLs", value => { value.rights_cleared_site_count = 64; }, /cannot clear rights/],
  ["source pool inferred", value => { value.source_pool_eligible_site_count = 1; }, /cannot clear rights or source-pool gates/],
  ["record rights allowed", value => { value.source_records[0].rights_state = "ALLOW"; }, /endpoint URL improperly cleared rights/],
  ["record capture advanced", value => { value.source_records[0].capture_state = "DISCOVERY_METADATA_OBSERVED"; }, /capture state advanced prematurely/],
  ["context record mapped to sold", value => { value.source_records[contextRecordIndex].candidate_source_roles.push("SOLD_TRANSACTION"); }, /context source escaped its allowed roles/],
  ["queue event type changed", value => { value.queue_seed_events[0].event_type = "SOURCE_DISCOVERED"; }, /wrong event type/],
  ["queue rights allowed", value => { value.queue_seed_events[0].rights_state = "ALLOW"; }, /rights\/freshness inferred before capture/],
  ["queue traversal enabled", value => { value.queue_seed_events[0].payload.discovery_seed.target_site_traversal_authorized = true; }, /target traversal improperly authorized/],
  ["context queue market role", value => { value.queue_seed_events[contextEventIndex].partition.source_role = "SOLD_TRANSACTION"; }, /context event entered a market role/],
  ["queue acquisition enabled", value => { value.queue_seed_events[0].payload.acquisition_authorized = true; }, /side effect improperly authorized/],
  ["production enabled", value => { value.source_records[0].production = "ACTIVE"; }, /SHADOW\/HOLD boundary failed/]
];

for (const [name, mutate, expected] of outputMutations) {
  const mutated = clone(first);
  mutate(mutated);
  resignOutput(mutated);
  assert.throws(
    () => assertCompiledGlobalPoolR1BootstrapCapture(mutated, baselineInputs),
    expected,
    `${name} output mutation must fail closed.`
  );
}

console.log("KIDULTS Global Pool R1 bootstrap capture validator: PASS");
console.log("Determinism: PASS (two independent compiles share one bootstrap fingerprint)");
console.log("Registered endpoints / canonical hosts / SOURCE_DISCOVERY_REQUESTED seeds: 64 / 63 / 264");
console.log("Context-only records / context-only seed events: 22 / 125");
console.log("Auction/private-sale mappings: candidate SOLD_TRANSACTION bindings only; terminal transactions asserted: 0");
console.log(`Negative controls: ${inputMutations.length} input mutations + ${outputMutations.length} output mutations`);
console.log("Live verification: NOT EXECUTED; rights cleared: 0; source-pool eligible: 0; Production: HOLD");
