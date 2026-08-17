import fs from "node:fs";
import path from "node:path";
import process from "node:process";

function parseArgs(argv) {
  const config = {
    metDir: "artifacts/autonomous-source-samples/met-costume-open-access-r1",
    vamDir: "artifacts/autonomous-source-samples/vam-fashion-collections-r1",
    output: "artifacts/autonomous-source-samples/fashion-authority-cross-source-r1"
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--met-dir") config.metDir = argv[++index];
    else if (argument === "--vam-dir") config.vamDir = argv[++index];
    else if (argument === "--output") config.output = argv[++index];
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return config;
}

function readJson(directory, name) {
  return JSON.parse(fs.readFileSync(path.join(directory, name), "utf8"));
}

function writeJson(directory, name, value) {
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, name), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(unknown|none|anonymous|not available)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function firstYear(value) {
  const match = String(value ?? "").match(/\b(1[0-9]{3}|20[0-9]{2})\b/);
  return match ? Number(match[1]) : null;
}

function metShape(record) {
  return {
    source_id: record.source_id,
    evidence_id: record.evidence_id,
    object_id: record.source_object_id,
    object_type: normalizeText(record.object_name || record.classification),
    title: normalizeText(record.title),
    maker: normalizeText(record.maker_or_artist),
    year: firstYear(record.object_date),
    completeness: Number(record.critical_field_completeness ?? 0),
    provenance: Boolean(record.evidence_reference)
  };
}

function vamShape(record) {
  return {
    source_id: record.source_id,
    evidence_id: record.evidence_id,
    object_id: record.source_object_id,
    object_type: normalizeText(record.object_type),
    title: normalizeText(record.title),
    maker: normalizeText(record.maker_or_artist),
    year: firstYear(record.production_date),
    completeness: Number(record.critical_field_completeness ?? 0),
    provenance: Boolean(record.evidence_reference)
  };
}

function similarity(left, right) {
  let score = 0;
  const reasons = [];

  if (left.maker && right.maker && left.maker === right.maker) {
    score += 0.45;
    reasons.push("maker_exact");
  }
  if (left.title && right.title && left.title === right.title) {
    score += 0.25;
    reasons.push("title_exact");
  }
  if (left.object_type && right.object_type && (
    left.object_type === right.object_type ||
    left.object_type.includes(right.object_type) ||
    right.object_type.includes(left.object_type)
  )) {
    score += 0.15;
    reasons.push("object_type_compatible");
  }
  if (left.year !== null && right.year !== null && left.year === right.year) {
    score += 0.15;
    reasons.push("year_exact");
  }

  return { score: Number(score.toFixed(2)), reasons };
}

const config = parseArgs(process.argv.slice(2));
const metRecords = readJson(config.metDir, "normalized-evidence-records.json");
const vamRecords = readJson(config.vamDir, "normalized-evidence-records.json");
const metQuality = readJson(config.metDir, "quality-report.json");
const vamQuality = readJson(config.vamDir, "quality-report.json");
const metManifest = readJson(config.metDir, "run-manifest.json");
const vamManifest = readJson(config.vamDir, "run-manifest.json");

const met = metRecords.map(metShape);
const vam = vamRecords.map(vamShape);
const comparisons = [];
for (const left of met) {
  for (const right of vam) {
    const result = similarity(left, right);
    if (result.score >= 0.4) {
      comparisons.push({
        met_evidence_id: left.evidence_id,
        vam_evidence_id: right.evidence_id,
        score: result.score,
        reasons: result.reasons
      });
    }
  }
}
comparisons.sort((a, b) => b.score - a.score || a.met_evidence_id.localeCompare(b.met_evidence_id));

const strongMatches = comparisons.filter(item => item.score >= 0.75);
const reviewMatches = comparisons.filter(item => item.score >= 0.55 && item.score < 0.75);
const combinedCount = met.length + vam.length;
const provenanceCount = [...met, ...vam].filter(record => record.provenance).length;
const weightedCompleteness = combinedCount
  ? [...met, ...vam].reduce((sum, record) => sum + record.completeness, 0) / combinedCount
  : 0;

const report = {
  comparison_id: "fashion-authority-cross-source-r1",
  version: "1.0.0",
  status: "COMPLETED_NOT_CANDIDATE",
  generated_at: new Date().toISOString(),
  vertical_id: "fashion-accessories",
  source_families: [
    {
      source_id: "met-costume-institute-open-access",
      run_id: metManifest.run_id,
      record_count: met.length,
      rights_state: metQuality.metadata_rights_state
    },
    {
      source_id: "vam-collections-api-fashion",
      run_id: vamManifest.run_id,
      record_count: vam.length,
      rights_state: vamQuality.metadata_rights_state
    }
  ],
  combined_metrics: {
    source_family_count: 2,
    record_count: combinedCount,
    unique_source_record_count: new Set([...met, ...vam].map(record => `${record.source_id}:${record.object_id}`)).size,
    provenance_reference_coverage: combinedCount ? provenanceCount / combinedCount : 0,
    average_critical_field_completeness: Number(weightedCompleteness.toFixed(4)),
    image_ingestion_count: 0,
    credential_use_count: 0,
    paid_access_count: 0,
    mutation_count: 0
  },
  schema_intersection: [
    "source_id",
    "source_object_id",
    "object_type",
    "title",
    "maker_or_artist",
    "production_or_object_date",
    "evidence_reference",
    "source_payload_sha256",
    "critical_field_completeness"
  ],
  entity_resolution: {
    algorithm: "DETERMINISTIC_RULES_R1",
    strong_match_threshold: 0.75,
    review_threshold: 0.55,
    strong_match_candidates: strongMatches,
    manual_review_candidates: reviewMatches,
    interpretation: strongMatches.length
      ? "Potential cross-institution identity matches require human and source-level verification."
      : "No strong same-object match was found in the bounded samples; this is expected for independent museum holdings."
  },
  source_removal_sensitivity: {
    remove_met: {
      remaining_source_families: 1,
      remaining_records: vam.length,
      evidence_density_gate: "FAIL_SOURCE_DIVERSITY"
    },
    remove_vam: {
      remaining_source_families: 1,
      remaining_records: met.length,
      evidence_density_gate: "FAIL_SOURCE_DIVERSITY"
    }
  },
  candidate_eligible: false,
  candidate_blockers: [
    "Two source families are below the Evidence Density minimum of four.",
    "The samples provide authority/identity evidence but no rights-cleared transaction evidence.",
    "Object-level entity resolution has not been validated against a Golden Dataset.",
    "Commercial publication rights are not aligned across sources.",
    "Track B has not validated the trust, density or source-removal methodology."
  ],
  production_eligible: false
};

writeJson(config.output, "cross-source-report.json", report);
console.log(JSON.stringify({
  status: report.status,
  source_families: report.combined_metrics.source_family_count,
  records: report.combined_metrics.record_count,
  provenance_coverage: report.combined_metrics.provenance_reference_coverage,
  strong_match_candidates: strongMatches.length,
  candidate_eligible: false,
  output: config.output
}));
