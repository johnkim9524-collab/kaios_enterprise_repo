import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '../../..');
const portalDir = path.join(root, 'apps/kidults-enterprise-staging/public/public-enterprise-preview');
const intelligencePath = path.join(portalDir, 'intelligence.js');
const previewPath = path.join(portalDir, 'intelligence-data.preview.json');
const livePath = path.join(portalDir, 'intelligence-data.json');

function pass(message) {
  console.log(`[B34-PREVIEW][PASS] ${message}`);
}
function assert(condition, message) {
  if (!condition) throw new Error(`[B34-PREVIEW][FAIL] ${message}`);
  pass(message);
}

assert(fs.existsSync(intelligencePath), 'Portal intelligence loader exists.');
assert(fs.existsSync(previewPath), 'Preview data asset exists.');
assert(fs.existsSync(livePath), 'Live staging data asset exists.');

const loader = fs.readFileSync(intelligencePath, 'utf8');
const preview = JSON.parse(fs.readFileSync(previewPath, 'utf8'));
const live = JSON.parse(fs.readFileSync(livePath, 'utf8'));

assert(loader.includes("params.get('data') === 'preview'"), 'Preview query-mode gate is present.');
assert(loader.includes("'intelligence-data.preview.json'"), 'Preview asset path is wired.');
assert(loader.includes("'intelligence-data.json'"), 'Default live asset path remains wired.');
assert(preview.status === 'release-candidate', 'Preview asset remains a release candidate.');
assert(preview.governance?.productionEligible === false, 'Preview asset cannot auto-promote to production.');
assert(live.status !== 'release-candidate', 'Live staging asset was not silently replaced by the candidate.');
assert(Number.isFinite(preview.headline?.kidult100), 'Preview headline is finite.');
assert(Array.isArray(preview.categoriesData) && preview.categoriesData.length === 8, 'Preview exposes eight categories.');
assert(Array.isArray(preview.trend) && preview.trend.at(-1)?.value === preview.headline.kidult100, 'Preview headline matches final trend value.');

console.log('[B34-PREVIEW] PASS — query-isolated candidate preview is certified and live staging remains unchanged.');
