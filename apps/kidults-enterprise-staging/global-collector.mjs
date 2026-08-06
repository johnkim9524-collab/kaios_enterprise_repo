import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const SUPPORTED_TYPES = new Set(['web', 'rss', 'auction', 'marketplace', 'museum', 'brand', 'provider', 'social']);
const DEFAULT_RETENTION_DAYS = 30;

export function canonicalizeUrl(value) {
  const url = new URL(String(value));
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_|fbclid|gclid)/i.test(key)) url.searchParams.delete(key);
  }
  url.hostname = url.hostname.toLowerCase();
  if ((url.protocol === 'https:' && url.port === '443') || (url.protocol === 'http:' && url.port === '80')) url.port = '';
  return url.toString();
}

export function buildObservation(input, now = new Date()) {
  if (!input || typeof input !== 'object') throw new TypeError('collector_input_required');
  if (!SUPPORTED_TYPES.has(input.type)) throw new Error('collector_type_unsupported');
  if (!input.url) throw new Error('collector_url_required');
  if (!input.title || !String(input.title).trim()) throw new Error('collector_title_required');

  const canonicalUrl = canonicalizeUrl(input.url);
  const observedAt = new Date(input.observed_at ?? now).toISOString();
  const source = String(input.source ?? new URL(canonicalUrl).hostname).trim();
  const title = String(input.title).trim().replace(/\s+/g, ' ');
  const summary = String(input.summary ?? '').trim().replace(/\s+/g, ' ');
  const fingerprint = crypto
    .createHash('sha256')
    .update(`${input.type}|${canonicalUrl}|${title.toLowerCase()}`)
    .digest('hex');

  return {
    id: crypto.randomUUID(),
    fingerprint,
    type: input.type,
    source,
    url: canonicalUrl,
    title,
    summary,
    observed_at: observedAt,
    collected_at: now.toISOString(),
    locale: input.locale ?? 'en',
    category_hint: input.category_hint ?? null,
    provider_hint: input.provider_hint ?? null,
    evidence: {
      content_hash: crypto.createHash('sha256').update(`${title}\n${summary}`).digest('hex'),
      source_tier: Number.isInteger(input.source_tier) ? input.source_tier : 3,
      robots_respected: input.robots_respected !== false,
      terms_respected: input.terms_respected !== false
    }
  };
}

export function deduplicateObservations(observations) {
  const byFingerprint = new Map();
  for (const observation of observations) {
    const current = byFingerprint.get(observation.fingerprint);
    if (!current || new Date(observation.observed_at) > new Date(current.observed_at)) {
      byFingerprint.set(observation.fingerprint, observation);
    }
  }
  return [...byFingerprint.values()].sort((a, b) => a.observed_at.localeCompare(b.observed_at));
}

export function evaluateObservation(observation) {
  const issues = [];
  if (!observation.evidence.robots_respected) issues.push('robots_not_respected');
  if (!observation.evidence.terms_respected) issues.push('terms_not_respected');
  if (observation.evidence.source_tier < 1 || observation.evidence.source_tier > 5) issues.push('source_tier_invalid');
  if (!observation.summary) issues.push('summary_missing');

  const score = Math.max(0, 100 - issues.length * 20 - Math.max(0, observation.evidence.source_tier - 1) * 5);
  return {
    accepted: !issues.includes('robots_not_respected') && !issues.includes('terms_not_respected'),
    score,
    issues
  };
}

export function buildCollectorSnapshot(inputs, options = {}) {
  const now = options.now ? new Date(options.now) : new Date();
  const retentionDays = Number(options.retention_days ?? DEFAULT_RETENTION_DAYS);
  const cutoff = new Date(now.getTime() - retentionDays * 86400000);
  const observations = deduplicateObservations(inputs.map((input) => buildObservation(input, now)));
  const evaluated = observations.map((observation) => ({ observation, quality: evaluateObservation(observation) }));
  const retained = evaluated.filter(({ observation }) => new Date(observation.observed_at) >= cutoff);
  const accepted = retained.filter(({ quality }) => quality.accepted);

  return {
    schema_version: 'kidults.collector.v1',
    generated_at: now.toISOString(),
    retention_days: retentionDays,
    counts: {
      received: inputs.length,
      unique: observations.length,
      retained: retained.length,
      accepted: accepted.length,
      rejected: retained.length - accepted.length
    },
    observations: retained
  };
}

export function writeCollectorSnapshot(snapshot, directory) {
  fs.mkdirSync(directory, { recursive: true });
  const outputPath = path.join(directory, 'collector-snapshot.json');
  const temporaryPath = `${outputPath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, outputPath);
  return outputPath;
}

export function loadCollectorInputs(filePath) {
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!Array.isArray(parsed)) throw new Error('collector_input_must_be_array');
  return parsed;
}

export function runCollectorCli(argv = process.argv.slice(2), env = process.env) {
  const command = argv[0] ?? 'status';
  const inputPath = env.KIDULTS_COLLECTOR_INPUT_FILE ?? path.resolve('.local-data/collector-input.json');
  const outputDir = env.KIDULTS_COLLECTOR_OUTPUT_DIR ?? path.resolve('.local-data/collector');

  if (command === 'status') {
    const outputPath = path.join(outputDir, 'collector-snapshot.json');
    if (!fs.existsSync(outputPath)) return { ready: false, output: outputPath };
    const snapshot = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    return { ready: true, output: outputPath, counts: snapshot.counts, generated_at: snapshot.generated_at };
  }

  if (command !== 'run') throw new Error('collector_command_unsupported');
  const inputs = loadCollectorInputs(inputPath);
  const snapshot = buildCollectorSnapshot(inputs, { retention_days: env.KIDULTS_COLLECTOR_RETENTION_DAYS });
  const output = writeCollectorSnapshot(snapshot, outputDir);
  return { ready: true, output, counts: snapshot.counts };
}

function isMainModule() {
  return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
}

if (isMainModule()) {
  try {
    console.log(JSON.stringify(runCollectorCli()));
  } catch (error) {
    console.error(JSON.stringify({ ok: false, error: error.message }));
    process.exitCode = 1;
  }
}
