import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DEFAULT_RIGHT_DATA = path.join(ROOT, 'reports', 'kidult100-right-data', 'right-data-latest.json');
const DEFAULT_SCARCITY_TRIAGE = path.join(ROOT, 'reports', 'kidult100-ranking', 'kidult100-scarcity-discovery-triage-latest.json');
const DEFAULT_OUT = path.join(ROOT, 'reports', 'kidult100-ranking', 'kidult100-right-data-coverage-leverage-latest.json');
const TARGET_RIGHT_DATA_COVERAGE = 0.9;

function readJsonInput(value, fallbackPath) {
  const raw = value == null || String(value).trim() === '' ? fallbackPath : String(value).trim();
  if (raw.startsWith('{') || raw.startsWith('[')) return JSON.parse(raw);
  const resolved = path.isAbsolute(raw) ? raw : path.join(ROOT, raw);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) throw new Error(`Missing JSON input: ${resolved}`);
  return JSON.parse(fs.readFileSync(resolved, 'utf8'));
}

function boundedCoverage(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 1 ? number : null;
}

function nonNegativeInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

const rightData = readJsonInput(process.env.KIDULTS_RIGHT_DATA_LEVERAGE_RIGHT_DATA_JSON, DEFAULT_RIGHT_DATA);
const scarcityTriage = readJsonInput(process.env.KIDULTS_RIGHT_DATA_LEVERAGE_SCARCITY_TRIAGE_JSON, DEFAULT_SCARCITY_TRIAGE);
const outputRaw = process.env.KIDULTS_RIGHT_DATA_LEVERAGE_OUTPUT || DEFAULT_OUT;
const outputPath = path.isAbsolute(outputRaw) ? outputRaw : path.join(ROOT, outputRaw);

if (rightData?.mode !== 'KIDULT100_RIGHT_DATA_ENRICHMENT') throw new Error('Invalid Right Data input mode');
if (scarcityTriage?.mode !== 'KIDULT100_SCARCITY_DISCOVERY_TRIAGE') throw new Error('Invalid scarcity triage input mode');
if (rightData?.claims?.syntheticMarketEvidenceUsed !== false || rightData?.claims?.estimatedTransactionEvidenceUsed !== false) throw new Error('Unsafe Right Data evidence state');
if (scarcityTriage?.claims?.scarcityEvidenceCreated !== false || scarcityTriage?.claims?.syntheticOrEstimatedQuantityCreated !== false || scarcityTriage?.claims?.rightsOrProvenanceRequirementsWeakened !== false || scarcityTriage?.claims?.conditionalCoverageProjectionIsNotCertifiedRightData !== true) throw new Error('Unsafe scarcity triage state');

const structuralErrors = [];
const semanticRelevantCandidates = nonNegativeInteger(rightData?.metrics?.semanticRelevantCandidates);
const currentRequiredRightDataCoverage = boundedCoverage(rightData?.metrics?.requiredRightDataCoverage);
const primitiveCoverageInput = rightData?.metrics?.primitiveCoverage;
const primitiveNames = primitiveCoverageInput && typeof primitiveCoverageInput === 'object' && !Array.isArray(primitiveCoverageInput)
  ? Object.keys(primitiveCoverageInput)
  : [];
const requiredPrimitiveCount = primitiveNames.length;
const scarcityDiscoveryReadyTargets = nonNegativeInteger(scarcityTriage?.metrics?.prioritizedTargets);
const scarcityDelta = boundedCoverage(scarcityTriage?.metrics?.conditionalMaxRequiredRightDataCoverageDelta);

if (!(semanticRelevantCandidates > 0)) structuralErrors.push('INVALID_RIGHT_DATA_RELEVANT_CANDIDATE_COUNT');
if (currentRequiredRightDataCoverage == null) structuralErrors.push('INVALID_RIGHT_DATA_REQUIRED_COVERAGE');
if (!(requiredPrimitiveCount > 0)) structuralErrors.push('INVALID_RIGHT_DATA_REQUIRED_PRIMITIVE_COUNT');
if (scarcityDiscoveryReadyTargets == null || scarcityDelta == null) structuralErrors.push('INVALID_SCARCITY_TRIAGE_LEVERAGE_METRICS');
if (Number(scarcityTriage?.metrics?.structuralErrorCount || 0) !== 0) structuralErrors.push('UPSTREAM_SCARCITY_TRIAGE_HAS_STRUCTURAL_ERRORS');

const primitiveCoverage = {};
for (const primitive of primitiveNames) {
  const coverage = boundedCoverage(primitiveCoverageInput[primitive]);
  if (coverage == null) structuralErrors.push(`INVALID_PRIMITIVE_COVERAGE:${primitive}`);
  primitiveCoverage[primitive] = coverage;
}

const validCoverages = Object.values(primitiveCoverage).filter((value) => value != null);
const recomputedRequiredCoverage = validCoverages.length === requiredPrimitiveCount && requiredPrimitiveCount > 0
  ? validCoverages.reduce((sum, value) => sum + value, 0) / requiredPrimitiveCount
  : null;
if (recomputedRequiredCoverage != null && currentRequiredRightDataCoverage != null && Math.abs(recomputedRequiredCoverage - currentRequiredRightDataCoverage) > 1e-9) {
  structuralErrors.push('RIGHT_DATA_COVERAGE_NOT_EQUAL_PRIMITIVE_MEAN');
}

