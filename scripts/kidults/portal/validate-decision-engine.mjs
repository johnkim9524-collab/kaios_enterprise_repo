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
  engine: "apps/kidults-enterprise-staging/public/portal/components/decision-engine.js",
  css: "apps/kidults-enterprise-staging/public/portal/components/decision-engine.css",
  contract: "apps/kidults-enterprise-staging/public/portal/data/decision-engine-contract.json",
  portal: "apps/kidults-enterprise-staging/public/portal/portal.js",
  workspacePage: "apps/kidults-enterprise-staging/public/portal/workspace-page.js",
  workspaceHtml: "apps/kidults-enterprise-staging/public/portal/workspace.html",
  store: "apps/kidults-enterprise-staging/public/portal/components/data-store.js",
  why: "apps/kidults-enterprise-staging/public/portal/components/why-engine.js",
  copilot: "apps/kidults-enterprise-staging/public/portal/components/copilot.js",
  compare: "apps/kidults-enterprise-staging/public/portal/components/compare-engine.js",
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
const copilot = readText(paths.copilot);
const compare = readText(paths.compare);
const contract = readJson(paths.contract);
const verticalData = readJson(paths.verticals);
const registry = readJson(paths.registry);

async function validateGateMatrix() {
  if (!engine || !contract || !verticalData || !registry) return;

  let buildModel;
  try {
    ({ buildModel } = await import(pathToFileURL(absolute(paths.engine)).href));
  } catch (error) {
    errors.push(`Decision Engine behavioral import failed: ${error.message}`);
    return;
  }

  if (typeof buildModel !== "function") {
    errors.push("Decision Engine must export buildModel for behavioral gate validation.");
    return;
  }

  const fixture = ({ connected, sourceMatch = true, candidate, evidence, assessment, production }) => ({
    meta: { registryProjectionConnected: connected },
    manifest: {
      snapshot_id: verticalData.source_snapshot_id,
      source_mode: verticalData.source_mode,
      methodology_version: "methodology-test-v1",
      evidence_lineage_version: "evidence-test-v1",
      status: "RELEASE_CANDIDATE",
      production: production === "PRODUCTION"
    },
    verticals: structuredClone(verticalData),
    registry: {
      ...structuredClone(registry),
      snapshot: {
        ...(registry.snapshot ?? {}),
        baseline_id: sourceMatch ? verticalData.source_snapshot_id : "different-baseline-test",
        candidate_id: candidate,
        candidate_status: candidate ? "REGISTERED" : "WAITING_FOR_NEW_BOUNDED_POC_CANDIDATE"
      },
      evidence: {
        ...(registry.evidence ?? {}),
        current_package_id: evidence,
        status: evidence ? "REGISTERED" : "WAITING_FOR_NEW_BOUNDED_POC_EVIDENCE_PACKAGE"
      },
      assessment: {
        ...(registry.assessment ?? {}),
        current_id: assessment,
        status: assessment ? "REGISTERED" : "WAITING_FOR_SNAPSHOT"
      },
      release: {
        ...(registry.release ?? {}),
        status: production
      }
    }
  });

  const cases = [
    ["NOT_AVAILABLE", fixture({ connected: false, candidate: null, evidence: null, assessment: null, production: "HOLD" }), 0],
    ["SOURCE_MISMATCH", fixture({ connected: true, sourceMatch: false, candidate: "candidate-test", evidence: "evidence-test", assessment: "assessment-test", production: "PRODUCTION" }), 0],
    ["WAITING_FOR_CANDIDATE", fixture({ connected: true, candidate: null, evidence: null, assessment: null, production: "HOLD" }), 0],
    ["WAITING_FOR_EVIDENCE", fixture({ connected: true, candidate: "candidate-test", evidence: null, assessment: null, production: "HOLD" }), 0],
    ["WAITING_FOR_ASSESSMENT", fixture({ connected: true, candidate: "candidate-test", evidence: "evidence-test", assessment: null, production: "HOLD" }), 0],
    ["PREVIEW_ONLY", fixture({ connected: true, candidate: "candidate-test", evidence: "evidence-test", assessment: "assessment-test", production: "HOLD" }), 0],
    ["CURRENT", fixture({ connected: true, candidate: "candidate-test", evidence: "evidence-test", assessment: "assessment-test", production: "PRODUCTION" }), contract.max_items]
  ];

  for (const [expectedState, data, expectedQueueLength] of cases) {
    const model = buildModel(data, contract);
    if (model.gateState !== expectedState) {
      errors.push(`Decision gate matrix expected ${expectedState}, received ${model.gateState}.`);
    }
    if (model.queue.length !== expectedQueueLength) {
      errors.push(`Decision gate ${expectedState} must expose ${expectedQueueLength} queue item(s), found ${model.queue.length}.`);
    }
    if (expectedState !== "CURRENT" && model.leader !== null) {
      errors.push(`Decision gate ${expectedState} must not expose a leader/action target.`);
    }
  }
}

