import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const SCRIPT = path.join(ROOT, 'scripts', 'kidult100-stage2-archive-precision-harden.mjs');
const POLICY_PATH = path.join(ROOT, 'config', 'kidult100-archive-precision-policy.json');
const DEFAULT_POLICY = JSON.parse(fs.readFileSync(POLICY_PATH, 'utf8'));

function candidate(overrides = {}) {
  return {
    candidateKey: 'wikidata:Q1',
    vertical: 'toys-models',
    source: 'wikidata',
    sourceClass: 'REFERENCE_PUBLIC_DATA',
    sourceRecordId: 'Q1',
    canonicalTitle: 'Example Product 100',
    description: 'toy',
    creator: null,
    sourceUrl: 'https://www.wikidata.org/wiki/Q1',
    observedAt: '2026-08-11T00:00:00Z',
    rightsClass: 'CC0_STRUCTURED_DATA',
    payloadHash: 'a'.repeat(64),
    query: 'Example Product 100',
    semanticRelevant: true,
    semanticRelevanceScore: 0.8,
    semanticStageA: { passed: true },
    semanticStageB: { passed: true },
    ...overrides,
  };
}

function report(candidates) {
  return {
    schemaVersion: '2.5.0',
    mode: 'KIDULT100_VALUE_BEFORE_DATA_POC',
    semanticPolicy: { version: 'SEMANTIC_V2_2_TWO_STAGE' },
    metrics: {
      uniqueNormalizedCandidates: candidates.length,
      semanticRecallCandidates: candidates.filter((row) => row.semanticStageA?.passed).length,
      semanticPrecisionRejectedCandidates: 0,
      semanticRelevantCandidates: candidates.filter((row) => row.semanticRelevant).length,
      semanticRelevanceCoverage: 1,
      relevantByVertical: {},
      relevantBySource: {},
    },
    candidateBuild: { outcome: 'BUILT_NOT_CERTIFIED' },
    claims: { decisionGradeRightDataCertified: false, finalKidult100Certified: false },
    candidates,
    sourceErrors: [],
  };
}

function run(input, options = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-archive-precision-'));
  const output = path.join(dir, 'poc.json');
  const audit = path.join(dir, 'audit.json');
  const env = {
    ...process.env,
    KIDULTS_ARCHIVE_PRECISION_INPUT_JSON: options.inputValue ?? JSON.stringify(input),
    KIDULTS_ARCHIVE_PRECISION_OUTPUT: output,
    KIDULTS_ARCHIVE_PRECISION_AUDIT_OUTPUT: audit,
  };
  if (options.policy !== undefined) env.KIDULTS_ARCHIVE_PRECISION_POLICY_JSON = JSON.stringify(options.policy);
  const result = spawnSync(process.execPath, [SCRIPT], { cwd: ROOT, env, encoding: 'utf8' });
  const hardened = fs.existsSync(output) ? JSON.parse(fs.readFileSync(output, 'utf8')) : null;
  const auditReport = fs.existsSync(audit) ? JSON.parse(fs.readFileSync(audit, 'utf8')) : null;
  fs.rmSync(dir, { recursive: true, force: true });
  return { result, hardened, audit: auditReport };
}

