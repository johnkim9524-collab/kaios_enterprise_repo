import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '../../..');
const inputPath = path.join(root, 'artifacts/kidults/b34/intelligence-data.next.json');
const outputDir = path.join(root, 'artifacts/kidults/b34');
const normalizedPath = path.join(outputDir, 'normalized-observations.json');
const manifestPath = path.join(outputDir, 'normalization-manifest.json');

const CATEGORY_ALIASES = new Map([
  ['character goods', 'Character Goods'],
  ['character-goods', 'Character Goods'],
  ['trading cards', 'Trading Cards'],
  ['trading-cards', 'Trading Cards'],
  ['art toys', 'Art Toys'],
  ['art-toys', 'Art Toys'],
  ['luxury collectibles', 'Luxury Collectibles'],
  ['watches', 'Watches'],
  ['sneakers', 'Sneakers'],
  ['designer fashion', 'Designer Fashion'],
  ['automotive icons', 'Automotive Icons']
]);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, ' ')
    .replace(/\s*-\s*/g, '-')
    .replace(/[^a-z0-9 +&-]/g, '')
    .replace(/\s+/g, ' ');
}

function normalizeCategory(value) {
  const key = normalizeText(value);
  return CATEGORY_ALIASES.get(key) || String(value ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ');
}

function normalizeSourceIds(sourceIds) {
  return [...new Set((sourceIds || []).map((value) => normalizeText(value)).filter(Boolean))].sort();
}

function finiteNumber(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`Invalid numeric field: ${field}`);
  return number;
}

function canonicalIdentity(observation) {
  const identity = {
    category: normalizeCategory(observation.category),
    observedAt: new Date(observation.observedAt).toISOString(),
    sourceIds: normalizeSourceIds(observation.sourceIds),
    score: finiteNumber(observation.score, 'score'),
    confidence: finiteNumber(observation.confidence, 'confidence'),
    velocity: finiteNumber(observation.velocity, 'velocity'),
    liquidity: finiteNumber(observation.liquidity, 'liquidity'),
    state: normalizeText(observation.state)
  };
  return `obs_${sha256(stableStringify(identity)).slice(0, 24)}`;
}

function normalizeObservation(raw) {
  const normalized = {
    observationId: canonicalIdentity(raw),
    canonicalCategoryId: `category_${normalizeText(normalizeCategory(raw.category)).replace(/[^a-z0-9]+/g, '_')}`,
    category: normalizeCategory(raw.category),
    score: finiteNumber(raw.score, 'score'),
    confidence: finiteNumber(raw.confidence, 'confidence'),
    velocity: finiteNumber(raw.velocity, 'velocity'),
    liquidity: finiteNumber(raw.liquidity, 'liquidity'),
    state: normalizeText(raw.state),
    sourceIds: normalizeSourceIds(raw.sourceIds),
    observedAt: new Date(raw.observedAt).toISOString(),
    provenance: {
      originalObservationId: String(raw.observationId || ''),
      originalCategory: String(raw.category || ''),
      originalState: String(raw.state || '')
    }
  };
  normalized.recordFingerprint = sha256(stableStringify(normalized));
  return normalized;
}

function main() {
  const asset = readJson(inputPath);
  const raw = Array.isArray(asset.evidenceLineage) ? asset.evidenceLineage : [];
  const accepted = [];
  const duplicates = [];
  const rejected = [];
  const seen = new Map();

  for (const item of raw) {
    try {
      const normalized = normalizeObservation(item);
      if (seen.has(normalized.observationId)) {
        duplicates.push({
          observationId: normalized.observationId,
          duplicateOf: seen.get(normalized.observationId),
          originalObservationId: String(item.observationId || '')
        });
        continue;
      }
      seen.set(normalized.observationId, normalized.observationId);
      accepted.push(normalized);
    } catch (error) {
      rejected.push({
        originalObservationId: String(item?.observationId || ''),
        reason: error instanceof Error ? error.message : String(error)
      });
    }
  }

  accepted.sort((a, b) => a.observationId.localeCompare(b.observationId));
  const replayFingerprint = sha256(stableStringify(accepted));
  const result = {
    schemaVersion: '1.0.0',
    engineVersion: 'B34-A3',
    status: 'staging',
    input: path.relative(root, inputPath).replaceAll('\\', '/'),
    accepted,
    duplicates,
    rejected,
    statistics: {
      inputCount: raw.length,
      acceptedCount: accepted.length,
      duplicateCount: duplicates.length,
      rejectedCount: rejected.length
    },
    replayProtection: {
      deterministic: true,
      replayFingerprint
    }
  };

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(normalizedPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  fs.writeFileSync(manifestPath, `${JSON.stringify({
    engineVersion: 'B34-A3',
    normalizedAsset: path.relative(root, normalizedPath).replaceAll('\\', '/'),
    inputCount: raw.length,
    acceptedCount: accepted.length,
    duplicateCount: duplicates.length,
    rejectedCount: rejected.length,
    replayFingerprint,
    productionEligible: false
  }, null, 2)}\n`, 'utf8');

  console.log(`[B34-A3] Normalized ${raw.length} observations.`);
  console.log(`[B34-A3] Accepted: ${accepted.length}; duplicates: ${duplicates.length}; rejected: ${rejected.length}.`);
  console.log(`[B34-A3] Replay fingerprint: ${replayFingerprint}`);
  console.log('[B34-A3] Production promotion: disabled');
}

main();
