import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const errors = [];

function absolute(relative) {
  return path.join(root, relative);
}

function read(relative) {
  const file = absolute(relative);
  if (!fs.existsSync(file)) {
    errors.push(`Missing required WHY Engine file: ${relative}`);
    return "";
  }
  return fs.readFileSync(file, "utf8");
}

function json(relative) {
  const text = read(relative);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (error) {
    errors.push(`Invalid JSON: ${relative}: ${error.message}`);
    return null;
  }
}

const files = {
  engine: "apps/kidults-enterprise-staging/public/portal/components/why-engine.js",
  css: "apps/kidults-enterprise-staging/public/portal/components/why-engine.css",
  contract: "apps/kidults-enterprise-staging/public/portal/data/why-engine-contract.json",
  portal: "apps/kidults-enterprise-staging/public/portal/portal.js",
  dataStore: "apps/kidults-enterprise-staging/public/portal/components/data-store.js",
  workflow: ".github/workflows/kidults-portal-v502-validate.yml"
};

const engine = read(files.engine);
const css = read(files.css);
const portal = read(files.portal);
const dataStore = read(files.dataStore);
const workflow = read(files.workflow);
const contract = json(files.contract);

for (const marker of [
  "startWhyEngine",
  "metricModel",
  "operationModel",
  "verticalModel",
  "objectModel",
  "signalModel",
  "KNOWN LIMITATIONS",
  "SOURCE TRACEABILITY",
  "Copy traceability",
  "showModal"
]) {
  if (!engine.includes(marker)) errors.push(`WHY Engine missing implementation marker: ${marker}`);
}

for (const marker of [
  ".why-trigger",
  ".why-engine",
  ".why-engine__confidence",
  ".why-engine__timeline",
  ".why-engine__limitations",
  "@media(max-width:760px)",
  "prefers-reduced-motion"
]) {
  if (!css.includes(marker)) errors.push(`WHY Engine CSS missing selector or rule: ${marker}`);
}

for (const marker of [
  'import { startWhyEngine } from "./components/why-engine.js"',
  "startWhyEngine({",
  "contract: data.why",
  "whyEngine: data.why.version"
]) {
  if (!portal.includes(marker)) errors.push(`portal.js missing WHY Engine integration: ${marker}`);
}

for (const marker of [
  'why: "data/why-engine-contract.json?v=610"',
  "getJson(LOCAL.why)",
  "why,"
]) {
  if (!dataStore.includes(marker)) errors.push(`data-store.js missing WHY contract integration: ${marker}`);
}

for (const marker of [
  "components/why-engine.js",
  "validate-why-engine.mjs",
  "Validate WHY Engine"
]) {
  if (!workflow.includes(marker)) errors.push(`Validation workflow missing WHY gate: ${marker}`);
}

if (contract) {
  if (contract.engine_id !== "kidults-why-engine") errors.push("WHY contract engine_id is invalid.");
  if (contract.status !== "RELEASE_CANDIDATE") errors.push("WHY contract must remain RELEASE_CANDIDATE.");

  const expectedTargets = ["metric", "operation", "vertical", "object", "signal"];
  for (const target of expectedTargets) {
    if (!contract.supported_targets?.includes(target)) errors.push(`WHY contract missing supported target: ${target}`);
  }

  if (contract.truth_rules?.allow_fabricated_values !== false) errors.push("WHY Engine must forbid fabricated values.");
  if (contract.truth_rules?.missing_to_zero !== false) errors.push("WHY Engine must forbid missing-to-zero conversion.");
  if (contract.truth_rules?.require_snapshot_traceability !== true) errors.push("WHY Engine must require snapshot traceability.");
  if (contract.truth_rules?.require_limitations !== true) errors.push("WHY Engine must require known limitations.");
  if (contract.truth_rules?.baseline_composition_is_score_formula !== false) {
    errors.push("WHY Engine must not present baseline composition as a score formula.");
  }
}

for (const prohibited of [
  /Math\.random\s*\(/,
  /128 verified signals/i,
  /2 new evidence/i,
  /12 source families/i,
  /confidence increased/i
]) {
  if (prohibited.test(engine)) errors.push(`WHY Engine contains prohibited demo or fabricated behavior: ${prohibited}`);
}

if (!/not a canonical or Rankability-approved result/i.test(engine)) {
  errors.push("WHY Engine must explicitly separate preview scores from Rankability approval.");
}
if (!/not presented as a Production live feed/i.test(engine)) {
  errors.push("WHY Engine must explicitly separate preview signals from a Production live feed.");
}
if (!/The evidence-composition chart describes the portal baseline/i.test(engine)) {
  errors.push("WHY Engine must explain the non-causal baseline-composition limitation.");
}

if (errors.length) {
  console.error(`KIDULTS WHY Engine validation: FAIL (${errors.length} error(s))`);
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}

console.log("KIDULTS WHY Engine validation: PASS (5 target types, truth-first traceability, responsive drawer)");