for (const marker of [
  "startDecisionEngine",
  "buildModel",
  "resolveEmpiricalGateState",
  "guidanceFor",
  "guidanceReason",
  "limitationsFor",
  "openWhy",
  "openCompare",
  "askCopilot",
  "KIDULTS_DECISION"
]) {
  if (!engine.includes(marker)) errors.push(`Decision Engine missing marker: ${marker}`);
}

for (const marker of [
  "REVIEW_FIRST",
  "REVIEW",
  "OBSERVE",
  "WAITING_FOR_CANDIDATE",
  "WAITING_FOR_EVIDENCE",
  "WAITING_FOR_ASSESSMENT",
  "PREVIEW_ONLY",
  "SOURCE_MISMATCH"
]) {
  if (!engine.includes(marker) && !JSON.stringify(contract).includes(marker)) {
    errors.push(`Decision Engine missing state: ${marker}`);
  }
}

for (const marker of [
  ".decision-engine",
  ".decision-engine__overview",
  ".decision-engine__primary",
  ".decision-engine__gates",
  ".decision-engine__queue",
  ".decision-engine__limitations",
  ".decision-engine__traceability",
  "@media(max-width:580px)",
  "@media(prefers-reduced-motion:reduce)"
]) {
  if (!css.includes(marker)) errors.push(`Decision Engine CSS missing marker: ${marker}`);
}

if (!workspacePage.includes('import { startDecisionEngine } from "./components/decision-engine.js";')) {
  errors.push("workspace-page.js does not import startDecisionEngine.");
}
if (!workspacePage.includes("startDecisionEngine({ data, contract: data.decision })")) {
  errors.push("workspace-page.js does not start Decision Engine on the dedicated route.");
}
if (portal.includes('import { startDecisionEngine } from "./components/decision-engine.js";') || portal.includes("startDecisionEngine({")) {
  errors.push("Homepage portal.js must not mount Decision Engine.");
}
if (!portal.includes('decisionEngine: "DEDICATED_ROUTE"')) {
  errors.push("portal.js does not publish Decision Engine as DEDICATED_ROUTE.");
}
if (!portal.includes('workspaceRoute: "workspace.html"') || !workspaceHtml.includes('data-page="workspace"')) {
  errors.push("Dedicated Workspace route for Decision Engine is unavailable.");
}
if (!store.includes('decision: "data/decision-engine-contract.json?v=640"')) {
  errors.push("data-store.js does not register the Decision Engine contract.");
}
if (!store.includes("getJson(LOCAL.decision)")) {
  errors.push("data-store.js does not load the Decision Engine contract.");
}
if (!store.includes("decision,")) {
  errors.push("data-store.js does not return the Decision Engine contract.");
}
if (!why.includes("data-why-type")) errors.push("WHY Engine integration target is unavailable.");
if (!copilot.includes("KIDULTS_COPILOT")) errors.push("Copilot integration target is unavailable.");
if (!compare.includes("KIDULTS_COMPARE")) errors.push("Compare integration target is unavailable.");

if (contract) {
  if (contract.engine_id !== "kidults-decision-engine") errors.push("Unexpected Decision Engine engine_id.");
  if (contract.mode !== "PORTAL_REVIEW_GUIDANCE") errors.push("Decision Engine mode must remain PORTAL_REVIEW_GUIDANCE.");
  if (contract.max_items !== 5) errors.push("Decision Engine must expose exactly five review priorities.");
  if (contract.priority_basis !== "current_observation_order") {
    errors.push("Decision priority basis must be current_observation_order.");
  }

  const guidance = new Set(contract.guidance_states ?? []);
  for (const state of ["REVIEW_FIRST", "REVIEW", "OBSERVE", "WAITING"]) {
    if (!guidance.has(state)) errors.push(`Decision contract missing guidance state: ${state}`);
  }

  const gates = new Set(contract.gate_states ?? []);
  for (const state of [
    "CURRENT",
    "SOURCE_MISMATCH",
    "WAITING_FOR_CANDIDATE",
    "WAITING_FOR_EVIDENCE",
    "WAITING_FOR_ASSESSMENT",
    "PREVIEW_ONLY",
    "NOT_AVAILABLE"
  ]) {
    if (!gates.has(state)) errors.push(`Decision contract missing gate state: ${state}`);
  }

  const failClosed = new Set(contract.fail_closed_states ?? []);
  for (const state of [
    "NOT_AVAILABLE",
    "SOURCE_MISMATCH",
    "WAITING_FOR_CANDIDATE",
    "WAITING_FOR_EVIDENCE",
    "WAITING_FOR_ASSESSMENT",
    "PREVIEW_ONLY"
  ]) {
    if (!failClosed.has(state)) errors.push(`Decision contract missing fail-closed state: ${state}`);
  }

  const rules = contract.truth_rules ?? {};
  if (rules.allow_investment_language !== false) errors.push("Investment language must be prohibited.");
  if (rules.allow_final_decision !== false) errors.push("Final decisions must be prohibited.");
  if (rules.allow_registry_mutation !== false) errors.push("Registry mutation must be prohibited.");
  if (rules.allow_rankability_claims !== false) errors.push("Rankability claims must be prohibited.");
  if (rules.allow_missing_to_zero !== false) errors.push("Missing-to-zero conversion must be prohibited.");
  if (rules.require_snapshot_traceability !== true) errors.push("Snapshot traceability must be required.");
  if (rules.require_gate_disclosure !== true) errors.push("Gate disclosure must be required.");
  if (rules.require_limitations !== true) errors.push("Known limitations must be required.");
}

