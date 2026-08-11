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
    sourceQualification: {
      automaticSourceQualificationAllowed: false,
      existingReferenceSourceWithoutEligibleQuantityCountsAsQualified: false,
    },
    safety: {
      syntheticAllowed: false,
      estimatedAllowed: false,
      inferredScarcityAllowed: false,
      listingOrMarketingLanguageAcceptedAsQuantity: false,
      unauthorizedScrapingAllowed: false,
      paidProviderProcurementAllowed: false,
      contractExecutionAllowed: false,
      automaticProductionScoringActivationAllowed: false,
    },
    verticalSignals: Object.fromEntries(VERTICALS.map((vertical) => [vertical, {
      positive: vertical === 'toys-models' ? ['toy', 'action figure'] : ['object'],
      hardBlock: vertical === 'toys-models' ? ['video game'] : ['forbidden'],
    }])),
  };
}

function queue(targets, targetShortfall = 0, mode = 'KIDULT100_SCARCITY_EVIDENCE_TARGET_QUEUE') {
  return { mode, metrics: { targetShortfall }, targets };
}

function target(key, title, vertical = 'toys-models', acquisitionStatus = 'RIGHTS_QUALIFIED_EXPLICIT_QUANTITY_REQUIRED') {
  return {
    candidateKey: key,
    canonicalTitle: title,
    vertical,
    source: 'wikidata',
    sourceClass: 'REFERENCE_PUBLIC_DATA',
    rightsClass: 'CC0_STRUCTURED_DATA',
    sourceUrl: 'https://www.wikidata.org/wiki/Q1',
    acquisitionStatus,
  };
}

function poc(rows) {
  return { candidates: rows };
}

function candidate(key, description = '', creator = '') {
  return { candidateKey: key, description, creator };
}

function run({ p = policy(), q = queue([]), candidates = poc([]), fileInputs = false, relativeOutput = false } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-scarcity-source-'));
  const output = relativeOutput ? `reports/test-${path.basename(tmp)}.json` : path.join(tmp, 'out.json');
  const env = { ...process.env, KIDULTS_SCARCITY_SOURCE_QUALIFICATION_OUTPUT: output };
  if (fileInputs) {
    const pp = path.join(tmp, 'policy.json');
    const qp = path.join(tmp, 'queue.json');
    const cp = path.join(tmp, 'poc.json');
    fs.writeFileSync(pp, JSON.stringify(p));
    fs.writeFileSync(qp, JSON.stringify(q));
    fs.writeFileSync(cp, JSON.stringify(candidates));
    env.KIDULTS_SCARCITY_SOURCE_POLICY_JSON = pp;
    env.KIDULTS_SCARCITY_TARGET_QUEUE_JSON = qp;
    env.KIDULTS_SCARCITY_SOURCE_POC_JSON = cp;
  } else {
    env.KIDULTS_SCARCITY_SOURCE_POLICY_JSON = JSON.stringify(p);
    env.KIDULTS_SCARCITY_TARGET_QUEUE_JSON = JSON.stringify(q);
    env.KIDULTS_SCARCITY_SOURCE_POC_JSON = JSON.stringify(candidates);
  }
  const result = spawnSync(process.execPath, ['scripts/kidult100-scarcity-source-qualification.mjs'], {
    cwd: process.cwd(), env, encoding: 'utf8',
  });
  const resolvedOutput = path.isAbsolute(output) ? output : path.join(process.cwd(), output);
  const report = fs.existsSync(resolvedOutput) ? JSON.parse(fs.readFileSync(resolvedOutput, 'utf8')) : null;
  if (relativeOutput && fs.existsSync(resolvedOutput)) fs.rmSync(resolvedOutput, { force: true });
  fs.rmSync(tmp, { recursive: true, force: true });
  return { result, report };
}

