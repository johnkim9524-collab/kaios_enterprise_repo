import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const SCRIPT = path.join(ROOT, 'scripts', 'kidult100-stage2-wikidata-subclass-verify.mjs');
const POLICY_PATH = path.join(ROOT, 'config', 'kidult100-wikidata-subclass-verification-policy.json');

function claim(property, ids) {
  return { claims: { [property]: ids.map((id) => ({ mainsnak: { datavalue: { value: { id } } } })) } };
}

function type(label, description = '', superIds = []) {
  return {
    labels: { en: { value: label } },
    descriptions: { en: { value: description } },
    claims: { P279: superIds.map((id) => ({ mainsnak: { datavalue: { value: { id } } } })) },
  };
}

function candidate(overrides = {}) {
  return {
    candidateKey: 'wikidata:Q100',
    canonicalTitle: 'Example GT Model',
    vertical: 'automobiles-mobility',
    source: 'wikidata',
    sourceClass: 'REFERENCE_PUBLIC_DATA',
    sourceRecordId: 'Q100',
    sourceUrl: 'http://www.wikidata.org/entity/Q100',
    rightsClass: 'CC0_STRUCTURED_DATA',
    observedAt: '2026-08-11T00:00:00Z',
    payloadHash: 'a'.repeat(64),
    semanticRelevant: false,
    semanticStageD: { passed: false, diagnostics: { allAnchorsMatched: true } },
    semanticStageE: {
      passed: false,
      reasons: ['WIKIDATA_DIRECT_P31_PRODUCT_TYPE_NOT_CONFIRMED'],
      proof: { directTypeIds: ['Q900'] },
    },
    ...overrides,
  };
}

