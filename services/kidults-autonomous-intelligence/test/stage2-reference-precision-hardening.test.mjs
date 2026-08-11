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

function candidate(overrides = {}) {
  return {
    candidateKey: 'wikidata:Q1', vertical: 'toys-models', source: 'wikidata', sourceClass: 'REFERENCE_PUBLIC_DATA',
    sourceRecordId: 'Q1', canonicalTitle: 'Lego', description: 'construction toy', creator: null,
    sourceUrl: 'https://www.wikidata.org/wiki/Q1', observedAt: '2026-08-11T00:00:00Z', rightsClass: 'CC0_STRUCTURED_DATA',
    payloadHash: 'c'.repeat(64), query: 'LEGO', semanticRelevant: true, semanticStageA: { passed: true }, semanticStageB: { passed: true },
    ...overrides,
  };
}

function report(candidates) {
  return {
    mode: 'KIDULT100_VALUE_BEFORE_DATA_POC', semanticPolicy: {}, metrics: { semanticRecallCandidates: candidates.length },
    candidateBuild: {}, claims: {}, candidates,
  };
}

function run(input, options = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reference-precision-'));
  const output = path.join(dir, 'poc.json');
  const audit = path.join(dir, 'audit.json');
  const env = {
    ...process.env,
    KIDULTS_REFERENCE_PRECISION_INPUT_JSON: options.inputValue ?? JSON.stringify(input),
    KIDULTS_REFERENCE_PRECISION_OUTPUT: output,
    KIDULTS_REFERENCE_PRECISION_AUDIT_OUTPUT: audit,
  };
  if (options.policy !== undefined) env.KIDULTS_REFERENCE_PRECISION_POLICY_JSON = JSON.stringify(options.policy);
  const result = spawnSync(process.execPath, [SCRIPT], { cwd: ROOT, env, encoding: 'utf8' });
  const hardened = fs.existsSync(output) ? JSON.parse(fs.readFileSync(output, 'utf8')) : null;
  const auditReport = fs.existsSync(audit) ? JSON.parse(fs.readFileSync(audit, 'utf8')) : null;
  fs.rmSync(dir, { recursive: true, force: true });
  return { result, hardened, audit: auditReport };
}

test('retains query-anchored product objects while rejecting related companies media people places and files', () => {
  const rows = [
    candidate(),
    candidate({ candidateKey: 'lego-company', canonicalTitle: 'The Lego Group', description: 'Danish toy manufacturer', sourceRecordId: '2' }),
    candidate({ candidateKey: 'lego-game', canonicalTitle: 'Lego Batman 2', description: '2012 video game', sourceRecordId: '3' }),
    candidate({ candidateKey: 'barbie-person', query: 'Barbie', canonicalTitle: 'Barbie Forteza', description: 'Filipino actress', sourceRecordId: '4' }),
    candidate({ candidateKey: 'countach-car', vertical: 'automobiles-mobility', query: 'Lamborghini Countach', canonicalTitle: 'Lamborghini Countach', description: 'car model', sourceRecordId: '5' }),
    candidate({ candidateKey: 'countach-song', vertical: 'automobiles-mobility', query: 'Lamborghini Countach', canonicalTitle: 'Lamborghini Countach', description: 'song by Russian hip-hop artist', sourceRecordId: '6' }),
    candidate({ candidateKey: 'mac-computer', vertical: 'technology-cameras', query: 'Apple Macintosh', canonicalTitle: 'Mac', description: 'family of personal computers designed by Apple', sourceRecordId: '7' }),
    candidate({ candidateKey: 'mac-file', vertical: 'technology-cameras', query: 'Apple Macintosh', canonicalTitle: 'PICT', description: 'file format', sourceRecordId: '8' }),
  ];
  const { result, hardened, audit } = run(report(rows));
  assert.equal(result.status, 0, result.stderr);
  assert.equal(audit.metrics.referenceRelevantEvaluated, 8);
  assert.equal(audit.metrics.referenceRelevantRetained, 3);
  assert.equal(audit.metrics.referenceFalsePositivesDowngraded, 5);
  assert.equal(hardened.metrics.semanticRelevantCandidates, 3);
  assert.equal(hardened.semanticPolicy.version, 'SEMANTIC_V2_4_REFERENCE_PRECISION_HARDENED');
  assert.equal(hardened.candidates.find((x) => x.candidateKey === 'lego-company').semanticRelevant, false);
  assert.ok(hardened.candidates.find((x) => x.candidateKey === 'countach-song').semanticStageD.reasons.includes('REFERENCE_DISALLOWED_ENTITY_OR_MEDIA_CONTEXT'));
  assert.equal(hardened.candidates.find((x) => x.candidateKey === 'mac-computer').semanticRelevant, true);
  assert.equal(audit.safety.rightsClassificationRelaxed, false);
});

test('rejects generic discovery queries rather than counting category classes or incidental search results as candidate supply', () => {
  const rows = [
    candidate({ candidateKey: 'action', query: 'action figure', canonicalTitle: 'action figure', description: 'small toy that resembles a figure' }),
    candidate({ candidateKey: 'vinyl', vertical: 'gaming-music-screen', query: 'vinyl record', canonicalTitle: 'vinyl record', description: 'disc-shaped vinyl analog sound storage medium' }),
    candidate({ candidateKey: 'card', vertical: 'cards-comics-memorabilia', query: 'trading card', canonicalTitle: 'trading card set', description: 'set of collectible trading cards' }),
  ];
  const { result, hardened, audit } = run(report(rows));
  assert.equal(result.status, 0, result.stderr);
  assert.equal(audit.metrics.referenceFalsePositivesDowngraded, 3);
  assert.ok(hardened.candidates.every((x) => x.semanticStageD.reasons.includes('REFERENCE_GENERIC_QUERY_NOT_ENTITY_CANDIDATE')));
});

