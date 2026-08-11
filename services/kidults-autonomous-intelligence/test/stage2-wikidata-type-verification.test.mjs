import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const SCRIPT = path.join(ROOT, 'scripts', 'kidult100-stage2-wikidata-type-verify.mjs');

function candidate(overrides = {}) {
  return {
    candidateKey: 'wikidata:Q100',
    canonicalTitle: 'Lancia Stratos',
    description: null,
    vertical: 'automobiles-mobility',
    source: 'wikidata',
    sourceClass: 'REFERENCE_PUBLIC_DATA',
    sourceRecordId: 'Q100',
    sourceUrl: 'http://www.wikidata.org/entity/Q100',
    rightsClass: 'CC0_STRUCTURED_DATA',
    observedAt: '2026-08-11T00:00:00Z',
    payloadHash: 'a'.repeat(64),
    query: 'Lancia Stratos',
    semanticRelevant: false,
    semanticStageA: { passed: true },
    semanticStageD: {
      passed: false,
      reasons: ['REFERENCE_PRODUCT_OBJECT_CONTEXT_MISSING'],
      diagnostics: { allAnchorsMatched: true },
    },
    ...overrides,
  };
}

function entity(typeIds = []) {
  return {
    claims: {
      P31: typeIds.map((id) => ({ mainsnak: { datavalue: { value: { id } } } })),
    },
  };
}

function type(label, description = '') {
  return {
    labels: { en: { value: label } },
    descriptions: { en: { value: description } },
  };
}

function run(candidates, options = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wikidata-type-verify-'));
  const output = path.join(dir, 'poc.json');
  const audit = path.join(dir, 'audit.json');
  const input = { mode: 'KIDULT100_VALUE_BEFORE_DATA_POC', semanticPolicy: {}, metrics: {}, candidateBuild: {}, claims: {}, candidates };
  const env = {
    ...process.env,
    KIDULTS_WIKIDATA_TYPE_INPUT_JSON: JSON.stringify(input),
    KIDULTS_WIKIDATA_TYPE_OUTPUT: output,
    KIDULTS_WIKIDATA_TYPE_AUDIT_OUTPUT: audit,
  };
  if (options.fixture !== undefined) env.KIDULTS_WIKIDATA_TYPE_ENTITIES_JSON = JSON.stringify({ entities: options.fixture });
  if (options.policy !== undefined) env.KIDULTS_WIKIDATA_TYPE_POLICY_JSON = JSON.stringify(options.policy);
  if (options.liveEntities) {
    const mockPath = path.join(dir, 'mock-fetch.mjs');
    const failCall = Number(options.failCall || 0);
    fs.writeFileSync(mockPath, `const entities=${JSON.stringify(options.liveEntities)}; let call=0; const failCall=${failCall}; globalThis.fetch=async (url)=>{ call+=1; if (call===failCall) return {ok:false,status:503,json:async()=>({})}; const ids=(new URL(url)).searchParams.get('ids').split('|'); return {ok:true,status:200,json:async()=>({entities:Object.fromEntries(ids.map((id)=>[id,entities[id] ?? {id,missing:''}]))})}; };`);
    env.NODE_OPTIONS = `${process.env.NODE_OPTIONS || ''} --import=${mockPath}`.trim();
  }
  const result = spawnSync(process.execPath, [SCRIPT], { cwd: ROOT, encoding: 'utf8', env });
  const verified = fs.existsSync(output) ? JSON.parse(fs.readFileSync(output, 'utf8')) : null;
  const auditReport = fs.existsSync(audit) ? JSON.parse(fs.readFileSync(audit, 'utf8')) : null;
  fs.rmSync(dir, { recursive: true, force: true });
  return { result, verified, audit: auditReport };
}

const defaultFixture = {
  Q100: entity(['Q900']),
  Q900: type('car model', 'industrial automobile model'),
  Q101: entity(['Q901']),
  Q901: type('trademark'),
  Q102: entity([]),
  Q103: { missing: '' },
  Q104: entity(['Q904']),
  Q904: type('Wikimedia duplicated page'),
};

