import fs from "node:fs";

const workflowPath = ".github/workflows/kidults-agci-os-candidate-r2-preflight.yml";
const converterPath = "scripts/kidults/engine-v2/prepare-live-authority-shadow-inputs.mjs";
const validatorPath = "scripts/kidults/engine-v2/validate-candidate-r2-preflight-live.mjs";

function validate(workflow, converter, validator) {
  const requiredWorkflowTokens = [
    "collect-met-open-access-sample.mjs",
    "validate-met-open-access-sample.mjs",
    "collect-vam-fashion-sample.mjs",
    "validate-vam-fashion-sample.mjs",
    "prepare-live-authority-shadow-inputs.mjs",
    "validate-candidate-r2-preflight-live.mjs",
    "met-costume-open-access-r1",
    "vam-fashion-collections-r1",
    "github.run_attempt"
  ];
  for (const token of requiredWorkflowTokens) {
    if (!workflow.includes(token)) throw new Error(`workflow missing ${token}`);
  }
  if (workflow.includes("node scripts/kidults/engine-v2/validate-candidate-r2-preflight.mjs")) {
    throw new Error("workflow regressed to brittle historical-cardinality validator");
  }
  const prepare = workflow.indexOf("prepare-live-authority-shadow-inputs.mjs");
  const build = workflow.indexOf("run-candidate-r2-preflight.mjs");
  if (!(prepare >= 0 && build > prepare)) throw new Error("live Met/V&A preparation must precede Candidate R2 build");

  for (const token of [
    "normalized-evidence-records.json",
    'source_family: "THE_MET"',
    'source_family: "V_AND_A"',
    'provider_id_is_canonical_id: false',
    'public_commercial_authorized: false'
  ]) {
    if (!converter.includes(token)) throw new Error(`converter missing ${token}`);
  }

  for (const token of [
    'new Set(["THE_MET", "V_AND_A", "SMITHSONIAN", "ART_INSTITUTE_CHICAGO"])',
    "wallAgeMs",
    "run?.admitted_authority_record_count === run?.authority_input_record_count",
    "candidate.market_cluster_claim === false",
    "Production/Public/G5: HOLD"
  ]) {
    if (!validator.includes(token)) throw new Error(`validator missing ${token}`);
  }
  for (const brittle of ["=== 48", "=== 46", "=== 197", "=== 97 &&", "=== 50"]) {
    if (validator.includes(brittle)) throw new Error(`validator contains brittle historical shape: ${brittle}`);
  }
}

const workflow = fs.readFileSync(workflowPath, "utf8");
const converter = fs.readFileSync(converterPath, "utf8");
const validator = fs.readFileSync(validatorPath, "utf8");
validate(workflow, converter, validator);

const negativeCases = [
  ["missing Met live collector", workflow.replaceAll("collect-met-open-access-sample.mjs", "missing-met-collector.mjs"), converter, validator],
  ["missing V&A live collector", workflow.replaceAll("collect-vam-fashion-sample.mjs", "missing-vam-collector.mjs"), converter, validator],
  ["old validator restored", workflow.replaceAll("validate-candidate-r2-preflight-live.mjs", "validate-candidate-r2-preflight.mjs"), converter, validator],
  ["provider canonical-id promotion", workflow, converter.replaceAll("provider_id_is_canonical_id: false", "provider_id_is_canonical_id: true"), validator],
  ["wall-clock freshness removed", workflow, converter, validator.replaceAll("wallAgeMs", "removedWallClockBinding")]
];
for (const [name, w, c, v] of negativeCases) {
  let rejected = false;
  try { validate(w, c, v); } catch { rejected = true; }
  if (!rejected) throw new Error(`negative regression was not rejected: ${name}`);
}
console.log("Candidate R2 live-source regression contract: PASS");
