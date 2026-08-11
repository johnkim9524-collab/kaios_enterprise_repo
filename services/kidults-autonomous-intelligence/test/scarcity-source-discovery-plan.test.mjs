import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const SOURCE_TIERS = [
  { id: 'OFFICIAL', priority: 1, requiresExplicitQuantity: true, requiresCommercialReuseRights: true, requiresDocumentedAutomatedAccess: true },
];

function policy(overrides = {}) {
  return {
    policy: 'FAIL_CLOSED_SCARCITY_SOURCE_DISCOVERY_WORK_PACKETS',
    requiredInputMode: 'KIDULT100_SCARCITY_SOURCE_QUALIFICATION_MATRIX',
    eligibleQualificationStatus: 'RIGHTS_QUALIFIED_SOURCE_DISCOVERY_REQUIRED',
    requiredSignalType: 'TOTAL_PRODUCED',
    specificity: {
      genericExactTitles: ['action figure', 'watch', 'bag'],
      unsafeDescriptionPhrases: ['sketch from saturday night live', 'scientific article'],
      institutionalArchiveRequiresModelSpecificity: true,
    },
    sourceTiers: SOURCE_TIERS,
    evidenceChecklist: ['EXACT_ENTITY_MATCH', 'EXPLICIT_TOTAL_PRODUCED_QUANTITY'],
    safety: {
      automaticQualificationAllowed: false,
      searchResultSnippetAcceptedAsEvidence: false,
      unauthorizedScrapingAllowed: false,
      paidProviderProcurementAllowed: false,
      contractExecutionAllowed: false,
      productionScoringActivationAllowed: false,
    },
    ...overrides,
  };
}

function row(candidateKey, title, description, sourceClass = 'REFERENCE_PUBLIC_DATA', qualificationStatus = 'RIGHTS_QUALIFIED_SOURCE_DISCOVERY_REQUIRED') {
  return {
    candidateKey,
    canonicalTitle: title,
    description,
    vertical: 'toys-models',
    currentReferenceSource: 'wikidata',
    currentReferenceSourceClass: sourceClass,
    currentReferenceRightsClass: 'CC0_STRUCTURED_DATA',
    currentReferenceSourceUrl: 'https://www.wikidata.org/wiki/Q1',
    qualificationStatus,
  };
}

function run({ p = policy(), input = { mode: 'KIDULT100_SCARCITY_SOURCE_QUALIFICATION_MATRIX', matrix: [] }, useFiles = false, relativeOutput = false } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-scarcity-discovery-'));
  const out = relativeOutput ? path.join('reports', 'test-scarcity-discovery.json') : path.join(tmp, 'out.json');
  const env = { ...process.env, KIDULTS_SCARCITY_SOURCE_DISCOVERY_OUTPUT: out };
  if (useFiles) {
    const policyPath = path.join(tmp, 'policy.json');
    const inputPath = path.join(tmp, 'input.json');
    fs.writeFileSync(policyPath, JSON.stringify(p));
    fs.writeFileSync(inputPath, JSON.stringify(input));
    env.KIDULTS_SCARCITY_DISCOVERY_POLICY_JSON = policyPath;
    env.KIDULTS_SCARCITY_SOURCE_QUALIFICATION_JSON = inputPath;
  } else {
    env.KIDULTS_SCARCITY_DISCOVERY_POLICY_JSON = JSON.stringify(p);
    env.KIDULTS_SCARCITY_SOURCE_QUALIFICATION_JSON = JSON.stringify(input);
  }
  const result = spawnSync(process.execPath, ['scripts/kidult100-scarcity-source-discovery-plan.mjs'], {
    cwd: process.cwd(), encoding: 'utf8', env,
  });
  const resolvedOut = relativeOutput ? path.join(process.cwd(), out) : out;
  const report = fs.existsSync(resolvedOut) ? JSON.parse(fs.readFileSync(resolvedOut, 'utf8')) : null;
  if (relativeOutput) fs.rmSync(resolvedOut, { force: true });
  fs.rmSync(tmp, { recursive: true, force: true });
  return { result, report };
}

