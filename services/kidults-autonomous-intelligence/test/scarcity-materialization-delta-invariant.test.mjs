import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const SCRIPT = path.join(ROOT, 'scripts', 'kidult100-scarcity-materialization-delta-invariant.mjs');
const REQUIRED = ['IDENTITY','SCARCITY','TRANSACTION_PRICE_COMPARABLE','LIQUIDITY','DEMAND_ATTENTION','CANON_CULTURAL_STRENGTH','RISK_CONFIDENCE'];
const MARKET = ['TRANSACTION_PRICE_COMPARABLE','LIQUIDITY'];

function policy() {
  return {
    policy: 'FAIL_CLOSED_SCARCITY_MATERIALIZATION_DELTA_INVARIANT',
    requiredPreMode: 'KIDULT100_RIGHT_DATA_ENRICHMENT',
    requiredPostMode: 'KIDULT100_RIGHT_DATA_ENRICHMENT',
    requiredMaterializationMode: 'KIDULT100_SCARCITY_MATERIALIZED_EVIDENCE',
    requiredPrimitive: 'SCARCITY',
    requiredSignalType: 'TOTAL_PRODUCED',
    requiredEvidenceClass: 'INDEPENDENT_VERIFICATION',
    requiredMaterializationStatus: 'RAW_RIGHT_DATA_EVIDENCE_MATERIALIZED_NOT_SCORED',
    rules: {
      candidateUniverseMustRemainStable: true,
      semanticRelevanceMustRemainStable: true,
      materializedCandidatesMustBeSemanticRelevant: true,
      materializedCandidatesMustGainExactlyOneScarcityPrimitive: true,
      materializedEvidencePayloadMustMatchPostRightData: true,
      nonMaterializedCandidatesMayNotGainScarcity: true,
      existingScarcityMayNotDisappear: true,
      providerEvidenceAcceptedDeltaMustMatchMaterializedEvidence: true,
      providerEvidenceRejectedMustRemainStable: true,
      nonScarcityPrimitiveCoverageMustRemainStable: true,
      marketEvidenceCoverageMustRemainStable: true,
      requiredRightDataCoverageDeltaMustMatchMaterializedEvidence: true,
      decisionGradeDeltaMustMatchCandidateLevelTransition: true,
      normalizedScoreGenerationForbidden: true,
      productionScoringActivationForbidden: true,
      marketEvidenceCreationForbidden: true,
    },
  };
}

function scarcityEvidence(key, overrides = {}) {
  return {
    candidateKey: key,
    primitive: 'SCARCITY',
    source: 'KIDULTS_VERIFIED_SCARCITY_CHAIN',
    sourceUrl: 'https://primary.example/item',
    rightsClass: 'COMMERCIAL_REUSE_ALLOWED',
    observedAt: '2026-08-11T01:00:00Z',
    payloadHash: `sha256:${'a'.repeat(64)}`,
    evidenceClass: 'INDEPENDENT_VERIFICATION',
    value: { signalType: 'TOTAL_PRODUCED', quantity: 1000, unit: 'UNITS' },
    safety: {
      synthetic: false,
      estimated: false,
      inferred: false,
      normalizedScoreGenerated: false,
      productionScoringActivated: false,
      marketEvidenceClaim: false,
    },
    materializationStatus: 'RAW_RIGHT_DATA_EVIDENCE_MATERIALIZED_NOT_SCORED',
    ...overrides,
  };
}

function candidate(key, primitives, { semanticRelevant = true, evidence = [], title = `Title ${key}`, vertical = 'toys-models', requiredCoverage, marketEvidencePresent } = {}) {
  const primitiveSet = new Set(primitives);
  return {
    candidateKey: key,
    canonicalTitle: title,
    vertical,
    semanticRelevant,
    rightData: {
      primitives: [...primitiveSet],
      requiredCoverage: requiredCoverage ?? REQUIRED.filter((primitive) => primitiveSet.has(primitive)).length / REQUIRED.length,
      marketEvidencePresent: marketEvidencePresent ?? MARKET.every((primitive) => primitiveSet.has(primitive)),
      evidence,
    },
  };
}

