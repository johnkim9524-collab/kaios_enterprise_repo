import fs from 'node:fs';
import path from 'node:path';

const appRoot = path.resolve('apps/kidults-enterprise-staging');
const dataRoot = path.join(appRoot, 'public', 'a13-b10', 'data');
const generatedRoot = path.join(dataRoot, 'generated');

const pack = JSON.parse(fs.readFileSync(path.join(dataRoot, 'provider-outreach-pack.json'), 'utf8'));
const intake = JSON.parse(fs.readFileSync(path.join(dataRoot, 'provider-response-intake.json'), 'utf8'));
const b20 = JSON.parse(fs.readFileSync(path.join(dataRoot, 'provider-outreach.json'), 'utf8'));

const responsesByCandidate = new Map((intake.responses || []).map(item => [item.candidateId, item]));

const queue = b20.outreachQueue.map(item => {
  const response = responsesByCandidate.get(item.candidateId) || null;
  const packItem = pack.packs.find(entry => entry.candidateId === item.candidateId) || null;
  const evidence = Array.isArray(response?.evidence) ? response.evidence : [];
  const verifiedTypes = new Set(evidence.filter(entry => entry.status === 'verified').map(entry => entry.type));
  const evidenceComplete = intake.requiredEvidence.every(type => verifiedTypes.has(type));
  const status = response?.status || item.status || 'not-contacted';
  const contacted = status !== 'not-contacted' && status !== 'draft';
  const responded = ['responded', 'diligence', 'pilot-approved'].includes(status);
  const pilotReady = status === 'diligence' && evidenceComplete;
  return {
    role: item.role,
    candidateId: item.candidateId,
    priority: item.priority,
    subject: packItem?.subject || '',
    request: packItem?.request || '',
    packStatus: packItem?.status || 'missing',
    status,
    contacted,
    responded,
    evidenceCount: evidence.length,
    verifiedEvidenceCount: verifiedTypes.size,
    evidenceComplete,
    pilotReady
  };
});

const contacted = queue.filter(item => item.contacted).length;
const responded = queue.filter(item => item.responded).length;
const pilotReady = queue.filter(item => item.pilotReady).length;
const readyRoles = new Set(queue.filter(item => item.pilotReady).map(item => item.role));
const roleGate = b20.requiredRoles.every(role => readyRoles.has(role));
const pilotManifestGate = b20.pilotApproval.approved === true
  && b20.pilotApproval.selectedCandidates.length === b20.requiredRoles.length;

const report = {
  release: 'A13-B21',
  environment: 'staging',
  evaluatedAt: new Date().toISOString(),
  status: roleGate && pilotManifestGate ? 'pilot-handoff-ready' : 'response-intake-open',
  productionPromotionAuthorized: false,
  totals: {
    packs: pack.packs.length,
    contacted,
    responded,
    pilotReady,
    verifiedEvidence: queue.reduce((sum, item) => sum + item.verifiedEvidenceCount, 0),
    requiredEvidencePerCandidate: intake.requiredEvidence.length
  },
  queue,
  gates: {
    outreachPackComplete: pack.packs.length === b20.outreachQueue.length ? 'passed' : 'blocked',
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

fs.mkdirSync(generatedRoot, { recursive: true });
fs.writeFileSync(path.join(generatedRoot, 'provider-response-intake-status.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');

console.log(`A13-B21 response intake: ${report.status}.`);
console.log(`Packs: ${report.totals.packs}; contacted: ${contacted}; responded: ${responded}; pilot-ready: ${pilotReady}.`);
console.log('Production promotion authorized: false.');
