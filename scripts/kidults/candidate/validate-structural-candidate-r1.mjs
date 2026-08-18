import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const candidateId = "candidate-structural-20260816-r1";
const candidateDir = path.join(root, "coordination", "kidults", "candidates", candidateId);
const registryRoot = path.join(root, "coordination", "kidults", "registry");
const errors = [];

function read(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    errors.push(`${path.relative(root, file)}: ${error.message}`);
    return null;
  }
}
function assert(condition, message) { if (!condition) errors.push(message); }

const candidate = read(path.join(candidateDir, "snapshot-candidate.json"));
const evidence = read(path.join(candidateDir, "evidence-package.json"));
const signal = read(path.join(candidateDir, "signal-package.json"));
const snapshotIndex = read(path.join(registryRoot, "snapshot", "index.json"));
const snapshotRecord = read(path.join(registryRoot, "snapshot", "records", `${candidateId}.json`));
const baseline = read(path.join(registryRoot, "snapshot", "records", "baseline-provider-independent-v1.json"));
const evidenceIndex = read(path.join(registryRoot, "evidence", "index.json"));
const methodology = read(path.join(registryRoot, "methodology", "index.json"));
const lineage = read(path.join(registryRoot, "evidence-lineage", "index.json"));
const handoff = read(path.join(registryRoot, "handoff", "records", "handoff-a-to-b-first-candidate.json"));
const assessmentIndex = read(path.join(registryRoot, "assessment", "index.json"));
const historicalAssessmentRef = assessmentIndex?.records?.find(record => record.id === "assessment-candidate-structural-20260816-r1-v1");
const historicalAssessment = historicalAssessmentRef ? read(path.join(registryRoot, "assessment", historicalAssessmentRef.path)) : null;

assert(candidate?.snapshot_id === candidateId, "Candidate snapshot_id mismatch.");
assert(candidate?.status === "internal", "Candidate must remain internal.");
assert(candidate?.candidate_class === "STRUCTURAL_VALIDATION_CANDIDATE", "Candidate class mismatch.");
assert(candidate?.publication_eligible === false, "Candidate must not be publication eligible.");
assert(candidate?.production_eligible === false, "Candidate must not be Production eligible.");
assert(candidate?.methodology_version === methodology?.current_record_id, "Methodology pointer mismatch.");
assert(candidate?.evidence_lineage_version === lineage?.current_record_id, "Evidence Lineage pointer mismatch.");
assert(candidate?.evidence_package_id === evidence?.evidence_package_id, "Candidate Evidence Package mismatch.");
assert(candidate?.signal_package_id === signal?.signal_package_id, "Candidate Signal Package mismatch.");
assert(evidence?.snapshot_id === candidateId, "Evidence Package snapshot_id mismatch.");
assert(signal?.snapshot_id === candidateId, "Signal Package snapshot_id mismatch.");
assert(snapshotRecord?.artifact_reference?.endsWith("/snapshot-candidate.json"), "Snapshot artifact reference missing.");
assert(baseline?.snapshot_id === "baseline-provider-independent-v1", "Baseline ID changed.");
assert(baseline?.current_candidate === false, "Baseline was mutated into a Candidate.");

const snapshotHistoryRef = snapshotIndex?.records?.find(record => record.id === candidateId);
assert(Boolean(snapshotHistoryRef), "Historical structural Candidate must remain registered.");
assert(snapshotHistoryRef?.status === "HISTORICAL_INTERNAL_NOT_CURRENT", "Structural Candidate must be historical, not current.");
assert(snapshotIndex?.current_candidate_snapshot_id === null, "Current Candidate authority must be empty until bounded real PoC creates a new candidate.");
const evidenceHistoryRef = evidenceIndex?.records?.find(record => record.id === evidence?.evidence_package_id);
assert(Boolean(evidenceHistoryRef), "Historical structural Evidence Package must remain registered.");
assert(evidenceHistoryRef?.status === "HISTORICAL_CANDIDATE_EVIDENCE_NOT_CURRENT", "Structural Evidence must be historical, not current authority.");
assert(evidenceIndex?.current_evidence_package_id === null, "Current Evidence Package must be empty until bounded real PoC creates a new package.");

assert(["SUBMITTED", "ACCEPTED", "CLOSED"].includes(handoff?.status), "Track A handoff is not in an allowed post-submission state.");
assert(handoff?.snapshot_id === candidateId, "Handoff Candidate mismatch.");
assert(handoff?.evidence_package_id === evidence?.evidence_package_id, "Handoff Evidence Package mismatch.");

