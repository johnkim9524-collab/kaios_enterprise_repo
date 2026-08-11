import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const SCRIPT = path.join(ROOT, 'scripts', 'kidult100-stage2-reference-precision-harden.mjs');

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

function run(candidates) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reference-precision-coverage-'));
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
    encoding: 'utf8',
    env: {
      ...process.env,
      KIDULTS_REFERENCE_PRECISION_INPUT_JSON: JSON.stringify(input),
      KIDULTS_REFERENCE_PRECISION_OUTPUT: output,
      KIDULTS_REFERENCE_PRECISION_AUDIT_OUTPUT: audit,
    },
  });
  const hardened = fs.existsSync(output) ? JSON.parse(fs.readFileSync(output, 'utf8')) : null;
  const auditReport = fs.existsSync(audit) ? JSON.parse(fs.readFileSync(audit, 'utf8')) : null;
  fs.rmSync(dir, { recursive: true, force: true });
  return { result, hardened, audit: auditReport };
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
