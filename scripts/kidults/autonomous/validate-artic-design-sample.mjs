import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const output = path.resolve(process.argv[2] ?? "artifacts/autonomous-source-samples/artic-design-open-access-r1");
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
const records = read("normalized-evidence-records.json");
const evidence = read("evidence-package.json");
const quality = read("quality-report.json");

assert(manifest?.mode === "BOUNDED_LIVE_METADATA_POC", "Run mode mismatch.");
assert(manifest?.status === "COMPLETED", "Bounded live run did not complete.");
assert(manifest?.source_id === "art-institute-chicago-design-api", "Source identity mismatch.");
assert(manifest?.rights_model?.metadata === "CC0_FOR_ARTWORK_FIELDS_EXCEPT_DESCRIPTION", "Metadata rights state mismatch.");
assert(manifest?.rights_model?.description === "EXCLUDED_CC_BY_4_0", "Description rights state mismatch.");
assert(manifest?.credential_used === false, "Credentials must not be used.");
assert(manifest?.paid_access_used === false, "Paid access must not be used.");
assert(manifest?.image_downloaded === false, "Image download is prohibited.");
assert(manifest?.mutation_performed === false, "Source or Production mutation is prohibited.");
assert(manifest?.production_eligible === false, "PoC must not be Production eligible.");
assert(Array.isArray(records) && records.length >= Number(manifest?.minimum_records ?? 8),
  "Normalized record count is below the fail-closed minimum.");
assert(Array.isArray(raw) && raw.length === records?.length, "Raw and normalized record counts must match.");
assert(typeof manifest?.source_license_text === "string" && /description/i.test(manifest.source_license_text) && /CC0/i.test(manifest.source_license_text),
  "Source license text was not captured or does not distinguish the description field from CC0 data.");

const prohibitedKeys = new Set(["description", "thumbnail", "image_id", "image_url", "alt_text", "lqip"]);
const allowedRawMetadataKeys = new Set([
  "id", "title", "main_reference_number", "date_display", "date_start", "date_end",
  "artist_display", "place_of_origin", "medium_display", "dimensions", "classification_titles",
  "style_titles", "subject_titles", "department_title", "api_link", "timestamp"
]);

const ids = new Set();
for (const record of records ?? []) {
  assert(!ids.has(record.source_object_id), `Duplicate source object ID: ${record.source_object_id}`);
  ids.add(record.source_object_id);
  assert(record.source_id === "art-institute-chicago-design-api", `${record.evidence_id}: source mismatch.`);
  assert(record.source_tier === 1, `${record.evidence_id}: source tier mismatch.`);
  assert(record.evidence_class === "PRIMARY_AUTHORITY", `${record.evidence_id}: evidence class mismatch.`);
  assert(record.provider_id_is_canonical_id === false, `${record.evidence_id}: Provider ID cannot be canonical.`);
  assert(record.identity_state === "CANDIDATE_KEY_ONLY", `${record.evidence_id}: identity state mismatch.`);
  assert(record.metadata_rights_state === "AIC_ARTWORK_FIELDS_CC0_DESCRIPTION_EXCLUDED_MEDIA_NOT_INGESTED",
    `${record.evidence_id}: metadata rights state mismatch.`);
  assert(record.description_state === "EXCLUDED_CC_BY_4_0_FIELD", `${record.evidence_id}: description state mismatch.`);
  assert(record.image_state === "NOT_INGESTED", `${record.evidence_id}: image state mismatch.`);
  assert(record.freshness_state === "CURRENT_AT_FETCH", `${record.evidence_id}: freshness state mismatch.`);
  assert(/^https:\/\/api\.artic\.edu\/api\/v1\/artworks\//.test(record.evidence_reference),
    `${record.evidence_id}: provenance URL is missing or outside the allowlist.`);
  assert(/^[a-f0-9]{64}$/.test(record.source_payload_sha256), `${record.evidence_id}: payload hash is invalid.`);
  assert(record.publication_state === "POC_INTERNAL_ONLY", `${record.evidence_id}: publication state mismatch.`);
  assert(record.index_eligible === false, `${record.evidence_id}: index eligibility must remain false.`);
  assert(record.production_eligible === false, `${record.evidence_id}: Production eligibility must remain false.`);
  for (const key of Object.keys(record)) {
    assert(!prohibitedKeys.has(key), `${record.evidence_id}: prohibited field leaked into normalized output: ${key}.`);
  }
}

for (const item of raw ?? []) {
  assert(item.raw_payload_state === "CC0_FIELD_ALLOWLIST_NO_DESCRIPTION_NO_MEDIA", `${item.source_object_id}: raw state mismatch.`);
  assert(item.image_downloaded === false, `${item.source_object_id}: raw image flag mismatch.`);
  const keys = Object.keys(item.metadata ?? {});
  for (const key of keys) {
    assert(allowedRawMetadataKeys.has(key), `${item.source_object_id}: unexpected raw metadata key ${key}.`);
    assert(!prohibitedKeys.has(key), `${item.source_object_id}: prohibited raw field leaked: ${key}.`);
  }
}

assert(evidence?.status === "POC_EVIDENCE_NOT_CANDIDATE", "Evidence Package must not claim Candidate status.");
assert(evidence?.snapshot_id === null, "PoC Evidence Package must not invent a Snapshot ID.");
assert(evidence?.record_count === records?.length, "Evidence Package record count mismatch.");
assert(evidence?.production_eligible === false, "Evidence Package must not be Production eligible.");
assert(evidence?.commercial_publication_authorized === false, "Commercial publication must remain unauthorized.");
assert(quality?.metadata_rights_state === "AIC_ARTWORK_FIELDS_CC0_DESCRIPTION_EXCLUDED", "Quality report rights state mismatch.");
assert(quality?.duplicate_record_count === 0, "Duplicate contamination must be zero in the bounded sample.");
assert(quality?.provenance_reference_coverage === 1, "Provenance coverage must be 100%.");
assert(quality?.rights_state_coverage === 1, "Rights-state coverage must be 100%.");
assert(quality?.description_ingestion_count === 0, "Description ingestion count must remain zero.");
assert(quality?.image_ingestion_count === 0, "Image ingestion count must remain zero.");
assert(quality?.license_gate === "PASS", "License gate must pass.");
assert(quality?.candidate_eligible === false, "Single-source sample must not be Candidate eligible.");

if (errors.length) {
  console.error(`KIDULTS Art Institute Design Sample: FAIL (${errors.length})`);
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}

console.log("KIDULTS Art Institute Design Sample: PASS");
console.log(`Records: ${records.length}`);
console.log(`Average critical-field completeness: ${quality.average_critical_field_completeness}`);
console.log("License gate: PASS");
console.log("Description ingested: 0");
console.log("Images ingested: 0");
console.log("Candidate eligible: NO");
