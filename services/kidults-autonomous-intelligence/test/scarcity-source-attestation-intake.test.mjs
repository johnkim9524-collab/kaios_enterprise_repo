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

function run(policy, discovery) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scarcity-attestation-'));
  const out = path.join(dir, 'out.json');
  const result = spawnSync(process.execPath, [SCRIPT], {
    cwd: ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      KIDULTS_SCARCITY_SOURCE_ATTESTATION_JSON: JSON.stringify(policy),
      KIDULTS_SCARCITY_SOURCE_DISCOVERY_JSON: JSON.stringify(discovery),
      KIDULTS_SCARCITY_SOURCE_ATTESTATION_OUTPUT: out,
    },
  });
  const report = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : null;
  fs.rmSync(dir, { recursive: true, force: true });
  return { result, report };
}

function validAttestation() {
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
  };
}

test('empty attestation intake stays pending without fabricating evidence', () => {
  const { result, report } = run(basePolicy(), baseDiscovery());
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

test('unsafe or malformed attestation fails closed', () => {
  const bad = validAttestation();
  bad.sourceUrl = 'http://example.com/model-1';
  bad.quantity = 12.5;
  bad.commercialReuseAllowed = false;
  bad.synthetic = true;
  bad.payloadHash = 'sha256:bad';
  const { result, report } = run(basePolicy([bad]), baseDiscovery());
  assert.equal(result.status, 1);
  assert.equal(report.metrics.rejectedAttestations, 1);
  assert.equal(report.metrics.structurallyAcceptedAttestations, 0);
  assert.equal(report.disposition, 'FAIL_CLOSED_ATTESTATION_REJECTIONS_PRESENT');
  assert.ok(report.rejectedAttestations[0].reasons.includes('SOURCE_URL_NOT_HTTPS'));
  assert.ok(report.rejectedAttestations[0].reasons.includes('QUANTITY_NOT_EXPLICIT_POSITIVE_INTEGER'));
  assert.ok(report.rejectedAttestations[0].reasons.includes('COMMERCIAL_REUSE_NOT_ATTESTED'));
  assert.ok(report.rejectedAttestations[0].reasons.includes('SYNTHETIC_ESTIMATED_OR_INFERRED_FORBIDDEN'));
  assert.ok(report.rejectedAttestations[0].reasons.includes('INVALID_PAYLOAD_HASH'));
});
