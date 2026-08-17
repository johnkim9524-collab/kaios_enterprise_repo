import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const snapshotId = "candidate-structural-20260816-r1";
const assessmentId = "assessment-candidate-structural-20260816-r1-v1";
const candidateDir = path.join(root, "coordination", "kidults", "candidates", snapshotId);
const registryRoot = path.join(root, "coordination", "kidults", "registry");
const assessmentPath = path.join(registryRoot, "assessment", "records", `${assessmentId}.json`);

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function loadInputs() {
  return {
    candidate: readJson(path.join(candidateDir, "snapshot-candidate.json")),
    evidence: readJson(path.join(candidateDir, "evidence-package.json")),
    signal: readJson(path.join(candidateDir, "signal-package.json")),
    sensitivity: readJson(path.join(candidateDir, "source-removal-sensitivity.json")),
    contradiction: readJson(path.join(candidateDir, "contradiction-report.json")),
    stress: readJson(path.join(candidateDir, "stress-scale-evidence.json")),
    verticals: readJson(path.join(candidateDir, "vertical-readiness-metrics.json")),
    runManifest: readJson(path.join(candidateDir, "run-manifest.json")),
    snapshotIndex: readJson(path.join(registryRoot, "snapshot", "index.json")),
    baseline: readJson(path.join(registryRoot, "snapshot", "records", "baseline-provider-independent-v1.json")),
    methodology: readJson(path.join(registryRoot, "methodology", "index.json")),
    lineage: readJson(path.join(registryRoot, "evidence-lineage", "index.json"))
  };
}

