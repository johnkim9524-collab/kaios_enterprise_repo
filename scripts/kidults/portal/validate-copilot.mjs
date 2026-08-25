import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

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
  why: "apps/kidults-enterprise-staging/public/portal/components/why-engine.js",
  detail: "apps/kidults-enterprise-staging/public/portal/detail.js",
  verticals: "apps/kidults-enterprise-staging/public/portal/data/verticals.json",
  registry: "apps/kidults-enterprise-staging/public/portal/data/registry-view.json"
};

const engine = readText(paths.engine);
const css = readText(paths.css);
const portal = readText(paths.portal);
const workspacePage = readText(paths.workspacePage);
const workspaceHtml = readText(paths.workspaceHtml);
const store = readText(paths.store);
const why = readText(paths.why);
const detail = readText(paths.detail);
const contract = readJson(paths.contract);
const verticalData = readJson(paths.verticals);
const registry = readJson(paths.registry);

async function validateCopilotGateMatrix() {
  if (!engine || !verticalData || !registry) return;

  let buildCopilotAnswer;
  try {
    ({ buildCopilotAnswer } = await import(pathToFileURL(absolute(paths.engine)).href));
  } catch (error) {
    errors.push(`Copilot behavioral import failed: ${error.message}`);
    return;
  }

  if (typeof buildCopilotAnswer !== "function") {
    errors.push("Copilot must export buildCopilotAnswer for behavioral truth-gate validation.");
    return;
  }

  const fixture = ({ connected = true, sourceMatch = true, candidate = "candidate-test", evidence = "evidence-test", assessment = "assessment-test", production = "PRODUCTION" } = {}) => ({
    meta: { registryProjectionConnected: connected },
    manifest: {
      snapshot_id: verticalData.source_snapshot_id,
      source_mode: verticalData.source_mode,
      methodology_version: "methodology-test-v1",
      evidence_lineage_version: "evidence-test-v1",
      production: production === "PRODUCTION"
    },
    verticals: structuredClone(verticalData),
    registry: {
      ...structuredClone(registry),
      snapshot: {
        ...(registry.snapshot ?? {}),
        baseline_id: sourceMatch ? verticalData.source_snapshot_id : "different-baseline-test",
        candidate_id: candidate,
        candidate_status: candidate ? "REGISTERED" : "WAITING"
      },
      evidence: {
        ...(registry.evidence ?? {}),
        current_package_id: evidence,
        status: evidence ? "REGISTERED" : "WAITING"
      },
      assessment: {
        ...(registry.assessment ?? {}),
        current_id: assessment,
        status: assessment ? "REGISTERED" : "WAITING"
      },
      release: { ...(registry.release ?? {}), status: production }
    }
  });

  const cases = [
    ["NOT_AVAILABLE", fixture({ connected: false })],
    ["SOURCE_MISMATCH", fixture({ sourceMatch: false })],
    ["WAITING_FOR_CANDIDATE", fixture({ candidate: null, evidence: null, assessment: null, production: "HOLD" })],
    ["WAITING_FOR_EVIDENCE", fixture({ evidence: null, assessment: null, production: "HOLD" })],
    ["WAITING_FOR_ASSESSMENT", fixture({ assessment: null, production: "HOLD" })],
    ["PREVIEW_ONLY", fixture({ production: "HOLD" })],
    ["CURRENT", fixture()]
  ];

  for (const [expectedState, data] of cases) {
    const controlled = buildCopilotAnswer("Compare Mobility and Watches.", data);
    if (expectedState === "CURRENT") {
      if (controlled.intent !== "compare-verticals" || !controlled.comparison?.rows?.length || !controlled.actions?.length) {
        errors.push("Copilot CURRENT gate must expose the controlled comparison and its registered actions.");
      }
    } else {
      if (controlled.intent !== "empirical-gate" || controlled.state !== expectedState) {
        errors.push(`Copilot gate ${expectedState} must return a matching empirical-gate answer.`);
      }
      if (controlled.comparison !== null || controlled.actions?.length) {
        errors.push(`Copilot gate ${expectedState} exposed a comparison or action before CURRENT.`);
      }
      const allowedFactLabels = new Set(["Candidate", "Evidence", "Assessment", "Production"]);
      if ((controlled.facts ?? []).some(([label, value]) => !allowedFactLabels.has(label) || /\d/.test(String(value)))) {
        errors.push(`Copilot gate ${expectedState} exposed numeric empirical facts before CURRENT.`);
      }
    }

    const unsupported = buildCopilotAnswer("What is the weather in Seoul?", data);
    if (unsupported.intent !== "fallback" || unsupported.actions?.length || unsupported.comparison) {
      errors.push(`Copilot unsupported question did not remain fail-closed fallback at gate ${expectedState}.`);
    }
  }
}

