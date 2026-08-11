import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const VERTICALS = [
  'toys-models', 'watches-jewelry', 'automobiles-mobility', 'fashion-accessories',
  'design-furniture', 'technology-cameras', 'gaming-music-screen', 'cards-comics-memorabilia',
];

function policy() {
  return {
    policy: 'FAIL_CLOSED_SCARCITY_SOURCE_QUALIFICATION_MATRIX',
    primitive: 'SCARCITY',
    requiredSignalType: 'TOTAL_PRODUCED',
    scope: { ambiguousTargetsAutomaticallyQualified: false, clearNonTargetEntitiesAutomaticallyQualified: false },
    verticalSignals: Object.fromEntries(VERTICALS.map((vertical) => [vertical, {
      positive: vertical === 'toys-models' ? ['toy', 'figure'] : ['object'],
      hardBlock: vertical === 'toys-models' ? ['video game'] : ['forbidden'],
    }])),
  };
}

function queue(gaps = {}) {
  return {
    mode: 'KIDULT100_SCARCITY_EVIDENCE_TARGET_QUEUE',
    policy: 'TEST',
    thresholds: { operationalReferencePerVertical: 1 },
    metrics: {
      targetShortfall: 0,
      byVertical: Object.fromEntries(VERTICALS.map((vertical) => [vertical, { targetGap: gaps[vertical] ?? 1 }])),
    },
    acquisitionContract: { primitive: 'SCARCITY' },
    targets: [],
    claims: { normalizedScoresGenerated: false },
  };
}

function evidence(primitive, signalType, key, overrides = {}) {
  return {
    primitive,
    value: { signalType, ...(overrides.value || {}) },
    rightsClass: overrides.rightsClass === undefined ? 'CC0' : overrides.rightsClass,
    sourceUrl: overrides.sourceUrl === undefined ? 'https://example.test/evidence' : overrides.sourceUrl,
    payloadHash: overrides.payloadHash === undefined ? `${key}-${primitive}` : overrides.payloadHash,
    observedAt: overrides.observedAt === undefined ? '2026-08-11T00:00:00Z' : overrides.observedAt,
    safety: overrides.safety === undefined ? { synthetic: false, estimated: false } : overrides.safety,
  };
}

function record(key, vertical, title, { description = '', scarcity = false, support = true } = {}) {
  const rows = [];
  if (support) {
    rows.push(evidence('DEMAND_ATTENTION', 'CULTURAL_ATTENTION_PROXY', key));
    rows.push(evidence('CANON_CULTURAL_STRENGTH', 'REFERENCE_CANON_SIGNAL', key));
  }
  if (scarcity) rows.push(evidence('SCARCITY', 'TOTAL_PRODUCED', key, { value: { quantity: 100 } }));
  return {
    candidateKey: key, vertical, canonicalTitle: title, semanticRelevant: true, semanticRelevanceScore: 0.9,
    source: 'wikidata', sourceClass: 'REFERENCE_PUBLIC_DATA', sourceUrl: 'https://www.wikidata.org/wiki/Q1', rightsClass: 'CC0',
    description, rightData: { evidence: rows },
  };
}

function fixtures({ toyRows = null, gaps = {} } = {}) {
  const rows = [];
  for (const vertical of VERTICALS) {
    if (vertical === 'toys-models' && toyRows) rows.push(...toyRows);
    else rows.push(record(`${vertical}-safe`, vertical, 'Object', { description: 'object collectible' }));
  }
  return {
    q: queue(gaps),
    p: { candidates: rows.map((row) => ({ candidateKey: row.candidateKey, description: row.description, creator: '' })) },
    r: { candidates: rows },
  };
}

