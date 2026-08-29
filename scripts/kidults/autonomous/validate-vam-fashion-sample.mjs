import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const output = path.resolve(process.argv[2] ?? "artifacts/autonomous-source-samples/vam-fashion-collections-r1");
const contractPath = "coordination/kidults/autonomous/source-discovery/contracts/vam-fashion-collections-r1.json";
const errors = [];
const read = name => {
  try {
    return JSON.parse(fs.readFileSync(path.join(output, name), "utf8"));
  } catch (error) {
    errors.push(`${name}: ${error.message}`);
    return null;
  }
};
const assert = (condition, message) => { if (!condition) errors.push(message); };
const strictUtc = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value);

const manifest = read("run-manifest.json");
const raw = read("sanitized-raw-records.json");
const records = read("normalized-evidence-records.json");
const evidence = read("evidence-package.json");
const quality = read("quality-report.json");
const contractRaw = fs.readFileSync(contractPath, "utf8");
const contract = JSON.parse(contractRaw);
const contractDigest = `sha256:${crypto.createHash("sha256").update(contractRaw).digest("hex")}`;
const validationNow = Date.now();
const futureToleranceMs = 5 * 60_000;
const maximumReceiptAgeMs = Number(contract?.bounded_limits?.maximum_observation_age_hours) * 3_600_000;

assert(contract?.status === "IMPLEMENTED_SCHEDULED_READ_CAPABLE_RIGHTS_SCOPE_HOLD" &&
  contract?.scheduled_activation?.runtime_activation === "HOLD_EXTERNAL_RIGHTS_VERIFIER_NOT_IMPLEMENTED" &&
  contract?.scheduled_activation?.workflow_receipt_secret_binding === "NONE_EXTERNAL_RIGHTS_VERIFIER_NOT_IMPLEMENTED" &&
  contract?.admission_class === "REFERENCE_DISCOVERY_ONLY" && contract?.current_sold_eligible === false,
"Repository contract weakened the V&A hard-HOLD boundary.");
assert(manifest?.status === "HOLD_EXTERNAL_RIGHTS_VERIFIER_NOT_IMPLEMENTED" &&
  manifest?.outcome_class === "FAIL_CLOSED_PRE_PROVIDER_CALL", "V&A must terminate in the external-verifier hard HOLD.");
assert(manifest?.mode === "GOVERNED_SCHEDULED_PUBLIC_METADATA_REFERENCE_DISCOVERY", "Run mode mismatch.");
assert(manifest?.source_id === "vam-collections-api-fashion" && manifest?.source_layer === "OPEN_AUTHORITY",
  "Source identity mismatch.");
assert(manifest?.evidence_role === "REFERENCE_DISCOVERY" && manifest?.market_observation_type === "NONE" &&
  manifest?.current_sold_eligible === false, "V&A HOLD crossed the reference/market boundary.");
assert(manifest?.rights_scope_gate?.authorized === false &&
  manifest?.rights_scope_gate?.reason === "EXTERNAL_RIGHTS_VERIFIER_NOT_IMPLEMENTED" &&
  manifest?.rights_scope_gate?.receipt_content_loaded === false &&
  manifest?.rights_scope_gate?.receipt_claims_accepted === false,
"V&A hard HOLD must not accept or evaluate a receipt.");
assert(manifest?.license_provenance_created === false && !("license_provenance" in (manifest ?? {})),
  "V&A hard HOLD must not create license provenance.");
assert(manifest?.provider_call_count === 0 && manifest?.requests_executed === 0 &&
  Array.isArray(manifest?.request_log) && manifest.request_log.length === 0,
"V&A hard HOLD must stop before DNS or HTTP.");
assert(manifest?.license_contract_sha256 === contractDigest, "V&A HOLD is not bound to the exact contract.");
assert(manifest?.credential_used === false && manifest?.paid_access_used === false && manifest?.image_downloaded === false,
  "V&A HOLD cannot use credentials, paid access, or images.");
assert(manifest?.mutation_performed === false && manifest?.data_admission_performed === false &&
  manifest?.current_sold_transaction_count === 0, "V&A HOLD cannot mutate or admit data.");
assert(manifest?.immutable_candidate_evidence_pair_created === false && manifest?.track_b_submission_count === 0 &&
  manifest?.track_b_assessment_count === 0 && manifest?.production_eligible === false &&
  manifest?.commercial_publication_authorized === false && manifest?.candidate_publication_authorized === false,
"V&A HOLD crossed the Candidate, Track B, publication, or Production boundary.");
assert(Array.isArray(records) && records.length === 0 && Array.isArray(raw) && raw.length === 0,
  "V&A hard HOLD must emit zero source records.");
assert(strictUtc(manifest?.started_at) && strictUtc(manifest?.completed_at), "Strict UTC run timestamps are required.");
assert(new Date(manifest?.completed_at).getTime() >= new Date(manifest?.started_at).getTime(), "Run time window is reversed.");
assert(new Date(manifest?.completed_at).getTime() <= validationNow + futureToleranceMs &&
  validationNow - new Date(manifest?.completed_at).getTime() <= maximumReceiptAgeMs, "V&A HOLD receipt is stale or future-dated.");
if (process.env.GITHUB_ACTIONS === "true") {
  assert(/^[a-f0-9]{40}$/.test(process.env.GITHUB_SHA ?? "") &&
    manifest?.runtime_lineage?.git_sha === process.env.GITHUB_SHA, "Exact GitHub runtime source SHA is required.");
  assert(/^\d+$/.test(process.env.GITHUB_RUN_ID ?? "") &&
    manifest?.runtime_lineage?.github_run_id === Number(process.env.GITHUB_RUN_ID), "Exact GitHub runtime run ID is required.");
  assert(/^\d+$/.test(process.env.GITHUB_RUN_ATTEMPT ?? "") &&
    manifest?.runtime_lineage?.github_run_attempt === Number(process.env.GITHUB_RUN_ATTEMPT),
  "Exact GitHub runtime attempt is required.");
}
assert(evidence?.status === "RIGHTS_HOLD_NOT_EVIDENCE_NOT_CANDIDATE" && evidence?.evidence_package_id === null &&
  evidence?.snapshot_id === null && evidence?.record_count === 0 && evidence?.license_provenance_created === false,
"V&A HOLD must not manufacture Evidence, Candidate, or license provenance.");
assert(evidence?.production_eligible === false && evidence?.commercial_publication_authorized === false &&
  evidence?.evidence_role === "REFERENCE_DISCOVERY" && evidence?.market_observation_type === "NONE" &&
  evidence?.current_sold_eligible === false, "V&A HOLD evidence receipt crossed a release boundary.");
assert(quality?.unique_record_count === 0 && quality?.duplicate_record_count === 0 &&
  quality?.provenance_reference_coverage === 0 && quality?.candidate_eligible === false &&
  quality?.zero_candidate_terminal === false && quality?.current_sold_transaction_count === 0,
"V&A HOLD quality receipt is inconsistent.");

if (errors.length) {
  console.error(`KIDULTS V&A Fashion Sample: FAIL (${errors.length})`);
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}

console.log("KIDULTS V&A Fashion Sample: PASS (HARD HOLD)");
console.log("Provider calls: 0");
console.log("License provenance created: NO");
console.log("Candidate R2: NOT ACTIVATED");
console.log("Track B: NOT STARTED");
