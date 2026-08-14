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
const finalCss = read(`${portalRoot}/components/v661-final-freeze.css`);
const workspaceHtml = read(`${portalRoot}/workspace.html`);
const workspacePage = read(`${portalRoot}/workspace-page.js`);
const workspaceCss = read(`${portalRoot}/workspace-page.css`);

for (const marker of [
  'src="portal.js?v=658"',
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
  'startHomepageStructure',
  'if (document.body.dataset.page !== "workspace") return false;',
  'workspaceRoute: "workspace.html"',
  'workspaceMounted',
  'workspace: data.workspace.version'
]) {
  if (!portal.includes(marker)) errors.push(`Homepage runtime marker missing: ${marker}`);
}

for (const marker of [
  'why.href = "workspace.html"',
  'section.id = "workspace-entry"',
  'workspace.html?mode=ask',
  'workspace.html?mode=compare',
  'workspace.html?mode=decide',
  'main.dataset.finalStructure = "v661"'
]) {
  if (!homepage.includes(marker)) errors.push(`Homepage structure marker missing: ${marker}`);
}

for (const marker of [
  'data-page="workspace"',
  'src="workspace-page.js?v=661"',
  'data-workspace-context',
  'data-workspace-mount',
  'href="index.html"'
]) {
  if (!workspaceHtml.includes(marker)) errors.push(`Workspace page marker missing: ${marker}`);
}

for (const marker of [
  'startCopilot({ data, contract: data.copilot })',
  'startCompareEngine({ data, contract: data.compare })',
  'startDecisionEngine({ data, contract: data.decision })',
  'startWorkspace({ data, contract: data.workspace })',
  'window.KIDULTS_WORKSPACE.open(mode',
  'selectedMode()'
]) {
  if (!workspacePage.includes(marker)) errors.push(`Dedicated workspace runtime marker missing: ${marker}`);
}

for (const marker of [
  'transform:translateX(-4.5%)!important',
  'transform:translate(-3.5%,-12px)!important',
  'transform:scale(1.04)!important',
  'transform:scale(1.09)!important',
  '.workspace-entry-grid',
  'border-width:.75px!important',
  'line-height:.965!important'
]) {
  if (!finalCss.includes(marker)) errors.push(`Final visual marker missing: ${marker}`);
}

for (const marker of [
  '.workspace-page-intro',
  '.workspace-page-status',
  '.workspace-page-mount',
  '@media(max-width:768px)'
]) {
  if (!workspaceCss.includes(marker)) errors.push(`Workspace page CSS marker missing: ${marker}`);
}

if (portal.includes('startCopilot({ data, contract: data.copilot });\n    startCompareEngine')) {
  errors.push("Homepage init still mounts Ask / Compare / Decide before the main portal.");
}

const retiredMobileRoadster = path.join(root, `${portalRoot}/assets/hero/racing-roadster-v658-mobile.webp`);
if (fs.existsSync(retiredMobileRoadster)) {
  errors.push("The retired second/mobile-specific Roadster asset still exists.");
}

if (errors.length) {
  console.error(`KIDULTS final entry structure validation: FAIL (${errors.length} error(s))`);
  errors.forEach(error => console.error(`ERROR: ${error}`));
  process.exit(1);
}

console.log("KIDULTS final entry structure validation: PASS (homepage-first, dedicated workspace, final responsive visual freeze)");
