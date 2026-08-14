import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const errors = [];
const warnings = [];

function absolute(relative) {
  return path.join(root, relative);
}

function readText(relative) {
  const file = absolute(relative);
  if (!fs.existsSync(file)) {
    errors.push(`Missing required file: ${relative}`);
    return "";
  }
  return fs.readFileSync(file, "utf8");
}

function readJson(relative) {
  const text = readText(relative);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (error) {
    errors.push(`Invalid JSON: ${relative}: ${error.message}`);
    return null;
  }
}

const paths = {
  engine: "apps/kidults-enterprise-staging/public/portal/components/compare-engine.js",
  css: "apps/kidults-enterprise-staging/public/portal/components/compare-engine.css",
  contract: "apps/kidults-enterprise-staging/public/portal/data/compare-engine-contract.json",
  portal: "apps/kidults-enterprise-staging/public/portal/portal.js",
  workspacePage: "apps/kidults-enterprise-staging/public/portal/workspace-page.js",
  workspaceHtml: "apps/kidults-enterprise-staging/public/portal/workspace.html",
  store: "apps/kidults-enterprise-staging/public/portal/components/data-store.js",
  why: "apps/kidults-enterprise-staging/public/portal/components/why-engine.js",
  verticals: "apps/kidults-enterprise-staging/public/portal/data/verticals.json"
};

const engine = readText(paths.engine);
const css = readText(paths.css);
const portal = readText(paths.portal);
const workspacePage = readText(paths.workspacePage);
const workspaceHtml = readText(paths.workspaceHtml);
const store = readText(paths.store);
const why = readText(paths.why);
const contract = readJson(paths.contract);
const verticalData = readJson(paths.verticals);

for (const marker of [
  "startCompareEngine",
  "comparisonModel",
  "buildRows",
  "differenceNarrative",
  "baseLimitations",
  "writePairToUrl",
  "kidults:compare",
  "KIDULTS_COMPARE"
]) {
  if (!engine.includes(marker)) errors.push(`Compare Engine missing marker: ${marker}`);
}

for (const marker of [
  "Right Data coverage",
  "Demand evidence",
  "Relevant entities",
  "Demand evidence records",
  "Scarcity evidence records",
  "Current observation order",
  "Structural order",
  "Current featured state"
]) {
  if (!engine.includes(marker)) errors.push(`Compare Engine missing metric: ${marker}`);
}

for (const marker of [
  ".compare-engine",
  ".compare-engine__controls",
  ".compare-engine__profiles",
  ".compare-engine__table",
  ".compare-engine__difference",
  ".compare-engine__traceability",
  "@media(max-width:700px)",
  "@media(prefers-reduced-motion:reduce)"
]) {
  if (!css.includes(marker)) errors.push(`Compare Engine CSS missing marker: ${marker}`);
}

if (!workspacePage.includes('import { startCompareEngine } from "./components/compare-engine.js";')) {
  errors.push("workspace-page.js does not import startCompareEngine.");
}
if (!workspacePage.includes("startCompareEngine({ data, contract: data.compare })")) {
  errors.push("workspace-page.js does not start Compare Engine on the dedicated route.");
}
if (portal.includes('import { startCompareEngine } from "./components/compare-engine.js";') || portal.includes("startCompareEngine({")) {
  errors.push("Homepage portal.js must not mount Compare Engine.");
}
if (!portal.includes('compareEngine: "DEDICATED_ROUTE"')) {
  errors.push("portal.js does not publish Compare Engine as DEDICATED_ROUTE.");
}
if (!portal.includes('workspaceRoute: "workspace.html"') || !workspaceHtml.includes('data-page="workspace"')) {
  errors.push("Dedicated Workspace route for Compare Engine is unavailable.");
}
if (!store.includes('compare: "data/compare-engine-contract.json?v=630"')) {
  errors.push("data-store.js does not register the Compare Engine contract.");
}
if (!store.includes("getJson(LOCAL.compare)")) {
  errors.push("data-store.js does not load the Compare Engine contract.");
}
if (!store.includes("compare,")) {
  errors.push("data-store.js does not return the Compare Engine contract.");
}
if (!why.includes('data-why-type="vertical"') && !why.includes("data-why-type")) {
  errors.push("WHY Engine vertical integration target is unavailable.");
}

