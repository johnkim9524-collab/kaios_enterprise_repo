import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const CONTRACT_PATH = "coordination/kidults/autonomous/source-discovery/contracts/met-costume-open-access-r1.json";
const TERMINAL_STATES = new Set([
  "COMPLETED_REFERENCE_DISCOVERY",
  "TERMINAL_ZERO_REFERENCE_DISCOVERY",
  "FAILED_REFERENCE_DISCOVERY"
]);

function sha256(value) {
  return `sha256:${crypto.createHash("sha256").update(value).digest("hex")}`;
}

function strictUtc(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value);
}

function read(directory, name, errors) {
  try {
    return JSON.parse(fs.readFileSync(path.join(directory, name), "utf8"));
  } catch (error) {
    errors.push(`${name}: ${error.message}`);
    return null;
  }
}

export function validateMetReferenceDiscovery(directory, now = new Date()) {
  const output = path.resolve(directory);
  const errors = [];
  const assert = (condition, message) => { if (!condition) errors.push(message); };
  const manifest = read(output, "run-manifest.json", errors);
  const raw = read(output, "sanitized-raw-records.json", errors);
  const records = read(output, "normalized-evidence-records.json", errors);
  const envelope = read(output, "evidence-package.json", errors);
  const quality = read(output, "quality-report.json", errors);
  const terminal = read(output, "terminal-receipt.json", errors);
  const contractRaw = fs.readFileSync(CONTRACT_PATH, "utf8");
  const contract = JSON.parse(contractRaw);
  const contractDigest = sha256(contractRaw);

  assert(TERMINAL_STATES.has(manifest?.status), "TERMINAL_STATE_INVALID");
  assert(manifest?.mode === "GOVERNED_LIVE_REFERENCE_DISCOVERY", "RUN_MODE_INVALID");
  assert(manifest?.source_id === "met-costume-institute-open-access", "SOURCE_ID_INVALID");
  assert(manifest?.contract_sha256 === contractDigest, "RIGHTS_CONTRACT_DIGEST_MISMATCH");
  assert(manifest?.credential_used === false && manifest?.cost_exposure_usd === 0, "CREDENTIAL_OR_COST_BOUNDARY_VIOLATION");
  assert(manifest?.image_download_count === 0 && manifest?.provider_mutation_count === 0, "IMAGE_OR_PROVIDER_MUTATION_BOUNDARY_VIOLATION");
  assert(Number.isInteger(manifest?.provider_call_count) && manifest.provider_call_count >= 0 &&
    manifest.provider_call_count <= contract.bounded_limits.maximum_logical_requests_per_run,
  "LOGICAL_REQUEST_BUDGET_INVALID");
  assert(Number.isInteger(manifest?.http_attempt_count) && manifest.http_attempt_count >= manifest.provider_call_count &&
    manifest.http_attempt_count <= contract.bounded_limits.maximum_http_attempts_per_run,
  "HTTP_ATTEMPT_BUDGET_INVALID");
  assert(Array.isArray(manifest?.request_log) && manifest.request_log.length === manifest.http_attempt_count,
    "ATTEMPT_LOG_CARDINALITY_MISMATCH");
  for (const attempt of manifest?.request_log ?? []) {
    assert(attempt.provider_call_attempted === true && attempt.method === "GET", "ATTEMPT_NOT_LOGGED_BEFORE_GET");
    assert(/^https:\/\/collectionapi\.metmuseum\.org\//.test(attempt.url ?? ""), "REQUEST_URL_OUTSIDE_ALLOWLIST");
    assert(attempt.final_url === null || /^https:\/\/collectionapi\.metmuseum\.org\//.test(attempt.final_url),
      "FINAL_URL_OUTSIDE_ALLOWLIST");
    assert(strictUtc(attempt.requested_at) && strictUtc(attempt.completed_at), "ATTEMPT_TIME_BINDING_INVALID");
  }

  assert(Array.isArray(raw) && Array.isArray(records) && raw.length === records.length, "RAW_NORMALIZED_CARDINALITY_MISMATCH");
  assert(records?.length === manifest?.normalized_records, "DYNAMIC_RECORD_CARDINALITY_MISMATCH");
  if (manifest?.status === "COMPLETED_REFERENCE_DISCOVERY") {
    assert(records.length >= manifest.minimum_records, "COMPLETED_RECORD_FLOOR_NOT_MET");
  }
  if (manifest?.status === "TERMINAL_ZERO_REFERENCE_DISCOVERY") {
    assert(records.length === 0, "ZERO_TERMINAL_RECORDS_NONZERO");
  }

  const nowMs = now.getTime();
  const ids = new Set();
  for (const record of records ?? []) {
    assert(!ids.has(record.source_object_id), `DUPLICATE_SOURCE_OBJECT:${record.source_object_id}`);
    ids.add(record.source_object_id);
    assert(record.source_id === "met-costume-institute-open-access", "RECORD_SOURCE_INVALID");
    assert(record.reference_role === "REFERENCE_DISCOVERY" &&
      record.admission_state === "REFERENCE_ONLY_NOT_CANONICAL_EVIDENCE", "REFERENCE_ROLE_INVALID");
    assert(record.market_observation_type === "NONE" && record.current_sold_eligible === false,
      "CURRENT_SOLD_LAUNDERING");
    assert(record.metadata_rights_state === "CC0_COLLECTION_METADATA" &&
      record.rights_contract_sha256 === contractDigest, "RECORD_RIGHTS_BINDING_INVALID");
    assert(record.image_state === "NOT_INGESTED" && record.publication_state === "INTERNAL_REFERENCE_ONLY",
      "IMAGE_OR_PUBLICATION_BOUNDARY_INVALID");
    assert(strictUtc(record.observed_at) && strictUtc(record.observation_valid_until), "OBSERVATION_TIME_BINDING_MISSING");
    const observedMs = new Date(record.observed_at).getTime();
    const validUntilMs = new Date(record.observation_valid_until).getTime();
    assert(observedMs <= nowMs + 300_000 && nowMs <= validUntilMs && validUntilMs > observedMs,
      "STALE_OR_FUTURE_OBSERVATION");
    assert(/^https:\/\/collectionapi\.metmuseum\.org\//.test(record.provenance_reference ?? ""),
      "PROVENANCE_REFERENCE_INVALID");
    assert(/^[a-f0-9]{64}$/.test(record.source_payload_sha256 ?? ""), "PAYLOAD_DIGEST_INVALID");
  }

  for (const item of raw ?? []) {
    assert(item.raw_payload_state === "SANITIZED_METADATA_ONLY" && item.image_downloaded === false,
      "RAW_SANITIZATION_STATE_INVALID");
    const serialized = JSON.stringify(item.metadata ?? {});
    assert(!/(primaryImage|primaryImageSmall|additionalImages)/.test(serialized), "IMAGE_FIELD_LEAKED");
  }

  const ceiling = manifest?.claim_ceiling ?? {};
  assert(ceiling.reference_discovery_only === true && ceiling.current_sold_observations === 0,
    "REFERENCE_CLAIM_CEILING_INVALID");
  assert(ceiling.canonical_candidate === "NONE" && ceiling.canonical_evidence === "NONE" &&
    ceiling.immutable_candidate_evidence_pair_created === false, "CANDIDATE_EVIDENCE_BOUNDARY_VIOLATION");
  assert(ceiling.track_b === "NOT_STARTED" && ceiling.approved_projection === "NONE", "TRACK_B_OR_PROJECTION_BOUNDARY_VIOLATION");
  assert(ceiling.public === "HOLD" && ceiling.production === "HOLD" && ceiling.g5 === "HOLD", "RELEASE_BOUNDARY_VIOLATION");
  assert(envelope?.status === "REFERENCE_DISCOVERY_OUTPUT_NOT_CANONICAL_EVIDENCE" &&
    envelope?.snapshot_id === null && envelope?.canonical_evidence_state === "NONE", "OUTPUT_ENVELOPE_OVERCLAIM");
  assert(envelope?.record_count === records?.length, "OUTPUT_ENVELOPE_CARDINALITY_MISMATCH");
  assert(quality?.dynamic_record_count === records?.length && quality?.duplicate_record_count === 0,
    "QUALITY_CARDINALITY_INVALID");
  assert(quality?.image_ingestion_count === 0 && quality?.current_sold_observation_count === 0 &&
    quality?.candidate_eligible === false, "QUALITY_CLAIM_BOUNDARY_INVALID");
  assert(terminal?.terminal_receipt_count === 1 && terminal?.status === manifest?.status &&
    terminal?.contract_sha256 === contractDigest, "EXACTLY_ONE_TERMINAL_RECEIPT_REQUIRED");
  assert(terminal?.provider_call_count === manifest?.provider_call_count &&
    terminal?.http_attempt_count === manifest?.http_attempt_count &&
    terminal?.normalized_record_count === records?.length, "TERMINAL_RECEIPT_BINDING_INVALID");

  if (process.env.GITHUB_ACTIONS === "true") {
    assert(manifest?.runtime_lineage?.git_sha === process.env.GITHUB_SHA, "EXACT_GITHUB_SHA_BINDING_REQUIRED");
    assert(manifest?.runtime_lineage?.github_run_id === Number(process.env.GITHUB_RUN_ID), "EXACT_GITHUB_RUN_ID_BINDING_REQUIRED");
    assert(manifest?.runtime_lineage?.github_run_attempt === Number(process.env.GITHUB_RUN_ATTEMPT),
      "EXACT_GITHUB_RUN_ATTEMPT_BINDING_REQUIRED");
  }

  return { errors, status: manifest?.status ?? "UNKNOWN", recordCount: records?.length ?? 0 };
}

function main() {
  const directory = process.argv[2] ?? "artifacts/autonomous-source-samples/met-costume-open-access-r1";
  const result = validateMetReferenceDiscovery(directory);
  if (result.errors.length) {
    console.error(`KIDULTS Met Reference Discovery: FAIL (${result.errors.length})`);
    for (const error of result.errors) console.error(`ERROR: ${error}`);
    process.exit(1);
  }
  console.log(JSON.stringify({
    validation: "VERIFIED_TERMINAL",
    source_status: result.status,
    dynamic_record_count: result.recordCount,
    current_sold_observations: 0,
    candidate: "NONE",
    evidence: "NONE",
    track_b: "NOT_STARTED",
    public: "HOLD",
    production: "HOLD",
    g5: "HOLD"
  }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
