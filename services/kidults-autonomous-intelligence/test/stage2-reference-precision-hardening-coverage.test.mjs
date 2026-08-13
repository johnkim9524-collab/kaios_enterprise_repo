import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const SCRIPT = path.join(ROOT, 'scripts', 'kidult100-stage2-reference-precision-harden.mjs');
const POLICY_PATH = path.join(ROOT, 'config', 'kidult100-reference-precision-policy.json');
const DEFAULT_POLICY = JSON.parse(fs.readFileSync(POLICY_PATH, 'utf8'));

function row(overrides = {}) {
  return {
    candidateKey: 'wikidata:Q-COVERAGE',
    vertical: 'watches-jewelry',
    source: 'wikidata',
    sourceClass: 'REFERENCE_PUBLIC_DATA',
    sourceRecordId: 'Q-COVERAGE',
    canonicalTitle: 'Rolex Submariner wristwatch',
    description: 'Swiss collectible object',
    sourceUrl: 'https://www.wikidata.org/wiki/Q-COVERAGE',
    observedAt: '2026-08-11T00:00:00Z',
    rightsClass: 'CC0_STRUCTURED_DATA',
    payloadHash: 'd'.repeat(64),
    query: 'Rolex Submariner',
    semanticRelevant: true,
    semanticStageA: { passed: true },
    semanticStageB: { passed: true },
    ...overrides,
  };
}

function inputReport(candidates) {
  return {
    mode: 'KIDULT100_VALUE_BEFORE_DATA_POC',
    semanticPolicy: {},
    metrics: { semanticRecallCandidates: candidates.length },
    candidateBuild: {},
    claims: {},
    candidates,
  };
}

function run(candidates) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reference-precision-coverage-'));
  const output = path.join(dir, 'poc.json');
  const audit = path.join(dir, 'audit.json');
  const result = spawnSync(process.execPath, [SCRIPT], {
    cwd: ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      KIDULTS_REFERENCE_PRECISION_INPUT_JSON: JSON.stringify(inputReport(candidates)),
      KIDULTS_REFERENCE_PRECISION_OUTPUT: output,
      KIDULTS_REFERENCE_PRECISION_AUDIT_OUTPUT: audit,
    },
  });
  const hardened = fs.existsSync(output) ? JSON.parse(fs.readFileSync(output, 'utf8')) : null;
  const auditReport = fs.existsSync(audit) ? JSON.parse(fs.readFileSync(audit, 'utf8')) : null;
  fs.rmSync(dir, { recursive: true, force: true });
  return { result, hardened, audit: auditReport };
}

function runPolicy(policy, candidates) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reference-precision-policy-'));
  const result = spawnSync(process.execPath, [SCRIPT], {
    cwd: ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      KIDULTS_REFERENCE_PRECISION_POLICY_JSON: JSON.stringify(policy),
      KIDULTS_REFERENCE_PRECISION_INPUT_JSON: JSON.stringify(inputReport(candidates)),
      KIDULTS_REFERENCE_PRECISION_OUTPUT: path.join(dir, 'poc.json'),
      KIDULTS_REFERENCE_PRECISION_AUDIT_OUTPUT: path.join(dir, 'audit.json'),
    },
  });
  fs.rmSync(dir, { recursive: true, force: true });
  return result;
}

