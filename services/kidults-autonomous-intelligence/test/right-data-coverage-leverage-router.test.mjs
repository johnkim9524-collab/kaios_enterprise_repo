import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const SCRIPT = path.join(ROOT, 'scripts', 'kidult100-right-data-coverage-leverage-router.mjs');

function rightData() {
  return {
    mode: 'KIDULT100_RIGHT_DATA_ENRICHMENT',
    metrics: {
      semanticRelevantCandidates: 4,
      requiredRightDataCoverage: 4.75 / 7,
      primitiveCoverage: {
        IDENTITY: 1,
        SCARCITY: 0.25,
        TRANSACTION_PRICE_COMPARABLE: 0,
        LIQUIDITY: 0,
        DEMAND_ATTENTION: 0.5,
        CANON_CULTURAL_STRENGTH: 1,
        RISK_CONFIDENCE: 1,
      },
    },
    claims: { syntheticMarketEvidenceUsed: false, estimatedTransactionEvidenceUsed: false },
  };
}

function scarcityTriage() {
  return {
    mode: 'KIDULT100_SCARCITY_DISCOVERY_TRIAGE',
    metrics: {
      prioritizedTargets: 2,
      conditionalMaxRequiredRightDataCoverageDelta: 2 / 28,
      structuralErrorCount: 0,
    },
    claims: {
      scarcityEvidenceCreated: false,
      syntheticOrEstimatedQuantityCreated: false,
      rightsOrProvenanceRequirementsWeakened: false,
      conditionalCoverageProjectionIsNotCertifiedRightData: true,
    },
  };
}

function run(rd = rightData(), scarcity = scarcityTriage(), useFiles = false) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'right-data-leverage-'));
  const out = path.join(dir, 'out.json');
  const env = { ...process.env, KIDULTS_RIGHT_DATA_LEVERAGE_OUTPUT: out };
  const inputs = {
    KIDULTS_RIGHT_DATA_LEVERAGE_RIGHT_DATA_JSON: rd,
    KIDULTS_RIGHT_DATA_LEVERAGE_SCARCITY_TRIAGE_JSON: scarcity,
  };
  for (const [name, value] of Object.entries(inputs)) {
    if (useFiles) {
      const file = path.join(dir, `${name}.json`);
      fs.writeFileSync(file, JSON.stringify(value));
      env[name] = file;
    } else {
      env[name] = JSON.stringify(value);
    }
  }
  const result = spawnSync(process.execPath, [SCRIPT], { cwd: ROOT, encoding: 'utf8', env });
  const report = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : null;
  fs.rmSync(dir, { recursive: true, force: true });
  return { result, report };
}

test('routes bounded safe internal leverage without creating or certifying evidence', () => {
  const { result, report } = run(rightData(), scarcityTriage(), true);
  assert.equal(result.status, 0);
  assert.equal(report.schemaVersion, '1.0.0');
  assert.equal(report.metrics.semanticRelevantCandidates, 4);
  assert.equal(report.metrics.requiredPrimitiveCount, 7);
  assert.equal(report.metrics.currentRequiredRightDataCoverage, 4.75 / 7);
  assert.equal(report.metrics.recomputedRequiredRightDataCoverage, 4.75 / 7);
  assert.equal(report.metrics.scarcityDiscoveryReadyTargets, 2);
  assert.equal(report.metrics.safeInternalConditionalRequiredRightDataCoverageDelta, (2 / 28) + (0.5 / 7));
  assert.equal(report.metrics.nextSafeLane, 'DEMAND_ATTENTION');
  assert.ok(report.metrics.remainingGapToNinetyPercentAfterSafeInternalLanes > 0);
  assert.equal(report.disposition, 'SAFE_INTERNAL_LANES_INSUFFICIENT_EXTERNAL_REAL_EVIDENCE_REMAINS_REQUIRED');

  const lanes = Object.fromEntries(report.lanes.map((lane) => [lane.primitive, lane]));
  assert.equal(lanes.DEMAND_ATTENTION.route, 'AUTHORIZED_OPEN_RIGHTS_DEMAND_ENRICHMENT');
  assert.equal(lanes.SCARCITY.route, 'RIGHTS_QUALIFIED_SCARCITY_VERIFICATION_CHAIN');
  assert.equal(lanes.SCARCITY.boundedSafeInternalRequiredRightDataCoverageDelta, 2 / 28);
  assert.equal(lanes.TRANSACTION_PRICE_COMPARABLE.route, 'REAL_MARKET_EVIDENCE_REQUIRED_NO_AUTOMATIC_ROUTE');
  assert.equal(lanes.LIQUIDITY.route, 'REAL_MARKET_EVIDENCE_REQUIRED_NO_AUTOMATIC_ROUTE');
  assert.equal(lanes.IDENTITY.route, 'NO_CURRENT_GAP');
  assert.equal(report.claims.planningOnly, true);
  assert.equal(report.claims.evidenceProduced, false);
  assert.equal(report.claims.productionGateWeakened, false);
  assert.equal(report.claims.syntheticOrEstimatedEvidenceCreated, false);
  assert.equal(report.claims.paidProviderProcurementRequested, false);
  assert.equal(report.claims.unauthorizedScrapingRequested, false);
  assert.equal(report.claims.rightsOrProvenanceRequirementsWeakened, false);
});