function run({ q, p, r, pol = policy(), fileInputs = false, relativeOutput = false } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-scarcity-harden-'));
  const output = relativeOutput ? `reports/harden-${path.basename(tmp)}.json` : path.join(tmp, 'out.json');
  const env = { ...process.env, KIDULTS_SCARCITY_HARDEN_OUTPUT: output };
  const values = { queue: q, policy: pol, poc: p, rightData: r };
  if (fileInputs) {
    for (const [name, value] of Object.entries(values)) {
      const file = path.join(tmp, `${name}.json`);
      fs.writeFileSync(file, JSON.stringify(value));
      env[`KIDULTS_SCARCITY_HARDEN_${name === 'rightData' ? 'RIGHT_DATA' : name.toUpperCase()}_JSON`] = file;
    }
  } else {
    env.KIDULTS_SCARCITY_HARDEN_QUEUE_JSON = JSON.stringify(q);
    env.KIDULTS_SCARCITY_HARDEN_POLICY_JSON = JSON.stringify(pol);
    env.KIDULTS_SCARCITY_HARDEN_POC_JSON = JSON.stringify(p);
    env.KIDULTS_SCARCITY_HARDEN_RIGHT_DATA_JSON = JSON.stringify(r);
  }
  const result = spawnSync(process.execPath, ['scripts/kidult100-scarcity-target-queue-harden.mjs'], {
    cwd: process.cwd(), env, encoding: 'utf8',
  });
  const resolved = path.isAbsolute(output) ? output : path.join(process.cwd(), output);
  const report = fs.existsSync(resolved) ? JSON.parse(fs.readFileSync(resolved, 'utf8')) : null;
  if (relativeOutput && fs.existsSync(resolved)) fs.rmSync(resolved, { force: true });
  fs.rmSync(tmp, { recursive: true, force: true });
  return { result, report };
}

test('clear mismatches are excluded and safe candidates backfill the target gap', () => {
  const toyRows = [
    record('toy-bad', 'toys-models', 'Toy Game', { description: 'video game' }),
    record('toy-safe', 'toys-models', 'Action Figure', { description: 'collectible toy figure' }),
  ];
  const f = fixtures({ toyRows });
  f.q.targets = [{ candidateKey: 'toy-bad' }];
  const { result, report } = run({ ...f, fileInputs: true, relativeOutput: true });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(report.metrics.clearMismatchExcluded, 1);
  assert.equal(report.metrics.targetShortfall, 0);
  assert.equal(report.targets.some((row) => row.candidateKey === 'toy-bad'), false);
  assert.equal(report.targets.some((row) => row.candidateKey === 'toy-safe'), true);
  assert.equal(report.claims.clearScopeMismatchRetained, false);
});

test('scope-ready targets are selected before ambiguous review targets', () => {
  const toyRows = [
    record('toy-review', 'toys-models', 'Mystery', { description: 'historic artifact' }),
    record('toy-ready', 'toys-models', 'Toy Figure', { description: 'toy figure' }),
  ];
  const f = fixtures({ toyRows });
  const { result, report } = run(f);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const toy = report.targets.find((row) => row.vertical === 'toys-models');
  assert.equal(toy.candidateKey, 'toy-ready');
  assert.equal(report.metrics.scopeReadySelected >= 1, true);
});

test('ambiguous target remains blocked rather than auto-qualified when it is the only safe supply', () => {
  const f = fixtures({ toyRows: [record('toy-review', 'toys-models', 'Mystery', { description: 'historic artifact' })] });
  const { result, report } = run(f);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(report.metrics.reviewRequiredSelected, 1);
  assert.equal(report.disposition, 'QUEUE_HARDENED_REVIEW_TARGETS_RETAINED_BLOCKED');
  assert.equal(report.claims.ambiguousTargetAutomaticallyQualified, false);
});

test('existing eligible scarcity evidence is excluded from the acquisition pool', () => {
  const toyRows = [
    record('toy-has-scarcity', 'toys-models', 'Toy Figure', { description: 'toy figure', scarcity: true }),
    record('toy-needs-scarcity', 'toys-models', 'Toy Doll', { description: 'toy doll' }),
  ];
  const f = fixtures({ toyRows });
  const { result, report } = run(f);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(report.targets.some((row) => row.candidateKey === 'toy-has-scarcity'), false);
  assert.equal(report.targets.some((row) => row.candidateKey === 'toy-needs-scarcity'), true);
});

test('insufficient scope-safe supply fails closed with an explicit shortfall', () => {
  const gaps = Object.fromEntries(VERTICALS.map((vertical) => [vertical, vertical === 'toys-models' ? 2 : 1]));
  const f = fixtures({ toyRows: [record('toy-only', 'toys-models', 'Toy Figure', { description: 'toy figure' })], gaps });
  const { result, report } = run(f);
  assert.notEqual(result.status, 0);
  assert.equal(report.metrics.targetShortfall, 1);
  assert.equal(report.disposition, 'FAIL_CLOSED_INSUFFICIENT_SCOPE_SAFE_TARGET_SUPPLY');
});

