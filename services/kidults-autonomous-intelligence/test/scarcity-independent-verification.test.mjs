import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const SCRIPT = path.join(ROOT, 'scripts', 'kidult100-scarcity-independent-verification.mjs');

function primary(overrides = {}) {
  return {
    candidateKey: 'wikidata:Q1',
    canonicalTitle: 'Example Model 1',
    vertical: 'toys-models',
    sourceUrl: 'https://primary.example/model-1',
    payloadHash: `sha256:${'a'.repeat(64)}`,
    quantity: 1000,
    unit: 'UNITS',
    qualificationStatus: 'ATTESTATION_STRUCTURALLY_ACCEPTED_PENDING_INDEPENDENT_VERIFICATION',
    ...overrides,
  };
}

function intake(acceptedAttestations = []) {
  return {
    mode: 'KIDULT100_SCARCITY_SOURCE_ATTESTATION_INTAKE',
    acceptedAttestations,
  };
}

function policy(verifications = []) {
  return {
    policy: 'FAIL_CLOSED_SCARCITY_INDEPENDENT_VERIFICATION',
    requiredInputMode: 'KIDULT100_SCARCITY_SOURCE_ATTESTATION_INTAKE',
    requiredSignalType: 'TOTAL_PRODUCED',
    requiredVerificationFields: [
      'candidateKey',
      'primaryPayloadHash',
      'verificationSourceUrl',
      'verificationRightsUrl',
      'verificationAccessUrl',
      'signalType',
      'verifiedQuantity',
      'unit',
      'verifiedAt',
      'verificationPayloadHash',
    ],
    rules: {
      acceptedAttestationRequired: true,
      independentSourceRequired: true,
      httpsOnly: true,
      exactEntityMatchRequired: true,
      quantityMatchRequired: true,
      primaryPayloadHashMatchRequired: true,
      commercialReuseRightsConfirmationRequired: true,
      documentedAutomatedAccessConfirmationRequired: true,
      verificationPayloadHashRequired: true,
      syntheticEstimatedOrInferredForbidden: true,
      automaticProductionScoringForbidden: true,
    },
    verifications,
  };
}

function verification(overrides = {}) {
  return {
    candidateKey: 'wikidata:Q1',
    primaryPayloadHash: `sha256:${'a'.repeat(64)}`,
    verificationSourceUrl: 'https://independent.example/model-1',
    verificationRightsUrl: 'https://rights.example/license',
    verificationAccessUrl: 'https://access.example/api-docs',
    signalType: 'TOTAL_PRODUCED',
    verifiedQuantity: 1000,
    unit: 'UNITS',
    verifiedAt: '2026-08-11T06:00:00Z',
    verificationPayloadHash: `sha256:${'b'.repeat(64)}`,
    exactEntityMatch: true,
    commercialReuseAllowed: true,
    automatedAccessDocumented: true,
    quantityMatchesPrimary: true,
    synthetic: false,
    estimated: false,
    inferred: false,
    ...overrides,
  };
}

function run(policyValue, intakeValue, options = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scarcity-independent-verification-'));
  const out = path.join(dir, 'out.json');
  let policyInput = JSON.stringify(policyValue);
  let intakeInput = JSON.stringify(intakeValue);
  if (options.useFiles) {
    const policyPath = path.join(dir, 'policy.json');
    const intakePath = path.join(dir, 'intake.json');
    fs.writeFileSync(policyPath, JSON.stringify(policyValue));
    fs.writeFileSync(intakePath, JSON.stringify(intakeValue));
    policyInput = policyPath;
    intakeInput = intakePath;
  }
  if (options.missingPolicyFile) policyInput = path.join(dir, 'missing-policy.json');

  const result = spawnSync(process.execPath, [SCRIPT], {
    cwd: ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      KIDULTS_SCARCITY_INDEPENDENT_VERIFICATION_JSON: policyInput,
      KIDULTS_SCARCITY_SOURCE_ATTESTATION_INTAKE_JSON: intakeInput,
      KIDULTS_SCARCITY_INDEPENDENT_VERIFICATION_OUTPUT: out,
    },
  });
  const report = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : null;
  fs.rmSync(dir, { recursive: true, force: true });
  return { result, report };
}

