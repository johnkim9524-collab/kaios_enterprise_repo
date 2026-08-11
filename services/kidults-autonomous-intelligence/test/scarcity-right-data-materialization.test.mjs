import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const SCRIPT = path.join(ROOT, 'scripts', 'kidult100-scarcity-right-data-materialize.mjs');
const sha = (char) => `sha256:${char.repeat(64)}`;
const digest = (value) => `sha256:${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;

function policy() {
  return {
    policy: 'FAIL_CLOSED_SCARCITY_RIGHT_DATA_MATERIALIZATION',
    requiredPromotionMode: 'KIDULT100_SCARCITY_PROMOTION_ENVELOPE',
    requiredRightDataMode: 'KIDULT100_RIGHT_DATA_ENRICHMENT',
    requiredPromotionStatus: 'PROMOTION_ENVELOPE_READY_NOT_MATERIALIZED',
    requiredPrimitive: 'SCARCITY',
    requiredSignalType: 'TOTAL_PRODUCED',
    requiredUnit: 'UNITS',
    output: {
      mode: 'KIDULT100_SCARCITY_MATERIALIZED_EVIDENCE',
      evidenceClass: 'INDEPENDENT_VERIFICATION',
      source: 'KIDULTS_VERIFIED_SCARCITY_CHAIN',
    },
    rules: {
      promotionDigestMustMatchPayload: true,
      candidateIdentityRequired: true,
      primaryAndVerificationHashesRequired: true,
      primaryAndVerificationProvenanceRequired: true,
      commercialReuseRightsMustBePreserved: true,
      documentedAutomatedAccessMustBePreserved: true,
      explicitPositiveIntegerQuantityRequired: true,
      duplicateCandidateForbidden: true,
      existingEligibleScarcityDuplicateForbidden: true,
      syntheticEstimatedOrInferredQuantityForbidden: true,
      normalizedScoreGenerationForbidden: true,
      productionScoringActivationForbidden: true,
      marketEvidenceClaimForbidden: true,
    },
  };
}

function envelope(overrides = {}) {
  return {
    candidateKey: 'wikidata:Q1',
    canonicalTitle: 'Example Model 1',
    vertical: 'toys-models',
    signalType: 'TOTAL_PRODUCED',
    quantity: 1000,
    unit: 'UNITS',
    primaryPayloadHash: sha('a'),
    verificationPayloadHash: sha('b'),
    primaryProvenance: {
      sourceTier: 'OFFICIAL_MANUFACTURER_OR_BRAND_ARCHIVE',
      sourceUrl: 'https://primary.example/model-1',
      rightsClass: 'COMMERCIAL_REUSE_ALLOWED',
      rightsUrl: 'https://primary.example/rights',
      automatedAccessUrl: 'https://primary.example/api',
      observedAt: '2026-08-11T00:00:00Z',
    },
    independentVerification: {
      sourceUrl: 'https://independent.example/model-1',
      rightsUrl: 'https://independent.example/rights',
      automatedAccessUrl: 'https://independent.example/api',
      verifiedAt: '2026-08-11T01:00:00Z',
    },
    chainDigests: {
      attestationIntakeDigest: sha('c'),
      independentVerificationDigest: sha('d'),
    },
    promotionStatus: 'PROMOTION_ENVELOPE_READY_NOT_MATERIALIZED',
    materializedRightDataEvidence: false,
    productionScoreActivated: false,
    ...overrides,
  };
}

function promotion(rows = [], rejected = [], overrides = {}) {
  const report = {
    mode: 'KIDULT100_SCARCITY_PROMOTION_ENVELOPE',
    metrics: { materializedRightDataEvidence: 0, qualifiedProductionScores: 0 },
    promotionEnvelopes: rows,
    rejectedPromotionRecords: rejected,
    ...overrides,
  };
  report.promotionDigest = digest({ envelopes: rows, rejected });
  return report;
}

function rightData(candidates = []) {
  return { mode: 'KIDULT100_RIGHT_DATA_ENRICHMENT', candidates };
}

function candidate(candidateKey, evidence = []) {
  return { candidateKey, rightData: { evidence } };
}

function existingScarcity(safety = {}) {
  return {
    primitive: 'SCARCITY',
    value: { signalType: 'TOTAL_PRODUCED' },
    safety: { synthetic: false, estimated: false, inferred: false, ...safety },
  };
}

function run(p, promo, rd, { useFiles = false, outputRelative = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scarcity-materialize-'));
  const out = outputRelative ? path.join('reports', 'test-scarcity-materialized.json') : path.join(dir, 'out.json');
  let pInput = JSON.stringify(p);
  let promoInput = JSON.stringify(promo);
  let rdInput = JSON.stringify(rd);
  if (useFiles) {
    const pp = path.join(dir, 'policy.json');
    const ep = path.join(dir, 'promotion.json');
    const rp = path.join(dir, 'right-data.json');
    fs.writeFileSync(pp, JSON.stringify(p));
    fs.writeFileSync(ep, JSON.stringify(promo));
    fs.writeFileSync(rp, JSON.stringify(rd));
    pInput = pp;
    promoInput = ep;
    rdInput = rp;
  }
  const result = spawnSync(process.execPath, [SCRIPT], {
    cwd: ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      KIDULTS_SCARCITY_MATERIALIZATION_POLICY_JSON: pInput,
      KIDULTS_SCARCITY_PROMOTION_ENVELOPE_JSON: promoInput,
      KIDULTS_SCARCITY_MATERIALIZATION_RIGHT_DATA_JSON: rdInput,
      KIDULTS_SCARCITY_MATERIALIZATION_OUTPUT: out,
    },
  });
  const resolved = path.isAbsolute(out) ? out : path.join(ROOT, out);
  const report = fs.existsSync(resolved) ? JSON.parse(fs.readFileSync(resolved, 'utf8')) : null;
  if (fs.existsSync(resolved)) fs.rmSync(resolved, { force: true });
  fs.rmSync(dir, { recursive: true, force: true });
  return { result, report };
}

test('empty promotion input materializes zero evidence and leaves scoring and market claims closed', () => {
  const { result, report } = run(policy(), promotion(), rightData(), { useFiles: true, outputRelative: true });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(report.metrics.promotionReadyInput, 0);
  assert.equal(report.metrics.materializedRightDataEvidence, 0);
  assert.equal(report.metrics.normalizedScoresGenerated, 0);
  assert.equal(report.metrics.marketEvidenceCreated, 0);
  assert.equal(report.evidence.length, 0);
  assert.equal(report.disposition, 'NO_PROMOTION_ENVELOPES_TO_MATERIALIZE');
  assert.equal(report.claims.productionScoringActivated, false);
});

test('verified promotion envelope materializes exactly one raw scarcity record without a normalized score', () => {
  const { result, report } = run(policy(), promotion([envelope()]), rightData());
  assert.equal(result.status, 0, result.stderr);
  assert.equal(report.metrics.materializedRightDataEvidence, 1);
  assert.equal(report.metrics.rejectedMaterializationRecords, 0);
  assert.equal(report.disposition, 'VERIFIED_SCARCITY_RAW_EVIDENCE_MATERIALIZED_NO_SCORE');
  const record = report.evidence[0];
  assert.equal(record.candidateKey, 'wikidata:Q1');
  assert.equal(record.primitive, 'SCARCITY');
  assert.equal(record.evidenceClass, 'INDEPENDENT_VERIFICATION');
  assert.equal(record.value.signalType, 'TOTAL_PRODUCED');
  assert.equal(record.value.quantity, 1000);
  assert.equal(record.rightsClass, 'COMMERCIAL_REUSE_ALLOWED');
  assert.equal(record.safety.normalizedScoreGenerated, false);
  assert.equal(Object.hasOwn(record.value, 'normalizedScore'), false);
  assert.match(record.payloadHash, /^sha256:[a-f0-9]{64}$/);
});

test('existing real scarcity blocks duplicate while unsafe or irrelevant records do not', () => {
  const rd = rightData([
    candidate('wikidata:Q1', [
      { primitive: 'DEMAND_ATTENTION', value: { signalType: 'TOTAL_PRODUCED' } },
      { primitive: 'SCARCITY', value: { signalType: 'OTHER' } },
      existingScarcity({ synthetic: true }),
      existingScarcity({ estimated: true }),
      existingScarcity({ inferred: true }),
    ]),
    candidate('wikidata:Q2', [existingScarcity()]),
  ]);
  const second = envelope({
    candidateKey: 'wikidata:Q2',
    canonicalTitle: 'Example Model 2',
    primaryPayloadHash: sha('e'),
    verificationPayloadHash: sha('f'),
  });
  const { result, report } = run(policy(), promotion([envelope(), second]), rd);
  assert.equal(result.status, 1);
  assert.equal(report.metrics.existingEligibleScarcityCandidates, 1);
  assert.equal(report.metrics.materializedRightDataEvidence, 1);
  assert.equal(report.metrics.rejectedMaterializationRecords, 1);
  assert.ok(report.rejectedMaterializationRecords[0].reasons.includes('EXISTING_ELIGIBLE_SCARCITY_EVIDENCE_PRESENT'));
});

test('malformed and duplicate envelopes fail closed across identity provenance quantity hash and status branches', () => {
  const valid = envelope();
  const bad = envelope({
    candidateKey: 'wikidata:Q2',
    canonicalTitle: '',
    vertical: '',
    signalType: 'ESTIMATE',
    quantity: 1.5,
    unit: 'ITEMS',
    primaryPayloadHash: 'bad',
    verificationPayloadHash: 'bad',
    primaryProvenance: { sourceUrl: 'http://bad', rightsClass: '', rightsUrl: 'bad', automatedAccessUrl: 'ftp://bad' },
    independentVerification: { sourceUrl: 'bad', rightsUrl: 'http://bad', automatedAccessUrl: '', verifiedAt: 'bad' },
    chainDigests: { attestationIntakeDigest: 'bad', independentVerificationDigest: 'bad' },
    promotionStatus: 'WRONG',
    materializedRightDataEvidence: true,
    productionScoreActivated: true,
  });
  const duplicate = envelope({ verificationPayloadHash: sha('9') });
  const { result, report } = run(policy(), promotion([valid, bad, duplicate]), rightData());
  assert.equal(result.status, 1);
  assert.equal(report.metrics.materializedRightDataEvidence, 1);
  assert.equal(report.metrics.rejectedMaterializationRecords, 2);
  const reasons = new Set(report.rejectedMaterializationRecords.flatMap((row) => row.reasons));
  for (const expected of [
    'MISSING_CANDIDATE_IDENTITY',
    'DUPLICATE_MATERIALIZATION_CANDIDATE',
    'INVALID_PROMOTION_STATUS',
    'PROMOTION_ALREADY_MARKED_MATERIALIZED',
    'PROMOTION_ALREADY_ACTIVATED_SCORE',
    'INVALID_SIGNAL_TYPE',
    'INVALID_QUANTITY_UNIT',
    'INVALID_EXPLICIT_QUANTITY',
    'INVALID_SOURCE_HASH_CHAIN',
    'INVALID_PRIMARY_PROVENANCE',
    'MISSING_PRIMARY_RIGHTS_CLASS',
    'INVALID_INDEPENDENT_PROVENANCE',
    'INVALID_VERIFIED_AT',
    'INVALID_CHAIN_DIGESTS',
  ]) assert.ok(reasons.has(expected), expected);
  assert.equal(report.disposition, 'FAIL_CLOSED_MATERIALIZATION_REJECTIONS_PRESENT');
});

test('tampered promotion state and unsafe policy topology fail before evidence output', () => {
  const base = policy();
  const badDigest = promotion([envelope()]);
  badDigest.promotionDigest = sha('f');
  const alreadyMaterialized = promotion([envelope()]);
  alreadyMaterialized.metrics.materializedRightDataEvidence = 1;
  const alreadyScored = promotion([envelope()]);
  alreadyScored.metrics.qualifiedProductionScores = 1;
  const cases = [
    [{ ...base, policy: 'WRONG' }, promotion(), rightData()],
    [base, { ...promotion(), mode: 'WRONG' }, rightData()],
    [base, promotion(), { ...rightData(), mode: 'WRONG' }],
    [{ ...base, requiredPromotionStatus: 'WRONG' }, promotion(), rightData()],
    [{ ...base, requiredPrimitive: 'DEMAND_ATTENTION' }, promotion(), rightData()],
    [{ ...base, output: { ...base.output, evidenceClass: 'WRONG' } }, promotion(), rightData()],
    [{ ...base, output: { ...base.output, source: '' } }, promotion(), rightData()],
    [{ ...base, rules: { ...base.rules, normalizedScoreGenerationForbidden: false } }, promotion(), rightData()],
    [base, badDigest, rightData()],
    [base, alreadyMaterialized, rightData()],
    [base, alreadyScored, rightData()],
  ];
  for (const [p, promo, rd] of cases) {
    const { result, report } = run(p, promo, rd);
    assert.equal(result.status, 1);
    assert.equal(report, null);
  }
});

test('null promotion arrays normalize to empty only when their digest proves the empty payload', () => {
  const promo = promotion();
  promo.promotionEnvelopes = null;
  promo.rejectedPromotionRecords = null;
  promo.promotionDigest = digest({ envelopes: [], rejected: [] });
  const { result, report } = run(policy(), promo, rightData());
  assert.equal(result.status, 0, result.stderr);
  assert.equal(report.metrics.promotionReadyInput, 0);
  assert.equal(report.disposition, 'NO_PROMOTION_ENVELOPES_TO_MATERIALIZE');
});
