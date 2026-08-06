import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_CATEGORY = 'Other Collectibles';
const CATEGORY_RULES = [
  ['Trading Cards', /\b(card|tcg|pokemon|sports card|trading card)\b/i],
  ['Figures & Statues', /\b(figure|statue|figurine|vinyl toy|designer toy)\b/i],
  ['Comics & Books', /\b(comic|manga|graphic novel|book)\b/i],
  ['Watches', /\b(watch|timepiece|chronograph)\b/i],
  ['Sneakers & Fashion', /\b(sneaker|shoe|fashion|handbag|streetwear)\b/i],
  ['Automotive', /\b(car|automotive|vehicle|motorcycle)\b/i],
  ['Art & Design', /\b(art|painting|print|sculpture|design object)\b/i]
];

const BRAND_ALIASES = new Map([
  ['funko', 'Funko'], ['funko pop', 'Funko'], ['lego', 'LEGO'], ['the lego group', 'LEGO'],
  ['pokemon', 'Pokémon'], ['pokémon', 'Pokémon'], ['rolex', 'Rolex'], ['nike', 'Nike'],
  ['hot toys', 'Hot Toys'], ['bearbrick', 'BE@RBRICK'], ['be@rbrick', 'BE@RBRICK'], ['medicom toy', 'MEDICOM TOY']
]);

function cleanText(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

export function canonicalName(value) {
  const cleaned = cleanText(value).replace(/[™®©]/g, '').replace(/\s+-\s+official$/i, '');
  if (!cleaned) return null;
  const alias = BRAND_ALIASES.get(cleaned.toLowerCase());
  if (alias) return alias;
  return cleaned.replace(/\b\w/g, (character) => character.toUpperCase());
}

export function detectBrand(observation) {
  const hinted = canonicalName(observation.provider_hint);
  if (hinted) return { value: hinted, source: 'provider_hint', confidence: 0.95 };
  const text = `${observation.title} ${observation.summary}`.toLowerCase();
  for (const [alias, canonical] of BRAND_ALIASES.entries()) {
    if (text.includes(alias)) return { value: canonical, source: 'content_rule', confidence: 0.82 };
  }
  return { value: canonicalName(observation.source), source: 'source_fallback', confidence: 0.55 };
}

export function detectCategory(observation) {
  if (observation.category_hint) return { value: canonicalName(observation.category_hint), source: 'category_hint', confidence: 0.92 };
  const text = `${observation.title} ${observation.summary}`;
  for (const [category, pattern] of CATEGORY_RULES) {
    if (pattern.test(text)) return { value: category, source: 'content_rule', confidence: 0.8 };
  }
  return { value: DEFAULT_CATEGORY, source: 'fallback', confidence: 0.45 };
}

export function extractYear(observation) {
  const match = `${observation.title} ${observation.summary}`.match(/\b(19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
}

export function normalizeObservation(entry) {
  if (!entry?.observation || !entry?.quality) throw new Error('normalization_entry_invalid');
  const observation = entry.observation;
  const brand = detectBrand(observation);
  const category = detectCategory(observation);
  const confidence = Math.max(0, Math.min(1, (
    entry.quality.score / 100 * 0.5 + brand.confidence * 0.25 + category.confidence * 0.25
  )));
  const reviewReasons = [];
  if (!entry.quality.accepted) reviewReasons.push('collector_rejected');
  if (confidence < 0.7) reviewReasons.push('low_confidence');
  if (category.value === DEFAULT_CATEGORY) reviewReasons.push('category_unresolved');

  const identity = `${brand.value ?? 'unknown'}|${category.value}|${cleanText(observation.title).toLowerCase()}`;
  return {
    id: crypto.createHash('sha256').update(identity).digest('hex'),
    observation_id: observation.id,
    fingerprint: observation.fingerprint,
    canonical_title: cleanText(observation.title),
    brand,
    category,
    release_year: extractYear(observation),
    locale: observation.locale,
    source: { name: observation.source, type: observation.type, url: observation.url, observed_at: observation.observed_at },
    confidence: Number(confidence.toFixed(4)),
    publish_candidate: entry.quality.accepted && confidence >= 0.7,
    review_required: reviewReasons.length > 0,
    review_reasons: reviewReasons,
    lineage: {
      collector_schema: 'kidults.collector.v1',
      collector_content_hash: observation.evidence.content_hash,
      normalization_ruleset: 'kidults.normalization.rules.v1'
    }
  };
}

export function resolveNormalizedDuplicates(records) {
  const byId = new Map();
  for (const record of records) {
    const current = byId.get(record.id);
    if (!current || record.confidence > current.confidence || new Date(record.source.observed_at) > new Date(current.source.observed_at)) {
      byId.set(record.id, record);
    }
  }
  return [...byId.values()].sort((a, b) => a.canonical_title.localeCompare(b.canonical_title));
}

export function buildNormalizationSnapshot(collectorSnapshot, now = new Date()) {
  if (collectorSnapshot?.schema_version !== 'kidults.collector.v1') throw new Error('collector_snapshot_schema_invalid');
  const normalized = resolveNormalizedDuplicates(collectorSnapshot.observations.map(normalizeObservation));
  return {
    schema_version: 'kidults.normalized.v1',
    generated_at: now.toISOString(),
    source_generated_at: collectorSnapshot.generated_at,
    counts: {
      received: collectorSnapshot.observations.length,
      normalized: normalized.length,
      publish_candidates: normalized.filter((record) => record.publish_candidate).length,
      review_required: normalized.filter((record) => record.review_required).length
    },
    records: normalized
  };
}

export function writeNormalizationSnapshot(snapshot, directory) {
  fs.mkdirSync(directory, { recursive: true });
  const outputPath = path.join(directory, 'normalization-snapshot.json');
  const temporaryPath = `${outputPath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, outputPath);
  return outputPath;
}

export function runNormalizationCli(argv = process.argv.slice(2), env = process.env) {
  const command = argv[0] ?? 'status';
  const inputPath = env.KIDULTS_NORMALIZATION_INPUT_FILE ?? path.resolve('.local-data/collector/collector-snapshot.json');
  const outputDir = env.KIDULTS_NORMALIZATION_OUTPUT_DIR ?? path.resolve('.local-data/normalization');
  const outputPath = path.join(outputDir, 'normalization-snapshot.json');

  if (command === 'status') {
    if (!fs.existsSync(outputPath)) return { ready: false, output: outputPath };
    const snapshot = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    return { ready: true, output: outputPath, counts: snapshot.counts, generated_at: snapshot.generated_at };
  }
  if (command !== 'run') throw new Error('normalization_command_unsupported');
  if (!fs.existsSync(inputPath)) throw new Error('collector_snapshot_missing');
  const collectorSnapshot = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const snapshot = buildNormalizationSnapshot(collectorSnapshot);
  const output = writeNormalizationSnapshot(snapshot, outputDir);
  return { ready: true, output, counts: snapshot.counts };
}

function isMainModule() {
  return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
}

if (isMainModule()) {
  try {
    console.log(JSON.stringify(runNormalizationCli()));
  } catch (error) {
    console.error(JSON.stringify({ ok: false, error: error.message }));
    process.exitCode = 1;
  }
}
