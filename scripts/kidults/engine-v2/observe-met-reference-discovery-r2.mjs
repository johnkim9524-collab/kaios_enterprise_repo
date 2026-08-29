import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { validateMetReferenceDiscovery } from "../autonomous/validate-met-open-access-sample.mjs";

function sha256(value) {
  return `sha256:${crypto.createHash("sha256").update(value).digest("hex")}`;
}

function writeJson(directory, name, value) {
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, name), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function parseArgs(argv) {
  const options = {
    metDir: null,
    output: "artifacts/agci-os/candidate-r2-reference-observer-r1",
    requireSource: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--met-dir") options.metDir = argv[++index];
    else if (argv[index] === "--output") options.output = argv[++index];
    else if (argv[index] === "--require-source") options.requireSource = true;
    else throw new Error(`Unknown argument: ${argv[index]}`);
  }
  return options;
}

export function observeMetReferenceDiscovery({ metDir = null, output, requireSource = false, now = new Date() }) {
  let state = "HOLD_NO_GOVERNED_MET_RECEIPT";
  let sourceStatus = "NOT_SUPPLIED";
  let sourceReceiptDigest = null;
  let sourceRunId = null;
  let dynamicRecordCount = 0;
  let sourceErrors = [];

  const sourcePresent = typeof metDir === "string" &&
    fs.existsSync(path.join(path.resolve(metDir), "terminal-receipt.json"));
  if (sourcePresent) {
    const sourceDirectory = path.resolve(metDir);
    const sourceTerminalRaw = fs.readFileSync(path.join(sourceDirectory, "terminal-receipt.json"));
    const manifest = JSON.parse(fs.readFileSync(path.join(sourceDirectory, "run-manifest.json"), "utf8"));
    const validation = validateMetReferenceDiscovery(sourceDirectory, now);
    sourceStatus = manifest.status;
    sourceReceiptDigest = sha256(sourceTerminalRaw);
    sourceRunId = manifest.run_id;
    dynamicRecordCount = manifest.normalized_records;
    sourceErrors = validation.errors;
    if (validation.errors.length || sourceStatus === "FAILED_REFERENCE_DISCOVERY") {
      state = "FAIL_CLOSED_INPUT_REJECTED";
    } else if (sourceStatus === "TERMINAL_ZERO_REFERENCE_DISCOVERY") {
      state = "TERMINAL_ZERO_OBSERVED_NO_CANDIDATE";
    } else if (sourceStatus === "COMPLETED_REFERENCE_DISCOVERY") {
      state = "REFERENCE_DISCOVERY_OBSERVED_NO_CANDIDATE";
    } else {
      state = "FAIL_CLOSED_INPUT_REJECTED";
      sourceErrors.push("UNRECOGNIZED_SOURCE_TERMINAL_STATE");
    }
  }

  const receipt = {
    receipt_id: `candidate-r2-met-reference-observer-${process.env.GITHUB_RUN_ID ?? "offline"}-${process.env.GITHUB_RUN_ATTEMPT ?? "1"}`,
    version: "1.0.0",
    generated_at: now.toISOString(),
    state,
    source_id: "met-costume-institute-open-access",
    source_run_id: sourceRunId,
    source_status: sourceStatus,
    source_terminal_receipt_sha256: sourceReceiptDigest,
    dynamic_record_count: dynamicRecordCount,
    source_validation_errors: sourceErrors,
    observer_provider_call_count: 0,
    observer_credential_count: 0,
    committed_met_shadow_input_count: 0,
    committed_vam_shadow_input_count: 0,
    vam_operational_state: "HOLD_EXTERNAL_RIGHTS_VERIFIER_NOT_IMPLEMENTED",
    vam_provider_call_count: 0,
    market_observation_type: "NONE",
    current_sold_observation_count: 0,
    canonical_candidate_state: "NONE",
    canonical_evidence_state: "NONE",
    immutable_candidate_evidence_pair_created: false,
    track_b_state: "NOT_STARTED",
    rankability_assessment_state: "NOT_CREATED",
    approved_projection_state: "NONE",
    publication: "HOLD",
    production: "HOLD",
    g5: "HOLD"
  };
  receipt.receipt_sha256 = sha256(JSON.stringify(receipt));
  writeJson(path.resolve(output), "candidate-r2-observer-receipt.json", receipt);

  const validObservedState = [
    "REFERENCE_DISCOVERY_OBSERVED_NO_CANDIDATE",
    "TERMINAL_ZERO_OBSERVED_NO_CANDIDATE"
  ].includes(state);
  const exitCode = (requireSource && !validObservedState) || state === "FAIL_CLOSED_INPUT_REJECTED" ? 2 : 0;
  return { receipt, exitCode };
}

function main() {
  const result = observeMetReferenceDiscovery(parseArgs(process.argv.slice(2)));
  console.log(JSON.stringify({
    state: result.receipt.state,
    observer_provider_calls: 0,
    vam_provider_calls: 0,
    current_sold: 0,
    candidate: "NONE",
    evidence: "NONE",
    track_b: "NOT_STARTED"
  }, null, 2));
  process.exitCode = result.exitCode;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
