import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '../../..');
const registryPath = path.join(root, 'config/kidults/intelligence-source-registry.json');
const outputDir = path.join(root, 'artifacts/kidults/b34');
const outputPath = path.join(outputDir, 'intelligence-data.next.json');
const manifestPath = path.join(outputDir, 'build-manifest.json');

const categories = [
  ['Character Goods', 89.9, 91, 4.9, 86, 'accelerating'],
  ['Trading Cards', 81.7, 84, 4.1, 91, 'monitor'],
  ['Art Toys', 76.3, 82, 3.8, 72, 'monitor'],
  ['Luxury Collectibles', 68.4, 76, 2.9, 64, 'weakening'],
  ['Watches', 66.8, 78, 3.1, 69, 'stable'],
  ['Sneakers', 64.5, 74, 3.5, 77, 'stable'],
  ['Designer Fashion', 61.7, 73, 3.0, 62, 'monitor'],
  ['Automotive Icons', 59.4, 71, 4.4, 51, 'emerging']
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function buildAsset(registry) {
  const enabledSources = registry.sources.filter((source) => source.enabled);
  const observations = categories.map(([category, score, confidence, velocity, liquidity, state], index) => ({
    observationId: `b34-fixture-${String(index + 1).padStart(2, '0')}`,
    category,
    score,
    confidence,
    velocity,
    liquidity,
    state,
    sourceIds: enabledSources.filter((source) => source.categories.includes(category)).map((source) => source.id).sort(),
    observedAt: '2026-08-05T15:30:00.000Z'
  }));

  const headline = 94.8;
  return {
    schemaVersion: '1.0.0',
    methodologyVersion: '1.3',
    status: 'staging',
    generatedFrom: 'B34 deterministic fixture engine',
    updatedAt: '2026-08-05T15:30:00.000Z',
    headline: {
      kidult100: headline,
      change30d: 2.1,
      confidence: 94,
      coverage: '500+ brands',
      sourceFamilies: 42
    },
    kpis: {
      sentiment: 67.4,
      canonStrength: 81.2,
      marketVelocity: 4.8,
      activeListings: 128000
    },
    trend: [89.6, 90.4, 91.1, 91.8, 92.7, 93.5, headline].map((value, index) => ({
      date: ['2026-05-12', '2026-05-26', '2026-06-09', '2026-06-23', '2026-07-07', '2026-07-21', '2026-08-05'][index],
      value
    })),
    categories: observations.map(({ category, score, confidence, velocity, liquidity, state }) => ({ category, score, confidence, velocity, liquidity, state })),
    confidenceDistribution: [
      { grade: 'A', value: 38 },
      { grade: 'B', value: 34 },
      { grade: 'C', value: 20 },
      { grade: 'D', value: 8 }
    ],
    sourceComposition: [
      { label: 'Marketplaces', value: 29 },
      { label: 'Auctions', value: 24 },
      { label: 'Brands', value: 18 },
      { label: 'Editorial', value: 16 },
      { label: 'Cultural signals', value: 13 }
    ],
    geography: [
      { region: 'North America', value: 34 },
      { region: 'Europe', value: 24 },
      { region: 'East Asia', value: 22 },
      { region: 'Southeast Asia', value: 11 },
      { region: 'Other', value: 9 }
    ],
    evidenceLineage: observations,
    governance: {
      registryVersion: registry.version,
      enabledSourceCount: enabledSources.length,
      productionEligible: false
    }
  };
}

fs.mkdirSync(outputDir, { recursive: true });
const registry = readJson(registryPath);
const asset = buildAsset(registry);
const canonical = `${JSON.stringify(asset, null, 2)}\n`;
fs.writeFileSync(outputPath, canonical, 'utf8');
fs.writeFileSync(manifestPath, `${JSON.stringify({
  engineVersion: 'B34-A2',
  output: path.relative(root, outputPath).replaceAll('\\', '/'),
  sha256: sha256(stableStringify(asset)),
  observationCount: asset.evidenceLineage.length,
  sourceCount: asset.governance.enabledSourceCount,
  productionEligible: false
}, null, 2)}\n`, 'utf8');

console.log(`[B34] Built ${outputPath}`);
console.log(`[B34] Evidence observations: ${asset.evidenceLineage.length}`);
console.log('[B34] Production promotion: disabled');