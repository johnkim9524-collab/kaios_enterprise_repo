import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fingerprint, readJson, unique } from "./asi-discovery-common-v1.mjs";

const REQUIRED_FILES = [
  "targeted-high-authority-top50-assessment-v1.json",
  "targeted-high-authority-top50-false-positive-taxonomy-v1.json",
  "targeted-high-authority-source-next-gate-v1.json",
  "run-manifest.json"
];

function fail(errors, message) { errors.push(message); }

function validateFingerprints(outputs, errors) {
  for (const [name, value] of Object.entries(outputs)) {
    if (name === "run-manifest.json") continue;
    const copy = structuredClone(value);
    const stored = copy.fingerprint;
    delete copy.fingerprint;
    if (stored !== fingerprint(copy)) fail(errors, `${name}: fingerprint mismatch.`);
  }
}

export function validateTrackBTargetedTop50Pilot(directory) {
  const errors = [];
  const outputs = {};
  for (const name of REQUIRED_FILES) {
    const file = path.join(directory, name);
    if (!fs.existsSync(file)) fail(errors, `Missing output: ${name}`);
    else outputs[name] = readJson(file);
  }
  if (errors.length) return errors;

  const assessment = outputs["targeted-high-authority-top50-assessment-v1.json"];
  const taxonomy = outputs["targeted-high-authority-top50-false-positive-taxonomy-v1.json"];
  const nextGate = outputs["targeted-high-authority-source-next-gate-v1.json"];
  const manifest = outputs["run-manifest.json"];

  if (assessment.reviewed !== 50 || assessment.records.length !== 50) fail(errors, "Assessment must directly review 50 records.");
  if (unique(assessment.records.map(record => record.source_id)).length !== 50) fail(errors, "Assessment Source IDs must be unique.");
  if (assessment.unresolved !== 0) fail(errors, "Unresolved cases must be zero.");
  if (assessment.core_domains_represented.length !== 8) fail(errors, "All eight Core Domains must be represented.");
  if (assessment.top50_precision < assessment.required_top50_precision) fail(errors, `Top-50 precision ${assessment.top50_precision} is below ${assessment.required_top50_precision}.`);
  if (assessment.generic_code_contamination !== 0) fail(errors, "Generic-code contamination must be zero.");
  if (assessment.scope_evidence_coverage !== 1) fail(errors, "Scope evidence coverage must be 100%.");
  if (assessment.source_role_evidence_coverage !== 1) fail(errors, "Source-role evidence coverage must be 100%.");
  if (assessment.ranking_gate !== "PASS") fail(errors, "Ranking gate must PASS.");
  if (!assessment.status.startsWith("INTERIM_TOP50_PRECISION_GATE_PASS")) fail(errors, `Unexpected assessment state: ${assessment.status}`);

  for (const record of assessment.records) {
    if (record.scope_relevance_label !== "RELEVANT") fail(errors, `${record.source_id}: expected RELEVANT in the passing interim queue.`);
    if (record.resolution_state !== "RESOLVED") fail(errors, `${record.source_id}: unresolved.`);
    if (!record.rationale || !record.evidence_references?.length) fail(errors, `${record.source_id}: missing rationale or evidence references.`);
    if (record.source_pool_promoted !== false || record.acquisition_authorized !== false || record.production !== "HOLD") fail(errors, `${record.source_id}: fail-closed boundary violated.`);
  }

  if (taxonomy.false_positive_count !== 0 || taxonomy.records.length !== 0) fail(errors, "Passing interim Top-50 must have zero false positives.");
  if (!nextGate.interim_top50_gate_pass || nextGate.status !== "INTERIM_GATE_PASS_FINAL_VALIDATION_REQUIRED") fail(errors, "Next gate must require final validation after interim PASS.");
  if (!nextGate.required_next_actions.includes("COMPLETE_TRACK_B_400_CASE_CALIBRATION") || !nextGate.required_next_actions.includes("COMPLETE_DIRECT_TOP200_ADJUDICATION")) fail(errors, "Final 400-case and Top-200 reviews must remain required.");

  if (manifest.status !== "TRACK_B_TARGETED_TOP50_INTERIM_GATE_PASS" || manifest.reviewed !== 50 || manifest.top50_precision < 0.95 || manifest.ranking_gate !== "PASS" || manifest.final_400_case_calibration_complete !== false || manifest.final_top200_review_complete !== false || manifest.source_pool_promotions !== 0 || manifest.acquisition_authorized !== false || manifest.production !== "HOLD") fail(errors, "Manifest status or fail-closed boundary is invalid.");

  validateFingerprints(outputs, errors);
  const manifestCopy = structuredClone(manifest);
  const stored = manifestCopy.run_fingerprint;
  delete manifestCopy.run_fingerprint;
  if (stored !== fingerprint(manifestCopy)) fail(errors, "Run manifest fingerprint mismatch.");
  return errors;
}

const directory = path.resolve(process.argv[2] ?? "");
const errors = validateTrackBTargetedTop50Pilot(directory);
if (errors.length) {
  console.error(`KIDULTS Track B Targeted High-Authority Top-50 Pilot: FAIL (${errors.length})`);
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}
const manifest = readJson(path.join(directory, "run-manifest.json"));
console.log("KIDULTS Track B Targeted High-Authority Top-50 Pilot: PASS");
console.log(`Reviewed / Relevant / Not relevant: ${manifest.reviewed} / ${manifest.relevant} / ${manifest.not_relevant}`);
console.log(`Measured precision: ${manifest.top50_precision.toFixed(3)} / required ${manifest.required_top50_precision.toFixed(3)}`);
console.log("Final 400-case + direct Top-200 review: INCOMPLETE");
console.log("Source Pool promotions: 0; Acquisition: BLOCKED; Production: HOLD");
