import fs from 'node:fs';
import path from 'node:path';

const appRoot = path.resolve('apps/kidults-enterprise-staging');
const dataRoot = path.join(appRoot, 'public', 'a13-b10', 'data');
const sourceRoot = path.join(dataRoot, 'sources');
const publicDataRoot = path.join(appRoot, 'public', 'data');

const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const writeJson = (file, value) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};

const round = value => Math.round(value * 10) / 10;
const now = new Date().toISOString();

const methodology = readJson(path.join(dataRoot, 'kidult-100-methodology.json'));
const activation = readJson(path.join(dataRoot, 'integrated-activation.json'));
const sources = [
  readJson(path.join(sourceRoot, 'transactions.json')),
  readJson(path.join(sourceRoot, 'supply.json')),
  readJson(path.join(sourceRoot, 'cultural-demand.json'))
];

const requiredRoles = activation.workstreams.sourceOnboarding.requiredRoles;
const registeredRoles = new Set(sources.map(source => source.role));
const rightsComplete = sources.every(source => source.rights?.status && source.provenance?.provider);

const categories = [...new Set(sources.flatMap(source => source.records.map(record => record.category)))];
const scored = categories.map(category => {
  const evidence = sources
    .map(source => ({ source, record: source.records.find(record => record.category === category) }))
    .filter(item => item.record);

  const merged = Object.assign({}, ...evidence.map(item => item.record));
  const roles = evidence.map(item => item.source.role);
  const missingRoles = requiredRoles.filter(role => !roles.includes(role));
  const confidenceValues = evidence.map(item => Number(item.record.confidence || 0));
  const anomalyValues = evidence.map(item => Number(item.record.anomalyRate || 0));
  const confidence = confidenceValues.length
    ? confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length
    : 0;
  const anomalyRate = anomalyValues.length
    ? anomalyValues.reduce((sum, value) => sum + value, 0) / anomalyValues.length
    : 1;

  let weighted = 0;
  for (const [metric, weight] of Object.entries(methodology.weights)) {
    const value = metric === 'confidence' ? confidence : Number(merged[metric] || 0);
    weighted += value * weight;
  }

  const penalty = missingRoles.length * methodology.penalties.missingRole
    + anomalyRate * methodology.penalties.anomalyMultiplier;
  const score = Math.max(0, Math.min(100, round(weighted - penalty)));
  const regime = methodology.bands.find(band => score >= band.min)?.label || 'Fragile';

  return {
    category,
    score,
    regime,
    confidence: round(confidence),
    anomalyRate: round(anomalyRate),
    evidenceRoles: roles,
    missingRoles,
    metrics: merged
  };
}).sort((a, b) => b.score - a.score);

const healthyFamilies = new Set(sources.map(source => source.family)).size;
const sourceGate = requiredRoles.every(role => registeredRoles.has(role))
  && healthyFamilies >= activation.workstreams.sourceOnboarding.minimumIndependentHealthyFamilies
  && rightsComplete;
const scoringGate = scored.length > 0
  && scored.every(item => item.evidenceRoles.length >= methodology.minimumEvidenceRoles);

const indexOutput = {
  release: 'A13-B14',
  engine: methodology.engine,
  methodVersion: methodology.methodVersion,
  generatedAt: now,
  deterministic: true,
  sourceFamilies: healthyFamilies,
  categories: scored
};

const leaders = scored.slice(0, 3);
const averageConfidence = round(scored.reduce((sum, item) => sum + item.confidence, 0) / Math.max(scored.length, 1));
const monthlyOutput = {
  release: 'A13-B14',
  issue: now.slice(0, 7),
  status: 'generated-staging',
  generatedAt: now,
  title: `Monthly Intelligence ${now.slice(0, 7)}`,
  executiveSummary: leaders.length
    ? `${leaders[0].category} leads the current evidence set with a Kidult 100 score of ${leaders[0].score}.`
    : 'No qualified category evidence is available.',
  categoryLeaders: leaders,
  riskWatch: scored.filter(item => item.anomalyRate >= 0.07 || item.missingRoles.length > 0),
  averageConfidence
};

const archiveFile = path.join(publicDataRoot, 'archive.json');
const existingArchive = fs.existsSync(archiveFile)
  ? readJson(archiveFile)
  : { version: '1.0', status: 'active', reports: [] };
const reportId = `monthly-intelligence-${monthlyOutput.issue}`;
const reports = [
  ...existingArchive.reports.filter(report => report.id !== reportId),
  {
    id: reportId,
    title: monthlyOutput.title,
    type: 'monthly-intelligence',
    period: monthlyOutput.issue,
    status: 'generated-staging',
    path: '/a13-b10/data/generated/monthly-intelligence.json',
    generatedAt: now
  }
];

const reportGate = Boolean(monthlyOutput.executiveSummary && reports.some(report => report.id === reportId));
const certificationGate = sourceGate && scoringGate && reportGate;
const readiness = {
  release: 'A13-B14',
  environment: 'staging',
  evaluatedAt: now,
  productionPromotionAuthorized: false,
  status: certificationGate ? 'staging-certified' : 'blocked',
  gates: {
    sources: sourceGate ? 'passed' : 'blocked',
    aggregation: scored.length ? 'passed' : 'blocked',
    scoring: scoringGate ? 'passed' : 'blocked',
    monthlyReport: reportGate ? 'passed' : 'blocked',
    certification: certificationGate ? 'passed' : 'blocked'
  },
  blockers: [
    !sourceGate && 'Source roles, rights or independent family requirements are incomplete.',
    !scoringGate && 'Scoring evidence minimums are incomplete.',
    !reportGate && 'Monthly report or archive registration is incomplete.',
    'Production promotion requires explicit external source rights certification.'
  ].filter(Boolean)
};

writeJson(path.join(dataRoot, 'generated', 'kidult-100.json'), indexOutput);
writeJson(path.join(dataRoot, 'generated', 'monthly-intelligence.json'), monthlyOutput);
writeJson(path.join(dataRoot, 'generated', 'readiness.json'), readiness);
writeJson(archiveFile, { ...existingArchive, updated_at: now, reports });

console.log(`A13-B14 pipeline completed: ${scored.length} categories, ${healthyFamilies} source families.`);
console.log(`Readiness: ${readiness.status}; production promotion authorized: false.`);