for (const marker of [
  "startCopilot",
  "buildCopilotAnswer",
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

for (const [surface, source, markers] of [
  ["Detail", detail, [
    'import { resolveEmpiricalGateState } from "./components/empirical-truth-gate.js";',
    'available: gateState === "CURRENT"',
    'empirical.available ? format(value) : "NOT AVAILABLE"',
    'empirical.available && object.score !== null',
    'empirical.available ? confidenceLabel(object.confidence) : "NOT AVAILABLE"'
  ]],
  ["WHY", why, [
    'import { empiricalTruthContext, resolveEmpiricalGateState } from "./empirical-truth-gate.js";',
    'resolveEmpiricalGateState(data) === "CURRENT"',
    ': gatedModel(data, type, index)',
    'value: "NOT AVAILABLE"',
    'confidence: null',
    'composition: []'
  ]]
]) {
  for (const marker of markers) {
    if (!source.includes(marker)) errors.push(`${surface} empirical-gate suppression marker missing: ${marker}`);
  }
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

if (!engine.includes('production: registry.release?.status ?? "NOT AVAILABLE"')) {
  errors.push("Copilot production truth must come from registry.release.status.");
}
if (/\brelease\s*:\s*manifest\.status\b/.test(engine) || /context\.release\b/.test(engine)) {
  errors.push("Copilot must not present manifest release-candidate status as the Production gate.");
}
if (!engine.includes('["Production", context.production]')) {
  errors.push("Copilot fail-closed facts must disclose the Registry Production state.");
}
if (engine.includes('["Release", context.release]')) {
  errors.push("Copilot fallback facts must not label manifest release status as current release truth.");
}

for (const href of [
  "https://kidults.com/#universe",
  "https://kidults.com/#intelligence",
  "https://kidults.com/#trust"
]) {
  if (!engine.includes(`href: "${href}"`)) {
    errors.push(`Copilot public action must use the canonical portal URL: ${href}`);
  }
}
for (const localTarget of ['href: "#research"', 'href: "#evidence-title"', "https://kidults.com/vertical.html", "https://kidults.com/object.html"]) {
  if (engine.includes(localTarget)) {
    errors.push(`Copilot public action must not use a Workspace-local dead target: ${localTarget}`);
  }
}

if (!engine.includes("const answer = buildCopilotAnswer(text, data);")) {
  errors.push("Copilot runtime does not use the behaviorally validated buildCopilotAnswer path.");
}

await validateCopilotGateMatrix();

if (errors.length) {
  console.error(`KIDULTS Copilot validation: FAIL (${errors.length} error(s), ${warnings.length} warning(s))`);
  for (const error of errors) console.error(`ERROR: ${error}`);
  for (const warning of warnings) console.warn(`WARN: ${warning}`);
  process.exit(1);
}

console.log("KIDULTS Copilot validation: PASS (7-state behavioral gate, unsupported fallback, Detail/WHY metric suppression)");
for (const warning of warnings) console.warn(`WARN: ${warning}`);
