import fs from 'node:fs';

const htmlPath = 'apps/kidults-enterprise-staging/public/portal/workspace.html';
const cssPath = 'apps/kidults-enterprise-staging/public/portal/components/mobile-workspace-whitespace-hotfix.css';
const workspaceCssPath = 'apps/kidults-enterprise-staging/public/portal/components/workspace.css';
const workspacePageCssPath = 'apps/kidults-enterprise-staging/public/portal/workspace-page.css';
const mobileJsPath = 'apps/kidults-enterprise-staging/public/portal/components/mobile-reconstruction.js';

const html = fs.readFileSync(htmlPath, 'utf8');
const css = fs.readFileSync(cssPath, 'utf8');
const workspaceCss = fs.readFileSync(workspaceCssPath, 'utf8');
const workspacePageCss = fs.readFileSync(workspacePageCssPath, 'utf8');
const mobileJs = fs.readFileSync(mobileJsPath, 'utf8');
const errors = [];

function requireTrue(condition, message) {
  if (!condition) errors.push(message);
}

requireTrue(html.includes('components/mobile-workspace-whitespace-hotfix.css?v=2'), 'Workspace entry must load whitespace hotfix v2 to avoid stale cache.');
requireTrue(/@media\s*\(max-width:\s*768px\)/.test(css), 'Hotfix must be mobile-scoped to <=768px.');
requireTrue(css.includes('.living-workspace__panels'), 'Hotfix must target Workspace panels.');
requireTrue(css.includes('.workspace-page-mount'), 'Hotfix must target dedicated Workspace mount padding.');
requireTrue(css.includes('.workspace-page-main'), 'Hotfix must remove residual mobile main-height floor.');
requireTrue(/\.living-workspace__panels\s*\{[\s\S]*?min-height:\s*0\s*!important/.test(css), 'Mobile Workspace panels must override desktop min-height to zero.');
requireTrue(/\.workspace-page-mount\s*\{[\s\S]*?padding-bottom:\s*0\s*!important/.test(css), 'Mobile Workspace mount must remove the desktop 100px bottom padding.');
requireTrue(/\.workspace-page-main\s*\{[\s\S]*?min-height:\s*0\s*!important/.test(css), 'Mobile Workspace main must not preserve a viewport-height floor.');
requireTrue(/\.living-workspace__panels\s*\{[\s\S]*?min-height:\s*520px/.test(workspaceCss), 'Desktop 520px panel floor must remain explicit.');
requireTrue(/\.workspace-page-mount\s*\{[\s\S]*?padding-bottom:\s*100px/.test(workspacePageCss), 'Desktop 100px mount padding must remain explicit.');
requireTrue(/\.workspace-page-main\s*\{[\s\S]*?min-height:\s*70vh/.test(workspacePageCss), 'Desktop Workspace main-height floor must remain explicit.');
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
  viewport_max_px: 768,
  desktop_panel_min_height_preserved_px: 520,
  desktop_mount_padding_bottom_preserved_px: 100,
  desktop_main_min_height_preserved: '70vh',
  mobile_panel_min_height_px: 0,
  mobile_mount_padding_bottom_px: 0,
  mobile_main_min_height_px: 0,
  hotfix_cache_version: 2,
  decision_mobile_label: 'REVIEW_INTENTIONAL',
  hidden_horizontal_overflow: 'PROHIBITED',
}, null, 2));
