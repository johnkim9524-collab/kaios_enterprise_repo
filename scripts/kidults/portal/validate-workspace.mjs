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
  workspace: "apps/kidults-enterprise-staging/public/portal/components/workspace.js",
  css: "apps/kidults-enterprise-staging/public/portal/components/workspace.css",
  contract: "apps/kidults-enterprise-staging/public/portal/data/workspace-contract.json",
  portal: "apps/kidults-enterprise-staging/public/portal/portal.js",
  workspaceHtml: "apps/kidults-enterprise-staging/public/portal/workspace.html",
  workspacePage: "apps/kidults-enterprise-staging/public/portal/workspace-page.js",
  workspacePageCss: "apps/kidults-enterprise-staging/public/portal/workspace-page.css",
  workspaceRoute: "apps/kidults-enterprise-staging/public/portal/components/workspace-route.js",
  interactions: "apps/kidults-enterprise-staging/public/portal/components/interactions.js",
  store: "apps/kidults-enterprise-staging/public/portal/components/data-store.js",
  copilot: "apps/kidults-enterprise-staging/public/portal/components/copilot.js",
  compare: "apps/kidults-enterprise-staging/public/portal/components/compare-engine.js",
  compareContract: "apps/kidults-enterprise-staging/public/portal/data/compare-engine-contract.json",
  verticals: "apps/kidults-enterprise-staging/public/portal/data/verticals.json",
  registry: "apps/kidults-enterprise-staging/public/portal/data/registry-view.json",
  decision: "apps/kidults-enterprise-staging/public/portal/components/decision-engine.js"
};

const workspace = readText(paths.workspace);
const css = readText(paths.css);
const portal = readText(paths.portal);
const workspaceHtml = readText(paths.workspaceHtml);
const workspacePage = readText(paths.workspacePage);
const workspacePageCss = readText(paths.workspacePageCss);
const workspaceRoute = readText(paths.workspaceRoute);
const interactions = readText(paths.interactions);
const store = readText(paths.store);
const copilot = readText(paths.copilot);
const compare = readText(paths.compare);
const decision = readText(paths.decision);
const contract = readJson(paths.contract);
const compareContract = readJson(paths.compareContract);
const verticalData = readJson(paths.verticals);
const registry = readJson(paths.registry);

async function validateWorkspaceRouting() {
  if (!workspaceRoute) return;

  let resolveWorkspaceMode;
  try {
    ({ resolveWorkspaceMode } = await import(pathToFileURL(absolute(paths.workspaceRoute)).href));
  } catch (error) {
    errors.push(`Workspace route behavioral import failed: ${error.message}`);
    return;
  }

  if (typeof resolveWorkspaceMode !== "function") {
    errors.push("Workspace route must export resolveWorkspaceMode for behavioral deep-link validation.");
    return;
  }

  const cases = [
    ["https://enterprise.example/workspace#ask", "decision", "ask"],
    ["https://enterprise.example/workspace#compare", "ask", "compare"],
    ["https://enterprise.example/workspace#decision", "ask", "decision"],
    ["https://enterprise.example/workspace?tool=decision#compare", "ask", "compare"],
    ["https://enterprise.example/workspace?tool=decision", "ask", "decision"],
    ["https://enterprise.example/workspace#ask-kidults", "decision", "ask"],
    ["https://enterprise.example/workspace#compare-intelligence", "ask", "compare"],
    ["https://enterprise.example/workspace#decision-support", "ask", "decision"],
    ["https://enterprise.example/workspace?mode=compare#ask-kidults", "ask", "ask"],
    ["https://enterprise.example/workspace?mode=decide", "ask", "decision"],
    ["https://enterprise.example/workspace#unknown", "compare", "compare"],
    ["https://enterprise.example/workspace?mode=unknown#unknown", "invalid", "ask"]
  ];

  for (const [href, activeMode, expected] of cases) {
    const actual = resolveWorkspaceMode({ href, activeMode });
    if (actual !== expected) {
      errors.push(`Workspace route ${href} expected ${expected}, received ${actual}.`);
    }
  }
}