test('requires all meaningful query anchors, preventing related but different models and entities from entering supply', () => {
  const rows = [
    candidate({ candidateKey: 'mclaren-car', vertical: 'automobiles-mobility', query: 'McLaren F1', canonicalTitle: 'McLaren F1 GTR', description: 'racing car developed by McLaren Cars' }),
    candidate({ candidateKey: 'mclaren-team', vertical: 'automobiles-mobility', query: 'McLaren F1', canonicalTitle: 'McLaren', description: 'British Formula One team' }),
    candidate({ candidateKey: 'bmw-engine', vertical: 'automobiles-mobility', query: 'BMW M1', canonicalTitle: 'BMW M10', description: 'piston engine' }),
  ];
  const { result, hardened, audit } = run(report(rows));
  assert.equal(result.status, 0, result.stderr);
  assert.equal(audit.metrics.referenceRelevantRetained, 1);
  assert.equal(hardened.candidates.find((x) => x.candidateKey === 'mclaren-car').semanticRelevant, true);
  assert.ok(hardened.candidates.find((x) => x.candidateKey === 'mclaren-team').semanticStageD.reasons.includes('REFERENCE_QUERY_ANCHOR_MISMATCH'));
  assert.equal(hardened.candidates.find((x) => x.candidateKey === 'bmw-engine').semanticRelevant, false);
});

test('allows exact model-specific title with missing description but not an unproven generic brand result', () => {
  const rows = [
    candidate({ candidateKey: 'gt3r', vertical: 'automobiles-mobility', query: 'Porsche 911 GT3 R', canonicalTitle: 'Porsche 911 GT3 R', description: null }),
    candidate({ candidateKey: 'brand', vertical: 'watches-jewelry', query: 'Patek Philippe', canonicalTitle: 'Patek Philippe', description: null }),
  ];
  const { result, hardened, audit } = run(report(rows));
  assert.equal(result.status, 0, result.stderr);
  assert.equal(audit.metrics.referenceRelevantRetained, 1);
  assert.ok(hardened.candidates[0].semanticStageD.reasons.includes('REFERENCE_MODEL_SPECIFIC_EXACT_TITLE_CONFIRMED'));
  assert.ok(hardened.candidates[1].semanticStageD.reasons.includes('REFERENCE_PRODUCT_OBJECT_CONTEXT_MISSING'));
});

test('preserves already rejected candidates and non-reference institutional survivors without changing rights or provenance identity', () => {
  const rows = [
    candidate({ candidateKey: 'rejected', semanticRelevant: false, semanticStageB: { passed: false } }),
    candidate({ candidateKey: 'archive', source: 'met', sourceClass: 'INSTITUTION_ARCHIVE', sourceRecordId: '99', sourceUrl: 'https://www.metmuseum.org/art/collection/search/99', rightsClass: 'OPEN_ACCESS_PUBLIC_METADATA', vertical: 'design-furniture', query: 'Eames chair', canonicalTitle: 'Eames chair', description: 'Chair', semanticStageC: { passed: true } }),
  ];
  const { result, hardened, audit } = run(report(rows));
  assert.equal(result.status, 0, result.stderr);
  assert.equal(audit.metrics.referenceRelevantEvaluated, 0);
  assert.equal(hardened.candidates[0].semanticRelevant, false);
  assert.equal(hardened.candidates[1].semanticRelevant, true);
  assert.equal(hardened.candidates[1].semanticStageD.disposition, 'NOT_APPLICABLE_NON_REFERENCE_SOURCE');
  assert.equal(hardened.candidates[1].rightsClass, 'OPEN_ACCESS_PUBLIC_METADATA');
});

test('fails closed on unsafe topology, duplicate identity, unknown vertical, wrong mode, unsafe policy, missing file and non-array candidates', () => {
  const valid = report([candidate()]);
  const cases = [
    [{ ...valid, mode: 'WRONG' }, DEFAULT_POLICY],
    [report([candidate(), candidate()]), DEFAULT_POLICY],
    [report([candidate({ candidateKey: 'unknown', vertical: 'unknown' })]), DEFAULT_POLICY],
    [valid, { ...DEFAULT_POLICY, rules: { ...DEFAULT_POLICY.rules, queryAnchorRequired: false } }],
    [valid, { ...DEFAULT_POLICY, safety: { ...DEFAULT_POLICY.safety, normalizedScoreCreated: true } }],
    [{ ...valid, candidates: null }, DEFAULT_POLICY],
  ];
  for (const [input, policy] of cases) {
    const { result, hardened, audit } = run(input, { policy });
    assert.notEqual(result.status, 0);
    assert.equal(hardened, null);
    assert.equal(audit, null);
  }
  const missing = path.join(os.tmpdir(), `missing-reference-precision-${Date.now()}.json`);
  const absent = run({}, { inputValue: missing });
  assert.notEqual(absent.result.status, 0);
  assert.equal(absent.hardened, null);
});
