import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const portal = "apps/kidults-enterprise-staging/public/portal";
const errors = [];

function read(relative) {
  const absolute = path.join(root, relative);
  if (!fs.existsSync(absolute)) {
    errors.push(`Missing: ${relative}`);
    return "";
  }
  return fs.readFileSync(absolute, "utf8");
}

const index = read(`${portal}/index.html`);
const runtime = read(`${portal}/portal.js`);
const homepage = read(`${portal}/components/homepage-structure.js`);
const editorial = read(`${portal}/components/editorial-assets.js`);
const mobile = read(`${portal}/components/mobile-hero-visibility.js`);
const css = read(`${portal}/components/v666-portal-closure.css`);
const workspaceHtml = read(`${portal}/workspace.html`);
const workspacePage = read(`${portal}/workspace-page.js`);
const workspaceCss = read(`${portal}/workspace-page.css`);

for (const marker of [
  'data-homepage-structure="v662"',
  'data-portal-version="v663"',
  'data-portal-hotfix="v666"',
  'src="portal.js?v=666"',
  'v662-stability-freeze.css?v=662-visual95-final',
  'v666-portal-closure.css?v=666',
  'racing-roadster-v666-one-surface.webp?v=666',
  'data-hero-asset="racing-roadster-v666-one-surface"',
  'data-hero-revision="v666-portal-closure"',
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
  'mobile-hero-visibility.js?v=666',
  'editorial-assets.js?v=666',
  'homepage-structure.js?v=666',
  'workspaceRoute: "workspace.html"',
  'workspaceMounted: false'
]) {
  if (!runtime.includes(marker)) errors.push(`Runtime marker missing: ${marker}`);
}

for (const prohibited of [
  "startCopilot({",
  "startCompareEngine({",
  "startDecisionEngine({",
  "startWorkspace({"
]) {
  if (runtime.includes(prohibited)) errors.push(`Homepage mounts Workspace runtime: ${prohibited}`);
}

for (const marker of [
  'section.id = "workspace-entry"',
  "workspace-entry-compact",
  'href="workspace.html"',
  "workspaceMountedOnHome: false"
]) {
  if (!homepage.includes(marker)) errors.push(`Homepage structure marker missing: ${marker}`);
}

for (const marker of [
  'data-page="workspace"',
  'src="workspace-page.js?v=662"',
  'href="workspace-page.css?v=662"',
  "data-workspace-mount",
  'href="index.html"'
]) {
  if (!workspaceHtml.includes(marker)) errors.push(`Workspace marker missing: ${marker}`);
}

for (const marker of [
  "startCopilot({ data, contract: data.copilot })",
  "startCompareEngine({ data, contract: data.compare })",
  "startDecisionEngine({ data, contract: data.decision })",
  "startWorkspace({ data, contract: data.workspace })"
]) {
  if (!workspacePage.includes(marker)) errors.push(`Workspace runtime missing: ${marker}`);
}

for (const marker of [
  "footwear-v654.webp",
  "camera-v654.webp",
  "toys-v654.webp",
  "watch-v655.webp",
  "racing-roadster-v666-one-surface",
  "bindK100()"
]) {
  if (!editorial.includes(marker)) errors.push(`Asset binding marker missing: ${marker}`);
}

for (const marker of [
  'HERO_KEY = "racing-roadster-v666-one-surface"',
  'ASSET_VERSION = "666"',
  'fill="#f4f2ee"'
]) {
  if (!mobile.includes(marker)) errors.push(`Mobile Hero marker missing: ${marker}`);
}

for (const marker of [
  "--v666-surface:#f4f2ee",
  "filter:none!important",
  "border-top:0!important",
  ".market-signals-section{padding-top:58px!important",
  ".research-feature{min-height:520px!important",
  ".archive-row{min-height:144px!important"
]) {
  if (!css.includes(marker)) errors.push(`V666 CSS marker missing: ${marker}`);
}

for (const marker of [
  ".workspace-page-status-section",
  ".workspace-page-status",
  ".workspace-page-mount",
  "@media(max-width:768px)"
]) {
  if (!workspaceCss.includes(marker)) errors.push(`Workspace CSS marker missing: ${marker}`);
}

const assets = [
  `${portal}/assets/hero/racing-roadster-v666-one-surface.webp`,
  `${portal}/assets/kidult100/footwear-v654.webp`,
  `${portal}/assets/kidult100/camera-v654.webp`,
  `${portal}/assets/kidult100/toys-v654.webp`,
  `${portal}/assets/kidult100/watch-v655.webp`
];
for (const relative of assets) {
  const absolute = path.join(root, relative);
  if (!fs.existsSync(absolute)) {
    errors.push(`Asset missing: ${relative}`);
    continue;
  }
  const bytes = fs.readFileSync(absolute);
  if (bytes.subarray(0, 4).toString("ascii") !== "RIFF" || bytes.subarray(8, 12).toString("ascii") !== "WEBP") {
    errors.push(`Asset not WebP: ${relative}`);
  }
  if (bytes.length < 25_000) errors.push(`Asset too small: ${relative} (${bytes.length})`);
}

if (errors.length) {
  console.error(`KIDULTS V666 final entry validation: FAIL (${errors.length})`);
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}

console.log("KIDULTS V666 final entry validation: PASS — V662 data foundation, V663 card structure, V666 experience closure.");