test('no accepted attestations remains safely empty without fabricating verification', () => {
  const { result, report } = run(policy(), intake(), { useFiles: true });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(report.metrics.acceptedPrimaryAttestations, 0);
  assert.equal(report.metrics.independentlyVerified, 0);
  assert.equal(report.metrics.promotedRightDataEvidence, 0);
  assert.equal(report.disposition, 'NO_ACCEPTED_ATTESTATIONS_TO_VERIFY');
  assert.equal(report.promotionBoundary.independentVerificationIsNotRightDataMutation, true);
});

test('accepted primary without verification remains pending', () => {
  const { result, report } = run(policy(), intake([primary()]));
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(report.metrics.acceptedPrimaryAttestations, 1);
  assert.equal(report.metrics.submittedVerifications, 0);
  assert.equal(report.metrics.pendingPrimaryAttestations, 1);
  assert.equal(report.disposition, 'NO_VERIFICATIONS_SUBMITTED_ATTESTATIONS_REMAIN_PENDING');
  assert.equal(report.pendingPrimaryAttestations[0].quantity, 1000);
});

test('valid independent verification becomes promotion-ready but is not written to Right Data', () => {
  const { result, report } = run(policy([verification()]), intake([primary()]));
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(report.metrics.independentlyVerified, 1);
  assert.equal(report.metrics.qualifiedScarcitySources, 1);
  assert.equal(report.metrics.promotedRightDataEvidence, 0);
  assert.equal(report.metrics.pendingPrimaryAttestations, 0);
  assert.equal(report.verifiedAttestations[0].verificationStatus, 'INDEPENDENTLY_VERIFIED_PROMOTION_READY');
  assert.equal(report.verifiedAttestations[0].promotionBoundary, 'NOT_YET_WRITTEN_TO_RIGHT_DATA');
  assert.equal(report.disposition, 'INDEPENDENT_VERIFICATION_COMPLETE_PROMOTION_GATE_REQUIRED');
});

test('malformed verification fails closed across identity hash source rights quantity and provenance', () => {
  const bad = verification({
    candidateKey: 'wikidata:UNKNOWN',
    primaryPayloadHash: 'sha256:bad',
    verificationPayloadHash: 'bad',
    verificationSourceUrl: 'http://bad.example/source',
    verificationRightsUrl: 'notaurl',
    verificationAccessUrl: 'ftp://bad.example/access',
    signalType: 'ESTIMATED_TOTAL',
    verifiedQuantity: 12.5,
    unit: 'ITEMS',
    verifiedAt: 'not-a-date',
    exactEntityMatch: false,
    commercialReuseAllowed: false,
    automatedAccessDocumented: false,
    quantityMatchesPrimary: false,
    synthetic: true,
    estimated: true,
    inferred: true,
  });
  const { result, report } = run(policy([bad]), intake([primary()]));
  assert.equal(result.status, 1);
  const reasons = report.rejectedVerifications[0].reasons;
  for (const expected of [
    'NO_ACCEPTED_PRIMARY_ATTESTATION',
    'INVALID_SIGNAL_TYPE',
    'PRIMARY_PAYLOAD_HASH_MISMATCH',
    'INVALID_VERIFICATION_PAYLOAD_HASH',
    'VERIFICATION_SOURCE_URL_NOT_HTTPS',
    'VERIFICATION_RIGHTS_URL_NOT_HTTPS',
    'VERIFICATION_ACCESS_URL_NOT_HTTPS',
    'EXACT_ENTITY_MATCH_NOT_VERIFIED',
    'COMMERCIAL_REUSE_NOT_VERIFIED',
    'AUTOMATED_ACCESS_NOT_VERIFIED',
    'QUANTITY_MATCH_NOT_VERIFIED',
    'VERIFIED_QUANTITY_NOT_POSITIVE_INTEGER',
    'INVALID_QUANTITY_UNIT',
    'SYNTHETIC_ESTIMATED_OR_INFERRED_FORBIDDEN',
    'INVALID_VERIFIED_AT',
  ]) assert.ok(reasons.includes(expected), expected);
  assert.equal(report.disposition, 'FAIL_CLOSED_VERIFICATION_REJECTIONS_PRESENT');
});

