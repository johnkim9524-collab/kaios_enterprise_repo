import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const SCRIPT = path.join(ROOT, 'scripts', 'kidult100-scarcity-discovery-triage.mjs');

function policy() {
  return {
    policy: 'FAIL_CLOSED_SCARCITY_DISCOVERY_TRIAGE',
    requiredDiscoveryMode: 'KIDULT100_SCARCITY_SOURCE_DISCOVERY_PLAN',
    requiredPriorityMode: 'KIDULT100_NON_MARKET_EVIDENCE_ACQUISITION_PRIORITY',
    requiredRightDataMode: 'KIDULT100_RIGHT_DATA_ENRICHMENT',
    requiredDimension: 'SCARCITY',
    conditionalPrimitiveGainPerFullyVerifiedCandidate: 1,
    priorityOrder: ['ZERO_ELIGIBLE_SUPPLY_FIRST', 'LARGER_VERTICAL_OPERATIONAL_GAP_FIRST', 'EXISTING_DEMAND_AND_CANON_SUPPORT_FIRST', 'RIGHTS_CLASSIFIED_REFERENCE_CONTEXT_FIRST', 'CANDIDATE_KEY_STABLE_TIE_BREAK'],
    safety: {
      sourceDiscoveryPerformed: false,
      sourceFeasibilityProbabilityEstimated: false,
      sourceQualifiedAutomatically: false,
      scarcityEvidenceCreated: false,
      syntheticOrEstimatedQuantityCreated: false,
      searchSnippetAcceptedAsEvidence: false,
      unauthorizedScrapingRequested: false,
      paidProviderProcurementRequested: false,
      contractExecutionRequested: false,
      rightsOrProvenanceRequirementsWeakened: false,
      productionScoringActivated: false,
    },
  };
}

function discovery(workPackets = null) {
  return {
    mode: 'KIDULT100_SCARCITY_SOURCE_DISCOVERY_PLAN',
    safety: {
      syntheticOrEstimatedQuantityCreated: false,
      searchSnippetAcceptedAsEvidence: false,
      unauthorizedScrapingRequested: false,
      paidProviderProcurementRequested: false,
      contractExecutionRequested: false,
      productionScoringActivated: false,
    },
    workPackets: workPackets || [
      { candidateKey: 'c-a', canonicalTitle: 'A', vertical: 'v-zero', currentReference: { sourceClass: 'REFERENCE_PUBLIC_DATA', rightsClass: 'CC0', sourceUrl: 'https://example.test/a' } },
      { candidateKey: 'c-b', canonicalTitle: 'B', vertical: 'v-partial', currentReference: { sourceClass: null, rightsClass: null, sourceUrl: null } },
      { candidateKey: 'c-c', canonicalTitle: 'C', vertical: 'v-zero', currentReference: { sourceClass: 'REFERENCE_PUBLIC_DATA', rightsClass: 'CC0', sourceUrl: 'https://example.test/c' } },
    ],
  };
}

function priority() {
  return {
    mode: 'KIDULT100_NON_MARKET_EVIDENCE_ACQUISITION_PRIORITY',
    metrics: { structuralErrorCount: 0 },
    claims: {
      syntheticOrEstimatedEvidenceCreated: false,
      rightsOrProvenanceRequirementsWeakened: false,
      productionScoringActivated: false,
    },
    priorities: [
      { dimension: 'DEMAND_ATTENTION', vertical: 'v-zero', operationalReferenceGap: 0, calibrationEligibleCandidates: 25 },
      { dimension: 'SCARCITY', vertical: 'v-zero', operationalReferenceGap: 25, calibrationEligibleCandidates: 0 },
      { dimension: 'SCARCITY', vertical: 'v-partial', operationalReferenceGap: 22, calibrationEligibleCandidates: 3 },
    ],
  };
}

function rightData() {
  return {
    mode: 'KIDULT100_RIGHT_DATA_ENRICHMENT',
    claims: { syntheticMarketEvidenceUsed: false, estimatedTransactionEvidenceUsed: false },
    candidates: [
      { candidateKey: 'c-a', canonicalTitle: 'A', rightData: { primitives: ['DEMAND_ATTENTION', 'CANON_CULTURAL_STRENGTH'] } },
      { candidateKey: 'c-b', canonicalTitle: 'B', rightData: { primitives: ['CANON_CULTURAL_STRENGTH'] } },
      { candidateKey: 'c-c', canonicalTitle: 'C', rightData: { primitives: ['CANON_CULTURAL_STRENGTH'] } },
    ],
  };
}

function run(inputs, useFiles = false) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scarcity-triage-'));
  const out = path.join(dir, 'out.json');
  const env = { ...process.env, KIDULTS_SCARCITY_DISCOVERY_TRIAGE_OUTPUT: out };
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

function envInputs(p = policy(), d = discovery(), pri = priority(), rd = rightData()) {
  return {
    KIDULTS_SCARCITY_DISCOVERY_TRIAGE_POLICY_JSON: p,
    KIDULTS_SCARCITY_DISCOVERY_TRIAGE_DISCOVERY_JSON: d,
    KIDULTS_SCARCITY_DISCOVERY_TRIAGE_PRIORITY_JSON: pri,
    KIDULTS_SCARCITY_DISCOVERY_TRIAGE_RIGHT_DATA_JSON: rd,
  };
}

