import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '../../..');
const dir = path.join(root, 'artifacts/kidults/b34');
const scoredPath = path.join(dir, 'scored-intelligence.json');
const scoringManifestPath = path.join(dir, 'scoring-manifest.json');
const releasePath = path.join(dir, 'intelligence-data.release-candidate.json');
const releaseManifestPath = path.join(dir, 'release-manifest.json');

function readJson(filePath) { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function assert(condition, message) { if (!condition) throw new Error(message); console.log(`[B34-A5][PASS] ${message}`); }
function total(rows, field = 'value') { return rows.reduce((sum, row) => sum + Number(row[field] || 0), 0); }

const asset = readJson(scoredPath);
const scoringManifest = readJson(scoringManifestPath);
assert(asset.status === 'staging', 'Scored asset remains staging-only.');
assert(asset.governance?.productionEligible === false, 'Automatic production promotion is disabled.');
assert(Array.isArray(asset.categories) && asset.categories.length === 8, 'Eight governed category outputs are present.');
assert(Number.isFinite(asset.headline?.kidult100), 'Kidult100 headline is finite.');
assert(asset.trend.at(-1)?.value === asset.headline.kidult100, 'Headline matches final trend observation.');
assert(total(asset.confidenceDistribution) === 100, 'Confidence distribution totals 100.');
assert(total(asset.sourceComposition) === 100, 'Source composition totals 100.');
assert(total(asset.geography) === 100, 'Geography totals 100.');
assert(asset.categories.every((row) => Number.isFinite(row.score) && row.score >= 0 && row.score <= 100), 'Category scores are bounded from 0 to 100.');
assert(asset.categories.every((row) => Number.isFinite(row.confidence) && row.confidence >= 0 && row.confidence <= 100), 'Confidence scores are bounded from 0 to 100.');
assert(asset.categories.every((row) => row.scoringTrace && Array.isArray(row.scoringTrace.sourceFactors)), 'Every category retains a scoring trace.');

const candidate = {
  ...asset,
  release: {
    releaseId: `b34-rc-${sha256(stableStringify(asset)).slice(0, 12)}`,
    releaseState: 'candidate',
    productionEligible: false,
    requiresManualApproval: true
  }
};
const fingerprint = sha256(stableStringify(candidate));
fs.writeFileSync(releasePath, `${JSON.stringify(candidate, null, 2)}\n`);
fs.writeFileSync(releaseManifestPath, `${JSON.stringify({ engineVersion: 'B34-A5', candidate: path.relative(root, releasePath).replaceAll('\\', '/'), fingerprint, scoringFingerprint: scoringManifest.fingerprint, validationPassed: true, manualApprovalRequired: true, productionEligible: false }, null, 2)}\n`);
console.log(`[B34-A5] Release candidate: ${releasePath}`);
console.log(`[B34-A5] Fingerprint: ${fingerprint}`);
console.log('[B34-A5] PASS — validation and release gates are certified; production remains blocked.');
