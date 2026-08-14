import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const SCRIPT = path.join(ROOT, 'scripts', 'kidult100-stage2-reference-precision-harden.mjs');

function candidate(overrides = {}) {
  return {
    candidateKey: 'wikidata:Q1',
    vertical: 'gaming-music-screen',
    source: 'wikidata',
    sourceClass: 'REFERENCE_PUBLIC_DATA',
    sourceRecordId: 'Q1',
    canonicalTitle: 'Game Boy Color',
    description: 'handheld game console by Nintendo',
    creator: null,
    sourceUrl: 'https://www.wikidata.org/wiki/Q1',
    observedAt: '2026-08-14T00:00:00Z',
    rightsClass: 'CC0_STRUCTURED_DATA',
    payloadHash: 'a'.repeat(64),
    query: 'Nintendo Game Boy',
    semanticRelevant: true,
    semanticStageA: { passed: true },
    semanticStageB: { passed: true },
    ...overrides,
  };
}

function report(candidates) {
  return {
    mode: 'KIDULT100_VALUE_BEFORE_DATA_POC',
    semanticPolicy: {},
    metrics: { semanticRecallCandidates: candidates.length },
    candidateBuild: {},
    claims: {},
    candidates,
  };
}

function run(input) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gaming-media-format-'));
  const output = path.join(dir, 'poc.json');
  const audit = path.join(dir, 'audit.json');
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

test('gaming precision rejects cartridge/media formats without rejecting the actual console object', () => {
  const input = report([
    candidate({
      candidateKey: 'game-boy-advance-pak-format',
      sourceRecordId: 'Q55219687',
      canonicalTitle: 'Nintendo Game Boy Advance Game Pak',
      description: 'cartridge format used by Nintendo Game Boy Advance platforms',
      sourceUrl: 'https://www.wikidata.org/wiki/Q55219687',
    }),
    candidate({
      candidateKey: 'game-boy-color-pak-format',
      sourceRecordId: 'Q55219685',
      canonicalTitle: 'Nintendo Game Boy Color Game Pak',
      description: 'media format designed for use with the Nintendo Game Boy Color',
      sourceUrl: 'https://www.wikidata.org/wiki/Q55219685',
    }),
    candidate({
      candidateKey: 'game-boy-color-console',
      sourceRecordId: 'Q188642',
      canonicalTitle: 'Game Boy Color',
      description: 'handheld game console by Nintendo',
      sourceUrl: 'https://www.wikidata.org/wiki/Q188642',
    }),
  ]);

  const { result, hardened, audit } = run(input);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(audit.metrics.referenceRelevantEvaluated, 3);
  assert.equal(audit.metrics.referenceFalsePositivesDowngraded, 2);
  assert.equal(audit.metrics.referenceRelevantRetained, 1);

  for (const key of ['game-boy-advance-pak-format', 'game-boy-color-pak-format']) {
    const row = hardened.candidates.find((candidate) => candidate.candidateKey === key);
    assert.equal(row.semanticRelevant, false);
    assert.ok(row.semanticStageD.reasons.includes('REFERENCE_DISALLOWED_ENTITY_OR_MEDIA_CONTEXT'));
    assert.equal(row.rightsClass, 'CC0_STRUCTURED_DATA');
  }

  const consoleRow = hardened.candidates.find((candidate) => candidate.candidateKey === 'game-boy-color-console');
  assert.equal(consoleRow.semanticRelevant, true);
  assert.equal(consoleRow.rightsClass, 'CC0_STRUCTURED_DATA');
  assert.equal(audit.safety.rightsClassificationRelaxed, false);
  assert.equal(audit.safety.provenanceRelaxed, false);
});
