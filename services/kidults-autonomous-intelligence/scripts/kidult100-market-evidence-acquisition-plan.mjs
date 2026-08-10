import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

function parseJsonSource(value, fallbackPath, label) {
  const source = value || fallbackPath;
  const trimmed = String(source || '').trim();
  if (!trimmed) throw new Error(`Missing ${label}`);
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return JSON.parse(trimmed);
  const resolved = path.isAbsolute(trimmed) ? trimmed : path.join(ROOT, trimmed);
  if (!fs.existsSync(resolved)) throw new Error(`Missing ${label}: ${resolved}`);
  return JSON.parse(fs.readFileSync(resolved, 'utf8'));
}

const requirements = parseJsonSource(
  process.env.KIDULTS_ACQUISITION_REQUIREMENTS_JSON,
  path.join('config', 'kidult100-market-evidence-requirements.json'),
  'market evidence requirements',
);
const poc = parseJsonSource(
  process.env.KIDULTS_ACQUISITION_POC_JSON,
  path.join('reports', 'kidult100-poc', 'kidult100-poc-latest.json'),
  'candidate report',
);
const validated = parseJsonSource(
  process.env.KIDULTS_ACQUISITION_VALIDATED_EVIDENCE_JSON,
  path.join('reports', 'kidult100-right-data', 'validated-provider-evidence-latest.json'),
  'validated provider evidence',
);

const verticalRequirements = Array.isArray(requirements.verticals) ? requirements.verticals : [];
const requiredIds = new Set(verticalRequirements.map((row) => row.id));
if (requiredIds.size !== 8) throw new Error(`Expected 8 market-evidence vertical requirements, got ${requiredIds.size}`);

const relevantCandidates = (poc.candidates || []).filter((candidate) => candidate.semanticRelevant && requiredIds.has(candidate.vertical));
const candidateByKey = new Map(relevantCandidates.map((candidate) => [candidate.candidateKey, candidate]));
const evidence = Array.isArray(validated.evidence) ? validated.evidence : [];
const evidenceByCandidate = new Map();
for (const row of evidence) {
  if (!candidateByKey.has(row.candidateKey)) continue;
  const list = evidenceByCandidate.get(row.candidateKey) || [];
  list.push(row);
  evidenceByCandidate.set(row.candidateKey, list);
}

function candidateMarketState(candidate) {
  const rows = evidenceByCandidate.get(candidate.candidateKey) || [];
  const transactionIds = new Set();
  let hasTransactionComparable = false;
  let hasLiquidity = false;
  for (const row of rows) {
    if (row.primitive === 'TRANSACTION_PRICE_COMPARABLE') {
      hasTransactionComparable = true;
      if (row.value?.transactionId) transactionIds.add(String(row.value.transactionId));
    }
    if (row.primitive === 'LIQUIDITY') {
      hasLiquidity = true;
      for (const id of row.value?.supportingTransactionIds || []) transactionIds.add(String(id));
    }
  }
  return {
    candidateKey: candidate.candidateKey,
    hasTransactionComparable,
    hasLiquidity,
    marketEvidencePresent: hasTransactionComparable && hasLiquidity,
    verifiedCompletedTransactionIds: [...transactionIds],
  };
}

