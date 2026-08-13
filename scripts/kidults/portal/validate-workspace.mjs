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
  workspace: "apps/kidults-enterprise-staging/public/portal/components/workspace.js",
  css: "apps/kidults-enterprise-staging/public/portal/components/workspace.css",
  contract: "apps/kidults-enterprise-staging/public/portal/data/workspace-contract.json",
  portal: "apps/kidults-enterprise-staging/public/portal/portal.js",
  store: "apps/kidults-enterprise-staging/public/portal/components/data-store.js",
  copilot: "apps/kidults-enterprise-staging/public/portal/components/copilot.js",
  compare: "apps/kidults-enterprise-staging/public/portal/components/compare-engine.js",
  decision: "apps/kidults-enterprise-staging/public/portal/components/decision-engine.js"
};

const workspace = readText(paths.workspace);
const css = readText(paths.css);
const portal = readText(paths.portal);
const store = readText(paths.store);
const copilot = readText(paths.copilot);
const compare = readText(paths.compare);
const decision = readText(paths.decision);
const contract = readJson(paths.contract);

for (const marker of [
  "startWorkspace",
  "createRoot",
  "activate",
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
  ".living-workspace__status",
  "@media(max-width:480px)",
  "@media(prefers-reduced-motion:reduce)"
]) {
  if (!css.includes(marker)) errors.push(`Workspace CSS missing marker: ${marker}`);
}

if (!portal.includes('import { startWorkspace } from "./components/workspace.js";')) {
  errors.push("portal.js does not import startWorkspace.");
}
if (!portal.includes("startWorkspace({")) {
  errors.push("portal.js does not start the Living Intelligence Workspace.");
}
if (!portal.includes("workspace: data.workspace.version")) {
  errors.push("portal.js does not publish the Workspace version.");
}
if (!store.includes('workspace: "data/workspace-contract.json?v=650"')) {
  errors.push("data-store.js does not register the Workspace contract.");
}
if (!store.includes("getJson(LOCAL.workspace)")) {
  errors.push("data-store.js does not load the Workspace contract.");
}
if (!store.includes("workspace,")) {
  errors.push("data-store.js does not return the Workspace contract.");
}

for (const [name, content, rootId] of [
  ["Copilot", copilot, "kidults-copilot"],
  ["Compare", compare, "kidults-compare-engine"],
  ["Decision", decision, "kidults-decision-engine"]
]) {
  if (!content.includes(rootId)) errors.push(`${name} source root is unavailable: ${rootId}`);
}

if (contract) {
  if (contract.workspace_id !== "kidults-living-intelligence-workspace") {
    errors.push("Unexpected Workspace ID.");
  }
  if (contract.default_panel !== "ask") errors.push("Workspace default panel must be ask.");

  const panels = contract.panels ?? [];
  if (panels.length !== 3) errors.push(`Workspace must contain exactly 3 panels, found ${panels.length}.`);
  const ids = panels.map(panel => panel.id);
  if (ids.join(",") !== "ask,compare,decision") {
    errors.push(`Workspace panel order must be ask,compare,decision; found ${ids.join(",")}.`);
  }
  if (new Set(panels.map(panel => panel.source_id)).size !== panels.length) {
    errors.push("Workspace source IDs must be unique.");
  }
  if (new Set(panels.map(panel => panel.hash)).size !== panels.length) {
    errors.push("Workspace deep-link hashes must be unique.");
  }

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
  "changes navigation—not source truth, Registry state or engine contracts",
  "allow_data_mutation: false",
  "allow_registry_mutation: false"
]) {
  if (!workspace.includes(statement) && !JSON.stringify(contract).includes(statement)) {
    errors.push(`Workspace truth statement missing: ${statement}`);
  }
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

if (!workspace.includes("data-decision-ask")) {
  errors.push("Workspace does not activate Ask before Decision-to-Copilot actions.");
}
if (!workspace.includes("data-decision-compare-left")) {
  errors.push("Workspace does not activate Compare before Decision comparison actions.");
}
if (!workspace.includes("window.location.hash")) {
  errors.push("Workspace does not read deep links.");
}
if (!workspace.includes("history.replaceState")) {
  errors.push("Workspace does not write deep links.");
}

if (errors.length) {
  console.error(`KIDULTS Workspace validation: FAIL (${errors.length} error(s), ${warnings.length} warning(s))`);
  for (const error of errors) console.error(`ERROR: ${error}`);
  for (const warning of warnings) console.warn(`WARN: ${warning}`);
  process.exit(1);
}

console.log("KIDULTS Workspace validation: PASS (3 panels, keyboard accessible, contract-preserving)");
for (const warning of warnings) console.warn(`WARN: ${warning}`);
