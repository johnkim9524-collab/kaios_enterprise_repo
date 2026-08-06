import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '../../..');
const normalizedPath = path.join(root, 'artifacts/kidults/b34/normalized-observations.json');
const registryPath = path.join(root, 'config/kidults/intelligence-source-registry.json');
const baseAssetPath = path.join(root, 'artifacts/kidults/b34/intelligence-data.next.json');
const outputDir = path.join(root, 'artifacts/kidults/b34');
const scoredPath = path.join(outputDir, 'scored-intelligence.json');
const manifestPath = path.join(outputDir, 'scoring-manifest.json');

const FAMILY_WEIGHTS = Object.freeze({ marketplace: 1.0, auction: 1.08, brand: 0.96, editorial: 0.82, cultural: 0.76, internal: 0.7 });
const TRUST_WEIGHTS = Object.freeze({ A: 1.0, B: 0.9, C: 0.78, D: 0.62, 1: 1.0, 2: 0.9, 3: 0.78, 4: 0.62 });

function readJson(filePath) { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
function round(value, digits = 1) { const factor = 10 ** digits; return Math.round(value * factor) / factor; }
function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function familyKey(value) { return String(value || 'internal').toLowerCase().replace(/[^a-z]/g, ''); }
function trustKey(value) { return String(value ?? 'C').toUpperCase(); }

function main() {
  const normalized = readJson(normalizedPath);
  const registry = readJson(registryPath);
  const base = readJson(baseAssetPath);
  const sourceMap = new Map(registry.sources.map((source) => [String(source.id).toLowerCase(), source]));
  const referenceTime = new Date(base.updatedAt).getTime();

  const categories = normalized.accepted.map((observation) => {
    const sources = observation.sourceIds.map((id) => sourceMap.get(id)).filter(Boolean);
    const sourceFactors = sources.map((source) => {
      const family = FAMILY_WEIGHTS[familyKey(source.family)] ?? FAMILY_WEIGHTS.internal;
      const trust = TRUST_WEIGHTS[trustKey(source.trustTier)] ?? TRUST_WEIGHTS.C;
      return { sourceId: source.id, family: source.family, trustTier: source.trustTier, factor: round(family * trust, 4) };
    });
    const evidenceFactor = sourceFactors.length ? sourceFactors.reduce((sum, item) => sum + item.factor, 0) / sourceFactors.length : 0.65;
    const ageDays = Math.max(0, (referenceTime - new Date(observation.observedAt).getTime()) / 86400000);
    const freshnessFactor = clamp(Math.exp(-ageDays / 120), 0.55, 1);
    const coverageFactor = clamp(0.72 + Math.min(sourceFactors.length, 5) * 0.056, 0.72, 1);
    const confidence = round(clamp(observation.confidence * evidenceFactor * freshnessFactor * coverageFactor, 0, 100), 1);
    const velocity = round(clamp(observation.velocity * (0.88 + evidenceFactor * 0.12), 0, 10), 2);
    const canonStrength = round(clamp(observation.score * 0.55 + observation.liquidity * 0.25 + confidence * 0.2, 0, 100), 1);
    const categoryScore = round(clamp(observation.score * 0.45 + confidence * 0.2 + canonStrength * 0.25 + velocity * 10 * 0.1, 0, 100), 1);
    return {
      observationId: observation.observationId,
      canonicalCategoryId: observation.canonicalCategoryId,
      category: observation.category,
      score: categoryScore,
      confidence,
      velocity,
      liquidity: observation.liquidity,
      canonStrength,
      state: observation.state,
      scoringTrace: { evidenceFactor: round(evidenceFactor, 4), freshnessFactor: round(freshnessFactor, 4), coverageFactor: round(coverageFactor, 4), sourceFactors }
    };
  }).sort((a, b) => b.score - a.score || a.category.localeCompare(b.category));

  const weightedAverage = (field) => categories.reduce((sum, item) => sum + item[field], 0) / Math.max(categories.length, 1);
  const categoryMean = weightedAverage('score');
  const confidenceMean = weightedAverage('confidence');
  const canonMean = weightedAverage('canonStrength');
  const velocityMean = weightedAverage('velocity');
  const kidult100 = round(clamp(categoryMean * 0.44 + confidenceMean * 0.24 + canonMean * 0.24 + velocityMean * 10 * 0.08, 0, 100), 1);

  const scored = {
    schemaVersion: '1.0.0', engineVersion: 'B34-A4', status: 'staging', methodologyVersion: '1.3-b34', updatedAt: base.updatedAt,
    headline: { kidult100, confidence: round(confidenceMean, 1), change30d: base.headline.change30d, coverage: base.headline.coverage, sourceFamilies: base.headline.sourceFamilies },
    kpis: { sentiment: base.kpis.sentiment, canonStrength: round(canonMean, 1), marketVelocity: round(velocityMean, 2), activeListings: base.kpis.activeListings },
    trend: [...base.trend.slice(0, -1), { ...base.trend.at(-1), value: kidult100 }],
    categories,
    confidenceDistribution: base.confidenceDistribution,
    sourceComposition: base.sourceComposition,
    geography: base.geography,
    governance: { productionEligible: false, scoringDeterministic: true, normalizedReplayFingerprint: normalized.replayProtection.replayFingerprint }
  };

  const fingerprint = sha256(stableStringify(scored));
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(scoredPath, `${JSON.stringify(scored, null, 2)}\n`);
  fs.writeFileSync(manifestPath, `${JSON.stringify({ engineVersion: 'B34-A4', scoredAsset: path.relative(root, scoredPath).replaceAll('\\', '/'), fingerprint, categoryCount: categories.length, productionEligible: false, formulas: { confidence: 'baseConfidence * evidenceFactor * freshnessFactor * coverageFactor', canonStrength: 'score*0.55 + liquidity*0.25 + confidence*0.20', categoryScore: 'score*0.45 + confidence*0.20 + canon*0.25 + velocity*10*0.10', kidult100: 'categoryMean*0.44 + confidenceMean*0.24 + canonMean*0.24 + velocityMean*10*0.08' } }, null, 2)}\n`);
  console.log(`[B34-A4] Scored ${categories.length} categories.`);
  console.log(`[B34-A4] Kidult100: ${kidult100}`);
  console.log(`[B34-A4] Fingerprint: ${fingerprint}`);
  console.log('[B34-A4] Production promotion: disabled');
}
main();