test('classifies scope-ready, clear mismatch and ambiguous targets without auto-qualifying sources', () => {
  const q = queue([
    target('ready', 'Action Figure'),
    target('bad', 'Toy Game'),
    target('review', 'Mystery'),
  ]);
  const candidates = poc([
    candidate('ready', 'small toy that resembles a figure'),
    candidate('bad', '1998 video game'),
    candidate('review', 'historical artifact'),
  ]);
  const { result, report } = run({ q, candidates, fileInputs: true });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(report.metrics.targetCandidates, 3);
  assert.equal(report.metrics.scopeReadyTargets, 1);
  assert.equal(report.metrics.clearMismatchTargets, 1);
  assert.equal(report.metrics.reviewRequiredTargets, 1);
  assert.equal(report.metrics.automaticallyQualifiedSources, 0);
  assert.equal(report.metrics.structuralErrors, 0);
  assert.equal(report.disposition, 'TARGET_SCOPE_CONTAMINATION_REQUIRES_QUEUE_HARDENING');
  assert.equal(report.matrix.find((row) => row.candidateKey === 'ready').qualificationStatus, 'RIGHTS_QUALIFIED_SOURCE_DISCOVERY_REQUIRED');
  assert.equal(report.matrix.find((row) => row.candidateKey === 'bad').nextAction, 'REMOVE_FROM_SCARCITY_ACQUISITION_CANDIDATE_POOL');
  assert.equal(report.matrix.find((row) => row.candidateKey === 'review').nextAction, 'KEEP_BLOCKED_PENDING_ENTITY_SCOPE_EVIDENCE');
  assert.ok(report.matrix.find((row) => row.candidateKey === 'ready').scopePositiveHits.includes('toy'));
  assert.ok(report.matrix.find((row) => row.candidateKey === 'bad').scopeHardBlockHits.includes('video game'));
  assert.equal(report.safety.unauthorizedScrapingRequested, false);
});

test('scope-ready-only matrix requests source discovery and supports relative output path', () => {
  const { result, report } = run({
    q: queue([target('ready', 'Toy')]),
    candidates: poc([candidate('ready', 'collectible toy')]),
    relativeOutput: true,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(report.disposition, 'RIGHTS_QUALIFIED_SOURCE_DISCOVERY_REQUIRED');
  assert.equal(report.metrics.byVertical['toys-models'].scopeReady, 1);
});

test('no scope-ready targets stays blocked without inventing qualification', () => {
  const { result, report } = run({ q: queue([target('review', 'Mystery')]), candidates: poc([candidate('review', '')]) });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(report.disposition, 'NO_SCOPE_READY_SCARCITY_TARGETS');
  assert.equal(report.metrics.automaticallyQualifiedSources, 0);
});

test('unknown vertical, missing candidate and unknown acquisition status fail closed structurally', () => {
  const q = queue([
    target('missing', 'Mystery', 'unknown-vertical'),
    target('status', 'Toy', 'toys-models', 'UNKNOWN'),
  ]);
  const { result, report } = run({ q, candidates: poc([candidate('status', 'toy')]) });
  assert.notEqual(result.status, 0);
  assert.equal(report.metrics.structuralErrors, 3);
  assert.equal(report.disposition, 'FAIL_CLOSED_STRUCTURAL_ERRORS');
  assert.equal(report.matrix[0].scopeStatus, 'STRUCTURAL_ERROR_UNKNOWN_VERTICAL');
  assert.equal(report.matrix[1].sourceEvidenceStatus, 'STRUCTURAL_ERROR_UNKNOWN_ACQUISITION_STATUS');
});

test('invalid policies and unsafe queue topology fail closed before qualification', () => {
  const invalidName = policy();
  invalidName.policy = 'OTHER';
  assert.match(run({ p: invalidName }).result.stderr, /Invalid scarcity source qualification policy/);

  const invalidPrimitive = policy();
  invalidPrimitive.primitive = 'DEMAND_ATTENTION';
  assert.match(run({ p: invalidPrimitive }).result.stderr, /must require TOTAL_PRODUCED/);

  const unsafeSource = policy();
  unsafeSource.sourceQualification.automaticSourceQualificationAllowed = true;
  assert.match(run({ p: unsafeSource }).result.stderr, /Unsafe source qualification policy/);

  const unsafeSafety = policy();
  unsafeSafety.safety.syntheticAllowed = true;
  assert.match(run({ p: unsafeSafety }).result.stderr, /Unsafe scarcity source policy/);

  const badQueue = queue([], 1);
  assert.match(run({ q: badQueue }).result.stderr, /Unsafe or incomplete scarcity target queue/);

  const badMode = queue([], 0, 'OTHER');
  assert.match(run({ q: badMode }).result.stderr, /Unsafe or incomplete scarcity target queue/);

  const sevenVerticals = policy();
  delete sevenVerticals.verticalSignals['cards-comics-memorabilia'];
  assert.match(run({ p: sevenVerticals }).result.stderr, /Expected 8 vertical signal contracts/);
});

test('missing file input fails closed', () => {
  const env = {
    ...process.env,
    KIDULTS_SCARCITY_SOURCE_POLICY_JSON: path.join(os.tmpdir(), 'does-not-exist-kidults-policy.json'),
    KIDULTS_SCARCITY_TARGET_QUEUE_JSON: JSON.stringify(queue([])),
    KIDULTS_SCARCITY_SOURCE_POC_JSON: JSON.stringify(poc([])),
  };
  const result = spawnSync(process.execPath, ['scripts/kidult100-scarcity-source-qualification.mjs'], {
    cwd: process.cwd(), env, encoding: 'utf8',
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Missing JSON input/);
});
