import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const consumer = fs.readFileSync('scripts/kidults/kpmo/consume-direct-owner-postmerge-push-suite-v1.mjs', 'utf8');

test('post-merge push-suite consumer binds merged_by to the direct_owner field emitted by Handoff', () => {
  assert.match(consumer, /receipt\?\.merged_by && receipt\.merged_by === receipt\.direct_owner/);
  assert.doesNotMatch(consumer, /receipt\.merged_by === receipt\.repository_owner/);
});