function rightData(candidates, { accepted = 10, rejected = 0, metricOverrides = {} } = {}) {
  const relevant = candidates.filter((row) => row.semanticRelevant);
  const primitiveCoverage = Object.fromEntries(REQUIRED.map((primitive) => [primitive, relevant.length ? relevant.filter((row) => row.rightData.primitives.includes(primitive)).length / relevant.length : 0]));
  const requiredRightDataCoverage = relevant.length ? relevant.reduce((sum, row) => sum + row.rightData.requiredCoverage, 0) / relevant.length : 0;
  const marketEvidenceCoverage = relevant.length ? relevant.filter((row) => row.rightData.marketEvidencePresent).length / relevant.length : 0;
  const decisionGradeCandidates = relevant.filter((row) => row.rightData.requiredCoverage >= 0.9 && row.rightData.marketEvidencePresent).length;
  return {
    mode: 'KIDULT100_RIGHT_DATA_ENRICHMENT',
    metrics: {
      totalNormalizedCandidates: candidates.length,
      semanticRelevantCandidates: relevant.length,
      providerEvidenceAccepted: accepted,
      providerEvidenceRejected: rejected,
      requiredRightDataCoverage,
      marketEvidenceCoverage,
      decisionGradeCandidates,
      primitiveCoverage,
      ...metricOverrides,
    },
    candidates,
  };
}

function materialization(evidence = [], { rejected = [], metricOverrides = {} } = {}) {
  return {
    mode: 'KIDULT100_SCARCITY_MATERIALIZED_EVIDENCE',
    metrics: {
      materializedRightDataEvidence: evidence.length,
      rejectedMaterializationRecords: rejected.length,
      normalizedScoresGenerated: 0,
      qualifiedProductionScores: 0,
      marketEvidenceCreated: 0,
      ...metricOverrides,
    },
    evidence,
    rejectedMaterializationRecords: rejected,
  };
}

function run(p, pre, mat, post, { useFiles = false, outputRelative = false, rawEnv = {} } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scarcity-delta-'));
  const out = outputRelative ? path.join('reports', 'test-scarcity-delta.json') : path.join(dir, 'out.json');
  let pInput = JSON.stringify(p);
  let preInput = JSON.stringify(pre);
  let matInput = JSON.stringify(mat);
  let postInput = JSON.stringify(post);
  if (useFiles) {
    const inputs = [['policy.json', p], ['pre.json', pre], ['mat.json', mat], ['post.json', post]];
    for (const [name, value] of inputs) fs.writeFileSync(path.join(dir, name), JSON.stringify(value));
    pInput = path.join(dir, 'policy.json');
    preInput = path.join(dir, 'pre.json');
    matInput = path.join(dir, 'mat.json');
    postInput = path.join(dir, 'post.json');
  }
  const result = spawnSync(process.execPath, [SCRIPT], {
    cwd: ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      KIDULTS_SCARCITY_DELTA_POLICY_JSON: pInput,
      KIDULTS_SCARCITY_DELTA_PRE_RIGHT_DATA_JSON: preInput,
      KIDULTS_SCARCITY_DELTA_MATERIALIZATION_JSON: matInput,
      KIDULTS_SCARCITY_DELTA_POST_RIGHT_DATA_JSON: postInput,
      KIDULTS_SCARCITY_DELTA_OUTPUT: out,
      ...rawEnv,
    },
  });
  const resolved = path.isAbsolute(out) ? out : path.join(ROOT, out);
  const report = fs.existsSync(resolved) ? JSON.parse(fs.readFileSync(resolved, 'utf8')) : null;
  if (fs.existsSync(resolved)) fs.rmSync(resolved, { force: true });
  fs.rmSync(dir, { recursive: true, force: true });
  return { result, report };
}

test('zero materialization proves exact no-data-change invariant using file inputs', () => {
  const rows = [candidate('Q1', ['IDENTITY','DEMAND_ATTENTION','CANON_CULTURAL_STRENGTH','RISK_CONFIDENCE'])];
  const pre = rightData(rows, { accepted: 3 });
  const post = rightData(rows, { accepted: 3 });
  const { result, report } = run(policy(), pre, materialization(), post, { useFiles: true, outputRelative: true });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(report.disposition, 'ZERO_MATERIALIZATION_DELTA_VERIFIED_NO_DATA_CHANGE');
  assert.equal(report.metrics.materializedRightDataEvidence, 0);
  assert.equal(report.metrics.scarcityCandidateDelta, 0);
  assert.equal(report.metrics.providerEvidenceAcceptedDelta, 0);
  assert.equal(report.metrics.invariantViolations, 0);
  assert.equal(report.claims.marketEvidenceCreatedByScarcityMaterialization, false);
});