export function buildAssessment({ generatedAt = process.env.ASSESSMENT_GENERATED_AT ?? new Date().toISOString() } = {}) {
  const {
    candidate,
    evidence,
    signal,
    sensitivity,
    contradiction,
    stress,
    verticals,
    runManifest,
    snapshotIndex,
    baseline,
    methodology,
    lineage
  } = loadInputs();

  const sourceFamilyCount = Number(evidence.metrics?.source_family_count ?? 0);
  const recordCount = Number(evidence.metrics?.record_count ?? 0);
  const duplicateCount = Number(evidence.metrics?.duplicate_record_count ?? 0);
  const provenanceCoverage = Number(evidence.metrics?.provenance_reference_coverage ?? 0);
  const completeness = Number(evidence.metrics?.average_critical_field_completeness ?? 0);
  const directVerticals = (verticals.verticals ?? []).filter(
    vertical => Array.isArray(vertical.evidence_references) && vertical.evidence_references.length > 0
  ).length;
  const sourceFamilies = Array.isArray(evidence.source_families) ? evidence.source_families : [];
  const publicAuthorizedSources = sourceFamilies.filter(
    source => source.commercial_publication_authorized === true
  ).length;
  const rankabilityMetrics = ["demand", "scarcity", "valuation", "liquidity", "confidence"];
  const verifiedMarketMetrics = rankabilityMetrics.filter(
    metric => evidence.field_support?.[metric] === "VERIFIED"
  ).length;
  const removalTests = Object.values(sensitivity.tests ?? {});
  const removalFailures = removalTests.filter(
    test => test.evidence_density_gate !== "PASS"
  ).length;

  const inputAlignment = {
    status: "PASS",
    candidate_snapshot_id: candidate.snapshot_id,
    evidence_snapshot_id: evidence.snapshot_id,
    same_snapshot_id: candidate.snapshot_id === evidence.snapshot_id,
    methodology_resolved: candidate.methodology_version === methodology.current_record_id,
    evidence_lineage_resolved: candidate.evidence_lineage_version === lineage.current_record_id,
    baseline_unchanged:
      baseline.snapshot_id === "baseline-provider-independent-v1" &&
      baseline.current_candidate === false &&
      runManifest.controls?.baseline_overwritten === false,
    missing_to_zero_detected: runManifest.controls?.missing_to_zero !== false,
    rights_explicit_by_source: sourceFamilies.every(
      source => typeof source.rights_state === "string" && source.rights_state.length > 0
    )
  };

  const alignmentChecks = [
    inputAlignment.same_snapshot_id,
    inputAlignment.methodology_resolved,
    inputAlignment.evidence_lineage_resolved,
    inputAlignment.baseline_unchanged,
    inputAlignment.rights_explicit_by_source
  ];
  if (!alignmentChecks.every(Boolean) ||
    inputAlignment.missing_to_zero_detected !== false ||
    snapshotIndex.current_candidate_snapshot_id !== candidate.snapshot_id) {
    inputAlignment.status = "BLOCKED_INPUT_MISMATCH";
  }

  const fingerprintPayload = [
    candidate.snapshot_id,
    evidence.evidence_package_id,
    candidate.methodology_version,
    candidate.evidence_lineage_version,
    sourceFamilyCount,
    recordCount,
    provenanceCoverage,
    completeness,
    duplicateCount,
    sensitivity.gate,
    contradiction.status,
    stress.tests?.stale_rejection?.status
  ];
  const assessmentFingerprint = `sha256:${sha256(JSON.stringify(fingerprintPayload))}`;

  return {
    id: assessmentId,
    assessment_id: assessmentId,
    record_type: "rankability_assessment",
    version: "1.0.0",
    status: "COMPLETED_BLOCKED",
    created_by: "Track B",
    registered_by: "KPMO / Atlas",
    approved_by: null,
    snapshot_id: snapshotId,
    assessment_version: "1.0.0",
    registry_version: "1.2.0",
    generated_at: generatedAt,
    assessed_at: generatedAt,
    assessor: "Track B — Rankability & Validation Gate",
    methodology_version: candidate.methodology_version,
    evidence_lineage_version: candidate.evidence_lineage_version,
    evidence_package_id: evidence.evidence_package_id,
    input_alignment: inputAlignment,
    assessment_status: "COMPLETED",
    gate_state: "blocked",
    recommendation: "BLOCKED",
    overall_rankability: false,
    publication_eligible: false,
    production_eligible: false,
    metric_status: {
      identity_canon: evidence.field_support?.identity_canon ?? "NOT_VERIFIED",
      right_data_coverage: evidence.field_support?.right_data_coverage ?? "NOT_VERIFIED",
      demand: evidence.field_support?.demand ?? "NOT_VERIFIED",
      scarcity: evidence.field_support?.scarcity ?? "NOT_VERIFIED",
      valuation: evidence.field_support?.valuation ?? "NOT_VERIFIED",
      liquidity: evidence.field_support?.liquidity ?? "NOT_VERIFIED",
      confidence: evidence.field_support?.confidence ?? "NOT_VERIFIED"
    },
    quantitative_summary: {
      core_verticals_total: Number(verticals.vertical_count ?? 0),
      core_verticals_with_direct_evidence: directVerticals,
      direct_evidence_vertical_coverage:
        Number(verticals.vertical_count) > 0
          ? Number((directVerticals / Number(verticals.vertical_count)).toFixed(4))
          : 0,
      source_family_count: sourceFamilyCount,
      minimum_source_families_for_rankability: 4,
      evidence_record_count: recordCount,
      unique_source_record_count: Number(evidence.metrics?.unique_source_record_count ?? 0),
      duplicate_contamination: recordCount > 0
        ? Number((duplicateCount / recordCount).toFixed(4))
        : 0,
      maximum_duplicate_contamination: 0.01,
      provenance_reference_coverage: provenanceCoverage,
      required_provenance_reference_coverage: 1,
      average_critical_field_completeness: completeness,
      commercial_publication_authorized_source_families: publicAuthorizedSources,
      source_removal_tests: removalTests.length,
      source_removal_failures: removalFailures,
      verified_market_metrics: verifiedMarketMetrics,
      required_market_metrics_reviewed: rankabilityMetrics.length
    },
    quantitative_reasons: [
      {
        dimension: "source_family_density",
        observed: `${sourceFamilyCount} independent source families`,
        required: "at least 4 independent source families",
        result: "BLOCK",
        evidence_reference: "source-removal-sensitivity.json"
      },
      {
        dimension: "vertical_coverage",
        observed: `${directVerticals} of ${verticals.vertical_count} Core Verticals has direct Evidence (${Number((directVerticals / verticals.vertical_count * 100).toFixed(1))}%)`,
        required: "scope-specific coverage must be explicit; no global rankability claim",
        result: "BLOCK_GLOBAL_RANKABILITY",
        evidence_reference: "vertical-readiness-metrics.json"
      },
      {
        dimension: "provenance",
        observed: `${Number((provenanceCoverage * 100).toFixed(2))}% provenance reference coverage`,
        required: "100%",
        result: provenanceCoverage === 1 ? "PASS" : "BLOCK",
        evidence_reference: evidence.evidence_package_id
      },
      {
        dimension: "duplicate_contamination",
        observed: `${Number((duplicateCount / Math.max(recordCount, 1) * 100).toFixed(2))}%`,
        required: "<1%",
        result: duplicateCount / Math.max(recordCount, 1) < 0.01 ? "PASS" : "BLOCK",
        evidence_reference: evidence.evidence_package_id
      },
      {
        dimension: "critical_field_completeness",
        observed: `${Number((completeness * 100).toFixed(2))}%`,
        required: "reported without inflation",
        result: "PASS_STRUCTURAL",
        evidence_reference: evidence.evidence_package_id
      },
      {
        dimension: "market_metric_support",
        observed: `${verifiedMarketMetrics} of ${rankabilityMetrics.length} reviewed market metrics verified`,
        required: "exact Evidence for demand, scarcity, valuation, liquidity and confidence",
        result: verifiedMarketMetrics === rankabilityMetrics.length ? "PASS" : "BLOCK",
        evidence_reference: "signal-package.json"
      },
      {
        dimension: "public_rights",
        observed: `${publicAuthorizedSources} of ${sourceFamilies.length} source families authorized for commercial public publication`,
        required: "explicit field-level public/commercial rights",
        result: publicAuthorizedSources === sourceFamilies.length ? "PASS" : "BLOCK_PUBLICATION",
        evidence_reference: evidence.evidence_package_id
      },
      {
        dimension: "source_removal_stability",
        observed: `${removalFailures} of ${removalTests.length} removal tests fail source diversity`,
        required: "conclusions remain supported after each single-source-family removal",
        result: removalFailures === 0 ? "PASS" : "BLOCK",
        evidence_reference: "source-removal-sensitivity.json"
      }
    ],
    blocking_dimensions: [
      "source_family_density",
      "vertical_coverage",
      "market_evidence",
      "public_rights",
      "source_removal_stability",
      "contradiction_testing",
      "stale_data_rejection",
      "golden_dataset_entity_resolution"
    ],
    test_results: {
      input_alignment: inputAlignment.status,
      assessment_reproducibility: "PASS",
      provenance_completeness: provenanceCoverage === 1 ? "PASS" : "BLOCKED",
      duplicate_contamination:
        duplicateCount / Math.max(recordCount, 1) < 0.01 ? "PASS" : "BLOCKED",
      source_family_independence:
        sourceFamilyCount >= 4 ? "PASS" : "BLOCKED_BELOW_MINIMUM",
      source_removal_sensitivity:
        removalFailures === 0 ? "PASS" : "BLOCKED_FAIL_SOURCE_DIVERSITY",
      entity_resolution: "BLOCKED_NOT_GOLDEN_VALIDATED",
      contradiction_handling:
        contradiction.status === "COMPLETED" ? "PASS" : "BLOCKED_NOT_EXECUTED",
      stale_data_rejection:
        stress.tests?.stale_rejection?.status === "PASS" ? "PASS" : "BLOCKED_NOT_EXECUTED",
      rights_publication:
        publicAuthorizedSources === sourceFamilies.length ? "PASS" : "BLOCKED_INTERNAL_ONLY",
      metric_support:
        verifiedMarketMetrics === rankabilityMetrics.length
          ? "PASS"
          : "BLOCKED_MARKET_METRICS_NOT_VERIFIED"
    },
    stability_summary: {
      assessment_reproducibility: "PASS_SAME_INPUT_SAME_SEMANTIC_OUTPUT",
      assessment_fingerprint: assessmentFingerprint,
      candidate_acquisition_rerun: stress.tests?.deterministic_rerun?.status,
      source_removal: sensitivity.gate,
      contradiction: contradiction.status,
      stale_rejection: stress.tests?.stale_rejection?.status,
      entity_resolution: candidate.stress_scale_summary?.entity_resolution
    },
    exit_criteria: [
      {
        criterion: "independent_source_families",
        measure: "count of independent source families in the exact Candidate",
        observed: String(sourceFamilyCount),
        target: ">=4"
      },
      {
        criterion: "source_removal_stability",
        measure: "single-source-family removal tests that retain required Evidence Density",
        observed: `${removalTests.length - removalFailures} of ${removalTests.length}`,
        target: "all tested source removals retain supported conclusions or explicitly bounded scope"
      },
      {
        criterion: "market_evidence",
        measure: "rights-cleared transaction/demand/scarcity evidence dimensions",
        observed: String(verifiedMarketMetrics),
        target: "at least one rights-cleared transaction source plus supported demand/scarcity dimensions"
      },
      {
        criterion: "contradiction_handling",
        measure: "critical contradiction isolation tests",
        observed: contradiction.status,
        target: "PASS with 0 unresolved critical contradictions"
      },
      {
        criterion: "stale_data_rejection",
        measure: "stale Evidence rejection tests",
        observed: stress.tests?.stale_rejection?.status,
        target: "100% rejection of records beyond the declared freshness rule"
      },
      {
        criterion: "entity_resolution",
        measure: "Golden Dataset validation of source record, physical object and canonical design identities",
        observed: "NOT_GOLDEN_VALIDATED",
        target: ">=99% accuracy on the approved Golden Dataset"
      },
      {
        criterion: "public_rights",
        measure: "source families with explicit public/commercial field-level rights",
        observed: `${publicAuthorizedSources} of ${sourceFamilies.length}`,
        target: "100% of publicly projected fields rights-cleared"
      }
    ],
    requirements_for_publishable: [
      "Create a new immutable Candidate with at least four independent source families.",
      "Add rights-cleared transaction Evidence before verifying demand, scarcity, valuation or liquidity.",
      "Pass source-removal sensitivity without collapsing below the declared Evidence Density requirement.",
      "Execute contradiction and stale-data rejection tests.",
      "Validate dual-identity entity resolution against an approved Golden Dataset.",
      "Clear public/commercial rights for every field intended for Portal publication.",
      "Retain unsupported metrics as null and NOT_VERIFIED."
    ],
    provider_spend_recommendation: "targeted_poc_only",
    residual_risks: [
      "Museum authority records support identity and collection context but do not establish market value.",
      "V&A metadata is restricted to internal non-commercial PoC use in this Candidate.",
      "A two-source sample is vulnerable to source-family removal.",
      "No Golden Dataset-calibrated canonical-design match exists.",
      "No current Evidence supports global vertical ranking or public recommendation."
    ],
    evidence_references: [
      "coordination/kidults/candidates/candidate-structural-20260816-r1/snapshot-candidate.json",
      "coordination/kidults/candidates/candidate-structural-20260816-r1/evidence-package.json",
      "coordination/kidults/candidates/candidate-structural-20260816-r1/signal-package.json",
      "coordination/kidults/candidates/candidate-structural-20260816-r1/source-removal-sensitivity.json",
      "coordination/kidults/candidates/candidate-structural-20260816-r1/contradiction-report.json",
      "coordination/kidults/candidates/candidate-structural-20260816-r1/stress-scale-evidence.json"
    ],
    assessment_fingerprint: assessmentFingerprint,
    immutable: true
  };
}

function writeAssessment(value) {
  fs.mkdirSync(path.dirname(assessmentPath), { recursive: true });
  fs.writeFileSync(assessmentPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const generatedAt = process.env.ASSESSMENT_GENERATED_AT ?? (
    fs.existsSync(assessmentPath) ? readJson(assessmentPath).generated_at : new Date().toISOString()
  );
  const assessment = buildAssessment({ generatedAt });

  if (args.has("--write")) {
    writeAssessment(assessment);
    console.log(`Wrote ${path.relative(root, assessmentPath)}`);
    return;
  }

  if (args.has("--validate")) {
    const current = readJson(assessmentPath);
    if (stableJson(assessment) !== stableJson(current)) {
      console.error("Track B Assessment record does not match deterministic evaluation.");
      process.exit(1);
    }
    console.log("Track B deterministic Assessment record: PASS");
    console.log(`Assessment: ${assessment.assessment_id}`);
    console.log(`Snapshot: ${assessment.snapshot_id}`);
    console.log(`Recommendation: ${assessment.recommendation}`);
    return;
  }

  process.stdout.write(`${JSON.stringify(assessment, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
