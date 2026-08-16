import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { buildAssessment } from "./build-first-rankability-assessment.mjs";

const root = process.cwd();
const snapshotId = "candidate-structural-20260816-r1";
const assessmentId = "assessment-candidate-structural-20260816-r1-v1";
const errors = [];

function readJson(relative) {
  const file = path.join(root, relative);
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    errors.push(`${relative}: ${error.message}`);
    return null;
  }
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function assert(condition, message) {
  if (!condition) errors.push(message);
}

const assessment = readJson(
  `coordination/kidults/registry/assessment/records/${assessmentId}.json`
);
const assessmentIndex = readJson("coordination/kidults/registry/assessment/index.json");
const snapshotIndex = readJson("coordination/kidults/registry/snapshot/index.json");
const candidate = readJson(
  `coordination/kidults/candidates/${snapshotId}/snapshot-candidate.json`
);
const evidence = readJson(
  `coordination/kidults/candidates/${snapshotId}/evidence-package.json`
);
const signal = readJson(
  `coordination/kidults/candidates/${snapshotId}/signal-package.json`
);
const sensitivity = readJson(
  `coordination/kidults/candidates/${snapshotId}/source-removal-sensitivity.json`
);
const contradiction = readJson(
  `coordination/kidults/candidates/${snapshotId}/contradiction-report.json`
);
const handoff = readJson(
  "coordination/kidults/registry/handoff/records/handoff-a-to-b-first-candidate.json"
);
const track = readJson(
  "coordination/kidults/registry/track/records/track-b-rankability-validation-gate.json"
);
const twin = readJson(
  "coordination/kidults/registry/digital-twin/records/twin-current-program-state-v1.json"
);
const portal = readJson(
  "apps/kidults-enterprise-staging/public/portal/data/registry-view.json"
);
const schema = readJson(
  "coordination/kidults/schemas/rankability-assessment.schema.json"
);

if (assessment) {
  const expected = buildAssessment({ generatedAt: assessment.generated_at });
  assert(
    stableJson(expected) === stableJson(assessment),
    "Registered Assessment does not match deterministic Track B evaluation."
  );
}

assert(assessment?.id === assessmentId, "Assessment ID mismatch.");
assert(assessment?.snapshot_id === snapshotId, "Assessment snapshot_id mismatch.");
assert(
  assessment?.snapshot_id === candidate?.snapshot_id &&
  assessment?.snapshot_id === evidence?.snapshot_id,
  "Candidate, Evidence Package and Assessment must use the exact same snapshot_id."
);
assert(
  assessment?.evidence_package_id === evidence?.evidence_package_id,
  "Assessment Evidence Package pointer mismatch."
);
assert(
  assessment?.methodology_version === candidate?.methodology_version,
  "Assessment methodology_version mismatch."
);
assert(
  assessment?.evidence_lineage_version === candidate?.evidence_lineage_version,
  "Assessment evidence_lineage_version mismatch."
);
assert(assessment?.input_alignment?.status === "PASS", "Input alignment must PASS.");
assert(assessment?.assessment_status === "COMPLETED", "Assessment status must be COMPLETED.");
assert(assessment?.gate_state === "blocked", "Structural Candidate must be blocked.");
assert(assessment?.recommendation === "BLOCKED", "Recommendation must be BLOCKED.");
assert(assessment?.overall_rankability === false, "Overall rankability must be false.");
assert(assessment?.publication_eligible === false, "Public publication must remain prohibited.");
assert(assessment?.production_eligible === false, "Production eligibility must remain false.");
assert(assessment?.immutable === true, "Assessment must be immutable.");
assert(/^sha256:[a-f0-9]{64}$/.test(assessment?.assessment_fingerprint ?? ""),
  "Assessment fingerprint is invalid.");

assert(assessment?.quantitative_summary?.source_family_count === 2,
  "Source-family count must remain 2.");
assert(assessment?.quantitative_summary?.minimum_source_families_for_rankability === 4,
  "Minimum source-family threshold must remain 4.");
assert(assessment?.quantitative_summary?.core_verticals_with_direct_evidence === 1,
  "Direct-evidence Vertical count must remain 1.");
assert(assessment?.quantitative_summary?.direct_evidence_vertical_coverage === 0.125,
  "Direct-evidence Vertical coverage must remain 12.5%.");
assert(assessment?.quantitative_summary?.provenance_reference_coverage === 1,
  "Provenance coverage must remain 100%.");