test('declares no safe automatic route for an uncovered non-market primitive and may conditionally reach target without certification', () => {
  const rd = rightData();
  rd.metrics.primitiveCoverage.IDENTITY = 0.5;
  rd.metrics.DUMMY = undefined;
  rd.metrics.requiredRightDataCoverage = (0.5 + 0.25 + 0 + 0 + 1 + 1 + 1) / 7;
  rd.metrics.primitiveCoverage.DEMAND_ATTENTION = 1;
  const scarcity = scarcityTriage();
  scarcity.metrics.conditionalMaxRequiredRightDataCoverageDelta = 1;
  const { result, report } = run(rd, scarcity);
  assert.equal(result.status, 0);
  const identity = report.lanes.find((lane) => lane.primitive === 'IDENTITY');
  assert.equal(identity.route, 'NO_SAFE_AUTOMATIC_ROUTE_DECLARED');
  assert.equal(identity.boundedSafeInternalRequiredRightDataCoverageDelta, 0);
  assert.equal(report.claims.conditionalProjectionIsNotCertifiedRightData, true);
});

test('fails closed on invalid modes claims coverage metrics and upstream structural errors', () => {
  const cases = [];
  cases.push([{ ...rightData(), mode: 'WRONG' }, scarcityTriage(), false]);
  cases.push([rightData(), { ...scarcityTriage(), mode: 'WRONG' }, false]);
  const unsafeRd = rightData(); unsafeRd.claims.syntheticMarketEvidenceUsed = true;
  cases.push([unsafeRd, scarcityTriage(), false]);
  const unsafeScarcity = scarcityTriage(); unsafeScarcity.claims.scarcityEvidenceCreated = true;
  cases.push([rightData(), unsafeScarcity, false]);
  for (const [rd, scarcity] of cases) {
    const { result, report } = run(rd, scarcity);
    assert.equal(result.status, 1);
    assert.equal(report, null);
  }

  const invalidRd = rightData();
  invalidRd.metrics.semanticRelevantCandidates = 0;
  invalidRd.metrics.requiredRightDataCoverage = 2;
  invalidRd.metrics.primitiveCoverage.SCARCITY = 2;
  const invalidScarcity = scarcityTriage();
  invalidScarcity.metrics.prioritizedTargets = -1;
  invalidScarcity.metrics.conditionalMaxRequiredRightDataCoverageDelta = 2;
  invalidScarcity.metrics.structuralErrorCount = 1;
  const { result, report } = run(invalidRd, invalidScarcity);
  assert.equal(result.status, 1);
  assert.ok(report.structuralErrors.includes('INVALID_RIGHT_DATA_RELEVANT_CANDIDATE_COUNT'));
  assert.ok(report.structuralErrors.includes('INVALID_RIGHT_DATA_REQUIRED_COVERAGE'));
  assert.ok(report.structuralErrors.includes('INVALID_SCARCITY_TRIAGE_LEVERAGE_METRICS'));
  assert.ok(report.structuralErrors.includes('UPSTREAM_SCARCITY_TRIAGE_HAS_STRUCTURAL_ERRORS'));
  assert.ok(report.structuralErrors.includes('INVALID_PRIMITIVE_COVERAGE:SCARCITY'));
  assert.equal(report.disposition, 'FAIL_CLOSED_INVALID_RIGHT_DATA_LEVERAGE_INPUTS');
});

test('fails closed when reported Right Data coverage is not the primitive coverage mean', () => {
  const rd = rightData();
  rd.metrics.requiredRightDataCoverage = 0.1;
  const { result, report } = run(rd, scarcityTriage());
  assert.equal(result.status, 1);
  assert.ok(report.structuralErrors.includes('RIGHT_DATA_COVERAGE_NOT_EQUAL_PRIMITIVE_MEAN'));
});
