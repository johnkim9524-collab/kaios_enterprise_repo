import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const portalRoot = "apps/kidults-enterprise-staging/public/portal";
const errors = [];
const read = relative => {
  const absolute = path.join(root, relative);
  if (!fs.existsSync(absolute)) {
    errors.push(`Missing required file: ${relative}`);
    return "";
  }
  return fs.readFileSync(absolute, "utf8");
};
const exists = relative => fs.existsSync(path.join(root, relative));

const index = read(`${portalRoot}/index.html`);
const portal = read(`${portalRoot}/portal.js`);
const homepage = read(`${portalRoot}/components/homepage-structure.js`);
const assets = read(`${portalRoot}/components/editorial-assets.js`);
const finalCss = read(`${portalRoot}/components/v662-stability-freeze.css`);
const mobileCss = read(`${portalRoot}/components/mobile-hero-visibility.css`);
const workspaceHtml = read(`${portalRoot}/workspace.html`);
const workspacePage = read(`${portalRoot}/workspace-page.js`);
const workspaceCss = read(`${portalRoot}/workspace-page.css`);

for (const marker of [
  'src="portal.js?v=665"',
  'data-homepage-structure="v662"',
  'data-visual-freeze="v665"',
  'href="components/v662-stability-freeze.css?v=662-visual95-final"',
  'href="components/v664-visible-hero-footer.css?v=665"',
  'src="assets/hero/racing-roadster-v662.webp?v=662-visual95-final"',
  'data-hero-asset="racing-roadster-v662"',
  'data-hero-surface="v665-single-surface"',
  'href="workspace.html"',
  'id="discover"',
  'id="verticals"',
  'id="k100"',
  'id="markets"',
  'id="research"',
  'id="archive"',
  'id="institution"'
]) {
  if (!index.includes(marker)) errors.push(`Homepage marker missing: ${marker}`);
}

for (const marker of [
  'mobile-hero-visibility.js?v=662-visual95-final',
  'editorial-assets.js?v=662-visual95-final',
  'homepage-structure.js?v=662-visual95-final',
  'workspaceRoute: "workspace.html"',
  'workspaceMounted: false',
  'homepageStructure: "v662"',
  'visualFreeze: "v665"',
  'workspace: data.workspace.version'
]) {
  if (!portal.includes(marker)) errors.push(`Homepage runtime marker missing: ${marker}`);
}
for (const prohibited of ["startCopilot({", "startCompareEngine({", "startDecisionEngine({", "startWorkspace({"]) {
  if (portal.includes(prohibited)) errors.push(`Homepage still mounts dedicated Workspace runtime: ${prohibited}`);
}

for (const marker of [
  'section.id = "workspace-entry"',
  'workspace-entry-compact',
  'href="workspace.html"',
  'main.dataset.finalStructure = "v662"',
  'workspaceMountedOnHome: false',
  '"Release Baseline"'
]) {
  if (!homepage.includes(marker)) errors.push(`Homepage structure marker missing: ${marker}`);
}
if (homepage.includes("workspace-entry-grid")) errors.push("Retired three-card Workspace entry remains on the homepage.");

for (const marker of [
  'data-page="workspace"',
  'src="workspace-page.js?v=662"',
  'href="workspace-page.css?v=662"',
  'data-workspace-context',
  'data-workspace-mount',
  'href="index.html"'
]) {
  if (!workspaceHtml.includes(marker)) errors.push(`Workspace page marker missing: ${marker}`);
}
if (workspaceHtml.includes("workspace-page-intro")) errors.push("Workspace page contains a duplicate visible introduction.");

for (const marker of [
  'startCopilot({ data, contract: data.copilot })',
  'startCompareEngine({ data, contract: data.compare })',
  'startDecisionEngine({ data, contract: data.decision })',
  'startWorkspace({ data, contract: data.workspace })',
  'window.KIDULTS_WORKSPACE.open(mode',
  'selectedMode()'
]) {
  if (!workspacePage.includes(marker)) errors.push(`Dedicated Workspace runtime marker missing: ${marker}`);
}