test('mixed qualification matrix creates only entity-specific work packets without qualification', () => {
  const input = {
    mode: 'KIDULT100_SCARCITY_SOURCE_QUALIFICATION_MATRIX',
    matrix: [
      row('specific-public', 'Patek Philippe Nautilus', 'Luxury watch by Patek Philippe'),
      row('generic', 'action figure', 'small toy that resembles a figure'),
      row('unsafe', 'Star Wars Toy Commercial', 'sketch from Saturday Night Live'),
      row('institution-model', 'Barcelona Chair model MR 90', 'seating', 'INSTITUTION_ARCHIVE'),
      row('institution-generic', 'Miser Bag', 'textile', 'INSTITUTION_ARCHIVE'),
      row('upstream-review', 'Mystery Object', 'unknown', 'REFERENCE_PUBLIC_DATA', 'ENTITY_SCOPE_REVIEW_REQUIRED'),
    ],
  };
  const { result, report } = run({ input, useFiles: true, relativeOutput: true });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(report.metrics.inputTargets, 6);
  assert.equal(report.metrics.sourceDiscoveryReadyTargets, 2);
  assert.equal(report.metrics.specificityReviewTargets, 3);
  assert.equal(report.metrics.excludedContaminationTargets, 1);
  assert.equal(report.metrics.automaticallyQualifiedSources, 0);
  assert.equal(report.disposition, 'SOURCE_DISCOVERY_WORK_PACKETS_READY');
  assert.deepEqual(report.workPackets.map((item) => item.candidateKey), ['specific-public', 'institution-model']);
  assert.ok(report.workPackets.every((item) => item.qualifiedScarcitySource === false && item.automaticQualificationAllowed === false));
  assert.ok(report.workPackets[0].querySeeds.some((query) => query.includes('total produced')));
  assert.equal(report.safety.unauthorizedScrapingRequested, false);
});

test('all generic or institutional-unspecific targets stay review-blocked', () => {
  const input = {
    mode: 'KIDULT100_SCARCITY_SOURCE_QUALIFICATION_MATRIX',
    matrix: [row('generic', 'watch', 'Watch'), row('archive', 'Miser Bag', 'textile', 'INSTITUTION_ARCHIVE')],
  };
  const { result, report } = run({ input });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(report.metrics.sourceDiscoveryReadyTargets, 0);
  assert.equal(report.metrics.specificityReviewTargets, 2);
  assert.equal(report.disposition, 'NO_ENTITY_SPECIFIC_SOURCE_DISCOVERY_TARGETS');
});

test('missing candidate identity fails closed structurally', () => {
  const input = { mode: 'KIDULT100_SCARCITY_SOURCE_QUALIFICATION_MATRIX', matrix: [{ vertical: 'toys-models' }] };
  const { result, report } = run({ input });
  assert.notEqual(result.status, 0);
  assert.equal(report.metrics.structuralErrors, 1);
  assert.equal(report.disposition, 'FAIL_CLOSED_STRUCTURAL_ERRORS');
});

test('unsafe or malformed policies fail closed before discovery', () => {
  const badName = run({ p: policy({ policy: 'WRONG' }) });
  assert.notEqual(badName.result.status, 0);
  assert.match(badName.result.stderr, /Invalid scarcity source discovery policy/);

  const badMode = run({ input: { mode: 'WRONG', matrix: [] } });
  assert.notEqual(badMode.result.status, 0);
  assert.match(badMode.result.stderr, /Invalid scarcity source qualification input mode/);

  const badSignal = run({ p: policy({ requiredSignalType: 'ESTIMATE' }) });
  assert.notEqual(badSignal.result.status, 0);
  assert.match(badSignal.result.stderr, /must require TOTAL_PRODUCED/);

  const noTiers = run({ p: policy({ sourceTiers: [] }) });
  assert.notEqual(noTiers.result.status, 0);
  assert.match(noTiers.result.stderr, /requires source tiers/);

  const unsafeTier = run({ p: policy({ sourceTiers: [{ id: 'BAD', priority: 1, requiresExplicitQuantity: false, requiresCommercialReuseRights: true, requiresDocumentedAutomatedAccess: true }] }) });
  assert.notEqual(unsafeTier.result.status, 0);
  assert.match(unsafeTier.result.stderr, /Unsafe or incomplete scarcity source tier/);

  const unsafeSafetyPolicy = policy();
  unsafeSafetyPolicy.safety.automaticQualificationAllowed = true;
  const unsafeSafety = run({ p: unsafeSafetyPolicy });
  assert.notEqual(unsafeSafety.result.status, 0);
  assert.match(unsafeSafety.result.stderr, /Unsafe scarcity source discovery policy/);
});

test('missing file input fails closed', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-scarcity-discovery-missing-'));
  const env = {
    ...process.env,
    KIDULTS_SCARCITY_DISCOVERY_POLICY_JSON: JSON.stringify(policy()),
    KIDULTS_SCARCITY_SOURCE_QUALIFICATION_JSON: path.join(tmp, 'missing.json'),
    KIDULTS_SCARCITY_SOURCE_DISCOVERY_OUTPUT: path.join(tmp, 'out.json'),
  };
  const result = spawnSync(process.execPath, ['scripts/kidult100-scarcity-source-discovery-plan.mjs'], { cwd: process.cwd(), encoding: 'utf8', env });
  fs.rmSync(tmp, { recursive: true, force: true });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Missing JSON input/);
});
