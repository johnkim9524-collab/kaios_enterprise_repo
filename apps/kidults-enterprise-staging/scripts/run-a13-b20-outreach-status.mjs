import fs from 'node:fs';
import path from 'node:path';

const appRoot = path.resolve('apps/kidults-enterprise-staging');
const dataRoot = path.join(appRoot, 'public', 'a13-b10', 'data');
const contract = JSON.parse(fs.readFileSync(path.join(dataRoot, 'provider-outreach.json'), 'utf8'));

const queue = contract.outreachQueue.map(item => {
  const evidence = Array.isArray(item.evidence) ? item.evidence : [];
  const evidenceComplete = contract.evidenceRequirements.every(type =>
    evidence.some(entry => entry.type === type && entry.status === 'verified')
  );
  const pilotReady = item.status === 'diligence' && evidenceComplete;
  return { ...item, evidenceCount: evidence.length, evidenceComplete, pilotReady };
});

const contacted = queue.filter(item => item.status !== 'not-contacted').length;
const responded = queue.filter(item => ['responded', 'diligence', 'pilot-approved'].includes(item.status)).length;
const pilotReady = queue.filter(item => item.pilotReady).length;
const rolesWithReadyCandidate = new Set(queue.filter(item => item.pilotReady).map(item => item.role));
const roleGate = contract.requiredRoles.every(role => rolesWithReadyCandidate.has(role));
const pilotManifestGate = contract.pilotApproval.approved === true
  && contract.pilotApproval.selectedCandidates.length === contract.requiredRoles.length;

const report = {
  release: 'A13-B20',
  environment: 'staging',
  evaluatedAt: new Date().toISOString(),
  status: roleGate && pilotManifestGate ? 'pilot-handoff-ready' : 'outreach-in-progress',
  productionPromotionAuthorized: false,
  totals: { queued: queue.length, contacted, responded, pilotReady },
  queue,
  gates: {
    outreachStarted: contacted > 0 ? 'passed' : 'blocked',
    responsesReceived: responded > 0 ? 'passed' : 'blocked',
    evidenceComplete: roleGate ? 'passed' : 'blocked',
    pilotManifest: pilotManifestGate ? 'passed' : 'blocked',
    productionAuthorization: 'blocked'
  },
  blockers: [
    contacted === 0 && 'No provider outreach has been recorded.',
    responded === 0 && 'No provider response has been recorded.',
    !roleGate && 'Each required role needs one evidence-complete candidate.',
    !pilotManifestGate && 'The pilot manifest is not explicitly approved.',
    'Explicit production release authorization remains false.'
  ].filter(Boolean)
};

const output = path.join(dataRoot, 'generated', 'provider-outreach-status.json');
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

console.log(`A13-B20 outreach status: ${report.status}.`);
console.log(`Contacted: ${contacted}/${queue.length}; responded: ${responded}; pilot-ready: ${pilotReady}.`);
console.log('Production promotion authorized: false.');