function run(candidates, options = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wikidata-subclass-verify-'));
  const output = path.join(dir, 'poc.json');
  const audit = path.join(dir, 'audit.json');
  const input = { mode: options.mode || 'KIDULT100_VALUE_BEFORE_DATA_POC', semanticPolicy: {}, metrics: {}, candidateBuild: {}, claims: {}, candidates };
  const env = {
    ...process.env,
    KIDULTS_WIKIDATA_SUBCLASS_INPUT_JSON: JSON.stringify(input),
    KIDULTS_WIKIDATA_SUBCLASS_OUTPUT: output,
    KIDULTS_WIKIDATA_SUBCLASS_AUDIT_OUTPUT: audit,
  };
  if (options.fixture !== undefined) env.KIDULTS_WIKIDATA_SUBCLASS_ENTITIES_JSON = JSON.stringify({ entities: options.fixture });
  if (options.policy !== undefined) env.KIDULTS_WIKIDATA_SUBCLASS_POLICY_JSON = JSON.stringify(options.policy);
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

const baseFixture = {
  Q900: type('specific automobile variant', '', ['Q910']),
  Q910: type('car model', 'automobile product model'),
};

test('requalifies only an explicit one-hop P279 product superclass and preserves identity', () => {
  const { result, verified, audit } = run([candidate()], { fixture: baseFixture });
  assert.equal(result.status, 0, result.stderr);
  const row = verified.candidates[0];
  assert.equal(row.semanticRelevant, true);
  assert.equal(row.semanticStageF.reasons[0], 'WIKIDATA_ONE_HOP_P279_PRODUCT_TYPE_CONFIRMED');
  assert.deepEqual(row.semanticStageF.proof.subclassEdges, [{ typeId: 'Q900', superclassIds: ['Q910'] }]);
  assert.match(row.semanticStageF.proof.verificationPayloadHash, /^[a-f0-9]{64}$/);
  assert.equal(row.payloadHash, 'a'.repeat(64));
  assert.equal(row.rightsClass, 'CC0_STRUCTURED_DATA');
  assert.equal(audit.metrics.recoveredCandidates, 1);
  assert.equal(audit.safety.recursiveSubclassTraversalPerformed, false);
});

test('disallowed superclass overrides an allowed-looking chain and unknown superclass remains rejected', () => {
  const fixture = {
    Q900: type('specific item', '', ['Q910']),
    Q910: type('media franchise', 'car model entertainment franchise'),
    Q901: type('specific item', '', ['Q911']),
    Q911: type('industrial artifact', 'unclassified object'),
  };
  const rows = [
    candidate(),
    candidate({ candidateKey: 'wikidata:Q101', sourceRecordId: 'Q101', payloadHash: 'b'.repeat(64), semanticStageE: { passed: false, reasons: ['WIKIDATA_DIRECT_P31_PRODUCT_TYPE_NOT_CONFIRMED'], proof: { directTypeIds: ['Q901'] } } }),
  ];
  const { result, verified } = run(rows, { fixture });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(verified.candidates[0].semanticStageF.reasons[0], 'WIKIDATA_ONE_HOP_P279_DISALLOWED_TYPE');
  assert.equal(verified.candidates[1].semanticStageF.reasons[0], 'WIKIDATA_ONE_HOP_P279_PRODUCT_TYPE_NOT_CONFIRMED');
  assert.equal(verified.candidates[0].semanticRelevant, false);
  assert.equal(verified.candidates[1].semanticRelevant, false);
});

test('missing direct type, missing P279 and unavailable superclass all fail closed', () => {
  const fixture = {
    Q900: { missing: '' },
    Q901: type('specific item', '', []),
    Q902: type('specific item', '', ['Q912']),
    Q912: { missing: '' },
  };
  const rows = [
    candidate(),
    candidate({ candidateKey: 'wikidata:Q101', sourceRecordId: 'Q101', payloadHash: 'b'.repeat(64), semanticStageE: { passed: false, reasons: ['WIKIDATA_DIRECT_P31_PRODUCT_TYPE_NOT_CONFIRMED'], proof: { directTypeIds: ['Q901'] } } }),
    candidate({ candidateKey: 'wikidata:Q102', sourceRecordId: 'Q102', payloadHash: 'c'.repeat(64), semanticStageE: { passed: false, reasons: ['WIKIDATA_DIRECT_P31_PRODUCT_TYPE_NOT_CONFIRMED'], proof: { directTypeIds: ['Q902'] } } }),
  ];
  const { result, verified } = run(rows, { fixture });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(verified.candidates[0].semanticStageF.reasons[0], 'WIKIDATA_DIRECT_TYPE_ENTITY_UNAVAILABLE');
  assert.equal(verified.candidates[1].semanticStageF.reasons[0], 'WIKIDATA_ONE_HOP_P279_MISSING');
  assert.equal(verified.candidates[2].semanticStageF.reasons[0], 'WIKIDATA_SUPERCLASS_ENTITY_UNAVAILABLE');
});

test('already relevant and ineligible Stage E records are preserved without requalification', () => {
  const rows = [
    candidate({ semanticRelevant: true, semanticStageE: { passed: true, reasons: ['WIKIDATA_DIRECT_P31_PRODUCT_TYPE_CONFIRMED'], proof: { directTypeIds: ['Q900'] } } }),
    candidate({ candidateKey: 'wikidata:Q101', sourceRecordId: 'Q101', payloadHash: 'b'.repeat(64), semanticStageE: { passed: false, reasons: ['WIKIDATA_DIRECT_P31_DISALLOWED_TYPE'], proof: { directTypeIds: ['Q901'] } } }),
    candidate({ candidateKey: 'wikidata:Q102', sourceRecordId: 'Q102', payloadHash: 'c'.repeat(64), semanticStageD: { passed: false, diagnostics: { allAnchorsMatched: false } }),
  ];
  const { result, verified } = run(rows, { fixture: {} });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(verified.candidates[0].semanticStageF.disposition, 'NOT_APPLICABLE_ALREADY_RELEVANT');
  assert.equal(verified.candidates[1].semanticStageF.disposition, 'NOT_ELIGIBLE_FOR_ONE_HOP_SUBCLASS_REQUALIFICATION');
  assert.equal(verified.candidates[2].semanticStageF.disposition, 'NOT_ELIGIBLE_FOR_ONE_HOP_SUBCLASS_REQUALIFICATION');
});

test('live path performs only direct-type and one-hop superclass fetches', () => {
  const liveEntities = { Q900: type('specific automobile variant', '', ['Q910']), Q910: type('car model') };
  const { result, verified, audit } = run([candidate()], { liveEntities });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(verified.candidates[0].semanticRelevant, true);
  assert.equal(audit.metrics.requestCount, 2);
  assert.equal(audit.metrics.sourceErrorCount, 0);
});

test('live fetch failures are recorded and cannot produce recovery', () => {
  const liveEntities = { Q900: type('specific automobile variant', '', ['Q910']), Q910: type('car model') };
  const first = run([candidate()], { liveEntities, failCall: 1 });
  assert.equal(first.result.status, 0, first.result.stderr);
  assert.equal(first.verified.candidates[0].semanticRelevant, false);
  assert.equal(first.audit.sourceErrors[0].stage, 'DIRECT_TYPE_ENTITY_FETCH');
  assert.equal(first.audit.metrics.requestCount, 1);

  const second = run([candidate()], { liveEntities, failCall: 2 });
  assert.equal(second.result.status, 0, second.result.stderr);
  assert.equal(second.verified.candidates[0].semanticRelevant, false);
  assert.equal(second.verified.candidates[0].semanticStageF.reasons[0], 'WIKIDATA_SUPERCLASS_ENTITY_UNAVAILABLE');
  assert.equal(second.audit.sourceErrors[0].stage, 'SUPERCLASS_ENTITY_FETCH');
  assert.equal(second.audit.metrics.requestCount, 2);
});

test('unknown vertical, duplicate identity and malformed topology fail closed', () => {
  const unknown = run([candidate({ vertical: 'unknown-vertical' })], { fixture: baseFixture });
  assert.notEqual(unknown.result.status, 0);
  assert.equal(unknown.verified, null);
  assert.match(unknown.result.stderr, /structural errors/i);

  const duplicate = run([candidate(), candidate()], { fixture: baseFixture });
  assert.notEqual(duplicate.result.status, 0);
  assert.match(duplicate.result.stderr, /Duplicate POC candidateKey/);
});

test('policy safety boundaries fail before output generation', () => {
  const policy = JSON.parse(fs.readFileSync(POLICY_PATH, 'utf8'));
  const cases = [
    { ...policy, policy: 'WRONG' },
    { ...policy, semanticStage: '' },
    { ...policy, subclassProperty: 'P31' },
    { ...policy, maxSubclassDepth: 2 },
    { ...policy, allowedTypeTermsByVertical: null },
    { ...policy, rules: { ...policy.rules, recursiveTraversalForbidden: false } },
    { ...policy, safety: { ...policy.safety, unauthorizedScrapingRequested: true } },
  ];
  for (const badPolicy of cases) {
    const { result, verified } = run([candidate()], { fixture: baseFixture, policy: badPolicy });
    assert.notEqual(result.status, 0);
    assert.equal(verified, null);
  }
  const wrongMode = run([candidate()], { fixture: baseFixture, mode: 'WRONG_MODE' });
  assert.notEqual(wrongMode.result.status, 0);
});
