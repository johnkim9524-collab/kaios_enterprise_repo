import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const legacyPaths = [
  '.github/workflows/kidults-collectaio-anchor-sold-probe-r1.yml',
  '.github/workflows/kidults-collectaio-anchor-sold-probe-r2.yml',
  '.github/workflows/kidults-collectaio-anchor-sold-probe-r3.yml',
  '.github/workflows/kidults-collectaio-shadow-sold-admission-r1.yml',
  '.github/workflows/kidults-owned-fabric-current-sold-lineage-r2.yml',
  '.github/workflows/kidults-owned-fabric-multicell-lineage-r2.yml',
  '.github/workflows/kidults-minimum-lawful-claim-profile-v1.yml',
  '.github/workflows/kidults-strict-current-market-admission-gate-v1.yml',
  '.github/workflows/kidults-single-provider-concentration-decision-v1.yml',
  'scripts/kidults/source/run-collectaio-anchor-sold-probe-r1.mjs',
  'scripts/kidults/source/run-collectaio-anchor-sold-probe-r2.mjs',
  'scripts/kidults/source/run-collectaio-anchor-sold-probe-r3.mjs',
  'scripts/kidults/source-intelligence/validate-collectaio-shadow-sold-admission-r1.mjs',
  'scripts/kidults/architecture/build-owned-fabric-current-sold-lineage-r2.mjs',
  'scripts/kidults/architecture/validate-owned-fabric-current-sold-lineage-r2.mjs',
  'scripts/kidults/architecture/build-owned-fabric-multicell-lineage-r2.mjs',
  'scripts/kidults/architecture/validate-owned-fabric-multicell-lineage-r2.mjs',
  'scripts/kidults/poc/validate-minimum-lawful-claim-profile-v1.mjs',
  'scripts/kidults/poc/validate-single-provider-concentration-decision-v1.mjs',
  'scripts/kidults/source-intelligence/validate-strict-current-market-admission-gate-v1.mjs'
];

const forbidden = [
  ['LIVE_PROVIDER_FETCH', /\bfetch\s*\(/],
  ['ARTIFACT_UPLOAD', /actions\/upload-artifact/i],
  ['RAW_EVENT_ARRAY', /\bbounded_sold_events\b/i],
  ['RAW_PROVIDER_RECORD_ID', /\bprovider_record_id\b/i],
  ['RAW_PRICE_FIELD', /\bprice\b/i],
  ['RAW_CURRENCY_FIELD', /\bcurrency\b/i],
  ['RAW_CONDITION_FIELD', /\bcondition\b/i],
  ['RAW_SOURCE_URL_FIELD', /\bsource_url\b/i],
  ['RAW_PROVIDER_TITLE_FIELD', /\btitle\b/i],
  ['RAW_JSON_LOGGING', /console\.log\s*\(\s*JSON\.stringify\s*\(/]
];

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const result = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const child = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...walk(child));
    else result.push(child);
  }
  return result;
}

export function assertSanitizedContent(relativePath, content) {
  for (const [code, pattern] of forbidden) {
    if (pattern.test(content)) throw new Error(code + ':' + relativePath);
  }
}

export function validatePublicOutputGuard(repoRoot = process.cwd()) {
  for (const relativePath of legacyPaths) {
    if (fs.existsSync(path.join(repoRoot, relativePath))) {
      throw new Error('LEGACY_PUBLIC_EXECUTION_PATH_PRESENT:' + relativePath);
    }
  }

  const scanRoots = [
    path.join(repoRoot, '.github', 'workflows'),
    path.join(repoRoot, 'scripts', 'kidults', 'source'),
    path.join(repoRoot, 'artifacts', 'kidults', 'source')
  ];
  for (const root of scanRoots) {
    for (const filePath of walk(root)) {
      const relativePath = path.relative(repoRoot, filePath).replaceAll(path.sep, '/');
      if (!relativePath.toLowerCase().includes('collectaio')) continue;
      assertSanitizedContent(relativePath, fs.readFileSync(filePath, 'utf8'));
    }
  }

  const revocation = JSON.parse(fs.readFileSync(path.join(repoRoot, 'coordination/kidults/source-intelligence/collectaio-exposure-revocation-v1.json'), 'utf8'));
  if (revocation.status !== 'ACTIVE_REVOCATION_AND_QUARANTINE') throw new Error('REVOCATION_STATUS_INVALID');
  if (revocation.public_ci_policy?.live_collectaio_provider_requests !== 'PROHIBITED') throw new Error('LIVE_PROVIDER_POLICY_NOT_BLOCKED');
  if (revocation.public_ci_policy?.provider_response_logging !== 'PROHIBITED') throw new Error('PUBLIC_LOGGING_POLICY_NOT_BLOCKED');
  if (revocation.public_ci_policy?.provider_response_artifact_upload !== 'PROHIBITED') throw new Error('PUBLIC_ARTIFACT_POLICY_NOT_BLOCKED');
  if (revocation.active_market_claim?.state !== 'NONE') throw new Error('ACTIVE_MARKET_CLAIM_NOT_REVOKED');
  if (revocation.production !== 'HOLD' || revocation.public_release !== 'HOLD') throw new Error('RELEASE_BOUNDARY_INVALID');
}

const invokedAsScript = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedAsScript) {
  validatePublicOutputGuard();
  console.log('KIDULTS_COLLECTAIO_PUBLIC_OUTPUT_GUARD_V1_PASS');
}
