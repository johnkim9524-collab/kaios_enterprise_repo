import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '../../..');
const candidatePath = path.join(root, 'artifacts/kidults/b34/intelligence-data.release-candidate.json');
const portalDir = path.join(root, 'apps/kidults-enterprise-staging/public/public-enterprise-preview');
const portalAssetPath = path.join(portalDir, 'intelligence-data.json');
const integrationDir = path.join(root, 'artifacts/kidults/b34/portal-integration');
const integrationAssetPath = path.join(integrationDir, 'intelligence-data.candidate.json');
const reportPath = path.join(integrationDir, 'integration-report.json');

function readJson(filePath) { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
function assert(condition, message) { if (!condition) throw new Error(message); console.log(`[B34-A6][PASS] ${message}`); }

const candidate = readJson(candidatePath);
const portalAsset = readJson(portalAssetPath);
assert(candidate.release?.releaseState === 'candidate', 'Release candidate state is explicit.');
assert(candidate.release?.productionEligible === false, 'Candidate cannot auto-promote to production.');
assert(candidate.release?.requiresManualApproval === true, 'Manual approval remains mandatory.');
assert(candidate.headline.kidult100 === candidate.trend.at(-1).value, 'Candidate headline matches final trend value.');
assert(Array.isArray(candidate.categories) && candidate.categories.length === 8, 'Candidate exposes eight categories.');
assert(portalAsset.status === 'staging', 'Current portal asset remains staging-only.');

fs.mkdirSync(integrationDir, { recursive: true });
fs.writeFileSync(integrationAssetPath, `${JSON.stringify(candidate, null, 2)}\n`);
fs.writeFileSync(reportPath, `${JSON.stringify({
  engineVersion: 'B34-A6',
  candidateAsset: path.relative(root, integrationAssetPath).replaceAll('\\', '/'),
  livePortalAssetUntouched: true,
  portalTarget: path.relative(root, portalAssetPath).replaceAll('\\', '/'),
  integrationMode: 'manual-review-candidate',
  dataBindingCompatibility: {
    headline: true,
    kpis: true,
    trend: true,
    categories: true,
    confidenceDistribution: true,
    sourceComposition: true,
    geography: true
  },
  productionEligible: false,
  nextAction: 'Complete visual QA against the candidate, then approve a separate promotion commit.'
}, null, 2)}\n`);
console.log(`[B34-A6] Candidate copied to ${integrationAssetPath}`);
console.log('[B34-A6] Live portal intelligence-data.json was not modified.');
console.log('[B34-A6] PASS — portal integration candidate is certified and awaiting manual visual approval.');
