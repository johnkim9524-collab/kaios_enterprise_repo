import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import crypto from "node:crypto";

const directory = path.resolve(process.argv[2] ?? "artifacts/agci-os/track-b-source-relevance-top50-v2-pilot");
const files = [
  "source-relevance-top50-v2-pilot-assessment.json",
  "top50-v2-error-taxonomy.json",
  "source-relevance-v3-directives.json",
  "run-manifest.json"
];
const errors = [];
const outputs = {};
for (const file of files) {
  const target = path.join(directory, file);
  if (!fs.existsSync(target)) errors.push(`Missing output: ${file}`);
  else outputs[file] = JSON.parse(fs.readFileSync(target, "utf8"));
}
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
function fp(value) { return `sha256:${crypto.createHash("sha256").update(stable(value)).digest("hex")}`; }
function check(value, message) { if (!value) errors.push(message); }

if (!errors.length) {
  const assessment = outputs[files[0]];
  const manifest = outputs[files[3]];
  for (const [name, value] of Object.entries(outputs)) {
    if (name === "run-manifest.json") continue;
    const copy = structuredClone(value);
    const recorded = copy.fingerprint;
    delete copy.fingerprint;
    check(recorded === fp(copy), `${name}: fingerprint mismatch.`);
  }
  check(assessment.reviewed_records === 50 && assessment.records.length === 50, "Exactly 50 cases must be reviewed.");
  check(new Set(assessment.records.map(record => record.endpoint_id)).size === 50, "Reviewed endpoint IDs must be unique.");
  check(assessment.records.every(record => record.resolution_state === "RESOLVED"), "No review may remain unresolved.");
  check(assessment.records.every(record => ["RELEVANT","NOT_RELEVANT"].includes(record.scope_relevance_label)), "Every case requires a relevance label.");
  check(assessment.records.every(record => record.reviewer && record.rationale && record.evidence_references?.length), "Every case requires reviewer, rationale and evidence references.");
  check(assessment.records.every(record => record.qualified_source === false && record.source_pool_promotion_authorized === false && record.acquisition_authorized === false && record.production === "HOLD"), "Pilot must not qualify, promote, acquire or produce.");
  check(assessment.relevant_records + assessment.not_relevant_records === 50, "Relevant and not-relevant counts must sum to 50.");
  check(assessment.measured_top_50_precision === assessment.relevant_records / 50, "Measured precision mismatch.");
  check(assessment.prior_pilot_endpoint_overlap === 0, "v2 pilot must be a zero-overlap holdout.");
  check(assessment.empirical_scope.includes("NOT_EXTERNAL_HUMAN_GOLD"), "Assessment must disclose model-assisted non-Gold scope.");
  check(manifest.reviewed_records === 50 && manifest.measured_top_50_precision === assessment.measured_top_50_precision, "Manifest metrics mismatch.");
  check(manifest.source_pool_promotions === 0 && manifest.acquisition_authorized === false && manifest.production === "HOLD", "Manifest boundaries must remain closed.");
  const copy = structuredClone(manifest);
  const recorded = copy.run_fingerprint;
  delete copy.run_fingerprint;
  check(recorded === fp(copy), "Manifest fingerprint mismatch.");
}

if (errors.length) {
  console.error(`KIDULTS Track B Source Relevance Top-50 v2 Pilot: FAIL (${errors.length})`);
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}
const run = outputs["run-manifest.json"];
console.log("KIDULTS Track B Source Relevance Top-50 v2 Pilot: PASS");
console.log(`Reviewed / relevant / not relevant: ${run.reviewed_records} / ${run.relevant_records} / ${run.not_relevant_records}`);
console.log(`Measured precision: ${run.measured_top_50_precision.toFixed(3)}`);
console.log(`Interim / final gate: ${run.interim_precision_pass ? "PASS" : "FAIL"} / ${run.final_precision_pass ? "PASS" : "FAIL"}`);
console.log("Source Pool promotions: 0; Acquisition: BLOCKED; Production: HOLD");
