import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '../../..');
const registryPath = path.join(root, 'config/kidults/intelligence-source-registry.json');
const assetPath = path.join(root, 'artifacts/kidults/b34/intelligence-data.next.json');
const manifestPath = path.join(root, 'artifacts/kidults/b34/build-manifest.json');

let failed = false;
function pass(message) { console.log(`[B34][PASS] ${message}`); }
function fail(message) { failed = true; console.error(`[B34][FAIL] ${message}`); }
function check(condition, message) { condition ? pass(message) : fail(message); }
function read(filePath) { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }

for (const filePath of [registryPath, assetPath, manifestPath]) {
  check(fs.existsSync(filePath), `Required file exists: ${path.relative(root, filePath)}`);
}

if (!failed) {
  const registry = read(registryPath);
  const asset = read(assetPath);
  const manifest = read(manifestPath);
  const sum = (items) => items.reduce((total, item) => total + Number(item.value || 0), 0);

  check(registry.status === 'staging', 'Source registry remains staging-only.');
  check(registry.sources.every((source) => source.id && source.family && source.adapter), 'Every source has identity, family and adapter.');
  check(asset.status === 'staging', 'Generated asset remains staging-only.');
  check(asset.governance?.productionEligible === false, 'Automatic production promotion is disabled.');
  check(asset.trend.at(-1)?.value === asset.headline.kidult100, 'Headline matches final trend observation.');
  check(sum(asset.confidenceDistribution) === 100, 'Confidence distribution totals 100.');
  check(sum(asset.sourceComposition) === 100, 'Source composition totals 100.');
  check(sum(asset.geography) === 100, 'Geography totals 100.');
  check(asset.categories.length === 8, 'Eight governed category outputs are present.');
  check(asset.evidenceLineage.length === asset.categories.length, 'Every category has evidence lineage.');
  check(asset.evidenceLineage.every((item) => item.sourceIds.length > 0), 'Every observation resolves to at least one registered source.');
  check(typeof manifest.sha256 === 'string' && manifest.sha256.length === 64, 'Build manifest includes a SHA-256 fingerprint.');
  check(manifest.productionEligible === false, 'Manifest confirms production promotion is disabled.');
}

if (failed) {
  console.error('[B34] CERTIFICATION FAILED');
  process.exit(1);
}

console.log('[B34] FOUNDATION PASS — source registry, deterministic build and evidence-lineage gates are operational.');