test('one verified materialized record produces exactly one scarcity and provider-evidence delta', () => {
  const record = scarcityEvidence('Q1');
  const preRows = [
    candidate('Q1', ['IDENTITY','DEMAND_ATTENTION','CANON_CULTURAL_STRENGTH','RISK_CONFIDENCE'], { evidence: [scarcityEvidence('Q1', { safety: { synthetic: true, estimated: false, inferred: false } })] }),
    candidate('Q2', ['IDENTITY','DEMAND_ATTENTION','CANON_CULTURAL_STRENGTH','RISK_CONFIDENCE']),
  ];
  const postRows = [
    candidate('Q1', ['IDENTITY','SCARCITY','DEMAND_ATTENTION','CANON_CULTURAL_STRENGTH','RISK_CONFIDENCE'], { evidence: [record] }),
    candidate('Q2', ['IDENTITY','DEMAND_ATTENTION','CANON_CULTURAL_STRENGTH','RISK_CONFIDENCE']),
  ];
  const { result, report } = run(policy(), rightData(preRows, { accepted: 7 }), materialization([record]), rightData(postRows, { accepted: 8 }));
  assert.equal(result.status, 0, result.stderr);
  assert.equal(report.disposition, 'SCARCITY_MATERIALIZATION_DELTA_VERIFIED_EXACT');
  assert.equal(report.metrics.eligibleScarcityCandidatesBefore, 0);
  assert.equal(report.metrics.eligibleScarcityCandidatesAfter, 1);
  assert.equal(report.metrics.scarcityCandidateDelta, 1);
  assert.equal(report.metrics.providerEvidenceAcceptedDelta, 1);
  assert.equal(report.metrics.requiredRightDataCoverageAfter, report.metrics.requiredRightDataCoverageExpectedAfter);
});

test('scarcity can legitimately create a decision-grade transition only when candidate-level state proves it', () => {
  const record = scarcityEvidence('Q1');
  const six = ['IDENTITY','TRANSACTION_PRICE_COMPARABLE','LIQUIDITY','DEMAND_ATTENTION','CANON_CULTURAL_STRENGTH','RISK_CONFIDENCE'];
  const seven = [...six, 'SCARCITY'];
  const pre = rightData([candidate('Q1', six)], { accepted: 6 });
  const post = rightData([candidate('Q1', seven, { evidence: [record] })], { accepted: 7 });
  const { result, report } = run(policy(), pre, materialization([record]), post);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(report.metrics.marketEvidenceCoverageBefore, 1);
  assert.equal(report.metrics.marketEvidenceCoverageAfter, 1);
  assert.equal(report.metrics.decisionGradeCandidatesBefore, 0);
  assert.equal(report.metrics.decisionGradeCandidatesAfter, 1);
});

test('unexpected universe primitive scarcity and payload changes fail closed', () => {
  const record = scarcityEvidence('Q1');
  const pre = rightData([
    candidate('Q1', ['IDENTITY','DEMAND_ATTENTION','CANON_CULTURAL_STRENGTH','RISK_CONFIDENCE']),
    candidate('Q2', ['IDENTITY','SCARCITY','DEMAND_ATTENTION','CANON_CULTURAL_STRENGTH','RISK_CONFIDENCE'], { evidence: [scarcityEvidence('Q2', { payloadHash: `sha256:${'b'.repeat(64)}` })] }),
  ], { accepted: 8 });
  const post = rightData([
    candidate('Q1', ['IDENTITY','SCARCITY','DEMAND_ATTENTION','CANON_CULTURAL_STRENGTH','RISK_CONFIDENCE'], { evidence: [] , title: 'Changed title' }),
    candidate('Q3', ['IDENTITY','TRANSACTION_PRICE_COMPARABLE','DEMAND_ATTENTION','CANON_CULTURAL_STRENGTH','RISK_CONFIDENCE'], { semanticRelevant: false }),
  ], { accepted: 10, rejected: 1 });
  const { result, report } = run(policy(), pre, materialization([record]), post);
  assert.equal(result.status, 1);
  assert.equal(report.disposition, 'FAIL_CLOSED_SCARCITY_MATERIALIZATION_DELTA_INVARIANT_VIOLATION');
  const text = report.violations.join('|');
  assert.match(text, /CANDIDATE_UNIVERSE_CHANGED/);
  assert.match(text, /SEMANTIC_RELEVANT_UNIVERSE_CHANGED/);
  assert.match(text, /CANDIDATE_METADATA_CHANGED:Q1/);
  assert.match(text, /MATERIALIZED_PAYLOAD_NOT_EXACTLY_PRESENT_POST_RIGHT_DATA:Q1/);
  assert.match(text, /EXISTING_SCARCITY_EVIDENCE_DISAPPEARED/);
  assert.match(text, /PROVIDER_EVIDENCE_ACCEPTED_DELTA_MISMATCH/);
  assert.match(text, /PROVIDER_EVIDENCE_REJECTED_CHANGED/);
});

