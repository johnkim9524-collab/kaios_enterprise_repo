import fs from 'node:fs';

const htmlPath = 'apps/kidults-enterprise-staging/public/portal/workspace.html';
const workspaceCssPath = 'apps/kidults-enterprise-staging/public/portal/components/workspace.css';
const workspacePageCssPath = 'apps/kidults-enterprise-staging/public/portal/workspace-page.css';
const mobileJsPath = 'apps/kidults-enterprise-staging/public/portal/components/mobile-reconstruction.js';

const html = fs.readFileSync(htmlPath, 'utf8');
const workspaceCss = fs.readFileSync(workspaceCssPath, 'utf8');
const workspacePageCss = fs.readFileSync(workspacePageCssPath, 'utf8');
const mobileJs = fs.readFileSync(mobileJsPath, 'utf8');
const errors = [];

function requireTrue(condition, message) {
  if (!condition) errors.push(message);
}

requireTrue(html.includes('workspace-page.css?v=663'), 'Workspace entry must load canonical workspace-page.css v663 for cache invalidation.');
requireTrue(!html.includes('mobile-workspace-whitespace-hotfix.css'), 'Workspace entry must not depend on a separate whitespace hotfix asset.');
requireTrue(/\.living-workspace__panels\s*\{[\s\S]*?min-height:\s*520px/.test(workspaceCss), 'Desktop 520px panel floor must remain explicit.');
requireTrue(/\.workspace-page-mount\s*\{[\s\S]*?padding-bottom:\s*100px/.test(workspacePageCss), 'Desktop 100px mount padding must remain explicit.');
requireTrue(/\.workspace-page-main\s*\{[\s\S]*?min-height:\s*70vh/.test(workspacePageCss), 'Desktop Workspace main-height floor must remain explicit.');

const mobileStart = workspacePageCss.indexOf('@media(max-width:768px){');
const nextMediaStart = workspacePageCss.indexOf('@media(max-width:420px){', mobileStart + 1);
const mobileBlock = mobileStart >= 0
  ? workspacePageCss.slice(mobileStart, nextMediaStart >= 0 ? nextMediaStart : workspacePageCss.length)
  : '';
requireTrue(mobileStart >= 0, 'Canonical Workspace page CSS must define a <=768px media block.');
requireTrue(/\.workspace-page-main\s*\{[\s\S]*?min-height:\s*0/.test(mobileBlock), 'Mobile Workspace main must remove the desktop viewport-height floor in canonical CSS.');
requireTrue(/\.workspace-page-mount\s*\{[\s\S]*?padding-bottom:\s*0/.test(mobileBlock), 'Mobile Workspace mount must remove the desktop 100px bottom padding in canonical CSS.');
requireTrue(/body\[data-page="workspace"\]\s+\.living-workspace__panels\s*\{[\s\S]*?min-height:\s*0\s*!important/.test(mobileBlock), 'Mobile Workspace panels must remove the desktop 520px floor in canonical CSS.');
requireTrue(mobileJs.includes('decision_label: "REVIEW"'), 'Mobile REVIEW label is intentional and must not be treated as a regression.');
requireTrue(mobileJs.includes('allow_hidden_horizontal_overflow: false'), 'Mobile overflow truth rule must remain fail-closed.');

if (errors.length) {
  console.error(JSON.stringify({
    suite: 'KIDULTS_MOBILE_WORKSPACE_WHITESPACE_V1',
    result: 'FAIL',
    errors,
  }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  suite: 'KIDULTS_MOBILE_WORKSPACE_WHITESPACE_V1',
  result: 'PASS',
  implementation: 'CANONICAL_WORKSPACE_PAGE_CSS',
  viewport_max_px: 768,
  desktop_panel_min_height_preserved_px: 520,
  desktop_mount_padding_bottom_preserved_px: 100,
  desktop_main_min_height_preserved: '70vh',
  mobile_panel_min_height_px: 0,
  mobile_mount_padding_bottom_px: 0,
  mobile_main_min_height_px: 0,
  workspace_page_cache_version: 663,
  separate_hotfix_asset: 'PROHIBITED',
  decision_mobile_label: 'REVIEW_INTENTIONAL',
  hidden_horizontal_overflow: 'PROHIBITED',
}, null, 2));
