import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fingerprint, readJson } from "./asi-discovery-common-v1.mjs";

const directory = path.resolve(process.argv[2] ?? "artifacts/agci-os/source-precision-ranking-v2");
const requiredFiles = [
  "precision-ranked-universe-v2.json",
  "precision-top-200-review-queue-v2.json",
  "blind-top50-input-v2.json",
  "precision-v2-rejected-and-held-register.json",
  "underlying-work-deduplication-report-v1.json",
  "source-role-correction-report-v1.json",
  "precision-v2-gap-report.json",
  "run-manifest.json"
];

const errors = [];
const outputs = {};
for (const file of requiredFiles) {
  const target = path.join(directory, file);
  if (!fs.existsSync(target)) errors.push(`Missing output: ${file}`);
  else outputs[file] = readJson(target);
}

function check(condition, message) {
  if (!condition) errors.push(message);
}

if (!errors.length) {
  const ranked = outputs["precision-ranked-universe-v2.json"];
  const top200 = outputs["precision-top-200-review-queue-v2.json"];
  const blind = outputs["blind-top50-input-v2.json"];
  const dedup = outputs["underlying-work-deduplication-report-v1.json"];
  const gaps = outputs["precision-v2-gap-report.json"];
  const manifest = outputs["run-manifest.json"];

  for (const [name, value] of Object.entries(outputs)) {
    if (name === "run-manifest.json") continue;
    const recorded = value.fingerprint;
    const copy = structuredClone(value);
    delete copy.fingerprint;
    check(recorded === fingerprint(copy), `${name}: fingerprint mismatch.`);
  }

  check(ranked.version === "2.0.0", "Ranked universe version must be 2.0.0.");
  check(ranked.records.length >= 200, "Ranked universe must contain at least 200 records.");
  check(top200.records.length === 200 && top200.record_count === 200, "Top-200 queue must contain exactly 200 records.");
  check(blind.records.length === 50 && blind.record_count === 50, "Blind queue must contain exactly 50 records.");
  check(blind.pilot_training_endpoint_overlap === 0, "Blind Top-50 must exclude every pilot training endpoint.");
  check(new Set(blind.records.map(record => record.endpoint_id)).size === 50, "Blind Top-50 endpoint IDs must be unique.");
  check(new Set(blind.records.map(record => record.underlying_work_key)).size === 50, "Blind Top-50 underlying works must be unique.");
  check(blind.records.every(record => record.numeric_ranking_score_visible_to_reviewer === false), "Blind reviewer input must hide numeric ranking scores.");
  check(blind.records.every(record => record.explicit_scope_evidence?.length > 0), "Every blind case requires explicit non-query Scope evidence.");
  check(blind.records.every(record => record.channel_suitability_evidence?.length > 0), "Every blind case requires channel-suitability evidence.");
  check(blind.records.every(record => record.qualification_state === "NOT_QUALIFIED"), "Blind cases must not be pre-qualified.");
  check(blind.records.every(record => record.acquisition_authorized === false && record.production === "HOLD"), "Blind queue must preserve acquisition and Production boundaries.");

  check(gaps.blind_top_50_training_overlap === 0, "Gap report training overlap must be zero.");
  check(gaps.blind_top_50_license_or_business_records === 0, "Blind Top-50 must contain zero known license/business false positives.");
  check(gaps.blind_top_50_known_scope_collisions === 0, "Blind Top-50 must contain zero known Scope collisions.");
  check(gaps.blind_top_50_duplicate_underlying_works === 0, "Blind Top-50 must contain zero duplicate underlying works.");
  check(gaps.blind_top_50_explicit_scope_evidence_coverage === 1, "Blind Top-50 Scope evidence coverage must be 100%.");
  check(gaps.blind_top_50_channel_suitability_coverage === 1, "Blind Top-50 channel-suitability coverage must be 100%.");
  check(gaps.measured_top_50_precision === null && gaps.measured_top_50_precision_status.includes("NOT_MEASURED"), "New empirical precision must remain NOT_MEASURED before Track B review.");
  check(dedup.blind_top50_duplicate_underlying_works === 0, "Deduplication report must show zero blind Top-50 duplicate works.");

  check(manifest.status === "SOURCE_PRECISION_RANKING_V2_PASS_BLIND_RECHECK_PENDING", "Manifest status mismatch.");
  check(manifest.top_200_count === 200 && manifest.blind_top_50_count === 50, "Manifest queue counts mismatch.");
  check(manifest.blind_training_overlap === 0 && manifest.blind_license_count === 0 && manifest.blind_collision_count === 0 && manifest.blind_underlying_duplicate_count === 0, "Manifest structural gates must be zero-gap.");
  check(manifest.source_pool_promotions === 0 && manifest.acquisition_authorized === false, "Ranking v2 must not promote Source Pools or authorize acquisition.");
  check(manifest.candidate_r2_created === false && manifest.indexes_computed === 0 && manifest.production === "HOLD", "Candidate, Index and Production boundaries must remain closed.");

  const outputFingerprints = Object.fromEntries(Object.entries(outputs)
    .filter(([name]) => name !== "run-manifest.json")
    .map(([name, value]) => [name, value.fingerprint]));
  check(JSON.stringify(manifest.outputs) === JSON.stringify(outputFingerprints), "Manifest output fingerprint map mismatch.");
  const manifestCopy = structuredClone(manifest);
  delete manifestCopy.run_fingerprint;
  check(manifest.run_fingerprint === fingerprint(manifestCopy), "Manifest run fingerprint mismatch.");
}

if (errors.length) {
  console.error(`KIDULTS Source Precision Ranking v2: FAIL (${errors.length})`);
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}

const manifest = outputs["run-manifest.json"];
const gaps = outputs["precision-v2-gap-report.json"];
console.log("KIDULTS Source Precision Ranking v2: PASS");
console.log(`Input / ranked: ${manifest.input_endpoint_count} / ${manifest.ranked_count}`);
console.log(`Anchors: ${manifest.anchor_candidate_count}`);
console.log(`Top-200 / Blind Top-50: ${manifest.top_200_count} / ${manifest.blind_top_50_count}`);
console.log(`Blind overlap / license / collision / duplicate: ${manifest.blind_training_overlap} / ${manifest.blind_license_count} / ${manifest.blind_collision_count} / ${manifest.blind_underlying_duplicate_count}`);
console.log(`Scope / channel evidence coverage: ${gaps.blind_top_50_explicit_scope_evidence_coverage} / ${gaps.blind_top_50_channel_suitability_coverage}`);
console.log("Empirical precision: NOT_MEASURED — Track B blind review required");
console.log("Source Pool promotions: 0; Acquisition: BLOCKED; Production: HOLD");
