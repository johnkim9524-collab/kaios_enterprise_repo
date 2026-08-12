import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

function contract(overrides = {}) {
  return {
    policy: 'FAIL_CLOSED_NON_MARKET_SCORING_ACTIVATION',
    dimensions: [
      { id: 'SCARCITY', primitive: 'SCARCITY', methodologyVersion: 'm1', allowedRawSignalTypes: ['TOTAL_PRODUCED'] },
      { id: 'DEMAND_ATTENTION', primitive: 'DEMAND_ATTENTION', methodologyVersion: 'm1', allowedRawSignalTypes: ['CULTURAL_ATTENTION_PROXY', 'UNITS_SOLD_REFERENCE'] },
    ],
    ...overrides,
  };
}

function priority(cells, overrides = {}) {
  return {
    mode: 'KIDULT100_NON_MARKET_EVIDENCE_ACQUISITION_PRIORITY',
    metrics: { structuralErrorCount: 0 },
    priorities: cells,
    claims: {
      normalizedScoresGenerated: false,
      syntheticOrEstimatedEvidenceCreated: false,
      unauthorizedScrapingRequested: false,
      providerProcurementRequested: false,
      contractsOrPaidCommitmentsRequested: false,
      rightsOrProvenanceRequirementsWeakened: false,
      productionScoringActivated: false,
    },
    ...overrides,
  };
}

function cell(dimension, primitive, vertical, gap, upstreamPriority) {
  return {
    dimension,
    primitive,
    vertical,
    operationalReferenceGap: gap,
    upstreamPriority,
  };
}

function evidence(primitive, signalType, overrides = {}) {
  return {
    primitive,
    sourceUrl: 'https://example.org/data',
    payloadHash: 'hash',
    observedAt: '2026-08-12T00:00:00Z',
    rightsClass: 'CC0',
    value: { signalType },
    safety: { synthetic: false, estimated: false },
    ...overrides,
  };
}

function candidate(candidateKey, vertical, records = [], overrides = {}) {
  return {
    candidateKey,
    title: `Title ${candidateKey}`,
    vertical,
    semanticRelevant: true,
    rightData: { evidence: records },
    ...overrides,
  };
}

function rightData(candidates, overrides = {}) {
  return {
    mode: 'KIDULT100_RIGHT_DATA_ENRICHMENT',
    candidates,
    ...overrides,
  };
}

function run({ priorityInput, rightDataInput, contractInput = contract(), useFiles = false, relativeOutput = false }) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-calibration-discovery-'));
  const env = { ...process.env };
  if (useFiles) {
    const priorityPath = path.join(temp, 'priority.json');
    const rightDataPath = path.join(temp, 'right-data.json');
    const contractPath = path.join(temp, 'contract.json');
    fs.writeFileSync(priorityPath, JSON.stringify(priorityInput));
    fs.writeFileSync(rightDataPath, JSON.stringify(rightDataInput));
    fs.writeFileSync(contractPath, JSON.stringify(contractInput));
    env.KIDULTS_CALIBRATION_DISCOVERY_PRIORITY_JSON = priorityPath;
    env.KIDULTS_CALIBRATION_DISCOVERY_RIGHT_DATA_JSON = rightDataPath;
    env.KIDULTS_CALIBRATION_DISCOVERY_CONTRACT_JSON = contractPath;
  } else {
    env.KIDULTS_CALIBRATION_DISCOVERY_PRIORITY_JSON = JSON.stringify(priorityInput);
    env.KIDULTS_CALIBRATION_DISCOVERY_RIGHT_DATA_JSON = JSON.stringify(rightDataInput);
    env.KIDULTS_CALIBRATION_DISCOVERY_CONTRACT_JSON = JSON.stringify(contractInput);
  }
  const relative = `reports/calibration-discovery-${path.basename(temp)}.json`;
  const outputPath = relativeOutput ? path.join(process.cwd(), relative) : path.join(temp, 'out.json');
  env.KIDULTS_CALIBRATION_DISCOVERY_OUTPUT = relativeOutput ? relative : outputPath;
  const result = spawnSync(process.execPath, ['scripts/kidult100-calibration-discovery-work-packets.mjs'], {
    cwd: process.cwd(),
    env,
    encoding: 'utf8',
  });
  const report = fs.existsSync(outputPath) ? JSON.parse(fs.readFileSync(outputPath, 'utf8')) : null;
  if (relativeOutput) fs.rmSync(outputPath, { force: true });
  fs.rmSync(temp, { recursive: true, force: true });
  return { result, report };
}

