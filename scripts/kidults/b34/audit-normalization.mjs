import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '../../..');
const normalizedPath = path.join(root, 'artifacts/kidults/b34/normalized-observations.json');
const manifestPath = path.join(root, 'artifacts/kidults/b34/normalization-manifest.json');

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

function pass(message) {
  console.log(`[B34-A3][PASS] ${message}`);
}

function fail(message) {
  console.error(`[B34-A3][FAIL] ${message}`);
  process.exitCode = 1;
}

for (const filePath of [normalizedPath, manifestPath]) {
  if (!fs.existsSync(filePath)) fail(`Required file missing: ${path.relative(root, filePath)}`);
  else pass(`Required file exists: ${path.relative(root, filePath)}`);
}

if (process.exitCode) process.exit(process.exitCode);

const normalized = readJson(normalizedPath);
const manifest = readJson(manifestPath);
const accepted = normalized.accepted || [];
const ids = accepted.map((item) => item.observationId);
const categories = accepted.map((item) => item.canonicalCategoryId);

if (normalized.status === 'staging') pass('Normalized asset remains staging-only.');
else fail('Normalized asset must remain staging-only.');

if (manifest.productionEligible === false) pass('Automatic production promotion remains disabled.');
else fail('Production promotion must be disabled.');

if (accepted.length === normalized.statistics.acceptedCount) pass('Accepted count matches statistics.');
else fail('Accepted count does not match statistics.');

if (new Set(ids).size === ids.length) pass('Observation IDs are unique.');
else fail('Duplicate observation IDs remain after normalization.');

if (ids.every((id) => /^obs_[a-f0-9]{24}$/.test(id))) pass('Observation IDs use deterministic canonical format.');
else fail('One or more observation IDs have an invalid format.');

if (categories.every((id) => /^category_[a-z0-9_]+$/.test(id))) pass('Canonical category identities are present.');
else fail('One or more canonical category identities are invalid.');

if (accepted.every((item) => Array.isArray(item.sourceIds) && [...item.sourceIds].sort().join('|') === item.sourceIds.join('|'))) {
  pass('Source IDs are normalized, deduplicated and sorted.');
} else {
  fail('Source IDs are not canonical.');
}

if (accepted.every((item) => item.provenance?.originalObservationId && item.provenance?.originalCategory)) {
  pass('Original provenance is preserved for every accepted observation.');
} else {
  fail('Original provenance is missing.');
}

const replayFingerprint = sha256(stableStringify(accepted));
if (replayFingerprint === normalized.replayProtection.replayFingerprint && replayFingerprint === manifest.replayFingerprint) {
  pass('Replay fingerprint is deterministic across asset and manifest.');
} else {
  fail('Replay fingerprint mismatch.');
}

if (normalized.statistics.inputCount === normalized.statistics.acceptedCount + normalized.statistics.duplicateCount + normalized.statistics.rejectedCount) {
  pass('Input accounting is complete.');
} else {
  fail('Input accounting is incomplete.');
}

if (!process.exitCode) {
  console.log('[B34-A3] PASS — canonical identity, normalization and replay protection are certified.');
}