const lanes = primitiveNames.map((primitive) => {
  const coverage = primitiveCoverage[primitive];
  const theoreticalDelta = coverage == null || requiredPrimitiveCount === 0 ? 0 : (1 - coverage) / requiredPrimitiveCount;
  const isMarket = primitive === 'TRANSACTION_PRICE_COMPARABLE' || primitive === 'LIQUIDITY';
  const isScarcity = primitive === 'SCARCITY';
  const isDemand = primitive === 'DEMAND_ATTENTION';
  const boundedInternalDelta = isScarcity
    ? Math.min(theoreticalDelta, scarcityDelta || 0)
    : isDemand
      ? theoreticalDelta
      : 0;
  const route = isMarket
    ? 'REAL_MARKET_EVIDENCE_REQUIRED_NO_AUTOMATIC_ROUTE'
    : isScarcity
      ? 'RIGHTS_QUALIFIED_SCARCITY_VERIFICATION_CHAIN'
      : isDemand
        ? 'AUTHORIZED_OPEN_RIGHTS_DEMAND_ENRICHMENT'
        : theoreticalDelta === 0
          ? 'NO_CURRENT_GAP'
          : 'NO_SAFE_AUTOMATIC_ROUTE_DECLARED';
  return {
    primitive,
    currentPrimitiveCoverage: coverage,
    missingPrimitiveCoverage: coverage == null ? null : 1 - coverage,
    theoreticalMaxRequiredRightDataCoverageDelta: theoreticalDelta,
    boundedSafeInternalRequiredRightDataCoverageDelta: boundedInternalDelta,
    route,
    realEvidenceRequired: theoreticalDelta > 0,
    automaticEvidenceQualificationAllowed: false,
    paidProviderProcurementRequested: false,
    unauthorizedScrapingRequested: false,
  };
});

const safeInternalLanes = lanes
  .filter((lane) => lane.boundedSafeInternalRequiredRightDataCoverageDelta > 0)
  .sort((a, b) => b.boundedSafeInternalRequiredRightDataCoverageDelta - a.boundedSafeInternalRequiredRightDataCoverageDelta || a.primitive.localeCompare(b.primitive));
const safeInternalConditionalDelta = safeInternalLanes.reduce((sum, lane) => sum + lane.boundedSafeInternalRequiredRightDataCoverageDelta, 0);
const safeInternalConditionalMaxCoverage = currentRequiredRightDataCoverage == null ? null : Math.min(1, currentRequiredRightDataCoverage + safeInternalConditionalDelta);
const remainingGapToTargetAfterSafeInternalLanes = safeInternalConditionalMaxCoverage == null ? null : Math.max(0, TARGET_RIGHT_DATA_COVERAGE - safeInternalConditionalMaxCoverage);
const nextSafeLane = safeInternalLanes[0]?.primitive || null;
const disposition = structuralErrors.length > 0
  ? 'FAIL_CLOSED_INVALID_RIGHT_DATA_LEVERAGE_INPUTS'
  : remainingGapToTargetAfterSafeInternalLanes > 0
    ? 'SAFE_INTERNAL_LANES_INSUFFICIENT_EXTERNAL_REAL_EVIDENCE_REMAINS_REQUIRED'
    : 'SAFE_INTERNAL_LANES_CONDITIONALLY_REACH_TARGET_NOT_CERTIFIED';

const report = {
  schemaVersion: '1.0.0',
  mode: 'KIDULT100_RIGHT_DATA_COVERAGE_LEVERAGE_ROUTER',
  generatedAt: new Date().toISOString(),
  targetRequiredRightDataCoverage: TARGET_RIGHT_DATA_COVERAGE,
  metrics: {
    semanticRelevantCandidates,
    requiredPrimitiveCount,
    currentRequiredRightDataCoverage,
    recomputedRequiredRightDataCoverage: recomputedRequiredCoverage,
    scarcityDiscoveryReadyTargets,
    safeInternalConditionalRequiredRightDataCoverageDelta: safeInternalConditionalDelta,
    safeInternalConditionalMaxRequiredRightDataCoverage: safeInternalConditionalMaxCoverage,
    remainingGapToNinetyPercentAfterSafeInternalLanes: remainingGapToTargetAfterSafeInternalLanes,
    nextSafeLane,
    structuralErrorCount: structuralErrors.length,
  },
  lanes,
  structuralErrors,
  disposition,
  claims: {
    planningOnly: true,
    conditionalProjectionIsNotEvidence: true,
    conditionalProjectionIsNotCertifiedRightData: true,
    evidenceProduced: false,
    productionScoreMutated: false,
    productionGateWeakened: false,
    syntheticOrEstimatedEvidenceCreated: false,
    paidProviderProcurementRequested: false,
    contractExecutionRequested: false,
    unauthorizedScrapingRequested: false,
    rightsOrProvenanceRequirementsWeakened: false,
    automaticEvidenceQualificationAllowed: false,
  },
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
console.log(`Right Data leverage router: current=${currentRequiredRightDataCoverage} safeInternalMax=${safeInternalConditionalMaxCoverage} remainingTo90=${remainingGapToTargetAfterSafeInternalLanes} nextSafeLane=${nextSafeLane}`);
console.log(`disposition=${disposition}`);
if (structuralErrors.length > 0) process.exitCode = 1;