async function validateInitialWorkspaceActivation() {
  if (!workspace || !contract) return;

  let activateInitialWorkspacePanel;
  try {
    ({ activateInitialWorkspacePanel } = await import(pathToFileURL(absolute(paths.workspace)).href));
  } catch (error) {
    errors.push(`Workspace initial activation behavioral import failed: ${error.message}`);
    return;
  }

  if (typeof activateInitialWorkspacePanel !== "function") {
    errors.push("Workspace must export activateInitialWorkspacePanel for initial tab integration validation.");
    return;
  }

  const createNode = dataset => ({
    dataset: { ...dataset },
    attributes: new Map(),
    hidden: false,
    tabIndex: -1,
    setAttribute(name, value) {
      this.attributes.set(name, String(value));
    },
    focus() {}
  });
  const createRoot = () => {
    const tabs = contract.panels.map(panel => createNode({ workspaceTab: panel.id }));
    const panels = contract.panels.map(panel => createNode({ workspacePanel: panel.id }));
    return {
      dataset: {},
      tabs,
      panels,
      querySelectorAll(selector) {
        if (selector === "[data-workspace-tab]") return tabs;
        if (selector === "[data-workspace-panel]") return panels;
        return [];
      }
    };
  };

  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  const previousCustomEvent = globalThis.CustomEvent;
  globalThis.document = { documentElement: { dataset: {} } };
  globalThis.window = { dispatchEvent() {} };
  globalThis.CustomEvent = class {
    constructor(type, init) {
      this.type = type;
      this.detail = init?.detail;
    }
  };

  try {
    const cases = [
      ["https://enterprise.example/workspace#ask", "ask"],
      ["https://enterprise.example/workspace#compare", "compare"],
      ["https://enterprise.example/workspace#decision", "decision"],
      ["https://enterprise.example/workspace?tool=decision#compare", "compare"]
    ];
    for (const [href, expected] of cases) {
      const root = createRoot();
      const actual = activateInitialWorkspacePanel({ root, contract, href });
      const selectedTabs = root.tabs.filter(tab => tab.attributes.get("aria-selected") === "true");
      const visiblePanels = root.panels.filter(panel => panel.hidden === false);
      if (actual !== expected || root.dataset.activePanel !== expected) {
        errors.push(`Workspace initial activation ${href} expected ${expected}, received ${actual}.`);
      }
      if (selectedTabs.length !== 1 || selectedTabs[0].dataset.workspaceTab !== expected) {
        errors.push(`Workspace initial activation ${href} did not select the ${expected} tab.`);
      }
      if (visiblePanels.length !== 1 || visiblePanels[0].dataset.workspacePanel !== expected) {
        errors.push(`Workspace initial activation ${href} did not expose only the ${expected} panel.`);
      }
    }
  } finally {
    globalThis.document = previousDocument;
    globalThis.window = previousWindow;
    globalThis.CustomEvent = previousCustomEvent;
  }
}

async function validateCompareSnapshotInvariant() {
  if (!compare || !compareContract || !verticalData || !registry) return;

  let buildComparisonModel;
  try {
    ({ buildComparisonModel } = await import(pathToFileURL(absolute(paths.compare)).href));
  } catch (error) {
    errors.push(`Compare Engine behavioral import failed: ${error.message}`);
    return;
  }

  if (typeof buildComparisonModel !== "function") {
    errors.push("Compare Engine must export buildComparisonModel for snapshot-invariant validation.");
    return;
  }

  const [left, right] = verticalData.verticals ?? [];
  if (!left || !right) {
    errors.push("Compare snapshot-invariant fixture requires two verticals.");
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
        candidate_id: candidate
      },
      evidence: { ...(registry.evidence ?? {}), current_package_id: evidence },
      assessment: { ...(registry.assessment ?? {}), current_id: assessment },
      release: { ...(registry.release ?? {}), status: production }
    }
  });

  const current = buildComparisonModel(fixture(), left, right, compareContract);
  if (current.gateState !== "CURRENT" || current.guidanceAvailable !== true) {
    errors.push("Compare Engine must allow registered metrics only when source and Registry snapshots match and all gates are CURRENT.");
  }
  if (current.rows.some(row => row.leftValue === "NOT AVAILABLE" && row.rightValue === "NOT AVAILABLE")) {
    errors.push("Compare Engine CURRENT fixture unexpectedly suppressed registered metrics.");
  }

  const failClosedCases = [
    ["NOT_AVAILABLE", fixture({ connected: false })],
    ["SOURCE_MISMATCH", fixture({ sourceMatch: false })],
    ["WAITING_FOR_CANDIDATE", fixture({ candidate: null, evidence: null, assessment: null, production: "HOLD" })],
    ["WAITING_FOR_EVIDENCE", fixture({ evidence: null, assessment: null, production: "HOLD" })],
    ["WAITING_FOR_ASSESSMENT", fixture({ assessment: null, production: "HOLD" })],
    ["PREVIEW_ONLY", fixture({ production: "HOLD" })]
  ];
  for (const [expectedState, data] of failClosedCases) {
    const model = buildComparisonModel(data, left, right, compareContract);
    if (model.gateState !== expectedState || model.guidanceAvailable !== false) {
      errors.push(`Compare Engine gate ${expectedState} must fail closed; received ${model.gateState}.`);
    }
    if (model.rows.some(row => row.leftValue !== "NOT AVAILABLE" || row.rightValue !== "NOT AVAILABLE" || row.delta !== null)) {
      errors.push(`Compare Engine exposed empirical metrics while gate ${expectedState} was not CURRENT.`);
    }
  }
}