test('unsafe policy, unsafe queue and duplicate candidate identities fail closed', () => {
  const f = fixtures();
  const badPolicy = policy();
  badPolicy.scope.clearNonTargetEntitiesAutomaticallyQualified = true;
  assert.match(run({ ...f, pol: badPolicy }).result.stderr, /Unsafe scarcity scope-hardening policy/);

  const badAmbiguous = policy();
  badAmbiguous.scope.ambiguousTargetsAutomaticallyQualified = true;
  assert.match(run({ ...f, pol: badAmbiguous }).result.stderr, /Unsafe scarcity scope-hardening policy/);

  const badQueue = queue();
  badQueue.metrics.targetShortfall = 1;
  assert.match(run({ ...f, q: badQueue }).result.stderr, /Unsafe or incomplete scarcity target queue/);

  const badMode = queue();
  badMode.mode = 'OTHER';
  assert.match(run({ ...f, q: badMode }).result.stderr, /Unsafe or incomplete scarcity target queue/);

  const badName = policy();
  badName.policy = 'OTHER';
  assert.match(run({ ...f, pol: badName }).result.stderr, /Invalid scarcity scope-hardening policy/);

  const badPrimitive = policy();
  badPrimitive.primitive = 'DEMAND_ATTENTION';
  assert.match(run({ ...f, pol: badPrimitive }).result.stderr, /Invalid scarcity scope-hardening policy/);

  const badSignal = policy();
  badSignal.requiredSignalType = 'PROXY';
  assert.match(run({ ...f, pol: badSignal }).result.stderr, /Invalid scarcity scope-hardening policy/);

  const seven = policy();
  delete seven.verticalSignals['cards-comics-memorabilia'];
  assert.match(run({ ...f, pol: seven }).result.stderr, /Expected 8 vertical signal contracts/);

  const duplicatePoc = { candidates: [f.p.candidates[0], f.p.candidates[0]] };
  assert.match(run({ ...f, p: duplicatePoc }).result.stderr, /Invalid or duplicate POC candidate key/);

  const missingPocKey = { candidates: [{ description: 'object' }] };
  assert.match(run({ ...f, p: missingPocKey }).result.stderr, /Invalid or duplicate POC candidate key/);

  const duplicateRight = { candidates: [f.r.candidates[0], f.r.candidates[0]] };
  assert.match(run({ ...f, r: duplicateRight }).result.stderr, /Invalid or duplicate Right Data candidate key/);

  const missingRightKey = { candidates: [{ ...f.r.candidates[0], candidateKey: '' }] };
  assert.match(run({ ...f, r: missingRightKey }).result.stderr, /Invalid or duplicate Right Data candidate key/);
});

test('invalid target gaps fail closed before selection', () => {
  const f = fixtures();
  f.q.metrics.byVertical['toys-models'].targetGap = -1;
  assert.match(run(f).result.stderr, /Invalid target gap/);

  const g = fixtures();
  g.q.metrics.byVertical['toys-models'].targetGap = 1.5;
  assert.match(run(g).result.stderr, /Invalid target gap/);
});

test('zero target gap selects nothing for that vertical without weakening other gaps', () => {
  const gaps = { 'toys-models': 0 };
  const f = fixtures({ gaps });
  const { result, report } = run(f);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(report.targets.some((row) => row.vertical === 'toys-models'), false);
  assert.equal(report.metrics.byVertical['toys-models'].selectedTargets, 0);
  assert.equal(report.metrics.byVertical['toys-models'].targetShortfall, 0);
});

test('unsafe or incomplete scarcity evidence is never treated as already eligible', () => {
  const variants = [
    evidence('SCARCITY', 'OTHER', 'wrong-signal'),
    evidence('SCARCITY', 'TOTAL_PRODUCED', 'no-rights', { rightsClass: '' }),
    evidence('SCARCITY', 'TOTAL_PRODUCED', 'http-source', { sourceUrl: 'http://example.test/scarcity' }),
    evidence('SCARCITY', 'TOTAL_PRODUCED', 'no-hash', { payloadHash: '' }),
    evidence('SCARCITY', 'TOTAL_PRODUCED', 'bad-date', { observedAt: 'not-a-date' }),
    evidence('SCARCITY', 'TOTAL_PRODUCED', 'synthetic', { safety: { synthetic: true, estimated: false } }),
    evidence('SCARCITY', 'TOTAL_PRODUCED', 'estimated', { safety: { synthetic: false, estimated: true } }),
  ];
  for (const [index, scarcityEvidence] of variants.entries()) {
    const row = record(`toy-unsafe-${index}`, 'toys-models', 'Toy Figure', { description: 'toy figure', support: false });
    row.rightData.evidence.push(scarcityEvidence);
    const f = fixtures({ toyRows: [row] });
    const { result, report } = run(f);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(report.targets.some((target) => target.candidateKey === row.candidateKey), true);
  }
});

