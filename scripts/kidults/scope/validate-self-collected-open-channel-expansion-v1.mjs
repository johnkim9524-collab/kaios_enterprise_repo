#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const directory = process.argv[2] ?? "scope-open-wave1-out";
const receipt = JSON.parse(fs.readFileSync(path.join(directory, "open-channel-expansion-wave1.json"), "utf8"));
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

assert(receipt.status === "HOLD_GOVERNED_MET_OWNER_ONLY", "LEGACY_LANE_NOT_HOLD");
assert(receipt.reason === "LEGACY_MULTI_PROVIDER_COLLECTOR_DISABLED_SINGLE_GOVERNED_MET_OWNER_REQUIRED",
  "LEGACY_HOLD_REASON_INVALID");
assert(receipt.provider_call_count === 0 && receipt.requests_executed === 0,
  "LEGACY_PROVIDER_CALL_COUNT_NONZERO");
assert(receipt.provider_call_counts?.MET_OPEN_ACCESS === 0 &&
  receipt.provider_call_counts?.LOC_JSON_API === 0 &&
  receipt.provider_call_counts?.MUSICBRAINZ_CORE === 0,
"LEGACY_PROVIDER_CALL_BREAKDOWN_NONZERO");
assert(receipt.candidate_count === 0 && Array.isArray(receipt.candidates) && receipt.candidates.length === 0,
  "LEGACY_CANDIDATE_CREATED");
assert(receipt.evidence_record_count === 0 && receipt.immutable_candidate_evidence_pair_created === false,
  "LEGACY_EVIDENCE_CREATED");
assert(receipt.track_b_submission_count === 0 && receipt.track_b_assessment_count === 0,
  "LEGACY_TRACK_B_BYPASS");
assert(receipt.admission_performed === false && receipt.current_sold_transaction_count === 0,
  "LEGACY_ADMISSION_BOUNDARY_CROSSED");
assert(receipt.publication === "HOLD" && receipt.production === "HOLD" && receipt.g5 === "HOLD",
  "LEGACY_RELEASE_HOLD_MISSING");

console.error(JSON.stringify({
  state: "HOLD_VERIFIED",
  status: receipt.status,
  provider_call_count: 0,
  candidate_count: 0
}, null, 2));
process.exitCode = 3;
