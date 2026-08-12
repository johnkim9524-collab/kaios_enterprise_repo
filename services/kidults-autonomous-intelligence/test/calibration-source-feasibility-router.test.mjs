import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const ROOT = process.cwd();
const SCRIPT = path.join(ROOT, 'scripts', 'kidult100-calibration-source-feasibility-router.mjs');

function packetsReport({ packets = [], cells = [], shortfall = 0, claims = {} } = {}) {
  return {
    mode: 'KIDULT100_CALIBRATION_DISCOVERY_WORK_PACKETS',
    metrics: { structuralErrorCount: 0, discoveryPackets: packets.length, totalUnfilledCandidateSupplyGap: shortfall },
    packets,
    cellResults: cells,
    claims: {
      newEvidenceCreated: false,
      normalizedScoresGenerated: false,
      sourceQualificationImplied: false,
      sourceFeasibilityClaimed: false,
      syntheticOrEstimatedEvidenceCreated: false,
      unauthorizedScrapingRequested: false,
      providerProcurementRequested: false,
      contractsOrPaidCommitmentsRequested: false,
      authorizationBypassRequested: false,
      rightsOrProvenanceRequirementsWeakened: false,
      productionScoringActivated: false,
      calibrationSufficiencyCertified: false,
      outOfSampleValidationCertified: false,
      ...claims,
    },
  };
}

function packet(id, candidateKey, dimension, vertical, allowedSignalTypes) {
  return { packetId: id, candidateKey, dimension, vertical, allowedSignalTypes };
}

function cell(dimension, vertical, gap) {
  return { dimension, vertical, unfilledCandidateSupplyGap: gap };
}

function rightData(relevant = 199) {
  return { mode: 'KIDULT100_RIGHT_DATA_ENRICHMENT', metrics: { semanticRelevantCandidates: relevant } };
}

function scarcity(qualified = 0, overrides = {}) {
  return {
    mode: 'KIDULT100_SCARCITY_SOURCE_QUALIFICATION_MATRIX',
    metrics: { structuralErrors: 0, automaticallyQualifiedSources: qualified },
    sourceContract: {
      requiredSignalType: 'TOTAL_PRODUCED',
      commercialReuseRightsRequired: true,
      provenanceRequired: true,
      automatedAccessDocumentationRequired: true,
    },
    safety: {
      syntheticOrEstimatedEvidenceCreated: false,
      inferredScarcityCreated: false,
      unauthorizedScrapingRequested: false,
      paidProviderProcurementRequested: false,
      contractExecutionRequested: false,
      productionScoringActivated: false,
    },
    ...overrides,
  };
}

function demand(evidence = [], overrides = {}) {
  return {
    mode: 'KIDULT100_WIKIMEDIA_ANALYTICS_DEMAND_EVIDENCE',
    source: {
      id: 'wikimedia-analytics',
      license: 'CC0-1.0',
      unauthorizedScrapingAllowed: false,
      paidProviderRequired: false,
    },
    claims: {
      rightsClassifiedInputs: true,
      provenanceRecorded: true,
      normalizedScoresGenerated: false,
      marketDemandClaimed: false,
      transactionOrLiquidityClaimed: false,
      syntheticOrEstimatedEvidenceUsed: false,
      unauthorizedScrapingUsed: false,
      paidProviderUsed: false,
    },
    evidence,
    ...overrides,
  };
}

function run(inputs, options = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'calibration-feasibility-'));
  const out = path.join(dir, 'out.json');
  const env = { ...process.env, KIDULTS_CALIBRATION_FEASIBILITY_OUTPUT: out };

  if (options.useFiles) {
    const fileInputs = {
      KIDULTS_CALIBRATION_FEASIBILITY_PACKETS_JSON: inputs.packets,
      KIDULTS_CALIBRATION_FEASIBILITY_RIGHT_DATA_JSON: inputs.rightData,
      KIDULTS_CALIBRATION_FEASIBILITY_SCARCITY_JSON: inputs.scarcity,
      KIDULTS_CALIBRATION_FEASIBILITY_DEMAND_JSON: inputs.demand,
    };
    for (const [name, value] of Object.entries(fileInputs)) {
      const inputPath = path.join(dir, `${name.toLowerCase()}.json`);
      fs.writeFileSync(inputPath, JSON.stringify(value));
      env[name] = inputPath;
    }
  } else {
    env.KIDULTS_CALIBRATION_FEASIBILITY_PACKETS_JSON = options.packetsRaw ?? JSON.stringify(inputs.packets);
    env.KIDULTS_CALIBRATION_FEASIBILITY_RIGHT_DATA_JSON = JSON.stringify(inputs.rightData);
    env.KIDULTS_CALIBRATION_FEASIBILITY_SCARCITY_JSON = JSON.stringify(inputs.scarcity);
    env.KIDULTS_CALIBRATION_FEASIBILITY_DEMAND_JSON = JSON.stringify(inputs.demand);
  }

  const result = spawnSync(process.execPath, [SCRIPT], { cwd: ROOT, encoding: 'utf8', env });
  const report = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : null;
  fs.rmSync(dir, { recursive: true, force: true });
  return { result, report };
}

