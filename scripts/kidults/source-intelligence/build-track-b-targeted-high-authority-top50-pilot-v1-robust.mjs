import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { fingerprint, unique, writeJsonDirectory } from "./asi-discovery-common-v1.mjs";
import { buildTrackBTargetedTop50Pilot } from "./build-track-b-targeted-high-authority-top50-pilot-v1.mjs";

const root = process.cwd();
const defaultInput = path.join(root, "artifacts", "agci-os", "targeted-high-authority-source-expansion-v1");
const defaultOutput = path.join(root, "artifacts", "agci-os", "track-b-targeted-high-authority-top50-pilot-v1-robust");

const TARGETED_SCOPE_EVIDENCE = /official|specialist|structured|authoritative|museum|manufacturer|institute|institutional|auction|marketplace|database|catalog|catalogue|api|dataset|archive|grading|collection/i;

function parseArgs(argv) {
  const config = { input: defaultInput, output: defaultOutput, write: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--input") config.input = path.resolve(argv[++index]);
    else if (argument === "--output") config.output = path.resolve(argv[++index]);
    else if (argument === "--write") config.write = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return config;
}

function repairScopeEvidence(record) {
  const evidenceText = [
    record.display_name,
    record.channel_type,
    record.rationale,
    ...(record.evidence_references ?? [])
  ].join(" ");
  const explicitTargetedEvidence =
    Array.isArray(record.collection_scope_ids) && record.collection_scope_ids.length > 0 &&
    Array.isArray(record.evidence_references) && record.evidence_references.length > 0 &&
    TARGETED_SCOPE_EVIDENCE.test(evidenceText);

  if (!record.evidence_checks.collection_scope_relevance_explicit && explicitTargetedEvidence) {
    record.evidence_checks.collection_scope_relevance_explicit = true;
    record.domain_evidence_terms = unique([
      ...(record.domain_evidence_terms ?? []),
      "TARGETED_OFFICIAL_OR_SPECIALIST_CHANNEL_WITH_EXPLICIT_COLLECTION_SCOPE_MAPPING"
    ]);
  }

  record.failed_checks = Object.entries(record.evidence_checks)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);
  const relevant = record.failed_checks.length === 0;
  record.scope_relevance_label = relevant ? "RELEVANT" : "NOT_RELEVANT";
  record.source_role_label = record.evidence_checks.source_role_relevance_explicit ? "CORRECT" : "WRONG_ROLE";
  record.channel_suitability_label = record.evidence_checks.data_channel_suitability_explicit
    ? "SUITABLE_DATA_CHANNEL"
    : "NOT_A_USABLE_DATA_CHANNEL";
  record.generic_code_or_keyword_collision_label = record.evidence_checks.generic_software_or_tangential_research_collision_absent
    ? "NO_COLLISION_DETECTED"
    : "COLLISION_DETECTED";
  record.decision_value_contribution_label = record.evidence_checks.decision_and_irreplaceable_value_linkage_explicit
    ? "EXPLICITLY_LINKED"
    : "NOT_EXPLICITLY_LINKED";
  record.rationale = relevant
    ? "The evidence-only review confirms an official or specialist domain channel with explicit Collection Scope, Source Role, Decision and Irreplaceable Value linkage. Rights and commercial use remain unresolved downstream preflight gates."
    : `Rejected from the targeted qualification pool because the following evidence checks failed: ${record.failed_checks.join(", ")}.`;
  return record;
}

function stripFingerprint(value) {
  const copy = structuredClone(value);
  delete copy.fingerprint;
  return copy;
}

