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
    candidateKey: 'wikidata:Q30766344',
    vertical: 'automobiles-mobility',
    source: 'wikidata',
    sourceClass: 'REFERENCE_PUBLIC_DATA',
    sourceRecordId: 'Q30766344',
    canonicalTitle: 'Porsche 911 GT3 R',
    description: null,
    creator: null,
    sourceUrl: 'http://www.wikidata.org/entity/Q30766344',
    observedAt: '2026-08-11T00:00:00Z',
    rightsClass: 'CC0_STRUCTURED_DATA',
    payloadHash: 'a'.repeat(64),
    query: 'Porsche 911',
    semanticRelevant: true,
    semanticStageA: { passed: true },
    semanticStageB: { passed: true },
    ...overrides,
  };
}

function run(candidates) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reference-model-variant-'));
  const output = path.join(dir, 'poc.json');
  const audit = path.join(dir, 'audit.json');
  const input = { mode: 'KIDULT100_VALUE_BEFORE_DATA_POC', semanticPolicy: {}, metrics: {}, candidateBuild: {}, claims: {}, candidates };
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
  fs.rmSync(dir, { recursive: true, force: true });
  return { result, hardened };
}

test('retains a no-description model variant only when every distinctive query anchor matches', () => {
  const { result, hardened } = run([
    row(),
    row({ candidateKey: 'wikidata:partial', sourceRecordId: 'partial', canonicalTitle: 'Porsche GT3 R', payloadHash: 'b'.repeat(64) }),
    row({ candidateKey: 'wikidata:article', sourceRecordId: 'article', vertical: 'gaming-music-screen', query: 'Xbox 360 console', canonicalTitle: 'Xbox 360 console sales surge in America', description: 'Wikinews article', payloadHash: 'c'.repeat(64) }),
  ]);
  assert.equal(result.status, 0, result.stderr);
  const recovered = hardened.candidates.find((candidate) => candidate.candidateKey === 'wikidata:Q30766344');
  assert.equal(recovered.semanticRelevant, true);
  assert.ok(recovered.semanticStageD.reasons.includes('REFERENCE_MODEL_SPECIFIC_ALL_QUERY_ANCHORS_CONFIRMED'));
  assert.equal(hardened.candidates.find((candidate) => candidate.candidateKey === 'wikidata:partial').semanticRelevant, false);
  assert.equal(hardened.candidates.find((candidate) => candidate.candidateKey === 'wikidata:article').semanticRelevant, false);
  assert.equal(recovered.rightsClass, 'CC0_STRUCTURED_DATA');
  assert.equal(recovered.payloadHash, 'a'.repeat(64));
});