for (const marker of [
  'import { resolveWorkspaceMode } from "./workspace-route.js";',
  "startWorkspace",
  "createRoot",
  "activate",
  "activateInitialWorkspacePanel",
  "setupKeyboard",
  "panelFromHash",
  "updateHash",
  "kidults:workspace",
  "kidults:compare",
  "kidults:workspace-change",
  "KIDULTS_WORKSPACE"
]) {
  if (!workspace.includes(marker)) errors.push(`Workspace missing marker: ${marker}`);
}

for (const marker of [
  'role="tablist"',
  'role="tab"',
  'role", "tabpanel"',
  "aria-selected",
  "aria-controls",
  "aria-labelledby",
  "ArrowRight",
  "ArrowLeft",
  "Home",
  "End"
]) {
  if (!workspace.includes(marker)) errors.push(`Workspace accessibility marker missing: ${marker}`);
}

for (const marker of [
  ".living-workspace",
  ".living-workspace__header",
  ".living-workspace__tabs",
  ".living-workspace__panel",
  "@media(max-width:480px)",
  "@media(prefers-reduced-motion:reduce)"
]) {
  if (!css.includes(marker)) errors.push(`Workspace CSS missing marker: ${marker}`);
}

for (const marker of [
  'data-page="workspace"',
  'workspace-page.js?v=662',
  'workspace-page.css?v=662',
  'data-workspace-context',
  'data-workspace-mount',
  'class="sr-only">KIDULTS Intelligence Workspace'
]) {
  if (!workspaceHtml.includes(marker)) errors.push(`Dedicated Workspace page missing marker: ${marker}`);
}
if (workspaceHtml.includes("workspace-page-intro")) errors.push("Dedicated Workspace still contains the duplicate introduction section.");
if (!workspacePageCss.includes(".workspace-page-status-section")) errors.push("Workspace route does not style the compact status section.");

for (const marker of [
  'import { loadWorkspaceData } from "./components/data-store.js";',
  'import { startWorkspace } from "./components/workspace.js";',
  'startCopilot({ data, contract: data.copilot })',
  'startCompareEngine({ data, contract: data.compare })',
  'startDecisionEngine({ data, contract: data.decision })',
  'startWorkspace({ data, contract: data.workspace })',
  'const mode = window.KIDULTS_WORKSPACE.state()',
  'mount.append(root)'
]) {
  if (!workspacePage.includes(marker)) errors.push(`Dedicated Workspace runtime missing marker: ${marker}`);
}
if (!workspacePage.includes("const data = await loadWorkspaceData()")) {
  errors.push("Dedicated Workspace must use the minimal Workspace data loader.");
}
if (workspacePage.includes("loadPortalData")) {
  errors.push("Dedicated Workspace must not fetch the full public Portal payload bundle.");
}
if (!workspace.includes("activateInitialWorkspacePanel({")) {
  errors.push("Workspace runtime must activate the requested route before exposing its public API.");
}

for (const marker of [
  'event.key === "Escape"',
  "close({ restoreFocus: true })",
  'event.key !== "Tab"',
  "event.shiftKey && document.activeElement === first",
  "!event.shiftKey && document.activeElement === last",
  'button.setAttribute("aria-expanded", "true")',
  'button.setAttribute("aria-expanded", "false")'
]) {
  if (!interactions.includes(marker)) errors.push(`Workspace menu accessibility marker missing: ${marker}`);
}

