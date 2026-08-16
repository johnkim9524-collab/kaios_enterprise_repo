import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const output = path.resolve(process.argv[2] ?? "artifacts/autonomous-source-samples/getty-provenance-sale-r1");
const errors = [];

function read(name) {
  const file = path.join(output, name);
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    errors.push(`${name}: ${error.message}`);
    return null;
  }
}

function assert(condition, message) {
  if (!condition) errors.push(message);
}

const manifest = read("run-manifest.json");
const raw = read("sanitized-raw-records.json");
const events = read("normalized-market-events.json");
const evidence = read("evidence-package.json");
const quality = read("quality-report.json");

assert(manifest?.mode === "BOUNDED_LIVE_TRANSACTION_POC", "Run mode mismatch.");
assert(manifest?.status === "COMPLETED", "Bounded transaction run did not complete.");
assert(manifest?.source_id === "getty-provenance-index-sale-activity", "Source identity mismatch.");
assert(manifest?.rights_model?.data === "CC0", "Data rights state mismatch.");
assert(manifest?.rights_model?.images === "NOT_INGESTED", "Image rights boundary mismatch.");
assert(manifest?.credential_used === false, "Credentials must not be used.");
assert(manifest?.paid_access_used === false, "Paid access must not be used.");
assert(manifest?.image_downloaded === false, "Image download is prohibited.");
assert(manifest?.mutation_performed === false, "Source or Production mutation is prohibited.");
assert(manifest?.production_eligible === false, "PoC must not be Production eligible.");
assert(manifest?.candidate_publication_authorized === false, "Candidate publication must remain unauthorized.");
assert(manifest?.index_computation_authorized === false, "Index computation must remain unauthorized.");
assert(Array.isArray(events) && events.length >= Number(manifest?.valid_sale_events ?? 1),
  "Normalized Market Event count is below the fail-closed minimum.");
assert(Array.isArray(raw) && raw.length === events?.length, "Raw and normalized Market Event counts must match.");

const ids = new Set();
for (const event of events ?? []) {
  assert(!ids.has(event.market_event_id), `Duplicate Market Event ID: ${event.market_event_id}`);
  ids.add(event.market_event_id);
  assert(event.source_id === "getty-provenance-index-sale-activity", `${event.market_event_id}: source mismatch.`);
  assert(event.source_event_type === "Activity", `${event.market_event_id}: Linked Art source type must be Activity.`);
  assert(event.event_type === "HISTORICAL_SALE_ACTIVITY", `${event.market_event_id}: event classification mismatch.`);
  assert(event.sold_event === true, `${event.market_event_id}: sale event flag must be true.`);
  assert(event.listing_is_sale === false, `${event.market_event_id}: listing must never be counted as sale.`);
  assert(event.provider_id_is_canonical_object_id === false,
    `${event.market_event_id}: source event ID cannot be promoted to canonical object ID.`);
  assert(event.rights_state === "GETTY_PROVENANCE_INDEX_CC0", `${event.market_event_id}: rights state mismatch.`);
  assert(/^https:\/\/data\.getty\.edu\/provenance\/[a-f0-9-]{36}$/i.test(event.provenance_reference),
    `${event.market_event_id}: provenance URL is missing or outside the allowlist.`);
  assert(/^[a-f0-9]{64}$/.test(event.source_payload_sha256), `${event.market_event_id}: payload hash is invalid.`);
  assert(event.freshness_state === "CURRENT_AT_FETCH", `${event.market_event_id}: freshness state mismatch.`);
  assert(event.publication_state === "POC_INTERNAL_ONLY", `${event.market_event_id}: publication state mismatch.`);
  assert(event.index_eligible === false, `${event.market_event_id}: Index eligibility must remain false.`);
  assert(event.production_eligible === false, `${event.market_event_id}: Production eligibility must remain false.`);
  assert(["EXTRACTED_FROM_LINKED_ART", "NOT_AVAILABLE"].includes(event.sold_price_state),
    `${event.market_event_id}: unsupported sold-price state.`);
  if (event.sold_price === null) {
    assert(event.sold_price_state === "NOT_AVAILABLE", `${event.market_event_id}: missing price must remain NOT_AVAILABLE.`);
  } else {
    assert(Number.isFinite(event.sold_price), `${event.market_event_id}: sold price must be numeric or null.`);
    assert(event.sold_price_state === "EXTRACTED_FROM_LINKED_ART",
      `${event.market_event_id}: numeric price requires extraction lineage.`);
  }
  assert(event.buyer_premium_state === "NOT_AVAILABLE", `${event.market_event_id}: buyer premium must not be invented.`);
  assert(event.condition_state === "NOT_AVAILABLE", `${event.market_event_id}: condition must not be invented.`);
  assert(event.authentication_state === "NOT_AVAILABLE", `${event.market_event_id}: authentication must not be invented.`);
  for (const field of ["object_references", "buyer_references", "seller_references", "venue_references", "monetary_amounts"]) {
    assert(Array.isArray(event[field]), `${event.market_event_id}: ${field} must be an array.`);
  }
}

