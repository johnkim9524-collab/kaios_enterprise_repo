import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const directory = path.resolve(process.argv[2] ?? "artifacts/agci-os/track-b-source-relevance-top50-pilot-v1");
const read = name => JSON.parse(fs.readFileSync(path.join(directory, name), "utf8"));
const errors = [];
const assessment = read("source-relevance-top50-pilot-assessment-v1.json");
const taxonomy = read("top50-false-positive-taxonomy-v1.json");
const directives = read("top50-ranking-recalibration-directives-v1.json");
const manifest = read("run-manifest.json");

const allowedRelevance = new Set(["RELEVANT", "NOT_RELEVANT"]);
const allowedRole = new Set(["CORRECT", "PARTIALLY_CORRECT", "WRONG_ROLE", "NOT_APPLICABLE"]);
if (assessment.reviewed_records !== 50 || assessment.records.length !== 50) errors.push("Top-50 direct coverage must be 50 / 50.");
if (new Set(assessment.records.map(record => record.endpoint_id)).size !== 50) errors.push("Endpoint IDs must be unique.");
if (new Set(assessment.records.map(record => record.provisional_rank)).size !== 50) errors.push("Ranks must be unique.");
if (!assessment.records.every(record => allowedRelevance.has(record.scope_relevance_label))) errors.push("Invalid relevance label.");
if (!assessment.records.every(record => allowedRole.has(record.source_role_label))) errors.push("Invalid Source-role label.");
if (!assessment.records.every(record => record.resolution_state === "RESOLVED")) errors.push("Pilot contains unresolved records.");
if (!assessment.records.every(record => record.evidence_references?.length >= 4 && record.rationale)) errors.push("Evidence references and rationale are required.");
const relevant = assessment.records.filter(record => record.scope_relevance_label === "RELEVANT").length;
const expectedPrecision = relevant / 50;
if (assessment.relevant_records !== relevant || assessment.top_50_precision !== expectedPrecision) errors.push("Precision metric mismatch.");
if (assessment.top_50_precision_classification && assessment.top_50_precision_classification !== "FAIL") errors.push("Pilot must truthfully fail the 0.95 gate.");
if (assessment.top_50_precision_pass !== false) errors.push("Acceptance pass must be false.");
if (assessment.final_400_case_assessment_completed || assessment.final_top_200_assessment_completed) errors.push("Pilot must not claim final assessment completion.");
if (assessment.source_pool_promotions !== 0 || assessment.acquisition_authorized !== false) errors.push("Pilot must not promote Sources or authorize acquisition.");
if (taxonomy.false_positive_records !== 50 - relevant) errors.push("False-positive taxonomy count mismatch.");
if (directives.status !== "RECALIBRATION_REQUIRED_BEFORE_QUALIFICATION") errors.push("Recalibration directive state mismatch.");
if (manifest.top_50_precision !== expectedPrecision || manifest.top_50_precision_pass !== false) errors.push("Manifest precision mismatch.");
if (manifest.source_pool_promotions !== 0 || manifest.acquisition_authorized !== false || manifest.production !== "HOLD") errors.push("Manifest boundary violation.");
if (errors.length) {
  console.error(`KIDULTS Track B Top-50 Pilot: FAIL (${errors.length})`);
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}
console.log("KIDULTS Track B Source Relevance Top-50 Pilot: PASS");
console.log(`Reviewed: ${assessment.reviewed_records} / 50`);
console.log(`Relevant: ${relevant}; Not relevant: ${50 - relevant}`);
console.log(`Measured Top-50 precision: ${assessment.top_50_precision.toFixed(3)} / required 0.950`);
console.log("Ranking gate: FAIL — recalibration required");
console.log("Source Pool promotions: 0; Acquisition: BLOCKED");
console.log("Production: HOLD");