test('downgrades institutional archive media, creator-homograph, and partial-query false positives without touching open-data candidates', () => {
  const rows = [
    candidate(),
    candidate({
      candidateKey: 'met:lego-textile', source: 'met', sourceClass: 'INSTITUTION_ARCHIVE', sourceRecordId: '1',
      sourceUrl: 'https://www.metmuseum.org/art/collection/search/1', rightsClass: 'OPEN_ACCESS_PUBLIC_METADATA',
      vertical: 'toys-models', query: 'LEGO', canonicalTitle: 'Lego', description: 'Textile', creator: 'Monika Correa',
    }),
    candidate({
      candidateKey: 'met:barbie-print', source: 'met', sourceClass: 'INSTITUTION_ARCHIVE', sourceRecordId: '2',
      sourceUrl: 'https://www.metmuseum.org/art/collection/search/2', rightsClass: 'OPEN_ACCESS_PUBLIC_METADATA',
      vertical: 'toys-models', query: 'Barbie', canonicalTitle: 'Portrait of Louis Auguste', description: 'Print', creator: 'Jacques Barbié',
    }),
    candidate({
      candidateKey: 'aic:porsche-photo', source: 'aic', sourceClass: 'INSTITUTION_ARCHIVE', sourceRecordId: '3',
      sourceUrl: 'https://api.artic.edu/api/v1/artworks/3', rightsClass: 'CC0_EXCEPT_DESCRIPTION_EXCLUDED',
      vertical: 'automobiles-mobility', query: 'Porsche 911', canonicalTitle: 'Porsche 911', description: 'photograph', creator: 'Unknown',
    }),
    candidate({
      candidateKey: 'met:eames-chair', source: 'met', sourceClass: 'INSTITUTION_ARCHIVE', sourceRecordId: '4',
      sourceUrl: 'https://www.metmuseum.org/art/collection/search/4', rightsClass: 'OPEN_ACCESS_PUBLIC_METADATA',
      vertical: 'design-furniture', query: 'Eames chair', canonicalTitle: 'Eames Lounge Chair', description: 'Chair', creator: 'Charles Eames',
    }),
    candidate({
      candidateKey: 'met:leica-m3', source: 'met', sourceClass: 'INSTITUTION_ARCHIVE', sourceRecordId: '5',
      sourceUrl: 'https://www.metmuseum.org/art/collection/search/5', rightsClass: 'OPEN_ACCESS_PUBLIC_METADATA',
      vertical: 'technology-cameras', query: 'Leica M3', canonicalTitle: 'Leica M3', description: 'Object', creator: 'Leica Camera AG',
    }),
  ];
  const { result, hardened, audit } = run(report(rows));
  assert.equal(result.status, 0, result.stderr);
  assert.equal(audit.metrics.inputRelevantCandidates, 6);
  assert.equal(audit.metrics.archiveRelevantEvaluated, 5);
  assert.equal(audit.metrics.archiveFalsePositivesDowngraded, 3);
  assert.equal(audit.metrics.outputRelevantCandidates, 3);
  assert.equal(hardened.metrics.semanticRelevantCandidates, 3);
  assert.equal(hardened.metrics.semanticArchivePrecisionRejectedCandidates, 3);
  assert.equal(hardened.semanticPolicy.version, 'SEMANTIC_V2_3_ARCHIVE_PRECISION_HARDENED');
  assert.equal(hardened.candidates.find((row) => row.candidateKey === 'wikidata:Q1').semanticRelevant, true);
  assert.equal(hardened.candidates.find((row) => row.candidateKey === 'met:eames-chair').semanticRelevant, true);
  assert.equal(hardened.candidates.find((row) => row.candidateKey === 'met:leica-m3').semanticRelevant, true);
  assert.equal(hardened.candidates.find((row) => row.candidateKey === 'met:lego-textile').semanticRelevant, false);
  assert.ok(hardened.candidates.find((row) => row.candidateKey === 'aic:porsche-photo').semanticStageC.reasons.includes('ARCHIVE_MEDIA_OBJECT_NOT_TARGET_PRODUCT'));
  assert.equal(hardened.candidates[0].rightsClass, rows[0].rightsClass);
  assert.equal(hardened.candidates[0].payloadHash, rows[0].payloadHash);
  assert.equal(audit.safety.normalizedScoreCreated, false);
});

test('rejects partial multi-token query coincidence and creator-only anchor when no target product object is established', () => {
  const rows = [
    candidate({
      candidateKey: 'met:hot-milk-jug', source: 'met', sourceClass: 'INSTITUTION_ARCHIVE', sourceRecordId: '6',
      sourceUrl: 'https://www.metmuseum.org/art/collection/search/6', rightsClass: 'OPEN_ACCESS_PUBLIC_METADATA',
      vertical: 'toys-models', query: 'Hot Wheels', canonicalTitle: 'Hot milk jug', description: 'Hot milk jug', creator: null,
    }),
    candidate({
      candidateKey: 'met:creator-homograph', source: 'met', sourceClass: 'INSTITUTION_ARCHIVE', sourceRecordId: '7',
      sourceUrl: 'https://www.metmuseum.org/art/collection/search/7', rightsClass: 'OPEN_ACCESS_PUBLIC_METADATA',
      vertical: 'toys-models', query: 'Barbie', canonicalTitle: 'Portrait of Louis', description: 'Object', creator: 'Jacques Barbié',
    }),
  ];
  const { result, hardened, audit } = run(report(rows));
  assert.equal(result.status, 0, result.stderr);
  assert.equal(audit.metrics.archiveFalsePositivesDowngraded, 2);
  const partial = hardened.candidates.find((row) => row.candidateKey === 'met:hot-milk-jug');
  const creator = hardened.candidates.find((row) => row.candidateKey === 'met:creator-homograph');
  assert.ok(partial.semanticStageC.reasons.includes('ARCHIVE_PARTIAL_MULTI_TOKEN_QUERY_MATCH_ONLY'));
  assert.ok(creator.semanticStageC.reasons.includes('ARCHIVE_CREATOR_ONLY_QUERY_ANCHOR'));
});

