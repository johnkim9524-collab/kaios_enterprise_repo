import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha(value) {
  return `sha256:${crypto.createHash("sha256").update(stableJson(value)).digest("hex")}`;
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

export function validateLivePublicMetadataPathway(directory) {
  const output = path.resolve(directory);
  const errors = [];
  const assert = (condition, message) => { if (!condition) errors.push(message); };
  const run = read(output, "run-manifest.json", errors);
  const quarantine = read(output, "raw-quarantine-report.json", errors);
  const universe = read(output, "universe-admission-report.json", errors);
  const evidenceGraph = read(output, "evidence-graph-shadow.json", errors);
  const marketGraph = read(output, "market-graph-shadow.json", errors);
  const receipt = read(output, "candidate-r2-pathway-receipt.json", errors);
  const contractDigests = Object.fromEntries([
    ["met-costume-institute-open-access", "coordination/kidults/autonomous/source-discovery/contracts/met-costume-open-access-r1.json"],
    ["vam-collections-api-fashion", "coordination/kidults/autonomous/source-discovery/contracts/vam-fashion-collections-r1.json"]
  ].map(([sourceId, file]) => [sourceId, `sha256:${crypto.createHash("sha256").update(fs.readFileSync(file, "utf8")).digest("hex")}`]));

  assert(run?.input_mode === "LIVE_MET_VAM_PUBLIC_METADATA", "LIVE_MET_VAM_INPUT_MODE_REQUIRED");
  assert(run?.run_mode === "LIVE_PUBLIC_METADATA_REFERENCE_DISCOVERY_PLUS_HISTORICAL_TRANSACTION_PREFLIGHT",
    "LIVE_PATHWAY_RUN_MODE_MISMATCH");
  assert(run?.declared_source_family_count === 5, "DECLARED_FIVE_SOURCE_FAMILIES_REQUIRED");
  assert(Array.isArray(run?.source_observations) && run.source_observations.length === 2,
    "MET_VAM_SOURCE_OBSERVATIONS_REQUIRED");
  assert(run?.candidate_r2_state === "NOT_CREATED_GOLDEN_DATASET_AND_STRESS_EXIT_PENDING",
    "CANDIDATE_R2_MUST_REMAIN_NOT_CREATED");
  assert(run?.immutable_candidate_evidence_pair_created === false && run?.snapshot_candidate_created === false &&
    run?.immutable_evidence_package_created === false, "IMMUTABLE_PAIR_MUST_NOT_BE_CREATED_BY_PREFLIGHT");
  assert(run?.track_b_submission_count === 0 && run?.track_b_assessment_count === 0 && run?.track_b_pass_count === 0,
    "TRACK_B_BOUNDARY_VIOLATION");
  assert(run?.current_sold_transaction_count === 0, "PUBLIC_METADATA_CURRENT_SOLD_COUNT_NONZERO");
  assert(run?.publication_eligible === false && run?.production_eligible === false && run?.production_mutation === 0,
    "PUBLICATION_OR_PRODUCTION_BOUNDARY_VIOLATION");
  assert(run?.provider_to_portal_direct_paths === 0 && run?.provider_to_index_direct_paths === 0,
    "DIRECT_PROVIDER_CONSUMPTION_PATH_DETECTED");

  const observations = new Map((run?.source_observations ?? []).map(item => [item.source_id, item]));
  const metObservation = observations.get("met-costume-institute-open-access");
  const vamObservation = observations.get("vam-collections-api-fashion");
  assert(Boolean(metObservation) && Boolean(vamObservation), "EXACT_MET_VAM_OBSERVATIONS_REQUIRED");
  assert(["COMPLETED", "TERMINAL_ZERO_CANDIDATE"].includes(metObservation?.status),
    "MET_LIVE_TERMINAL_STATE_INVALID");
  assert(Number.isInteger(metObservation?.provider_call_count) && metObservation.provider_call_count >= 1,
    "MET_PROVIDER_CALL_COUNT_REQUIRED");
  assert(vamObservation?.status === "HOLD_EXTERNAL_RIGHTS_VERIFIER_NOT_IMPLEMENTED",
    "VAM_EXTERNAL_VERIFIER_HARD_HOLD_REQUIRED");
  assert(vamObservation?.provider_call_count === 0 && vamObservation?.normalized_records === 0 &&
    vamObservation?.license_provenance === null &&
    vamObservation?.rights_scope_gate?.reason === "EXTERNAL_RIGHTS_VERIFIER_NOT_IMPLEMENTED",
  "VAM_HARD_HOLD_RECEIPT_INVALID");
  const runAtMs = new Date(run?.generated_at).getTime();
  const validationNow = Date.now();
  const futureToleranceMs = 5 * 60_000;
  assert(strictUtc(run?.generated_at) && runAtMs <= validationNow + futureToleranceMs,
    "LIVE_PATHWAY_RUN_TIMESTAMP_INVALID_OR_FUTURE");
  assert(validationNow - runAtMs <= 7 * 86_400_000, "LIVE_PATHWAY_RUN_IS_STALE");
  for (const observation of [metObservation, vamObservation].filter(Boolean)) {
    assert(strictUtc(observation.observed_at), `${observation.source_id}: SOURCE_OBSERVED_AT_REQUIRED`);
    const observedAtMs = new Date(observation.observed_at).getTime();
    assert(observedAtMs <= runAtMs + futureToleranceMs, `${observation.source_id}: SOURCE_OBSERVED_AT_AFTER_RUN`);
    assert(runAtMs - observedAtMs <= 7 * 86_400_000, `${observation.source_id}: SOURCE_OBSERVATION_STALE`);
    if (process.env.GITHUB_ACTIONS === "true") {
      assert(observation.runtime_lineage?.git_sha === process.env.GITHUB_SHA,
        `${observation.source_id}: EXACT_RUNTIME_SHA_BINDING_REQUIRED`);
      assert(/^\d+$/.test(process.env.GITHUB_RUN_ID ?? "") &&
        observation.runtime_lineage?.github_run_id === Number(process.env.GITHUB_RUN_ID),
        `${observation.source_id}: RUNTIME_RUN_ID_BINDING_REQUIRED`);
      assert(/^\d+$/.test(process.env.GITHUB_RUN_ATTEMPT ?? "") &&
        observation.runtime_lineage?.github_run_attempt === Number(process.env.GITHUB_RUN_ATTEMPT),
      `${observation.source_id}: RUNTIME_RUN_ATTEMPT_BINDING_REQUIRED`);
    }
    if (["COMPLETED", "TERMINAL_ZERO_CANDIDATE"].includes(observation.status)) {
      assert(/^sha256:[a-f0-9]{64}$/.test(observation.license_provenance?.repository_contract_sha256 ?? ""),
        `${observation.source_id}: LICENSE_CONTRACT_DIGEST_REQUIRED`);
      assert(observation.license_provenance?.repository_contract_sha256 === contractDigests[observation.source_id],
        `${observation.source_id}: LICENSE_CONTRACT_DIGEST_MISMATCH`);
    }
    if (observation.status === "COMPLETED") {
      assert(observation.normalized_records >= observation.minimum_records && observation.minimum_records >= 1,
        `${observation.source_id}: COMPLETED_RECORD_FLOOR_NOT_MET`);
    }
    if (observation.status === "TERMINAL_ZERO_CANDIDATE") {
      assert(observation.normalized_records === 0, `${observation.source_id}: ZERO_TERMINAL_RECORDS_NONZERO`);
    }
    if (observation.status === "HOLD_EXTERNAL_RIGHTS_VERIFIER_NOT_IMPLEMENTED") {
      assert(observation.provider_call_count === 0, `${observation.source_id}: RIGHTS_HOLD_PROVIDER_CALL_NONZERO`);
      assert(typeof observation.rights_scope_gate?.reason === "string",
        `${observation.source_id}: RIGHTS_HOLD_REASON_REQUIRED`);
      assert(observation.license_contract_sha256 === contractDigests[observation.source_id],
        `${observation.source_id}: RIGHTS_HOLD_CONTRACT_DIGEST_MISMATCH`);
    }
  }

  const zeroSources = run?.zero_candidate_source_ids ?? [];
  const rightsHoldSources = run?.rights_hold_source_ids ?? [];
  const honestHold = zeroSources.length > 0 || rightsHoldSources.length > 0;
  if (honestHold) {
    assert(run?.state === "CANDIDATE_R2_PATHWAY_HOLD", "HONEST_TERMINAL_MUST_HOLD_CANDIDATE_PATHWAY");
    assert(["ZERO_CANDIDATE_TERMINAL_NO_IMMUTABLE_PAIR", "HOLD_EXTERNAL_RIGHTS_VERIFIER_NOT_IMPLEMENTED", "FAIL_CLOSED_INPUT_REJECTED"].includes(run?.candidate_r2_pathway_state),
      "HONEST_TERMINAL_PATHWAY_STATE_MISMATCH");
  } else {
    assert(run?.state === "CANDIDATE_R2_PREFLIGHT_PARTIAL_PASS", "LIVE_READY_PREFLIGHT_STATE_MISMATCH");
    assert(run?.candidate_r2_pathway_state === "PREFLIGHT_READY_IMMUTABLE_PAIR_STILL_REQUIRED",
      "LIVE_READY_PATHWAY_STATE_MISMATCH");
    assert(run?.source_family_count === 5 && run?.authority_source_family_count === 4 && run?.transaction_source_family_count === 1,
      "OBSERVED_SOURCE_FAMILY_COVERAGE_MISMATCH");
  }

  const criticalRejectionReasons = new Set([
    "STALE_OBSERVATION",
    "FUTURE_OBSERVATION",
    "OBSERVATION_VALIDITY_WINDOW_INVALID_OR_EXPIRED",
    "RIGHTS_STATE_MISSING",
    "LICENSE_PROVENANCE_INVALID",
    "PUBLIC_METADATA_ROLE_INVALID",
    "PUBLIC_METADATA_MARKET_EVENT_LAUNDERING",
    "PUBLIC_METADATA_CURRENT_SOLD_LAUNDERING",
    "VAM_EXTERNAL_VERIFIER_HARD_HOLD",
    "EVALUATION_TIMESTAMP_STALE_OR_FUTURE"
  ]);
  for (const rejected of quarantine?.quarantined_records ?? []) {
    const critical = (rejected.reasons ?? []).filter(reason => criticalRejectionReasons.has(reason));
    assert(critical.length === 0, `${rejected.record_id}: LIVE_INPUT_FAIL_CLOSED:${critical.join("+")}`);
  }

  assert(universe?.declared_source_family_count === 5, "UNIVERSE_DECLARED_SOURCE_COUNT_MISMATCH");
  assert(universe?.global_universe_object_count_mutated === false && universe?.public_projection === false &&
    universe?.index_eligible === false && universe?.production_eligible === false,
  "UNIVERSE_ADMISSION_BOUNDARY_VIOLATION");
  assert(universe?.market_event_admission_candidates?.every(event =>
    !["met-costume-institute-open-access", "vam-collections-api-fashion"].includes(event.source_id)),
  "MET_VAM_PROMOTED_TO_MARKET_EVENT");

  for (const record of universe?.authority_admission_candidates ?? []) {
    assert(record.source_id !== "vam-collections-api-fashion", `${record.source_record_id}: VAM_HARD_HOLD_RECORD_ADMITTED`);
    if (!["met-costume-institute-open-access", "vam-collections-api-fashion"].includes(record.source_id)) continue;
    assert(record.live_metadata_binding === true, `${record.source_record_id}: LIVE_BINDING_REQUIRED`);
    assert(record.evidence_role === "REFERENCE_DISCOVERY" && record.market_observation_type === "NONE" &&
      record.current_sold_eligible === false, `${record.source_record_id}: REFERENCE_CURRENT_SOLD_BOUNDARY_VIOLATION`);
    assert(strictUtc(record.observed_at) && strictUtc(record.observation_valid_until) &&
      new Date(record.observation_valid_until).getTime() > new Date(record.observed_at).getTime(),
    `${record.source_record_id}: SOURCE_TIME_BINDING_INVALID`);
    assert(new Date(record.observed_at).getTime() <= runAtMs + futureToleranceMs &&
      runAtMs <= new Date(record.observation_valid_until).getTime(),
    `${record.source_record_id}: SOURCE_TIME_WINDOW_STALE_OR_FUTURE`);
    assert(/^https:\/\//.test(record.provenance_reference ?? "") && /^[a-f0-9]{64}$/.test(record.source_payload_sha256 ?? ""),
      `${record.source_record_id}: SOURCE_PROVENANCE_BINDING_INVALID`);
    assert(/^sha256:[a-f0-9]{64}$/.test(record.license_provenance?.repository_contract_sha256 ?? "") &&
      Array.isArray(record.license_provenance?.official_policy_urls) &&
      record.license_provenance.official_policy_urls.every(value => /^https:\/\//.test(value)),
    `${record.source_record_id}: RIGHTS_PROVENANCE_BINDING_INVALID`);
    assert(record.license_provenance?.repository_contract_sha256 === contractDigests[record.source_id],
      `${record.source_record_id}: RIGHTS_CONTRACT_DIGEST_MISMATCH`);
  }

  assert(evidenceGraph?.metric_support?.current_demand === "NOT_VERIFIED" &&
    evidenceGraph?.metric_support?.scarcity === "NOT_VERIFIED" &&
    evidenceGraph?.metric_support?.current_valuation === "NOT_VERIFIED" &&
    evidenceGraph?.metric_support?.liquidity === "NOT_VERIFIED",
  "PUBLIC_METADATA_LAUNDERED_INTO_CURRENT_MARKET_METRIC");
  assert(marketGraph?.current_market_metrics_verified === 0 && marketGraph?.listing_is_sale === false,
    "MARKET_GRAPH_CURRENT_OR_LISTING_BOUNDARY_VIOLATION");

  assert(receipt?.candidate_r2_activation === "NOT_ACTIVATED_IMMUTABLE_PAIR_REQUIRED",
    "PATHWAY_RECEIPT_CANDIDATE_ACTIVATION_MISMATCH");
  assert(receipt?.immutable_candidate_evidence_pair_created === false && receipt?.track_b_submission_count === 0 &&
    receipt?.track_b_assessment_count === 0 && receipt?.track_b_pass_count === 0,
  "PATHWAY_RECEIPT_HANDOFF_BOUNDARY_VIOLATION");
  assert(receipt?.current_sold_transaction_count === 0 && receipt?.publication === "HOLD" &&
    receipt?.production === "HOLD" && receipt?.g5 === "HOLD", "PATHWAY_RECEIPT_RELEASE_BOUNDARY_VIOLATION");
  if (receipt) {
    const { receipt_fingerprint: fingerprint, ...payload } = receipt;
    assert(fingerprint === sha(payload), "PATHWAY_RECEIPT_FINGERPRINT_MISMATCH");
    assert(run?.output_fingerprints?.["candidate-r2-pathway-receipt.json"] === fingerprint,
      "PATHWAY_RECEIPT_MANIFEST_BINDING_MISMATCH");
  }

  for (const forbidden of ["snapshot-candidate.json", "evidence-package.json", "rankability-assessment.json", "approved-projection.json"]) {
    assert(!fs.existsSync(path.join(output, forbidden)), `FORBIDDEN_PREFLIGHT_OUTPUT_PRESENT:${forbidden}`);
  }

  return { errors, state: run?.state ?? "UNKNOWN", pathway_state: run?.candidate_r2_pathway_state ?? "UNKNOWN" };
}

function main() {
  const directory = process.argv[2] ?? "artifacts/agci-os/candidate-r2-preflight-r1";
  const result = validateLivePublicMetadataPathway(directory);
  if (result.errors.length) {
    console.error(`Candidate R2 live public-metadata pathway: FAIL (${result.errors.length})`);
    for (const error of result.errors) console.error(`ERROR: ${error}`);
    process.exit(1);
  }
  console.log(`Candidate R2 live public-metadata pathway: VERIFIED (${result.pathway_state})`);
  console.log("Candidate R2: NOT_ACTIVATED_IMMUTABLE_PAIR_REQUIRED");
  console.log("Track B: NOT_STARTED");
  console.log("Current-SOLD from Met/V&A: 0");
  console.log("Public / Production / G5: HOLD");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
