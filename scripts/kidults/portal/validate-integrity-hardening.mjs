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
  html: "apps/kidults-enterprise-staging/public/portal/index.html",
  portal: "apps/kidults-enterprise-staging/public/portal/portal.js",
  renderers: "apps/kidults-enterprise-staging/public/portal/components/renderers.js",
  runtime: "apps/kidults-enterprise-staging/public/portal/components/integrity-hardening.js",
  css: "apps/kidults-enterprise-staging/public/portal/components/integrity-hardening.css",
  workspace: "apps/kidults-enterprise-staging/public/portal/components/workspace.js",
  summary: "apps/kidults-enterprise-staging/public/portal/data/portal-summary.json",
  signals: "apps/kidults-enterprise-staging/public/portal/data/market-signals.json",
  manifest: "apps/kidults-enterprise-staging/public/portal/data/v502-manifest.json"
};

const html = readText(paths.html);
const portal = readText(paths.portal);
const renderers = readText(paths.renderers);
const runtime = readText(paths.runtime);
const css = readText(paths.css);
const workspace = readText(paths.workspace);
const summaryText = readText(paths.summary);
const signalsText = readText(paths.signals);
const summary = readJson(paths.summary);
const manifest = readJson(paths.manifest);

for (const marker of [
  'import { startIntegrityHardening } from "./components/integrity-hardening.js";',
  "startIntegrityHardening({ data })",
  "renderEvidence(data.summary, data.k100)",
  "integrity: window.KIDULTS_INTEGRITY"
]) {
  if (!portal.includes(marker)) errors.push(`Portal integrity integration missing: ${marker}`);
}

for (const marker of [
  "normalizeWhyTriggers",
  'trigger.textContent = "WHY"',
  "slot.append(trigger)",
  "hardenCopilotStatus",
  "Registry-grounded",
  "Evidence-traceable",
  "Fail-closed",
  "KIDULTS_INTEGRITY"
]) {
  if (!runtime.includes(marker)) errors.push(`Integrity runtime missing marker: ${marker}`);
}

const whySlots = (renderers.match(/data-why-slot/g) ?? []).length;
if (whySlots < 5) errors.push(`Expected governed WHY slots for five target families; found ${whySlots}.`);

for (const marker of [
  ".why-slot .why-trigger",
  "position:static!important",
  ".snapshot-card-header",
  ".operation-footer",
  ".vertical-card-actions",
  ".k100-card-actions",
  ".signal-card-tools",
  ".data-funnel",
  ".data-funnel__layer",
  ".registry-ribbon",
  "display:none",
  "@media(max-width:1020px)",
  "@media(max-width:760px)",
  "@media(max-width:420px)"
]) {
  if (!css.includes(marker)) errors.push(`Integrity CSS missing marker: ${marker}`);
}

for (const marker of [
  "CURRENT MARKET SIGNAL SNAPSHOT",
  "data-data-funnel",
  "These are related scale and publication layers",
  "V6 RELEASE CANDIDATE",
  "Observe. Explain. Decide—with evidence.",
  "GLOBAL COLLECTIBLES INTELLIGENCE STANDARD · V6 RC",
  "DATA CONTRACT 5.0.2-RC.1",
  "portal.js?v=657"
]) {
  if (!html.includes(marker)) errors.push(`Public V6 marker missing: ${marker}`);
}

for (const prohibited of [
  "LIVE MARKET SIGNALS",
  "Complete the portal. Freeze the baseline. Then validate.",
  "V502 RELEASE CANDIDATE",
  "GLOBAL COLLECTIBLES INTELLIGENCE STANDARD · V502 RC"
]) {
  if (html.includes(prohibited)) errors.push(`Retired public wording remains in HTML: ${prohibited}`);
}

for (const prohibited of [
  "Live evidence objects",
  "Updated hourly"
]) {
  if (summaryText.includes(prohibited)) errors.push(`Unsupported live wording remains in summary data: ${prohibited}`);
}

if (renderers.includes("signal.updated")) {
  errors.push("Signal renderer still exposes static relative publisher time as authoritative freshness.");
}
for (const marker of [
  "Snapshot as of",
  "Registered confidence",
  "Registered evidence objects",
  "Current editorial slice",
  "Kidult 100"
]) {
  if (!renderers.includes(marker) && !summaryText.includes(marker)) {
    errors.push(`Truth-hardened renderer marker missing: ${marker}`);
  }
}

if (workspace.includes('<dl class="living-workspace__status">')) {
  errors.push("Workspace still repeats the full Candidate/Assessment status card above Living Pulse.");
}
if (!workspace.includes("Observe. Understand. Decide.")) {
  errors.push("Workspace identity headline is missing.");
}

if (manifest) {
  if (manifest.experience_version !== "6.0-rc.1") errors.push("Manifest experience_version must be 6.0-rc.1.");
  if (manifest.experience_label !== "V6 RC") errors.push("Manifest experience_label must be V6 RC.");
  if (manifest.version !== "5.0.2-rc.1") errors.push("Data contract version must remain 5.0.2-rc.1.");
  if (manifest.production !== false) errors.push("Integrity hardening must not upgrade the release to Production.");
}

if (summary) {
  const evidence = summary.operations?.find(item => item.label === "EVIDENCE OBJECTS");
  if (evidence?.caption !== "Registered evidence objects") {
    errors.push("Evidence objects must be labeled as registered, not live.");
  }
  if (evidence?.detail !== "Current Registry projection") {
    errors.push("Evidence object detail must identify the current Registry projection.");
  }
}

for (const prohibited of [
  /STRONG\s+BUY/i,
  /BUY\s+NOW/i,
  /SELL\s+NOW/i,
  /guaranteed return/i,
  /missing\s*\?\?\s*0/i,
  /api\.openai\.com/i,
  /api\.anthropic\.com/i,
  /generativelanguage\.googleapis\.com/i
]) {
  if (prohibited.test([runtime, renderers, workspace].join("\n"))) {
    errors.push(`Integrity layer contains prohibited pattern: ${prohibited}`);
  }
}

if (!signalsText.includes('"status": "PUBLIC_PREVIEW"')) {
  warnings.push("Market signal source no longer declares PUBLIC_PREVIEW state.");
}

if (errors.length) {
  console.error(`KIDULTS V6 integrity hardening validation: FAIL (${errors.length} error(s), ${warnings.length} warning(s))`);
  for (const error of errors) console.error(`ERROR: ${error}`);
  for (const warning of warnings) console.warn(`WARN: ${warning}`);
  process.exit(1);
}

console.log(`KIDULTS V6 integrity hardening validation: PASS (${whySlots} governed WHY slots, truth labels aligned)`);
for (const warning of warnings) console.warn(`WARN: ${warning}`);
