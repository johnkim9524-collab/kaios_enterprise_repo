import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '../../..');
const candidatePath = path.join(root, 'artifacts/kidults/b34/portal-integration/intelligence-data.candidate.json');
const livePath = path.join(root, 'apps/kidults-enterprise-staging/public/public-enterprise-preview/intelligence-data.json');
const backupDir = path.join(root, 'artifacts/kidults/b34/portal-integration/backups');
const approvalFlag = process.argv.includes('--approve');

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

if (!approvalFlag) {
  console.error('[B34-PROMOTE] BLOCKED — explicit --approve flag is required after manual visual approval.');
  process.exit(2);
}
if (!fs.existsSync(candidatePath)) throw new Error(`Missing candidate: ${candidatePath}`);
if (!fs.existsSync(livePath)) throw new Error(`Missing live asset: ${livePath}`);

const candidateBuffer = fs.readFileSync(candidatePath);
const candidate = JSON.parse(candidateBuffer.toString('utf8'));
if (candidate.status !== 'release-candidate') throw new Error('Candidate status is not release-candidate.');
if (candidate.governance?.productionEligible !== false) throw new Error('Candidate governance unexpectedly allows production.');

const liveBuffer = fs.readFileSync(livePath);
fs.mkdirSync(backupDir, { recursive: true });
const backupName = `intelligence-data.pre-b34-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
const backupPath = path.join(backupDir, backupName);
fs.writeFileSync(backupPath, liveBuffer);

const promoted = {
  ...candidate,
  status: 'staging',
  label: 'Illustrative staging data',
  governance: {
    ...candidate.governance,
    productionEligible: false,
    manuallyApprovedForPortal: true,
    promotedAt: new Date().toISOString()
  }
};
const promotedBuffer = Buffer.from(`${JSON.stringify(promoted, null, 2)}\n`, 'utf8');
fs.writeFileSync(livePath, promotedBuffer);

const reportPath = path.join(root, 'artifacts/kidults/b34/portal-integration/promotion-report.json');
fs.writeFileSync(reportPath, `${JSON.stringify({
  engineVersion: 'B34-PROMOTE-1',
  liveAsset: path.relative(root, livePath).replaceAll('\\', '/'),
  backup: path.relative(root, backupPath).replaceAll('\\', '/'),
  previousSha256: sha256(liveBuffer),
  promotedSha256: sha256(promotedBuffer),
  productionEligible: false,
  explicitApprovalFlag: true
}, null, 2)}\n`, 'utf8');

console.log(`[B34-PROMOTE] Backup created: ${backupPath}`);
console.log(`[B34-PROMOTE] Candidate promoted to staging portal asset: ${livePath}`);
console.log('[B34-PROMOTE] Production eligibility remains disabled.');
