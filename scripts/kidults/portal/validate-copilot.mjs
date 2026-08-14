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
  engine: "apps/kidults-enterprise-staging/public/portal/components/copilot.js",
  css: "apps/kidults-enterprise-staging/public/portal/components/copilot.css",
  contract: "apps/kidults-enterprise-staging/public/portal/data/copilot-contract.json",
  portal: "apps/kidults-enterprise-staging/public/portal/portal.js",
  workspacePage: "apps/kidults-enterprise-staging/public/portal/workspace-page.js",
  workspaceHtml: "apps/kidults-enterprise-staging/public/portal/workspace.html",
  store: "apps/kidults-enterprise-staging/public/portal/components/data-store.js",
  why: "apps/kidults-enterprise-staging/public/portal/components/why-engine.js"
};

const engine = readText(paths.engine);
const css = readText(paths.css);
const portal = readText(paths.portal);
const workspacePage = readText(paths.workspacePage);
const workspaceHtml = readText(paths.workspaceHtml);
const store = readText(paths.store);
const why = readText(paths.why);
const contract = readJson(paths.contract);

for (const marker of [
  "startCopilot",
  "routeQuestion",
  "leadingVerticalAnswer",
  "changeAnswer",
  "evidenceAnswer",
  "reviewAnswer",
  "compareAnswer",
  "fallbackAnswer",
  "baseTraceability",
  "baseLimitations",
  "KIDULTS_COPILOT"
]) {
  if (!engine.includes(marker)) errors.push(`Copilot engine missing marker: ${marker}`);
}

for (const marker of [
  "Why is Mobility leading?",
  "What changed today?",
  "Compare Mobility and Watches.",
  "Show current evidence.",
  "What should I review today?"
]) {
  if (!engine.includes(marker) && !JSON.stringify(contract).includes(marker)) {
    errors.push(`Copilot missing required suggested question: ${marker}`);
  }
}

for (const marker of [
  ".kidults-copilot",
  ".kidults-copilot__form",
  ".kidults-copilot__answer",
  ".kidults-copilot__comparison",
  "@media(max-width:620px)",
  "@media(prefers-reduced-motion:reduce)"
]) {
  if (!css.includes(marker)) errors.push(`Copilot CSS missing marker: ${marker}`);
}

if (!workspacePage.includes('import { startCopilot } from "./components/copilot.js";')) {
  errors.push("workspace-page.js does not import startCopilot.");
}
if (!workspacePage.includes("startCopilot({ data, contract: data.copilot })")) {
  errors.push("workspace-page.js does not start Copilot on the dedicated route.");
}
if (portal.includes('import { startCopilot } from "./components/copilot.js";') || portal.includes("startCopilot({")) {
  errors.push("Homepage portal.js must not mount Copilot.");
}
if (!portal.includes('copilotEngine: "DEDICATED_ROUTE"')) {
  errors.push("portal.js does not publish Copilot as DEDICATED_ROUTE.");
}
if (!portal.includes('workspaceRoute: "workspace.html"') || !workspaceHtml.includes('data-page="workspace"')) {
  errors.push("Dedicated Workspace route for Copilot is unavailable.");
}
if (!store.includes('copilot: "data/copilot-contract.json?v=620"')) {
  errors.push("data-store.js does not register the Copilot contract.");
}
if (!store.includes("getJson(LOCAL.copilot)")) {
  errors.push("data-store.js does not load the Copilot contract.");
}
if (!store.includes("copilot,")) {
  errors.push("data-store.js does not return the Copilot contract.");
}
if (!why.includes("data-why-type")) {
  errors.push("WHY Engine integration target is unavailable.");
}

if (contract) {
  if (contract.engine_id !== "kidults-copilot") errors.push("Unexpected Copilot engine_id.");
  if (contract.mode !== "DETERMINISTIC_REGISTRY_GROUNDED_MVP") {
    errors.push("Copilot MVP mode must remain deterministic and Registry-grounded.");
  }
  const intents = new Set(contract.supported_intents ?? []);
  for (const required of [
    "why-leading",
    "what-changed",
    "compare-verticals",
    "show-evidence",
    "review-today",
    "explain-target"
  ]) {
    if (!intents.has(required)) errors.push(`Copilot contract missing intent: ${required}`);
  }

  const rules = contract.truth_rules ?? {};
  if (rules.allow_external_llm !== false) errors.push("External LLM must be disabled in the MVP.");
  if (rules.allow_fabricated_values !== false) errors.push("Fabricated values must be prohibited.");
  if (rules.allow_unregistered_change_claims !== false) errors.push("Unregistered change claims must be prohibited.");
  if (rules.missing_to_zero !== false) errors.push("Missing-to-zero conversion must be prohibited.");
  if (rules.require_snapshot_traceability !== true) errors.push("Snapshot traceability must be required.");
  if (rules.require_limitations !== true) errors.push("Known limitations must be required.");
  if (rules.allow_investment_language !== false) errors.push("Investment language must be prohibited.");
}

for (const prohibited of [
  /api\.openai\.com/i,
  /api\.anthropic\.com/i,
  /generativelanguage\.googleapis\.com/i,
  /STRONG\s+BUY/i,
  /BUY\s+NOW/i,
  /SELL\s+NOW/i,
  /guaranteed return/i,
  /missing\s*\?\?\s*0/i
]) {
  if (prohibited.test(engine)) errors.push(`Copilot engine contains prohibited pattern: ${prohibited}`);
}

if (/fetch\s*\(\s*["'`]https?:\/\//i.test(engine)) {
  errors.push("Copilot MVP must not call an external network endpoint.");
}

if (!engine.includes("Unsupported questions fail closed")) {
  warnings.push("Copilot UI does not explicitly state fail-closed behavior.");
}
if (!engine.includes("not a permanent market rank")) {
  errors.push("Leading-vertical answer must separate observation order from permanent market rank.");
}
if (!engine.includes("not a buy, sell, valuation, or investment recommendation")) {
  errors.push("Review guidance must explicitly reject investment advice.");
}
if (!engine.includes("No external LLM")) {
  errors.push("Copilot UI must disclose that the MVP has no external LLM.");
}

if (errors.length) {
  console.error(`KIDULTS Copilot validation: FAIL (${errors.length} error(s), ${warnings.length} warning(s))`);
  for (const error of errors) console.error(`ERROR: ${error}`);
  for (const warning of warnings) console.warn(`WARN: ${warning}`);
  process.exit(1);
}

console.log("KIDULTS Copilot validation: PASS (dedicated Workspace route, 6 intents, Registry-grounded, fail-closed)");
for (const warning of warnings) console.warn(`WARN: ${warning}`);
