import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const SCRIPT = path.join(ROOT, 'scripts', 'kidult100-stage2-archive-precision-harden.mjs');

function row(overrides) {
  return {
    candidateKey: overrides.candidateKey,
    vertical: overrides.vertical,
    source: 'met',
    sourceClass: 'INSTITUTION_ARCHIVE',
    sourceRecordId: overrides.candidateKey,
    canonicalTitle: overrides.canonicalTitle,
    description: overrides.description,
    creator: null,
    sourceUrl: `https://www.metmuseum.org/art/collection/search/${encodeURIComponent(overrides.candidateKey)}`,
    observedAt: '2026-08-11T00:00:00Z',
    rightsClass: 'OPEN_ACCESS_PUBLIC_METADATA',
    payloadHash: 'b'.repeat(64),
    query: overrides.query,
    semanticRelevant: true,
    semanticRelevanceScore: 0.5,
    semanticStageA: { passed: true },
    semanticStageB: { passed: true },
  };
}

function execute(candidates) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'archive-precision-branches-'));
  const output = path.join(dir, 'poc.json');
  const audit = path.join(dir, 'audit.json');
  const input = {
    mode: 'KIDULT100_VALUE_BEFORE_DATA_POC',
    metrics: { semanticRecallCandidates: candidates.length },
    semanticPolicy: {},
    candidateBuild: {},
    claims: {},
    candidates,
  };
  const result = spawnSync(process.execPath, [SCRIPT], {
    cwd: ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      KIDULTS_ARCHIVE_PRECISION_INPUT_JSON: JSON.stringify(input),
      KIDULTS_ARCHIVE_PRECISION_OUTPUT: output,
      KIDULTS_ARCHIVE_PRECISION_AUDIT_OUTPUT: audit,
    },
  });
  const hardened = fs.existsSync(output) ? JSON.parse(fs.readFileSync(output, 'utf8')) : null;
  fs.rmSync(dir, { recursive: true, force: true });
  return { result, hardened };
}

test('strong query and title product context passes even when description is generic', () => {
  const { result, hardened } = execute([
    row({ candidateKey: 'eames-title-product', vertical: 'design-furniture', query: 'Eames chair', canonicalTitle: 'Eames Lounge Chair', description: 'Object' }),
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(hardened.candidates[0].semanticRelevant, true);
  assert.ok(hardened.candidates[0].semanticStageC.reasons.includes('ARCHIVE_PRODUCT_OBJECT_TITLE_CONFIRMED'));
});

test('archive object with no query anchor and no product context is downgraded by the generic insufficiency branch', () => {
  const { result, hardened } = execute([
    row({ candidateKey: 'patek-unrelated', vertical: 'watches-jewelry', query: 'Patek Philippe', canonicalTitle: 'Visitation from a Book of Hours', description: 'Object' }),
  ]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(hardened.candidates[0].semanticRelevant, false);
  assert.ok(hardened.candidates[0].semanticStageC.reasons.includes('ARCHIVE_INSUFFICIENT_PRODUCT_OBJECT_CONTEXT'));
});
