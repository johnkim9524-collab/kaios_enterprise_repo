import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const verticals = [
  'toys-models', 'watches-jewelry', 'automobiles-mobility', 'fashion-accessories',
  'design-furniture', 'technology-cameras', 'gaming-music-screen', 'cards-comics-memorabilia',
];

const verticalSignals = {
  'toys-models': { positive: ['toy'], hardBlock: ['video game'] },
  'watches-jewelry': { positive: ['object'], hardBlock: ['forbidden'] },
  'automobiles-mobility': { positive: ['object'], hardBlock: ['forbidden'] },
  'fashion-accessories': { positive: ['object'], hardBlock: ['forbidden'] },
  'design-furniture': { positive: ['object'], hardBlock: ['forbidden'] },
  'technology-cameras': { positive: ['object'], hardBlock: ['forbidden'] },
  'gaming-music-screen': { positive: ['object'], hardBlock: ['forbidden'] },
  'cards-comics-memorabilia': { positive: ['object'], hardBlock: ['forbidden'] },
};

function execute(queue, poc, rightData) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-scarcity-branch-'));
  const out = path.join(tmp, 'out.json');
  const policy = {
    policy: 'FAIL_CLOSED_SCARCITY_SOURCE_QUALIFICATION_MATRIX',
    primitive: 'SCARCITY',
    requiredSignalType: 'TOTAL_PRODUCED',
    scope: { ambiguousTargetsAutomaticallyQualified: false, clearNonTargetEntitiesAutomaticallyQualified: false },
    verticalSignals,
  };
  const result = spawnSync(process.execPath, ['scripts/kidult100-scarcity-target-queue-harden.mjs'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: {
      ...process.env,
      KIDULTS_SCARCITY_HARDEN_QUEUE_JSON: JSON.stringify(queue),
      KIDULTS_SCARCITY_HARDEN_POLICY_JSON: JSON.stringify(policy),
      KIDULTS_SCARCITY_HARDEN_POC_JSON: JSON.stringify(poc),
      KIDULTS_SCARCITY_HARDEN_RIGHT_DATA_JSON: JSON.stringify(rightData),
      KIDULTS_SCARCITY_HARDEN_OUTPUT: out,
    },
  });
  const report = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : null;
  fs.rmSync(tmp, { recursive: true, force: true });
  return { result, report };
}

test('missing POC match, optional queue metadata and missing vertical target gap use safe fallbacks', () => {
  const byVertical = {
    'watches-jewelry': { targetGap: 1 },
    'automobiles-mobility': { targetGap: 1 },
    'fashion-accessories': { targetGap: 1 },
    'design-furniture': { targetGap: 1 },
    'technology-cameras': { targetGap: 1 },
    'gaming-music-screen': { targetGap: 1 },
    'cards-comics-memorabilia': { targetGap: 1 },
  };
  const queue = {
    mode: 'KIDULT100_SCARCITY_EVIDENCE_TARGET_QUEUE',
    metrics: { targetShortfall: 0, byVertical },
    targets: [],
  };
  const rows = verticals.map((vertical) => ({
    candidateKey: `${vertical}-x`,
    vertical,
    canonicalTitle: vertical === 'watches-jewelry' ? null : 'Object',
    description: 'object collectible',
    creator: null,
    semanticRelevant: true,
    semanticRelevanceScore: 0,
    source: null,
    sourceClass: null,
    sourceUrl: null,
    rightsClass: null,
    rightData: { evidence: [] },
  }));
  const poc = {
    candidates: rows
      .filter((row) => row.vertical !== 'watches-jewelry')
      .map((row) => ({ candidateKey: row.candidateKey, description: '', creator: '' })),
  };
  const { result, report } = execute(queue, poc, { candidates: rows });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(report.metrics.byVertical['toys-models'].targetGap, 0);
  assert.equal(report.metrics.byVertical['toys-models'].selectedTargets, 0);
  assert.equal(report.targets.some((row) => row.vertical === 'watches-jewelry'), true);
  assert.equal(report.policy, null);
  assert.deepEqual(report.thresholds, {});
  assert.deepEqual(report.acquisitionContract, {});
});
