import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  buildNormalizationSnapshot,
  canonicalName,
  detectBrand,
  detectCategory,
  extractYear,
  normalizeObservation,
  resolveNormalizedDuplicates,
  runNormalizationCli
} from './normalization-engine.mjs';

function entry(overrides = {}) {
  const observation = {
    id: 'obs-1', fingerprint: 'fp-1', type: 'auction', source: 'example.com',
    url: 'https://example.com/item', title: '2024 Funko Pop Figure Release', summary: 'Limited collectible figure.',
    observed_at: '2026-08-06T00:00:00.000Z', locale: 'en', category_hint: null, provider_hint: null,
    evidence: { content_hash: 'hash-1' }, ...overrides.observation
  };
  return { observation, quality: { accepted: true, score: 90, issues: [], ...overrides.quality } };
}

test('canonicalizes known brand aliases', () => {
  assert.equal(canonicalName('funko pop'), 'Funko');
  assert.equal(canonicalName('the lego group'), 'LEGO');
});

test('detects brand and category from content', () => {
  assert.equal(detectBrand(entry().observation).value, 'Funko');
  assert.equal(detectCategory(entry().observation).value, 'Figures & Statues');
});

test('extracts a release year', () => {
  assert.equal(extractYear(entry().observation), 2024);
});

test('marks accepted high-confidence evidence as a publish candidate', () => {
  const record = normalizeObservation(entry());
  assert.equal(record.publish_candidate, true);
  assert.equal(record.review_required, false);
  assert.equal(record.lineage.collector_schema, 'kidults.collector.v1');
});

test('routes unresolved or rejected evidence to review', () => {
  const record = normalizeObservation(entry({
    observation: { title: 'Unknown Object', summary: '', source: 'unknown.example' },
    quality: { accepted: false, score: 40 }
  }));
  assert.equal(record.publish_candidate, false);
  assert.equal(record.review_required, true);
  assert.ok(record.review_reasons.includes('collector_rejected'));
});

test('resolves normalized duplicates by confidence', () => {
  const low = normalizeObservation(entry({ quality: { score: 70 } }));
  const high = normalizeObservation(entry({ quality: { score: 95 } }));
  const records = resolveNormalizedDuplicates([low, high]);
  assert.equal(records.length, 1);
  assert.equal(records[0].confidence, high.confidence);
});

test('builds a versioned normalization snapshot', () => {
  const snapshot = buildNormalizationSnapshot({
    schema_version: 'kidults.collector.v1', generated_at: '2026-08-06T00:00:00.000Z', observations: [entry()]
  }, new Date('2026-08-07T00:00:00.000Z'));
  assert.equal(snapshot.schema_version, 'kidults.normalized.v1');
  assert.equal(snapshot.counts.normalized, 1);
  assert.equal(snapshot.counts.publish_candidates, 1);
});

test('runs normalization CLI against a collector snapshot', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-normalization-'));
  const input = path.join(root, 'collector.json');
  const output = path.join(root, 'out');
  fs.writeFileSync(input, JSON.stringify({
    schema_version: 'kidults.collector.v1', generated_at: '2026-08-06T00:00:00.000Z', observations: [entry()]
  }));
  const result = runNormalizationCli(['run'], {
    KIDULTS_NORMALIZATION_INPUT_FILE: input,
    KIDULTS_NORMALIZATION_OUTPUT_DIR: output
  });
  assert.equal(result.ready, true);
  assert.equal(result.counts.normalized, 1);
  assert.equal(fs.existsSync(path.join(output, 'normalization-snapshot.json')), true);
});
