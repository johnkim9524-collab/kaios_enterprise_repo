import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const output = path.resolve(process.argv[2] ?? "artifacts/autonomous-source-samples/met-costume-open-access-r1");
const contractPath = "coordination/kidults/autonomous/source-discovery/contracts/met-costume-open-access-r1.json";
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
const contractRaw = fs.readFileSync(contractPath, "utf8");
const contract = JSON.parse(contractRaw);
const contractDigest = `sha256:${crypto.createHash("sha256").update(contractRaw).digest("hex")}`;
const terminalZero = manifest?.status === "TERMINAL_ZERO_CANDIDATE";
const completed = manifest?.status === "COMPLETED";
const providerFailed = manifest?.status === "FAILED_PROVIDER_READ";
const minimumFailed = manifest?.status === "FAILED_MINIMUM_RECORD_GATE";
const strictUtc = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value);
const validationNow = Date.now();
const futureToleranceMs = 5 * 60_000;
const maximumObservationAgeMs = Number(contract?.bounded_limits?.maximum_observation_age_hours) * 3_600_000;
const rawMetadataAllowlist = new Set([
  "objectID", "accessionNumber", "accessionYear", "title", "objectName", "department", "objectURL",
  "classification", "culture", "period", "dynasty", "reign", "objectDate", "objectBeginDate", "objectEndDate",
  "artistDisplayName", "artistRole", "medium", "dimensions", "country", "region", "city", "creditLine", "isPublicDomain"
]);

assert(manifest?.mode === "GOVERNED_SCHEDULED_PUBLIC_METADATA_REFERENCE_DISCOVERY", "Run mode mismatch.");
assert(completed || terminalZero || providerFailed || minimumFailed,
  "Live reference discovery did not reach an allowed terminal state.");
