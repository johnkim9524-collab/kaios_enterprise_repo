import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const SCRIPT = path.join(ROOT, 'scripts', 'kidult100-stage2-reference-precision-harden.mjs');
const POLICY_PATH = path.join(ROOT, 'config', 'kidult100-reference-precision-policy.json');
const policy = JSON.parse(fs.readFileSync(POLICY_PATH, 'utf8'));

function row(overrides = {}) {
  return {
    candidateKey: 'wikidata:Q865677',
    vertical: 'fashion-accessories',
    source: 'wikidata',
    sourceClass: 'REFERENCE_PUBLIC_DATA',
    sourceRecordId: 'Q865677',
    canonicalTitle: 'Birkin',
    description: 'line of tote bags by French luxury goods maker Hermès',
    creator: null,
    sourceUrl: 'https://www.wikidata.org/wiki/Q865677',
    observedAt: '2026-08-14T00:00:00Z',
    rightsClass: 'CC0_STRUCTURED_DATA',
    payloadHash: 'b'.repeat(64),
    query: 'Hermes Birkin',
    semanticRelevant: true,
    semanticStageA: { passed: true },
    semanticStageB: { passed: true },
    ...overrides,
  };
}

function run(candidates) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reference-fashion-plural-'));
  const output = path.join(dir, 'poc.json');
  const audit = path.join(dir, 'audit.json');
  const input = {
    mode: 'KIDULT100_VALUE_BEFORE_DATA_POC',
    semanticPolicy: {},
    metrics: { semanticRecallCandidates: candidates.length },
    candidateBuild: {},
    claims: {},
    candidates,
  };
  const result = spawnSync(process.execPath, [SCRIPT], {
    cwd: ROOT,
    env: {
      ...process.env,
      KIDULTS_REFERENCE_PRECISION_INPUT_JSON: JSON.stringify(input),
      KIDULTS_REFERENCE_PRECISION_OUTPUT: output,
      KIDULTS_REFERENCE_PRECISION_AUDIT_OUTPUT: audit,
    },
    encoding: 'utf8',
  });
  const hardened = fs.existsSync(output) ? JSON.parse(fs.readFileSync(output, 'utf8')) : null;
  const auditReport = fs.existsSync(audit) ? JSON.parse(fs.readFileSync(audit, 'utf8')) : null;
  fs.rmSync(dir, { recursive: true, force: true });
  return { result, hardened, audit: auditReport };
}

test('fashion reference precision recognizes explicit plural tote-bag product context without weakening disallowed-company rejection', () => {
  assert.equal(policy.schemaVersion, '1.0.5');
  assert.ok(policy.productObjectTermsByVertical['fashion-accessories'].includes('tote bags'));
  assert.equal(policy.safety.rightsClassificationRelaxed, false);
  assert.equal(policy.safety.provenanceRelaxed, false);
  assert.equal(policy.safety.unauthorizedScrapingRequested, false);
  assert.equal(policy.safety.paidProviderProcurementRequested, false);

  const company = row({
    candidateKey: 'wikidata:QCOMPANY',
    sourceRecordId: 'QCOMPANY',
    canonicalTitle: 'Hermès',
    description: 'French luxury goods company',
    payloadHash: 'c'.repeat(64),
  });
  const { result, hardened, audit } = run([row(), company]);
  assert.equal(result.status, 0, result.stderr);

  const birkin = hardened.candidates.find((candidate) => candidate.candidateKey === 'wikidata:Q865677');
  const rejectedCompany = hardened.candidates.find((candidate) => candidate.candidateKey === 'wikidata:QCOMPANY');
  assert.equal(birkin.semanticRelevant, true);
  assert.ok(birkin.semanticStageD.reasons.includes('REFERENCE_PRODUCT_DESCRIPTION_CONFIRMED'));
  assert.equal(birkin.sourceRecordId, 'Q865677');
  assert.equal(birkin.rightsClass, 'CC0_STRUCTURED_DATA');
  assert.equal(rejectedCompany.semanticRelevant, false);
  assert.ok(rejectedCompany.semanticStageD.reasons.includes('REFERENCE_DISALLOWED_ENTITY_OR_MEDIA_CONTEXT'));
  assert.equal(audit.safety.rightsClassificationRelaxed, false);
  assert.equal(audit.safety.provenanceRelaxed, false);
  assert.equal(audit.safety.marketEvidenceCreated, false);
  assert.equal(audit.safety.syntheticEvidenceCreated, false);
});
