import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  buildCollectorSnapshot,
  buildObservation,
  canonicalizeUrl,
  deduplicateObservations,
  evaluateObservation,
  writeCollectorSnapshot
} from './global-collector.mjs';

test('canonicalizes tracking parameters and fragments', () => {
  assert.equal(
    canonicalizeUrl('https://Example.com/item?id=10&utm_source=test#section'),
    'https://example.com/item?id=10'
  );
});

test('builds reproducible evidence fingerprints for equivalent observations', () => {
  const now = new Date('2026-08-07T00:00:00.000Z');
  const first = buildObservation({ type: 'auction', url: 'https://example.com/a?utm_campaign=x', title: 'Rare Figure' }, now);
  const second = buildObservation({ type: 'auction', url: 'https://example.com/a', title: 'Rare   Figure' }, now);
  assert.equal(first.fingerprint, second.fingerprint);
  assert.equal(first.evidence.robots_respected, true);
});

test('deduplicates equivalent observations and retains the newest evidence', () => {
  const older = buildObservation({ type: 'brand', url: 'https://example.com/a', title: 'Launch', observed_at: '2026-08-01T00:00:00Z' }, new Date('2026-08-02T00:00:00Z'));
  const newer = buildObservation({ type: 'brand', url: 'https://example.com/a', title: 'Launch', observed_at: '2026-08-03T00:00:00Z' }, new Date('2026-08-04T00:00:00Z'));
  const result = deduplicateObservations([older, newer]);
  assert.equal(result.length, 1);
  assert.equal(result[0].observed_at, '2026-08-03T00:00:00.000Z');
});

test('rejects observations that violate robots or terms governance', () => {
  const observation = buildObservation({
    type: 'web',
    url: 'https://example.com/a',
    title: 'Restricted page',
    robots_respected: false
  }, new Date('2026-08-07T00:00:00Z'));
  const result = evaluateObservation(observation);
  assert.equal(result.accepted, false);
  assert.ok(result.issues.includes('robots_not_respected'));
});

test('builds retained collector snapshots with governed counts', () => {
  const snapshot = buildCollectorSnapshot([
    { type: 'rss', url: 'https://example.com/1', title: 'One', summary: 'First signal', observed_at: '2026-08-06T00:00:00Z' },
    { type: 'rss', url: 'https://example.com/1?utm_source=x', title: 'One', summary: 'First signal', observed_at: '2026-08-06T01:00:00Z' },
    { type: 'marketplace', url: 'https://example.com/2', title: 'Two', summary: 'Second signal', observed_at: '2026-06-01T00:00:00Z' }
  ], { now: '2026-08-07T00:00:00Z', retention_days: 30 });

  assert.deepEqual(snapshot.counts, { received: 3, unique: 2, retained: 1, accepted: 1, rejected: 0 });
  assert.equal(snapshot.schema_version, 'kidults.collector.v1');
});

test('writes snapshots atomically', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kidults-collector-'));
  const snapshot = buildCollectorSnapshot([], { now: '2026-08-07T00:00:00Z' });
  const output = writeCollectorSnapshot(snapshot, directory);
  assert.equal(fs.existsSync(output), true);
  assert.equal(fs.existsSync(`${output}.tmp`), false);
  assert.equal(JSON.parse(fs.readFileSync(output, 'utf8')).schema_version, 'kidults.collector.v1');
});