test('materialized candidate that already had scarcity and non-materialized primitive mutation are rejected', () => {
  const oldScarcity = scarcityEvidence('Q1', { payloadHash: `sha256:${'c'.repeat(64)}` });
  const newScarcity = scarcityEvidence('Q1');
  const pre = rightData([
    candidate('Q1', ['IDENTITY','SCARCITY','DEMAND_ATTENTION','CANON_CULTURAL_STRENGTH','RISK_CONFIDENCE'], { evidence: [oldScarcity] }),
    candidate('Q2', ['IDENTITY','DEMAND_ATTENTION','CANON_CULTURAL_STRENGTH','RISK_CONFIDENCE']),
  ], { accepted: 5 });
  const post = rightData([
    candidate('Q1', ['IDENTITY','SCARCITY','DEMAND_ATTENTION','CANON_CULTURAL_STRENGTH','RISK_CONFIDENCE'], { evidence: [oldScarcity, newScarcity] }),
    candidate('Q2', ['IDENTITY','LIQUIDITY','DEMAND_ATTENTION','CANON_CULTURAL_STRENGTH','RISK_CONFIDENCE']),
  ], { accepted: 6 });
  const { result, report } = run(policy(), pre, materialization([newScarcity]), post);
  assert.equal(result.status, 1);
  const text = report.violations.join('|');
  assert.match(text, /MATERIALIZED_CANDIDATE_ALREADY_HAD_SCARCITY_PRIMITIVE:Q1/);
  assert.match(text, /MATERIALIZED_CANDIDATE_PRIMITIVE_DELTA_INVALID:Q1/);
  assert.match(text, /NON_MATERIALIZED_PRIMITIVE_DELTA:Q2/);
  assert.match(text, /NON_SCARCITY_PRIMITIVE_COVERAGE_CHANGED:LIQUIDITY/);
  assert.match(text, /MARKET_EVIDENCE_COVERAGE_CHANGED|CANDIDATE_MARKET_EVIDENCE_FLAG_INCONSISTENT/);
});

test('malformed materialization claims metrics and evidence boundaries fail closed', () => {
  const bad = scarcityEvidence('Q1', {
    primitive: 'DEMAND_ATTENTION',
    evidenceClass: 'WRONG',
    materializationStatus: 'WRONG',
    value: { signalType: 'ESTIMATE', normalizedScore: 0.9 },
    safety: { synthetic: true, estimated: true, inferred: true, normalizedScoreGenerated: true, productionScoringActivated: true, marketEvidenceClaim: true },
  });
  const duplicate = { ...bad };
  const rows = [candidate('Q1', ['IDENTITY','DEMAND_ATTENTION','CANON_CULTURAL_STRENGTH','RISK_CONFIDENCE'])];
  const mat = materialization([bad, duplicate], {
    rejected: [{ candidateKey: 'QX' }],
    metricOverrides: { materializedRightDataEvidence: 99, rejectedMaterializationRecords: 0, normalizedScoresGenerated: 1, qualifiedProductionScores: 1, marketEvidenceCreated: 1 },
  });
  const { result, report } = run(policy(), rightData(rows), mat, rightData(rows));
  assert.equal(result.status, 1);
  const text = report.violations.join('|');
  for (const expected of [
    'MATERIALIZATION_METRIC_EVIDENCE_COUNT_MISMATCH',
    'MATERIALIZATION_METRIC_REJECTED_COUNT_MISMATCH',
    'MATERIALIZATION_REJECTIONS_PRESENT',
    'MATERIALIZATION_NORMALIZED_SCORE_CLAIM_PRESENT',
    'MATERIALIZATION_PRODUCTION_SCORE_CLAIM_PRESENT',
    'MATERIALIZATION_MARKET_EVIDENCE_CLAIM_PRESENT',
    'INVALID_MATERIALIZED_SIGNAL:Q1',
    'INVALID_MATERIALIZATION_BOUNDARY:Q1',
    'UNSAFE_MATERIALIZED_QUANTITY:Q1',
    'UNSAFE_MATERIALIZED_CLAIMS:Q1',
    'MATERIALIZED_NORMALIZED_SCORE_PRESENT:Q1',
    'INVALID_OR_DUPLICATE_MATERIALIZED_CANDIDATE:Q1',
  ]) assert.ok(text.includes(expected), expected);
});

