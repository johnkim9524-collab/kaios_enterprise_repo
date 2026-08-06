import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const preview = path.join(root, 'apps', 'kidults-enterprise-staging', 'public', 'public-enterprise-preview');
const files = {
  html: path.join(preview, 'index.html'),
  runtime: path.join(preview, 'b47-data-state-runtime.js'),
  css: path.join(preview, 'b47-data-state-runtime.css'),
  data: path.join(preview, 'intelligence-data.json')
};

let failed = false;

function pass(message) {
  console.log(`[B33-A5][PASS] ${message}`);
}

function fail(message) {
  failed = true;
  console.error(`[B33-A5][FAIL] ${message}`);
}

function read(file) {
  if (!fs.existsSync(file)) {
    fail(`Missing file: ${path.relative(root, file)}`);
    return '';
  }
  return fs.readFileSync(file, 'utf8');
}

const html = read(files.html);
const runtime = read(files.runtime);
const css = read(files.css);
const data = JSON.parse(read(files.data) || '{}');

const requiredHtml = [
  'b47-data-state-runtime.css',
  'b47-data-state-runtime.js',
  'intelligence.js'
];

requiredHtml.forEach((token) => html.includes(token)
  ? pass(`HTML loads ${token}.`)
  : fail(`HTML does not load ${token}.`));

const runtimeIndex = html.indexOf('b47-data-state-runtime.js');
const intelligenceIndex = html.indexOf('intelligence.js');
if (runtimeIndex >= 0 && intelligenceIndex >= 0 && runtimeIndex < intelligenceIndex) {
  pass('Governed runtime loads before intelligence rendering.');
} else {
  fail('Governed runtime must load before intelligence.js.');
}

[
  "new Set(['illustrative', 'staging', 'validated', 'production'])",
  'Headline and final trend value do not match.',
  'must total 100.',
  'Data temporarily unavailable',
  'KIDULTS_INTELLIGENCE_RUNTIME',
  'kidults:intelligence-ready',
  'kidults:intelligence-unavailable'
].forEach((token) => runtime.includes(token)
  ? pass(`Runtime control present: ${token}`)
  : fail(`Runtime control missing: ${token}`));

[
  'data-intelligence-state="unavailable"',
  '#trend-chart',
  '#category-bars',
  '#correlation-chart',
  'Data temporarily unavailable'
].forEach((token) => css.includes(token)
  ? pass(`Fail-closed CSS present: ${token}`)
  : fail(`Fail-closed CSS missing: ${token}`));

const allowedStatuses = new Set(['illustrative', 'staging', 'validated', 'production']);
allowedStatuses.has(data.status)
  ? pass(`Canonical status is allowed: ${data.status}.`)
  : fail(`Canonical status is not allowed: ${data.status}.`);

if (data.status === 'production' && !(data.sourceLineage || data.lineage)) {
  fail('Production status requires source lineage metadata.');
} else {
  pass('Production claim gate is satisfied for the current asset.');
}

if (failed) {
  console.error('[B33-A5] FAIL — governed data-state runtime audit did not pass.');
  process.exit(1);
}

console.log('[B33-A5] PASS — governed data-state and fail-closed runtime are certified.');