test('missing or unsafe demand and canon evidence contributes no acquisition priority support', () => {
  const row = record('toy-no-support', 'toys-models', 'Toy Figure', { description: 'toy figure', support: false });
  row.rightData.evidence.push(evidence('DEMAND_ATTENTION', '', 'empty-demand'));
  row.rightData.evidence.push(evidence('CANON_CULTURAL_STRENGTH', 'REFERENCE_CANON_SIGNAL', 'unsafe-canon', {
    safety: { synthetic: true, estimated: false },
  }));
  const f = fixtures({ toyRows: [row] });
  const { result, report } = run(f);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const selected = report.targets.find((target) => target.candidateKey === row.candidateKey);
  assert.equal(selected.supportingNonMarketSignals, 0);
  assert.equal(selected.demandEvidenceReady, false);
  assert.equal(selected.canonEvidenceReady, false);
});

test('original queue metadata safely backfills missing candidate source fields without qualifying the source', () => {
  const row = record('toy-fallback', 'toys-models', 'Toy Figure', { description: 'toy figure' });
  row.source = null;
  row.sourceClass = null;
  row.sourceUrl = null;
  row.rightsClass = null;
  const f = fixtures({ toyRows: [row] });
  f.q.targets = [{
    candidateKey: row.candidateKey,
    source: 'wikidata', sourceClass: 'REFERENCE_PUBLIC_DATA',
    sourceUrl: 'https://www.wikidata.org/wiki/Q1', rightsClass: 'CC0', semanticRelevanceScore: 0.5,
  }];
  const { result, report } = run(f);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const selected = report.targets.find((target) => target.candidateKey === row.candidateKey);
  assert.equal(selected.source, 'wikidata');
  assert.equal(selected.sourceClass, 'REFERENCE_PUBLIC_DATA');
  assert.equal(selected.sourceUrl, 'https://www.wikidata.org/wiki/Q1');
  assert.equal(selected.rightsClass, 'CC0');
  assert.equal(report.claims.sourceAutomaticallyQualified, false);
});

test('non-relevant and unknown-vertical records are ignored rather than entering scarcity targets', () => {
  const f = fixtures();
  f.r.candidates.push({ ...record('irrelevant', 'toys-models', 'Toy Figure', { description: 'toy figure' }), semanticRelevant: false });
  f.r.candidates.push(record('unknown', 'unknown-vertical', 'Object', { description: 'object' }));
  f.p.candidates.push({ candidateKey: 'irrelevant', description: 'toy figure', creator: '' });
  f.p.candidates.push({ candidateKey: 'unknown', description: 'object', creator: '' });
  const { result, report } = run(f);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(report.targets.some((target) => target.candidateKey === 'irrelevant'), false);
  assert.equal(report.targets.some((target) => target.candidateKey === 'unknown'), false);
});

test('missing file input fails closed before queue hardening', () => {
  const f = fixtures();
  const result = spawnSync(process.execPath, ['scripts/kidult100-scarcity-target-queue-harden.mjs'], {
    cwd: process.cwd(), encoding: 'utf8', env: {
      ...process.env,
      KIDULTS_SCARCITY_HARDEN_QUEUE_JSON: path.join(os.tmpdir(), 'missing-kidults-scarcity-queue.json'),
      KIDULTS_SCARCITY_HARDEN_POLICY_JSON: JSON.stringify(policy()),
      KIDULTS_SCARCITY_HARDEN_POC_JSON: JSON.stringify(f.p),
      KIDULTS_SCARCITY_HARDEN_RIGHT_DATA_JSON: JSON.stringify(f.r),
    },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Missing JSON input/);
});
