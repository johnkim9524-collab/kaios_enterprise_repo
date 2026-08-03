import fs from 'node:fs';
import path from 'node:path';

const appRoot = path.resolve('apps/kidults-enterprise-staging');
const dataRoot = path.join(appRoot, 'public', 'a13-b10', 'data');
const outputRoot = path.join(dataRoot, 'generated', 'manual-dispatch');

const pack = JSON.parse(fs.readFileSync(path.join(dataRoot, 'provider-outreach-pack.json'), 'utf8'));
const ledger = JSON.parse(fs.readFileSync(path.join(dataRoot, 'provider-dispatch-ledger.json'), 'utf8'));
const contract = JSON.parse(fs.readFileSync(path.join(dataRoot, 'provider-manual-dispatch.json'), 'utf8'));

const contacted = new Set(
  ledger.events
    .filter(event => event.type === 'contacted')
    .map(event => event.candidateId)
);

const pendingPacks = pack.packs.filter(item => !contacted.has(item.candidateId));
const confirmations = new Map(contract.confirmations.map(item => [item.candidateId, item]));

fs.mkdirSync(outputRoot, { recursive: true });

const exports = pendingPacks.map(item => {
  const confirmation = confirmations.get(item.candidateId);
  const checklist = contract.reviewChecklist.map(key => ({
    key,
    passed: Boolean(confirmation?.checklist?.includes(key))
  }));
  const reviewComplete = checklist.every(item => item.passed);
  const contactedCommand = reviewComplete && confirmation?.dispatched === true
    ? `node apps/kidults-enterprise-staging/scripts/run-a13-b22-dispatch-ledger.mjs contacted --candidate ${item.candidateId}`
    : null;

  const markdown = [
    `# ${item.subject}`,
    '',
    `Candidate: ${item.candidateId}`,
    `Role: ${item.role}`,
    '',
    '## Request',
    item.request,
    '',
    '## Required diligence questions',
    ...pack.questionnaire.map(question => `- ${question}`),
    '',
    '## Operator checklist',
    ...checklist.map(entry => `- [${entry.passed ? 'x' : ' '}] ${entry.key}`),
    '',
    'No recipient address, personal contact detail or secret is stored in this packet.'
  ].join('\n');

  const fileName = `${item.candidateId}.md`;
  fs.writeFileSync(path.join(outputRoot, fileName), `${markdown}\n`, 'utf8');

  return {
    candidateId: item.candidateId,
    role: item.role,
    subject: item.subject,
    exportFile: `manual-dispatch/${fileName}`,
    reviewComplete,
    dispatched: confirmation?.dispatched === true,
    contactedCommand
  };
});

const report = {
  release: 'A13-B24',
  environment: 'staging',
  evaluatedAt: new Date().toISOString(),
  status: exports.every(item => item.reviewComplete) ? 'dispatch-packets-reviewed' : 'dispatch-packets-ready',
  productionPromotionAuthorized: false,
  totals: {
    pending: exports.length,
    reviewComplete: exports.filter(item => item.reviewComplete).length,
    dispatchedConfirmed: exports.filter(item => item.dispatched).length,
    contactedCommandsReady: exports.filter(item => item.contactedCommand).length
  },
  exports,
  gates: {
    packetExport: exports.length >= 0 ? 'passed' : 'blocked',
    operatorReview: exports.every(item => item.reviewComplete) ? 'passed' : 'blocked',
    explicitConfirmation: exports.every(item => item.dispatched) ? 'passed' : 'blocked',
    productionAuthorization: 'blocked'
  }
};

fs.writeFileSync(
  path.join(dataRoot, 'generated', 'provider-manual-dispatch-status.json'),
  `${JSON.stringify(report, null, 2)}\n`,
  'utf8'
);

console.log(`A13-B24 manual dispatch export: ${report.status}.`);
console.log(`Pending: ${report.totals.pending}; reviewed: ${report.totals.reviewComplete}; confirmed: ${report.totals.dispatchedConfirmed}.`);
console.log('Production promotion authorized: false.');
