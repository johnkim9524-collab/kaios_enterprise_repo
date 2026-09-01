import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const engineWorkflowPath = '.github/workflows/kidults-current-sold-engine-v1.yml';
const postLandingWorkflowPath = '.github/workflows/kidults-current-sold-postlanding-v1.yml';

function fileText(path) {
  return fs.readFileSync(path, 'utf8');
}

function eventPaths(text, eventName) {
  const lines = text.split(/\r?\n/);
  const start = lines.indexOf(`  ${eventName}:`);
  assert.notEqual(start, -1, `${eventName} trigger must exist`);

  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^  [A-Za-z_][A-Za-z0-9_]*:$/.test(lines[index])) {
      end = index;
      break;
    }
  }

  const pathsIndex = lines.findIndex((line, index) => index > start && index < end && line === '    paths:');
  assert.notEqual(pathsIndex, -1, `${eventName} trigger must have a paths list`);

  const paths = [];
  for (let index = pathsIndex + 1; index < end; index += 1) {
    const match = lines[index].match(/^      - '([^']+)'$/);
    if (match) paths.push(match[1]);
  }
  assert.ok(paths.length > 0, `${eventName} paths list must not be empty`);
  return paths;
}

test('Current-SOLD keeps an exact-surface main-push fallback without treating it as token-safe authority', () => {
  const engine = fileText(engineWorkflowPath);
  assert.match(
    engine,
    /on:\n  push:\n    branches:\n      - main\n    paths:\n/,
    'Current-SOLD engine must retain a protected-main push fallback',
  );
  assert.doesNotMatch(engine, /branches-ignore:/, 'main-push fallback must not use branch exclusions');

  const pushPaths = eventPaths(engine, 'push');
  const pullRequestPaths = eventPaths(engine, 'pull_request');
  assert.deepEqual(pushPaths, pullRequestPaths, 'push and pull-request Current-SOLD change surfaces must stay identical');
  assert.ok(pushPaths.includes('.github/workflows/kidults-current-sold-engine-v1.yml'));
  assert.ok(pushPaths.includes('tests/kidults/market/current-sold-*.mjs'));
  assert.ok(pushPaths.includes('coordination/kidults/market/current-sold-private-dry-run-receipt-schema-v1.json'));
  assert.ok(pushPaths.includes('scripts/kidults/market/current-sold-atomic-batch-v1.mjs'));
  assert.ok(pushPaths.includes('scripts/kidults/market/current-sold-private-dry-run-v1.mjs'));
  assert.ok(pushPaths.includes('scripts/kidults/market/current-sold-control-smoke-v1.mjs'));
});

test('completed Atomic Governed Landing runs drive exact-main post-landing proof with fail-closed parent binding', () => {
  const text = fileText(postLandingWorkflowPath);

  assert.match(
    text,
    /workflow_run:\n    workflows:\n      - KIDULTS Atomic Governed Landing V1\n    types:\n      - completed\n    branches:\n      - main/,
  );
  assert.match(text, /github\.event\.workflow_run\.event == 'workflow_dispatch'/);
  assert.match(text, /github\.event\.workflow_run\.conclusion == 'success'/);
  assert.match(text, /github\.event\.workflow_run\.head_branch == 'main'/);
  assert.match(text, /fetch-depth: 2/);
  assert.match(text, /git rev-list --parents -n 1/);
  assert.match(text, /test "\$#" -eq 3/);
  assert.match(text, /test "\$premerge_main_sha" = "\$\{\{ github\.event\.workflow_run\.head_sha \}\}"/);
  assert.match(text, /git log -1 --format='%s'.*Merge pull request/s);
  assert.match(text, /git diff --name-only "\$premerge_main_sha" "\$source_sha"/);
  assert.match(text, /trigger_class='ATOMIC_GOVERNED_LANDING_WORKFLOW_RUN'/);
  assert.match(text, /post_landing_authoritative=true/);
  assert.match(text, /token_suppression_compensated=true/);

  assert.match(text, /permissions:\n  contents: read/);
  assert.doesNotMatch(text, /actions: write/);
  assert.doesNotMatch(text, /secrets\./);

  assert.match(text, /"expected_tests":53/);
  assert.match(text, /"post_landing_authoritative":\$\{CURRENT_SOLD_POST_LANDING_AUTHORITY:-false\}/);
  assert.match(text, /"github_token_push_suppression_compensated":\$\{CURRENT_SOLD_TOKEN_SUPPRESSION_COMPENSATED:-false\}/);
  assert.match(text, /"lawful_empirical_current_sold_count":0/);
  assert.match(text, /"private_candidate_current_sold_count":0/);
  assert.match(text, /"postgres_migration_applied":false/);
  assert.match(text, /"postgres_rows_written":0/);
  assert.match(text, /"provider_calls":0/);
  assert.match(text, /"deployment":false/);
  assert.match(text, /"public":"HOLD"/);
  assert.match(text, /"production":"HOLD"/);
  assert.match(text, /"g5":"HOLD"/);
});
