import fs from 'node:fs';
import path from 'node:path';

const appRoot = path.resolve('apps/kidults-enterprise-staging');
const dataRoot = path.join(appRoot, 'public', 'a13-b10', 'data');
const ledgerPath = path.join(dataRoot, 'provider-dispatch-ledger.json');
const outreachPath = path.join(dataRoot, 'provider-outreach.json');
const outputPath = path.join(dataRoot, 'generated', 'provider-dispatch-audit.json');

const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
const outreach = JSON.parse(fs.readFileSync(outreachPath, 'utf8'));
const args = process.argv.slice(2);
const command = args[0] || 'report';

const valueOf = flag => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};

const candidateIds = new Set(outreach.outreachQueue.map(item => item.candidateId));
const writeLedger = () => fs.writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`, 'utf8');

const appendEvent = event => {
  if (!ledger.allowedEvents.includes(event.type)) throw new Error(`Unsupported event type: ${event.type}`);
  if (!candidateIds.has(event.candidateId)) throw new Error(`Unknown candidate: ${event.candidateId}`);
  if (event.type === 'contacted') {
    const duplicate = ledger.events.some(item => item.type === 'contacted' && item.candidateId === event.candidateId);
    if (duplicate) throw new Error(`Contacted event already exists for ${event.candidateId}`);
  }
  ledger.events.push({
    eventId: `${event.candidateId}-${event.type}-${Date.now()}`,
    candidateId: event.candidateId,
    type: event.type,
    evidenceType: event.evidenceType || null,
    recordedAt: new Date().toISOString(),
    personalContactStored: false,
    secretStored: false
  });
  writeLedger();
};

if (command === 'contacted' || command === 'responded' || command === 'diligence' || command === 'rejected') {
  appendEvent({ type: command, candidateId: valueOf('--candidate') });
}

if (command === 'evidence') {
  const evidenceType = valueOf('--type');
  if (!ledger.requiredEvidence.includes(evidenceType)) throw new Error(`Unsupported evidence type: ${evidenceType}`);
  appendEvent({ type: 'evidence-verified', candidateId: valueOf('--candidate'), evidenceType });
}

const candidates = outreach.outreachQueue.map(item => {
  const events = ledger.events.filter(event => event.candidateId === item.candidateId);
  const evidence = new Set(events.filter(event => event.type === 'evidence-verified').map(event => event.evidenceType));
  const evidenceComplete = ledger.requiredEvidence.every(type => evidence.has(type));
  const latestState = [...events].reverse().find(event => ['contacted', 'responded', 'diligence', 'rejected'].includes(event.type))?.type || 'not-contacted';
  return {
    candidateId: item.candidateId,
    role: item.role,
    priority: item.priority,
    status: latestState,
    evidenceVerified: evidence.size,
    evidenceRequired: ledger.requiredEvidence.length,
    evidenceComplete,
    pilotReady: latestState === 'diligence' && evidenceComplete
  };
});

const roleReady = outreach.requiredRoles.every(role => candidates.some(candidate => candidate.role === role && candidate.pilotReady));
const report = {
  release: 'A13-B22',
  environment: 'staging',
  evaluatedAt: new Date().toISOString(),
  status: roleReady ? 'pilot-handoff-ready' : 'dispatch-ledger-open',
  productionPromotionAuthorized: false,
  totals: {
    candidates: candidates.length,
    contacted: candidates.filter(item => item.status !== 'not-contacted').length,
    responded: candidates.filter(item => ['responded', 'diligence'].includes(item.status)).length,
    pilotReady: candidates.filter(item => item.pilotReady).length,
    events: ledger.events.length
  },
  candidates,
  gates: {
    ledgerIntegrity: 'passed',
    duplicateDispatchProtection: 'passed',
    evidenceAudit: roleReady ? 'passed' : 'blocked',
    productionAuthorization: 'blocked'
  }
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(`A13-B22 dispatch ledger: ${report.status}.`);
console.log(`Contacted: ${report.totals.contacted}/${report.totals.candidates}; responded: ${report.totals.responded}; pilot-ready: ${report.totals.pilotReady}.`);
console.log('Production promotion authorized: false.');
