import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { fingerprint, readJson, unique } from "./asi-discovery-common-v1.mjs";

const ALLOWED_SCOPE = new Set(["RELEVANT", "NOT_RELEVANT", "INSUFFICIENT_EVIDENCE_REQUIRES_ADJUDICATION"]);
const ALLOWED_ROLE = new Set(["CORRECT", "PARTIALLY_CORRECT", "WRONG_ROLE", "NOT_APPLICABLE"]);

function fail(errors, message) { errors.push(message); }

export function validateBatchAssessment(directory, assessmentFile, { validateManifest = true } = {}) {
  const errors = [];
  const assessment = readJson(path.join(directory, assessmentFile));
  if (assessment.version !== "2.3.0") fail(errors, "Assessment must use v2.3.0 sanitized input contract.");
  if (assessment.reviewed_records !== 50 || assessment.records.length !== 50) fail(errors, "Assessment must contain exactly 50 reviewed cases.");
  if (unique(assessment.records.map(record => record.review_case_id)).length !== 50) fail(errors, "Review case IDs must be unique.");
  if (unique(assessment.records.map(record => record.endpoint_id)).length !== 50) fail(errors, "Endpoint IDs must be unique within the batch.");
  if (assessment.unresolved_records !== 0 || assessment.records.some(record => record.resolution_state !== "RESOLVED")) fail(errors, "Batch must close with zero unresolved cases.");
  if (assessment.records.some(record => !ALLOWED_SCOPE.has(record.scope_relevance_label))) fail(errors, "Invalid Scope relevance label.");
  if (assessment.records.some(record => !ALLOWED_ROLE.has(record.source_role_label))) fail(errors, "Invalid Source-role label.");
  if (assessment.records.some(record => !record.scope_relevance_rationale || !record.evidence_references?.length || !record.reviewer || !record.reviewed_at)) fail(errors, "Every case requires rationale, evidence references, reviewer, and reviewed_at.");
  if (assessment.records.some(record => record.source_pool_promoted !== false || record.acquisition_authorized !== false || record.production !== "HOLD")) fail(errors, "Case fail-closed boundary violated.");
  if (assessment.source_pool_promotions !== 0 || assessment.acquisition_authorized !== false || assessment.candidate_r2 !== "BLOCKED" || assessment.production !== "HOLD") fail(errors, "Assessment fail-closed boundary violated.");
  if (assessment.rationale_coverage !== 1 || assessment.evidence_reference_coverage !== 1) fail(errors, "Coverage must be 100%.");
  const relevant = assessment.records.filter(record => record.scope_relevance_label === "RELEVANT").length;
  const notRelevant = assessment.records.filter(record => record.scope_relevance_label === "NOT_RELEVANT").length;
  if (assessment.relevant_records !== relevant || assessment.not_relevant_records !== notRelevant || relevant + notRelevant !== 50) fail(errors, "Assessment counts do not reconcile.");
  const copy = structuredClone(assessment);
  const stored = copy.fingerprint;
  delete copy.fingerprint;
  if (stored !== fingerprint(copy)) fail(errors, "Assessment fingerprint mismatch.");

  if (validateManifest) {
    const manifest = readJson(path.join(directory, "run-manifest.json"));
    const manifestCopy = structuredClone(manifest);
    const storedRun = manifestCopy.run_fingerprint;
    delete manifestCopy.run_fingerprint;
    if (storedRun !== fingerprint(manifestCopy)) fail(errors, "Run manifest fingerprint mismatch.");
    if (manifest.assessment_fingerprint !== assessment.fingerprint || manifest.reviewed_records !== 50 || manifest.unresolved_records !== 0) fail(errors, "Run manifest does not reconcile with assessment.");
    if (manifest.source_pool_promotions !== 0 || manifest.acquisition_authorized !== false || manifest.production !== "HOLD") fail(errors, "Manifest fail-closed boundary violated.");
  }
  return errors;
}

async function main() {
  const directory = path.resolve(process.argv[2] ?? "");
  const assessmentFile = process.argv[3] ?? "track-b-calibration-assessment-batch-01-v2.json";
  const assessmentOnly = process.argv.includes("--assessment-only");
  const errors = validateBatchAssessment(directory, assessmentFile, { validateManifest: !assessmentOnly });
  if (errors.length) {
    console.error(`KIDULTS Track B Calibration Batch Assessment: FAIL (${errors.length})`);
    for (const error of errors) console.error(`ERROR: ${error}`);
    process.exit(1);
  }
  console.log("KIDULTS Track B Calibration Batch Assessment: PASS");
  console.log(`Reviewed 50/50; unresolved 0; manifest validation ${assessmentOnly ? "DEFERRED_TO_AGGREGATE" : "PASS"}; Source Pool promotions 0; Acquisition BLOCKED; Production HOLD`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
