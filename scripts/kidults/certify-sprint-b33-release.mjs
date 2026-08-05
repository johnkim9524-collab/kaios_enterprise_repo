import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const previewDir = path.join(root, 'apps', 'kidults-enterprise-staging', 'public', 'public-enterprise-preview');
const requiredFiles = [
  'index.html',
  'styles.css',
  'intelligence.js',
  'intelligence-data.json',
  'intelligence-data.schema.json',
  'b31-radial-charts.js',
  'b31-radial-charts.css',
  'b47-data-state-runtime.js',
  'b47-data-state-runtime.css'
];

const checks = [];
const pass = (message) => checks.push({ ok: true, message });
const fail = (message) => checks.push({ ok: false, message });

for (const file of requiredFiles) {
  const target = path.join(previewDir, file);
  fs.existsSync(target) ? pass(`Required release file present: ${file}`) : fail(`Missing release file: ${file}`);
}

const htmlPath = path.join(previewDir, 'index.html');
const html = fs.existsSync(htmlPath) ? fs.readFileSync(htmlPath, 'utf8') : '';

const requiredRuntimeOrder = [
  'b47-data-state-runtime.js',
  'intelligence.js',
  'b31-radial-charts.js'
];
const positions = requiredRuntimeOrder.map((name) => html.indexOf(name));
if (positions.every((position) => position >= 0) && positions[0] < positions[1] && positions[1] < positions[2]) {
  pass('Governed runtime loads before intelligence rendering and chart rendering.');
} else {
  fail('Governed runtime script order is invalid.');
}

const viewportMeta = '<meta name="viewport"';
html.includes(viewportMeta) ? pass('Responsive viewport metadata is present.') : fail('Responsive viewport metadata is missing.');
html.includes('viewport-fit=cover') ? pass('Safe-area viewport support is present.') : fail('Safe-area viewport support is missing.');
html.includes('data-status-label') ? pass('Governed status label bindings are present.') : fail('Governed status label bindings are missing.');

const cssFiles = fs.readdirSync(previewDir).filter((name) => name.endsWith('.css'));
const css = cssFiles.map((name) => fs.readFileSync(path.join(previewDir, name), 'utf8')).join('\n');

const responsiveSignals = [
  '@media',
  'max-width: 100%',
  'min-width: 0',
  'overflow-x'
];
for (const signal of responsiveSignals) {
  css.includes(signal) ? pass(`Responsive CSS control present: ${signal}`) : fail(`Responsive CSS control missing: ${signal}`);
}

const dataPath = path.join(previewDir, 'intelligence-data.json');
if (fs.existsSync(dataPath)) {
  try {
    const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    const allowed = new Set(['illustrative', 'staging', 'validated', 'production']);
    allowed.has(data.status) ? pass(`Canonical status allowed: ${data.status}`) : fail(`Unsupported canonical status: ${data.status}`);
    Number.isFinite(data?.headline?.kidult100) ? pass('Headline Kidult 100 is finite.') : fail('Headline Kidult 100 is invalid.');
    Array.isArray(data?.trend) && data.trend.length > 0 ? pass('Trend observations are present.') : fail('Trend observations are missing.');
  } catch (error) {
    fail(`Canonical data JSON does not parse: ${error.message}`);
  }
}

const manualMatrix = [
  'Desktop visual QA: 1920 / 1600 / 1440 / 1366 / 1280',
  'Mobile visual QA: 320 / 360 / 375 / 390 / 412 / 430',
  'No horizontal overflow at all certified mobile widths',
  'Hero, KPI, trend, category, donuts, matrix and footer render without clipping',
  'Keyboard focus and skip-to-content remain usable',
  'Lighthouse targets reviewed: Performance, Accessibility, Best Practices, SEO'
];

console.log('\nKIDULTS Sprint B33 — Release Certification\n');
for (const check of checks) {
  console.log(`[B33-A6][${check.ok ? 'PASS' : 'FAIL'}] ${check.message}`);
}

console.log('\n[B33-A6] Manual visual certification checklist:');
manualMatrix.forEach((item, index) => console.log(`  ${index + 1}. ${item}`));

const failures = checks.filter((check) => !check.ok);
if (failures.length > 0) {
  console.error(`\n[B33-A6] FAIL — ${failures.length} automated release gate(s) failed.`);
  process.exit(1);
}

console.log('\n[B33-A6] AUTOMATED PASS — complete the manual viewport and Lighthouse checklist before declaring RC1.');
