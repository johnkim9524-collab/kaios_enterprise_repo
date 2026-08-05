import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '../../..');
const candidatePath = path.join(root, 'artifacts/kidults/b34/portal-integration/intelligence-data.candidate.json');
const previewPath = path.join(root, 'apps/kidults-enterprise-staging/public/public-enterprise-preview/intelligence-data.preview.json');
const manifestPath = path.join(root, 'artifacts/kidults/b34/portal-integration/preview-manifest.json');

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

if (!fs.existsSync(candidatePath)) {
  throw new Error(`Missing portal candidate: ${candidatePath}`);
}

const candidate = fs.readFileSync(candidatePath);
const parsed = JSON.parse(candidate.toString('utf8'));

if (parsed.status !== 'release-candidate') {
  throw new Error(`Expected release-candidate status, received: ${parsed.status}`);
}
if (parsed.governance?.productionEligible !== false) {
  throw new Error('Preview preparation blocked: productionEligible must remain false.');
}

fs.mkdirSync(path.dirname(previewPath), { recursive: true });
fs.copyFileSync(candidatePath, previewPath);
fs.writeFileSync(manifestPath, `${JSON.stringify({
  engineVersion: 'B34-PREVIEW-1',
  candidate: path.relative(root, candidatePath).replaceAll('\\', '/'),
  previewAsset: path.relative(root, previewPath).replaceAll('\\', '/'),
  sha256: sha256(candidate),
  query: '?data=preview',
  productionModified: false,
  manualApprovalRequired: true
}, null, 2)}\n`, 'utf8');

console.log(`[B34-PREVIEW] Copied candidate to ${previewPath}`);
console.log('[B34-PREVIEW] Open: http://127.0.0.1:4190/public-enterprise-preview/?data=preview');
console.log('[B34-PREVIEW] Live intelligence-data.json was not modified.');