if (verticalData) {
  const verticals = verticalData.verticals ?? [];
  if (verticals.length !== 8) errors.push(`Decision Engine expects 8 Core Verticals, found ${verticals.length}.`);
  const observationOrders = verticals.map(vertical => vertical.current_observation_order).sort((a, b) => a - b);
  if (observationOrders.join(",") !== "1,2,3,4,5,6,7,8") {
    errors.push("Current observation orders must be exactly 1–8.");
  }
  for (const vertical of verticals) {
    for (const field of [
      "right_data_coverage_pct",
      "demand_evidence_pct",
      "relevant",
      "current_observation_order",
      "structural_order"
    ]) {
      if (!Number.isFinite(vertical[field])) errors.push(`${vertical.id}: missing numeric decision field ${field}.`);
    }
    if (typeof vertical.featured !== "boolean") errors.push(`${vertical.id}: featured must be boolean.`);
  }
}

if (registry) {
  if (registry.snapshot?.candidate_id !== null) warnings.push("Current Registry now contains a Candidate Snapshot; verify the expected gate state.");
  if (registry.assessment?.current_id !== null) warnings.push("Current Registry now contains an Assessment; verify the expected gate state.");
}

for (const statement of [
  "portal review guidance, not investment advice and not a final decision",
  "Review order is derived from registered current observation order",
  "does not modify any Registry",
  "does not imply higher price, value, return or permanent rank",
  "No independent Track B Rankability Assessment is registered"
]) {
  if (!engine.includes(statement)) errors.push(`Decision Engine missing truth statement: ${statement}`);
}

for (const prohibited of [
  /api\.openai\.com/i,
  /api\.anthropic\.com/i,
  /generativelanguage\.googleapis\.com/i,
  /STRONG\s+BUY/i,
  /BUY\s+NOW/i,
  /SELL\s+NOW/i,
  /guaranteed return/i,
  /target price/i,
  /missing\s*\?\?\s*0/i,
  /convert[^\n]{0,30}missing[^\n]{0,30}zero/i
]) {
  if (prohibited.test(engine)) errors.push(`Decision Engine contains prohibited pattern: ${prohibited}`);
}

if (/fetch\s*\(\s*["'`]https?:\/\//i.test(engine)) {
  errors.push("Decision Engine must not call an external network endpoint.");
}
if (!engine.includes("Source registry") || !engine.includes("Snapshot") || !engine.includes("Assessment")) {
  errors.push("Decision Engine traceability is incomplete.");
}
if (!engine.includes("data-decision-why-index")) errors.push("Decision Engine does not integrate with WHY.");
if (!engine.includes("data-decision-compare-left")) errors.push("Decision Engine does not integrate with Compare.");
if (!engine.includes("data-decision-ask")) errors.push("Decision Engine does not integrate with Copilot.");
if (!engine.includes('const queue = gateState === "CURRENT"')) {
  errors.push("Decision queue is not structurally gated to CURRENT.");
}
if (!engine.includes('const guidanceAvailable = model.gateState === "CURRENT"')) {
  errors.push("Decision actions/rendering are not structurally gated to CURRENT.");
}
if (!engine.includes("No priority, recommendation or action is issued from the structural baseline.")) {
  errors.push("Fail-closed Decision rendering does not explicitly suppress priority and actions.");
}

await validateGateMatrix();

if (errors.length) {
  console.error(`KIDULTS Decision Engine validation: FAIL (${errors.length} error(s), ${warnings.length} warning(s))`);
  for (const error of errors) console.error(`ERROR: ${error}`);
  for (const warning of warnings) console.warn(`WARN: ${warning}`);
  process.exit(1);
}

console.log("KIDULTS Decision Engine validation: PASS (dedicated route, 7-state empirical gate, queue/actions only when CURRENT)");
for (const warning of warnings) console.warn(`WARN: ${warning}`);