test('creates deterministic rights-first work packets only for candidates missing eligible evidence', () => {
  const cells = [cell('SCARCITY', 'SCARCITY', 'toys-models', 2, 'ELIGIBLE_EVIDENCE_SUPPLY_EXPANSION')];
  const candidates = [
    candidate('c3', 'toys-models'),
    candidate('c1', 'toys-models', [evidence('SCARCITY', 'TOTAL_PRODUCED')]),
    candidate('c2', 'toys-models'),
    candidate('off-vertical', 'watches-jewelry'),
    candidate('irrelevant', 'toys-models', [], { semanticRelevant: false }),
    candidate('', 'toys-models'),
  ];
  const { result, report } = run({ priorityInput: priority(cells), rightDataInput: rightData(candidates), useFiles: true, relativeOutput: true });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(report.metrics.externalDiscoveryCells, 1);
  assert.equal(report.metrics.externalDiscoveryCellsWithPackets, 1);
  assert.equal(report.metrics.totalRequestedGap, 2);
  assert.equal(report.metrics.discoveryPackets, 2);
  assert.equal(report.metrics.totalUnfilledCandidateSupplyGap, 0);
  assert.deepEqual(report.packets.map((row) => row.candidateKey), ['c2', 'c3']);
  assert.deepEqual(report.packets[0].allowedSignalTypes, ['TOTAL_PRODUCED']);
  assert.equal(report.packets[0].sourceQualificationRequired, true);
  assert.equal(report.packets[0].sourceFeasibilityClaimed, false);
  assert.ok(report.packets[0].prohibitedActions.includes('UNAUTHORIZED_SCRAPING'));
  assert.ok(report.packets[0].prohibitedActions.includes('PAID_PROVIDER_PROCUREMENT'));
  assert.equal(report.disposition, 'CALIBRATION_DISCOVERY_WORK_PACKETS_READY_NO_SOURCE_FEASIBILITY_CLAIM');
  assert.equal(report.claims.newEvidenceCreated, false);
  assert.equal(report.claims.productionScoringActivated, false);
});

