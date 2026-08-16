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

function assert(condition, message) {
  if (!condition) errors.push(message);
}

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
const assessmentRef = assessmentIndex?.records?.find(
  record => record.id === assessmentIndex.current_assessment_id
);
const assessmentRecord = assessmentRef
  ? read(path.join(registryRoot, "assessment", assessmentRef.path))
  : null;

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
assert(snapshotIndex?.current_candidate_snapshot_id === candidateId, "Snapshot Registry candidate pointer mismatch.");
assert(snapshotRecord?.artifact_reference?.endsWith("/snapshot-candidate.json"), "Snapshot artifact reference missing.");
assert(baseline?.snapshot_id === "baseline-provider-independent-v1", "Baseline ID changed.");
assert(baseline?.current_candidate === false, "Baseline was mutated into a Candidate.");
assert(evidenceIndex?.current_evidence_package_id === evidence?.evidence_package_id, "Evidence Registry pointer mismatch.");
assert(["SUBMITTED", "ACCEPTED", "CLOSED"].includes(handoff?.status),
  "Track A handoff is not in an allowed post-submission state.");
assert(handoff?.snapshot_id === candidateId, "Handoff Candidate mismatch.");
assert(handoff?.evidence_package_id === evidence?.evidence_package_id, "Handoff Evidence Package mismatch.");
assert(assessmentIndex?.current_snapshot_id === candidateId, "Assessment Registry input pointer mismatch.");

if (assessmentIndex?.current_assessment_id === null) {
  assert(assessmentIndex?.status === "WAITING_FOR_VALIDATION",
    "Assessment Registry must wait for validation before an Assessment exists.");
} else {
  assert(Boolean(assessmentRecord), "Current Assessment record does not resolve.");
  assert(assessmentRecord?.snapshot_id === candidateId,
    "Current Assessment does not reference the exact Candidate.");
  assert(assessmentRecord?.evidence_package_id === evidence?.evidence_package_id,
    "Current Assessment Evidence Package mismatch.");
  assert(assessmentRecord?.gate_state === "blocked",
    "Structural Candidate Assessment must preserve the blocked gate.");
  assert(assessmentRecord?.overall_rankability === false,
    "Structural Candidate must not become rankable after Assessment.");
  assert(assessmentRecord?.publication_eligible === false,
    "Assessment must preserve publication prohibition.");
}

assert(Array.isArray(candidate?.core_verticals) && candidate.core_verticals.length === 8,
  "Candidate must contain exactly eight Core Verticals.");
const verticalIds = new Set(candidate?.core_verticals?.map(item => item.vertical_id));
assert(verticalIds.size === 8, "Core Vertical IDs must be unique.");

for (const vertical of candidate?.core_verticals ?? []) {
  const statuses = vertical.metric_status ?? {};
  const pairs = [
    ["right_data_coverage", "right_data_coverage_pct"],
    ["demand", "demand_evidence_count"],
    ["demand", "demand_evidence_pct"],
    ["scarcity", "scarcity_evidence_count"]
  ];
  for (const [statusKey, valueKey] of pairs) {
    if (statuses[statusKey] === "NOT_VERIFIED") {
      assert(vertical[valueKey] === null,
        `${vertical.vertical_id}: ${valueKey} must be null while ${statusKey} is NOT_VERIFIED.`);
    }
  }
}

const fashion = candidate?.core_verticals?.find(item => item.vertical_id === "vertical-fashion-accessories");
assert(fashion?.identity_evidence_count === 24, "Fashion identity Evidence count must be 24.");
assert(fashion?.metric_status?.identity_canon === "PARTIALLY_VERIFIED",
  "Fashion identity status must remain PARTIALLY_VERIFIED.");
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
assert(evidence?.record_digest_manifest?.normalized_record_count === 24,
  "Evidence record digest manifest must cover 24 records.");
assert(/^sha256:[a-f0-9]{64}$/.test(evidence?.record_digest_manifest?.combined_normalized_records_sha256 ?? ""),
  "Combined normalized-record digest is missing or invalid.");
assert(Array.isArray(evidence?.artifact_references) && evidence.artifact_references.length === 3,
  "Exact source and cross-source artifacts must be referenced.");
assert(Object.values(signal?.dimensions ?? {}).every(item => item.status === "NOT_VERIFIED" && item.value === null),
  "All market signals must remain null and NOT_VERIFIED.");
assert(candidate?.stress_scale_summary?.source_removal_sensitivity === "FAIL_SOURCE_DIVERSITY",
  "Source-removal weakness must be preserved, not hidden.");
assert(candidate?.known_limitations?.length >= 5, "Candidate limitations are incomplete.");

if (errors.length) {
  console.error(`KIDULTS Structural Candidate R1: FAIL (${errors.length})`);
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}

console.log("KIDULTS Structural Candidate R1: PASS");
console.log(`Snapshot: ${candidate.snapshot_id}`);
console.log(`Evidence Package: ${evidence.evidence_package_id}`);
console.log(`Source families: ${evidence.metrics.source_family_count}`);
console.log(`Evidence records: ${evidence.metrics.record_count}`);
console.log("Unsupported metrics: NULL / NOT_VERIFIED");
console.log("Publication: PROHIBITED");
console.log("Production: HOLD");
console.log(`Track B state: ${assessmentIndex.current_assessment_id ? assessmentIndex.status : "WAITING_FOR_VALIDATION"}`);