for (const marker of [
  'CACHE_REVISION = "visual95"',
  'VISUAL_SYSTEM = "single-studio-v662-visual95"',
  'footwear-v654.webp',
  'camera-v654.webp',
  'toys-v654.webp',
  'watch-v655.webp',
  'bindK100()'
]) {
  if (!assets.includes(marker)) errors.push(`Visual95 asset-binding marker missing: ${marker}`);
}

for (const marker of [
  'data-hero-asset="racing-roadster-v662"',
  'data-image-format="museum-editorial-v662"',
  'data-visual-system="single-studio-v662-visual95"',
  'object-fit:contain!important',
  'aspect-ratio:4/3',
  'transform:scale(1)!important',
  '.workspace-entry-compact',
  'border-width:.75px',
  'line-height:.965',
  '#f3f1ec',
  'filter:saturate(.94)',
  '@media(max-width:340px)'
]) {
  if (!finalCss.includes(marker)) errors.push(`V662 Visual95 marker missing: ${marker}`);
}
if (finalCss.includes('transform:scale(1.04)!important') || finalCss.includes('transform:scale(1.09)!important')) {
  errors.push("Retired per-object K100 enlargement remains; Visual95 requires one unified frame treatment.");
}

for (const marker of [
  'object-fit:contain!important',
  'object-position:center center!important',
  'background:#f3f1ec!important',
  '@media(max-width:390px)',
  '@media(max-width:360px)'
]) {
  if (!mobileCss.includes(marker)) errors.push(`Mobile Visual95 marker missing: ${marker}`);
}
if (mobileCss.includes("object-position:right center")) errors.push("Mobile Hero still uses the retired right-biased position.");

for (const marker of [
  '.workspace-page-status-section',
  '.workspace-page-status',
  '.workspace-page-mount',
  '@media(max-width:768px)'
]) {
  if (!workspaceCss.includes(marker)) errors.push(`Workspace page CSS marker missing: ${marker}`);
}

const requiredAssets = [
  `${portalRoot}/assets/hero/racing-roadster-v662.webp`,
  `${portalRoot}/assets/kidult100/footwear-v654.webp`,
  `${portalRoot}/assets/kidult100/camera-v654.webp`,
  `${portalRoot}/assets/kidult100/toys-v654.webp`,
  `${portalRoot}/assets/kidult100/watch-v655.webp`
];
for (const relative of requiredAssets) {
  if (!exists(relative)) {
    errors.push(`Required Visual95 asset is missing: ${relative}`);
    continue;
  }
  const data = fs.readFileSync(path.join(root, relative));
  if (data.subarray(0, 4).toString("ascii") !== "RIFF" || data.subarray(8, 12).toString("ascii") !== "WEBP") {
    errors.push(`Required Visual95 asset is not a valid WebP: ${relative}`);
  }
  if (data.length < 25_000) errors.push(`Required Visual95 asset is unexpectedly small: ${relative} (${data.length} bytes)`);
}

for (const retired of [
  "racing-roadster-v654.webp",
  "racing-roadster-v658-desktop.webp",
  "racing-roadster-v660-master.webp",
  "racing-roadster-v658-mobile.webp"
]) {
  if (exists(`${portalRoot}/assets/hero/${retired}`)) errors.push(`Retired Roadster asset still exists: ${retired}`);
}

if (errors.length) {
  console.error(`KIDULTS V665 final entry validation: FAIL (${errors.length} error(s))`);
  errors.forEach(error => console.error(`ERROR: ${error}`));
  process.exit(1);
}

console.log("KIDULTS V665 final entry validation: PASS (homepage first, dedicated Workspace, single-surface Hero, unified K100 studio, global public-experience freeze)");
