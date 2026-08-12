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

const paths = {
  runtime: "apps/kidults-enterprise-staging/public/portal/components/mobile-reconstruction.js",
  css: "apps/kidults-enterprise-staging/public/portal/components/mobile-reconstruction.css",
  portal: "apps/kidults-enterprise-staging/public/portal/portal.js",
  detail: "apps/kidults-enterprise-staging/public/portal/detail.js",
  workflow: ".github/workflows/kidults-portal-v502-validate.yml"
};

const runtime = readText(paths.runtime);
const css = readText(paths.css);
const portal = readText(paths.portal);
const detail = readText(paths.detail);
const workflow = readText(paths.workflow);

for (const marker of [
  "startMobileReconstruction",
  "startDetailMobileReconstruction",
  "COMPACT_BAR_BOTTOM_SHEET",
  "ALL_VISIBLE",
  "METRIC_CARDS",
  "SINGLE_COLUMN",
  "FULL_SCREEN_SINGLE_SCROLL",
  "AFTER_DYNAMIC_MOUNT",
  "AUDITED_NOT_MASKED",
  "required_viewports_px: [320, 390, 768, 1024]",
  "minimum_touch_target_px: 44",
  "annotateWorkspaceHeading",
  "annotateWorkspaceTabs",
  "setupPulseSheet",
  "annotateCompareTable",
  "restoreHashTarget",
  "document.documentElement.scrollWidth",
  "document.documentElement.clientWidth",
  "KIDULTS_MOBILE"
]) {
  if (!runtime.includes(marker)) errors.push(`Mobile runtime missing marker: ${marker}`);
}

for (const marker of [
  "@media(max-width:1024px)",
  "@media(max-width:768px)",
  "@media(max-width:480px)",
  "@media(max-width:390px)",
  "@media(max-width:360px)",
  ".living-pulse__panel",
  "position:fixed",
  "max-height:88dvh",
  ".living-workspace__tabs",
  "grid-template-columns:repeat(3,minmax(0,1fr))",
  ".moment-image",
  "object-fit:contain!important",
  ".compare-engine__row",
  ".compare-engine__value::before",
  ".decision-engine__queue",
  "grid-template-columns:1fr!important",
  "dialog.search-dialog",
  "width:100vw",
  "height:100dvh",
  ".detail-hero",
  ".detail-visual",
  "min-height:44px",
  "scroll-margin-top:76px"
]) {
  if (!css.includes(marker)) errors.push(`Mobile CSS missing marker: ${marker}`);
}

if (!portal.includes('import { startMobileReconstruction } from "./components/mobile-reconstruction.js";')) {
  errors.push("portal.js does not import the Mobile Reconstruction runtime.");
}
if (!portal.includes("startMobileReconstruction();")) {
  errors.push("portal.js does not start Mobile Reconstruction.");
}
if (!portal.includes("mobileReconstruction: window.KIDULTS_MOBILE?.version")) {
  errors.push("portal.js does not publish the Mobile Reconstruction version.");
}
if (!detail.includes('import { startDetailMobileReconstruction } from "./components/mobile-reconstruction.js";')) {
  errors.push("detail.js does not import Mobile Reconstruction.");
}
if (!detail.includes("startDetailMobileReconstruction();")) {
  errors.push("detail.js does not start Mobile Reconstruction.");
}
if (!detail.includes("window.KIDULTS_MOBILE?.audit?.()")) {
  errors.push("detail.js does not audit the rendered mobile detail route.");
}

for (const prohibited of [
  /overflow-x\s*:\s*hidden/i,
  /overflow-x\s*:\s*clip/i,
  /min-width\s*:\s*760px/i,
  /flex-basis\s*:\s*84vw/i
]) {
  if (prohibited.test(css)) {
    errors.push(`Mobile CSS masks or preserves horizontal overflow: ${prohibited}`);
  }
}

for (const prohibited of [
  /api\.openai\.com/i,
  /api\.anthropic\.com/i,
  /generativelanguage\.googleapis\.com/i,
  /registry\.(set|update|write|delete)\s*\(/i,
  /data\.(set|update|write|delete)\s*\(/i
]) {
  if (prohibited.test(runtime)) errors.push(`Mobile runtime contains prohibited pattern: ${prohibited}`);
}

for (const statement of [
  "allow_data_mutation: false",
  "allow_registry_mutation: false",
  "preserve_engine_contracts: true",
  "preserve_fail_closed_states: true",
  "allow_hidden_horizontal_overflow: false"
]) {
  if (!runtime.includes(statement)) errors.push(`Mobile truth rule missing: ${statement}`);
}

if (!runtime.includes('panel === "decision"') || !runtime.includes('? "Review"')) {
  errors.push("Mobile Workspace does not expose REVIEW while Decision gates remain fail-closed.");
}
if (!runtime.includes("window.setTimeout(restore, 80)") || !runtime.includes("window.setTimeout(restore, 260)")) {
  errors.push("Dynamic hash restoration is not scheduled after component mount.");
}
if (!runtime.includes("intrinsicOverflow")) {
  errors.push("Element-level intrinsic overflow audit is missing.");
}
if (!css.includes("body.mobile-pulse-open::before")) {
  errors.push("Living Pulse bottom-sheet backdrop is missing.");
}
if (!css.includes("dialog.search-dialog[open]")) {
  errors.push("Search does not switch to a full-screen single-scroll mobile layout.");
}
if (!css.includes(".compare-engine__table-head{\n    display:none")) {
  errors.push("Desktop Compare table header remains visible in the mobile card layout.");
}
if (!css.includes(".data-funnel{\n    display:grid;\n    grid-template-columns:1fr")) {
  errors.push("Data funnel does not stack vertically on mobile.");
}

if (!workflow.includes("node --check apps/kidults-enterprise-staging/public/portal/components/mobile-reconstruction.js")) {
  warnings.push("Workflow has not yet syntax-checked Mobile Reconstruction.");
}
if (!workflow.includes("node scripts/kidults/portal/validate-mobile-reconstruction.mjs")) {
  warnings.push("Workflow has not yet registered the Mobile Reconstruction validator.");
}

if (errors.length) {
  console.error(`KIDULTS Mobile Reconstruction validation: FAIL (${errors.length} error(s), ${warnings.length} warning(s))`);
  for (const error of errors) console.error(`ERROR: ${error}`);
  for (const warning of warnings) console.warn(`WARN: ${warning}`);
  process.exit(1);
}

console.log("KIDULTS Mobile Reconstruction validation: PASS (320/390/768/1024 contract, no masked horizontal overflow)");
for (const warning of warnings) console.warn(`WARN: ${warning}`);