test('same-host source quantity mismatch and duplicate verification are rejected deterministically', () => {
  const first = verification({ verificationSourceUrl: 'https://primary.example/independent-document', verifiedQuantity: 999 });
  const duplicate = verification({ verificationSourceUrl: 'https://other.example/document' });
  const { result, report } = run(policy([first, duplicate]), intake([primary()]));
  assert.equal(result.status, 1);
  assert.equal(report.metrics.rejectedVerifications, 2);
  assert.ok(report.rejectedVerifications[0].reasons.includes('INDEPENDENT_SOURCE_NOT_DISTINCT'));
  assert.ok(report.rejectedVerifications[0].reasons.includes('VERIFIED_QUANTITY_DIFFERS_FROM_PRIMARY'));
  assert.ok(report.rejectedVerifications[1].reasons.includes('DUPLICATE_CANDIDATE_VERIFICATION') === false);
});

test('duplicate is detected after one valid verification has been accepted', () => {
  const { result, report } = run(policy([verification(), verification({ verificationSourceUrl: 'https://second.example/source' })]), intake([primary()]));
  assert.equal(result.status, 1);
  assert.equal(report.metrics.independentlyVerified, 1);
  assert.equal(report.metrics.rejectedVerifications, 1);
  assert.ok(report.rejectedVerifications[0].reasons.includes('DUPLICATE_CANDIDATE_VERIFICATION'));
});

test('invalid primary source URL cannot satisfy independent-source verification', () => {
  const { result, report } = run(policy([verification()]), intake([primary({ sourceUrl: 'not-a-url' })]));
  assert.equal(result.status, 1);
  assert.ok(report.rejectedVerifications[0].reasons.includes('INDEPENDENT_SOURCE_NOT_DISTINCT'));
});

test('missing required fields and null record fail closed safely', () => {
  const missing = verification();
  delete missing.verificationRightsUrl;
  const { result, report } = run(policy([missing, null]), intake([primary()]));
  assert.equal(result.status, 1);
  assert.ok(report.rejectedVerifications[0].reasons.includes('MISSING_VERIFICATIONRIGHTSURL'));
  assert.ok(report.rejectedVerifications[1].reasons.includes('NO_ACCEPTED_PRIMARY_ATTESTATION'));
});

test('policy input and safety boundary violations fail before report generation', () => {
  const cases = [
    [{ ...policy(), policy: 'WRONG_POLICY' }, intake()],
    [policy(), { ...intake(), mode: 'WRONG_MODE' }],
    [{ ...policy(), requiredSignalType: 'ESTIMATE' }, intake()],
    [{ ...policy(), requiredVerificationFields: [] }, intake()],
    [{ ...policy(), rules: { ...policy().rules, httpsOnly: false } }, intake()],
  ];
  for (const [policyValue, intakeValue] of cases) {
    const { result, report } = run(policyValue, intakeValue);
    assert.equal(result.status, 1);
    assert.equal(report, null);
  }
  const missing = run(policy(), intake(), { missingPolicyFile: true });
  assert.equal(missing.result.status, 1);
  assert.equal(missing.report, null);
});

test('non-array verifications safely normalize to empty intake', () => {
  const p = policy();
  p.verifications = null;
  const { result, report } = run(p, intake([primary()]));
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(report.metrics.submittedVerifications, 0);
  assert.equal(report.metrics.pendingPrimaryAttestations, 1);
});
