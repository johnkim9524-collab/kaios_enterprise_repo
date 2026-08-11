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
    candidateKey: 'wikidata:Q531870',
    canonicalTitle: 'Chanel 2.55',
    description: 'company',
    vertical: 'fashion-accessories',
    source: 'wikidata',
    sourceClass: 'REFERENCE_PUBLIC_DATA',
    sourceRecordId: 'Q531870',
    sourceUrl: 'http://www.wikidata.org/entity/Q531870',
    rightsClass: 'CC0_STRUCTURED_DATA',
    observedAt: '2026-08-11T00:00:00Z',
    payloadHash: 'a'.repeat(64),
    query: 'Chanel 2.55',
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

test('strict disallowed-context lane recovers only exact/model-specific QIDs with explicit allowed P31 product proof', () => {
  const rows = [
    candidate(),
    candidate({
      candidateKey: 'wikidata:Q200',
      sourceRecordId: 'Q200',
      canonicalTitle: 'Company Product',
      payloadHash: 'b'.repeat(64),
    }),
    candidate({
      candidateKey: 'wikidata:Q201',
      sourceRecordId: 'Q201',
      canonicalTitle: 'Weak Identity',
      payloadHash: 'c'.repeat(64),
      semanticStageD: {
        passed: false,
        reasons: ['REFERENCE_DISALLOWED_ENTITY_OR_MEDIA_CONTEXT'],
        diagnostics: { allAnchorsMatched: true, exactTitleQuery: false, modelSpecific: false },
      },
    }),
  ];
  const fixture = {
    Q531870: entity(['Q300', 'Q301']),
    Q300: type('business'),
    Q301: type('handbag'),
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

  const hardDisallowed = verified.candidates[1];
  assert.equal(hardDisallowed.semanticRelevant, false);
  assert.equal(hardDisallowed.semanticStageE.reasons[0], 'WIKIDATA_DIRECT_P31_DISALLOWED_TYPE');

  const weakIdentity = verified.candidates[2];
  assert.equal(weakIdentity.semanticRelevant, false);
  assert.equal(weakIdentity.semanticStageE.disposition, 'NOT_ELIGIBLE_FOR_SOURCE_NATIVE_REQUALIFICATION');

  assert.equal(audit.metrics.eligibleStageDStrictDisallowedContextCandidates, 2);
  assert.equal(audit.metrics.recoveredStrictDisallowedContextCandidates, 1);
  assert.equal(audit.safety.stageDDisallowedContextCanQualifyWithoutExactOrModelIdentity, false);
  assert.equal(audit.safety.hardDisallowedEntityOrMediaTypeCanBeOverridden, false);
  assert.equal(audit.safety.rightsClassificationRelaxed, false);
  assert.equal(audit.safety.provenanceRelaxed, false);
});