test('prioritizes zero-supply verticals and existing support without claiming source feasibility', () => {
  const { result, report } = run(envInputs(), true);
  assert.equal(result.status, 0);
  assert.equal(report.metrics.prioritizedTargets, 3);
  assert.equal(report.metrics.zeroEligibleSupplyTargets, 2);
  assert.equal(report.metrics.demandAndCanonSupportedTargets, 1);
  assert.equal(report.metrics.conditionalMaxScarcityPrimitiveGain, 3);
  assert.deepEqual(report.priorities.map((row) => row.candidateKey), ['c-a', 'c-c', 'c-b']);
  assert.equal(report.priorities[0].sourceFeasibility, 'UNASSESSED_REQUIRES_RIGHTS_QUALIFIED_DISCOVERY');
  assert.equal(report.priorities[0].qualificationStatus, 'NOT_QUALIFIED');
  assert.equal(report.claims.scarcityEvidenceCreated, false);
  assert.equal(report.claims.conditionalGainIsNotEvidence, true);
});

test('empty discovery produces a safe no-target result', () => {
  const { result, report } = run(envInputs(policy(), discovery([]), priority(), rightData()));
  assert.equal(result.status, 0);
  assert.equal(report.metrics.prioritizedTargets, 0);
  assert.equal(report.disposition, 'NO_DISCOVERY_READY_TARGETS');
});

test('duplicate or incomplete upstream identities fail closed deterministically', () => {
  const d = discovery([
    { candidateKey: 'c-a', vertical: 'v-zero', currentReference: {} },
    { candidateKey: 'c-a', vertical: 'v-zero', currentReference: {} },
    { candidateKey: 'missing-right-data', vertical: 'v-zero', currentReference: {} },
    { candidateKey: 'missing-vertical', vertical: 'unknown', currentReference: {} },
    { candidateKey: null, vertical: 'v-zero', currentReference: {} },
  ]);
  const pri = priority();
  pri.priorities.push({ dimension: 'SCARCITY', vertical: 'v-zero', operationalReferenceGap: 25, calibrationEligibleCandidates: 0 });
  const rd = rightData();
  rd.candidates.push({ candidateKey: 'c-a', rightData: { primitives: [] } }, { candidateKey: null, rightData: { primitives: [] } });
  const { result, report } = run(envInputs(policy(), d, pri, rd));
  assert.equal(result.status, 1);
  assert.ok(report.structuralErrors.some((x) => x.startsWith('DUPLICATE_SCARCITY_VERTICAL:')));
  assert.ok(report.structuralErrors.some((x) => x.startsWith('DUPLICATE_RIGHT_DATA_CANDIDATE:')));
  assert.ok(report.structuralErrors.includes('INVALID_RIGHT_DATA_CANDIDATE'));
  assert.ok(report.structuralErrors.some((x) => x.startsWith('DUPLICATE_DISCOVERY_CANDIDATE:')));
  assert.ok(report.structuralErrors.includes('INVALID_DISCOVERY_PACKET'));
  assert.ok(report.structuralErrors.some((x) => x.startsWith('MISSING_RIGHT_DATA_CANDIDATE:')));
  assert.ok(report.structuralErrors.some((x) => x.startsWith('MISSING_SCARCITY_VERTICAL:')));
  assert.equal(report.disposition, 'FAIL_CLOSED_INVALID_SCARCITY_DISCOVERY_TRIAGE');
});

test('unsafe modes policies metrics and claims are rejected before triage', () => {
  const cases = [];
  cases.push(envInputs({ ...policy(), policy: 'WRONG' }, discovery(), priority(), rightData()));
  cases.push(envInputs(policy(), { ...discovery(), mode: 'WRONG' }, priority(), rightData()));
  cases.push(envInputs(policy(), discovery(), { ...priority(), mode: 'WRONG' }, rightData()));
  cases.push(envInputs(policy(), discovery(), priority(), { ...rightData(), mode: 'WRONG' }));
  cases.push(envInputs({ ...policy(), requiredDimension: 'DEMAND_ATTENTION' }, discovery(), priority(), rightData()));
  cases.push(envInputs({ ...policy(), conditionalPrimitiveGainPerFullyVerifiedCandidate: 2 }, discovery(), priority(), rightData()));
  const unsafePolicy = policy(); unsafePolicy.safety.productionScoringActivated = true;
  cases.push(envInputs(unsafePolicy, discovery(), priority(), rightData()));
  const unsafeDiscovery = discovery(); unsafeDiscovery.safety.searchSnippetAcceptedAsEvidence = true;
  cases.push(envInputs(policy(), unsafeDiscovery, priority(), rightData()));
  const badMetrics = priority(); badMetrics.metrics.structuralErrorCount = 1;
  cases.push(envInputs(policy(), discovery(), badMetrics, rightData()));
  const badPriorityClaims = priority(); badPriorityClaims.claims.rightsOrProvenanceRequirementsWeakened = true;
  cases.push(envInputs(policy(), discovery(), badPriorityClaims, rightData()));
  const badRightData = rightData(); badRightData.claims.syntheticMarketEvidenceUsed = true;
  cases.push(envInputs(policy(), discovery(), priority(), badRightData));
  for (const inputs of cases) {
    const { result, report } = run(inputs);
    assert.equal(result.status, 1);
    assert.equal(report, null);
  }
});

test('invalid scarcity cell metrics are reported fail-closed rather than estimated', () => {
  const pri = priority();
  pri.priorities = [{ dimension: 'SCARCITY', vertical: '', operationalReferenceGap: 25, calibrationEligibleCandidates: 0 }, { dimension: 'SCARCITY', vertical: 'v-zero', operationalReferenceGap: -1, calibrationEligibleCandidates: 'x' }];
  const { result, report } = run(envInputs(policy(), discovery([{ candidateKey: 'c-a', vertical: 'v-zero', currentReference: {} }]), pri, rightData()));
  assert.equal(result.status, 1);
  assert.ok(report.structuralErrors.includes('INVALID_SCARCITY_VERTICAL'));
  assert.ok(report.structuralErrors.includes('INVALID_SCARCITY_CELL_METRICS:v-zero'));
});