assert(assessment?.quantitative_summary?.duplicate_contamination === 0,
  "Duplicate contamination must remain 0.");
assert(assessment?.quantitative_summary?.source_removal_failures === 2,
  "Both source-removal tests must be recorded as failures.");
assert(assessment?.quantitative_summary?.verified_market_metrics === 0,
  "No market metric may be treated as verified.");

for (const metric of ["demand", "scarcity", "valuation", "liquidity", "confidence"]) {
  assert(assessment?.metric_status?.[metric] === "NOT_VERIFIED",
    `${metric} must remain NOT_VERIFIED.`);
  const signalDimension = signal?.dimensions?.[metric];
  if (signalDimension) {
    assert(signalDimension.value === null && signalDimension.status === "NOT_VERIFIED",
      `${metric} signal must remain null and NOT_VERIFIED.`);
  }
}

assert(sensitivity?.gate === "FAIL_SOURCE_DIVERSITY",
  "Source-removal weakness must not be hidden.");
assert(contradiction?.status === "NOT_EXECUTED",
  "Contradiction test must remain explicitly NOT_EXECUTED.");
assert(assessment?.test_results?.assessment_reproducibility === "PASS",
  "Assessment reproducibility must pass.");
assert(assessment?.test_results?.contradiction_handling === "BLOCKED_NOT_EXECUTED",
  "Unexecuted contradiction testing must block rankability.");
assert(assessment?.test_results?.stale_data_rejection === "BLOCKED_NOT_EXECUTED",
  "Unexecuted stale-data testing must block rankability.");

assert(assessmentIndex?.current_assessment_id === assessmentId,
  "Assessment Registry current pointer mismatch.");
assert(assessmentIndex?.current_snapshot_id === snapshotId,
  "Assessment Registry snapshot pointer mismatch.");
assert(assessmentIndex?.status === "BLOCKED",
  "Assessment Registry status must be BLOCKED.");
assert(snapshotIndex?.current_candidate_snapshot_id === snapshotId,
  "Snapshot Registry Candidate pointer changed.");
assert(handoff?.status === "ACCEPTED",
  "Track A→B handoff must be ACCEPTED after input alignment.");
assert(handoff?.assessment_id === assessmentId,
  "Handoff Assessment pointer mismatch.");
assert(track?.status === "ASSESSMENT_COMPLETE_BLOCKED",
  "Track B record status mismatch.");
assert(track?.current_assessment_id === assessmentId,
  "Track B current Assessment pointer mismatch.");
assert(twin?.current_assessment_id === assessmentId,
  "Digital Twin Assessment pointer mismatch.");
assert(twin?.track_states?.B === "ASSESSMENT_COMPLETE_BLOCKED",
  "Digital Twin Track B state mismatch.");
assert(portal?.assessment?.current_id === assessmentId,
  "Portal Registry projection Assessment pointer mismatch.");
assert(portal?.assessment?.gate_state === "blocked",
  "Portal Registry projection gate state mismatch.");
assert(portal?.assessment?.publication_eligible === false,
  "Portal Registry projection must preserve publication prohibition.");

const requiredSchemaFields = new Set(schema?.required ?? []);
for (const field of [
  "id",
  "assessment_id",
  "record_type",
  "version",
  "status",
  "created_by",
  "snapshot_id",
  "assessment_version",
  "registry_version",
  "generated_at",
  "assessment_status",
  "gate_state",
  "recommendation",
  "overall_rankability",
  "input_alignment",
  "quantitative_summary",
  "quantitative_reasons",
  "exit_criteria",
  "evidence_references",
  "assessment_fingerprint"
]) {
  assert(requiredSchemaFields.has(field), `Assessment schema missing required field: ${field}`);
}

if (errors.length) {
  console.error(`KIDULTS Track B First Assessment: FAIL (${errors.length})`);
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}

console.log("KIDULTS Track B First Assessment: PASS");
console.log(`Assessment: ${assessment.assessment_id}`);
console.log(`Snapshot: ${assessment.snapshot_id}`);
console.log(`Input alignment: ${assessment.input_alignment.status}`);
console.log(`Recommendation: ${assessment.recommendation}`);
console.log(`Source families: ${assessment.quantitative_summary.source_family_count}/4`);
console.log(`Direct-evidence Verticals: ${assessment.quantitative_summary.core_verticals_with_direct_evidence}/8`);
console.log("Unsupported market metrics: NULL / NOT_VERIFIED");
console.log("Publication: PROHIBITED");
console.log("Production: HOLD");
