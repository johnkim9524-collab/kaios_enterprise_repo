import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const output = path.resolve(process.argv[2] ?? "artifacts/autonomous-source-samples/vam-fashion-collections-r1");
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
assert(manifest?.source_id === "vam-collections-api-fashion", "Source identity mismatch.");
assert(manifest?.credential_used === false, "Credentials must not be used.");
assert(manifest?.paid_access_used === false, "Paid access must not be used.");
assert(manifest?.image_downloaded === false, "Image download is prohibited.");
assert(manifest?.mutation_performed === false, "Source or Production mutation is prohibited.");
assert(manifest?.production_eligible === false, "PoC must not be Production eligible.");
assert(manifest?.commercial_publication_authorized === false, "Commercial publication must remain unauthorized.");
assert(Array.isArray(records) && records.length >= Number(manifest?.minimum_records ?? 8),
  "Normalized record count is below the fail-closed minimum.");
assert(Array.isArray(raw) && raw.length === records?.length, "Raw and normalized record counts must match.");

const ids = new Set();
for (const record of records ?? []) {
  assert(!ids.has(record.source_object_id), `Duplicate source object ID: ${record.source_object_id}`);
  ids.add(record.source_object_id);
  assert(record.source_id === "vam-collections-api-fashion", `${record.evidence_id}: source mismatch.`);
  assert(record.source_tier === 1, `${record.evidence_id}: source tier mismatch.`);
  assert(record.evidence_class === "PRIMARY_AUTHORITY", `${record.evidence_id}: evidence class mismatch.`);
  assert(record.metadata_rights_state === "V_AND_A_API_TERMS_INTERNAL_NONCOMMERCIAL_POC_ONLY",
    `${record.evidence_id}: rights state mismatch.`);
  assert(record.image_state === "NOT_INGESTED", `${record.evidence_id}: image state mismatch.`);
  assert(/^https:\/\/collections\.vam\.ac\.uk\/item\//.test(record.evidence_reference),
    `${record.evidence_id}: provenance URL is missing or outside the V&A collection domain.`);
  assert(/^[a-f0-9]{64}$/.test(record.source_payload_sha256), `${record.evidence_id}: payload hash is invalid.`);
  assert(record.publication_state === "POC_INTERNAL_ONLY", `${record.evidence_id}: publication state mismatch.`);
  assert(record.critical_field_completeness >= 0.5, `${record.evidence_id}: critical completeness is too low.`);
}

for (const item of raw ?? []) {
  assert(item.raw_payload_state === "SANITIZED_SUMMARY_METADATA_ONLY", `${item.source_object_id}: raw state mismatch.`);
  assert(item.image_downloaded === false, `${item.source_object_id}: raw image flag mismatch.`);
  assert(!("_images" in (item.metadata ?? {})), `${item.source_object_id}: _images was not stripped.`);
  assert(!("_imagesMeta" in (item.metadata ?? {})), `${item.source_object_id}: _imagesMeta was not stripped.`);
  assert(!("_primaryImageId" in (item.metadata ?? {})), `${item.source_object_id}: _primaryImageId was not stripped.`);
}

assert(evidence?.status === "POC_EVIDENCE_NOT_CANDIDATE", "Evidence Package must not claim Candidate status.");
assert(evidence?.snapshot_id === null, "PoC Evidence Package must not invent a Snapshot ID.");
assert(evidence?.record_count === records?.length, "Evidence Package record count mismatch.");
assert(evidence?.production_eligible === false, "Evidence Package must not be Production eligible.");
assert(evidence?.commercial_publication_authorized === false, "Evidence Package must not authorize publication.");
assert(quality?.duplicate_record_count === 0, "Duplicate contamination must be zero in the bounded sample.");
assert(quality?.provenance_reference_coverage === 1, "Provenance coverage must be 100%.");
assert(quality?.image_ingestion_count === 0, "Image ingestion count must remain zero.");
assert(quality?.candidate_eligible === false, "This sample must not be Candidate eligible.");

if (errors.length) {
  console.error(`KIDULTS V&A Fashion Sample: FAIL (${errors.length})`);
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}

console.log("KIDULTS V&A Fashion Sample: PASS");
console.log(`Records: ${records.length}`);
console.log(`Average critical-field completeness: ${quality.average_critical_field_completeness}`);
console.log("Provenance coverage: 100%");
console.log("Images ingested: 0");
console.log("Commercial publication: NOT AUTHORIZED");
console.log("Candidate eligible: NO");
