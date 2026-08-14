import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const errors = [];

function read(relative) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) {
    errors.push(`Missing required file: ${relative}`);
    return "";
  }
  return fs.readFileSync(file, "utf8");
}

const runtimePath = "apps/kidults-enterprise-staging/public/portal/components/mobile-hero-visibility.js";
const cssPath = "apps/kidults-enterprise-staging/public/portal/components/mobile-hero-visibility.css";
const visualFreezePath = "apps/kidults-enterprise-staging/public/portal/components/v657-visual-freeze.css";
const editorialPath = "apps/kidults-enterprise-staging/public/portal/components/editorial-assets.js";
const portalPath = "apps/kidults-enterprise-staging/public/portal/portal.js";
const workflowPath = ".github/workflows/kidults-portal-v502-validate.yml";

const runtime = read(runtimePath);
const css = read(cssPath);
const visualFreeze = read(visualFreezePath);
const editorial = read(editorialPath);
const portal = read(portalPath);
const workflow = read(workflowPath);

for (const marker of [
  "startMobileHeroVisibility",
  "const RETRY_ASSET = null",
  "fallbackSvgDataUri",
  "fetchPriority = \"high\"",
  "image.hidden = false",
  "image.removeAttribute(\"hidden\")",
  "card.dataset.mobileHeroState",
  "hero_attempt",
  "preferredSource",
  "KIDULTS_MOBILE_HERO",
  "ASSET_VERSION = \"657\""
]) {
  if (!runtime.includes(marker)) errors.push(`Hero visibility runtime missing marker: ${marker}`);
}

for (const marker of [
  ".moment-image[hidden]",
  "display:block!important",
  "visibility:visible!important",
  "aspect-ratio:4/3",
  'data-hero-asset="racing-roadster-v657"',
  "object-fit:contain!important",
  "object-position:center bottom!important",
  "data-asset-state=fallback",
  "@media(max-width:360px)"
]) {
  if (!css.includes(marker)) errors.push(`Hero visibility CSS missing marker: ${marker}`);
}

for (const marker of [
  'data-hero-asset="racing-roadster-v657"',
  "transform:scale(1.065)!important",
  "@media(min-width:769px) and (max-width:1279px)",
  "object-fit:contain!important",
  "museum-editorial-v657"
]) {
  if (!visualFreeze.includes(marker)) errors.push(`V657 visual freeze CSS missing marker: ${marker}`);
}

for (const marker of [
  'from "./assets/racing-roadster-v657.js"',
  'ROADSTER_KEY = "racing-roadster-v657"',
  'STYLE_ID = "kidults-v657-visual-freeze-style"'
]) {
  if (!editorial.includes(marker)) errors.push(`Editorial asset runtime missing marker: ${marker}`);
}

if (!portal.includes('import { startMobileHeroVisibility } from "./components/mobile-hero-visibility.js?v=657";')) {
  errors.push("portal.js does not import the V657 Mobile Hero Visibility runtime.");
}
if (!portal.includes('import { startAssetBindingHotfix } from "./components/editorial-assets.js?v=657";')) {
  errors.push("portal.js does not import the V657 Editorial Asset runtime.");
}
if (!portal.includes("startMobileHeroVisibility({ manifest: data.manifest });")) {
  errors.push("portal.js does not start Mobile Hero Visibility.");
}
if (!portal.includes("mobileHeroVisibility: window.KIDULTS_MOBILE_HERO?.version")) {
  errors.push("portal.js does not publish the Mobile Hero Visibility version.");
}
if (!portal.includes('from "./components/renderers.js?v=654"')) {
  errors.push("portal.js no longer preserves the registered hero renderer contract.");
}
if (!portal.includes('import { startMobileReconstruction } from "./components/mobile-reconstruction.js";')) {
  errors.push("portal.js no longer preserves the established Mobile Reconstruction import contract.");
}
const reconstructionIndex = portal.indexOf("startMobileReconstruction();");
const assetIndex = portal.indexOf("startAssetBindingHotfix();");
const visibilityIndex = portal.indexOf("startMobileHeroVisibility({ manifest: data.manifest });");
if (!(reconstructionIndex >= 0 && assetIndex > reconstructionIndex && visibilityIndex > assetIndex)) {
  errors.push("V657 initialization order must be Mobile Reconstruction → Asset Binding → Mobile Hero Visibility.");
}

for (const prohibited of [
  /image\.hidden\s*=\s*true/i,
  /display\s*:\s*none/i,
  /visibility\s*:\s*hidden/i,
  /overflow-x\s*:\s*(hidden|clip)/i
]) {
  if (prohibited.test(runtime)) errors.push(`Hero runtime contains prohibited hiding pattern: ${prohibited}`);
  if (prohibited.test(css)) errors.push(`Hero CSS contains prohibited hiding or masking pattern: ${prohibited}`);
}

if (!workflow.includes("node --check apps/kidults-enterprise-staging/public/portal/components/mobile-hero-visibility.js")) {
  errors.push("Workflow does not syntax-check Mobile Hero Visibility.");
}
if (!workflow.includes("node scripts/kidults/portal/validate-mobile-hero-visibility.mjs")) {
  errors.push("Workflow does not run Mobile Hero Visibility validation.");
}

if (errors.length) {
  console.error(`KIDULTS Mobile Hero Visibility validation: FAIL (${errors.length} error(s))`);
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}

console.log("KIDULTS Mobile Hero Visibility validation: PASS (V657 Roadster, desktop optical scale, tablet reduction, mobile full-object framing)");