const verticalPlans = verticalRequirements.map((requirement) => {
  const candidates = relevantCandidates.filter((candidate) => candidate.vertical === requirement.id);
  const states = candidates.map(candidateMarketState);
  const minimumCoverage = Number(requirement.minimumCoverage ?? requirements.global?.minimumCandidateCoverage ?? 0.9);
  const minimumTransactions = Number(requirement.minimumCompletedTransactionsPerCandidate ?? requirements.global?.minimumCompletedTransactionsForLiquidity ?? 2);
  if (!(minimumCoverage > 0 && minimumCoverage <= 1)) throw new Error(`Invalid minimumCoverage for ${requirement.id}`);
  if (!(minimumTransactions >= 2)) throw new Error(`Invalid minimumCompletedTransactionsPerCandidate for ${requirement.id}`);

  const targetCandidates = Math.ceil(candidates.length * minimumCoverage);
  const ordered = [...states].sort((a, b) => {
    const aScore = (a.marketEvidencePresent ? 1000 : 0) + a.verifiedCompletedTransactionIds.length;
    const bScore = (b.marketEvidencePresent ? 1000 : 0) + b.verifiedCompletedTransactionIds.length;
    return bScore - aScore || a.candidateKey.localeCompare(b.candidateKey);
  });
  const targetSet = ordered.slice(0, targetCandidates);
  const currentMarketCoveredCandidates = states.filter((state) => state.marketEvidencePresent).length;
  const currentTransactionComparableCandidates = states.filter((state) => state.hasTransactionComparable).length;
  const currentLiquidityCandidates = states.filter((state) => state.hasLiquidity).length;
  const completedTransactionFloor = targetCandidates * minimumTransactions;
  const verifiedTransactionsInTargetSet = targetSet.reduce(
    (sum, state) => sum + Math.min(minimumTransactions, state.verifiedCompletedTransactionIds.length),
    0,
  );

  return {
    vertical: requirement.id,
    relevantCandidates: candidates.length,
    minimumCoverage,
    targetCandidates,
    currentTransactionComparableCandidates,
    currentLiquidityCandidates,
    currentMarketCoveredCandidates,
    candidateCoverageGap: Math.max(0, targetCandidates - currentMarketCoveredCandidates),
    minimumCompletedTransactionsPerCandidate: minimumTransactions,
    completedTransactionFloor,
    verifiedTransactionsInTargetSet,
    remainingCompletedTransactionFloor: Math.max(0, completedTransactionFloor - verifiedTransactionsInTargetSet),
    liquidityObservationTarget: targetCandidates,
    remainingLiquidityObservationFloor: Math.max(0, targetCandidates - currentLiquidityCandidates),
    selectedCandidateKeysForMinimumAcquisitionFloor: targetSet.map((state) => state.candidateKey),
  };
});

const totals = verticalPlans.reduce((acc, row) => {
  acc.relevantCandidates += row.relevantCandidates;
  acc.targetCandidates += row.targetCandidates;
  acc.currentMarketCoveredCandidates += row.currentMarketCoveredCandidates;
  acc.candidateCoverageGap += row.candidateCoverageGap;
  acc.completedTransactionFloor += row.completedTransactionFloor;
  acc.verifiedTransactionsInTargetSet += row.verifiedTransactionsInTargetSet;
  acc.remainingCompletedTransactionFloor += row.remainingCompletedTransactionFloor;
  acc.liquidityObservationTarget += row.liquidityObservationTarget;
  acc.remainingLiquidityObservationFloor += row.remainingLiquidityObservationFloor;
  return acc;
}, {
  relevantCandidates: 0,
  targetCandidates: 0,
  currentMarketCoveredCandidates: 0,
  candidateCoverageGap: 0,
  completedTransactionFloor: 0,
  verifiedTransactionsInTargetSet: 0,
  remainingCompletedTransactionFloor: 0,
  liquidityObservationTarget: 0,
  remainingLiquidityObservationFloor: 0,
});

const report = {
  schemaVersion: '1.0.0',
  mode: 'KIDULT100_MARKET_EVIDENCE_ACQUISITION_PLAN',
  generatedAt: new Date().toISOString(),
  policy: requirements.policy,
  methodology: {
    candidateTarget: 'ceil(relevantCandidates * vertical.minimumCoverage)',
    completedTransactionFloor: 'targetCandidates * minimumCompletedTransactionsPerCandidate',
    currentEvidenceSource: 'validated-provider-evidence-latest.json only',
    candidateSelection: 'existing complete market evidence first, then highest verified transaction support, then candidateKey',
    claimsLiveEvidence: false,
    lowersProductionGate: false,
  },
  totals,
  verticalPlans,
  disposition: totals.candidateCoverageGap === 0 && totals.remainingCompletedTransactionFloor === 0 && totals.remainingLiquidityObservationFloor === 0
    ? 'ACQUISITION_FLOOR_MET'
    : 'EXTERNAL_MARKET_EVIDENCE_REQUIRED',
  claims: {
    marketEvidenceCertified: false,
    providerProcured: false,
    syntheticEvidenceUsed: false,
    estimatedEvidenceUsed: false,
  },
};

const out = process.env.KIDULTS_MARKET_ACQUISITION_PLAN_OUTPUT
  ? path.resolve(ROOT, process.env.KIDULTS_MARKET_ACQUISITION_PLAN_OUTPUT)
  : path.join(ROOT, 'reports', 'kidult100-right-data', 'market-evidence-acquisition-plan-latest.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(report, null, 2));

console.log(`Market evidence acquisition plan: relevant=${totals.relevantCandidates} target=${totals.targetCandidates} covered=${totals.currentMarketCoveredCandidates}`);
console.log(`completedTransactionFloor=${totals.completedTransactionFloor} remaining=${totals.remainingCompletedTransactionFloor} liquidityRemaining=${totals.remainingLiquidityObservationFloor}`);
console.log(`disposition=${report.disposition}`);