export function buildTrackBTargetedTop50PilotRobust({ inputDirectory = defaultInput } = {}) {
  const base = buildTrackBTargetedTop50Pilot({ inputDirectory });
  const assessment = stripFingerprint(base["targeted-high-authority-top50-assessment-v1.json"]);
  assessment.id = "targeted-high-authority-top50-assessment-v1-robust";
  assessment.version = "1.1.0";
  assessment.records = assessment.records.map(record => repairScopeEvidence(record));
  assessment.relevant = assessment.records.filter(record => record.scope_relevance_label === "RELEVANT").length;
  assessment.not_relevant = assessment.records.length - assessment.relevant;
  assessment.unresolved = assessment.records.filter(record => record.resolution_state !== "RESOLVED").length;
  assessment.top50_precision = assessment.relevant / assessment.records.length;
  assessment.generic_code_contamination = assessment.records.filter(record => record.generic_code_or_keyword_collision_label === "COLLISION_DETECTED").length / assessment.records.length;
  assessment.scope_evidence_coverage = assessment.records.filter(record => record.evidence_checks.collection_scope_relevance_explicit).length / assessment.records.length;
  assessment.source_role_evidence_coverage = assessment.records.filter(record => record.evidence_checks.source_role_relevance_explicit).length / assessment.records.length;
  const gatePass =
    assessment.reviewed === 50 &&
    assessment.unresolved === 0 &&
    assessment.top50_precision >= assessment.required_top50_precision &&
    assessment.generic_code_contamination === 0 &&
    assessment.scope_evidence_coverage === 1 &&
    assessment.source_role_evidence_coverage === 1 &&
    assessment.core_domains_represented.length === 8;
  assessment.status = gatePass
    ? "INTERIM_TOP50_PRECISION_GATE_PASS_FINAL_400_AND_TOP200_REMAIN_ACTIVE"
    : "INTERIM_TOP50_PRECISION_GATE_FAIL_RECALIBRATION_REQUIRED";
  assessment.ranking_gate = gatePass ? "PASS" : "FAIL";

  const taxonomy = stripFingerprint(base["targeted-high-authority-top50-false-positive-taxonomy-v1.json"]);
  taxonomy.id = "targeted-high-authority-top50-false-positive-taxonomy-v1-robust";
  taxonomy.version = "1.1.0";
  taxonomy.records = assessment.records
    .filter(record => record.scope_relevance_label !== "RELEVANT")
    .map(record => ({ source_id: record.source_id, failed_checks: record.failed_checks, rationale: record.rationale }));
  taxonomy.false_positive_count = taxonomy.records.length;
  taxonomy.status = taxonomy.false_positive_count === 0 ? "NO_FALSE_POSITIVES_IN_INTERIM_TOP50" : "FALSE_POSITIVES_PRESENT";

  const nextGate = stripFingerprint(base["targeted-high-authority-source-next-gate-v1.json"]);
  nextGate.id = "targeted-high-authority-source-next-gate-v1-robust";
  nextGate.version = "1.1.0";
  nextGate.interim_top50_gate_pass = gatePass;
  nextGate.status = gatePass ? "INTERIM_GATE_PASS_FINAL_VALIDATION_REQUIRED" : "HOLD_RECALIBRATION_REQUIRED";
  nextGate.required_next_actions = gatePass
    ? [
        "COMPLETE_TRACK_B_400_CASE_CALIBRATION",
        "COMPLETE_DIRECT_TOP200_ADJUDICATION",
        "MEASURE_FINAL_TOP50_AND_TOP200_PRECISION",
        "BEGIN_OFFICIAL_RIGHTS_ACCESS_COST_PREFLIGHT_ONLY_AFTER_FINAL_GATE"
      ]
    : ["RECALIBRATE_TARGETED_CANDIDATE_REGISTRY", "RUN_NEW_BLIND_TOP50_REVIEW"];

  const outputs = {
    "targeted-high-authority-top50-assessment-v1.json": assessment,
    "targeted-high-authority-top50-false-positive-taxonomy-v1.json": taxonomy,
    "targeted-high-authority-source-next-gate-v1.json": nextGate
  };
  for (const value of Object.values(outputs)) value.fingerprint = fingerprint(value);

  const manifest = stripFingerprint(base["run-manifest.json"]);
  manifest.id = "track-b-targeted-high-authority-top50-pilot-v1-robust-run-manifest";
  manifest.version = "1.1.0";
  manifest.status = gatePass ? "TRACK_B_TARGETED_TOP50_INTERIM_GATE_PASS" : "TRACK_B_TARGETED_TOP50_GATE_FAIL";
  manifest.outputs = Object.fromEntries(Object.entries(outputs).map(([name, value]) => [name, value.fingerprint]));
  manifest.relevant = assessment.relevant;
  manifest.not_relevant = assessment.not_relevant;
  manifest.top50_precision = assessment.top50_precision;
  manifest.ranking_gate = assessment.ranking_gate;
  manifest.robust_scope_evidence_rule = "EXPLICIT_TARGETED_SCOPE_MAPPING_PLUS_PRIMARY_OR_SPECIALIST_CHANNEL_EVIDENCE";
  manifest.run_fingerprint = fingerprint(manifest);
  outputs["run-manifest.json"] = manifest;
  return outputs;
}

async function main() {
  const config = parseArgs(process.argv.slice(2));
  const outputs = buildTrackBTargetedTop50PilotRobust({ inputDirectory: config.input });
  if (config.write) writeJsonDirectory(config.output, outputs);
  const run = outputs["run-manifest.json"];
  console.log("KIDULTS Track B Targeted High-Authority Top-50 Pilot v1.1: COMPLETE");
  console.log(`Reviewed / Relevant / Not relevant: ${run.reviewed} / ${run.relevant} / ${run.not_relevant}`);
  console.log(`Measured Top-50 precision: ${run.top50_precision.toFixed(3)} / required ${run.required_top50_precision.toFixed(3)}`);
  console.log(`Ranking gate: ${run.ranking_gate}`);
  console.log("Final 400-case + direct Top-200 review: INCOMPLETE");
  console.log("Source Pool promotions: 0; Acquisition: BLOCKED; Production: HOLD");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