test('keeps repair-first and filled cells out of external discovery and reports no discovery required', () => {
  const cells = [
    cell('SCARCITY', 'SCARCITY', 'toys-models', 2, 'RIGHTS_PROVENANCE_SAFETY_REPAIR'),
    cell('DEMAND_ATTENTION', 'DEMAND_ATTENTION', 'toys-models', 0, 'METHOD_DESIGN_HOLD'),
  ];
  const { result, report } = run({
    priorityInput: priority(cells),
    rightDataInput: rightData([candidate('c1', 'toys-models')]),
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(report.metrics.internalRepairFirstCells, 1);
  assert.equal(report.metrics.externalDiscoveryCells, 0);
  assert.equal(report.metrics.discoveryPackets, 0);
  assert.equal(report.cellResults[0].disposition, 'NO_DISCOVERY_REQUIRED');
  assert.equal(report.cellResults[1].disposition, 'EXISTING_EVIDENCE_REPAIR_OR_NON_DISCOVERY_ACTION_FIRST');
  assert.equal(report.disposition, 'NO_EXTERNAL_CALIBRATION_DISCOVERY_REQUIRED');
});

test('bounds packets by real candidate supply and preserves an explicit acquisition shortfall', () => {
  const cells = [cell('DEMAND_ATTENTION', 'DEMAND_ATTENTION', 'technology-cameras', 3, 'ALLOWED_RAW_SIGNAL_ACQUISITION')];
  const unsafeEvidence = evidence('DEMAND_ATTENTION', 'CULTURAL_ATTENTION_PROXY', { sourceUrl: 'http://unsafe.example/data' });
  const syntheticEvidence = evidence('DEMAND_ATTENTION', 'CULTURAL_ATTENTION_PROXY', { safety: { synthetic: true, estimated: false } });
  const { result, report } = run({
    priorityInput: priority(cells),
    rightDataInput: rightData([
      candidate('c1', 'technology-cameras', [unsafeEvidence]),
      candidate('c2', 'technology-cameras', [syntheticEvidence]),
    ]),
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(report.metrics.discoveryPackets, 2);
  assert.equal(report.metrics.totalUnfilledCandidateSupplyGap, 1);
  assert.equal(report.cellResults[0].safeCandidateSupply, 2);
  assert.equal(report.cellResults[0].disposition, 'DISCOVERY_PACKETS_READY_WITH_CANDIDATE_SUPPLY_SHORTFALL');
  assert.equal(report.disposition, 'CALIBRATION_DISCOVERY_WORK_PACKETS_READY_WITH_CANDIDATE_SUPPLY_SHORTFALL');
});

test('reports no safe candidate supply without inventing a packet', () => {
  const cells = [cell('SCARCITY', 'SCARCITY', 'toys-models', 1, 'ELIGIBLE_EVIDENCE_SUPPLY_EXPANSION')];
  const { result, report } = run({
    priorityInput: priority(cells),
    rightDataInput: rightData([candidate('c1', 'toys-models', [evidence('SCARCITY', 'TOTAL_PRODUCED')])]),
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(report.metrics.discoveryPackets, 0);
  assert.equal(report.metrics.totalUnfilledCandidateSupplyGap, 1);
  assert.equal(report.cellResults[0].disposition, 'NO_SAFE_CANDIDATE_SUPPLY_FOR_DISCOVERY');
  assert.equal(report.disposition, 'NO_SAFE_CANDIDATE_SUPPLY_FOR_CALIBRATION_DISCOVERY');
});

test('fails closed on unsafe upstream claims, invalid topology and duplicate packet identity', () => {
  const cells = [
    cell('UNKNOWN', 'UNKNOWN', 'toys-models', 1, 'ELIGIBLE_EVIDENCE_SUPPLY_EXPANSION'),
    cell('SCARCITY', 'WRONG', 'toys-models', 1, 'ELIGIBLE_EVIDENCE_SUPPLY_EXPANSION'),
    cell('SCARCITY', 'SCARCITY', 'toys-models', 'bad', 'ELIGIBLE_EVIDENCE_SUPPLY_EXPANSION'),
    { dimension: '', primitive: '', vertical: 'toys-models', operationalReferenceGap: 1, upstreamPriority: 'ELIGIBLE_EVIDENCE_SUPPLY_EXPANSION' },
    cell('SCARCITY', 'SCARCITY', 'watches-jewelry', 2, 'ELIGIBLE_EVIDENCE_SUPPLY_EXPANSION'),
  ];
  const unsafePriority = priority(cells, {
    mode: 'WRONG',
    metrics: { structuralErrorCount: 2 },
    claims: {
      normalizedScoresGenerated: true,
      syntheticOrEstimatedEvidenceCreated: true,
      unauthorizedScrapingRequested: true,
      providerProcurementRequested: true,
      contractsOrPaidCommitmentsRequested: true,
      rightsOrProvenanceRequirementsWeakened: true,
      productionScoringActivated: true,
    },
  });
  const { result, report } = run({
    priorityInput: unsafePriority,
    rightDataInput: rightData([
      candidate('dup', 'watches-jewelry'),
      candidate('dup', 'watches-jewelry'),
    ], { mode: 'WRONG' }),
    contractInput: contract({ policy: 'WRONG' }),
  });
  assert.notEqual(result.status, 0);
  const expected = [
    'INVALID_ACQUISITION_PRIORITY_MODE',
    'UPSTREAM_ACQUISITION_PRIORITY_HAS_STRUCTURAL_ERRORS',
    'UPSTREAM_SCORE_GENERATION_STATE_UNSAFE',
    'UPSTREAM_SYNTHETIC_EVIDENCE_STATE_UNSAFE',
    'UPSTREAM_UNAUTHORIZED_SCRAPING_STATE_UNSAFE',
    'UPSTREAM_PROVIDER_PROCUREMENT_STATE_UNSAFE',
    'UPSTREAM_CONTRACT_STATE_UNSAFE',
    'UPSTREAM_RIGHTS_PROVENANCE_STATE_UNSAFE',
    'UPSTREAM_PRODUCTION_SCORING_STATE_UNSAFE',
    'INVALID_RIGHT_DATA_MODE',
    'INVALID_NON_MARKET_SCORING_POLICY',
    'INVALID_OR_UNKNOWN_CELL_IDENTITY:UNKNOWN:toys-models',
    'PRIMITIVE_MISMATCH:SCARCITY:toys-models',
    'INVALID_OPERATIONAL_REFERENCE_GAP:SCARCITY:toys-models',
    'INVALID_OR_UNKNOWN_CELL_IDENTITY::toys-models',
    'DUPLICATE_DISCOVERY_PACKET:calibration:SCARCITY:watches-jewelry:dup',
  ];
  for (const error of expected) assert.ok(report.structuralErrors.includes(error), error);
  assert.equal(report.disposition, 'FAIL_CLOSED_INVALID_CALIBRATION_DISCOVERY_STATE');
});

test('fails closed when required cells, candidates or file inputs are missing', () => {
  const empty = run({ priorityInput: priority([]), rightDataInput: rightData([]) });
  assert.notEqual(empty.result.status, 0);
  assert.ok(empty.report.structuralErrors.includes('MISSING_ACQUISITION_PRIORITY_CELLS'));
  assert.ok(empty.report.structuralErrors.includes('MISSING_RIGHT_DATA_CANDIDATES'));

  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-calibration-discovery-missing-'));
  const result = spawnSync(process.execPath, ['scripts/kidult100-calibration-discovery-work-packets.mjs'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      KIDULTS_CALIBRATION_DISCOVERY_PRIORITY_JSON: path.join(temp, 'missing.json'),
      KIDULTS_CALIBRATION_DISCOVERY_RIGHT_DATA_JSON: JSON.stringify(rightData([candidate('c1', 'toys-models')])),
      KIDULTS_CALIBRATION_DISCOVERY_CONTRACT_JSON: JSON.stringify(contract()),
      KIDULTS_CALIBRATION_DISCOVERY_OUTPUT: path.join(temp, 'out.json'),
    },
    encoding: 'utf8',
  });
  fs.rmSync(temp, { recursive: true, force: true });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Missing JSON input/);
});