for (const href of [
  "https://kidults.com/",
  "https://kidults.com/#main",
  "https://kidults.com/#universe",
  "https://kidults.com/#intelligence",
  "https://kidults.com/#partners",
  "https://kidults.com/#trust"
]) {
  if (!workspaceHtml.includes(`href="${href}"`)) {
    errors.push(`Workspace public navigation must use the canonical portal URL: ${href}`);
  }
}
if (/href=["'](?:\.\/)?index\.html(?:#|["'])/i.test(workspaceHtml)) {
  errors.push("Workspace public navigation must not use local index.html links that rewrite back to Workspace.");
}

for (const prohibited of [
  'import { startWorkspace } from "./components/workspace.js";',
  "startWorkspace({",
  "startCopilot({",
  "startCompareEngine({",
  "startDecisionEngine({"
]) {
  if (portal.includes(prohibited)) errors.push(`Homepage must not mount Workspace runtime: ${prohibited}`);
}
for (const marker of [
  'workspaceRoute: "workspace.html"',
  "workspaceMounted: false",
  "workspace: data.workspace.version"
]) {
  if (!portal.includes(marker)) errors.push(`Homepage does not publish the dedicated Workspace contract: ${marker}`);
}

if (!store.includes('workspace: "data/workspace-contract.json?v=650"')) {
  errors.push("data-store.js does not register the Workspace contract.");
}
if (!store.includes("export async function loadWorkspaceData()")) {
  errors.push("data-store.js does not expose the minimal Workspace loader.");
}
for (const marker of [
  "getJson(LOCAL.manifest)",
  "getJson(LOCAL.registry)",
  "getJson(LOCAL.why)",
  "getJson(LOCAL.copilot)",
  "getJson(LOCAL.compare)",
  "getJson(LOCAL.decision)",
  "getJson(LOCAL.workspace)",
  "getJson(LOCAL.verticals)",
  "getJson(LOCAL.summary)",
  "getJson(LOCAL.k100)",
  "getJson(LOCAL.research)"
]) {
  if (!store.includes(marker)) errors.push(`Minimal Workspace loader missing source: ${marker}`);
}
if (!store.includes("getJson(LOCAL.workspace)")) errors.push("data-store.js does not load the Workspace contract.");
if (!store.includes("workspace,")) errors.push("data-store.js does not return the Workspace contract.");

for (const [name, content, rootId] of [
  ["Copilot", copilot, "kidults-copilot"],
  ["Compare", compare, "kidults-compare-engine"],
  ["Decision", decision, "kidults-decision-engine"]
]) {
  if (!content.includes(rootId)) errors.push(`${name} source root is unavailable: ${rootId}`);
}

if (contract) {
  if (contract.workspace_id !== "kidults-living-intelligence-workspace") errors.push("Unexpected Workspace ID.");
  if (contract.default_panel !== "ask") errors.push("Workspace default panel must be ask.");

  const panels = contract.panels ?? [];
  if (panels.length !== 3) errors.push(`Workspace must contain exactly 3 panels, found ${panels.length}.`);
  const ids = panels.map(panel => panel.id);
  if (ids.join(",") !== "ask,compare,decision") errors.push(`Workspace panel order must be ask,compare,decision; found ${ids.join(",")}.`);
  if (new Set(panels.map(panel => panel.source_id)).size !== panels.length) errors.push("Workspace source IDs must be unique.");
  if (new Set(panels.map(panel => panel.hash)).size !== panels.length) errors.push("Workspace deep-link hashes must be unique.");

  const rules = contract.truth_rules ?? {};
  if (rules.allow_data_mutation !== false) errors.push("Workspace data mutation must be prohibited.");
  if (rules.allow_registry_mutation !== false) errors.push("Workspace Registry mutation must be prohibited.");
  if (rules.preserve_engine_contracts !== true) errors.push("Workspace must preserve engine contracts.");
  if (rules.preserve_fail_closed_states !== true) errors.push("Workspace must preserve fail-closed states.");
  if (rules.require_keyboard_navigation !== true) errors.push("Workspace keyboard navigation must be required.");
  if (rules.require_deep_links !== true) errors.push("Workspace deep links must be required.");
}

for (const statement of [
  "One governed workspace",
  "allow_data_mutation: false",
  "allow_registry_mutation: false"
]) {
  if (!workspace.includes(statement) && !JSON.stringify(contract).includes(statement)) errors.push(`Workspace truth statement missing: ${statement}`);
}

for (const prohibited of [
  /api\.openai\.com/i,
  /api\.anthropic\.com/i,
  /generativelanguage\.googleapis\.com/i,
  /fetch\s*\(\s*["'`]https?:\/\//i,
  /registry\.(set|update|write|delete)\s*\(/i,
  /data\.(set|update|write|delete)\s*\(/i
]) {
  if (prohibited.test(workspace)) errors.push(`Workspace contains prohibited pattern: ${prohibited}`);
}

if (!workspace.includes("data-decision-ask")) errors.push("Workspace does not activate Ask before Decision-to-Copilot actions.");
if (!workspace.includes("data-decision-compare-left")) errors.push("Workspace does not activate Compare before Decision comparison actions.");
if (!workspaceRoute.includes("url.hash")) errors.push("Workspace route does not read deep links.");
if (!workspace.includes("history.replaceState")) errors.push("Workspace does not write deep links.");

await validateWorkspaceRouting();
await validateInitialWorkspaceActivation();
await validateCompareSnapshotInvariant();

if (errors.length) {
  console.error(`KIDULTS Workspace validation: FAIL (${errors.length} error(s), ${warnings.length} warning(s))`);
  for (const error of errors) console.error(`ERROR: ${error}`);
  for (const warning of warnings) console.warn(`WARN: ${warning}`);
  process.exit(1);
}

console.log("KIDULTS Workspace validation: PASS (initial tab activation, deep-link routing, menu focus controls, 3 panels, compare snapshot invariant)");
for (const warning of warnings) console.warn(`WARN: ${warning}`);
