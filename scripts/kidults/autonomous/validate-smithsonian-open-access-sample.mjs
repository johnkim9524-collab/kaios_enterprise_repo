import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const output = path.resolve(process.argv[2] ?? "artifacts/autonomous-source-samples/smithsonian-open-access-r1");
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
assert(manifest?.source_id === "smithsonian-open-access-art-design", "Source identity mismatch.");
assert(manifest?.rights_model?.metadata === "SMITHSONIAN_OPEN_ACCESS_METADATA_CC0_PORTIONS", "Metadata rights state mismatch.");
assert(["DEMO_KEY_BOUNDED_POC", "GITHUB_SECRET_API_KEY"].includes(manifest?.credential_mode), "Credential mode mismatch.");
assert(manifest?.api_key_persisted === false, "API key must not be persisted.");
assert(manifest?.api_key_logged === false, "API key must not be logged.");
assert(manifest?.paid_access_used === false, "Paid access must not be used.");
assert(manifest?.media_downloaded === false, "Media download is prohibited.");
assert(manifest?.mutation_performed === false, "Source or Production mutation is prohibited.");
assert(manifest?.production_eligible === false, "PoC must not be Production eligible.");
assert(Array.isArray(records) && records.length >= Number(manifest?.minimum_records ?? 8),
  "Normalized record count is below the fail-closed minimum.");
assert(Array.isArray(raw) && raw.length === records?.length, "Raw and normalized record counts must match.");

const serialized = JSON.stringify({ manifest, raw, records, evidence, quality });
assert(!/api_key=(?!REDACTED)/i.test(serialized), "A non-redacted API key appears in persisted output.");
assert(!/SMITHSONIAN_API_KEY/.test(serialized), "Environment secret name must not appear in persisted output.");

const allowedRawMetadataKeys = new Set([
  "id", "title", "record_id", "data_source", "unit_code", "metadata_usage_access",
  "object_types", "dates", "places", "topics", "cultures", "names", "languages"
]);

const ids = new Set();
for (const record of records ?? []) {
  assert(!ids.has(record.source_object_id), `Duplicate source object ID: ${record.source_object_id}`);
  ids.add(record.source_object_id);
  assert(record.source_id === "smithsonian-open-access-art-design", `${record.evidence_id}: source mismatch.`);
  assert(record.source_tier === 1, `${record.evidence_id}: source tier mismatch.`);
  assert(record.evidence_class === "PRIMARY_AUTHORITY", `${record.evidence_id}: evidence class mismatch.`);
  assert(record.provider_id_is_canonical_id === false, `${record.evidence_id}: Provider ID cannot be canonical.`);
  assert(record.identity_state === "CANDIDATE_KEY_ONLY", `${record.evidence_id}: identity state mismatch.`);
  assert(record.metadata_rights_state === "SMITHSONIAN_OPEN_ACCESS_METADATA_CC0_PORTION_MEDIA_NOT_INGESTED",
    `${record.evidence_id}: metadata rights state mismatch.`);
  assert(record.media_state === "NOT_INGESTED", `${record.evidence_id}: media state mismatch.`);
  assert(record.freshness_state === "CURRENT_AT_FETCH", `${record.evidence_id}: freshness state mismatch.`);
  assert(/^https:\/\/api\.si\.edu\/openaccess\/api\/v1\.0\/content\//.test(record.evidence_reference),
    `${record.evidence_id}: provenance URL is missing or outside the allowlist.`);
  assert(/^[a-f0-9]{64}$/.test(record.source_payload_sha256), `${record.evidence_id}: payload hash is invalid.`);
  assert(record.publication_state === "POC_INTERNAL_ONLY", `${record.evidence_id}: publication state mismatch.`);
  assert(record.index_eligible === false, `${record.evidence_id}: index eligibility must remain false.`);
  assert(record.production_eligible === false, `${record.evidence_id}: Production eligibility must remain false.`);
  assert(!/(image|media|thumbnail|content_url|resource)/i.test(Object.keys(record).join("|")),
    `${record.evidence_id}: media-bearing field leaked into normalized output.`);
}

for (const item of raw ?? []) {
  assert(item.raw_payload_state === "STRICT_METADATA_ALLOWLIST_NO_MEDIA", `${item.source_object_id}: raw state mismatch.`);
  assert(item.media_downloaded === false, `${item.source_object_id}: raw media flag mismatch.`);
  const keys = Object.keys(item.metadata ?? {});
  for (const key of keys) assert(allowedRawMetadataKeys.has(key), `${item.source_object_id}: unexpected raw metadata key ${key}.`);
  assert(!/(image|media|thumbnail|content_url|resource)/i.test(keys.join("|")),
    `${item.source_object_id}: media-bearing raw key leaked.`);
}

assert(evidence?.status === "POC_EVIDENCE_NOT_CANDIDATE", "Evidence Package must not claim Candidate status.");
assert(evidence?.snapshot_id === null, "PoC Evidence Package must not invent a Snapshot ID.");
assert(evidence?.record_count === records?.length, "Evidence Package record count mismatch.");
assert(evidence?.production_eligible === false, "Evidence Package must not be Production eligible.");
assert(evidence?.commercial_publication_authorized === false, "Commercial publication must remain unauthorized.");
assert(quality?.metadata_rights_state === "SMITHSONIAN_OPEN_ACCESS_METADATA_CC0_PORTIONS", "Quality report rights state mismatch.");
assert(quality?.duplicate_record_count === 0, "Duplicate contamination must be zero in the bounded sample.");
assert(quality?.provenance_reference_coverage === 1, "Provenance coverage must be 100%.");
assert(quality?.rights_state_coverage === 1, "Rights-state coverage must be 100%.");
assert(quality?.media_ingestion_count === 0, "Media ingestion count must remain zero.");
assert(quality?.candidate_eligible === false, "Single-source sample must not be Candidate eligible.");

if (errors.length) {
  console.error(`KIDULTS Smithsonian Open Access Sample: FAIL (${errors.length})`);
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}

console.log("KIDULTS Smithsonian Open Access Sample: PASS");
console.log(`Records: ${records.length}`);
console.log(`Credential mode: ${manifest.credential_mode}`);
console.log(`Average critical-field completeness: ${quality.average_critical_field_completeness}`);
console.log("Provenance coverage: 100%");
console.log("Rights-state coverage: 100%");
console.log("Media ingested: 0");
console.log("Candidate eligible: NO");
