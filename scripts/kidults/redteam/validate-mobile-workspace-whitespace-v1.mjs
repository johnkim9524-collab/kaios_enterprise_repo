import fs from 'node:fs';

const htmlPath = 'apps/kidults-enterprise-staging/public/portal/workspace.html';
const cssPath = 'apps/kidults-enterprise-staging/public/portal/components/mobile-workspace-whitespace-hotfix.css';
const workspaceCssPath = 'apps/kidults-enterprise-staging/public/portal/components/workspace.css';
const mobileJsPath = 'apps/kidults-enterprise-staging/public/portal/components/mobile-reconstruction.js';

const html = fs.readFileSync(htmlPath, 'utf8');
const css = fs.readFileSync(cssPath, 'utf8');
const workspaceCss = fs.readFileSync(workspaceCssPath, 'utf8');
const mobileJs = fs.readFileSync(mobileJsPath, 'utf8');
const errors = [];

function requireTrue(condition, message) {
  if (!condition) errors.push(message);
}

requireTrue(html.includes('components/mobile-workspace-whitespace-hotfix.css?v=1'), 'Workspace entry must load mobile whitespace hotfix.');
requireTrue(/@media\s*\(max-width:\s*768px\)/.test(css), 'Hotfix must be mobile-scoped to <=768px.');
requireTrue(css.includes('.living-workspace__panels'), 'Hotfix must target Workspace panels.');
requireTrue(/min-height:\s*0\s*!important/.test(css), 'Mobile Workspace panels must override desktop min-height to zero.');
requireTrue(/\.living-workspace__panels\s*\{[\s\S]*?min-height:\s*520px/.test(workspaceCss), 'Regression fixture expects the desktop 520px panel floor to remain explicit.');
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
  mobile_panel_min_height_px: 0,
  decision_mobile_label: 'REVIEW_INTENTIONAL',
  hidden_horizontal_overflow: 'PROHIBITED',
}, null, 2));
