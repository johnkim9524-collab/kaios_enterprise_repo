import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const workflow = fs.readFileSync('.github/workflows/kidults-direct-owner-landing-handoff-v1.yml', 'utf8');
const runner = fs.readFileSync('scripts/kidults/kpmo/run-direct-owner-landing-handoff-v1.mjs', 'utf8');
const preflight = fs.readFileSync('scripts/kidults/kpmo/run-atomic-landing-handoff-preflight-v1.mjs', 'utf8');

test('missing tree input and malformed SHA fail before status authorization', () => {
  const treeGuard = runner.indexOf("!SHA.test(expectedHeadTreeSha)");
  const firstPublish = runner.indexOf("await publish('pending'");
  assert.ok(treeGuard >= 0 && treeGuard < firstPublish);
  assert.match(workflow, /expected_head_tree_sha:\n        description:[^\n]+\n        required: true/);
  assert.match(preflight, /ATOMIC_HANDOFF_PREFLIGHT_ENVIRONMENT_INVALID/);
});

test('tampered comment tree and commit-object mismatch fail closed', () => {
  assert.match(runner, /fields\.expected_head_tree_sha !== expectedHeadTreeSha/);
  assert.match(runner, /DIRECT_OWNER_HANDOFF_APPROVAL_SHA_MISMATCH/);
  assert.match(preflight, /commitPayload\?\.commit\?\.tree\?\.sha !== expectedHeadTreeSha/);
  assert.match(preflight, /ATOMIC_HANDOFF_HEAD_TREE_MISMATCH/);
});

test('tree readbacks surround the window and merge graph is exact', () => {
  const open = runner.indexOf("state: 'AUTHORIZED_HANDOFF_WINDOW_OPEN'");
  const sleep = runner.indexOf('await sleep(handoffWindowSeconds * 1000)');
  const before = runner.indexOf('DIRECT_OWNER_HANDOFF_FINAL_HEAD_TREE_DRIFT');
  const after = runner.indexOf('DIRECT_OWNER_HANDOFF_HEAD_TREE_DRIFT_AFTER_WINDOW');
  assert.ok(before >= 0 && before < open && open < sleep && sleep < after);
  assert.match(runner, /parentShas\[0\] !== expectedBaseSha \|\| parentShas\[1\] !== expectedHeadSha/);
  assert.match(runner, /mergeCommit\?\.commit\?\.tree\?\.sha !== expectedHeadTreeSha/);
  assert.match(runner, /ordered_parent_shas: parentShas/);
  assert.match(runner, /resulting_tree_sha: mergeCommit\.commit\.tree\.sha/);
});
