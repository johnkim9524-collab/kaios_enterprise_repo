import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const SCRIPT = path.join(ROOT, 'scripts', 'kidult100-calibration-evidence-work-packets.mjs');

function contract() {
  return {
    policy: 'FAIL_CLOSED_NON_MARKET_SCORING_ACTIVATION',
    global: {
      requiresCalibrationEvidence: true,
      requiresOutOfSampleValidation: true,
      requiresRightsClassifiedInputs: true,
      requiresProvenance: true,
      syntheticCalibrationMayActivateProductionScoring: false,
      automaticActivationAllowed: false,
    },
    dimensions: [
      { id: 'SCARCITY', primitive: 'SCARCITY', allowedRawSignalTypes: ['TOTAL_PRODUCED'], methodologyStatus: 'DESIGN_READY', methodologyVersion: 'm1', productionActivation: false },
      { id: 'DEMAND_ATTENTION', primitive: 'DEMAND_ATTENTION', allowedRawSignalTypes: ['CULTURAL_ATTENTION_PROXY'], methodologyStatus: 'DESIGN_READY', methodologyVersion: 'm1', productionActivation: false },
    ],
  };
}

function priority(cells) {
  return {
    mode: 'KIDULT100_NON_MARKET_EVIDENCE_ACQUISITION_PRIORITY',
    metrics: { structuralErrorCount: 0 },
    priorities: cells,
    claims: {
      normalizedScoresGenerated: false,
      productionScoringActivated: false,
      syntheticOrEstimatedEvidenceCreated: false,
      rightsOrProvenanceRequirementsWeakened: false,
    },
  };
}

function run(priorityInput, contractInput, options = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'calibration-work-'));
  const out = path.join(dir, 'out.json');
  const result = spawnSync(process.execPath, [SCRIPT], {
    cwd: ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      KIDULTS_CALIBRATION_WORK_PRIORITY_JSON: options.priorityRaw ?? JSON.stringify(priorityInput),
      KIDULTS_CALIBRATION_WORK_CONTRACT_JSON: options.contractRaw ?? JSON.stringify(contractInput),
      KIDULTS_CALIBRATION_WORK_OUTPUT: out,
    },
  });
  const report = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : null;
  fs.rmSync(dir, { recursive: true, force: true });
  return { result, report };
}

test('creates deterministic rights-first work packets without creating evidence or scores', () => {
  const cells = [
    { dimension: 'DEMAND_ATTENTION', primitive: 'DEMAND_ATTENTION', vertical: 'watches-jewelry', calibrationEligibleCandidates: 3, operationalReferenceGap: 22, actionClass: 'EXPAND_RIGHTS_QUALIFIED_ELIGIBLE_SUPPLY' },
    { dimension: 'SCARCITY', primitive: 'SCARCITY', vertical: 'toys-models', calibrationEligibleCandidates: 0, operationalReferenceGap: 25, actionClass: 'ACQUIRE_ONLY_RIGHTS_QUALIFIED_ALLOWED_SIGNALS' },
    { dimension: 'SCARCITY', primitive: 'SCARCITY', vertical: 'automobiles-mobility', calibrationEligibleCandidates: 25, operationalReferenceGap: 0, actionClass: 'NO_ACQUISITION_ACTION_REQUIRED_FOR_OPERATIONAL_REFERENCE' },
  ];
  const { result, report } = run(priority(cells), contract());
  assert.equal(result.status, 0);
  assert.equal(report.metrics.packets, 2);
  assert.equal(report.metrics.zeroEligiblePackets, 1);
  assert.equal(report.metrics.totalOperationalReferenceGap, 47);
  assert.equal(report.packets[0].packetId, 'calibration:SCARCITY:toys-models');
  assert.deepEqual(report.packets[0].allowedRawSignalTypes, ['TOTAL_PRODUCED']);
  assert.equal(report.packets[0].acquisitionBoundary.unauthorizedScrapingAllowed, false);
  assert.equal(report.packets[0].scoringBoundary.normalizedScoreGenerationAllowed, false);
  assert.equal(report.claims.evidenceCreated, false);
  assert.equal(report.disposition, 'CALIBRATION_EVIDENCE_WORK_PACKETS_READY');
});

test('no below-reference cells produces a safe empty planning result', () => {
  const cells = [{ dimension: 'SCARCITY', primitive: 'SCARCITY', vertical: 'toys-models', calibrationEligibleCandidates: 25, operationalReferenceGap: 0 }];
  const { result, report } = run(priority(cells), contract());
  assert.equal(result.status, 0);
  assert.equal(report.metrics.packets, 0);
  assert.equal(report.disposition, 'NO_CALIBRATION_EVIDENCE_WORK_PACKETS_REQUIRED_FOR_OPERATIONAL_REFERENCE');
});

test('unsafe upstream state, malformed dimensions, duplicate cells and incomplete methods fail closed', () => {
  const unsafePriority = priority([
    { dimension: 'UNKNOWN', vertical: 'toys-models', calibrationEligibleCandidates: 0, operationalReferenceGap: 25 },
    { dimension: 'SCARCITY', vertical: 'toys-models', calibrationEligibleCandidates: 0, operationalReferenceGap: 25 },
    { dimension: 'SCARCITY', vertical: 'toys-models', calibrationEligibleCandidates: 0, operationalReferenceGap: 25 },
    { dimension: null, vertical: 'watches-jewelry', calibrationEligibleCandidates: 0, operationalReferenceGap: 25 },
    { dimension: 'DEMAND_ATTENTION', vertical: 'watches-jewelry', calibrationEligibleCandidates: 0, operationalReferenceGap: 25 },
  ]);
  unsafePriority.mode = 'WRONG';
  unsafePriority.metrics.structuralErrorCount = 1;
  unsafePriority.claims.normalizedScoresGenerated = true;
  unsafePriority.claims.syntheticOrEstimatedEvidenceCreated = true;
  const unsafeContract = contract();
  unsafeContract.policy = 'WRONG';
  unsafeContract.global.requiresCalibrationEvidence = false;
  unsafeContract.global.requiresRightsClassifiedInputs = false;
  unsafeContract.global.automaticActivationAllowed = true;
  unsafeContract.dimensions.push({ id: 'SCARCITY', allowedRawSignalTypes: ['TOTAL_PRODUCED'], methodologyStatus: 'DESIGN_READY', productionActivation: false });
  unsafeContract.dimensions[1].methodologyStatus = 'NOT_VALIDATED';
  unsafeContract.dimensions[1].allowedRawSignalTypes = [];
  unsafeContract.dimensions.push({ id: null });
  const { result, report } = run(unsafePriority, unsafeContract);
  assert.equal(result.status, 1);
  assert.ok(report.metrics.structuralErrorCount > 0);
  assert.equal(report.disposition, 'FAIL_CLOSED_INVALID_CALIBRATION_WORK_PACKET_INPUT');
  assert.equal(report.claims.productionScoringActivated, false);
});

test('missing JSON file input fails closed before packet generation', () => {
  const missing = path.join(os.tmpdir(), `missing-calibration-${Date.now()}.json`);
  const { result, report } = run(priority([]), contract(), { priorityRaw: missing });
  assert.notEqual(result.status, 0);
  assert.equal(report, null);
});
