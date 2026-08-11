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
    canonicalTitle: 'Exact Product Model',
    description: 'company',
    vertical: 'fashion-accessories',
    source: 'wikidata',
    sourceClass: 'REFERENCE_PUBLIC_DATA',
    sourceRecordId: 'Q100',
    sourceUrl: 'http://www.wikidata.org/entity/Q100',
    rightsClass: 'CC0_STRUCTURED_DATA',
    observedAt: '2026-08-11T00:00:00Z',
    payloadHash: 'a'.repeat(64),
    query: 'Exact Product Model',
    semanticRelevant: false,
    semanticStageD: {
      passed: false,
      reasons: ['REFERENCE_DISALLOWED_ENTITY_OR_MEDIA_CONTEXT'],
      diagnostics: { allAnchorsMatched: true, exactTitleQuery: true, modelSpecific: true },
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

function run(candidates, fixture) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wikidata-type-strict-disallowed-'));
  const output = path.join(dir, 'poc.json');
  const audit = path.join(dir, 'audit.json');
  const input = { mode: 'KIDULT100_VALUE_BEFORE_DATA_POC', semanticPolicy: {}, metrics: {}, candidateBuild: {}, claims: {}, candidates };
  const result = spawnSync(process.execPath, [SCRIPT], {
    cwd: ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      KIDULTS_WIKIDATA_TYPE_INPUT_JSON: JSON.stringify(input),
      KIDULTS_WIKIDATA_TYPE_OUTPUT: output,
      KIDULTS_WIKIDATA_TYPE_AUDIT_OUTPUT: audit,
      KIDULTS_WIKIDATA_TYPE_ENTITIES_JSON: JSON.stringify({ entities: fixture }),
    },
  });
  const verified = fs.existsSync(output) ? JSON.parse(fs.readFileSync(output, 'utf8')) : null;
  const auditReport = fs.existsSync(audit) ? JSON.parse(fs.readFileSync(audit, 'utf8')) : null;
  fs.rmSync(dir, { recursive: true, force: true });
  return { result, verified, audit: auditReport };
}

test('strict disallowed-context lane requires clean explicit product P31 and rejects business/company conflicts', () => {
  const rows = [
    candidate(),
    candidate({
      candidateKey: 'wikidata:Q531870',
      sourceRecordId: 'Q531870',
      canonicalTitle: 'Chanel 2.55',
      query: 'Chanel 2.55',
      payloadHash: 'b'.repeat(64),
    }),
    candidate({
      candidateKey: 'wikidata:Q200',
      sourceRecordId: 'Q200',
      canonicalTitle: 'Company Product',
      query: 'Company Product',
      payloadHash: 'c'.repeat(64),
    }),
    candidate({
      candidateKey: 'wikidata:Q201',
      sourceRecordId: 'Q201',
      canonicalTitle: 'Weak Identity',
      query: 'Weak Identity',
      payloadHash: 'd'.repeat(64),
      semanticStageD: {
        passed: false,
        reasons: ['REFERENCE_DISALLOWED_ENTITY_OR_MEDIA_CONTEXT'],
        diagnostics: { allAnchorsMatched: true, exactTitleQuery: false, modelSpecific: false },
      },
    }),
  ];
  const fixture = {
    Q100: entity(['Q301']),
    Q301: type('handbag'),
    Q531870: entity(['Q300', 'Q301']),
    Q300: type('business'),
    Q200: entity(['Q302', 'Q301']),
    Q302: type('company'),
    Q201: entity(['Q301']),
  };

  const { result, verified, audit } = run(rows, fixture);
  assert.equal(result.status, 0, result.stderr);

  const recovered = verified.candidates[0];
  assert.equal(recovered.semanticRelevant, true);
  assert.equal(recovered.semanticStageE.reasons[0], 'WIKIDATA_DIRECT_P31_PRODUCT_TYPE_CONFIRMED');
  assert.equal(recovered.payloadHash, 'a'.repeat(64));
  assert.equal(recovered.rightsClass, 'CC0_STRUCTURED_DATA');

  const businessConflict = verified.candidates[1];
  assert.equal(businessConflict.semanticRelevant, false);
  assert.equal(businessConflict.semanticStageE.reasons[0], 'WIKIDATA_DIRECT_P31_DISALLOWED_TYPE');
  assert.equal(businessConflict.semanticStageE.proof.allowedHits.some((hit) => hit.term === 'handbag'), true);
  assert.equal(businessConflict.semanticStageE.proof.hardDisallowedHits.some((hit) => hit.term === 'business'), true);

  const companyConflict = verified.candidates[2];
  assert.equal(companyConflict.semanticRelevant, false);
  assert.equal(companyConflict.semanticStageE.reasons[0], 'WIKIDATA_DIRECT_P31_DISALLOWED_TYPE');

  const weakIdentity = verified.candidates[3];
  assert.equal(weakIdentity.semanticRelevant, false);
  assert.equal(weakIdentity.semanticStageE.disposition, 'NOT_ELIGIBLE_FOR_SOURCE_NATIVE_REQUALIFICATION');

  assert.equal(audit.metrics.eligibleStageDStrictDisallowedContextCandidates, 3);
  assert.equal(audit.metrics.recoveredStrictDisallowedContextCandidates, 1);
  assert.equal(audit.safety.stageDDisallowedContextCanQualifyWithoutExactOrModelIdentity, false);
  assert.equal(audit.safety.hardDisallowedEntityOrMediaTypeCanBeOverridden, false);
  assert.equal(audit.safety.rightsClassificationRelaxed, false);
  assert.equal(audit.safety.provenanceRelaxed, false);
});
