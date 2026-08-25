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
  portalCss: "apps/kidults-enterprise-staging/public/portal/portal.css",
  renderers: "apps/kidults-enterprise-staging/public/portal/components/renderers.js",
  detail: "apps/kidults-enterprise-staging/public/portal/detail.js",
  runtime: "apps/kidults-enterprise-staging/public/portal/components/integrity-hardening.js",
  css: "apps/kidults-enterprise-staging/public/portal/components/integrity-hardening.css",
  workspace: "apps/kidults-enterprise-staging/public/portal/components/workspace.js",
  summary: "apps/kidults-enterprise-staging/public/portal/data/portal-summary.json",
  signals: "apps/kidults-enterprise-staging/public/portal/data/market-signals.json",
  runtimeProjection: "apps/kidults-enterprise-staging/public/portal/data/runtime-health-projection.json",
  provenance: "apps/kidults-enterprise-staging/public/portal/data/provenance.json",
  research: "apps/kidults-enterprise-staging/public/portal/data/research.json",
  manifest: "apps/kidults-enterprise-staging/public/portal/data/v502-manifest.json"
};

const html = readText(paths.html);
const portal = readText(paths.portal);
const portalCss = readText(paths.portalCss);
const renderers = readText(paths.renderers);
const detail = readText(paths.detail);
const runtime = readText(paths.runtime);
const css = readText(paths.css);
const workspace = readText(paths.workspace);
const summaryText = readText(paths.summary);
const signalsText = readText(paths.signals);
const summary = readJson(paths.summary);
const signals = readJson(paths.signals);
const runtimeProjection = readJson(paths.runtimeProjection);
const provenance = readJson(paths.provenance);
const research = readJson(paths.research);
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
if (!portalCss.includes(".signal-card--withheld{grid-column:1/-1;min-height:0;grid-template-rows:auto auto auto}")) {
  errors.push("Fail-closed market status card must span the signal grid without stale chart spacing.");
}

for (const marker of [
  "EVIDENCE-GATED SIGNAL STATUS",
  "data-data-funnel",
  "These are related scale and publication layers",
  "V6 RELEASE CANDIDATE",
  "Observe. Explain. Decide—with evidence.",
  "GLOBAL COLLECTIBLES INTELLIGENCE STANDARD · V6 RC",
  "DATA CONTRACT 5.0.2-RC.1",
  "portal.js?v=662"
]) {
  if (!html.includes(marker)) errors.push(`Public V6 marker missing: ${marker}`);
}

for (const prohibited of [
  "LIVE MARKET SIGNALS",
  "CURRENT MARKET SIGNAL SNAPSHOT",
  "The eight verticals are stable",
  "Explore 8 Verticals",
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
  'signalData.publication_eligible === true',
  'signalData.freshness_state === "CURRENT"',
  "Current market signals are withheld.",
  "No freshness-qualified, evidence-bound signal snapshot is currently registered.",
  "Signal value",
  "Publication state"
]) {
  if (!renderers.includes(marker)) errors.push(`Fail-closed market renderer marker missing: ${marker}`);
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

if (signals) {
  if (signals.status !== "WITHHELD_STALE") errors.push("Stale market signal source must declare WITHHELD_STALE.");
  if (signals.publication_eligible !== false) errors.push("Stale market signal source must not be publication eligible.");
  if (signals.freshness_state !== "STALE_REJECTED") errors.push("Stale market signal source must declare STALE_REJECTED freshness.");
  if (signals.updated_at !== null) errors.push("Stale market signal source must not expose a current updated_at timestamp.");
  if (!Array.isArray(signals.signals) || signals.signals.length !== 0) errors.push("Stale market signal values and confidence must be withheld.");
}
if (/\b\d+\s+min(?:ute)?s?\s+ago\b/i.test(signalsText)) {
  errors.push("Static relative market-signal freshness remains in public data.");
}
if (/"confidence"\s*:\s*\d+/i.test(signalsText)) {
  errors.push("Stale numeric market-signal confidence remains in public data.");
}

for (const marker of ["confidenceLabel", 'return "NOT AVAILABLE"']) {
  if (!detail.includes(marker)) errors.push(`Detail confidence fail-close marker missing: ${marker}`);
}
for (const prohibited of ["`${object.confidence}% CONFIDENCE`", "${esc(object.confidence)}%"] ) {
  if (detail.includes(prohibited)) errors.push(`Detail route can render an unsupported null percentage: ${prohibited}`);
}

if (runtimeProjection) {
  if (runtimeProjection.status !== "NOT_VERIFIED") errors.push("Runtime projection must fail closed as NOT_VERIFIED.");
  if (runtimeProjection.observation_freshness !== "STALE_REJECTED") errors.push("Runtime projection must reject the stale observation.");
  if (runtimeProjection.production_state !== "HOLD" || runtimeProjection.production_deployment !== "NONE") {
    errors.push("Runtime projection must preserve Production HOLD / NONE.");
  }
  const allowedRuntimeKeys = [
    "details",
    "observation_freshness",
    "production_deployment",
    "production_state",
    "projection_id",
    "publication_eligible",
    "status",
    "version"
  ].sort();
  if (JSON.stringify(Object.keys(runtimeProjection).sort()) !== JSON.stringify(allowedRuntimeKeys)) {
    errors.push("Runtime public status projection contains fields outside the minimal allowlist.");
  }
  if (runtimeProjection.publication_eligible !== false || runtimeProjection.details !== "WITHHELD_UNVERIFIED_RUNTIME_STATUS") {
    errors.push("Runtime public status projection must remain withheld and non-publishable.");
  }
}

if (provenance?.hero?.title !== "Racing Roadster") {
  errors.push("Hero provenance must identify the rendered Racing Roadster.");
}
if (/Mobility Sculpture 01/i.test(JSON.stringify(provenance))) {
  errors.push("Retired Mobility Sculpture provenance remains public.");
}

const researchText = JSON.stringify(research ?? {});
for (const prohibited of [/stable coverage structure/i, /architecture is fixed at eight/i, /demand remains concentrated/i]) {
  if (prohibited.test(researchText)) errors.push(`Research presents a versioned taxonomy as permanent: ${prohibited}`);
}
if (!/not a permanent provider quota/i.test([html, researchText].join("\n"))) {
  errors.push("Provider-facing vertical language must state that the current taxonomy is not a permanent quota.");
}
if (!/No freshness-qualified market pulse is currently registered/i.test(researchText)) {
  errors.push("Research must fail closed when no current market pulse is registered.");
}

if (errors.length) {
  console.error(`KIDULTS V6 integrity hardening validation: FAIL (${errors.length} error(s), ${warnings.length} warning(s))`);
  for (const error of errors) console.error(`ERROR: ${error}`);
  for (const warning of warnings) console.warn(`WARN: ${warning}`);
  process.exit(1);
}

console.log(`KIDULTS V6 integrity hardening validation: PASS (${whySlots} governed WHY slots, truth labels aligned)`);
for (const warning of warnings) console.warn(`WARN: ${warning}`);