test('retains contextual fashion textile only when the description itself establishes the target product object', () => {
  const rows = [
    candidate({
      candidateKey: 'met:prada-handbag', source: 'met', sourceClass: 'INSTITUTION_ARCHIVE', sourceRecordId: '8',
      sourceUrl: 'https://www.metmuseum.org/art/collection/search/8', rightsClass: 'OPEN_ACCESS_PUBLIC_METADATA',
      vertical: 'fashion-accessories', query: 'Prada nylon bag', canonicalTitle: 'Prada Nylon Bag', description: 'Textile handbag', creator: 'Prada',
    }),
    candidate({
      candidateKey: 'met:textile-only', source: 'met', sourceClass: 'INSTITUTION_ARCHIVE', sourceRecordId: '9',
      sourceUrl: 'https://www.metmuseum.org/art/collection/search/9', rightsClass: 'OPEN_ACCESS_PUBLIC_METADATA',
      vertical: 'fashion-accessories', query: 'Prada nylon bag', canonicalTitle: 'Prada Nylon Bag', description: 'Textile', creator: 'Prada',
    }),
  ];
  const { result, hardened, audit } = run(report(rows));
  assert.equal(result.status, 0, result.stderr);
  assert.equal(audit.metrics.archiveRelevantRetained, 1);
  assert.equal(audit.metrics.archiveFalsePositivesDowngraded, 1);
  assert.equal(hardened.candidates[0].semanticRelevant, true);
  assert.ok(hardened.candidates[0].semanticStageC.reasons.includes('ARCHIVE_PRODUCT_OBJECT_DESCRIPTION_CONFIRMED'));
  assert.equal(hardened.candidates[1].semanticRelevant, false);
  assert.ok(hardened.candidates[1].semanticStageC.reasons.includes('ARCHIVE_CONTEXTUAL_OBJECT_WITHOUT_PRODUCT_DESCRIPTION'));
});

test('never reactivates a candidate already rejected upstream', () => {
  const rows = [candidate({ semanticRelevant: false, semanticStageB: { passed: false } })];
  const { result, hardened, audit } = run(report(rows));
  assert.equal(result.status, 0, result.stderr);
  assert.equal(hardened.candidates[0].semanticRelevant, false);
  assert.equal(hardened.candidates[0].semanticStageC.disposition, 'NOT_EVALUATED_PREVIOUSLY_IRRELEVANT');
  assert.equal(audit.metrics.archiveRelevantEvaluated, 0);
  assert.equal(audit.disposition, 'NO_ARCHIVE_PRECISION_CHANGES_REQUIRED');
});

test('fails closed on wrong mode, unsafe policy, duplicate identities, unknown vertical, and non-array candidate topology', () => {
  const valid = report([candidate()]);
  const cases = [
    [{ ...valid, mode: 'WRONG_MODE' }, DEFAULT_POLICY],
    [valid, { ...DEFAULT_POLICY, rules: { ...DEFAULT_POLICY.rules, preserveRightsAndProvenance: false } }],
    [report([candidate(), candidate()]), DEFAULT_POLICY],
    [report([candidate({ candidateKey: 'met:unknown', source: 'met', sourceClass: 'INSTITUTION_ARCHIVE', sourceRecordId: '10', vertical: 'unknown', sourceUrl: 'https://example.com/10' })]), DEFAULT_POLICY],
    [{ ...valid, candidates: null }, DEFAULT_POLICY],
  ];
  for (const [input, policy] of cases) {
    const { result, hardened, audit } = run(input, { policy });
    assert.notEqual(result.status, 0);
    assert.equal(hardened, null);
    assert.equal(audit, null);
  }
});

test('missing file input and unsafe safety flag fail before writing hardened output', () => {
  const missing = path.join(os.tmpdir(), `missing-archive-precision-${Date.now()}.json`);
  const first = run({}, { inputValue: missing });
  assert.notEqual(first.result.status, 0);
  assert.equal(first.hardened, null);
  const unsafe = { ...DEFAULT_POLICY, safety: { ...DEFAULT_POLICY.safety, syntheticEvidenceCreated: true } };
  const second = run(report([candidate()]), { policy: unsafe });
  assert.notEqual(second.result.status, 0);
  assert.equal(second.hardened, null);
});
