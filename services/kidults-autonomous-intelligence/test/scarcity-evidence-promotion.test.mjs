import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const SCRIPT = path.join(ROOT, 'scripts', 'kidult100-scarcity-evidence-promotion.mjs');
const sha = (char) => `sha256:${char.repeat(64)}`;
const digest = (value) => `sha256:${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;

function policy() {
  return {
    policy: 'FAIL_CLOSED_SCARCITY_EVIDENCE_PROMOTION',
    requiredInputMode: 'KIDULT100_SCARCITY_INDEPENDENT_VERIFICATION',
    requiredVerificationStatus: 'INDEPENDENTLY_VERIFIED_PROMOTION_READY',
    requiredSignalType: 'TOTAL_PRODUCED',
    requiredUnit: 'UNITS',
    rules: {
      verificationDigestMustMatchPayload: true,
      candidateIdentityRequired: true,
      primaryPayloadHashRequired: true,
      verificationPayloadHashRequired: true,
      explicitPositiveIntegerQuantityRequired: true,
      rightDataMutationForbidden: true,
      productionScoringActivationForbidden: true,
      automaticEvidenceQualificationForbidden: true,
    },
    promotionBoundary: {
      outputMode: 'KIDULT100_SCARCITY_PROMOTION_ENVELOPE',
      envelopeStatus: 'PROMOTION_ENVELOPE_READY_NOT_MATERIALIZED',
      materializedRightDataEvidence: 0,
      qualifiedProductionScores: 0,
    },
  };
}

function primary(overrides = {}) {
  return {
    candidateKey: 'wikidata:Q1',
    canonicalTitle: 'Example Model 1',
    vertical: 'toys-models',
    sourceTier: 'OFFICIAL_MANUFACTURER_OR_BRAND_ARCHIVE',
    sourceUrl: 'https://primary.example/model-1',
    rightsClass: 'COMMERCIAL_REUSE_ALLOWED',
    rightsUrl: 'https://primary.example/rights',
    automatedAccessUrl: 'https://primary.example/api',
    signalType: 'TOTAL_PRODUCED',
    quantity: 1000,
    unit: 'UNITS',
    observedAt: '2026-08-11T00:00:00Z',
    payloadHash: sha('a'),
    qualificationStatus: 'ATTESTATION_STRUCTURALLY_ACCEPTED_PENDING_INDEPENDENT_VERIFICATION',
    ...overrides,
  };
}

function attestation(accepted = [primary()], rejected = []) {
  return {
    mode: 'KIDULT100_SCARCITY_SOURCE_ATTESTATION_INTAKE',
    metrics: { qualifiedScarcitySources: 0 },
    acceptedAttestations: accepted,
    rejectedAttestations: rejected,
    intakeDigest: digest({ accepted, rejected }),
  };
}

function verified(overrides = {}) {
  return {
    candidateKey: 'wikidata:Q1',
    canonicalTitle: 'Example Model 1',
    vertical: 'toys-models',
    signalType: 'TOTAL_PRODUCED',
    verifiedQuantity: 1000,
    unit: 'UNITS',
    primaryPayloadHash: sha('a'),
    verificationPayloadHash: sha('b'),
    verificationSourceUrl: 'https://independent.example/model-1',
    verificationRightsUrl: 'https://independent.example/rights',
    verificationAccessUrl: 'https://independent.example/api',
    verifiedAt: '2026-08-11T01:00:00Z',
    verificationStatus: 'INDEPENDENTLY_VERIFIED_PROMOTION_READY',
    promotionBoundary: 'NOT_YET_WRITTEN_TO_RIGHT_DATA',
    ...overrides,
  };
}

function verification(rows = [], rejected = [], overrides = {}) {
  const report = {
    mode: 'KIDULT100_SCARCITY_INDEPENDENT_VERIFICATION',
    metrics: { promotedRightDataEvidence: 0 },
    verifiedAttestations: rows,
    rejectedVerifications: rejected,
    ...overrides,
  };
  report.verificationDigest = digest({ verified: rows, rejected });
  return report;
}

function run(p, v, a, { useFiles = false, outputRelative = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scarcity-promotion-'));
  const out = outputRelative ? path.join('reports', 'test-scarcity-promotion.json') : path.join(dir, 'out.json');
  let policyInput = JSON.stringify(p);
  let verificationInput = JSON.stringify(v);
  let attestationInput = JSON.stringify(a);
  if (useFiles) {
    const pp = path.join(dir, 'policy.json');
    const vp = path.join(dir, 'verification.json');
    const ap = path.join(dir, 'attestation.json');
    fs.writeFileSync(pp, JSON.stringify(p));
    fs.writeFileSync(vp, JSON.stringify(v));
    fs.writeFileSync(ap, JSON.stringify(a));
    policyInput = pp;
    verificationInput = vp;
    attestationInput = ap;
  }
  const result = spawnSync(process.execPath, [SCRIPT], {
    cwd: ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      KIDULTS_SCARCITY_EVIDENCE_PROMOTION_POLICY_JSON: policyInput,
      KIDULTS_SCARCITY_INDEPENDENT_VERIFICATION_JSON: verificationInput,
      KIDULTS_SCARCITY_SOURCE_ATTESTATION_INTAKE_JSON: attestationInput,
      KIDULTS_SCARCITY_EVIDENCE_PROMOTION_OUTPUT: out,
    },
  });
  const resolvedOut = path.isAbsolute(out) ? out : path.join(ROOT, out);
  const report = fs.existsSync(resolvedOut) ? JSON.parse(fs.readFileSync(resolvedOut, 'utf8')) : null;
  if (fs.existsSync(resolvedOut)) fs.rmSync(resolvedOut, { force: true });
  fs.rmSync(dir, { recursive: true, force: true });
  return { result, report };
}

test('empty verified input produces zero promotion envelopes and no Right Data mutation', () => {
  const { result, report } = run(policy(), verification(), attestation(), { useFiles: true, outputRelative: true });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(report.metrics.independentlyVerifiedInput, 0);
  assert.equal(report.metrics.promotionReadyEnvelopes, 0);
  assert.equal(report.metrics.materializedRightDataEvidence, 0);
  assert.equal(report.disposition, 'NO_INDEPENDENTLY_VERIFIED_RECORDS_TO_PROMOTE');
  assert.equal(report.boundary.promotionEnvelopeIsNotRightDataMutation, true);
});

test('independently verified chain creates an envelope but never materializes evidence or scores', () => {
  const row = verified();
  const { result, report } = run(policy(), verification([row]), attestation());
  assert.equal(result.status, 0, result.stderr);
  assert.equal(report.metrics.promotionReadyEnvelopes, 1);
  assert.equal(report.metrics.materializedRightDataEvidence, 0);
  assert.equal(report.metrics.qualifiedProductionScores, 0);
  assert.equal(report.promotionEnvelopes[0].promotionStatus, 'PROMOTION_ENVELOPE_READY_NOT_MATERIALIZED');
  assert.equal(report.promotionEnvelopes[0].materializedRightDataEvidence, false);
  assert.equal(report.promotionEnvelopes[0].primaryProvenance.sourceUrl, 'https://primary.example/model-1');
  assert.equal(report.promotionEnvelopes[0].independentVerification.sourceUrl, 'https://independent.example/model-1');
  assert.match(report.promotionDigest, /^sha256:[a-f0-9]{64}$/);
});

test('malformed verified records fail closed across identity status quantity unit and hash branches', () => {
  const rows = [
    verified({ candidateKey: '', canonicalTitle: '', vertical: '', verificationStatus: 'WRONG', promotionBoundary: 'WRITTEN', signalType: 'ESTIMATE', unit: 'ITEMS', verifiedQuantity: 1.5, primaryPayloadHash: 'bad', verificationPayloadHash: 'bad' }),
    verified({ candidateKey: 'wikidata:Q9', canonicalTitle: 'Unknown', vertical: 'toys-models' }),
  ];
  const { result, report } = run(policy(), verification(rows), attestation());
  assert.equal(result.status, 1);
  assert.equal(report.metrics.rejectedPromotionRecords, 2);
  const reasons = new Set(report.rejectedPromotionRecords.flatMap((row) => row.reasons));
  for (const expected of ['MISSING_CANDIDATE_IDENTITY','NO_MATCHING_PRIMARY_ATTESTATION','INVALID_VERIFICATION_STATUS','UPSTREAM_PROMOTION_BOUNDARY_VIOLATION','INVALID_SIGNAL_TYPE','INVALID_QUANTITY_UNIT','INVALID_VERIFIED_QUANTITY','INVALID_PRIMARY_PAYLOAD_HASH','INVALID_VERIFICATION_PAYLOAD_HASH']) assert.ok(reasons.has(expected), expected);
  assert.equal(report.disposition, 'FAIL_CLOSED_PROMOTION_REJECTIONS_PRESENT');
});

test('primary chain mismatch and duplicate promotion attempts fail closed without consuming the first valid envelope', () => {
  const valid = verified();
  const mismatch = verified({ canonicalTitle: 'Wrong title', vertical: 'watches-jewelry', verifiedQuantity: 999, primaryPayloadHash: sha('c') });
  const duplicate = verified({ verificationPayloadHash: sha('d') });
  const { result, report } = run(policy(), verification([valid, mismatch, duplicate]), attestation());
  assert.equal(result.status, 1);
  assert.equal(report.metrics.promotionReadyEnvelopes, 1);
  assert.equal(report.metrics.rejectedPromotionRecords, 2);
  const reasons = new Set(report.rejectedPromotionRecords.flatMap((row) => row.reasons));
  assert.ok(reasons.has('DUPLICATE_PROMOTION_CANDIDATE'));
  assert.ok(reasons.has('PRIMARY_HASH_CHAIN_MISMATCH'));
  assert.ok(reasons.has('PRIMARY_QUANTITY_CHAIN_MISMATCH'));
  assert.ok(reasons.has('PRIMARY_IDENTITY_CHAIN_MISMATCH'));
});

test('tampered digests and upstream mutation fail before promotion', () => {
  const cases = [];
  const badVerificationDigest = verification([verified()]);
  badVerificationDigest.verificationDigest = sha('f');
  cases.push([policy(), badVerificationDigest, attestation()]);
  const badAttestationDigest = attestation();
  badAttestationDigest.intakeDigest = sha('f');
  cases.push([policy(), verification([verified()]), badAttestationDigest]);
  const mutated = verification([verified()]);
  mutated.metrics.promotedRightDataEvidence = 1;
  cases.push([policy(), mutated, attestation()]);
  const invalidVerificationDigest = verification([verified()]);
  invalidVerificationDigest.verificationDigest = 'invalid';
  cases.push([policy(), invalidVerificationDigest, attestation()]);
  const invalidIntakeDigest = attestation();
  invalidIntakeDigest.intakeDigest = 'invalid';
  cases.push([policy(), verification([verified()]), invalidIntakeDigest]);
  for (const [p, v, a] of cases) {
    const { result, report } = run(p, v, a);
    assert.equal(result.status, 1);
    assert.equal(report, null);
  }
});

test('unsafe policy and input topology fail before envelope creation', () => {
  const p = policy();
  const cases = [
    [{ ...p, policy: 'WRONG' }, verification(), attestation()],
    [p, { ...verification(), mode: 'WRONG' }, attestation()],
    [p, verification(), { ...attestation(), mode: 'WRONG' }],
    [{ ...p, requiredVerificationStatus: 'WRONG' }, verification(), attestation()],
    [{ ...p, requiredSignalType: 'ESTIMATE' }, verification(), attestation()],
    [{ ...p, requiredUnit: 'ITEMS' }, verification(), attestation()],
    [{ ...p, rules: { ...p.rules, rightDataMutationForbidden: false } }, verification(), attestation()],
    [{ ...p, promotionBoundary: { ...p.promotionBoundary, materializedRightDataEvidence: 1 } }, verification(), attestation()],
    [{ ...p, promotionBoundary: { ...p.promotionBoundary, outputMode: 'WRONG' } }, verification(), attestation()],
  ];
  for (const [badPolicy, v, a] of cases) {
    const { result, report } = run(badPolicy, v, a);
    assert.equal(result.status, 1);
    assert.equal(report, null);
  }
});
