import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const SCRIPT = path.join(ROOT, 'scripts', 'kidult100-scarcity-source-attestation-intake.mjs');

function baseDiscovery() {
  return {
    mode: 'KIDULT100_SCARCITY_SOURCE_DISCOVERY_PLAN',
    workPackets: [
      { candidateKey: 'wikidata:Q1', canonicalTitle: 'Example Model 1', vertical: 'toys-models' },
      { candidateKey: 'wikidata:Q2', canonicalTitle: 'Example Model 2', vertical: 'watches-jewelry' },
    ],
  };
}

function basePolicy(attestations = []) {
  return {
    policy: 'FAIL_CLOSED_SCARCITY_SOURCE_ATTESTATION_INTAKE',
    requiredInputMode: 'KIDULT100_SCARCITY_SOURCE_DISCOVERY_PLAN',
    requiredSignalType: 'TOTAL_PRODUCED',
    allowedSourceTiers: ['OFFICIAL_MANUFACTURER_OR_BRAND_ARCHIVE'],
    requiredEvidenceFields: ['candidateKey','canonicalTitle','vertical','sourceTier','sourceUrl','rightsClass','rightsUrl','automatedAccessUrl','signalType','quantity','unit','observedAt','payloadHash'],
    rules: {
      exactEntityMatchRequired: true,
      explicitTotalProducedQuantityRequired: true,
      httpsOnly: true,
      explicitCommercialReuseRightsRequired: true,
      documentedAutomatedAccessRequired: true,
      payloadHashRequired: true,
      discoveryResultIsNotEvidence: true,
      searchSnippetIsNotEvidence: true,
      estimatedOrSyntheticQuantityForbidden: true,
      automaticQualificationForbidden: true,
    },
    attestations,
  };
}

function run(policy, discovery, options = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scarcity-attestation-'));
  const out = path.join(dir, 'out.json');
  let policyInput = JSON.stringify(policy);
  let discoveryInput = JSON.stringify(discovery);
  if (options.useFiles) {
    const policyPath = path.join(dir, 'policy.json');
    const discoveryPath = path.join(dir, 'discovery.json');
    fs.writeFileSync(policyPath, JSON.stringify(policy));
    fs.writeFileSync(discoveryPath, JSON.stringify(discovery));
    policyInput = policyPath;
    discoveryInput = discoveryPath;
  }
  const result = spawnSync(process.execPath, [SCRIPT], {
    cwd: ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      KIDULTS_SCARCITY_SOURCE_ATTESTATION_JSON: policyInput,
      KIDULTS_SCARCITY_SOURCE_DISCOVERY_JSON: discoveryInput,
      KIDULTS_SCARCITY_SOURCE_ATTESTATION_OUTPUT: out,
    },
  });
  const report = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : null;
  fs.rmSync(dir, { recursive: true, force: true });
  return { result, report };
}

function validAttestation(overrides = {}) {
  return {
    candidateKey: 'wikidata:Q1',
    canonicalTitle: 'Example Model 1',
    vertical: 'toys-models',
    sourceTier: 'OFFICIAL_MANUFACTURER_OR_BRAND_ARCHIVE',
    sourceUrl: 'https://example.com/model-1',
    rightsClass: 'COMMERCIAL_REUSE_ALLOWED',
    rightsUrl: 'https://example.com/rights',
    automatedAccessUrl: 'https://example.com/api-docs',
    signalType: 'TOTAL_PRODUCED',
    quantity: 1000,
    unit: 'UNITS',
    observedAt: '2026-08-11T00:00:00Z',
    payloadHash: `sha256:${'a'.repeat(64)}`,
    exactEntityMatch: true,
    commercialReuseAllowed: true,
    automatedAccessDocumented: true,
    synthetic: false,
    estimated: false,
    inferred: false,
    ...overrides,
  };
}

test('empty attestation intake stays pending without fabricating evidence', () => {
  const { result, report } = run(basePolicy(), baseDiscovery(), { useFiles: true });
  assert.equal(result.status, 0);
  assert.equal(report.metrics.discoveryReadyTargets, 2);
  assert.equal(report.metrics.structurallyAcceptedAttestations, 0);
  assert.equal(report.metrics.qualifiedScarcitySources, 0);
  assert.equal(report.metrics.pendingDiscoveryTargets, 2);
  assert.equal(report.disposition, 'NO_ATTESTATIONS_SUBMITTED_DISCOVERY_REMAINS_PENDING');
  assert.equal(report.qualificationBoundary.structuralAcceptanceIsNotQualification, true);
});

test('valid attestation is only structurally accepted pending independent verification', () => {
  const { result, report } = run(basePolicy([validAttestation()]), baseDiscovery());
  assert.equal(result.status, 0);
  assert.equal(report.metrics.structurallyAcceptedAttestations, 1);
  assert.equal(report.metrics.qualifiedScarcitySources, 0);
  assert.equal(report.acceptedAttestations[0].qualificationStatus, 'ATTESTATION_STRUCTURALLY_ACCEPTED_PENDING_INDEPENDENT_VERIFICATION');
  assert.equal(report.metrics.pendingDiscoveryTargets, 1);
});