test('routes current scarcity and demand bottlenecks while deriving candidate-universe lower bounds without creating evidence', () => {
  const packets = [
    packet('p1', 'c1', 'SCARCITY', 'toys-models', ['TOTAL_PRODUCED']),
    packet('p2', 'c2', 'SCARCITY', 'watches-jewelry', ['TOTAL_PRODUCED']),
    packet('p3', 'c3', 'DEMAND_ATTENTION', 'toys-models', ['CULTURAL_ATTENTION_PROXY']),
  ];
  const cells = [
    cell('SCARCITY', 'toys-models', 2),
    cell('DEMAND_ATTENTION', 'toys-models', 2),
    cell('CANON_CULTURAL_STRENGTH', 'toys-models', 2),
    cell('SCARCITY', 'watches-jewelry', 1),
    cell('DEMAND_ATTENTION', 'watches-jewelry', 1),
    cell('CANON_CULTURAL_STRENGTH', 'watches-jewelry', 1),
  ];
  const { result, report } = run({
    packets: packetsReport({ packets, cells, shortfall: 9 }),
    rightData: rightData(199),
    scarcity: scarcity(0),
    demand: demand([]),
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(report.metrics.packets, 3);
  assert.equal(report.metrics.rightsQualifiedSourceDiscoveryPackets, 2);
  assert.equal(report.metrics.openPathCurrentSignalUnresolvedPackets, 1);
  assert.equal(report.metrics.evidenceUnitCandidateSupplyShortfall, 9);
  assert.equal(report.metrics.conditionalMinimumNetNewForOperationalReference, 3);
  assert.equal(report.metrics.minimumNetNewForProductionUniverse, 101);
  assert.equal(report.metrics.minimumCombinedNetNewRelevantCandidates, 101);
  assert.equal(report.metrics.additionalCandidatesBeyondVerticalFloor, 98);
  assert.equal(report.packetRoutes[0].sourceQualifiedForEvidenceCollection, false);
  assert.equal(report.claims.newEvidenceCreated, false);
  assert.equal(report.claims.unauthorizedScrapingRequested, false);
  assert.equal(report.disposition, 'SOURCE_FEASIBILITY_AND_CANDIDATE_UNIVERSE_EXPANSION_REQUIRED');
});

test('a demand packet that already has current eligible evidence is stale and fails closed', () => {
  const packets = [packet('p1', 'c1', 'DEMAND_ATTENTION', 'toys-models', ['CULTURAL_ATTENTION_PROXY'])];
  const cells = [cell('DEMAND_ATTENTION', 'toys-models', 0)];
  const currentEvidence = [{ candidateKey: 'c1', primitive: 'DEMAND_ATTENTION' }];
  const { result, report } = run({
    packets: packetsReport({ packets, cells, shortfall: 0 }),
    rightData: rightData(300),
    scarcity: scarcity(0),
    demand: demand(currentEvidence),
  });
  assert.notEqual(result.status, 0);
  assert.ok(report.structuralErrors.includes('DEMAND_PACKET_ALREADY_HAS_CURRENT_ELIGIBLE_EVIDENCE:c1'));
  assert.equal(report.disposition, 'FAIL_CLOSED_INVALID_CALIBRATION_SOURCE_FEASIBILITY_STATE');
});

test('qualified scarcity source presence never auto-qualifies a candidate packet', () => {
  const packets = [packet('p1', 'c1', 'SCARCITY', 'toys-models', ['TOTAL_PRODUCED'])];
  const cells = [cell('SCARCITY', 'toys-models', 0)];
  const { result, report } = run({
    packets: packetsReport({ packets, cells, shortfall: 0 }),
    rightData: rightData(300),
    scarcity: scarcity(1),
    demand: demand([]),
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(report.packetRoutes[0].sourceFeasibilityStatus, 'QUALIFIED_SCARCITY_SOURCE_EXISTS_PACKET_MATCH_UNPROVEN');
  assert.equal(report.packetRoutes[0].sourceQualifiedForEvidenceCollection, false);
  assert.equal(report.claims.sourceQualificationFabricated, false);
  assert.equal(report.disposition, 'NO_OPEN_CALIBRATION_SOURCE_FEASIBILITY_GAP_DETECTED');
});

test('zero universe gap with unresolved official-open demand path keeps source-feasibility work open', () => {
  const packets = [packet('p1', 'c1', 'DEMAND_ATTENTION', 'technology-cameras', ['CULTURAL_ATTENTION_PROXY'])];
  const cells = [cell('DEMAND_ATTENTION', 'technology-cameras', 0)];
  const { result, report } = run({
    packets: packetsReport({ packets, cells, shortfall: 0 }),
    rightData: rightData(300),
    scarcity: scarcity(0),
    demand: demand([]),
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(report.metrics.minimumCombinedNetNewRelevantCandidates, 0);
  assert.equal(report.metrics.openPathCurrentSignalUnresolvedPackets, 1);
  assert.equal(report.disposition, 'SOURCE_FEASIBILITY_WORK_REMAINS_REQUIRED');
});

test('invalid scarcity qualified-source count fails closed without inventing packet readiness', () => {
  const packets = [packet('p1', 'c1', 'SCARCITY', 'toys-models', ['TOTAL_PRODUCED'])];
  const cells = [cell('SCARCITY', 'toys-models', 0)];
  const invalidScarcity = scarcity(0);
  invalidScarcity.metrics.automaticallyQualifiedSources = 'not-an-integer';
  const { result, report } = run({
    packets: packetsReport({ packets, cells, shortfall: 0 }),
    rightData: rightData(300),
    scarcity: invalidScarcity,
    demand: demand([]),
  });
  assert.notEqual(result.status, 0);
  assert.ok(report.structuralErrors.includes('INVALID_SCARCITY_QUALIFIED_SOURCE_COUNT'));
  assert.equal(report.packetRoutes[0].sourceFeasibilityStatus, 'FAIL_CLOSED_INVALID_SCARCITY_SOURCE_STATE');
  assert.equal(report.packetRoutes[0].sourceQualifiedForEvidenceCollection, false);
});

test('successful JSON file inputs preserve the same deterministic planning result', () => {
  const packets = [packet('p1', 'c1', 'SCARCITY', 'toys-models', ['TOTAL_PRODUCED'])];
  const cells = [cell('SCARCITY', 'toys-models', 1)];
  const inputs = {
    packets: packetsReport({ packets, cells, shortfall: 1 }),
    rightData: rightData(299),
    scarcity: scarcity(0),
    demand: demand([]),
  };
  const inline = run(inputs);
  const fileBased = run(inputs, { useFiles: true });
  assert.equal(inline.result.status, 0, inline.result.stderr || inline.result.stdout);
  assert.equal(fileBased.result.status, 0, fileBased.result.stderr || fileBased.result.stdout);
  assert.equal(fileBased.report.metrics.minimumNetNewForProductionUniverse, 1);
  assert.equal(fileBased.report.metrics.conditionalMinimumNetNewForOperationalReference, 1);
  assert.equal(fileBased.report.disposition, inline.report.disposition);
  assert.equal(fileBased.report.claims.newEvidenceCreated, false);
});

test('duplicate and malformed packet or cell identities remain fail closed', () => {
  const packets = [
    packet('dup', 'c1', 'SCARCITY', 'toys-models', ['TOTAL_PRODUCED']),
    packet('dup', 'c2', 'SCARCITY', 'toys-models', ['TOTAL_PRODUCED']),
    packet('', 'c3', 'SCARCITY', 'toys-models', ['TOTAL_PRODUCED']),
  ];
  const cells = [
    { dimension: '', vertical: 'toys-models', unfilledCandidateSupplyGap: 0 },
    { dimension: 'SCARCITY', vertical: '', unfilledCandidateSupplyGap: 0 },
    { dimension: 'SCARCITY', vertical: 'watches-jewelry', unfilledCandidateSupplyGap: 'bad' },
  ];
  const { result, report } = run({
    packets: packetsReport({ packets, cells, shortfall: 0 }),
    rightData: rightData(300),
    scarcity: scarcity(0),
    demand: demand([]),
  });
  assert.notEqual(result.status, 0);
  assert.ok(report.structuralErrors.includes('DUPLICATE_PACKET_ID:dup'));
  assert.ok(report.structuralErrors.includes('INVALID_PACKET_IDENTITY'));
  assert.ok(report.structuralErrors.some((code) => code.startsWith('INVALID_CELL_SHORTFALL:')));
});

test('unsafe upstream claims, relaxed source contracts, unsupported dimensions and shortfall mismatches fail closed', () => {
  const unsafePackets = packetsReport({
    packets: [packet('p1', 'c1', 'UNKNOWN', 'toys-models', ['X'])],
    cells: [cell('UNKNOWN', 'toys-models', 2)],
    shortfall: 1,
    claims: { unauthorizedScrapingRequested: true },
  });
  const unsafeScarcity = scarcity(0);
  unsafeScarcity.sourceContract.commercialReuseRightsRequired = false;
  unsafeScarcity.safety.paidProviderProcurementRequested = true;
  const unsafeDemand = demand([]);
  unsafeDemand.source.license = 'UNKNOWN';
  unsafeDemand.claims.provenanceRecorded = false;
  const { result, report } = run({
    packets: unsafePackets,
    rightData: rightData(199),
    scarcity: unsafeScarcity,
    demand: unsafeDemand,
  });
  assert.notEqual(result.status, 0);
  for (const code of [
    'UNSAFE_UPSTREAM_PACKET_CLAIM:unauthorizedScrapingRequested',
    'SCARCITY_SOURCE_CONTRACT_NOT_FAIL_CLOSED',
    'UNSAFE_SCARCITY_QUALIFICATION_STATE:paidProviderProcurementRequested',
    'DEMAND_OPEN_SOURCE_CONTRACT_NOT_FAIL_CLOSED',
    'DEMAND_RIGHTS_PROVENANCE_NOT_VERIFIED',
    'UNSUPPORTED_DISCOVERY_PACKET_DIMENSION:UNKNOWN',
    'CANDIDATE_SUPPLY_SHORTFALL_MISMATCH:1:2',
  ]) assert.ok(report.structuralErrors.includes(code), code);
  assert.equal(report.claims.productionScoringActivated, false);
});

test('missing and empty required topology fails closed before any source certification', () => {
  const badPackets = packetsReport({ packets: [], cells: [], shortfall: 0 });
  badPackets.metrics.discoveryPackets = 1;
  const { result, report } = run({
    packets: badPackets,
    rightData: { mode: 'WRONG', metrics: { semanticRelevantCandidates: -1 } },
    scarcity: { ...scarcity(0), mode: 'WRONG', metrics: { structuralErrors: 1, automaticallyQualifiedSources: 0 } },
    demand: { ...demand([]), mode: 'WRONG' },
  });
  assert.notEqual(result.status, 0);
  for (const code of [
    'INVALID_RIGHT_DATA_MODE',
    'INVALID_RELEVANT_CANDIDATE_COUNT',
    'INVALID_SCARCITY_QUALIFICATION_MODE',
    'UPSTREAM_SCARCITY_QUALIFICATION_HAS_STRUCTURAL_ERRORS',
    'INVALID_DEMAND_EVIDENCE_MODE',
    'MISSING_CALIBRATION_PACKETS',
    'MISSING_CALIBRATION_CELL_RESULTS',
  ]) assert.ok(report.structuralErrors.includes(code), code);
  assert.equal(report.claims.sourceFeasibilityCertificationFabricated, false);
});

test('missing JSON input fails before a report can be generated', () => {
  const missing = path.join(os.tmpdir(), `missing-calibration-feasibility-${Date.now()}.json`);
  const { result, report } = run({
    packets: packetsReport({ cells: [cell('SCARCITY', 'toys-models', 0)] }),
    rightData: rightData(300),
    scarcity: scarcity(0),
    demand: demand([]),
  }, { packetsRaw: missing });
  assert.notEqual(result.status, 0);
  assert.equal(report, null);
  assert.match(result.stderr, /Missing JSON input/);
});
