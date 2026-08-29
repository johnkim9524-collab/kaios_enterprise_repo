import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const CONTRACT_PATH = "coordination/kidults/autonomous/source-discovery/contracts/vam-fashion-collections-r1.json";

const DEFAULTS = Object.freeze({
  query: "dress",
  limit: 12,
  minimumRecords: 8,
  output: "artifacts/autonomous-source-samples/vam-fashion-collections-r1"
});

function parseArgs(argv) {
  const config = { ...DEFAULTS };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--output") config.output = argv[++index];
    else if (argument === "--query") config.query = argv[++index];
    else if (argument === "--limit") config.limit = Number(argv[++index]);
    else if (argument === "--minimum-records") config.minimumRecords = Number(argv[++index]);
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (!Number.isInteger(config.limit) || config.limit < 1 || config.limit > 25) {
    throw new Error("--limit must be an integer between 1 and 25.");
  }
  if (!Number.isInteger(config.minimumRecords) || config.minimumRecords < 1 || config.minimumRecords > config.limit) {
    throw new Error("--minimum-records must be between 1 and --limit.");
  }
  return config;
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function runtimeLineage() {
  return {
    git_sha: /^[a-f0-9]{40}$/.test(process.env.GITHUB_SHA ?? "") ? process.env.GITHUB_SHA : null,
    github_run_id: /^\d+$/.test(process.env.GITHUB_RUN_ID ?? "") ? Number(process.env.GITHUB_RUN_ID) : null,
    github_run_attempt: /^\d+$/.test(process.env.GITHUB_RUN_ATTEMPT ?? "") ? Number(process.env.GITHUB_RUN_ATTEMPT) : null
  };
}

function readContract() {
  const raw = fs.readFileSync(path.resolve(CONTRACT_PATH), "utf8");
  const contract = JSON.parse(raw);
  if (contract.contract_id !== "vam-fashion-collections-r1" ||
      contract.status !== "IMPLEMENTED_SCHEDULED_READ_CAPABLE_RIGHTS_SCOPE_HOLD" ||
      contract.admission_class !== "REFERENCE_DISCOVERY_ONLY" ||
      contract.current_sold_eligible !== false ||
      contract.scheduled_activation?.runtime_activation !== "HOLD_EXTERNAL_RIGHTS_VERIFIER_NOT_IMPLEMENTED" ||
      contract.scheduled_activation?.workflow_receipt_secret_binding !== "NONE_EXTERNAL_RIGHTS_VERIFIER_NOT_IMPLEMENTED") {
    throw new Error("V&A governed source contract is not in the required hard-HOLD state.");
  }
  return { contractDigest: `sha256:${sha256(raw)}` };
}

// No receipt is accepted inside this process. Until a separately protected verifier
// exists, every invocation terminates before DNS, HTTP, or license provenance creation.
export function evaluateRightsScope() {
  return Object.freeze({
    authorized: false,
    reason: "EXTERNAL_RIGHTS_VERIFIER_NOT_IMPLEMENTED",
    provider_call_authorized: false,
    receipt_content_loaded: false,
    receipt_claims_accepted: false,
    license_provenance_created: false
  });
}

function writeJson(directory, name, value) {
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, name), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeHardHold(outputDirectory, config, contractDigest, startedAt) {
  const completedAt = new Date().toISOString();
  const rightsScopeGate = evaluateRightsScope();
  const blockers = [
    rightsScopeGate.reason,
    "V&A_PROVIDER_CALL_NOT_ATTEMPTED",
    "V&A_LICENSE_PROVENANCE_NOT_CREATED",
    "CANDIDATE_R2_NOT_ACTIVATED_IMMUTABLE_PAIR_REQUIRED"
  ];
  const runManifest = {
    run_id: `vam-fashion-collections-hard-hold-${completedAt.replace(/[:.]/g, "-")}`,
    contract_id: "vam-fashion-collections-r1",
    version: "1.2.0",
    status: "HOLD_EXTERNAL_RIGHTS_VERIFIER_NOT_IMPLEMENTED",
    outcome_class: "FAIL_CLOSED_PRE_PROVIDER_CALL",
    started_at: startedAt,
    completed_at: completedAt,
    mode: "GOVERNED_SCHEDULED_PUBLIC_METADATA_REFERENCE_DISCOVERY",
    source_id: "vam-collections-api-fashion",
    source_tier: 1,
    source_layer: "OPEN_AUTHORITY",
    evidence_role: "REFERENCE_DISCOVERY",
    market_observation_type: "NONE",
    current_sold_eligible: false,
    query: config.query,
    target_records: config.limit,
    minimum_records: config.minimumRecords,
    rights_scope_gate: rightsScopeGate,
    runtime_lineage: runtimeLineage(),
    license_contract_sha256: contractDigest,
    license_provenance_created: false,
    requests_executed: 0,
    provider_call_count: 0,
    normalized_records: 0,
    credential_used: false,
    paid_access_used: false,
    image_downloaded: false,
    mutation_performed: false,
    data_admission_performed: false,
    current_sold_transaction_count: 0,
    immutable_candidate_evidence_pair_created: false,
    track_b_submission_count: 0,
    track_b_assessment_count: 0,
    production_eligible: false,
    commercial_publication_authorized: false,
    candidate_publication_authorized: false,
    request_log: []
  };
  const qualityReport = {
    run_id: runManifest.run_id,
    unique_record_count: 0,
    duplicate_record_count: 0,
    provenance_reference_coverage: 0,
    metadata_rights_state: "UNVERIFIED_RUNTIME_HOLD",
    image_ingestion_count: 0,
    minimum_record_gate: runManifest.status,
    candidate_eligible: false,
    zero_candidate_terminal: false,
    current_sold_transaction_count: 0,
    candidate_blockers: blockers
  };
  const evidencePackage = {
    evidence_package_id: null,
    version: "1.2.0",
    status: "RIGHTS_HOLD_NOT_EVIDENCE_NOT_CANDIDATE",
    generated_at: completedAt,
    snapshot_id: null,
    evidence_role: "REFERENCE_DISCOVERY",
    market_observation_type: "NONE",
    current_sold_eligible: false,
    license_provenance_created: false,
    source_ids: ["vam-collections-api-fashion"],
    record_count: 0,
    records: [],
    known_limitations: blockers,
    production_eligible: false,
    commercial_publication_authorized: false
  };
  writeJson(outputDirectory, "run-manifest.json", runManifest);
  writeJson(outputDirectory, "sanitized-raw-records.json", []);
  writeJson(outputDirectory, "normalized-evidence-records.json", []);
  writeJson(outputDirectory, "evidence-package.json", evidencePackage);
  writeJson(outputDirectory, "quality-report.json", qualityReport);
  return runManifest;
}

export async function runVamCollection(config = parseArgs(process.argv.slice(2))) {
  const outputDirectory = path.resolve(config.output);
  const startedAt = new Date().toISOString();
  const { contractDigest } = readContract();
  const runManifest = writeHardHold(outputDirectory, config, contractDigest, startedAt);
  console.log(JSON.stringify({
    status: runManifest.status,
    provider_call_count: 0,
    blocker: runManifest.rights_scope_gate.reason,
    output: config.output
  }));
  return { runManifest, exitCode: 3 };
}

async function main() {
  const result = await runVamCollection(parseArgs(process.argv.slice(2)));
  if (result.exitCode) process.exitCode = result.exitCode;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
