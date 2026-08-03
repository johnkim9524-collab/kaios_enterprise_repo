import fs from 'node:fs';
import path from 'node:path';

const appRoot = path.resolve('apps/kidults-enterprise-staging');
const dataRoot = path.join(appRoot, 'public', 'a13-b10', 'data');
const contract = JSON.parse(fs.readFileSync(path.join(dataRoot, 'provider-acquisition.json'), 'utf8'));

const weightedScore = candidate => {
  const weights = contract.scoreWeights;
  return Math.round(Object.entries(weights).reduce((sum, [key, weight]) => {
    return sum + Number(candidate.scores?.[key] || 0) * weight;
  }, 0) * 10) / 10;
};

const candidates = contract.candidates.map(candidate => {
  const score = weightedScore(candidate);
  const thresholds = contract.pilotThresholds;
  const rightsPassed = candidate.rights?.productionUseApproved === true
    && candidate.rights?.evidenceRetentionApproved === true;
  const technicalPassed = Number(candidate.uptimePercent || 0) >= thresholds.minimumUptimePercent
    && Number(candidate.p95LatencyMs || Infinity) <= thresholds.maximumP95LatencyMs
    && Number(candidate.quotaPerDay || 0) >= thresholds.minimumQuotaPerDay;
  const commercialPassed = Number(candidate.monthlyPilotCostUsd || Infinity) <= thresholds.maximumMonthlyPilotCostUsd;

  return {
    ...candidate,
    score,
    gates: {
      score: score >= contract.minimumPassingScore ? 'passed' : 'blocked',
      rights: rightsPassed ? 'passed' : 'blocked',
      technical: technicalPassed ? 'passed' : 'blocked',
      commercial: commercialPassed ? 'passed' : 'blocked'
    },
    pilotReady: score >= contract.minimumPassingScore && rightsPassed && technicalPassed && commercialPassed
  };
});

const selected = contract.requiredRoles.map(role => {
  return candidates
    .filter(candidate => candidate.role === role && candidate.pilotReady)
    .sort((a, b) => b.score - a.score)[0] || null;
}).filter(Boolean);

const roleCoveragePassed = selected.length === contract.requiredRoles.length;
const independentFamilies = new Set(selected.map(candidate => candidate.family)).size;
const familyGate = independentFamilies >= contract.minimumIndependentProviderFamilies;
const pilotManifestPassed = contract.pilot.approved === true
  && contract.pilot.selectedProviders.length === contract.requiredRoles.length;

const report = {
  release: 'A13-B18',
  environment: 'staging',
  evaluatedAt: new Date().toISOString(),
  status: roleCoveragePassed && familyGate && pilotManifestPassed ? 'live-pilot-ready' : 'blocked',
  productionPromotionAuthorized: false,
  candidates,
  selectedProviders: selected.map(candidate => ({ id: candidate.id, role: candidate.role, family: candidate.family, score: candidate.score })),
  independentProviderFamilies: independentFamilies,
  gates: {
    roleCoverage: roleCoveragePassed ? 'passed' : 'blocked',
    independentFamilies: familyGate ? 'passed' : 'blocked',
    commercialReview: selected.every(candidate => candidate.gates.commercial === 'passed') && selected.length > 0 ? 'passed' : 'blocked',
    rightsReview: selected.every(candidate => candidate.gates.rights === 'passed') && selected.length > 0 ? 'passed' : 'blocked',
    technicalReview: selected.every(candidate => candidate.gates.technical === 'passed') && selected.length > 0 ? 'passed' : 'blocked',
    pilotManifest: pilotManifestPassed ? 'passed' : 'blocked',
    productionAuthorization: 'blocked'
  },
  blockers: [
    !roleCoveragePassed && 'One or more required provider roles have no pilot-ready candidate.',
    !familyGate && 'Independent provider-family minimum is not met.',
    !pilotManifestPassed && 'The live pilot manifest is not explicitly approved.',
    'Explicit production release authorization remains false.'
  ].filter(Boolean)
};

const output = path.join(dataRoot, 'generated', 'live-pilot-readiness.json');
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

console.log(`A13-B18 live pilot readiness: ${report.status}.`);
console.log(`Selected providers: ${report.selectedProviders.length}/${contract.requiredRoles.length}.`);
console.log('Production promotion authorized: false.');
