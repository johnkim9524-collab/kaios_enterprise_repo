import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const VERTICALS = [
  'toys-models', 'watches-jewelry', 'automobiles-mobility', 'fashion-accessories',
  'design-furniture', 'technology-cameras', 'gaming-music-screen', 'cards-comics-memorabilia',
];

function run() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-scope-shortfall-'));
  const output = path.join(tmp, 'out.json');
  const policy = {
    policy: 'FAIL_CLOSED_SCARCITY_SOURCE_QUALIFICATION_MATRIX',
    primitive: 'SCARCITY', requiredSignalType: 'TOTAL_PRODUCED',
    scope: { ambiguousTargetsAutomaticallyQualified: false, clearNonTargetEntitiesAutomaticallyQualified: false },
    verticalSignals: Object.fromEntries(VERTICALS.map((vertical) => [vertical, {
      positive: vertical === 'toys-models' ? ['toy'] : ['object'],
      hardBlock: vertical === 'toys-models' ? ['video game'] : ['forbidden'],
    }])),
  };
  const rows = VERTICALS.map((vertical) => ({
    candidateKey: `${vertical}-safe`, vertical, canonicalTitle: vertical === 'toys-models' ? 'Toy Figure' : 'Object',
    semanticRelevant: true, semanticRelevanceScore: 1, source: 'wikidata', sourceClass: 'REFERENCE_PUBLIC_DATA',
    sourceUrl: 'https://www.wikidata.org/wiki/Q1', rightsClass: 'CC0',
    description: vertical === 'toys-models' ? 'collectible toy' : 'object collectible', rightData: { evidence: [] },
  }));
  rows.push({
    candidateKey: 'toy-bad', vertical: 'toys-models', canonicalTitle: 'Video Game', semanticRelevant: true,
    semanticRelevanceScore: 1, source: 'wikidata', sourceClass: 'REFERENCE_PUBLIC_DATA',
    sourceUrl: 'https://www.wikidata.org/wiki/Q2', rightsClass: 'CC0', description: 'video game', rightData: { evidence: [] },
  });
  const queue = {
    mode: 'KIDULT100_SCARCITY_EVIDENCE_TARGET_QUEUE', policy: 'TEST', thresholds: { operationalReferencePerVertical: 25 },
    metrics: {
      targetShortfall: 0, calibrationReferenceShortfall: 77,
      byVertical: Object.fromEntries(VERTICALS.map((vertical) => [vertical, { targetGap: vertical === 'toys-models' ? 2 : 1 }])),
    },
    acquisitionContract: { primitive: 'SCARCITY' }, targets: [], claims: { normalizedScoresGenerated: false },
  };
  const poc = { candidates: rows.map((row) => ({ candidateKey: row.candidateKey, description: row.description, creator: '' })) };
  const rightData = { candidates: rows };
  const result = spawnSync(process.execPath, ['scripts/kidult100-scarcity-target-queue-harden.mjs'], {
    cwd: process.cwd(), encoding: 'utf8',
    env: {
      ...process.env,
      KIDULTS_SCARCITY_HARDEN_QUEUE_JSON: JSON.stringify(queue),
      KIDULTS_SCARCITY_HARDEN_POLICY_JSON: JSON.stringify(policy),
      KIDULTS_SCARCITY_HARDEN_POC_JSON: JSON.stringify(poc),
      KIDULTS_SCARCITY_HARDEN_RIGHT_DATA_JSON: JSON.stringify(rightData),
      KIDULTS_SCARCITY_HARDEN_OUTPUT: output,
    },
  });
  const report = fs.existsSync(output) ? JSON.parse(fs.readFileSync(output, 'utf8')) : null;
  fs.rmSync(tmp, { recursive: true, force: true });
  return { result, report };
}

test('bounded upstream calibration shortfall preserves scope-safe shortage without retaining a clear mismatch', () => {
  const { result, report } = run();
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(report.metrics.targetShortfall, 0);
  assert.equal(report.metrics.scopeSafeReferenceShortfall, 1);
  assert.equal(report.metrics.clearMismatchExcluded, 1);
  assert.equal(report.targets.some((row) => row.candidateKey === 'toy-bad'), false);
  assert.equal(report.hardeningContract.diagnosticContinuationEnabled, true);
  assert.equal(report.claims.scopeSafeReferenceSatisfied, false);
  assert.equal(report.claims.scopeSafeReferenceShortfallPreserved, true);
  assert.equal(report.disposition, 'QUEUE_HARDENED_SCOPE_SAFE_REFERENCE_SHORTFALL_RETAINED');
});