test('requalifies only direct P31 product types and preserves source identity', () => {
  const rows = [
    candidate(),
    candidate({ candidateKey: 'wikidata:Q101', sourceRecordId: 'Q101', canonicalTitle: 'Adidas Superstar', vertical: 'fashion-accessories', payloadHash: 'b'.repeat(64) }),
    candidate({ candidateKey: 'wikidata:Q102', sourceRecordId: 'Q102', canonicalTitle: 'No Type', payloadHash: 'c'.repeat(64) }),
    candidate({ candidateKey: 'wikidata:Q103', sourceRecordId: 'Q103', canonicalTitle: 'Missing Entity', payloadHash: 'd'.repeat(64) }),
    candidate({ candidateKey: 'wikidata:Q104', sourceRecordId: 'Q104', canonicalTitle: 'Nintendo Entertainment System', vertical: 'gaming-music-screen', payloadHash: 'e'.repeat(64) }),
    candidate({ candidateKey: 'wikidata:Q105', sourceRecordId: 'Q105', canonicalTitle: 'Partial Anchor', payloadHash: 'f'.repeat(64), semanticStageD: { passed: false, reasons: ['REFERENCE_PRODUCT_OBJECT_CONTEXT_MISSING'], diagnostics: { allAnchorsMatched: false } } }),
    candidate({ candidateKey: 'wikidata:Q106', sourceRecordId: 'Q106', canonicalTitle: 'Already Relevant', payloadHash: '1'.repeat(64), semanticRelevant: true, semanticStageD: { passed: true, reasons: ['REFERENCE_PRODUCT_DESCRIPTION_CONFIRMED'], diagnostics: { allAnchorsMatched: true } } }),
  ];
  const { result, verified, audit } = run(rows, { fixture: defaultFixture });
  assert.equal(result.status, 0, result.stderr);
  const recovered = verified.candidates.find((row) => row.candidateKey === 'wikidata:Q100');
  assert.equal(recovered.semanticRelevant, true);
  assert.equal(recovered.semanticStageE.reasons[0], 'WIKIDATA_DIRECT_P31_PRODUCT_TYPE_CONFIRMED');
  assert.equal(recovered.payloadHash, 'a'.repeat(64));
  assert.equal(recovered.rightsClass, 'CC0_STRUCTURED_DATA');
  assert.equal(recovered.semanticStageE.proof.directTypeIds[0], 'Q900');
  assert.match(recovered.semanticStageE.proof.verificationPayloadHash, /^[a-f0-9]{64}$/);
  assert.equal(verified.candidates.find((row) => row.candidateKey === 'wikidata:Q101').semanticStageE.reasons[0], 'WIKIDATA_DIRECT_P31_DISALLOWED_TYPE');
  assert.equal(verified.candidates.find((row) => row.candidateKey === 'wikidata:Q102').semanticStageE.reasons[0], 'WIKIDATA_DIRECT_P31_MISSING');
  assert.equal(verified.candidates.find((row) => row.candidateKey === 'wikidata:Q103').semanticStageE.reasons[0], 'WIKIDATA_ENTITY_UNAVAILABLE');
  assert.equal(verified.candidates.find((row) => row.candidateKey === 'wikidata:Q104').semanticRelevant, false);
  assert.equal(verified.candidates.find((row) => row.candidateKey === 'wikidata:Q105').semanticStageE.disposition, 'NOT_ELIGIBLE_FOR_SOURCE_NATIVE_REQUALIFICATION');
  assert.equal(verified.candidates.find((row) => row.candidateKey === 'wikidata:Q106').semanticStageE.disposition, 'NOT_APPLICABLE_ALREADY_RELEVANT');
  assert.equal(audit.metrics.recoveredCandidates, 1);
  assert.equal(audit.safety.unauthorizedScrapingRequested, false);
});

test('valid direct P31 with no allowed vertical type remains rejected', () => {
  const fixture = { Q100: entity(['Q910']), Q910: type('media franchise', 'entertainment franchise') };
  const { result, verified } = run([candidate({ vertical: 'toys-models', canonicalTitle: 'Gundam' })], { fixture });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(verified.candidates[0].semanticRelevant, false);
  assert.equal(verified.candidates[0].semanticStageE.reasons[0], 'WIKIDATA_DIRECT_P31_DISALLOWED_TYPE');
});

test('live path uses bounded official-style entity fetch and records request metrics', () => {
  const liveEntities = { Q100: entity(['Q900']), Q900: type('car model') };
  const { result, verified, audit } = run([candidate()], { liveEntities });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(verified.candidates[0].semanticRelevant, true);
  assert.equal(audit.metrics.requestCount, 2);
  assert.equal(audit.metrics.sourceErrorCount, 0);
});

test('live candidate-entity fetch failure is recorded and remains fail-closed', () => {
  const liveEntities = { Q100: entity(['Q900']), Q900: type('car model') };
  const { result, verified, audit } = run([candidate()], { liveEntities, failCall: 1 });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(verified.candidates[0].semanticRelevant, false);
  assert.equal(verified.candidates[0].semanticStageE.reasons[0], 'WIKIDATA_ENTITY_UNAVAILABLE');
  assert.equal(audit.metrics.requestCount, 1);
  assert.equal(audit.metrics.sourceErrorCount, 1);
  assert.equal(audit.sourceErrors[0].stage, 'CANDIDATE_ENTITY_FETCH');
});

test('live direct-type fetch failure is recorded and cannot requalify', () => {
  const liveEntities = { Q100: entity(['Q900']), Q900: type('car model') };
  const { result, verified, audit } = run([candidate()], { liveEntities, failCall: 2 });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(verified.candidates[0].semanticRelevant, false);
  assert.equal(verified.candidates[0].semanticStageE.reasons[0], 'WIKIDATA_DIRECT_P31_PRODUCT_TYPE_NOT_CONFIRMED');
  assert.equal(audit.metrics.requestCount, 2);
  assert.equal(audit.metrics.sourceErrorCount, 1);
  assert.equal(audit.sourceErrors[0].stage, 'DIRECT_TYPE_FETCH');
});

test('unknown vertical is structural and fails closed', () => {
  const fixture = { Q100: entity(['Q900']), Q900: type('car model') };
  const { result, verified } = run([candidate({ vertical: 'unknown-vertical' })], { fixture });
  assert.notEqual(result.status, 0);
  assert.equal(verified, null);
  assert.match(result.stderr, /structural errors/i);
});

test('unsafe policy and malformed inputs fail before materialization', () => {
  const policy = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'kidult100-wikidata-type-verification-policy.json'), 'utf8'));
  const badPolicy = { ...policy, directTypeProperty: 'P279' };
  const bad = run([candidate()], { fixture: defaultFixture, policy: badPolicy });
  assert.notEqual(bad.result.status, 0);
  assert.match(bad.result.stderr, /direct P31/i);

  const duplicate = run([candidate(), candidate()], { fixture: defaultFixture });
  assert.notEqual(duplicate.result.status, 0);
  assert.match(duplicate.result.stderr, /Duplicate POC candidateKey/);
});
