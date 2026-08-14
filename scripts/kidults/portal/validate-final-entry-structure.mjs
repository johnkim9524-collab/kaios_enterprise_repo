import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const errors = [];
const read = relative => {
  const absolute = path.join(root, relative);
  if (!fs.existsSync(absolute)) {
    errors.push(`Missing required file: ${relative}`);
    return "";
  }
  return fs.readFileSync(absolute, "utf8");
};

const portalRoot = "apps/kidults-enterprise-staging/public/portal";
const index = read(`${portalRoot}/index.html`);
const portal = read(`${portalRoot}/portal.js`);
const homepage = read(`${portalRoot}/components/homepage-structure.js`);
const finalCss = read(`${portalRoot}/components/v662-stability-freeze.css`);
const workspaceHtml = read(`${portalRoot}/workspace.html`);
const workspacePage = read(`${portalRoot}/workspace-page.js`);
const workspaceCss = read(`${portalRoot}/workspace-page.css`);

for (const marker of [
  'src="portal.js?v=662"',
  'data-homepage-structure="v662"',
  'href="components/v662-stability-freeze.css?v=662"',
  'src="assets/hero/racing-roadster-v662.webp?v=662"',
  'data-hero-asset="racing-roadster-v662"',
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
  "startHomepageStructure",
  'workspaceRoute: "workspace.html"',
  "workspaceMounted: false",
  'homepageStructure: "v662"',
  "workspace: data.workspace.version"
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
  'data-hero-asset="racing-roadster-v662"',
  'data-image-format="museum-editorial-v662"',
  'object-fit:contain!important',
  'aspect-ratio:4/3',
  'transform:scale(1.04)!important',
  'transform:scale(1.09)!important',
  '.workspace-entry-compact',
  'border-width:.75px',
  'line-height:.965',
  '@media(max-width:340px)'
]) {
  if (!finalCss.includes(marker)) errors.push(`V662 visual marker missing: ${marker}`);
}

for (const marker of [
  '.workspace-page-status-section',
  '.workspace-page-status',
  '.workspace-page-mount',
  '@media(max-width:768px)'
]) {
  if (!workspaceCss.includes(marker)) errors.push(`Workspace page CSS marker missing: ${marker}`);
}

const canonical = path.join(root, `${portalRoot}/assets/hero/racing-roadster-v662.webp`);
if (!fs.existsSync(canonical)) errors.push("Canonical V662 Roadster asset is missing.");
for (const retired of [
  "racing-roadster-v654.webp",
  "racing-roadster-v658-desktop.webp",
  "racing-roadster-v660-master.webp",
  "racing-roadster-v658-mobile.webp"
]) {
  if (fs.existsSync(path.join(root, `${portalRoot}/assets/hero/${retired}`))) errors.push(`Retired Roadster asset still exists: ${retired}`);
}

if (errors.length) {
  console.error(`KIDULTS V662 final entry structure validation: FAIL (${errors.length} error(s))`);
  errors.forEach(error => console.error(`ERROR: ${error}`));
  process.exit(1);
}

console.log("KIDULTS V662 final entry structure validation: PASS (homepage first, dedicated Workspace, one canonical Roadster, responsive freeze)");