assert(Boolean(historicalAssessmentRef), "Historical structural Assessment must remain registered.");
assert(historicalAssessmentRef?.status === "HISTORICAL_COMPLETED_BLOCKED", "Historical structural Assessment status mismatch.");
assert(historicalAssessment?.snapshot_id === candidateId, "Historical Assessment Candidate mismatch.");
assert(historicalAssessment?.evidence_package_id === evidence?.evidence_package_id, "Historical Assessment Evidence Package mismatch.");
assert(historicalAssessment?.gate_state === "blocked", "Historical structural Assessment must preserve blocked gate.");
assert(historicalAssessment?.overall_rankability === false, "Historical structural Candidate must remain non-rankable.");
assert(historicalAssessment?.publication_eligible === false, "Historical Assessment must preserve publication prohibition.");
assert(assessmentIndex?.current_assessment_id === null, "Current Assessment must be empty until a new exact immutable package exists.");
assert(assessmentIndex?.current_snapshot_id === null, "Current Assessment Snapshot pointer must be empty until a new exact package exists.");
assert(assessmentIndex?.status === "WAITING_FOR_SNAPSHOT", "Assessment Registry must wait for a new current snapshot before exact-package validation.");

assert(Array.isArray(candidate?.core_verticals) && candidate.core_verticals.length === 8, "Candidate must contain exactly eight Core Verticals.");
const verticalIds = new Set(candidate?.core_verticals?.map(item => item.vertical_id));
assert(verticalIds.size === 8, "Core Vertical IDs must be unique.");
for (const vertical of candidate?.core_verticals ?? []) {
  const statuses = vertical.metric_status ?? {};
  for (const [statusKey, valueKey] of [["right_data_coverage","right_data_coverage_pct"],["demand","demand_evidence_count"],["demand","demand_evidence_pct"],["scarcity","scarcity_evidence_count"]]) {
    if (statuses[statusKey] === "NOT_VERIFIED") assert(vertical[valueKey] === null, `${vertical.vertical_id}: ${valueKey} must be null while ${statusKey} is NOT_VERIFIED.`);
  }
}
const fashion = candidate?.core_verticals?.find(item => item.vertical_id === "vertical-fashion-accessories");
assert(fashion?.identity_evidence_count === 24, "Fashion identity Evidence count must be 24.");
assert(fashion?.metric_status?.identity_canon === "PARTIALLY_VERIFIED", "Fashion identity status must remain PARTIALLY_VERIFIED.");
for (const vertical of candidate?.core_verticals ?? []) {
  if (vertical.vertical_id !== "vertical-fashion-accessories") {
    assert(vertical.readiness_state === "blocked", `${vertical.vertical_id}: unsupported Vertical must be blocked.`);
    assert(vertical.relevant_count === null, `${vertical.vertical_id}: unsupported relevant_count must be null.`);
  }
}
assert(evidence?.metrics?.source_family_count === 2, "Evidence source-family count mismatch.");
assert(evidence?.metrics?.record_count === 24, "Evidence record count mismatch.");
assert(evidence?.metrics?.duplicate_record_count === 0, "Verified duplicate count must be zero.");
assert(evidence?.metrics?.provenance_reference_coverage === 1, "Provenance coverage must be 100%.");
assert(evidence?.record_digest_manifest?.normalized_record_count === 24, "Evidence record digest manifest must cover 24 records.");
assert(/^sha256:[a-f0-9]{64}$/.test(evidence?.record_digest_manifest?.combined_normalized_records_sha256 ?? ""), "Combined normalized-record digest is missing or invalid.");
assert(Array.isArray(evidence?.artifact_references) && evidence.artifact_references.length === 3, "Exact source and cross-source artifacts must be referenced.");
assert(Object.values(signal?.dimensions ?? {}).every(item => item.status === "NOT_VERIFIED" && item.value === null), "All market signals must remain null and NOT_VERIFIED.");
assert(candidate?.stress_scale_summary?.source_removal_sensitivity === "FAIL_SOURCE_DIVERSITY", "Historical source-removal weakness must be preserved, not hidden.");
assert(candidate?.known_limitations?.length >= 5, "Candidate limitations are incomplete.");

if (errors.length) {
  console.error(`KIDULTS Structural Candidate R1: FAIL (${errors.length})`);
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}
console.log("KIDULTS Structural Candidate R1 historical integrity: PASS");
console.log(`Historical Snapshot: ${candidate.snapshot_id}`);
console.log(`Historical Evidence Package: ${evidence.evidence_package_id}`);
console.log("Current Candidate authority: NONE / WAITING_FOR_BOUNDED_REAL_POC");
console.log("Current Track B Assessment: NONE / WAITING_FOR_SNAPSHOT");
console.log("Publication: PROHIBITED");
console.log("Production: HOLD");