test('reference precision rejects a product-looking result when no query anchor matches', () => {
  const { result, hardened, audit } = run([
    row({
      candidateKey: 'anchor-mismatch',
      canonicalTitle: 'Omega Speedmaster wristwatch',
      description: 'Swiss wristwatch collectible',
      query: 'Rolex Submariner',
    }),
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(audit.metrics.referenceFalsePositivesDowngraded, 1);
  assert.equal(hardened.candidates[0].semanticRelevant, false);
  assert.deepEqual(hardened.candidates[0].semanticStageD.diagnostics.anchorHits, []);
  assert.ok(hardened.candidates[0].semanticStageD.reasons.includes('REFERENCE_QUERY_ANCHOR_MISMATCH'));
});

test('reference precision accepts title-only product-object proof when query anchors match', () => {
  const { result, hardened, audit } = run([
    row({
      candidateKey: 'title-proof',
      canonicalTitle: 'Rolex Submariner wristwatch',
      description: 'Swiss collectible object',
      query: 'Rolex Submariner',
    }),
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(audit.metrics.referenceRelevantRetained, 1);
  assert.equal(hardened.candidates[0].semanticRelevant, true);
  assert.ok(hardened.candidates[0].semanticStageD.reasons.includes('REFERENCE_PRODUCT_TITLE_CONFIRMED'));
  assert.deepEqual(hardened.candidates[0].semanticStageD.diagnostics.anchorHits.sort(), ['rolex', 'submariner']);
});

test('model-specific exact-title fallback recognizes model words and year ranges without descriptions', () => {
  const { result, hardened, audit } = run([
    row({
      candidateKey: 'model-word',
      vertical: 'automobiles-mobility',
      canonicalTitle: 'Porsche Model X',
      description: null,
      query: 'Porsche Model X',
    }),
    row({
      candidateKey: 'year-range',
      vertical: 'automobiles-mobility',
      canonicalTitle: 'Porsche 1956–1957',
      description: null,
      query: 'Porsche 1956–1957',
    }),
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(audit.metrics.referenceRelevantRetained, 2);
  assert.ok(hardened.candidates.every((candidate) => candidate.semanticStageD.reasons.includes('REFERENCE_MODEL_SPECIFIC_EXACT_TITLE_CONFIRMED')));
});

test('one-character query tokens are ignored and falsey source ids are excluded from source metrics', () => {
  const { result, hardened, audit } = run([
    row({
      candidateKey: 'short-token',
      source: null,
      query: 'A Rolex',
      canonicalTitle: 'Rolex wristwatch',
      description: 'Swiss collectible object',
      semanticStageA: undefined,
    }),
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(hardened.candidates[0].semanticRelevant, true);
  assert.deepEqual(hardened.candidates[0].semanticStageD.diagnostics.anchors, ['rolex']);
  assert.equal(Object.prototype.hasOwnProperty.call(hardened.metrics.relevantBySource, 'null'), false);
  assert.equal(audit.metrics.outputRelevantCandidates, 1);
});

test('empty candidate universe follows zero-denominator path without creating evidence or relevance', () => {
  const { result, hardened, audit } = run([]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(hardened.metrics.semanticRelevantCandidates, 0);
  assert.equal(hardened.metrics.semanticRelevanceCoverage, 0);
  assert.equal(audit.metrics.outputSemanticRelevanceCoverage, 0);
  assert.equal(audit.disposition, 'NO_REFERENCE_PRECISION_CHANGES_REQUIRED');
  assert.equal(audit.safety.syntheticEvidenceCreated, false);
});

test('missing candidate identity and missing vertical fail closed before hardened output', () => {
  const missingKey = run([row({ candidateKey: null })]);
  assert.notEqual(missingKey.result.status, 0);
  assert.equal(missingKey.hardened, null);
  const missingVertical = run([row({ candidateKey: 'missing-vertical', vertical: null })]);
  assert.notEqual(missingVertical.result.status, 0);
  assert.equal(missingVertical.hardened, null);
});

test('policy validation fails closed for incomplete identity and malformed query or vertical controls', () => {
  assert.notEqual(runPolicy({ ...DEFAULT_POLICY, requiredInputMode: null }, [row()]).status, 0);
  assert.notEqual(runPolicy({ ...DEFAULT_POLICY, targetSourceClass: null }, [row()]).status, 0);
  assert.notEqual(runPolicy({ ...DEFAULT_POLICY, semanticStage: null }, [row()]).status, 0);
  assert.notEqual(runPolicy({ ...DEFAULT_POLICY, genericQueries: null }, [row()]).status, 0);
  assert.notEqual(runPolicy({ ...DEFAULT_POLICY, queryStopTokens: null }, [row()]).status, 0);
  assert.notEqual(runPolicy({ ...DEFAULT_POLICY, productObjectTermsByVertical: null }, [row()]).status, 0);
  assert.notEqual(runPolicy({ ...DEFAULT_POLICY, disallowedDescriptionTermsByVertical: null }, [row()]).status, 0);
});

test('empty configured product phrase is ignored rather than becoming universal product proof', () => {
  const policy = JSON.parse(JSON.stringify(DEFAULT_POLICY));
  policy.productObjectTermsByVertical['watches-jewelry'].push('');
  const result = runPolicy(policy, [
    row({
      candidateKey: 'empty-phrase',
      canonicalTitle: 'Rolex Submariner',
      description: 'Swiss collectible object',
      query: 'Rolex Submariner',
    }),
  ]);
  assert.equal(result.status, 0, result.stderr);
});

test('existing file input and relative output paths exercise filesystem-safe branches', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reference-precision-file-input-'));
  const inputPath = path.join(dir, 'input.json');
  fs.writeFileSync(inputPath, JSON.stringify(inputReport([row({ candidateKey: 'file-input' })])));
  const suffix = `${process.pid}-${Date.now()}`;
  const relativeOutput = path.join('reports', `reference-precision-test-${suffix}.json`);
  const relativeAudit = path.join('reports', `reference-precision-audit-test-${suffix}.json`);
  const outputPath = path.join(ROOT, relativeOutput);
  const auditPath = path.join(ROOT, relativeAudit);
  const result = spawnSync(process.execPath, [SCRIPT], {
    cwd: ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      KIDULTS_REFERENCE_PRECISION_INPUT_JSON: inputPath,
      KIDULTS_REFERENCE_PRECISION_OUTPUT: relativeOutput,
      KIDULTS_REFERENCE_PRECISION_AUDIT_OUTPUT: relativeAudit,
    },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(fs.readFileSync(outputPath, 'utf8')).metrics.semanticRelevantCandidates, 1);
  assert.equal(JSON.parse(fs.readFileSync(auditPath, 'utf8')).metrics.referenceRelevantRetained, 1);
  fs.rmSync(outputPath, { force: true });
  fs.rmSync(auditPath, { force: true });
  fs.rmSync(dir, { recursive: true, force: true });
});

test('toys-models rejects zine homographs even when the query and title say doll, while preserving a real doll object', () => {
  const { result, hardened, audit } = run([
    row({
      candidateKey: 'american-girl-zine',
      vertical: 'toys-models',
      query: 'American Girl doll',
      canonicalTitle: 'American Girl Doll Vol. 3',
      description: 'third volume in a series of trans portrait zines',
      sourceRecordId: 'Q129841010',
      sourceUrl: 'https://www.wikidata.org/wiki/Q129841010',
      payloadHash: 'z'.repeat(64),
    }),
    row({
      candidateKey: 'american-girl-doll',
      vertical: 'toys-models',
      query: 'American Girl doll',
      canonicalTitle: 'American Girl Doll',
      description: 'fashion doll and collectible toy',
      sourceRecordId: 'REAL-DOLL',
      sourceUrl: 'https://www.wikidata.org/wiki/REAL-DOLL',
      payloadHash: 't'.repeat(64),
    }),
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(audit.metrics.referenceRelevantRetained, 1);
  assert.equal(audit.metrics.referenceFalsePositivesDowngraded, 1);
  const zine = hardened.candidates.find((candidate) => candidate.candidateKey === 'american-girl-zine');
  const doll = hardened.candidates.find((candidate) => candidate.candidateKey === 'american-girl-doll');
  assert.equal(zine.semanticRelevant, false);
  assert.ok(zine.semanticStageD.reasons.includes('REFERENCE_DISALLOWED_ENTITY_OR_MEDIA_CONTEXT'));
  assert.ok(zine.semanticStageD.diagnostics.disallowedHits.includes('zines'));
  assert.equal(zine.rightsClass, 'CC0_STRUCTURED_DATA');
  assert.equal(zine.sourceRecordId, 'Q129841010');
  assert.equal(doll.semanticRelevant, true);
  assert.ok(doll.semanticStageD.reasons.includes('REFERENCE_PRODUCT_DESCRIPTION_CONFIRMED'));
});
