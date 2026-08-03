import fs from 'node:fs';
import path from 'node:path';

const appRoot = path.resolve('apps/kidults-enterprise-staging');
const dataRoot = path.join(appRoot, 'public', 'a13-b10', 'data');
const dossier = JSON.parse(
  fs.readFileSync(path.join(dataRoot, 'provider-candidate-dossier.json'), 'utf8')
);

const roles = dossier.requiredRoles.map(role => {
  const candidates = dossier.candidates
    .filter(candidate => candidate.role === role)
    .sort((a, b) => a.pilotPriority - b.pilotPriority);

  return {
    role,
    candidateCount: candidates.length,
    primaryCandidate: candidates[0]
      ? {
          id: candidates[0].id,
          provider: candidates[0].provider,
          accessStatus: candidates[0].accessStatus,
          outreachAction: candidates[0].outreachAction
        }
      : null,
    candidates: candidates.map(candidate => ({
      id: candidate.id,
      provider: candidate.provider,
      accessStatus: candidate.accessStatus,
      commercialStatus: candidate.commercialStatus,
      rightsStatus: candidate.rightsStatus,
      pilotPriority: candidate.pilotPriority
    }))
  };
});

const coveragePassed = roles.every(role => role.candidateCount >= 2);
const unknownNumericFactsPreserved = dossier.candidates.every(candidate =>
  !Object.hasOwn(candidate, 'monthlyPilotCostUsd')
  && !Object.hasOwn(candidate, 'uptimePercent')
  && !Object.hasOwn(candidate, 'p95LatencyMs')
  && !Object.hasOwn(candidate, 'quotaPerDay')
);

const report = {
  release: 'A13-B19',
  environment: 'staging',
  evaluatedAt: new Date().toISOString(),
  status: coveragePassed && unknownNumericFactsPreserved
    ? 'candidate-shortlist-ready'
    : 'blocked',
  productionPromotionAuthorized: false,
  roleCoverage: roles,
  candidateCount: dossier.candidates.length,
  outreachRequired: dossier.candidates.filter(candidate =>
    candidate.commercialStatus.includes('required')
    || candidate.accessStatus.includes('restricted')
    || candidate.accessStatus.includes('alpha')
    || candidate.accessStatus.includes('no-new')
  ).length,
  gates: {
    roleCoverage: coveragePassed ? 'passed' : 'blocked',
    primarySourcePolicy: dossier.researchPolicy.primarySourcesRequired ? 'passed' : 'blocked',
    unknownValuesPreserved: unknownNumericFactsPreserved ? 'passed' : 'blocked',
    pilotApproval: 'blocked',
    productionAuthorization: 'blocked'
  },
  blockers: [
    'Provider commercial terms, service levels and rights require direct confirmation.',
    'No candidate is pilot-approved until outreach and due diligence are complete.',
    'Explicit production release authorization remains false.'
  ]
};

const output = path.join(dataRoot, 'generated', 'provider-shortlist.json');
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

console.log(`A13-B19 provider shortlist: ${report.status}.`);
console.log(`Candidates: ${report.candidateCount}; roles covered: ${roles.filter(role => role.candidateCount >= 2).length}/${roles.length}.`);
console.log('Production promotion authorized: false.');