test('candidate metric inconsistencies and invalid aggregate metrics are detected', () => {
  const preRow = candidate('Q1', ['IDENTITY'], { requiredCoverage: 0.9, marketEvidencePresent: true });
  const postRow = candidate('Q1', ['IDENTITY'], { requiredCoverage: 0.8, marketEvidencePresent: true });
  const pre = rightData([preRow], { metricOverrides: { totalNormalizedCandidates: 2, semanticRelevantCandidates: 2, providerEvidenceAccepted: 'bad', primitiveCoverage: { ...rightData([preRow]).metrics.primitiveCoverage, DEMAND_ATTENTION: 'bad' } } });
  const post = rightData([postRow], { metricOverrides: { totalNormalizedCandidates: 3, semanticRelevantCandidates: 3, providerEvidenceRejected: 'bad', requiredRightDataCoverage: 0.7, marketEvidenceCoverage: 0.5, decisionGradeCandidates: 9 } });
  const { result, report } = run(policy(), pre, materialization(), post);
  assert.equal(result.status, 1);
  const text = report.violations.join('|');
  assert.match(text, /CANDIDATE_REQUIRED_COVERAGE_INCONSISTENT:Q1/);
  assert.match(text, /CANDIDATE_MARKET_EVIDENCE_FLAG_INCONSISTENT:Q1/);
  assert.match(text, /PRE_INVALID_METRIC:providerEvidenceAccepted/);
  assert.match(text, /POST_INVALID_METRIC:providerEvidenceRejected/);
  assert.match(text, /INVALID_PRIMITIVE_COVERAGE:DEMAND_ATTENTION/);
  assert.match(text, /TOTAL_CANDIDATE_METRIC_INVARIANT_FAILED/);
  assert.match(text, /SEMANTIC_RELEVANT_METRIC_INVARIANT_FAILED/);
  assert.match(text, /REQUIRED_RIGHT_DATA_COVERAGE_DELTA_MISMATCH/);
  assert.match(text, /MARKET_EVIDENCE_COVERAGE_CHANGED/);
  assert.match(text, /DECISION_GRADE_METRIC_INCONSISTENT/);
});

test('empty semantic universe exercises zero-denominator invariant path', () => {
  const pre = rightData([],{ accepted: 0 });
  const post = rightData([],{ accepted: 0 });
  const { result, report } = run(policy(), pre, materialization(), post);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(report.metrics.semanticRelevantBefore, 0);
  assert.equal(report.metrics.requiredRightDataCoverageExpectedAfter, 0);
});

test('unsafe policies wrong modes and missing file inputs fail before report creation', () => {
  const empty = rightData([],{ accepted: 0 });
  const cases = [
    [{ ...policy(), policy: 'WRONG' }, empty, materialization(), empty],
    [policy(), { ...empty, mode: 'WRONG' }, materialization(), empty],
    [policy(), empty, { ...materialization(), mode: 'WRONG' }, empty],
    [policy(), empty, materialization(), { ...empty, mode: 'WRONG' }],
    [{ ...policy(), requiredPrimitive: 'DEMAND_ATTENTION' }, empty, materialization(), empty],
    [{ ...policy(), rules: { ...policy().rules, marketEvidenceCreationForbidden: false } }, empty, materialization(), empty],
  ];
  for (const [p, pre, mat, post] of cases) {
    const { result, report } = run(p, pre, mat, post);
    assert.equal(result.status, 1);
    assert.equal(report, null);
  }
  const { result, report } = run(policy(), empty, materialization(), empty, { rawEnv: { KIDULTS_SCARCITY_DELTA_PRE_RIGHT_DATA_JSON: '/definitely/missing/right-data.json' } });
  assert.equal(result.status, 1);
  assert.equal(report, null);
});