for (const item of raw ?? []) {
  assert(item.raw_payload_state === "SANITIZED_LINKED_ART_EVENT_SUMMARY_NO_MEDIA",
    `${item.source_entity_id}: raw state mismatch.`);
  assert(item.media_ingested === false, `${item.source_entity_id}: media ingestion flag mismatch.`);
  assert(/^https:\/\/data\.getty\.edu\/provenance\/[a-f0-9-]{36}$/i.test(item.source_url),
    `${item.source_entity_id}: source URL mismatch.`);
  assert(/^[a-f0-9]{64}$/.test(item.source_payload_sha256), `${item.source_entity_id}: raw payload hash invalid.`);
  const serialized = JSON.stringify(item);
  assert(!/image|thumbnail|representation|digitally_shown_by/i.test(serialized),
    `${item.source_entity_id}: media-bearing payload leaked into sanitized raw output.`);
}

assert(evidence?.status === "TRANSACTION_POC_EVIDENCE_NOT_CANDIDATE",
  "Evidence Package must remain transaction PoC only.");
assert(evidence?.snapshot_id === null, "Transaction PoC must not invent a Snapshot ID.");
assert(evidence?.market_event_count === events?.length, "Evidence Package Market Event count mismatch.");
assert(evidence?.production_eligible === false, "Evidence Package must not be Production eligible.");
assert(evidence?.commercial_publication_authorized === false, "Commercial publication must remain unauthorized.");
assert(quality?.market_event_count === events?.length, "Quality report Market Event count mismatch.");
assert(quality?.valid_sale_event_count === events?.filter(event => event.sold_event === true).length,
  "Valid sale event count mismatch.");
assert(quality?.duplicate_market_event_count === 0, "Duplicate Market Event contamination must be zero.");
assert(quality?.provenance_reference_coverage === 1, "Provenance coverage must be 100%.");
assert(quality?.rights_state_coverage === 1, "Rights-state coverage must be 100%.");
assert(quality?.listing_count === 0, "Getty seed lane must not fabricate listings.");
assert(quality?.listing_counted_as_sale === 0, "No listing may be counted as a sale.");
assert(quality?.image_ingestion_count === 0, "Image ingestion count must remain zero.");
assert(quality?.minimum_event_gate === "PASS", "Minimum Market Event gate must pass.");
assert(quality?.candidate_eligible === false, "Single transaction seed must not be Candidate eligible.");

if (errors.length) {
  console.error(`KIDULTS Getty Provenance Sale Sample: FAIL (${errors.length})`);
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}

console.log("KIDULTS Getty Provenance Sale Sample: PASS");
console.log(`Market events: ${events.length}`);
console.log(`Valid sale events: ${quality.valid_sale_event_count}`);
console.log(`Event date coverage: ${quality.event_date_coverage}`);
console.log(`Price coverage: ${quality.price_coverage}`);
console.log(`Object reference coverage: ${quality.object_reference_coverage}`);
console.log("Rights: CC0");
console.log("Listings counted as sales: 0");
console.log("Candidate eligible: NO");
