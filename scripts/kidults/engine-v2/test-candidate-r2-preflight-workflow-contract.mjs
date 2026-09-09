import assert from "node:assert/strict";
import fs from "node:fs";

const candidateWorkflow = fs.readFileSync(".github/workflows/kidults-agci-os-candidate-r2-preflight.yml", "utf8");
const wrapper = fs.readFileSync("scripts/kidults/engine-v2/validate-candidate-r2-preflight.mjs", "utf8");

const governedValidator = "node scripts/kidults/engine-v2/validate-candidate-r2-preflight.mjs";
const goldenBuilder = "node scripts/kidults/golden-dataset/build-golden-dataset-v1-candidate.mjs";
const validatorIndex = candidateWorkflow.indexOf(governedValidator);
const goldenIndex = candidateWorkflow.indexOf(goldenBuilder);

assert(validatorIndex >= 0, "Candidate R2 workflow must invoke the governed two-stage preflight validator.");
assert(goldenIndex >= 0, "Candidate R2 workflow must retain the Golden Dataset builder after the gate.");
assert(validatorIndex < goldenIndex, "Candidate R2 two-stage preflight gate must execute before Golden Dataset construction.");
assert(!candidateWorkflow.includes("node scripts/kidults/engine-v2/validate-candidate-r2-preflight-structure.mjs"),
  "Workflow must not bypass the advancement gate by invoking structural validation directly.");

const structureIndex = wrapper.indexOf('runGate("validate-candidate-r2-preflight-structure.mjs")');
const advancementIndex = wrapper.indexOf('runGate("validate-candidate-r2-advancement.mjs")');
assert(structureIndex >= 0 && advancementIndex >= 0,
  "Governed validator wrapper must execute both structural and advancement gates.");
assert(structureIndex < advancementIndex,
  "Structural containment validation must precede downstream advancement eligibility.");

console.log("Candidate R2 workflow gate ordering regression: PASS");