assert(manifest?.source_id === "met-costume-institute-open-access", "Source identity mismatch.");
assert(manifest?.source_layer === "OPEN_AUTHORITY", "Source layer mismatch.");
assert(manifest?.evidence_role === "REFERENCE_DISCOVERY", "Evidence role must remain REFERENCE_DISCOVERY.");
assert(manifest?.market_observation_type === "NONE", "Met metadata cannot claim a Market Event.");
assert(manifest?.current_sold_eligible === false, "Met metadata cannot become Current-SOLD evidence.");
assert(manifest?.rights_model?.metadata === "CC0_COLLECTION_METADATA", "Metadata rights state mismatch.");
assert(manifest?.license_provenance?.repository_contract_path === contractPath, "License contract path mismatch.");
assert(manifest?.license_provenance?.repository_contract_sha256 === contractDigest, "License contract digest mismatch.");
assert(Array.isArray(manifest?.license_provenance?.official_policy_urls) &&
  manifest.license_provenance.official_policy_urls.every(value => /^https:\/\//.test(value)),
"Official license provenance URLs are required.");
assert(contract?.admission_class === "REFERENCE_DISCOVERY_ONLY" && contract?.current_sold_eligible === false,
  "Repository contract weakened the admission boundary.");
assert(manifest?.credential_used === false, "Credentials must not be used.");
assert(manifest?.paid_access_used === false, "Paid access must not be used.");
assert(manifest?.image_downloaded === false, "Image download is prohibited.");
assert(manifest?.mutation_performed === false, "Source or Production mutation is prohibited.");
assert(manifest?.data_admission_performed === false, "Live read must not perform data admission.");
assert(manifest?.current_sold_transaction_count === 0, "Met metadata must create zero Current-SOLD transactions.");
assert(manifest?.immutable_candidate_evidence_pair_created === false, "Collector cannot create an immutable Candidate/Evidence pair.");
assert(manifest?.track_b_submission_count === 0 && manifest?.track_b_assessment_count === 0,
  "Collector cannot submit to or perform Track B.");
assert(manifest?.production_eligible === false, "PoC must not be Production eligible.");
assert(Array.isArray(records) && (terminalZero || providerFailed
  ? records.length === 0
  : minimumFailed
    ? records.length < Number(manifest?.minimum_records ?? 8)
    : records.length >= Number(manifest?.minimum_records ?? 8)),
  "Normalized record count does not match the terminal state.");
assert(Array.isArray(raw) && raw.length === records?.length, "Raw and normalized record counts must match.");
assert(strictUtc(manifest?.started_at) && strictUtc(manifest?.completed_at), "Strict UTC run timestamps are required.");
assert(new Date(manifest?.completed_at).getTime() >= new Date(manifest?.started_at).getTime(), "Run time window is reversed.");
assert(new Date(manifest?.completed_at).getTime() <= validationNow + futureToleranceMs,
  "Run completion timestamp is in the future.");
assert(validationNow - new Date(manifest?.completed_at).getTime() <= maximumObservationAgeMs,
  "Run receipt is stale.");
if (process.env.GITHUB_ACTIONS === "true") {
  assert(/^[a-f0-9]{40}$/.test(process.env.GITHUB_SHA ?? "") &&
    manifest?.runtime_lineage?.git_sha === process.env.GITHUB_SHA, "Exact GitHub runtime source SHA is required.");
  assert(/^\d+$/.test(process.env.GITHUB_RUN_ID ?? "") &&
    manifest?.runtime_lineage?.github_run_id === Number(process.env.GITHUB_RUN_ID), "Exact GitHub runtime run ID is required.");
  assert(/^\d+$/.test(process.env.GITHUB_RUN_ATTEMPT ?? "") &&
    manifest?.runtime_lineage?.github_run_attempt === Number(process.env.GITHUB_RUN_ATTEMPT),
  "Exact GitHub runtime attempt is required.");
}
assert(Number.isInteger(manifest?.requests_executed) && manifest.requests_executed >= 1 &&
  manifest?.provider_call_count === manifest.requests_executed && manifest.requests_executed === manifest?.request_log?.length,
"Every Met provider-call attempt must be counted exactly once.");
if (providerFailed) {
  assert(manifest?.outcome_class === "FAIL_CLOSED_PROVIDER_READ_FAILURE" && manifest?.failure_stage === "SEARCH" &&
    typeof manifest?.failure_class === "string" && manifest.failure_class.length > 0,
  "Provider read failure receipt is incomplete.");
}
if (!providerFailed) {
  assert(Array.isArray(manifest?.failures) && manifest?.failed_object_requests === manifest.failures.length &&
    manifest.failures.every(item => Number.isInteger(item.requested_object_id) && item.requested_object_id > 0 &&
      typeof item.error_class === "string" && item.error_class.length > 0),
  "Object failure accounting is incomplete.");
}

for (const request of manifest?.request_log ?? []) {
  assert(/^https:\/\/collectionapi\.metmuseum\.org\//.test(request.url), "Request URL is outside the Met allowlist.");
  assert(request.method === "GET", "Only GET requests are allowed.");
  assert(strictUtc(request.requested_at) && strictUtc(request.completed_at), "Request observation timestamps are required.");
  assert(request.provider_call_attempted === true && Number.isInteger(request.attempt) && request.attempt >= 1,
    "Request attempt accounting is incomplete.");
  assert(typeof request.response_accepted === "boolean" &&
    (request.response_accepted ? request.error_class === null : typeof request.error_class === "string"),
  "Request acceptance decision is missing or inconsistent.");
  assert((Number.isInteger(request.status) && /^[a-f0-9]{64}$/.test(request.response_sha256 ?? "")) ||
    (request.status === null && request.response_sha256 === null && typeof request.error_class === "string"),
  "Request outcome or response hash is invalid.");
  assert(request.retry_backoff_ms === null || (Number.isInteger(request.retry_backoff_ms) && request.retry_backoff_ms >= 250 && request.retry_backoff_ms <= 5000),
    "Retry backoff is outside the governed bound.");
}

const ids = new Set();
for (const record of records ?? []) {
  assert(!ids.has(record.source_object_id), `Duplicate source object ID: ${record.source_object_id}`);
  ids.add(record.source_object_id);
  assert(record.source_id === "met-costume-institute-open-access", `${record.evidence_id}: source mismatch.`);
  assert(/^\d+$/.test(record.source_object_id ?? "") && record.evidence_id === `met:${record.source_object_id}`,
    `${record.evidence_id}: exact object identity binding is invalid.`);
  assert(record.source_tier === 1, `${record.evidence_id}: source tier mismatch.`);
  assert(record.source_layer === "OPEN_AUTHORITY", `${record.evidence_id}: source layer mismatch.`);
  assert(record.evidence_role === "REFERENCE_DISCOVERY", `${record.evidence_id}: evidence role mismatch.`);
  assert(record.market_observation_type === "NONE" && record.current_sold_eligible === false,
    `${record.evidence_id}: Current-SOLD laundering detected.`);
  assert(record.candidate_r2_input_role === "REFERENCE_DISCOVERY_PREFLIGHT_ONLY",
    `${record.evidence_id}: Candidate pathway role mismatch.`);
  assert(record.evidence_class === "PRIMARY_AUTHORITY", `${record.evidence_id}: evidence class mismatch.`);
  assert(typeof record.is_public_domain === "boolean", `${record.evidence_id}: object public-domain flag is missing.`);
  assert(record.metadata_rights_state === "CC0_COLLECTION_METADATA", `${record.evidence_id}: metadata rights state mismatch.`);
  assert(record.department === "The Costume Institute" &&
    [record.accession_number, record.title, record.object_name, record.object_url]
      .every(value => typeof value === "string" && value.trim().length > 0),
  `${record.evidence_id}: required Costume Institute object schema is incomplete.`);
  assert(
    ["PUBLIC_DOMAIN_FLAG_TRUE_NOT_INGESTED", "NOT_PUBLIC_DOMAIN_OR_UNAVAILABLE_NOT_INGESTED"].includes(record.image_rights_state),
    `${record.evidence_id}: image rights state mismatch.`
  );
  assert(record.image_state === "NOT_INGESTED", `${record.evidence_id}: image state mismatch.`);
  assert(/^https:\/\/collectionapi\.metmuseum\.org\//.test(record.evidence_reference),
    `${record.evidence_id}: provenance URL is missing or outside the allowlist.`);
  assert(record.evidence_reference.endsWith(`/objects/${record.source_object_id}`) &&
    record.source_url === record.evidence_reference, `${record.evidence_id}: requested object URL lineage mismatch.`);
  assert(/^[a-f0-9]{64}$/.test(record.source_payload_sha256), `${record.evidence_id}: payload hash is invalid.`);
  assert(strictUtc(record.observed_at) && strictUtc(record.observation_valid_until),
    `${record.evidence_id}: source/time binding is invalid.`);
  assert(new Date(record.observed_at).getTime() <= validationNow + futureToleranceMs,
    `${record.evidence_id}: observation timestamp is in the future.`);
  assert(new Date(record.observation_valid_until).getTime() - new Date(record.observed_at).getTime() === maximumObservationAgeMs,
    `${record.evidence_id}: observation validity window is invalid.`);
  assert(validationNow <= new Date(record.observation_valid_until).getTime(),
    `${record.evidence_id}: observation is stale or expired.`);
  assert(record.license_provenance?.repository_contract_sha256 === contractDigest,
    `${record.evidence_id}: license provenance digest mismatch.`);
  assert(record.publication_state === "POC_INTERNAL_ONLY", `${record.evidence_id}: publication state mismatch.`);
  assert(!("primary_image" in record) && !("primaryImage" in record), `${record.evidence_id}: image URL leaked into normalized output.`);
}

for (const item of raw ?? []) {
  assert(item.raw_payload_state === "SANITIZED_METADATA_ONLY", `${item.source_object_id}: raw state mismatch.`);
  assert(item.image_downloaded === false, `${item.source_object_id}: raw image flag mismatch.`);
  assert(item.license_contract_sha256 === contractDigest, `${item.source_object_id}: raw rights contract binding mismatch.`);
  assert(String(item.metadata?.objectID) === item.source_object_id && item.metadata?.department === "The Costume Institute" &&
    item.source_url?.endsWith(`/objects/${item.source_object_id}`),
  `${item.source_object_id}: raw requested/payload object identity binding mismatch.`);
  assert(Object.keys(item.metadata ?? {}).every(key => rawMetadataAllowlist.has(key)),
    `${item.source_object_id}: raw metadata contains a field outside the explicit allowlist.`);
  assert(!("primaryImage" in (item.metadata ?? {})), `${item.source_object_id}: primaryImage was not sanitized.`);
  assert(!("primaryImageSmall" in (item.metadata ?? {})), `${item.source_object_id}: primaryImageSmall was not sanitized.`);
  assert(!("additionalImages" in (item.metadata ?? {})), `${item.source_object_id}: additionalImages was not sanitized.`);
}

assert(evidence?.status === (providerFailed
  ? "PROVIDER_READ_FAILED_NOT_EVIDENCE_NOT_CANDIDATE"
  : minimumFailed
    ? "INSUFFICIENT_RECORDS_NOT_EVIDENCE_NOT_CANDIDATE"
    : "POC_EVIDENCE_NOT_CANDIDATE"),
  "Evidence Package terminal status mismatch.");
assert(evidence?.snapshot_id === null, "PoC Evidence Package must not invent a Snapshot ID.");
assert(evidence?.record_count === records?.length, "Evidence Package record count mismatch.");
assert(evidence?.production_eligible === false, "Evidence Package must not be Production eligible.");
assert(evidence?.evidence_role === "REFERENCE_DISCOVERY" && evidence?.market_observation_type === "NONE" &&
  evidence?.current_sold_eligible === false, "Evidence Package crossed the reference/market boundary.");
assert(evidence?.license_provenance?.repository_contract_sha256 === contractDigest, "Evidence Package license binding mismatch.");
assert(quality?.metadata_rights_state === "CC0_COLLECTION_METADATA", "Quality report metadata-rights state mismatch.");
assert(quality?.duplicate_record_count === 0, "Duplicate contamination must be zero in the bounded sample.");
assert(quality?.provenance_reference_coverage === (records?.length ? 1 : 0),
  "Provenance coverage does not match terminal state.");
assert(quality?.image_ingestion_count === 0, "Image ingestion count must remain zero.");
assert(quality?.candidate_eligible === false, "Single-source sample must not be Candidate eligible.");
assert(quality?.zero_candidate_terminal === terminalZero, "Zero-candidate terminal receipt mismatch.");
assert(quality?.current_sold_transaction_count === 0, "Quality report must preserve Current-SOLD count zero.");

if (errors.length) {
  console.error(`KIDULTS Met Open Access Sample: FAIL (${errors.length})`);
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}

console.log(`KIDULTS Met Open Access Sample: PASS (${manifest.status})`);
console.log(`Records: ${records.length}`);
console.log(`Public-domain image flag true: ${quality.public_domain_record_count}`);
console.log(`Average critical-field completeness: ${quality.average_critical_field_completeness}`);
console.log("Metadata rights: CC0");
console.log(`Provenance coverage: ${quality.provenance_reference_coverage}`);
console.log("Images ingested: 0");
console.log("Candidate eligible: NO");
