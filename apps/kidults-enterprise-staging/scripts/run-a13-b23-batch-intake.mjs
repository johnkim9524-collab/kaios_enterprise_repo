import fs from 'node:fs';
import path from 'node:path';

const appRoot = path.resolve('apps/kidults-enterprise-staging');
const dataRoot = path.join(appRoot, 'public', 'a13-b10', 'data');
const ledgerPath = path.join(dataRoot, 'provider-dispatch-ledger.json');
const outreachPath = path.join(dataRoot, 'provider-outreach.json');
const intakePath = path.join(dataRoot, 'provider-batch-intake.json');
const outputPath = path.join(dataRoot, 'generated', 'provider-batch-progress.json');

const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
const outreach = JSON.parse(fs.readFileSync(outreachPath, 'utf8'));
const intake = JSON.parse(fs.readFileSync(intakePath, 'utf8'));

const contactedIds = new Set(
  ledger.events
    .filter(event => event.type === 'contacted')
    .map(event => event.candidateId)
);

const remainingDispatches = outreach.outreachQueue
  .filter(item => !contactedIds.has(item.candidateId))
  .map(item => ({
    candidateId: item.candidateId,
    role: item.role,
    priority: item.priority,
    status: 'awaiting-explicit-confirmation'
  }));

const evidenceByCandidate = new Map();
for (const item of intake.responseImports) {
  if (!evidenceByCandidate.has(item.candidateId)) evidenceByCandidate.set(item.candidateId, new Set());
  if (item.status === 'verified' && intake.requiredEvidence.includes(item.type)) {
    evidenceByCandidate.get(item.candidateId).add(item.type);
  }
}

const candidates = outreach.outreachQueue.map(item => {
  const evidence = evidenceByCandidate.get(item.candidateId) || new Set();
  const evidenceComplete = intake.requiredEvidence.every(type => evidence.has(type));
  const latestState = [...ledger.events]
    .reverse()
    .find(event => event.candidateId === item.candidateId && ['contacted', 'responded', 'diligence', 'rejected'].includes(event.type))?.type || 'not-contacted';

  return {
    candidateId: item.candidateId,
    role: item.role,
    priority: item.priority,
    status: latestState,
    evidenceVerified: evidence.size,
    evidenceRequired: intake.requiredEvidence.length,
    evidenceComplete,
    pilotReady: latestState === 'diligence' && evidenceComplete
  };
});

const readyRoles = new Set(candidates.filter(item => item.pilotReady).map(item => item.role));
const roleCoverageComplete = outreach.requiredRoles.every(role => readyRoles.has(role));

const report = {
  release: 'A13-B23',
  environment: 'staging',
  evaluatedAt: new Date().toISOString(),
  status: roleCoverageComplete ? 'pilot-handoff-ready' : 'batch-intake-open',
  productionPromotionAuthorized: false,
  totals: {
    candidates: candidates.length,
    contacted: contactedIds.size,
    remainingDispatches: remainingDispatches.length,
    responseImports: intake.responseImports.length,
    pilotReady: candidates.filter(item => item.pilotReady).length
  },
  remainingDispatches,
  candidates,
  gates: {
    dispatchBatchPrepared: remainingDispatches.length >= 0 ? 'passed' : 'blocked',
    explicitConfirmationRequired: intake.dispatchPolicy.explicitConfirmationRequired ? 'passed' : 'blocked',
    evidenceValidation: roleCoverageComplete ? 'passed' : 'blocked',
    productionAuthorization: 'blocked'
  }
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

console.log(`A13-B23 batch intake: ${report.status}.`);
console.log(`Contacted: ${report.totals.contacted}/${report.totals.candidates}; remaining: ${report.totals.remainingDispatches}; pilot-ready: ${report.totals.pilotReady}.`);
console.log('Production promotion authorized: false.');