if (contract) {
  if (contract.engine_id !== "kidults-compare-engine") errors.push("Unexpected Compare Engine engine_id.");
  if (contract.scope !== "CORE_VERTICALS") errors.push("Compare Engine scope must remain CORE_VERTICALS.");
  if (contract.default_left_id === contract.default_right_id) errors.push("Default comparison pair must contain two different verticals.");

  const requiredMetrics = new Set([
    "right_data_coverage_pct",
    "demand_evidence_pct",
    "relevant",
    "demand_evidence_count",
    "scarcity_evidence_count",
    "current_observation_order",
    "structural_order",
    "featured"
  ]);
  const registeredMetrics = new Set(contract.metrics ?? []);
  for (const metric of requiredMetrics) {
    if (!registeredMetrics.has(metric)) errors.push(`Compare contract missing metric: ${metric}`);
  }

  const rules = contract.truth_rules ?? {};
  if (rules.allow_rankability_claims !== false) errors.push("Rankability claims must be prohibited.");
  if (rules.allow_investment_language !== false) errors.push("Investment language must be prohibited.");
  if (rules.allow_missing_to_zero !== false) errors.push("Missing-to-zero conversion must be prohibited.");
  if (rules.require_snapshot_traceability !== true) errors.push("Snapshot traceability must be required.");
  if (rules.require_limitations !== true) errors.push("Known limitations must be required.");
  if (rules.separate_observation_from_rank !== true) errors.push("Observation order must be separated from rank.");
}

if (verticalData) {
  const verticals = verticalData.verticals ?? [];
  if (verticals.length !== 8) errors.push(`Compare Engine expects 8 Core Verticals, found ${verticals.length}.`);
  const ids = new Set(verticals.map(vertical => vertical.id));
  if (contract?.default_left_id && !ids.has(contract.default_left_id)) errors.push("Default left vertical is not registered.");
  if (contract?.default_right_id && !ids.has(contract.default_right_id)) errors.push("Default right vertical is not registered.");
  for (const vertical of verticals) {
    for (const field of [
      "right_data_coverage_pct",
      "demand_evidence_pct",
      "relevant",
      "demand_evidence_count",
      "demand_denominator",
      "scarcity_evidence_count",
      "current_observation_order",
      "structural_order"
    ]) {
      if (!Number.isFinite(vertical[field])) errors.push(`${vertical.id}: missing numeric compare field ${field}.`);
    }
    if (typeof vertical.featured !== "boolean") errors.push(`${vertical.id}: featured must be boolean.`);
  }
}

for (const requiredStatement of [
  "not a permanent rank",
  "not an independent Track B Rankability Assessment",
  "Higher coverage does not by itself establish higher value",
  "provider-independent"
]) {
  if (!engine.includes(requiredStatement)) errors.push(`Compare Engine missing truth statement: ${requiredStatement}`);
}

for (const prohibited of [
  /api\.openai\.com/i,
  /api\.anthropic\.com/i,
  /generativelanguage\.googleapis\.com/i,
  /STRONG\s+BUY/i,
  /BUY\s+NOW/i,
  /SELL\s+NOW/i,
  /guaranteed return/i,
  /missing\s*\?\?\s*0/i,
  /convert[^\n]{0,30}missing[^\n]{0,30}zero/i
]) {
  if (prohibited.test(engine)) errors.push(`Compare Engine contains prohibited pattern: ${prohibited}`);
}

if (/fetch\s*\(\s*["'`]https?:\/\//i.test(engine)) {
  errors.push("Compare Engine must not call an external network endpoint.");
}
if (!engine.includes("Source registry") || !engine.includes("Snapshot") || !engine.includes("Assessment")) {
  errors.push("Compare Engine traceability is incomplete.");
}
if (!engine.includes("openWhy") || !engine.includes("data-compare-why-index")) {
  errors.push("Compare Engine does not integrate with WHY.");
}

if (errors.length) {
  console.error(`KIDULTS Compare Engine validation: FAIL (${errors.length} error(s), ${warnings.length} warning(s))`);
  for (const error of errors) console.error(`ERROR: ${error}`);
  for (const warning of warnings) console.warn(`WARN: ${warning}`);
  process.exit(1);
}

console.log("KIDULTS Compare Engine validation: PASS (dedicated Workspace route, 8 verticals, 8 metrics, truth-first)");
for (const warning of warnings) console.warn(`WARN: ${warning}`);