test('unsafe or malformed attestation fails closed across rights provenance identity and quantity branches', () => {
  const bad = validAttestation({
    candidateKey: 'wikidata:UNKNOWN',
    canonicalTitle: 'Wrong title',
    vertical: 'wrong-vertical',
    sourceTier: 'UNAPPROVED',
    sourceUrl: 'http://example.com/model-1',
    rightsUrl: 'notaurl',
    automatedAccessUrl: 'ftp://example.com/api',
    signalType: 'ESTIMATED_TOTAL',
    quantity: 12.5,
    unit: 'ITEMS',
    observedAt: 'not-a-date',
    payloadHash: 'sha256:bad',
    exactEntityMatch: false,
    commercialReuseAllowed: false,
    automatedAccessDocumented: false,
    synthetic: true,
    estimated: true,
    inferred: true,
  });
  const { result, report } = run(basePolicy([bad]), baseDiscovery());
  assert.equal(result.status, 1);
  const reasons = report.rejectedAttestations[0].reasons;
  assert.ok(reasons.includes('CANDIDATE_NOT_IN_DISCOVERY_WORK_PACKETS'));
  assert.ok(reasons.includes('INVALID_SIGNAL_TYPE'));
  assert.ok(reasons.includes('UNAPPROVED_SOURCE_TIER'));
  assert.ok(reasons.includes('SOURCE_URL_NOT_HTTPS'));
  assert.ok(reasons.includes('RIGHTS_URL_NOT_HTTPS'));
  assert.ok(reasons.includes('AUTOMATED_ACCESS_URL_NOT_HTTPS'));
  assert.ok(reasons.includes('QUANTITY_NOT_EXPLICIT_POSITIVE_INTEGER'));
  assert.ok(reasons.includes('INVALID_QUANTITY_UNIT'));
  assert.ok(reasons.includes('INVALID_PAYLOAD_HASH'));
  assert.ok(reasons.includes('EXACT_ENTITY_MATCH_NOT_ATTESTED'));
  assert.ok(reasons.includes('COMMERCIAL_REUSE_NOT_ATTESTED'));
  assert.ok(reasons.includes('AUTOMATED_ACCESS_NOT_ATTESTED'));
  assert.ok(reasons.includes('SYNTHETIC_ESTIMATED_OR_INFERRED_FORBIDDEN'));
  assert.ok(reasons.includes('INVALID_OBSERVED_AT'));
});

test('missing required fields duplicate candidates and packet metadata mismatch fail closed', () => {
  const first = validAttestation();
  const duplicate = validAttestation({ canonicalTitle: 'Wrong title', vertical: 'wrong-vertical', rightsClass: '' });
  const { result, report } = run(basePolicy([first, duplicate]), baseDiscovery());
  assert.equal(result.status, 1);
  assert.equal(report.metrics.structurallyAcceptedAttestations, 1);
  assert.equal(report.metrics.rejectedAttestations, 1);
  const reasons = report.rejectedAttestations[0].reasons;
  assert.ok(reasons.includes('MISSING_RIGHTSCLASS'));
  assert.ok(reasons.includes('DUPLICATE_CANDIDATE_ATTESTATION'));
  assert.ok(reasons.includes('CANONICAL_TITLE_MISMATCH'));
  assert.ok(reasons.includes('VERTICAL_MISMATCH'));
});

test('policy and input safety boundaries reject malformed configuration before intake', () => {
  const cases = [
    [basePolicy(), { ...baseDiscovery(), mode: 'WRONG_MODE' }],
    [{ ...basePolicy(), policy: 'WRONG_POLICY' }, baseDiscovery()],
    [{ ...basePolicy(), requiredSignalType: 'ESTIMATE' }, baseDiscovery()],
    [{ ...basePolicy(), allowedSourceTiers: [] }, baseDiscovery()],
    [{ ...basePolicy(), requiredEvidenceFields: [] }, baseDiscovery()],
    [{ ...basePolicy(), rules: { ...basePolicy().rules, httpsOnly: false } }, baseDiscovery()],
  ];
  for (const [policy, discovery] of cases) {
    const { result, report } = run(policy, discovery);
    assert.equal(result.status, 1);
    assert.equal(report, null);
  }
});

test('non-array attestations safely normalize to an empty pending intake', () => {
  const policy = basePolicy();
  policy.attestations = null;
  const { result, report } = run(policy, baseDiscovery());
  assert.equal(result.status, 0);
  assert.equal(report.metrics.submittedAttestations, 0);
  assert.equal(report.metrics.pendingDiscoveryTargets, 2);
});
